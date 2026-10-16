-- NÃO APLICADA em produção até a liberação do autor (B2, 15/10/2026).
-- Aplicar ANTES de publicar o cakto-webhook que grava aqui: na ordem inversa a
-- função só registra "livro-razão NÃO gravado" no log, sem afetar o acesso.
--
-- Livro-razão de cobrança. `subscriptions` guarda só o estado atual da
-- assinatura e `webhook_events` é expurgado em 30 dias, então hoje não dá para
-- contar receita, reembolso ou origem de venda por período. Uma linha por
-- evento do provedor, só inserida (nunca alterada), com dinheiro e origem e
-- SEM dado pessoal: nome, e-mail, telefone, documento e endereço ficam fora.
-- A ligação com a conta é por `subscription_id`, que já existe em subscriptions.
--
-- Retenção: sem expurgo automático. Não há dado pessoal na linha; o prazo de
-- guarda é decisão do autor com o Watchtower (registro fiscal pede anos).

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
  cupom text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  sck text,
  recebido_em timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists cobranca_eventos_event_at_idx on public.cobranca_eventos (event_at);
create index if not exists cobranca_eventos_subscription_idx on public.cobranca_eventos (subscription_id) where subscription_id is not null;

comment on table public.cobranca_eventos is
  'Livro-razão de cobrança (B2, 15/10/2026): um evento do provedor por linha, só inserido, sem dado pessoal. Escrito pelo cakto-webhook com service_role; lido pelo admin pelo servidor.';

-- Só o servidor: RLS ligada sem política, e nenhum privilégio para quem chega pela API.
alter table public.cobranca_eventos enable row level security;
revoke all on public.cobranca_eventos from anon, authenticated;
grant select, insert on public.cobranca_eventos to service_role;

-- Só inserção: nem o servidor altera ou apaga uma linha do livro.
create or replace function public.cobranca_eventos_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'cobranca_eventos é só inserção' using errcode = '42501';
end;
$$;

revoke execute on function public.cobranca_eventos_imutavel() from public, anon, authenticated;

drop trigger if exists cobranca_eventos_imutavel on public.cobranca_eventos;
create trigger cobranca_eventos_imutavel
  before update or delete on public.cobranca_eventos
  for each row execute function public.cobranca_eventos_imutavel();
