-- Cakto como segundo provedor de assinatura.
--
-- O modelo de assinatura no banco ja era agnostico de provedor: a coluna
-- `provider` existe desde o inicio e a funcao de processamento recebe os
-- campos ja normalizados pelo webhook. O que prendia tudo na Kiwify eram duas
-- restricoes `check` e o nome da funcao.
--
-- Por que renomear em vez de duplicar: uma funcao chamada
-- `processar_evento_kiwify` processando evento da Cakto e o tipo de nome
-- mentiroso que custa caro seis meses depois. Um unico caminho de codigo
-- tambem garante que as duas integracoes herdem qualquer correcao de regra de
-- assinatura, em vez de divergirem em silencio.

alter table public.subscriptions drop constraint subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('kiwify', 'cakto', 'interno'));

alter table public.webhook_events drop constraint webhook_events_provider_check;
alter table public.webhook_events add constraint webhook_events_provider_check
  check (provider in ('kiwify', 'cakto', 'whatsapp', 'eas'));

create or replace function public.reivindicar_webhook_evento(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.webhook_events;
begin
  if p_provider not in ('kiwify', 'cakto', 'whatsapp', 'eas')
     or char_length(p_event_id) not between 1 and 255
     or char_length(p_payload_hash) <> 64 then
    raise exception 'Identidade de webhook inválida' using errcode = '22023';
  end if;

  insert into public.webhook_events (
    provider, event_id, event_type, payload_hash, status
  ) values (
    p_provider, p_event_id, left(p_event_type, 80), p_payload_hash, 'processing'
  ) on conflict (provider, event_id) do nothing;
  if found then return 'claimed'; end if;

  select * into v_event
  from public.webhook_events e
  where e.provider = p_provider and e.event_id = p_event_id
  for update;

  if v_event.payload_hash <> p_payload_hash then
    raise exception 'Evento repetido com payload divergente' using errcode = '22000';
  end if;
  if v_event.status = 'done' then return 'done'; end if;
  if v_event.status = 'processing'
     and v_event.processing_started_at > statement_timestamp() - interval '5 minutes' then
    return 'busy';
  end if;

  update public.webhook_events
  set status = 'processing',
      attempts = attempts + 1,
      processing_started_at = statement_timestamp(),
      last_error_code = null,
      updated_at = statement_timestamp()
  where provider = p_provider and event_id = p_event_id;
  return 'claimed';
end;
$$;

create or replace function public.processar_evento_assinatura(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_event_at timestamptz,
  p_order_id text,
  p_subscription_id text default null,
  p_email text default null,
  p_plan text default null,
  p_access_until timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
  v_rows integer;
  v_access_until timestamptz;
  v_status text;
begin
  if p_provider not in ('kiwify', 'cakto')
     or p_event_type not in ('approved', 'renewed', 'late', 'canceled', 'refunded', 'chargeback')
     or char_length(p_event_id) not between 1 and 255
     or char_length(p_payload_hash) <> 64
     or p_event_at is null
     or coalesce(nullif(p_subscription_id, ''), nullif(p_order_id, '')) is null then
    raise exception 'Evento de assinatura inválido' using errcode = '22023';
  end if;

  insert into public.webhook_events (
    provider, event_id, event_type, payload_hash, status
  ) values (
    p_provider, p_event_id, p_event_type, p_payload_hash, 'processing'
  ) on conflict (provider, event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    if exists (
      select 1 from public.webhook_events e
      where e.provider = p_provider and e.event_id = p_event_id
        and e.payload_hash <> p_payload_hash
    ) then
      raise exception 'Evento repetido com payload divergente' using errcode = '22000';
    end if;
    return 'duplicate';
  end if;

  select * into v_subscription
  from public.subscriptions s
  where s.provider = p_provider
    and (
      (p_subscription_id is not null and s.provider_subscription_id = p_subscription_id)
      or (p_order_id is not null and s.provider_order_id = p_order_id)
    )
  order by (s.provider_subscription_id = p_subscription_id) desc
  limit 1
  for update;

  if found and v_subscription.last_event_at is not null
     and p_event_at < v_subscription.last_event_at then
    update public.webhook_events
    set status = 'done', processed_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where provider = p_provider and event_id = p_event_id;
    return 'outdated';
  end if;

  if not found then
    if p_event_type not in ('approved', 'renewed') or nullif(trim(p_email), '') is null then
      -- A exceção reverte também a entrada da inbox nesta transação. Se um
      -- evento de atraso/cancelamento chegou antes da aprovação, o retry do
      -- provedor poderá processá-lo depois que a assinatura existir.
      raise exception 'Assinatura ainda não encontrada' using errcode = 'P0002';
    end if;

    v_access_until := coalesce(p_access_until, p_event_at + interval '92 days');
    insert into public.subscriptions (
      provider, provider_order_id, provider_subscription_id, email_compra,
      plan, status, access_until, grace_until, activation_token,
      activation_token_hash, activation_expires_at, last_event_at,
      last_event_id, last_event_metadata, updated_at
    ) values (
      p_provider, coalesce(nullif(p_order_id, ''), p_subscription_id),
      nullif(p_subscription_id, ''), lower(trim(p_email)), p_plan, 'active',
      v_access_until, null, null,
      encode(extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'), 'hex'),
      statement_timestamp() + interval '7 days', p_event_at, p_event_id,
      jsonb_build_object(
        'event_type', p_event_type,
        'order_id', p_order_id,
        'subscription_id', p_subscription_id
      ), statement_timestamp()
    ) returning * into v_subscription;
  else
    v_status := case p_event_type
      when 'approved' then 'active'
      when 'renewed' then 'active'
      when 'late' then 'past_due'
      when 'canceled' then 'canceled'
      when 'refunded' then 'refunded'
      when 'chargeback' then 'chargeback'
    end;

    update public.subscriptions s
    set provider_subscription_id = coalesce(s.provider_subscription_id, nullif(p_subscription_id, '')),
        email_compra = coalesce(nullif(lower(trim(p_email)), ''), s.email_compra),
        plan = coalesce(nullif(p_plan, ''), s.plan),
        status = v_status,
        access_until = case
          when p_event_type in ('approved', 'renewed')
            then greatest(s.access_until, coalesce(p_access_until, p_event_at + interval '92 days'))
          when p_event_type in ('refunded', 'chargeback') then p_event_at
          else s.access_until
        end,
        grace_until = case
          when p_event_type = 'late' then p_event_at + interval '3 days'
          when p_event_type in ('approved', 'renewed', 'refunded', 'chargeback') then null
          else s.grace_until
        end,
        last_event_at = p_event_at,
        last_event_id = p_event_id,
        last_event_metadata = jsonb_build_object(
          'event_type', p_event_type,
          'order_id', p_order_id,
          'subscription_id', p_subscription_id
        ),
        updated_at = statement_timestamp()
    where s.id = v_subscription.id;
  end if;

  update public.webhook_events
  set status = 'done', processed_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where provider = p_provider and event_id = p_event_id;
  return 'processed';
end;
$$;

revoke all on function public.processar_evento_assinatura(text, text, text, text, timestamptz, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.processar_evento_assinatura(text, text, text, text, timestamptz, text, text, text, text, timestamptz) to service_role;

-- A funcao antiga NAO e removida aqui de proposito. Ver a migration
-- 20260909171000, que so pode rodar depois que os dois webhooks estiverem
-- publicados chamando o nome novo.
