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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "usuário vê e edita só suas contas" on bills;
create policy "usuário vê e edita só suas contas"
  on bills for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "usuário vê e edita só seus orçamentos" on budgets;
create policy "usuário vê e edita só seus orçamentos"
  on budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "usuário vê e edita só suas categorias" on categories;
create policy "usuário vê e edita só suas categorias"
  on categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

