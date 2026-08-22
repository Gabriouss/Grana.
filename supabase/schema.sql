-- Grana. — schema do banco (Supabase / Postgres)
-- Rode isto uma vez no SQL Editor do seu projeto Supabase (Project -> SQL Editor -> New query).

-- Lançamentos (entradas e saídas)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  color text not null default '#8b9198',
  occurred_on date not null,
  recurring boolean not null default false,
  parent_id uuid references transactions(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_occurred_on_idx
  on transactions (user_id, occurred_on desc);

-- Contas a pagar (boletos, assinaturas, etc.)
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  color text not null default '#8b9198',
  due_date date not null,
  status text not null default 'due' check (status in ('due', 'paid')),
  created_at timestamptz not null default now()
);

-- Migração: contas já existentes não tinham a noção de recorrência — o app
-- gera a próxima fatura automaticamente (due_date +1 mês) quando uma conta
-- marcada como recorrente é paga.
alter table bills add column if not exists recurring boolean not null default false;

-- Migração: liga a conta à saída (transactions) lançada automaticamente
-- quando ela é marcada como paga, para que reabrir a conta depois consiga
-- desfazer exatamente essa saída em vez de deixá-la órfã no histórico.
-- `on delete set null`: se a saída for apagada direto em Lançamentos, a conta
-- não quebra — só perde o vínculo.
alter table bills add column if not exists paid_transaction_id uuid references transactions(id) on delete set null;

create index if not exists bills_user_id_due_date_idx
  on bills (user_id, due_date);

-- Categorias por usuário. As 8 categorias padrão (Alimentação, Moradia etc.)
-- continuam também fixas em lib/types.ts — é o vocabulário que o diagnóstico
-- financeiro (lib/diagnostico.ts) e as heurísticas de texto
-- (lib/heuristics.ts) usam por baixo, e esse vocabulário não muda mesmo que a
-- pessoa renomeie sua cópia aqui. Mas para que dê pra editar/excluir as
-- padrão de verdade (não só as criadas do zero), elas são semeadas como
-- linhas normais (is_default = true) na primeira vez que o usuário abre o
-- gerenciador de categorias — ver seedDefaultCategories() em lib/data.ts.
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  type text not null default 'both' check (type in ('in', 'out', 'both')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table categories add column if not exists is_default boolean not null default false;

create index if not exists categories_user_id_idx on categories (user_id);

-- Vínculo de WhatsApp: liga um número de telefone a uma conta por código de
-- pareamento de 6 dígitos, em vez de OTP por SMS (mais simples, sem custo por
-- envio). O app gera a linha não verificada com o código; a Edge Function
-- supabase/functions/whatsapp-webhook confirma quando o número manda esse
-- código pelo WhatsApp. A partir daí, o webhook usa `phone` pra achar o
-- user_id e lançar em nome da pessoa.
create table if not exists whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  pairing_code text not null,
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (phone)
);

alter table whatsapp_links enable row level security;

-- O app (com a sessão do usuário) só vê e mexe no próprio vínculo. A Edge
-- Function do webhook roda com a service_role key, que ignora RLS de
-- propósito — é a única forma dela achar o user_id a partir de um número que
-- ainda não tem sessão nenhuma associada na hora que a mensagem chega.
drop policy if exists "usuário vê e edita só seu vínculo de whatsapp" on whatsapp_links;
create policy "usuário vê e edita só seu vínculo de whatsapp"
  on whatsapp_links for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table whatsapp_links drop constraint if exists whatsapp_links_phone_len;
alter table whatsapp_links add constraint whatsapp_links_phone_len
  check (char_length(phone) <= 20);
alter table whatsapp_links drop constraint if exists whatsapp_links_pairing_code_len;
alter table whatsapp_links add constraint whatsapp_links_pairing_code_len
  check (char_length(pairing_code) = 6);

