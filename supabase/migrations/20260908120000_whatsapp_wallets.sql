-- WhatsApp precisa preservar a carteira escolhida enquanto pergunta a
-- categoria e gravar a mesma carteira em transações, parcelas e boletos.
alter table public.whatsapp_pending
  add column if not exists wallet_id uuid references public.wallets(id) on delete set null;

create index if not exists whatsapp_pending_wallet_id_idx
  on public.whatsapp_pending (wallet_id)
  where wallet_id is not null;

drop function if exists public.registrar_lancamento_whatsapp(
  uuid, text, text, text, text, numeric, text, text, date, uuid, text, integer, boolean
);

create or replace function public.registrar_lancamento_whatsapp(
  p_user_id uuid,
  p_phone text,
  p_event_id text,
  p_type text,
  p_description text,
  p_amount numeric,
  p_category text,
  p_color text,
  p_occurred_on date,
  p_card_id uuid default null,
  p_payment_method text default null,
  p_installments integer default null,
  p_recurring boolean default false,
  p_wallet_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_parent uuid := gen_random_uuid();
  v_wallet_id uuid := p_wallet_id;
  v_base numeric(12,2);
  v_last numeric(12,2);
  v_installments integer := coalesce(p_installments, 1);
begin
  if p_type not in ('in', 'out') or p_amount <= 0
     or char_length(p_event_id) not between 1 and 255
     or v_installments not between 1 and 120 then
    raise exception 'Lançamento inválido' using errcode = '22023';
  end if;
  if not public.usuario_tem_direito(p_user_id) then
    raise exception 'Assinatura sem acesso' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.whatsapp_links l
    where l.user_id = p_user_id and l.phone = p_phone and l.verified
  ) then
    raise exception 'Vínculo do WhatsApp inválido' using errcode = '42501';
  end if;

  if v_wallet_id is null then
    select w.id into v_wallet_id
    from public.wallets w
    where w.user_id = p_user_id
    order by w.is_default desc, w.created_at asc
    limit 1;
  end if;
  if v_wallet_id is null or not exists (
    select 1 from public.wallets w where w.id = v_wallet_id and w.user_id = p_user_id
  ) then
    raise exception 'Carteira não pertence ao usuário' using errcode = '23503';
  end if;
  if p_card_id is not null and not exists (
    select 1 from public.credit_cards c
    where c.id = p_card_id and c.user_id = p_user_id
      and (c.wallet_id is null or c.wallet_id = v_wallet_id)
  ) then
    raise exception 'Cartão não pertence à carteira escolhida' using errcode = '23503';
  end if;

  select t.id into v_existing
  from public.transactions t
  where t.source = 'whatsapp'
    and t.source_event_id = case when v_installments > 1 then p_event_id || ':1' else p_event_id end;
  if found then return v_existing; end if;

  if v_installments = 1 then
    insert into public.transactions (
      id, user_id, type, description, amount, category, color, occurred_on,
      recurring, card_id, wallet_id, payment_method, source, source_event_id
    ) values (
      v_parent, p_user_id, p_type, p_description, p_amount, p_category,
      p_color, p_occurred_on, p_recurring, p_card_id, v_wallet_id, p_payment_method,
      'whatsapp', p_event_id
    ) on conflict (source, source_event_id) do nothing;
  else
    v_base := round(p_amount / v_installments, 2);
    v_last := round(p_amount - v_base * (v_installments - 1), 2);
    insert into public.transactions (
      id, user_id, type, description, amount, category, color, occurred_on,
      recurring, parent_id, card_id, wallet_id, payment_method, installment_current,
      installment_total, source, source_event_id
    )
    select
      case when serie.i = 1 then v_parent else gen_random_uuid() end,
      p_user_id,
      p_type,
      format('%s (%s/%s)', p_description, serie.i, v_installments),
      case when serie.i = v_installments then v_last else v_base end,
      p_category,
      p_color,
      public.somar_meses_data(p_occurred_on, serie.i - 1),
      false,
      case when serie.i = 1 then null else v_parent end,
      p_card_id,
      v_wallet_id,
      p_payment_method,
      serie.i,
      v_installments,
      'whatsapp',
      p_event_id || ':' || serie.i
    from generate_series(1, v_installments) as serie(i)
    on conflict (source, source_event_id) do nothing;
  end if;

  select t.id into v_existing
  from public.transactions t
  where t.source = 'whatsapp'
    and t.source_event_id = case when v_installments > 1 then p_event_id || ':1' else p_event_id end;
  if v_existing is null then
    raise exception 'Falha ao persistir lançamento';
  end if;

  update public.whatsapp_links
  set last_entry_kind = 'transaction', last_entry_id = v_existing,
      last_entry_at = statement_timestamp(), updated_at = statement_timestamp()
  where user_id = p_user_id and phone = p_phone and verified;
  delete from public.whatsapp_pending where user_id = p_user_id and phone = p_phone;
  return v_existing;
end;
$$;

revoke all on function public.registrar_lancamento_whatsapp(
  uuid, text, text, text, text, numeric, text, text, date, uuid, text, integer, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.registrar_lancamento_whatsapp(
  uuid, text, text, text, text, numeric, text, text, date, uuid, text, integer, boolean, uuid
) to service_role;

drop function if exists public.registrar_boleto_whatsapp(
  uuid, text, text, text, numeric, text, text, date, boolean
);

create or replace function public.registrar_boleto_whatsapp(
  p_user_id uuid,
  p_phone text,
  p_event_id text,
  p_description text,
  p_amount numeric,
  p_category text,
  p_color text,
  p_due_date date,
  p_recurring boolean default false,
  p_wallet_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_wallet_id uuid := p_wallet_id;
begin
  if p_amount <= 0 or char_length(p_event_id) not between 1 and 255 then
    raise exception 'Boleto inválido' using errcode = '22023';
  end if;
  if not public.usuario_tem_direito(p_user_id) then
    raise exception 'Assinatura sem acesso' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.whatsapp_links l
    where l.user_id = p_user_id and l.phone = p_phone and l.verified
  ) then
    raise exception 'Vínculo do WhatsApp inválido' using errcode = '42501';
  end if;
  if v_wallet_id is null then
    select w.id into v_wallet_id
    from public.wallets w
    where w.user_id = p_user_id
    order by w.is_default desc, w.created_at asc
    limit 1;
  end if;
  if v_wallet_id is null or not exists (
    select 1 from public.wallets w where w.id = v_wallet_id and w.user_id = p_user_id
  ) then
    raise exception 'Carteira não pertence ao usuário' using errcode = '23503';
  end if;

  insert into public.bills (
    user_id, description, amount, category, color, due_date, status,
    recurring, wallet_id, source, source_event_id
  ) values (
    p_user_id, p_description, p_amount, p_category, p_color, p_due_date,
    'due', p_recurring, v_wallet_id, 'whatsapp', p_event_id
  ) on conflict (source, source_event_id) do nothing
  returning id into v_id;

  if v_id is null then
    select b.id into v_id from public.bills b
    where b.source = 'whatsapp' and b.source_event_id = p_event_id;
  end if;

  update public.whatsapp_links
  set last_entry_kind = 'bill', last_entry_id = v_id,
      last_entry_at = statement_timestamp(), updated_at = statement_timestamp()
  where user_id = p_user_id and phone = p_phone and verified;
  return v_id;
end;
$$;

revoke all on function public.registrar_boleto_whatsapp(
  uuid, text, text, text, numeric, text, text, date, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.registrar_boleto_whatsapp(
  uuid, text, text, text, numeric, text, text, date, boolean, uuid
) to service_role;
