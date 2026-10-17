-- NÃO APLICADA em produção até a liberação do autor (B2, 15/10/2026).
-- Aplicar ANTES de publicar o cakto-webhook que grava aqui: na ordem inversa a
-- função só registra "livro-razão NÃO gravado" no log, sem afetar o acesso.
-- Aplicar também ANTES de publicar o delete-account que chama
-- `encerrar_vinculo_cobranca`: sem a função, a exclusão falha fechada
-- (deletion_failed) em vez de prometer uma anonimização que não aconteceu.
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
--   `encerrar_vinculo_cobranca` na exclusão da conta (delete-account) ou por
--   `anonimizar_cobranca_eventos` a pedido, deixando só valores e datas
--   (`anonimizado_em` registra quando).
--   O `event_id` também embute o código do pedido e sai junto: vira
--   `anonimizado:<id da linha>`, sem hash nem outra forma do código original.
--   Linha anonimizada não serve mais para conciliar com o provedor.
-- - Reenvio e evento tardio: o webhook só grava evento que a assinatura
--   aceitou como NOVO (`processar_evento_assinatura` devolve 'duplicate' para
--   o já visto, pela `webhook_events`, que guarda 30 dias). Reenvio do mesmo
--   evento não recria a linha. Evento novo depois da exclusão (reembolso,
--   contestação) é um tratamento novo: o webhook recria a assinatura com o
--   e-mail da compra, e o livro grava a linha dele com vínculo, como qualquer
--   venda. Passados os 30 dias, o reenvio do mesmo evento também é tratado
--   como novo pelo sistema inteiro, não só pelo livro.
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
  'Livro-razão de cobrança (B2, 15/10/2026): um evento do provedor por linha, só inserido. IDs de pedido e assinatura são pseudonimizados e saem na exclusão da conta (encerrar_vinculo_cobranca); sem atribuição de marketing. Gravado só por registrar_cobranca_evento (cakto-webhook); lido pelo admin pelo servidor.';

-- Só o servidor, e só leitura direta (B2-2, revisão do Watchtower de
-- 17/10/2026). GRANT não tira o que já veio herdado: o default ACL do Supabase
-- dá ALL em tabela e sequência nova a service_role (e, conforme o projeto, a
-- anon e authenticated), e com isso UPDATE, DELETE e TRUNCATE continuavam
-- valendo por cima do gatilho. Por isso revoga TUDO de todos os papéis da API
-- antes de conceder o mínimo. A gravação passa só por
-- `registrar_cobranca_evento` e a anonimização só pelas duas funções abaixo;
-- nenhum papel da API tem INSERT, UPDATE, DELETE ou TRUNCATE na tabela.
alter table public.cobranca_eventos enable row level security;
revoke all on table public.cobranca_eventos from public, anon, authenticated, service_role;
grant select on table public.cobranca_eventos to service_role;
do $$
begin
  execute format('revoke all on sequence %s from public, anon, authenticated, service_role',
    pg_get_serial_sequence('public.cobranca_eventos', 'id'));
end;
$$;

-- Marca, na assinatura, que o vínculo com o livro foi encerrado pela exclusão
-- da conta. Vale na janela entre a anonimização e o fim da exclusão: evento que
-- chegar nesse meio é gravado já anonimizado (ver `registrar_cobranca_evento`).
-- Se a exclusão falhar depois, a marca fica: os eventos seguintes dessa
-- assinatura entram sem vínculo, o lado seguro para a pessoa.
alter table public.subscriptions add column if not exists cobranca_vinculo_encerrado_em timestamptz;

-- Só inserção: nem o servidor altera ou apaga uma linha do livro. A única
-- alteração aceita é a anonimização: os três IDs viram nulo, o `event_id`
-- (que embute o código do pedido, ex. `purchase_approved:<pedido>`) vira
-- `anonimizado:<id da linha>`, `anonimizado_em` é preenchido uma vez, e todo o
-- resto (valores, tipo, datas) fica idêntico.
create or replace function public.cobranca_eventos_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'cobranca_eventos é só inserção' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and old.anonimizado_em is null and new.anonimizado_em is not null
     and new.order_id is null and new.parent_order_id is null and new.subscription_id is null
     and new.event_id = 'anonimizado:' || old.id::text
     and (to_jsonb(new) - array['order_id', 'parent_order_id', 'subscription_id', 'event_id', 'anonimizado_em'])
       = (to_jsonb(old) - array['order_id', 'parent_order_id', 'subscription_id', 'event_id', 'anonimizado_em']) then
    return new;
  end if;
  raise exception 'cobranca_eventos é só inserção' using errcode = '42501';
end;
$$;

revoke execute on function public.cobranca_eventos_imutavel() from public, anon, authenticated, service_role;

drop trigger if exists cobranca_eventos_imutavel on public.cobranca_eventos;
create trigger cobranca_eventos_imutavel
  before update or delete on public.cobranca_eventos
  for each row execute function public.cobranca_eventos_imutavel();