-- Rascunho de lançamento por WhatsApp aguardando resposta (ex: categoria
-- ambígua) — no máximo um por número, sempre substituído pelo mais recente.
-- Existe só para a Edge Function whatsapp-webhook lembrar "o que" estava
-- perguntando quando a próxima mensagem daquele número chegar; não tem
-- nenhum uso fora dali, por isso não tem política de RLS nenhuma (só
-- service_role, que ignora RLS, deve tocar aqui).
create table if not exists whatsapp_pending (
  phone text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric not null,
  type text not null check (type in ('in', 'out')),
  occurred_on date not null,
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

-- Carregam a intenção de "no crédito do cartão X" através da pergunta de
-- esclarecimento de categoria, para o lançamento sair certo quando a
-- resposta finalmente chegar (ver registrarLancamento no whatsapp-webhook).
alter table whatsapp_pending add column if not exists card_id uuid references credit_cards(id) on delete set null;
alter table whatsapp_pending add column if not exists payment_method text;

-- Parcelas de compra no crédito ("3x", "em 5 vezes"). Pelo mesmo motivo do
-- card_id acima: precisa atravessar a pergunta de categoria, senão "mercado
-- 300 em 3x" com categoria desconhecida perderia o parcelamento no caminho e
-- viraria um lançamento único de R$ 300.
alter table whatsapp_pending add column if not exists installments smallint;

-- Desambiguação de valor falado. O Whisper às vezes transcreve "onze e setenta
-- e nove" como "1179", e aí o parser lê R$ 1.179 corretamente — o erro veio da
-- transcrição, não da interpretação. Nesse caso o bot pergunta em vez de
-- adivinhar, e a linha pendente precisa saber QUAL pergunta está no ar
-- (`pending_kind`), qual é a outra leitura (`amount_alt`) e qual era o texto
-- original (`raw_text`), pra reprocessar o lançamento inteiro depois da
-- resposta em vez de remontá-lo pela metade.
-- "Todo mês" também precisa sobreviver à pergunta de categoria, pelo mesmo
-- motivo do card_id e do installments acima.
alter table whatsapp_pending add column if not exists recurring boolean not null default false;

alter table whatsapp_pending add column if not exists pending_kind text not null default 'categoria';
alter table whatsapp_pending add column if not exists amount_alt numeric;
alter table whatsapp_pending add column if not exists raw_text text;

alter table whatsapp_pending enable row level security;

-- Orçamento mensal sugerido/definido por categoria
create table if not exists budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  color text not null default '#8b9198',
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

-- Segurança: cada usuário só enxerga e mexe nos próprios dados.
alter table transactions enable row level security;
alter table bills enable row level security;
alter table budgets enable row level security;
alter table categories enable row level security;

-- Políticas RLS idempotentes (remove antes se já existir para permitir reexecução)
drop policy if exists "usuário vê e edita só seus lançamentos" on transactions;
create policy "usuário vê e edita só seus lançamentos"
  on transactions for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "usuário vê e edita só suas contas" on bills;
create policy "usuário vê e edita só suas contas"
  on bills for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "usuário vê e edita só seus orçamentos" on budgets;
create policy "usuário vê e edita só seus orçamentos"
  on budgets for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "usuário vê e edita só suas categorias" on categories;
create policy "usuário vê e edita só suas categorias"
  on categories for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Função para permitir ao usuário logado excluir a própria conta e dados permanentemente (LGPD)
-- SECURITY DEFINER faz esta função rodar com o papel do dono, que tem
-- permissão de apagar de auth.users. Por isso o search_path é fixado: sem
-- isso, quem conseguisse criar um objeto num schema que venha antes de public
-- sequestraria as referências não-qualificadas e executaria código com esse
-- privilégio. pg_temp vai por último de propósito — é o schema temporário da
-- sessão, o vetor clássico desse ataque.
create or replace function delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Não autenticado';
  end if;

  -- 1. Exclui dados do usuário nas tabelas públicas
  delete from public.transactions where user_id = current_user_id;
  delete from public.bills where user_id = current_user_id;
  delete from public.budgets where user_id = current_user_id;
  delete from public.categories where user_id = current_user_id;
  delete from public.whatsapp_links where user_id = current_user_id;
  delete from public.whatsapp_pending where user_id = current_user_id;

  -- 2. Exclui permanentemente o login da tabela de autenticação
  delete from auth.users where id = current_user_id;
end;
$$;

-- Só usuários autenticados podem chamar. O revoke vem antes porque o Postgres
-- concede execute a PUBLIC por padrão ao criar uma função — sem revogar, o
-- papel anon (qualquer um com a chave pública do app) também poderia chamar.
-- `anon` precisa ser nomeado explicitamente. O Supabase mantém um
-- `alter default privileges ... grant execute on functions to anon,
-- authenticated` no schema public, então toda função nova nasce com grant
-- DIRETO ao papel anon — e revogar de PUBLIC não remove grant direto.
-- Verificado na prática: só com o revoke de PUBLIC, uma chamada anônima ainda
-- chegava ao corpo da função (P0001) em vez de bater em 42501.
revoke all on function public.delete_user_account() from public, anon;
grant execute on function public.delete_user_account() to authenticated;

-- Limites de tamanho nos campos de texto livre. Sem isso um cliente (ou um
-- script se passando por ele) grava megabytes por linha: incha o banco e trava
-- a renderização da lista no aparelho. Os valores são folgados para uso real.
alter table transactions drop constraint if exists transactions_description_len;
alter table transactions add constraint transactions_description_len
  check (char_length(description) <= 200);
alter table transactions drop constraint if exists transactions_category_len;
alter table transactions add constraint transactions_category_len
  check (char_length(category) <= 60);
alter table transactions drop constraint if exists transactions_color_len;
alter table transactions add constraint transactions_color_len
  check (char_length(color) <= 9);

alter table bills drop constraint if exists bills_description_len;
alter table bills add constraint bills_description_len
  check (char_length(description) <= 200);
alter table bills drop constraint if exists bills_category_len;
alter table bills add constraint bills_category_len
  check (char_length(category) <= 60);
alter table bills drop constraint if exists bills_color_len;
alter table bills add constraint bills_color_len
  check (char_length(color) <= 9);

alter table budgets drop constraint if exists budgets_category_len;
alter table budgets add constraint budgets_category_len
  check (char_length(category) <= 60);
alter table budgets drop constraint if exists budgets_color_len;
alter table budgets add constraint budgets_color_len
  check (char_length(color) <= 9);

alter table categories drop constraint if exists categories_name_len;
alter table categories add constraint categories_name_len
  check (char_length(name) <= 60);
alter table categories drop constraint if exists categories_color_len;
alter table categories add constraint categories_color_len
  check (char_length(color) <= 9);

-- Teto de valor: numeric(12,2) já limita a 10 dígitos inteiros, mas um check
-- explícito deixa o erro legível em vez de estourar overflow no driver.
alter table transactions drop constraint if exists transactions_amount_max;
alter table transactions add constraint transactions_amount_max
  check (amount <= 999999999.99);
alter table bills drop constraint if exists bills_amount_max;
alter table bills add constraint bills_amount_max
  check (amount <= 999999999.99);
alter table budgets drop constraint if exists budgets_amount_max;
alter table budgets add constraint budgets_amount_max
  check (amount <= 999999999.99);

-- Aviso de atualização do APK. Distribuição fora da Play Store não avisa
-- ninguém sozinha quando sai versão nova — esta é uma linha só, comparada
-- pelo app com a versão do app.json embutida na build instalada.
--
-- Esta linha é escrita automaticamente pela Edge Function
-- supabase/functions/eas-build-webhook, chamada pela própria Expo (EAS Build
-- Webhooks) sempre que um build "preview"/"production" do Android termina —
-- ver o cabeçalho daquele arquivo para o passo a passo de configuração. Não
-- deveria ser necessário editar esta tabela à mão depois disso.
--
-- Sem política de insert/update/delete de propósito: só a Edge Function
-- (com a service_role key, que ignora RLS) escreve aqui. Nenhum client comum
-- (nem autenticado) deve poder mudar a própria versão "mais nova" reportada.
create table if not exists app_release (
  id smallint primary key default 1,
  version text not null,
  apk_url text not null,
  notes text,
  -- Links de artefato do EAS Build expiram (retenção padrão de ~30 dias) —
  -- guardamos a data pra o app parar de anunciar um link que já morreu, em
  -- vez de mandar quem clicar em "Atualizar" pra um 404.
  apk_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint app_release_singleton check (id = 1)
);

alter table app_release add column if not exists apk_expires_at timestamptz;

alter table app_release enable row level security;

drop policy if exists "logados leem a versao mais recente" on app_release;
create policy "logados leem a versao mais recente"
  on app_release for select
  to authenticated
  using (true);

-- Linha inicial — só usada até o primeiro build passar pelo webhook e
-- sobrescrever isto sozinho. Dá pra editar à mão como fallback, se preciso:
--   update app_release set version = '1.1.0', apk_url = '...', apk_expires_at = null, updated_at = now() where id = 1;
insert into app_release (id, version, apk_url, notes)
values (1, '1.0.0', 'https://expo.dev/artifacts/eas/qqwPOK6TNS7k2dPCvH6ZSKoSGPrwV4rTDSvtU-xq55I.apk', null)
on conflict (id) do nothing;

-- ============================================================
-- ÉPICO 1 do PLANO_DE_EVOLUCAO.md — Metas/Cofrinhos & Level Up Infinito
-- ============================================================

-- Cofrinhos / metas financeiras: reserva de emergência e objetivos com
-- aportes e resgates manuais feitos pelo usuário na Home.
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  current_amount numeric(12,2) not null default 0 check (current_amount >= 0),
  color text not null default '#1fa98d',
  icon text not null default 'flag',
  deadline date,
  created_at timestamptz not null default now()
);

