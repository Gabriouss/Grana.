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

-- Resumo cumulativo usado por Desafios. SECURITY INVOKER mantém a RLS ativa;
-- o filtro explícito por auth.uid() evita qualquer agregado entre locatários.
create or replace function public.get_gamification_summary()
returns table (
  transaction_count bigint,
  income_count bigint,
  expense_count bigint,
  income_total numeric,
  expense_category_count bigint,
  paid_bill_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.transactions t where t.user_id = (select auth.uid())),
    (select count(*) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'in'),
    (select count(*) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'out'),
    (select coalesce(sum(t.amount), 0) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'in'),
    (select count(distinct t.category) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'out'),
    (select count(*) from public.bills b where b.user_id = (select auth.uid()) and b.status = 'paid');
$$;

revoke all on function public.get_gamification_summary() from public, anon;
grant execute on function public.get_gamification_summary() to authenticated, service_role;

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
  -- Nulo até a mensagem de pareamento chegar: o app não pede o número, quem
  -- grava é o webhook, com o telefone de quem realmente enviou. O `unique`
  -- abaixo aceita quantos nulos existirem, então vários pedidos em aberto
  -- convivem, e continua impedindo duas contas no mesmo número de verdade.
  phone text,
  pairing_code text not null,
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (phone)
);

-- Bancos criados antes desta mudança tinham `phone not null`, e o pedido de
-- pareamento sem número batia nele (e num `check (char_length(phone) <= 20)`
-- que qualquer marcador de texto violaria).
alter table whatsapp_links alter column phone drop not null;

-- Último lançamento feito por este número, para o "cancela" do bot saber o que
-- desfazer. Guardado aqui, e não descoberto por consulta, porque "o último que
-- SAIU DO WHATSAPP" não é o mesmo que "o último criado": quem lança pelo app
-- no meio do caminho não pode ver o bot apagar aquilo. Para compra parcelada
-- o id é o da linha-cabeça — as parcelas apontam pra ela via parent_id e somem
-- junto.
alter table whatsapp_links add column if not exists last_entry_kind text;
alter table whatsapp_links add column if not exists last_entry_id uuid;
alter table whatsapp_links add column if not exists last_entry_at timestamptz;

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
-- A restrição do código de pareamento é definida mais abaixo, junto da
-- migração que troca os códigos em claro por hash (busque
-- whatsapp_links_pairing_code_len). Ela vivia aqui exigindo 6 caracteres, e
-- reaplicar o arquivo depois da migração recolocava a regra antiga sobre
-- linhas que já estavam em 64: o banco recusava o arquivo inteiro.

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

-- Maior degrau (0/50/70/90/100) de uso do limite já notificado neste
-- cartão — evita notificar de novo o mesmo degrau a cada novo lançamento no
-- crédito. Só sobe (nunca reseta sozinho num estorno/pagamento de fatura;
-- reset automático fica pra uma rodada futura, ver lib/creditLimitAlert.ts).
alter table credit_cards add column if not exists last_notified_threshold smallint not null default 0;

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
-- `credit_cards` precisa existir antes desta FK. Manter este ALTER aqui (e
-- não junto da criação inicial de whatsapp_pending) faz o bootstrap funcionar
-- em um banco vazio.
alter table whatsapp_pending add column if not exists card_id uuid references credit_cards(id) on delete set null;

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

-- ============================================================
-- Assinatura paga (Kiwify) — controla o acesso ao Grana.
-- ============================================================
-- Só o webhook escreve aqui, com a service_role key (que ignora RLS) — não
-- existe policy de insert/update/delete pro dono. Se existisse, bastaria
-- abrir o DevTools na versão web e dar UPDATE em access_until pra se
-- autoliberar de graça; a compra tem que continuar sendo a única porta.
--
-- `access_until` é o único campo que decide acesso — não `status`. `status`
-- é o retrato do último evento recebido, pra depuração e pro app explicar o
-- que aconteceu ("seu pagamento atrasou"). Compra aprovada empurra
-- `access_until` pra frente; reembolso e chargeback zeram na hora, não
-- importa quanto faltava. Cancelamento (fim de assinatura futura) NÃO mexe
-- em `access_until` — quem pagou até tal dia continua com acesso até tal
-- dia, só não renova depois.
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Nulo até alguém logar com o e-mail da compra, ou usar o link de
  -- ativação — a compra chega pelo webhook antes de qualquer conta existir
  -- no Grana. Ver vincular_assinatura_automatica() e
  -- vincular_assinatura_por_token() logo abaixo.
  user_id uuid references auth.users(id) on delete cascade,
  -- 'kiwify' é venda de verdade. 'interno' é acesso concedido à mão (conta de
  -- teste automatizado, cortesia), separado justamente para não se misturar a
  -- venda em nenhuma contagem de receita futura.
  provider text not null default 'kiwify' check (provider in ('kiwify', 'interno')),
  -- Id do pedido/assinatura na Kiwify. `unique` com `provider` faz o upsert
  -- do webhook ser idempotente — reenvio do mesmo evento (retry deles) não
  -- duplica a linha.
  provider_order_id text not null,
  email_compra text not null,
  plan text,
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled', 'refunded', 'chargeback', 'expired')),
  access_until timestamptz not null,
  -- Só usado quando status = 'past_due': até quando o app ainda libera
  -- mesmo com a cobrança atrasada, pra não cortar quem só trocou de cartão.
  grace_until timestamptz,
  -- Token de uso único pra vincular quando o e-mail da compra é diferente do
  -- e-mail da conta no Grana. (presente, apelido de Gmail, erro de digitação).
  activation_token text not null default encode(gen_random_bytes(16), 'hex'),
  activated_at timestamptz,
  -- Payload cru do último evento recebido — auditoria e depuração. Nunca
  -- lido por regra de negócio nenhuma, só por humano investigando.
  raw_last_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id),
  unique (activation_token)
);

create index if not exists subscriptions_user_id_idx on subscriptions (user_id);
create index if not exists subscriptions_email_idx on subscriptions (lower(email_compra));

alter table subscriptions enable row level security;

drop policy if exists "assinatura: dono ve a propria" on subscriptions;
create policy "assinatura: dono ve a propria"
  on subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Log bruto de toda chamada recebida no webhook, autenticada ou não,
-- reconhecida ou não. Existe separado de `subscriptions.raw_last_event`
-- porque um evento não reconhecido não tem em qual linha gravar — e é
-- justamente o que permite fechar o mapeamento de campo da Kiwify a partir
-- do primeiro evento real (ver comentário no topo do webhook).
create table if not exists webhook_raw_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  headers jsonb,
  body jsonb,
  resolvido boolean not null default false,
  created_at timestamptz not null default now()
);

alter table webhook_raw_log enable row level security;
-- Sem nenhuma policy: só a service_role (que ignora RLS) lê e escreve aqui.
-- Não é dado de usuário final, é log operacional — ninguém autenticado
-- deveria enxergar esta tabela.

/** Libera acesso: cobre o período pago, OU a carência de uma cobrança
    atrasada ainda não resolvida. Sempre sobre o PRÓPRIO usuário — nunca
    recebe um id de fora, pra não virar uma forma de consultar a assinatura
    de outra pessoa pelo RPC. */
create or replace function public.tem_assinatura_ativa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from subscriptions
    where user_id = (select auth.uid())
      and (access_until >= now() or (status = 'past_due' and grace_until >= now()))
  );
$$;

revoke execute on function public.tem_assinatura_ativa() from public;
grant execute on function public.tem_assinatura_ativa() to authenticated;

/**
 * Roda depois de login: vincula automaticamente qualquer assinatura comprada
 * com o MESMO e-mail da conta. Cobre o caminho feliz — a maioria — sem a
 * pessoa precisar fazer nada. `security definer` porque `auth.users` não é
 * legível por `authenticated`.
 */
create or replace function public.vincular_assinatura_automatica()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return;
  end if;

  update subscriptions
    set user_id = auth.uid(), activated_at = coalesce(activated_at, now())
    where user_id is null
      and lower(email_compra) = lower(v_email);
end;
$$;

revoke execute on function public.vincular_assinatura_automatica() from public;
grant execute on function public.vincular_assinatura_automatica() to authenticated;

/**
 * Vincula pelo token do link de ativação — cobre compra com e-mail diferente
 * do cadastro (presente, apelido de Gmail, erro de digitação no checkout).
 * Idempotente: chamar de novo com o token já vinculado À MESMA conta não dá
 * erro; só falha (devolve false) se o token não existe ou já pertence a
 * outra conta.
 */
create or replace function public.vincular_assinatura_por_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas int;
begin
  update subscriptions
    set user_id = auth.uid(), activated_at = coalesce(activated_at, now())
    where activation_token = p_token
      and (user_id is null or user_id = auth.uid());
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end;
$$;

revoke execute on function public.vincular_assinatura_por_token(text) from public;
grant execute on function public.vincular_assinatura_por_token(text) to authenticated;

