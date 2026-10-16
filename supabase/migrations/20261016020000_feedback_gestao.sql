-- Gestão administrativa dos feedbacks (Entrega 3, 16/10/2026).
--
-- NÃO APLICADA: aguarda o autor (E:/Grana-temporarios/2026-10-15-tarde/PARA-O-AUTOR-APLICAR.md).
--
-- Estado, prioridade, responsável, etiquetas e evidência de resolução ficam em TABELA
-- SEPARADA, nunca em colunas de `feedbacks`: o texto original e a anonimização do
-- `delete-account` (user_id, screenshot_url e device_info zerados) não podem ser tocados
-- por trabalho de triagem, e o metadado administrativo não carrega nada do usuário.
-- Feedback sem linha aqui é "novo" por definição; a linha nasce na primeira triagem.
--
-- Acesso: só service_role. As duas tabelas ficam com RLS ligado e SEM policy, e o acesso de
-- anon/authenticated é revogado; o admin chega pela Edge Function `admin-feedbacks`, atrás
-- do portão (allowlist ADMIN_USER_IDS, aal2 + TOTP). A escrita é a função
-- `feedback_gestao_atualizar`, que grava o estado e o histórico na MESMA transação.
--
-- O histórico guarda campo, valor anterior e novo, quem mudou e quando. Não guarda o texto
-- do feedback. Etiquetas e evidência são texto digitado por admin: não colar dado pessoal.

create table if not exists public.feedback_gestao (
  feedback_id uuid primary key references public.feedbacks(id) on delete cascade,
  estado text not null default 'novo'
    check (estado in ('novo', 'em_analise', 'planejado', 'em_execucao', 'resolvido', 'arquivado')),
  prioridade text check (prioridade in ('baixa', 'media', 'alta')),
  responsavel text check (char_length(responsavel) between 1 and 80),
  etiquetas text[] not null default '{}' check (cardinality(etiquetas) <= 8),
  evidencia text check (char_length(evidencia) between 1 and 500),
  versao_resolucao text check (char_length(versao_resolucao) between 1 and 40),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  -- Resolvido sem evidência não existe: é o que o plano chama de conclusão validada.
  constraint feedback_gestao_resolvido_com_evidencia
    check (estado <> 'resolvido' or evidencia is not null)
);

create table if not exists public.feedback_gestao_historico (
  id bigint generated always as identity primary key,
  feedback_id uuid not null references public.feedbacks(id) on delete cascade,
  campo text not null check (campo in ('estado', 'prioridade', 'responsavel', 'etiquetas', 'evidencia', 'versao_resolucao')),
  de text,
  para text,
  por uuid,
  em timestamptz not null default now()
);

create index if not exists feedback_gestao_historico_feedback_idx
  on public.feedback_gestao_historico (feedback_id, em desc);

alter table public.feedback_gestao enable row level security;
alter table public.feedback_gestao_historico enable row level security;
revoke all on public.feedback_gestao, public.feedback_gestao_historico from public, anon, authenticated;

create or replace function public.feedback_gestao_atualizar(p_id uuid, p_por uuid, p_patch jsonb)
returns public.feedback_gestao
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.feedback_gestao;
  novo public.feedback_gestao;
  existia boolean;
  chave text;
  campos text[] := array['estado', 'prioridade', 'responsavel', 'etiquetas', 'evidencia', 'versao_resolucao'];
  velho text;
  nova text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'pedido-invalido' using errcode = '22023';
  end if;
  for chave in select jsonb_object_keys(p_patch) loop
    if not (chave = any (campos)) then
      raise exception 'pedido-invalido' using errcode = '22023';
    end if;
  end loop;
  if not exists (select 1 from public.feedbacks where id = p_id) then
    raise exception 'feedback-inexistente' using errcode = 'P0002';
  end if;

  select * into atual from public.feedback_gestao where feedback_id = p_id for update;
  existia := found;
  if not existia then
    atual.feedback_id := p_id; atual.estado := 'novo'; atual.etiquetas := '{}';
  end if;
  novo := atual;

  if p_patch ? 'estado' then novo.estado := p_patch->>'estado'; end if;
  if p_patch ? 'prioridade' then novo.prioridade := p_patch->>'prioridade'; end if;
  if p_patch ? 'responsavel' then novo.responsavel := p_patch->>'responsavel'; end if;
  if p_patch ? 'evidencia' then novo.evidencia := p_patch->>'evidencia'; end if;
  if p_patch ? 'versao_resolucao' then novo.versao_resolucao := p_patch->>'versao_resolucao'; end if;
  if p_patch ? 'etiquetas' then
    if jsonb_typeof(p_patch->'etiquetas') <> 'array' then
      raise exception 'pedido-invalido' using errcode = '22023';
    end if;
    novo.etiquetas := coalesce(array(select jsonb_array_elements_text(p_patch->'etiquetas')), '{}');
  end if;
  novo.atualizado_em := now();
  novo.atualizado_por := p_por;

  insert into public.feedback_gestao
    (feedback_id, estado, prioridade, responsavel, etiquetas, evidencia, versao_resolucao, atualizado_em, atualizado_por)
  values
    (p_id, novo.estado, novo.prioridade, novo.responsavel, novo.etiquetas, novo.evidencia, novo.versao_resolucao, novo.atualizado_em, p_por)
  on conflict (feedback_id) do update set
    estado = excluded.estado, prioridade = excluded.prioridade, responsavel = excluded.responsavel,
    etiquetas = excluded.etiquetas, evidencia = excluded.evidencia, versao_resolucao = excluded.versao_resolucao,
    atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por;

  foreach chave in array campos loop
    velho := case chave
      when 'estado' then atual.estado when 'prioridade' then atual.prioridade
      when 'responsavel' then atual.responsavel when 'evidencia' then atual.evidencia
      when 'versao_resolucao' then atual.versao_resolucao
      else array_to_string(atual.etiquetas, ', ') end;
    nova := case chave
      when 'estado' then novo.estado when 'prioridade' then novo.prioridade
      when 'responsavel' then novo.responsavel when 'evidencia' then novo.evidencia
      when 'versao_resolucao' then novo.versao_resolucao
      else array_to_string(novo.etiquetas, ', ') end;
    if velho is distinct from nova and not (chave = 'etiquetas' and coalesce(velho, '') = coalesce(nova, '')) then
      insert into public.feedback_gestao_historico (feedback_id, campo, de, para, por)
      values (p_id, chave, velho, nova, p_por);
    end if;
  end loop;

  return novo;
end;
$$;

revoke all on function public.feedback_gestao_atualizar(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.feedback_gestao_atualizar(uuid, uuid, jsonb) to service_role;