alter table goals enable row level security;

drop policy if exists "usuário vê e edita só suas metas" on goals;
create policy "usuário vê e edita só suas metas"
  on goals for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists goals_user_id_idx on goals (user_id);

alter table goals drop constraint if exists goals_title_len;
alter table goals add constraint goals_title_len
  check (char_length(title) <= 100);
alter table goals drop constraint if exists goals_icon_len;
alter table goals add constraint goals_icon_len
  check (char_length(icon) <= 40);
alter table goals drop constraint if exists goals_color_len;
alter table goals add constraint goals_color_len
  check (char_length(color) <= 9);

-- Aporta/resgata de um cofrinho de forma atômica. Existe como função pelo
-- mesmo motivo de add_xp() acima: um "lê current_amount -> soma delta ->
-- grava" feito no cliente perde um dos dois aportes se disparados quase
-- juntos (duplo toque, dois aparelhos). Mesmo padrão de segurança das
-- funções acima: search_path fixado e revoke explícito de anon.
create or replace function public.deposit_to_goal(p_goal_id uuid, p_delta numeric)
returns goals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resultado goals;
  usuario uuid;
begin
  usuario := auth.uid();
  if usuario is null then
    raise exception 'Não autenticado';
  end if;

  update public.goals
  set current_amount = greatest(0, current_amount + p_delta)
  where id = p_goal_id and user_id = usuario
  returning * into resultado;

  if resultado is null then
    raise exception 'Meta não encontrada ou não pertence ao usuário';
  end if;

  return resultado;