-- ============================================================
-- Reexecuta delete_user_account() — cobre as tabelas criadas depois da
-- última vez que esta função foi atualizada (credit_card_invoices,
-- subscriptions, feedbacks). `credit_card_invoices` e `subscriptions` têm
-- `on delete cascade` na FK de user_id, então `delete from auth.users`
-- sozinho já apagaria as duas de qualquer jeito — as linhas explícitas
-- abaixo são redundantes com o cascade, mas deixam a intenção legível sem
-- precisar ir conferir a definição de cada FK. `feedbacks` é a exceção
-- real: a FK ali é `on delete set null` de propósito (mantém o feedback
-- em si, útil pro produto, só perde o vínculo com a conta que não existe
-- mais) — por isso um UPDATE, não um DELETE.
-- GRN-BE-007: a foto de perfil sobrevivia à exclusão de conta.
--
-- `delete_user_account()` limpava as tabelas, mas nunca tocava
-- `storage.objects`. O objeto em `avatars/{user_id}/avatar.jpg` ficava
-- órfão — e enquanto o bucket estava público (ver bloco logo abaixo), a URL
-- continuava servindo o arquivo para qualquer um que já a tivesse, mesmo com
-- a conta apagada, contrariando `lib/legal-content.ts` ("seus dados são
-- apagados permanentemente").
--
-- `search_path = ''` com tudo qualificado, no padrão que o resto deste
-- arquivo já usa: a versão anterior usava `search_path = public, auth,
-- pg_temp`, que funciona mas é a forma mais fraca — um schema que viesse
-- antes de `public`/`auth` na busca poderia interceptar uma chamada não
-- qualificada. `storage` entra na lista de schemas tocados.
create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = ''
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
  delete from public.credit_card_invoices where user_id = current_user_id;
  delete from public.subscriptions where user_id = current_user_id;
  delete from public.user_achievements where user_id = current_user_id;
  update public.feedbacks set user_id = null where user_id = current_user_id;

  -- Foto de perfil: o caminho é sempre `{user_id}/avatar.jpg` (lib/profile.ts),
  -- então não precisa de SELECT prévio para descobrir o nome do arquivo.
  --
  -- `storage.objects` tem um trigger de proteção
  -- (`storage.protect_objects_delete`) que recusa QUALQUER DELETE direto por
  -- SQL, pedindo a API de Storage no lugar — inclusive vindo de uma função
  -- SECURITY DEFINER como esta. Sem o `set_config` abaixo, esta função inteira
  -- estourava exceção aqui e a transação inteira dava rollback: a conta NÃO
  -- era apagada, nem as tabelas de antes, que é pior que o defeito original
  -- (photo órfã, mas o resto da exclusão funcionava). Verificado ao vivo:
  -- o DELETE cru falha com "Direct deletion from storage tables is not
  -- allowed"; com o `set_config('storage.allow_delete_query', 'true', true)`
  -- antes, na MESMA transação, o mesmo DELETE funciona. O terceiro argumento
  -- `true` faz o ajuste valer só para esta transação, não para a sessão
  -- inteira — não é um interruptor global ligado por engano.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects
  where bucket_id = 'avatars'
    and (storage.foldername(name))[1] = current_user_id::text;

  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_user_account() from public, anon;
grant execute on function public.delete_user_account() to authenticated;

-- GRN-BE-007 (segunda metade): o bucket `avatars` estava marcado PÚBLICO no
-- painel — confirmado direto em `storage.buckets`, não só suspeitado. Com
-- bucket público, a rota `/object/public/avatars/{user_id}/avatar.jpg` serve
-- o arquivo para qualquer um, sem checar RLS nenhuma: mesmo com a conta viva,
-- não só depois de apagada. O caminho contém o `user_id` em claro (é a
-- convenção que a policy de Storage já usa), então bucket público também
-- permitia enumerar quem tem foto.
--
-- `lib/profile.ts` passou a usar `createSignedUrl()` em vez de
-- `getPublicUrl()`, então esta troca não quebra a exibição da foto: quem
-- carrega o perfil pede uma URL assinada nova a cada vez, válida por 1 hora,
-- e isso já respeita a policy de SELECT que só libera pro dono.
update storage.buckets set public = false where id = 'avatars';

-- ── Importação de extrato OFX ───────────────────────────────────────────────
--
-- `fitid` é o identificador único que a instituição financeira dá a cada
-- transação dentro de um arquivo OFX. Guardar isso é o que permite reimportar
-- o mesmo extrato (ou um extrato que se sobrepõe ao anterior) sem duplicar
-- lançamento nenhum — e reimportar é o erro mais comum de quem usa importação
-- de extrato, porque os períodos que os bancos oferecem se sobrepõem.
--
-- O índice NÃO pode ser parcial, e isso não é detalhe de estilo. Uma primeira
-- versão criou `... where fitid is not null`, imaginando que sem o filtro os
-- lançamentos de voz/WhatsApp/manual (todos com fitid nulo) colidiriam entre
-- si. Duas coisas estavam erradas:
--
--  1. O Postgres trata NULL como DISTINTO num índice único (NULLS DISTINCT é o
--     padrão), então quantos lançamentos sem fitid se quiser convivem sem
--     conflito. Verificado: duas linhas com fitid nulo entram normalmente.
--
--  2. `ON CONFLICT (user_id, fitid)` NÃO consegue inferir um índice parcial —
--     a inferência exige que a instrução repita o predicado do índice, o que o
--     PostgREST não emite. Com o índice parcial, o upsert da importação
--     falhava com erro em vez de ignorar duplicado, ou seja, o índice quebrava
--     exatamente a dedup que existia para garantir.
alter table transactions add column if not exists fitid text;
alter table transactions drop constraint if exists transactions_fitid_len;
alter table transactions add constraint transactions_fitid_len
  check (fitid is null or char_length(fitid) <= 255);

create unique index if not exists transactions_user_fitid_uniq
  on transactions (user_id, fitid);

-- ════════════════════════════════════════════════════════════════════════════
-- Saldo por carteira somado no banco
--
-- O app somava saldo percorrendo TODAS as transações baixadas pelo cliente, e
-- o PostgREST deste projeto responde no máximo 1000 linhas por requisição
-- (max_rows: 1000, confirmado na configuração do projeto). Consulta sem
-- `range` não dá erro ao passar do teto: devolve as primeiras 1000 e cala.
-- Como o app ordena por data decrescente, sobrava o histórico recente, e o
-- saldo, que depende do histórico inteiro, virava um número errado exibido com
-- toda a confiança. A partir daqui a soma acontece onde os dados estão, sem
-- teto de linhas e com uma linha de resposta por carteira.
--
-- A regra é a de calcularSaldosWallets() em lib/wallets.ts, traduzida fiel:
--   • compra no crédito não sai do caixa (payment_method = 'credit' OU
--     card_id preenchido), porque a saída vira lançamento próprio quando a
--     fatura é paga;
--   • entrada soma, saída subtrai;
--   • saldo inicial da carteira NÃO entra aqui: continua somado no cliente,
--     que é quem conhece a carteira padrão para onde vão as transações sem
--     wallet_id (devolvidas aqui no grupo NULL).
--
-- O coalesce em payment_method não é decoração: `payment_method = 'credit'`
-- devolve NULL quando a coluna é nula, e `not NULL` é NULL, o que descartaria
-- em silêncio toda transação sem método de pagamento.
--
-- Conferido contra a regra do app sobre os dados reais, usuário a usuário:
-- bate no centavo nos quatro usuários existentes.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.saldos_por_carteira()
returns table (wallet_id uuid, delta numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select t.wallet_id,
         sum(case when t.type = 'in' then t.amount else -t.amount end)::numeric as delta
  from public.transactions t
  where t.user_id = auth.uid()
    and coalesce(t.payment_method, '') <> 'credit'
    and t.card_id is null
  group by t.wallet_id;
$$;

comment on function public.saldos_por_carteira() is
  'Soma de entradas menos saidas por carteira, ignorando credito. Espelha calcularSaldosWallets() em lib/wallets.ts. Saldo inicial e somado no cliente.';

grant execute on function public.saldos_por_carteira() to authenticated;

-- ============================================================================
-- Hardening de backend — 30/08/2026
-- ============================================================================
-- Esta seção é deliberadamente idempotente: corrige instalações existentes e
-- também compõe o baseline reproduzível em supabase/migrations/.

create extension if not exists pgcrypto;

-- A trava comercial fica preparada no banco, mas começa desligada enquanto o
-- checkout ainda não tem URL de produção. Ativá-la é uma única atualização
-- server-side; não exige republicar o app e nunca confia só no paywall visual.
create table if not exists public.app_backend_config (
  id smallint primary key default 1,
  enforce_subscriptions boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint app_backend_config_singleton check (id = 1)
);

insert into public.app_backend_config (id, enforce_subscriptions)
values (1, false)
on conflict (id) do nothing;

alter table public.app_backend_config enable row level security;
revoke all on public.app_backend_config from anon, authenticated;

-- Inbox mínima de webhooks. Não guarda payload, headers, e-mail, telefone,
-- CPF ou token: somente identidade técnica, hash e estado de processamento.
create table if not exists public.webhook_events (
  provider text not null check (provider in ('kiwify', 'whatsapp', 'eas')),
  event_id text not null,
  event_type text,
  payload_hash text not null check (char_length(payload_hash) = 64),
  status text not null default 'processing'
    check (status in ('processing', 'done', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error_code text,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create index if not exists webhook_events_retention_idx
  on public.webhook_events (received_at);

alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;

-- Lease curta por telefone/recurso: coordena mensagens concorrentes sem
-- manter uma transação aberta durante chamadas à Meta/Groq/OpenAI.
create table if not exists public.webhook_processing_locks (
  resource_key text primary key,
  holder text not null,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.webhook_processing_locks enable row level security;
revoke all on public.webhook_processing_locks from anon, authenticated;

-- Estado de rate limit do pareamento; não é exposto pela Data API.
create table if not exists public.whatsapp_pairing_attempts (
  phone text primary key,
  attempts smallint not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_pairing_attempts enable row level security;
revoke all on public.whatsapp_pairing_attempts from anon, authenticated;

-- Idempotência na origem: NULL continua permitido para entradas manuais.
alter table public.transactions add column if not exists source text;
alter table public.transactions add column if not exists source_event_id text;
alter table public.bills add column if not exists source text;
alter table public.bills add column if not exists source_event_id text;

create unique index if not exists transactions_source_event_uniq
  on public.transactions (source, source_event_id);
create unique index if not exists bills_source_event_uniq
  on public.bills (source, source_event_id);

alter table public.transactions drop constraint if exists transactions_source_len;
alter table public.transactions add constraint transactions_source_len
  check (source is null or char_length(source) <= 30);
alter table public.transactions drop constraint if exists transactions_source_event_len;
alter table public.transactions add constraint transactions_source_event_len
  check (source_event_id is null or char_length(source_event_id) <= 255);
alter table public.bills drop constraint if exists bills_source_len;
alter table public.bills add constraint bills_source_len
  check (source is null or char_length(source) <= 30);
alter table public.bills drop constraint if exists bills_source_event_len;
alter table public.bills add constraint bills_source_event_len
  check (source_event_id is null or char_length(source_event_id) <= 255);

-- Uma ocorrência por cabeça/data. O índice não é parcial para que o
-- PostgREST consiga inferi-lo em ON CONFLICT; parent_id NULL não colide.
drop index if exists public.transactions_parent_occurrence_uniq;
create unique index transactions_parent_occurrence_uniq
  on public.transactions (user_id, parent_id, occurred_on);

-- Pareamento: o cliente nunca mais grava o código ou campos verificados.
alter table public.whatsapp_links add column if not exists pairing_expires_at timestamptz;
alter table public.whatsapp_links add column if not exists pairing_attempts smallint not null default 0;
alter table public.whatsapp_links add column if not exists updated_at timestamptz not null default now();
-- ORDEM IMPORTA, e são três passos, não dois: derrubar a regra antiga, migrar
-- as linhas, recriar a regra nova.
--
-- Com a regra antiga ainda de pé, o próprio UPDATE é recusado, porque o hash
-- de 64 caracteres viola o "= 6" vigente naquele instante. E com a regra nova
-- criada antes do UPDATE, é a criação dela que é recusada, porque as linhas
-- ainda estão em 6. Os dois erros são o mesmo nome de restrição e enganam:
-- "violates check constraint whatsapp_links_pairing_code_len".
alter table public.whatsapp_links drop constraint if exists whatsapp_links_pairing_code_len;

-- Códigos em claro viram hash. Quem tinha um código válido precisa pedir outro,
-- o que é aceitável: o código expira em 15 minutos por desenho.
update public.whatsapp_links
set pairing_code = encode(extensions.digest(pairing_code, 'sha256'), 'hex'),
    pairing_expires_at = coalesce(pairing_expires_at, created_at + interval '15 minutes')
where char_length(pairing_code) = 6;

alter table public.whatsapp_links add constraint whatsapp_links_pairing_code_len
  check (char_length(pairing_code) = 64);

create unique index if not exists whatsapp_links_user_uniq
  on public.whatsapp_links (user_id);
create unique index if not exists whatsapp_links_pairing_hash_uniq
  on public.whatsapp_links (pairing_code);

-- Assinatura: separa pedido de assinatura, ordena eventos e guarda apenas
-- metadado sanitizado. Tokens passam a ser hash, expiram e são consumidos.
alter table public.subscriptions add column if not exists provider_subscription_id text;
alter table public.subscriptions add column if not exists last_event_at timestamptz;
alter table public.subscriptions add column if not exists last_event_id text;
alter table public.subscriptions add column if not exists last_event_metadata jsonb;
alter table public.subscriptions add column if not exists activation_token_hash text;
alter table public.subscriptions add column if not exists activation_expires_at timestamptz;

update public.subscriptions
set activation_token_hash = coalesce(
      activation_token_hash,
      encode(extensions.digest(activation_token, 'sha256'), 'hex')
    ),
    activation_expires_at = coalesce(activation_expires_at, created_at + interval '7 days')
where activation_token is not null;

alter table public.subscriptions drop constraint if exists subscriptions_activation_token_key;
alter table public.subscriptions alter column activation_token drop default;
alter table public.subscriptions alter column activation_token drop not null;
update public.subscriptions set activation_token = null where activation_token is not null;
alter table public.subscriptions drop column if exists raw_last_event;

create unique index if not exists subscriptions_provider_subscription_uniq
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;
create unique index if not exists subscriptions_activation_hash_uniq
  on public.subscriptions (activation_token_hash)
  where activation_token_hash is not null;
create index if not exists subscriptions_last_event_idx
  on public.subscriptions (provider, last_event_at desc);

-- O log bruto antigo não tem justificativa de retenção. A limpeza é parte da
-- correção de privacidade; a tabela fica vazia só para não quebrar rollback de
-- versões antigas da função durante uma janela de deploy.
delete from public.webhook_raw_log;
revoke all on public.webhook_raw_log from anon, authenticated;

create or replace function public.tem_assinatura_ativa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.subscriptions s
    where s.user_id = (select auth.uid())
      and (
        s.access_until >= statement_timestamp()
        or (
          s.status = 'past_due'
          and s.grace_until >= statement_timestamp()
        )
      )
  );
$$;

revoke all on function public.tem_assinatura_ativa() from public, anon;
grant execute on function public.tem_assinatura_ativa() to authenticated, service_role;

create or replace function public.tem_direito_acesso()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      not coalesce((
        select c.enforce_subscriptions
        from public.app_backend_config c
        where c.id = 1
      ), false)
      or public.tem_assinatura_ativa()
    );
$$;

revoke all on function public.tem_direito_acesso() from public, anon;
grant execute on function public.tem_direito_acesso() to authenticated, service_role;

create or replace function public.obter_estado_acesso()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with config as (
    select coalesce((
      select c.enforce_subscriptions
      from public.app_backend_config c
      where c.id = 1
    ), false) as enforced
  ), assinatura as (
    select s.status, s.access_until, s.grace_until
    from public.subscriptions s
    where s.user_id = (select auth.uid())
    order by greatest(s.access_until, coalesce(s.grace_until, '-infinity'::timestamptz)) desc
    limit 1
  )
  select jsonb_build_object(
    'enforced', config.enforced,
    'active', public.tem_assinatura_ativa(),
    'allowed', not config.enforced or public.tem_assinatura_ativa(),
    'status', assinatura.status,
    'access_until', assinatura.access_until,
    'grace_until', assinatura.grace_until
  )
  from config
  left join assinatura on true;
$$;

revoke all on function public.obter_estado_acesso() from public, anon;
grant execute on function public.obter_estado_acesso() to authenticated, service_role;

create or replace function public.configurar_bloqueio_assinatura(p_enabled boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.app_backend_config (id, enforce_subscriptions, updated_at)
  values (1, p_enabled, statement_timestamp())
  on conflict (id) do update
    set enforce_subscriptions = excluded.enforce_subscriptions,
        updated_at = excluded.updated_at;
$$;

revoke all on function public.configurar_bloqueio_assinatura(boolean) from public, anon, authenticated;
grant execute on function public.configurar_bloqueio_assinatura(boolean) to service_role;

-- Policies financeiras usam uma única regra de entitlement. O filtro de dono
-- continua explícito para manter isolamento mesmo quando a cobrança está em
-- modo de preparação (enforce_subscriptions=false).
drop policy if exists "usuário vê e edita só seus lançamentos" on public.transactions;
drop policy if exists "transactions: dono com acesso" on public.transactions;
create policy "transactions: dono com acesso"
  on public.transactions for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

drop policy if exists "usuário vê e edita só suas contas" on public.bills;
drop policy if exists "bills: dono com acesso" on public.bills;
create policy "bills: dono com acesso"
  on public.bills for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

drop policy if exists "usuário vê e edita só seus orçamentos" on public.budgets;
drop policy if exists "budgets: dono com acesso" on public.budgets;
create policy "budgets: dono com acesso"
  on public.budgets for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

drop policy if exists "usuário vê e edita só suas categorias" on public.categories;
drop policy if exists "categories: dono com acesso" on public.categories;
create policy "categories: dono com acesso"
  on public.categories for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

drop policy if exists "usuário vê e edita só suas metas" on public.goals;
drop policy if exists "goals: dono com acesso" on public.goals;
create policy "goals: dono com acesso"
  on public.goals for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

drop policy if exists "usuário vê e edita só seus cartões" on public.credit_cards;
drop policy if exists "credit_cards: dono com acesso" on public.credit_cards;
create policy "credit_cards: dono com acesso"
  on public.credit_cards for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

drop policy if exists "usuário vê e edita só suas carteiras" on public.wallets;
drop policy if exists "wallets: dono com acesso" on public.wallets;
create policy "wallets: dono com acesso"
  on public.wallets for all to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

drop policy if exists "faturas: dono ve as proprias" on public.credit_card_invoices;
drop policy if exists "faturas: dono paga a propria fatura" on public.credit_card_invoices;
drop policy if exists "faturas: dono desfaz o proprio pagamento" on public.credit_card_invoices;
drop policy if exists "invoices: dono le com acesso" on public.credit_card_invoices;
drop policy if exists "invoices: dono insere com acesso" on public.credit_card_invoices;
drop policy if exists "invoices: dono exclui com acesso" on public.credit_card_invoices;
create policy "invoices: dono le com acesso"
  on public.credit_card_invoices for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );
create policy "invoices: dono insere com acesso"
  on public.credit_card_invoices for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );
create policy "invoices: dono exclui com acesso"
  on public.credit_card_invoices for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );

-- XP é estado calculado pelo servidor: leitura direta, mutação só por add_xp.
drop policy if exists "usuário vê e edita só seu xp" on public.user_gamification;
drop policy if exists "gamification: dono le com acesso" on public.user_gamification;
create policy "gamification: dono le com acesso"
  on public.user_gamification for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.tem_direito_acesso())
  );
revoke insert, update, delete on public.user_gamification from authenticated;
grant select on public.user_gamification to authenticated;

-- O cliente enxerga e pode remover seu vínculo, mas nunca criar/editar
-- verified, phone, pairing_code ou last_entry_* diretamente.
drop policy if exists "usuário vê e edita só seu vínculo de whatsapp" on public.whatsapp_links;
drop policy if exists "whatsapp_links: dono le" on public.whatsapp_links;
drop policy if exists "whatsapp_links: dono remove" on public.whatsapp_links;
create policy "whatsapp_links: dono le"
  on public.whatsapp_links for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "whatsapp_links: dono remove"
  on public.whatsapp_links for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke insert, update on public.whatsapp_links from authenticated;
grant select, delete on public.whatsapp_links to authenticated;

-- Campos gerados pelo webhook não podem ser forjados por um cliente comum.
revoke insert on public.transactions from authenticated;
grant insert (
  user_id, type, description, amount, category, color, occurred_on, recurring,
  parent_id, installment_current, installment_total, payment_method, bank,
  card_id, wallet_id, fitid
) on public.transactions to authenticated;
revoke update on public.transactions from authenticated;
grant update (
  type, description, amount, category, color, occurred_on, recurring,
  parent_id, installment_current, installment_total, payment_method, bank,
  card_id, wallet_id, fitid
) on public.transactions to authenticated;

-- status e paid_transaction_id são alterados somente pelas RPCs atômicas.
revoke update on public.bills from authenticated;
grant update (description, amount, category, color, due_date, recurring, wallet_id)
  on public.bills to authenticated;

-- Integridade multi-tenant. As FKs simples continuam cuidando do CASCADE /
-- SET NULL; as compostas provam que os dois lados pertencem ao mesmo dono.
create unique index if not exists transactions_user_id_id_uniq
  on public.transactions (user_id, id);
create unique index if not exists credit_cards_user_id_id_uniq
  on public.credit_cards (user_id, id);
create unique index if not exists wallets_user_id_id_uniq
  on public.wallets (user_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_parent_same_owner_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_parent_same_owner_fkey
      foreign key (user_id, parent_id)
      references public.transactions (user_id, id)
      not valid;
  end if;
  alter table public.transactions validate constraint transactions_parent_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_card_same_owner_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_card_same_owner_fkey
      foreign key (user_id, card_id)
      references public.credit_cards (user_id, id)
      not valid;
  end if;
  alter table public.transactions validate constraint transactions_card_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_wallet_same_owner_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_wallet_same_owner_fkey
      foreign key (user_id, wallet_id)
      references public.wallets (user_id, id)
      not valid;
  end if;
  alter table public.transactions validate constraint transactions_wallet_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bills_paid_transaction_same_owner_fkey'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_paid_transaction_same_owner_fkey
      foreign key (user_id, paid_transaction_id)
      references public.transactions (user_id, id)
      not valid;
  end if;
  alter table public.bills validate constraint bills_paid_transaction_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bills_wallet_same_owner_fkey'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_wallet_same_owner_fkey
      foreign key (user_id, wallet_id)
      references public.wallets (user_id, id)
      not valid;
  end if;
  alter table public.bills validate constraint bills_wallet_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'goals_wallet_same_owner_fkey'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
      add constraint goals_wallet_same_owner_fkey
      foreign key (user_id, wallet_id)
      references public.wallets (user_id, id)
      not valid;
  end if;
  alter table public.goals validate constraint goals_wallet_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'credit_cards_wallet_same_owner_fkey'
      and conrelid = 'public.credit_cards'::regclass
  ) then
    alter table public.credit_cards
      add constraint credit_cards_wallet_same_owner_fkey
      foreign key (user_id, wallet_id)
      references public.wallets (user_id, id)
      not valid;
  end if;
  alter table public.credit_cards validate constraint credit_cards_wallet_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_card_same_owner_fkey'
      and conrelid = 'public.credit_card_invoices'::regclass
  ) then
    alter table public.credit_card_invoices
      add constraint invoices_card_same_owner_fkey
      foreign key (user_id, card_id)
      references public.credit_cards (user_id, id)
      not valid;
  end if;
  alter table public.credit_card_invoices validate constraint invoices_card_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_wallet_same_owner_fkey'
      and conrelid = 'public.credit_card_invoices'::regclass
  ) then
    alter table public.credit_card_invoices
      add constraint invoices_wallet_same_owner_fkey
      foreign key (user_id, wallet_id)
      references public.wallets (user_id, id)
      not valid;
  end if;
  alter table public.credit_card_invoices validate constraint invoices_wallet_same_owner_fkey;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_paid_transaction_same_owner_fkey'
      and conrelid = 'public.credit_card_invoices'::regclass
  ) then
    alter table public.credit_card_invoices
      add constraint invoices_paid_transaction_same_owner_fkey
      foreign key (user_id, paid_transaction_id)
      references public.transactions (user_id, id)
      not valid;
  end if;
  alter table public.credit_card_invoices validate constraint invoices_paid_transaction_same_owner_fkey;
