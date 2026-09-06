-- Migration: memória de aprendizado do Granabô
--
-- Guarda três tipos de coisa aprendida com o próprio uso, sem treinar
-- modelo nenhum (fine-tuning é pago, fora do requisito de custo zero):
--   'vocabulario' — apelido que o usuário usou -> nome real (categoria,
--     cartão ou carteira), pra acertar direto na próxima vez.
--   'exemplo'     — pergunta que já foi respondida com sucesso -> qual
--     ferramenta e argumentos resolveram ela, pra servir de few-shot em
--     perguntas parecidas no futuro.
--   'fato'        — algo que o usuário AFIRMOU sobre a própria vida
--     financeira (nunca uma dedução do modelo), pra não precisar repetir.
--
-- Mesmo padrão de RLS de assistant_messages: cada usuário só acessa a
-- própria memória.

create extension if not exists pg_trgm;

create table if not exists public.assistant_memory (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  tipo          text        not null check (tipo in ('vocabulario', 'fato', 'exemplo')),
  chave         text        not null,
  valor         text        not null,
  usos          integer     not null default 1,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (user_id, tipo, chave)
);

create index if not exists idx_assistant_memory_user_tipo
  on public.assistant_memory (user_id, tipo);

-- Índice trigram: acha exemplos de pergunta PARECIDOS por similaridade de
-- texto (tipo='exemplo'), sem precisar de embeddings — disponível no
-- plano Free do Supabase, ao contrário de busca vetorial.
create index if not exists idx_assistant_memory_chave_trgm
  on public.assistant_memory using gin (chave gin_trgm_ops);

alter table public.assistant_memory enable row level security;

create policy "usuario acessa propria memoria"
  on public.assistant_memory
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Busca os exemplos (tipo='exemplo') mais parecidos com a pergunta atual,
-- por similaridade de trigrama. `security invoker` (não definer): a função
-- roda com o papel de quem chama — o mesmo cliente autenticado do usuário
-- já usado no resto da Edge Function — então a policy de RLS acima
-- continua valendo como segunda camada, mesmo com o filtro explícito de
-- user_id abaixo.
create or replace function public.buscar_exemplos_similares(
  p_user_id uuid,
  p_pergunta text,
  p_limite integer default 5
)
returns table (chave text, valor text, usos integer, similaridade real)
language sql
stable
security invoker
set search_path = public
as $$
  select am.chave, am.valor, am.usos, similarity(am.chave, p_pergunta) as similaridade
  from assistant_memory am
  where am.user_id = p_user_id
    and am.tipo = 'exemplo'
    and similarity(am.chave, p_pergunta) > 0.2
  order by similaridade desc
  limit greatest(1, least(p_limite, 20));
$$;

-- Grava (ou reforça) uma entrada de memória. `on conflict` incrementa
-- `usos` em vez de zerar — supabase-js não expõe incremento condicional
-- no `.upsert()` fluente, por isso a função. Cobre 'exemplo' (aprender com
-- os próprios acertos), 'vocabulario' (apelido -> nome real) e 'fato'
-- (o que o usuário contou sobre si) com a mesma rotina.
create or replace function public.registrar_memoria_assistente(
  p_user_id uuid,
  p_tipo text,
  p_chave text,
  p_valor text
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into assistant_memory (user_id, tipo, chave, valor, usos, atualizado_em)
  values (p_user_id, p_tipo, p_chave, p_valor, 1, now())
  on conflict (user_id, tipo, chave)
  do update set valor = excluded.valor, usos = assistant_memory.usos + 1, atualizado_em = now();
$$;
