-- NÃO APLICADA em produção até a liberação do autor (B2, 15/10/2026).
-- Aplicar ANTES de publicar o cakto-webhook que grava aqui: na ordem inversa a
-- função só registra "livro-razão NÃO gravado" no log, sem afetar o acesso.
--
-- Livro-razão de cobrança. `subscriptions` guarda só o estado atual da
-- assinatura e `webhook_events` é expurgado em 30 dias, então hoje não dá para
-- contar receita ou reembolso por período. Uma linha por evento do provedor,
-- só inserida, com os valores do pagamento.
--
-- Classes de dado (revisão do Watchtower, 16/10/2026, item 4):
-- - Valores, datas, método, parcelas, oferta e produto: registro financeiro.
--   Finalidade: conciliação de receita e obrigações fiscais e contábeis.
-- - `order_id`, `parent_order_id` e `subscription_id`: PSEUDONIMIZADOS, não
--   anônimos. Ligam a venda a `subscriptions`, que liga à pessoa. Servem à
--   idempotência e à conciliação com o provedor, e saem por
--   `anonimizar_cobranca_eventos` na exclusão da conta (delete-account) ou a
--   pedido, deixando só valores e datas (`anonimizado_em` registra quando).
-- - Atribuição de marketing (cupom, UTM, sck): NÃO é guardada. São campos de
--   texto livre que podem conter dado pessoal; voltam só com um contrato de
--   minimização aprovado (códigos de campanha controlados pelo servidor).
-- Nome, e-mail, telefone, documento e endereço continuam fora.
--
-- Retenção: o prazo de guarda do registro financeiro é decisão PENDENTE do
-- autor com o contador (obrigação fiscal); não há expurgo automático até lá.
-- O vínculo com a pessoa não depende desse prazo: sai na exclusão da conta.

create table if not exists public.cobranca_eventos (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('cakto', 'kiwify')),
  event_id text not null check (char_length(event_id) between 1 and 255),
  event_type text not null check (event_type in ('approved', 'renewed', 'late', 'canceled', 'refunded', 'chargeback')),
  event_at timestamptz not null,
  order_id text,
  parent_order_id text,
  subscription_id text,
  primeira_compra boolean not null default false,
  valor_bruto numeric(12, 2),
  desconto numeric(12, 2),
  taxas numeric(12, 2),
  valor numeric(12, 2),
  moeda text not null default 'BRL' check (char_length(moeda) = 3),
  metodo_pagamento text,
  parcelas smallint check (parcelas between 1 and 24),
  oferta_id text,
  produto_id text,
  recebido_em timestamptz not null default now(),
  anonimizado_em timestamptz,
  unique (provider, event_id)
);

create index if not exists cobranca_eventos_event_at_idx on public.cobranca_eventos (event_at);
create index if not exists cobranca_eventos_subscription_idx on public.cobranca_eventos (subscription_id) where subscription_id is not null;

comment on table public.cobranca_eventos is
  'Livro-razão de cobrança (B2, 15/10/2026): um evento do provedor por linha, só inserido. IDs de pedido e assinatura são pseudonimizados e saem em anonimizar_cobranca_eventos; sem atribuição de marketing. Escrito pelo cakto-webhook com service_role; lido pelo admin pelo servidor.';

-- Só o servidor: RLS ligada sem política, e nenhum privilégio para quem chega pela API.
alter table public.cobranca_eventos enable row level security;
revoke all on public.cobranca_eventos from anon, authenticated;
grant select, insert on public.cobranca_eventos to service_role;

-- Só inserção: nem o servidor altera ou apaga uma linha do livro. A única
-- alteração aceita é a anonimização: os três IDs viram nulo, `anonimizado_em`
-- é preenchido uma vez, e todo o resto (valores, datas) fica idêntico.
create or replace function public.cobranca_eventos_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.anonimizado_em is null and new.anonimizado_em is not null
     and new.order_id is null and new.parent_order_id is null and new.subscription_id is null
     and (to_jsonb(new) - array['order_id', 'parent_order_id', 'subscription_id', 'anonimizado_em'])
       = (to_jsonb(old) - array['order_id', 'parent_order_id', 'subscription_id', 'anonimizado_em']) then
    return new;
  end if;
  raise exception 'cobranca_eventos é só inserção' using errcode = '42501';
end;
$$;

revoke execute on function public.cobranca_eventos_imutavel() from public, anon, authenticated;

drop trigger if exists cobranca_eventos_imutavel on public.cobranca_eventos;
create trigger cobranca_eventos_imutavel
  before update or delete on public.cobranca_eventos
  for each row execute function public.cobranca_eventos_imutavel();

-- Caminho restrito e auditável para tirar o vínculo com a pessoa: só o
-- servidor chama (delete-account, ou o admin a pedido), devolve quantas linhas
-- anonimizou e deixa `anonimizado_em` na linha. service_role não ganha UPDATE
-- na tabela; a alteração passa só por aqui.
create or replace function public.anonimizar_cobranca_eventos(p_subscription_ids text[], p_order_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.cobranca_eventos
     set order_id = null, parent_order_id = null, subscription_id = null, anonimizado_em = now()
   where anonimizado_em is null
     and (subscription_id = any(coalesce(p_subscription_ids, '{}'::text[]))
          or order_id = any(coalesce(p_order_ids, '{}'::text[]))
          or parent_order_id = any(coalesce(p_order_ids, '{}'::text[])));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.anonimizar_cobranca_eventos(text[], text[]) from public, anon, authenticated;
grant execute on function public.anonimizar_cobranca_eventos(text[], text[]) to service_role;
