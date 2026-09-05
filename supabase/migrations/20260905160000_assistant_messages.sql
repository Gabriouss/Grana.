-- Migration: tabela de histórico do assistente Granabô
-- Segue o mesmo padrão de toda tabela de usuário do projeto:
-- RLS habilitado, policy de acesso exclusivo ao próprio user_id.

create table if not exists public.assistant_messages (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  papel      text        not null check (papel in ('usuario', 'assistente')),
  texto      text        not null,
  ferramenta_usada text,
  criado_em  timestamptz not null default now()
);

-- Índice para paginação do chat (últimas N mensagens do usuário)
create index if not exists idx_assistant_messages_user_criado
  on public.assistant_messages (user_id, criado_em desc);

alter table public.assistant_messages enable row level security;

create policy "usuario acessa proprio historico"
  on public.assistant_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