end
$$;

create index if not exists credit_card_invoices_wallet_id_idx
  on public.credit_card_invoices (wallet_id) where wallet_id is not null;
create index if not exists credit_card_invoices_paid_transaction_id_idx
  on public.credit_card_invoices (paid_transaction_id) where paid_transaction_id is not null;

-- Série de contas recorrentes: identifica a cabeça e impede duplicação da
-- próxima competência quando um pedido é repetido.
alter table public.bills add column if not exists parent_id uuid references public.bills(id) on delete cascade;
create unique index if not exists bills_user_id_id_uniq
  on public.bills (user_id, id);
create unique index if not exists bills_recurrence_occurrence_uniq
  on public.bills (user_id, parent_id, due_date);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bills_parent_same_owner_fkey'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_parent_same_owner_fkey
      foreign key (user_id, parent_id)
      references public.bills (user_id, id)
      not valid;
  end if;
  alter table public.bills validate constraint bills_parent_same_owner_fkey;
end
$$;

create or replace function public.somar_meses_data(p_date date, p_months integer)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  with alvo as (
    select (date_trunc('month', p_date) + make_interval(months => p_months))::date as primeiro
  )
  select (
    alvo.primeiro
    + least(
        extract(day from p_date)::integer,
        extract(day from (alvo.primeiro + interval '1 month - 1 day'))::integer
      )
    - 1
  )::date
  from alvo;