-- TRUNCATE não dispara gatilho de linha: sem este, o dono apagava o livro inteiro.
drop trigger if exists cobranca_eventos_sem_truncate on public.cobranca_eventos;
create trigger cobranca_eventos_sem_truncate
  before truncate on public.cobranca_eventos
  for each statement execute function public.cobranca_eventos_imutavel();

/* Gravação do livro e exclusão da conta coordenadas NO BANCO (B2-1, revisão do
   Watchtower de 17/10/2026). Antes, o webhook confirmava a assinatura e só
   depois mandava outro pedido HTTP para inserir a linha; a exclusão podia
   rodar inteira no meio, anonimizar zero linhas, apagar a conta e responder
   200, e a inserção atrasada gravava os IDs com vínculo. Agora as duas pontas
   passam por funções que tomam a MESMA trava de transação:

   - `registrar_cobranca_evento` (webhook), sob a trava, só guarda os IDs se a
     assinatura correspondente ainda existe e não teve o vínculo encerrado.
     Sem isso (a conta já foi excluída, e a cascata levou a assinatura; ou a
     exclusão está em curso e já marcou), a linha nasce anonimizada.
   - `encerrar_vinculo_cobranca` (delete-account), sob a trava, marca as
     assinaturas da pessoa e anonimiza o que já existe.

   Quem chega primeiro decide a ordem, e qualquer ordem termina sem IDs depois
   de a exclusão concluir. A trava é uma só para a tabela inteira: o volume é
   de um evento de pagamento por vez, e a transação é curta. */
create or replace function public.registrar_cobranca_evento(p_linha jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cobranca_eventos;
  v_vinculo boolean;
  v_id bigint;
begin
  v := jsonb_populate_record(null::public.cobranca_eventos, p_linha);
  perform pg_advisory_xact_lock(hashtext('public.cobranca_eventos:vinculo'));

  v_vinculo := exists (
    select 1 from public.subscriptions s
     where s.provider = v.provider
       and s.cobranca_vinculo_encerrado_em is null
       and ((v.subscription_id is not null and s.provider_subscription_id = v.subscription_id)
            or s.provider_order_id = v.order_id
            or s.provider_order_id = v.parent_order_id)
  );

  insert into public.cobranca_eventos (
    provider, event_id, event_type, event_at, order_id, parent_order_id, subscription_id,
    primeira_compra, valor_bruto, desconto, taxas, valor, moeda, metodo_pagamento,
    parcelas, oferta_id, produto_id
  ) values (
    v.provider, v.event_id, v.event_type, v.event_at,
    case when v_vinculo then v.order_id end,
    case when v_vinculo then v.parent_order_id end,
    case when v_vinculo then v.subscription_id end,
    coalesce(v.primeira_compra, false), v.valor_bruto, v.desconto, v.taxas, v.valor,
    coalesce(v.moeda, 'BRL'), v.metodo_pagamento, v.parcelas, v.oferta_id, v.produto_id
  )
  on conflict (provider, event_id) do nothing
  returning id into v_id;

  if v_id is null then return 'duplicado'; end if;
  if v_vinculo then return 'gravado'; end if;
  -- Na mesma transação: o `event_id` com o código do pedido nunca chega a valer fora dela.
  update public.cobranca_eventos
     set event_id = 'anonimizado:' || id::text, anonimizado_em = now()
   where id = v_id;
  return 'anonimizado';
end;
$$;

revoke execute on function public.registrar_cobranca_evento(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_cobranca_evento(jsonb) to service_role;

create or replace function public.encerrar_vinculo_cobranca(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_user_id is null then
    raise exception 'Conta não informada' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.cobranca_eventos:vinculo'));

  update public.subscriptions
     set cobranca_vinculo_encerrado_em = coalesce(cobranca_vinculo_encerrado_em, now())
   where user_id = p_user_id;

  update public.cobranca_eventos e
     set order_id = null, parent_order_id = null, subscription_id = null,
         event_id = 'anonimizado:' || e.id::text, anonimizado_em = now()
   where e.anonimizado_em is null
     and exists (
       select 1 from public.subscriptions s
        where s.user_id = p_user_id
          and s.provider = e.provider
          and (e.subscription_id = s.provider_subscription_id
               or e.order_id = s.provider_order_id
               or e.parent_order_id = s.provider_order_id)
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.encerrar_vinculo_cobranca(uuid) from public, anon, authenticated;
grant execute on function public.encerrar_vinculo_cobranca(uuid) to service_role;

-- Caminho restrito e auditável para tirar o vínculo a pedido (admin), pelos
-- IDs: devolve quantas linhas anonimizou e deixa `anonimizado_em` na linha.
-- Usa a mesma trava das funções acima.
create or replace function public.anonimizar_cobranca_eventos(p_subscription_ids text[], p_order_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.cobranca_eventos:vinculo'));
  update public.cobranca_eventos
     set order_id = null, parent_order_id = null, subscription_id = null,
         event_id = 'anonimizado:' || id::text, anonimizado_em = now()
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