end;
$$;

revoke all on function public.deposit_to_goal(uuid, numeric) from public, anon;
grant execute on function public.deposit_to_goal(uuid, numeric) to authenticated;
alter table goals drop constraint if exists goals_target_amount_max;
alter table goals add constraint goals_target_amount_max
  check (target_amount <= 999999999.99);
alter table goals drop constraint if exists goals_current_amount_max;
alter table goals add constraint goals_current_amount_max
  check (current_amount <= 999999999.99);

-- Suporte a parcelamentos em transações — usado pelo Épico 2 (projeção de
-- faturas futuras) para saber quantas parcelas de uma compra ainda faltam
-- vencer. addInstallmentPurchase (lib/data.ts) já linkava as parcelas via
-- parent_id; estas colunas guardam a posição "atual/total" de cada uma.
alter table transactions add column if not exists installment_current smallint not null default 1;
alter table transactions add column if not exists installment_total smallint not null default 1;

-- Perfil de gamificação: XP vitalício (nunca é resetado, ao contrário do
-- Score Grana de 0-1000 em lib/gamification.ts) e escudos de proteção de
-- ofensiva (reservado para uso futuro).
create table if not exists user_gamification (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lifetime_xp integer not null default 0 check (lifetime_xp >= 0),
  streak_shields smallint not null default 2,
  updated_at timestamptz not null default now()
);

