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