$$;

revoke all on function public.somar_meses_data(date, integer) from public, anon, authenticated;

create or replace function public.pagar_conta(p_bill_id uuid, p_paid_on date)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bill public.bills;
  v_tx_id uuid;
  v_parent uuid;
  v_next_due date;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if p_paid_on is null then
    raise exception 'Data de pagamento inválida' using errcode = '22023';
  end if;

  select * into v_bill
  from public.bills b
  where b.id = p_bill_id and b.user_id = v_user
  for update;

  if not found then
    raise exception 'Conta não encontrada' using errcode = 'P0002';
  end if;
  if v_bill.status = 'paid' then
    return v_bill;
  end if;

  insert into public.transactions (
    user_id, type, description, amount, category, color, occurred_on, wallet_id
  ) values (
    v_user, 'out', v_bill.description, v_bill.amount, v_bill.category,
    v_bill.color, p_paid_on, v_bill.wallet_id
  ) returning id into v_tx_id;

  update public.bills
  set status = 'paid', paid_transaction_id = v_tx_id
  where id = v_bill.id and user_id = v_user
  returning * into v_bill;

  if v_bill.recurring then
    v_parent := coalesce(v_bill.parent_id, v_bill.id);
    v_next_due := public.somar_meses_data(v_bill.due_date, 1);
    insert into public.bills (
      user_id, description, amount, category, color, due_date, status,
      recurring, wallet_id, parent_id
    ) values (
      v_user, v_bill.description, v_bill.amount, v_bill.category, v_bill.color,
      v_next_due, 'due', true, v_bill.wallet_id, v_parent
    ) on conflict (user_id, parent_id, due_date) do nothing;
  end if;

  return v_bill;
end;
$$;

revoke all on function public.pagar_conta(uuid, date) from public, anon;
grant execute on function public.pagar_conta(uuid, date) to authenticated;

create or replace function public.reabrir_conta(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bill public.bills;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  select * into v_bill
  from public.bills b
  where b.id = p_bill_id and b.user_id = v_user
  for update;
  if not found then
    raise exception 'Conta não encontrada' using errcode = 'P0002';
  end if;

  if v_bill.paid_transaction_id is not null then
    delete from public.transactions
    where id = v_bill.paid_transaction_id and user_id = v_user;
  end if;

  update public.bills
  set status = 'due', paid_transaction_id = null
  where id = v_bill.id and user_id = v_user
  returning * into v_bill;
  return v_bill;
end;
$$;

revoke all on function public.reabrir_conta(uuid) from public, anon;
grant execute on function public.reabrir_conta(uuid) to authenticated;

create or replace function public.pagar_fatura_cartao(
  p_card_id uuid,
  p_year integer,
  p_month integer,
  p_amount numeric,
  p_paid_on date,
  p_wallet_id uuid default null
)
returns public.credit_card_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_card public.credit_cards;
  v_invoice public.credit_card_invoices;
  v_tx_id uuid;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if p_month not between 0 and 11 or p_amount <= 0 or p_paid_on is null then
    raise exception 'Dados de fatura inválidos' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_user::text || ':' || p_card_id::text || ':' || p_year::text || ':' || p_month::text,
    0
  ));

  select * into v_invoice
  from public.credit_card_invoices i
  where i.user_id = v_user and i.card_id = p_card_id
    and i.year = p_year and i.month = p_month
  for update;
  if found then
    return v_invoice;
  end if;

  select * into v_card
  from public.credit_cards c
  where c.id = p_card_id and c.user_id = v_user;
  if not found then
    raise exception 'Cartão não encontrado' using errcode = 'P0002';
  end if;

  if p_wallet_id is not null and not exists (
    select 1 from public.wallets w where w.id = p_wallet_id and w.user_id = v_user
  ) then
    raise exception 'Carteira não pertence ao usuário' using errcode = '23503';
  end if;

  insert into public.transactions (
    user_id, type, description, amount, category, color, occurred_on, wallet_id
  ) values (
    v_user,
    'out',
    format('Pagamento fatura — %s (%s/%s)', v_card.name, lpad((p_month + 1)::text, 2, '0'), p_year),
    p_amount,
    'Cartão de crédito',
    v_card.color,
    p_paid_on,
    p_wallet_id
  ) returning id into v_tx_id;

  insert into public.credit_card_invoices (
    user_id, card_id, year, month, amount, paid_on, wallet_id,
    paid_transaction_id
  ) values (
    v_user, p_card_id, p_year, p_month, p_amount, p_paid_on, p_wallet_id,
    v_tx_id
  ) returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke all on function public.pagar_fatura_cartao(uuid, integer, integer, numeric, date, uuid) from public, anon;
grant execute on function public.pagar_fatura_cartao(uuid, integer, integer, numeric, date, uuid) to authenticated;