alter table user_gamification enable row level security;

drop policy if exists "usuário vê e edita só seu xp" on user_gamification;
create policy "usuário vê e edita só seu xp"
  on user_gamification for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Concede XP de forma atômica. Existe como função em vez de um simples
-- update client-side porque duas ações quase simultâneas (ex: dois aportes
-- em cofrinhos diferentes em sequência rápida) fariam um "lê saldo -> soma
-- -> grava" no cliente perder incremento por condição de corrida; o upsert
-- com `lifetime_xp = lifetime_xp + delta` resolve isso dentro do próprio
-- banco. Mesmo padrão de segurança de delete_user_account(): search_path
-- fixado e revoke explícito de anon (ver comentário acima daquela função).
create or replace function public.add_xp(delta integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  novo_xp integer;
  usuario uuid;
begin
  usuario := auth.uid();
  if usuario is null then
    raise exception 'Não autenticado';
  end if;

  -- Teto por chamada. A RPC é exposta a `authenticated`, então nada impede
  -- alguém de chamá-la direto pela API com delta = 2000000000 e estourar o
  -- nível de uma vez. Não vaza dado de ninguém — só esvazia o sentido da
  -- progressão — mas o limite custa uma linha. 10.000 é ordens de grandeza
  -- acima de qualquer ação real do app.
  if delta > 10000 or delta < -10000 then
    raise exception 'Variação de XP fora do intervalo permitido';
  end if;

  insert into public.user_gamification (user_id, lifetime_xp)
  values (usuario, greatest(delta, 0))
  on conflict (user_id) do update
    set lifetime_xp = greatest(0, public.user_gamification.lifetime_xp + delta),
        updated_at = now()
  returning lifetime_xp into novo_xp;

  return novo_xp;
end;
$$;

revoke all on function public.add_xp(integer) from public, anon;
grant execute on function public.add_xp(integer) to authenticated;

-- ============================================================
-- Reestruturação de navegação (5 abas) — aba Crédito
-- ============================================================
-- lib/data.ts (fetchCreditCards/addCreditCard/deleteCreditCard) e
-- app/(app)/credito.tsx já esperavam esta tabela antes dela existir no
-- banco — sem isto a aba Crédito falha em qualquer conta real.
create table if not exists credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bank text not null,
  color text not null default '#8b9198',
  last_digits text,
  limit_amount numeric(12,2) not null check (limit_amount > 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  created_at timestamptz not null default now()
);

alter table credit_cards enable row level security;

drop policy if exists "usuário vê e edita só seus cartões" on credit_cards;
create policy "usuário vê e edita só seus cartões"
  on credit_cards for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists credit_cards_user_id_idx on credit_cards (user_id);

alter table credit_cards drop constraint if exists credit_cards_name_len;
alter table credit_cards add constraint credit_cards_name_len
  check (char_length(name) <= 100);
alter table credit_cards drop constraint if exists credit_cards_bank_len;
alter table credit_cards add constraint credit_cards_bank_len
  check (char_length(bank) <= 40);
alter table credit_cards drop constraint if exists credit_cards_color_len;
alter table credit_cards add constraint credit_cards_color_len
  check (char_length(color) <= 9);
alter table credit_cards drop constraint if exists credit_cards_last_digits_len;
alter table credit_cards add constraint credit_cards_last_digits_len
  check (last_digits is null or char_length(last_digits) <= 4);
alter table credit_cards drop constraint if exists credit_cards_limit_max;
alter table credit_cards add constraint credit_cards_limit_max
  check (limit_amount <= 999999999.99);

-- Classificação de forma de pagamento e vínculo com o cartão — usados pela
-- aba Crédito para separar compras no cartão do restante das movimentações.
alter table transactions add column if not exists payment_method text;
alter table transactions drop constraint if exists transactions_payment_method_check;
alter table transactions add constraint transactions_payment_method_check
  check (payment_method is null or payment_method in ('debit', 'credit', 'pix', 'cash'));

alter table transactions add column if not exists bank text;
alter table transactions drop constraint if exists transactions_bank_len;
alter table transactions add constraint transactions_bank_len
  check (bank is null or char_length(bank) <= 40);

alter table transactions add column if not exists card_id uuid references credit_cards(id) on delete set null;

-- Reexecuta delete_user_account() para também apagar goals,
-- user_gamification e credit_cards — sem isto, excluir a conta deixaria
-- essas tabelas novas órfãs, contrariando a mesma exclusão total já
-- garantida para o resto dos dados (LGPD / Apple / Google Play).
create or replace function delete_user_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Não autenticado';
  end if;

  delete from public.transactions where user_id = current_user_id;
  delete from public.bills where user_id = current_user_id;
  delete from public.budgets where user_id = current_user_id;
  delete from public.categories where user_id = current_user_id;
  delete from public.whatsapp_links where user_id = current_user_id;
  delete from public.whatsapp_pending where user_id = current_user_id;
  delete from public.goals where user_id = current_user_id;
  delete from public.user_gamification where user_id = current_user_id;
  delete from public.credit_cards where user_id = current_user_id;
  delete from public.wallets where user_id = current_user_id;

  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_user_account() from public, anon;
grant execute on function public.delete_user_account() to authenticated;

-- ============================================================
-- Múltiplas Carteiras (Multi-Wallets)
-- ============================================================

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  initial_balance numeric(12,2) not null default 0,
  color text not null default '#1fa98d',
  icon text not null default 'wallet-outline',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table wallets enable row level security;

drop policy if exists "usuário vê e edita só suas carteiras" on wallets;
create policy "usuário vê e edita só suas carteiras"
  on wallets for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists wallets_user_id_idx on wallets (user_id);

alter table wallets drop constraint if exists wallets_name_len;
alter table wallets add constraint wallets_name_len
  check (char_length(name) <= 60);
alter table wallets drop constraint if exists wallets_icon_len;
alter table wallets add constraint wallets_icon_len
  check (char_length(icon) <= 40);
alter table wallets drop constraint if exists wallets_color_len;
alter table wallets add constraint wallets_color_len
  check (char_length(color) <= 9);

-- Vincular entidades à carteira
alter table transactions add column if not exists wallet_id uuid references wallets(id) on delete set null;
alter table credit_cards add column if not exists wallet_id uuid references wallets(id) on delete set null;
alter table bills add column if not exists wallet_id uuid references wallets(id) on delete set null;
alter table goals add column if not exists wallet_id uuid references wallets(id) on delete set null;

-- A FK acima só garante que wallet_id aponta pra uma carteira que existe,
-- não que ela pertence ao mesmo dono da linha (transação, conta, cartão ou
-- meta). RLS já impede um usuário LER dados de outro, então isto não é uma
-- brecha de vazamento — mas sem essa checagem seria possível gravar, por
-- engano ou de propósito, uma referência a uma carteira alheia. O trigger
-- abaixo barra isso na escrita, reaproveitado nas 4 tabelas.
--
-- SECURITY INVOKER de propósito (não DEFINER): o SELECT abaixo só precisa
-- enxergar a própria carteira de quem está gravando, e a RLS de `wallets`
-- já garante exatamente isso pro dono da linha — rodar como definer bypassa
-- essa RLS sem necessidade, contrariando o princípio de menor privilégio.
create or replace function public.validar_wallet_do_usuario()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.wallet_id is not null then
    if not exists (
      select 1 from public.wallets
      where id = new.wallet_id and user_id = new.user_id
    ) then
      raise exception 'wallet_id não pertence ao usuário da linha';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validar_wallet_transactions on transactions;
create trigger validar_wallet_transactions
  before insert or update of wallet_id, user_id on transactions
  for each row execute procedure public.validar_wallet_do_usuario();

drop trigger if exists validar_wallet_credit_cards on credit_cards;
create trigger validar_wallet_credit_cards
  before insert or update of wallet_id, user_id on credit_cards
  for each row execute procedure public.validar_wallet_do_usuario();

drop trigger if exists validar_wallet_bills on bills;
create trigger validar_wallet_bills
  before insert or update of wallet_id, user_id on bills
  for each row execute procedure public.validar_wallet_do_usuario();

drop trigger if exists validar_wallet_goals on goals;
create trigger validar_wallet_goals
  before insert or update of wallet_id, user_id on goals
  for each row execute procedure public.validar_wallet_do_usuario();

-- Trigger para criar carteira "Principal" automaticamente ao criar usuário.
--
-- `set search_path` é obrigatório aqui, como em toda função SECURITY DEFINER
-- deste arquivo: sem ele o search_path é o de quem dispara a função, e quem
-- conseguir criar um objeto num schema que venha antes na busca faz esta
-- função — que roda com os privilégios do dono — chamar o objeto dele em vez
-- do nosso. Era a única definer function do schema sem essa trava; as outras
-- quatro já tinham.
create or replace function public.handle_new_user_wallet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.wallets (user_id, name, is_default, color, icon)
  values (new.id, 'Principal', true, '#1fa98d', 'wallet-outline');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_wallet on auth.users;
create trigger on_auth_user_created_wallet
  after insert on auth.users
  for each row execute procedure public.handle_new_user_wallet();



-- ============================================================
-- Storage: bucket `avatars` (fotos de perfil)
-- ============================================================
--
-- Estas políticas não existiam neste arquivo — a configuração do bucket vivia
-- só no painel do Supabase, fora do controle de versão. Uma auditoria mostrou
-- a consequência: com a chave anon (que é pública, embutida no APK), dava para
-- LISTAR o bucket e obter a lista de user_ids de todo mundo que já subiu foto,
-- sem estar logado. Os dados financeiros continuavam protegidos pelo RLS das
-- tabelas, mas a enumeração da base de usuários e o download das fotos eram
-- possíveis para qualquer um.
--
-- O caminho dos arquivos é `{user_id}/avatar.jpg` (ver lib/profile.ts), então
-- a primeira pasta do caminho é a dona do arquivo — é isso que
-- `storage.foldername(name)[1]` devolve.

-- Leitura: só o próprio dono lista/consulta pelo endpoint autenticado.
-- Atenção: enquanto o bucket estiver marcado como público no painel, a rota
-- /object/public/... continua servindo o arquivo sem checar política nenhuma.
-- Isto aqui fecha a ENUMERAÇÃO (o /object/list/), que é o problema maior.
-- Para fechar também o acesso direto por URL, o bucket precisa virar privado
-- e lib/profile.ts passar a usar createSignedUrl() em vez de getPublicUrl().
drop policy if exists "avatars: dono lê o próprio arquivo" on storage.objects;
create policy "avatars: dono lê o próprio arquivo"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Escrita: cada usuário só grava dentro da própria pasta. Sem isto, um
-- usuário logado poderia sobrescrever a foto de outro escrevendo em
-- `{user_id_alheio}/avatar.jpg`.
drop policy if exists "avatars: dono grava na própria pasta" on storage.objects;
create policy "avatars: dono grava na própria pasta"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: dono atualiza a própria foto" on storage.objects;
create policy "avatars: dono atualiza a própria foto"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: dono apaga a própria foto" on storage.objects;
create policy "avatars: dono apaga a própria foto"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============================================================
-- Índices de FK que faltavam (auditoria de performance)
-- ============================================================
-- Postgres não indexa coluna de FK automaticamente. Estas foram adicionadas
-- em migrações sucessivas ao longo do projeto e ficaram sem índice — sem
-- consequência hoje (poucas linhas por usuário), mas cada uma vira um
-- sequential scan em JOIN/CASCADE conforme a tabela cresce.
create index if not exists transactions_parent_id_idx on transactions (parent_id) where parent_id is not null;
create index if not exists transactions_card_id_idx on transactions (card_id) where card_id is not null;
create index if not exists transactions_wallet_id_idx on transactions (wallet_id) where wallet_id is not null;
create index if not exists bills_paid_transaction_id_idx on bills (paid_transaction_id) where paid_transaction_id is not null;
create index if not exists bills_wallet_id_idx on bills (wallet_id) where wallet_id is not null;
create index if not exists goals_wallet_id_idx on goals (wallet_id) where wallet_id is not null;
create index if not exists credit_cards_wallet_id_idx on credit_cards (wallet_id) where wallet_id is not null;
create index if not exists whatsapp_links_user_id_idx on whatsapp_links (user_id);
create index if not exists whatsapp_pending_user_id_idx on whatsapp_pending (user_id);

-- ============================================================
-- Feedback in-app
-- ============================================================
-- user_id em "set null" (não "cascade"): se a pessoa excluir a conta, o
-- feedback já enviado continua útil para quem lê (é um retrato de um
-- problema/sugestão real), só perde o vínculo com quem mandou.
create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('suggestion', 'bug', 'praise', 'other')),
  rating int check (rating between 1 and 5),
  message text not null check (char_length(message) between 1 and 2000),
  app_version text,
  platform text,
  device_info text,
  screenshot_url text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists feedbacks_user_id_idx on feedbacks (user_id) where user_id is not null;

