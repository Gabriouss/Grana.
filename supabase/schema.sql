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

create index if not exists bills_user_id_due_date_idx
  on bills (user_id, due_date);

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

