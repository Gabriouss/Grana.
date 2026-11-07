-- Denúncia de resposta do Granabô (política da Play para IA generativa).
-- NÃO aplicada: executar só pelo roteiro de implantação autorizado pelo autor.
-- Guarda apenas a resposta denunciada, o motivo e um comentário opcional.
create table if not exists public.assistant_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mensagem_id uuid,
  motivo text not null check (motivo in ('incorreta','improprio','dado_indevido','outro')),
  comentario text check (comentario is null or char_length(comentario) <= 300),
  texto_resposta text not null check (char_length(texto_resposta) between 1 and 8000),
  criado_em timestamptz not null default now()
);

create index if not exists idx_assistant_reports_user_criado
  on public.assistant_reports (user_id, criado_em desc);

alter table public.assistant_reports enable row level security;

revoke all on public.assistant_reports from public, anon, authenticated;
grant select, insert on public.assistant_reports to authenticated;
grant select, insert, update, delete on public.assistant_reports to service_role;

create policy "usuario insere propria denuncia"
  on public.assistant_reports
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "usuario le proprias denuncias"
  on public.assistant_reports
  for select to authenticated
  using (auth.uid() = user_id);