alter table feedbacks enable row level security;

drop policy if exists "feedbacks: dono envia o próprio feedback" on feedbacks;
create policy "feedbacks: dono envia o próprio feedback"
  on feedbacks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- Pagamento de fatura de cartão de crédito
-- ============================================================
-- A fatura em aberto continua sendo calculada ao vivo (soma das transações
-- do mês com payment_method = 'credit') — esta tabela só guarda o estado de
-- "paga", que não dá para derivar das transações. Sem policy de update: como
-- em bills/paid_transaction_id, desfazer o pagamento apaga a linha (e a
-- saída ligada a ela) em vez de editar.
create table if not exists credit_card_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references credit_cards(id) on delete cascade,
  year int not null,
  month int not null check (month between 0 and 11), -- mesma convenção 0-based de isSameMonth()
  amount numeric not null check (amount >= 0),
  paid_on date not null,
  wallet_id uuid references wallets(id) on delete set null,
  paid_transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (card_id, year, month)
);

create index if not exists credit_card_invoices_user_id_idx on credit_card_invoices (user_id);
create index if not exists credit_card_invoices_card_id_idx on credit_card_invoices (card_id);

alter table credit_card_invoices enable row level security;

drop policy if exists "faturas: dono ve as proprias" on credit_card_invoices;
create policy "faturas: dono ve as proprias"
  on credit_card_invoices for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "faturas: dono paga a propria fatura" on credit_card_invoices;
create policy "faturas: dono paga a propria fatura"
  on credit_card_invoices for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "faturas: dono desfaz o proprio pagamento" on credit_card_invoices;
create policy "faturas: dono desfaz o proprio pagamento"
  on credit_card_invoices for delete
  to authenticated
  using ((select auth.uid()) = user_id);