create or replace function public.reabrir_fatura_cartao(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invoice public.credit_card_invoices;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  select * into v_invoice
  from public.credit_card_invoices i
  where i.id = p_invoice_id and i.user_id = v_user
  for update;
  if not found then
    raise exception 'Fatura não encontrada' using errcode = 'P0002';
  end if;

  delete from public.credit_card_invoices
  where id = v_invoice.id and user_id = v_user;
  if v_invoice.paid_transaction_id is not null then
    delete from public.transactions
    where id = v_invoice.paid_transaction_id and user_id = v_user;
  end if;
end;
$$;

revoke all on function public.reabrir_fatura_cartao(uuid) from public, anon;
grant execute on function public.reabrir_fatura_cartao(uuid) to authenticated;

create or replace function public.adicionar_compra_parcelada(
  p_description text,
  p_total_amount numeric,
  p_category text,
  p_color text,
  p_occurred_on date,
  p_installments integer,
  p_payment_method text default null,
  p_bank text default null,
  p_card_id uuid default null,
  p_wallet_id uuid default null
)
returns setof public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_parent uuid := gen_random_uuid();
  v_base numeric(12,2);
  v_last numeric(12,2);
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if p_installments not between 2 and 120 or p_total_amount <= 0
     or p_occurred_on is null then
    raise exception 'Parcelamento inválido' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 180
     or char_length(coalesce(p_category, '')) > 60 then
    raise exception 'Texto do parcelamento excede o limite' using errcode = '22023';
  end if;

  if p_card_id is not null and not exists (
    select 1 from public.credit_cards c where c.id = p_card_id and c.user_id = v_user
  ) then
    raise exception 'Cartão não pertence ao usuário' using errcode = '23503';
  end if;
  if p_wallet_id is not null and not exists (
    select 1 from public.wallets w where w.id = p_wallet_id and w.user_id = v_user
  ) then
    raise exception 'Carteira não pertence ao usuário' using errcode = '23503';
  end if;

  v_base := round(p_total_amount / p_installments, 2);
  v_last := round(p_total_amount - v_base * (p_installments - 1), 2);

  insert into public.transactions (
    id, user_id, type, description, amount, category, color, occurred_on,
    recurring, parent_id, payment_method, bank, card_id,
    installment_current, installment_total, wallet_id
  )
  select
    case when serie.i = 1 then v_parent else gen_random_uuid() end,
    v_user,
    'out',
    format('%s (%s/%s)', coalesce(nullif(trim(p_description), ''), 'Compra parcelada'), serie.i, p_installments),
    case when serie.i = p_installments then v_last else v_base end,
    p_category,
    p_color,
    public.somar_meses_data(p_occurred_on, serie.i - 1),
    false,
    case when serie.i = 1 then null else v_parent end,
    p_payment_method,
    p_bank,
    p_card_id,
    serie.i,
    p_installments,
    p_wallet_id
  from generate_series(1, p_installments) as serie(i);

  return query
  select t.*
  from public.transactions t
  where t.user_id = v_user and (t.id = v_parent or t.parent_id = v_parent)
  order by t.installment_current;
end;
$$;

revoke all on function public.adicionar_compra_parcelada(text, numeric, text, text, date, integer, text, text, uuid, uuid) from public, anon;
grant execute on function public.adicionar_compra_parcelada(text, numeric, text, text, date, integer, text, text, uuid, uuid) to authenticated;

create or replace function public.atualizar_categoria(
  p_category_id uuid,
  p_old_name text,
  p_new_name text,
  p_color text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if char_length(trim(p_new_name)) not between 1 and 60
     or char_length(p_color) > 9 then
    raise exception 'Categoria inválida' using errcode = '22023';
  end if;

  perform 1 from public.categories c
  where c.id = p_category_id and c.user_id = v_user and c.name = p_old_name
  for update;
  if not found then
    raise exception 'Categoria não encontrada' using errcode = 'P0002';
  end if;

  update public.categories
  set name = trim(p_new_name), color = p_color
  where id = p_category_id and user_id = v_user;
  update public.transactions
  set category = trim(p_new_name), color = p_color
  where user_id = v_user and category = p_old_name;
  update public.bills
  set category = trim(p_new_name), color = p_color
  where user_id = v_user and category = p_old_name;
  update public.budgets
  set category = trim(p_new_name), color = p_color
  where user_id = v_user and category = p_old_name;
end;
$$;

revoke all on function public.atualizar_categoria(uuid, text, text, text) from public, anon;
grant execute on function public.atualizar_categoria(uuid, text, text, text) to authenticated;

create or replace function public.excluir_categoria(
  p_category_id uuid,
  p_name text,
  p_fallback_name text,
  p_fallback_color text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  perform 1 from public.categories c
  where c.id = p_category_id and c.user_id = v_user and c.name = p_name
  for update;
  if not found then
    raise exception 'Categoria não encontrada' using errcode = 'P0002';
  end if;

  update public.transactions
  set category = p_fallback_name, color = p_fallback_color
  where user_id = v_user and category = p_name;
  update public.bills
  set category = p_fallback_name, color = p_fallback_color
  where user_id = v_user and category = p_name;
  delete from public.budgets
  where user_id = v_user and category = p_name;
  delete from public.categories
  where id = p_category_id and user_id = v_user;
end;
$$;

revoke all on function public.excluir_categoria(uuid, text, text, text) from public, anon;
grant execute on function public.excluir_categoria(uuid, text, text, text) to authenticated;

-- XP é concedido dentro das operações que o justificam. A antiga add_xp
-- permanece apenas para service_role, evitando que o cliente fabrique nível.
create or replace function public.criar_meta(
  p_title text,
  p_target_amount numeric,
  p_color text,
  p_icon text,
  p_deadline date default null,
  p_wallet_id uuid default null
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_goal public.goals;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if p_target_amount <= 0 then
    raise exception 'Valor da meta inválido' using errcode = '22023';
  end if;
  if p_wallet_id is not null and not exists (
    select 1 from public.wallets w where w.id = p_wallet_id and w.user_id = v_user
  ) then
    raise exception 'Carteira não pertence ao usuário' using errcode = '23503';
  end if;

  insert into public.goals (
    user_id, title, target_amount, color, icon, deadline, wallet_id
  ) values (
    v_user, p_title, p_target_amount, p_color, p_icon, p_deadline, p_wallet_id
  ) returning * into v_goal;

  insert into public.user_gamification (user_id, lifetime_xp, updated_at)
  values (v_user, 25, statement_timestamp())
  on conflict (user_id) do update
    set lifetime_xp = public.user_gamification.lifetime_xp + 25,
        updated_at = excluded.updated_at;

  return v_goal;
end;
$$;

revoke all on function public.criar_meta(text, numeric, text, text, date, uuid) from public, anon;
grant execute on function public.criar_meta(text, numeric, text, text, date, uuid) to authenticated;

create or replace function public.deposit_to_goal(p_goal_id uuid, p_delta numeric)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_before public.goals;
  v_after public.goals;
  v_xp integer := 0;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  select * into v_before
  from public.goals g
  where g.id = p_goal_id and g.user_id = v_user
  for update;
  if not found then
    raise exception 'Meta não encontrada' using errcode = 'P0002';
  end if;

  update public.goals
  set current_amount = greatest(0, current_amount + p_delta)
  where id = p_goal_id and user_id = v_user
  returning * into v_after;

  if p_delta > 0 then
    v_xp := least(200, greatest(5, round(p_delta / 10)::integer));
  end if;
  if v_before.current_amount < v_before.target_amount
     and v_after.current_amount >= v_after.target_amount then
    v_xp := v_xp + 150;
  end if;

  if v_xp > 0 then
    insert into public.user_gamification (user_id, lifetime_xp, updated_at)
    values (v_user, v_xp, statement_timestamp())
    on conflict (user_id) do update
      set lifetime_xp = public.user_gamification.lifetime_xp + v_xp,
          updated_at = excluded.updated_at;
  end if;

  return v_after;
end;
$$;

revoke all on function public.deposit_to_goal(uuid, numeric) from public, anon;
grant execute on function public.deposit_to_goal(uuid, numeric) to authenticated;

revoke all on function public.add_xp(integer) from public, anon, authenticated;
grant execute on function public.add_xp(integer) to service_role;

create or replace function public.vincular_assinatura_automatica()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_user;
  if v_email is null then return; end if;

  update public.subscriptions s
  set user_id = v_user,
      activated_at = coalesce(s.activated_at, statement_timestamp()),
      activation_token_hash = null,
      activation_expires_at = null,
      updated_at = statement_timestamp()
  where s.user_id is null and lower(s.email_compra) = lower(v_email);
end;
$$;

revoke all on function public.vincular_assinatura_automatica() from public, anon;
grant execute on function public.vincular_assinatura_automatica() to authenticated;

create or replace function public.vincular_assinatura_por_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_rows integer;
begin
  if v_user is null or p_token is null or char_length(p_token) not between 20 and 256 then
    return false;
  end if;

  update public.subscriptions s
  set user_id = v_user,
      activated_at = statement_timestamp(),
      activation_token_hash = null,
      activation_expires_at = null,
      updated_at = statement_timestamp()
  where s.user_id is null
    and s.activation_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.activation_expires_at >= statement_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.vincular_assinatura_por_token(text) from public, anon;
grant execute on function public.vincular_assinatura_por_token(text) to authenticated;

create or replace function public.usuario_tem_direito(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((
    select c.enforce_subscriptions
    from public.app_backend_config c where c.id = 1
  ), false)
  or exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and (
        s.access_until >= statement_timestamp()
        or (s.status = 'past_due' and s.grace_until >= statement_timestamp())
      )
  );
$$;

revoke all on function public.usuario_tem_direito(uuid) from public, anon, authenticated;
grant execute on function public.usuario_tem_direito(uuid) to service_role;

create or replace function public.reivindicar_webhook_evento(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.webhook_events;
begin
  if p_provider not in ('kiwify', 'whatsapp', 'eas')
     or char_length(p_event_id) not between 1 and 255
     or char_length(p_payload_hash) <> 64 then
    raise exception 'Identidade de webhook inválida' using errcode = '22023';
  end if;

  insert into public.webhook_events (
    provider, event_id, event_type, payload_hash, status
  ) values (
    p_provider, p_event_id, left(p_event_type, 80), p_payload_hash, 'processing'
  ) on conflict (provider, event_id) do nothing;
  if found then return 'claimed'; end if;

  select * into v_event
  from public.webhook_events e
  where e.provider = p_provider and e.event_id = p_event_id
  for update;

  if v_event.payload_hash <> p_payload_hash then
    raise exception 'Evento repetido com payload divergente' using errcode = '22000';
  end if;
  if v_event.status = 'done' then return 'done'; end if;
  if v_event.status = 'processing'
     and v_event.processing_started_at > statement_timestamp() - interval '5 minutes' then
    return 'busy';
  end if;

  update public.webhook_events
  set status = 'processing',
      attempts = attempts + 1,
      processing_started_at = statement_timestamp(),
      last_error_code = null,
      updated_at = statement_timestamp()
  where provider = p_provider and event_id = p_event_id;
  return 'claimed';
end;
$$;

revoke all on function public.reivindicar_webhook_evento(text, text, text, text) from public, anon, authenticated;
grant execute on function public.reivindicar_webhook_evento(text, text, text, text) to service_role;

create or replace function public.finalizar_webhook_evento(p_provider text, p_event_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.webhook_events
  set status = 'done', processed_at = statement_timestamp(),
      last_error_code = null, updated_at = statement_timestamp()
  where provider = p_provider and event_id = p_event_id;
$$;

revoke all on function public.finalizar_webhook_evento(text, text) from public, anon, authenticated;
grant execute on function public.finalizar_webhook_evento(text, text) to service_role;

create or replace function public.falhar_webhook_evento(
  p_provider text,
  p_event_id text,
  p_error_code text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.webhook_events
  set status = 'failed', last_error_code = left(p_error_code, 80),
      updated_at = statement_timestamp()
  where provider = p_provider and event_id = p_event_id;
$$;

revoke all on function public.falhar_webhook_evento(text, text, text) from public, anon, authenticated;
grant execute on function public.falhar_webhook_evento(text, text, text) to service_role;

create or replace function public.expurgar_eventos_webhook()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows bigint;
begin
  delete from public.webhook_events
  where received_at < statement_timestamp() - interval '30 days';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.expurgar_eventos_webhook() from public, anon, authenticated;
grant execute on function public.expurgar_eventos_webhook() to service_role;

create or replace function public.adquirir_webhook_lock(
  p_resource_key text,
  p_holder text,
  p_ttl_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if char_length(p_resource_key) not between 1 and 255
     or char_length(p_holder) not between 1 and 255
     or p_ttl_seconds not between 5 and 300 then
    raise exception 'Lease inválido' using errcode = '22023';
  end if;

  insert into public.webhook_processing_locks (
    resource_key, holder, locked_until, updated_at
  ) values (
    p_resource_key, p_holder,
    statement_timestamp() + make_interval(secs => p_ttl_seconds),
    statement_timestamp()
  ) on conflict (resource_key) do update
    set holder = excluded.holder,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    where public.webhook_processing_locks.locked_until <= statement_timestamp()
       or public.webhook_processing_locks.holder = excluded.holder;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.adquirir_webhook_lock(text, text, integer) from public, anon, authenticated;
grant execute on function public.adquirir_webhook_lock(text, text, integer) to service_role;

create or replace function public.liberar_webhook_lock(p_resource_key text, p_holder text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.webhook_processing_locks
  where resource_key = p_resource_key and holder = p_holder;
$$;

revoke all on function public.liberar_webhook_lock(text, text) from public, anon, authenticated;
grant execute on function public.liberar_webhook_lock(text, text) to service_role;

create or replace function public.criar_pareamento_whatsapp()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bytes bytea;
  v_code text;
  v_hash text;
  v_id uuid;
  v_attempt integer := 0;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  delete from public.whatsapp_links where user_id = v_user;

  loop
    v_attempt := v_attempt + 1;
    v_bytes := extensions.gen_random_bytes(4);
    v_code := lpad((
      100000 + (
        (
          get_byte(v_bytes, 0)::bigint * 16777216
          + get_byte(v_bytes, 1)::bigint * 65536
          + get_byte(v_bytes, 2)::bigint * 256
          + get_byte(v_bytes, 3)::bigint
        ) % 900000
      )
    )::text, 6, '0');
    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
    exit when not exists (
      select 1 from public.whatsapp_links l where l.pairing_code = v_hash
    );
    if v_attempt >= 8 then
      raise exception 'Não foi possível gerar código único';
    end if;
  end loop;

  insert into public.whatsapp_links (
    user_id, phone, pairing_code, verified, pairing_expires_at, updated_at
  ) values (
    v_user, null, v_hash, false,
    statement_timestamp() + interval '15 minutes', statement_timestamp()
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'user_id', v_user,
    'phone', null,
    'pairing_code', v_code,
    'verified', false,
    'verified_at', null,
    'created_at', statement_timestamp(),
    'pairing_expires_at', statement_timestamp() + interval '15 minutes'
  );
end;
$$;

revoke all on function public.criar_pareamento_whatsapp() from public, anon;
grant execute on function public.criar_pareamento_whatsapp() to authenticated;

create or replace function public.confirmar_pareamento_whatsapp(
  p_phone text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_link public.whatsapp_links;
  v_attempt public.whatsapp_pairing_attempts;
  v_hash text;
begin
  if char_length(v_phone) not between 8 and 20 or p_code !~ '^\d{6}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('whatsapp-pair:' || v_phone, 0));
  select * into v_attempt
  from public.whatsapp_pairing_attempts a
  where a.phone = v_phone
  for update;

  if found and v_attempt.locked_until > statement_timestamp() then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if found and v_attempt.window_started_at <= statement_timestamp() - interval '15 minutes' then
    update public.whatsapp_pairing_attempts
    set attempts = 0, window_started_at = statement_timestamp(),
        locked_until = null, updated_at = statement_timestamp()
    where phone = v_phone;
  end if;

  v_hash := encode(extensions.digest(p_code, 'sha256'), 'hex');
  select * into v_link
  from public.whatsapp_links l
  where l.pairing_code = v_hash
    and not l.verified
    and l.pairing_expires_at >= statement_timestamp()
  for update;

  if not found then
    insert into public.whatsapp_pairing_attempts (
      phone, attempts, window_started_at, locked_until, updated_at
    ) values (
      v_phone, 1, statement_timestamp(), null, statement_timestamp()
    ) on conflict (phone) do update
      set attempts = public.whatsapp_pairing_attempts.attempts + 1,
          locked_until = case
            when public.whatsapp_pairing_attempts.attempts + 1 >= 8
              then statement_timestamp() + interval '15 minutes'
            else public.whatsapp_pairing_attempts.locked_until
          end,
          updated_at = statement_timestamp();
    return jsonb_build_object('status', 'invalid');
  end if;

  if exists (
    select 1 from public.whatsapp_links l
    where l.phone = v_phone and l.verified and l.id <> v_link.id
  ) then
    return jsonb_build_object('status', 'phone_in_use');
  end if;

  update public.whatsapp_links
  set phone = v_phone,
      verified = true,
      verified_at = statement_timestamp(),
      pairing_expires_at = null,
      updated_at = statement_timestamp()
  where id = v_link.id and user_id = v_link.user_id and not verified;

  delete from public.whatsapp_pairing_attempts where phone = v_phone;
  return jsonb_build_object('status', 'confirmed', 'user_id', v_link.user_id);
end;
$$;

revoke all on function public.confirmar_pareamento_whatsapp(text, text) from public, anon, authenticated;
grant execute on function public.confirmar_pareamento_whatsapp(text, text) to service_role;

create or replace function public.registrar_lancamento_whatsapp(
  p_user_id uuid,
  p_phone text,
  p_event_id text,
  p_type text,
  p_description text,
  p_amount numeric,
  p_category text,
  p_color text,
  p_occurred_on date,
  p_card_id uuid default null,
  p_payment_method text default null,
  p_installments integer default null,
  p_recurring boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_parent uuid := gen_random_uuid();
  v_base numeric(12,2);
  v_last numeric(12,2);
  v_installments integer := coalesce(p_installments, 1);
begin
  if p_type not in ('in', 'out') or p_amount <= 0
     or char_length(p_event_id) not between 1 and 255
     or v_installments not between 1 and 120 then
    raise exception 'Lançamento inválido' using errcode = '22023';
  end if;
  if not public.usuario_tem_direito(p_user_id) then
    raise exception 'Assinatura sem acesso' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.whatsapp_links l
    where l.user_id = p_user_id and l.phone = p_phone and l.verified
  ) then
    raise exception 'Vínculo do WhatsApp inválido' using errcode = '42501';
  end if;
  if p_card_id is not null and not exists (
    select 1 from public.credit_cards c where c.id = p_card_id and c.user_id = p_user_id
  ) then
    raise exception 'Cartão não pertence ao usuário' using errcode = '23503';
  end if;

  select t.id into v_existing
  from public.transactions t
  where t.source = 'whatsapp'
    and t.source_event_id = case when v_installments > 1 then p_event_id || ':1' else p_event_id end;
  if found then return v_existing; end if;

  if v_installments = 1 then
    insert into public.transactions (
      id, user_id, type, description, amount, category, color, occurred_on,
      recurring, card_id, payment_method, source, source_event_id
    ) values (
      v_parent, p_user_id, p_type, p_description, p_amount, p_category,
      p_color, p_occurred_on, p_recurring, p_card_id, p_payment_method,
      'whatsapp', p_event_id
    ) on conflict (source, source_event_id) do nothing;
  else
    v_base := round(p_amount / v_installments, 2);
    v_last := round(p_amount - v_base * (v_installments - 1), 2);
    insert into public.transactions (
      id, user_id, type, description, amount, category, color, occurred_on,
      recurring, parent_id, card_id, payment_method, installment_current,
      installment_total, source, source_event_id
    )
    select
      case when serie.i = 1 then v_parent else gen_random_uuid() end,
      p_user_id,
      p_type,
      format('%s (%s/%s)', p_description, serie.i, v_installments),
      case when serie.i = v_installments then v_last else v_base end,
      p_category,
      p_color,
      public.somar_meses_data(p_occurred_on, serie.i - 1),
      false,
      case when serie.i = 1 then null else v_parent end,
      p_card_id,
      p_payment_method,
      serie.i,
      v_installments,
      'whatsapp',
      p_event_id || ':' || serie.i
    from generate_series(1, v_installments) as serie(i)
    on conflict (source, source_event_id) do nothing;
  end if;

  select t.id into v_existing
  from public.transactions t
  where t.source = 'whatsapp'
    and t.source_event_id = case when v_installments > 1 then p_event_id || ':1' else p_event_id end;
  if v_existing is null then
    raise exception 'Falha ao persistir lançamento';
  end if;

  update public.whatsapp_links
  set last_entry_kind = 'transaction', last_entry_id = v_existing,
      last_entry_at = statement_timestamp(), updated_at = statement_timestamp()
  where user_id = p_user_id and phone = p_phone and verified;
  delete from public.whatsapp_pending where user_id = p_user_id and phone = p_phone;
  return v_existing;
end;
$$;

revoke all on function public.registrar_lancamento_whatsapp(uuid, text, text, text, text, numeric, text, text, date, uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.registrar_lancamento_whatsapp(uuid, text, text, text, text, numeric, text, text, date, uuid, text, integer, boolean) to service_role;

create or replace function public.registrar_boleto_whatsapp(
  p_user_id uuid,
  p_phone text,
  p_event_id text,
  p_description text,
  p_amount numeric,
  p_category text,
  p_color text,
  p_due_date date,
  p_recurring boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_amount <= 0 or char_length(p_event_id) not between 1 and 255 then
    raise exception 'Boleto inválido' using errcode = '22023';
  end if;
  if not public.usuario_tem_direito(p_user_id) then
    raise exception 'Assinatura sem acesso' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.whatsapp_links l
    where l.user_id = p_user_id and l.phone = p_phone and l.verified
  ) then
    raise exception 'Vínculo do WhatsApp inválido' using errcode = '42501';
  end if;

  insert into public.bills (
    user_id, description, amount, category, color, due_date, status,
    recurring, source, source_event_id
  ) values (
    p_user_id, p_description, p_amount, p_category, p_color, p_due_date,
    'due', p_recurring, 'whatsapp', p_event_id
  ) on conflict (source, source_event_id) do nothing
  returning id into v_id;

  if v_id is null then
    select b.id into v_id from public.bills b
    where b.source = 'whatsapp' and b.source_event_id = p_event_id;
  end if;

  update public.whatsapp_links
  set last_entry_kind = 'bill', last_entry_id = v_id,
      last_entry_at = statement_timestamp(), updated_at = statement_timestamp()
  where user_id = p_user_id and phone = p_phone and verified;
  return v_id;
end;
$$;

revoke all on function public.registrar_boleto_whatsapp(uuid, text, text, text, numeric, text, text, date, boolean) from public, anon, authenticated;
grant execute on function public.registrar_boleto_whatsapp(uuid, text, text, text, numeric, text, text, date, boolean) to service_role;

create or replace function public.cancelar_ultimo_whatsapp(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.whatsapp_links;
  v_bill public.bills;
  v_count integer;
  v_total numeric;
  v_description text;
  v_category text;
begin
  select * into v_link
  from public.whatsapp_links l
  where l.phone = p_phone and l.verified
  for update;

  if not found or v_link.last_entry_id is null then
    return jsonb_build_object('status', 'none');
  end if;
  if v_link.last_entry_at < statement_timestamp() - interval '24 hours' then
    return jsonb_build_object('status', 'expired');
  end if;

  if v_link.last_entry_kind = 'bill' then
    select * into v_bill
    from public.bills b
    where b.id = v_link.last_entry_id and b.user_id = v_link.user_id
    for update;
    if not found then
      update public.whatsapp_links
      set last_entry_kind = null, last_entry_id = null, last_entry_at = null,
          updated_at = statement_timestamp()
      where id = v_link.id and user_id = v_link.user_id;
      return jsonb_build_object('status', 'missing');
    end if;

    delete from public.bills
    where id = v_bill.id and user_id = v_link.user_id;
    update public.whatsapp_links
    set last_entry_kind = null, last_entry_id = null, last_entry_at = null,
        updated_at = statement_timestamp()
    where id = v_link.id and user_id = v_link.user_id;
    return jsonb_build_object(
      'status', 'deleted', 'kind', 'bill', 'count', 1,
      'amount', v_bill.amount, 'description', v_bill.description
    );
  end if;

  select count(*), coalesce(sum(t.amount), 0), min(t.description), min(t.category)
  into v_count, v_total, v_description, v_category
  from public.transactions t
  where t.user_id = v_link.user_id
    and (t.id = v_link.last_entry_id or t.parent_id = v_link.last_entry_id);

  if v_count = 0 then
    update public.whatsapp_links
    set last_entry_kind = null, last_entry_id = null, last_entry_at = null,
        updated_at = statement_timestamp()
    where id = v_link.id and user_id = v_link.user_id;
    return jsonb_build_object('status', 'missing');
  end if;

  delete from public.transactions t
  where t.user_id = v_link.user_id
    and (t.id = v_link.last_entry_id or t.parent_id = v_link.last_entry_id);
  update public.whatsapp_links
  set last_entry_kind = null, last_entry_id = null, last_entry_at = null,
      updated_at = statement_timestamp()
  where id = v_link.id and user_id = v_link.user_id;

  return jsonb_build_object(
    'status', 'deleted', 'kind', 'transaction', 'count', v_count,
    'amount', v_total,
    'description', regexp_replace(v_description, '\s*\(\d+/\d+\)\s*$', ''),
    'category', v_category
  );
end;
$$;

revoke all on function public.cancelar_ultimo_whatsapp(text) from public, anon, authenticated;
grant execute on function public.cancelar_ultimo_whatsapp(text) to service_role;

-- Remove a assinatura anterior para o PostgREST nunca precisar resolver uma
-- chamada ambigua entre a versao de 3 parametros e a atual, que inclui notas.
drop function if exists public.publicar_app_release(text, text, timestamptz);

create or replace function public.publicar_app_release(
  p_version text,
  p_apk_url text,
  p_expires_at timestamptz default null,
  -- Texto de "o que mudou", uma linha por item, mostrado no pop-up de
  -- novidades ao abrir a versão instalada (ver lib/atualizacao.ts). Vem da
  -- mensagem do build (`eas build --message "..."`, ou a mensagem do commit
  -- quando nenhuma é passada) — null é um valor normal, não um erro: sem
  -- nota o pop-up simplesmente não aparece pra essa versão.
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_new_parts integer[];
  v_old_parts integer[];
begin
  if p_version !~ '^\d+\.\d+\.\d+(?:\.\d+)?$'
     or p_apk_url !~ '^https://expo\.dev/' then
    raise exception 'Release inválida' using errcode = '22023';
  end if;

  insert into public.app_release (id, version, apk_url, apk_expires_at, notes)
  values (1, p_version, p_apk_url, p_expires_at, p_notes)
  on conflict (id) do nothing;

  select r.version into v_current
  from public.app_release r where r.id = 1
  for update;

  v_new_parts := string_to_array(p_version, '.')::integer[];
  v_old_parts := string_to_array(v_current, '.')::integer[];
  v_new_parts := v_new_parts || array_fill(0, array[4 - cardinality(v_new_parts)]);
  v_old_parts := v_old_parts || array_fill(0, array[4 - cardinality(v_old_parts)]);

  if v_new_parts <= v_old_parts then return 'older'; end if;

  update public.app_release
  set version = p_version,
      apk_url = p_apk_url,
      apk_expires_at = p_expires_at,
      notes = p_notes,
      updated_at = statement_timestamp()
  where id = 1;
  return 'updated';
end;
$$;

revoke all on function public.publicar_app_release(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.publicar_app_release(text, text, timestamptz, text) to service_role;

create or replace function public.processar_evento_kiwify(
  p_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_event_at timestamptz,
  p_order_id text,
  p_subscription_id text default null,
  p_email text default null,
  p_plan text default null,
  p_access_until timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_rows integer;
  v_access_until timestamptz;
  v_status text;
begin
  if p_event_type not in ('approved', 'renewed', 'late', 'canceled', 'refunded', 'chargeback')
     or char_length(p_event_id) not between 1 and 255
     or char_length(p_payload_hash) <> 64
     or p_event_at is null
     or coalesce(nullif(p_subscription_id, ''), nullif(p_order_id, '')) is null then
    raise exception 'Evento Kiwify inválido' using errcode = '22023';
  end if;

  insert into public.webhook_events (
    provider, event_id, event_type, payload_hash, status
  ) values (
    'kiwify', p_event_id, p_event_type, p_payload_hash, 'processing'
  ) on conflict (provider, event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    if exists (
      select 1 from public.webhook_events e
      where e.provider = 'kiwify' and e.event_id = p_event_id
        and e.payload_hash <> p_payload_hash
    ) then
      raise exception 'Evento repetido com payload divergente' using errcode = '22000';
    end if;
    return 'duplicate';
  end if;

  select * into v_subscription
  from public.subscriptions s
  where s.provider = 'kiwify'
    and (
      (p_subscription_id is not null and s.provider_subscription_id = p_subscription_id)
      or (p_order_id is not null and s.provider_order_id = p_order_id)
    )
  order by (s.provider_subscription_id = p_subscription_id) desc
  limit 1
  for update;

  if found and v_subscription.last_event_at is not null
     and p_event_at < v_subscription.last_event_at then
    update public.webhook_events
    set status = 'done', processed_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where provider = 'kiwify' and event_id = p_event_id;
    return 'outdated';
  end if;

  if not found then
    if p_event_type not in ('approved', 'renewed') or nullif(trim(p_email), '') is null then
      -- A exceção reverte também a entrada da inbox nesta transação. Se um
      -- evento de atraso/cancelamento chegou antes da aprovação, o retry do
      -- provedor poderá processá-lo depois que a assinatura existir.
      raise exception 'Assinatura ainda não encontrada' using errcode = 'P0002';
    end if;

    v_access_until := coalesce(p_access_until, p_event_at + interval '92 days');
    insert into public.subscriptions (
      provider, provider_order_id, provider_subscription_id, email_compra,
      plan, status, access_until, grace_until, activation_token,
      activation_token_hash, activation_expires_at, last_event_at,
      last_event_id, last_event_metadata, updated_at
    ) values (
      'kiwify', coalesce(nullif(p_order_id, ''), p_subscription_id),
      nullif(p_subscription_id, ''), lower(trim(p_email)), p_plan, 'active',
      v_access_until, null, null,
      encode(extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'), 'hex'),
      statement_timestamp() + interval '7 days', p_event_at, p_event_id,
      jsonb_build_object(
        'event_type', p_event_type,
        'order_id', p_order_id,
        'subscription_id', p_subscription_id
      ), statement_timestamp()
    ) returning * into v_subscription;
  else
    v_status := case p_event_type
      when 'approved' then 'active'
      when 'renewed' then 'active'
      when 'late' then 'past_due'
      when 'canceled' then 'canceled'
      when 'refunded' then 'refunded'
      when 'chargeback' then 'chargeback'
    end;

    update public.subscriptions s
    set provider_subscription_id = coalesce(s.provider_subscription_id, nullif(p_subscription_id, '')),
        email_compra = coalesce(nullif(lower(trim(p_email)), ''), s.email_compra),
        plan = coalesce(nullif(p_plan, ''), s.plan),
        status = v_status,
        access_until = case
          when p_event_type in ('approved', 'renewed')
            then greatest(s.access_until, coalesce(p_access_until, p_event_at + interval '92 days'))
          when p_event_type in ('refunded', 'chargeback') then p_event_at
          else s.access_until
        end,
        grace_until = case
          when p_event_type = 'late' then p_event_at + interval '3 days'
          when p_event_type in ('approved', 'renewed', 'refunded', 'chargeback') then null
          else s.grace_until
        end,
        last_event_at = p_event_at,
        last_event_id = p_event_id,
        last_event_metadata = jsonb_build_object(
          'event_type', p_event_type,
          'order_id', p_order_id,
          'subscription_id', p_subscription_id
        ),
        updated_at = statement_timestamp()
    where s.id = v_subscription.id;
  end if;

  update public.webhook_events
  set status = 'done', processed_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where provider = 'kiwify' and event_id = p_event_id;
  return 'processed';
end;
$$;

revoke all on function public.processar_evento_kiwify(text, text, text, timestamptz, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.processar_evento_kiwify(text, text, text, timestamptz, text, text, text, text, timestamptz) to service_role;

-- A exclusão completa passa pela Edge Function delete-account porque somente
-- a API de Storage remove também os bytes do objeto. A RPC SQL antiga não
-- consegue cumprir essa garantia e deixa de ser exposta ao app.
revoke all on function public.delete_user_account() from public, anon, authenticated;

create or replace function public.saldos_por_carteira()
returns table (wallet_id uuid, delta numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.wallet_id,
         sum(case when t.type = 'in' then t.amount else -t.amount end)::numeric as delta
  from public.transactions t
  where t.user_id = (select auth.uid())
    and coalesce(t.payment_method, '') <> 'credit'
    and t.card_id is null
  group by t.wallet_id;
$$;

revoke all on function public.saldos_por_carteira() from public, anon;
grant execute on function public.saldos_por_carteira() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Conquistas desbloqueadas, uma linha por medalha
--
-- As medalhas eram booleanos derivados do estado ATUAL: `unlocked: streak >= 30`
-- e coisas do tipo. O efeito é que elas podiam ser RETIRADAS. "Hábito
-- Inquebrável" sumia no primeiro dia perdido; "Mês Verde" sumia assim que a
-- pessoa registrava um gasto que virasse o mês; e enquanto a sequência estava
-- quebrada por um defeito de fuso, as quatro medalhas de sequência apagavam
-- todas as noites ao mesmo tempo.
--
-- Conquista que pode ser retirada não é conquista: é indicador de estado
-- vestido de conquista. A partir daqui o desbloqueio é um EVENTO, gravado uma
-- vez, e a regra em lib/gamification.ts passa a ser "está desbloqueada se a
-- condição vale agora OU se já foi conquistada algum dia".
--
-- A chave primária composta é o que torna a gravação idempotente: reavaliar as
-- medalhas a cada carregamento tenta inserir de novo e não duplica nada.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table user_achievements enable row level security;

drop policy if exists "usuário vê e grava só suas conquistas" on user_achievements;
create policy "usuário vê e grava só suas conquistas"
  on user_achievements for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists user_achievements_user_id_idx on user_achievements (user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- Acesso de cortesia: liberar contas sem cobrança
--
-- Para os primeiros testadores e para qualquer cortesia futura. É uma
-- ferramenta de ADMINISTRAÇÃO: as três funções abaixo são `security definer`,
-- têm execução revogada de `anon` e de `authenticated`, e só `service_role`
-- pode chamá-las. Na prática isso significa o editor SQL do painel do Supabase
-- ou uma chamada com a chave de serviço, nunca o app. Nenhuma pessoa logada
-- consegue se liberar sozinha, mesmo conhecendo o nome da função.
--
-- Por que uma linha em `subscriptions` e não um campo novo: o acesso do app já
-- é decidido por `usuario_tem_direito()`, que olha essa tabela. Criar um
-- segundo caminho de liberação seria uma segunda regra para o mesmo assunto, e
-- é assim que uma delas fica para trás.
--
-- `provider = 'interno'` é o que separa cortesia de venda. Toda contagem de
-- receita futura filtra por `provider = 'kiwify'` e não vê estas linhas.
--
-- Liberar quem AINDA NÃO tem conta funciona: a linha nasce com `user_id` nulo
-- e `vincular_assinatura_automatica()` a associa no primeiro login com aquele
-- e-mail. É o mesmo caminho de uma compra feita antes do cadastro.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.conceder_acesso_cortesia(
  p_email text,
  p_motivo text default null,
  -- Nulo = sem prazo. Para um teste com data para acabar, passe a data.
  p_ate timestamptz default null
)
returns table (email text, user_id uuid, access_until timestamptz, ja_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
  v_ate timestamptz := coalesce(p_ate, timestamptz '2099-12-31 23:59:59+00');
  v_pedido text;
  v_existia boolean;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido: %', p_email using errcode = '22023';
  end if;

  v_pedido := 'cortesia:' || v_email;
  select id into v_user from auth.users where lower(auth.users.email) = v_email;

  select exists (
    select 1 from public.subscriptions s where s.provider_order_id = v_pedido
  ) into v_existia;

  if v_existia then
    update public.subscriptions s
      set access_until = v_ate,
          status = 'active',
          user_id = coalesce(v_user, s.user_id),
          last_event_metadata = jsonb_build_object('cortesia', true, 'motivo', p_motivo, 'em', statement_timestamp()),
          updated_at = statement_timestamp()
      where s.provider_order_id = v_pedido;
  else
    insert into public.subscriptions
      (user_id, provider, provider_order_id, email_compra, plan, status, access_until, activated_at, last_event_metadata)
    values
      (v_user, 'interno', v_pedido, v_email, 'cortesia', 'active', v_ate,
       case when v_user is null then null else statement_timestamp() end,
       jsonb_build_object('cortesia', true, 'motivo', p_motivo, 'em', statement_timestamp()));
  end if;

  return query
    select s.email_compra, s.user_id, s.access_until, v_existia
    from public.subscriptions s
    where s.provider_order_id = v_pedido;
end;
$$;

revoke all on function public.conceder_acesso_cortesia(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.conceder_acesso_cortesia(text, text, timestamptz) to service_role;

comment on function public.conceder_acesso_cortesia(text, text, timestamptz) is
  'ADMIN. Libera uma conta sem cobranca (testadores, cortesia). Cria a linha com provider=interno, que nunca conta como venda. Funciona antes de a pessoa se cadastrar: a vinculacao acontece no primeiro login pelo e-mail.';

-- Tira a cortesia. Nunca toca em linha de venda: o filtro por 'interno' é o
-- que garante que um engano aqui não cancele a assinatura paga de alguém.
create or replace function public.revogar_acesso_cortesia(p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removidas integer;
begin
  delete from public.subscriptions s
  where s.provider = 'interno'
    and s.provider_order_id = 'cortesia:' || lower(trim(p_email));
  get diagnostics v_removidas = row_count;
  return v_removidas;
end;
$$;

revoke all on function public.revogar_acesso_cortesia(text) from public, anon, authenticated;
grant execute on function public.revogar_acesso_cortesia(text) to service_role;

comment on function public.revogar_acesso_cortesia(text) is
  'ADMIN. Remove um acesso de cortesia. So apaga linha com provider=interno, nunca uma venda.';

-- Quem está liberado hoje, e por quê.
create or replace function public.listar_acessos_cortesia()
returns table (email text, user_id uuid, motivo text, access_until timestamptz, criado_em timestamptz)
language sql
security definer
set search_path = ''
as $$
  select s.email_compra, s.user_id, s.last_event_metadata ->> 'motivo', s.access_until, s.created_at
  from public.subscriptions s
  where s.provider = 'interno'
  order by s.created_at desc;
$$;

revoke all on function public.listar_acessos_cortesia() from public, anon, authenticated;
grant execute on function public.listar_acessos_cortesia() to service_role;

comment on function public.listar_acessos_cortesia() is
  'ADMIN. Lista os acessos de cortesia ativos e o motivo de cada um.';
