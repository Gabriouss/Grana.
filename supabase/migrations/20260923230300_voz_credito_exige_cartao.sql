-- Voz, widget e Granabo: credito so com cartao (23/09/2026).
--
-- Decisao do autor em 23/09/2026: "Lancamentos no credito nunca podem ser
-- lancados sem selecionar um cartao." A RPC recusa com errcode 23514 e hint
-- 'cartao_obrigatorio'. Contrato combinado com o Forge: app, widget e Granabo
-- checam antes de enviar, e quando a recusa chega mesmo assim levam a fala
-- para revisao (escolher o cartao) e reenviam com request_id NOVO. RAISE
-- desfaz a transacao inteira, entao nada fica pendente em voice_operations.
--
-- O corpo e o de 20260923230000_voz_devolve_carteira.sql mais a recusa, e
-- nada mais (travado em __tests__/corpus-schema-guardas.ts).
--
-- APLICAR JUNTO COM O APK NOVO, NUNCA ANTES. No APK 1.10.2, a voz no app
-- (PasteReceiptModal) manda "no credito" sem cartao; com esta recusa, o envio
-- direto apaga a fala e mostra "Erro ao salvar", e uma fala que estava na fila
-- offline fica tentando para sempre (executarSincronizacao nao a remove).

create or replace function public.registrar_operacao_voz(
  p_request_id uuid,
  p_source text,
  p_kind text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_operation public.voice_operations;
  v_hash text;
  v_source_financeiro text;
  v_ids jsonb := '[]'::jsonb;
  v_id uuid;
  v_parent uuid := gen_random_uuid();
  v_type text;
  v_description text;
  v_amount numeric(12,2);
  v_category text;
  v_color text;
  v_date date;
  v_recurring boolean;
  v_payment_method text;
  v_card_id uuid;
  v_wallet_id uuid;
  v_installments integer;
  v_base numeric(12,2);
  v_last numeric(12,2);
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso nao autorizado' using errcode = '42501';
  end if;
  if p_request_id is null
     or p_source is null or p_source not in ('app', 'widget', 'assistente')
     or p_kind is null or p_kind not in ('transaction', 'installment', 'bill')
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Operacao de voz invalida' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  v_source_financeiro := 'voice-' || p_source;

  insert into public.voice_operations (id, user_id, source, kind, payload_hash)
  values (p_request_id, v_user, p_source, p_kind, v_hash)
  on conflict (id) do nothing;

  select * into v_operation
  from public.voice_operations o
  where o.id = p_request_id
  for update;

  if v_operation.user_id <> v_user
     or v_operation.source <> p_source
     or v_operation.kind <> p_kind
     or v_operation.payload_hash <> v_hash then
    raise exception 'request_id ja pertence a outra operacao' using errcode = '22023';
  end if;

  if v_operation.status in ('committed', 'undone') then
    return jsonb_build_object(
      'status', v_operation.status,
      'operation_id', v_operation.id,
      'kind', v_operation.kind,
      'ids', v_operation.result_ids,
      'replayed', true
    );
  end if;

  v_description := nullif(btrim(p_payload->>'description'), '');
  v_amount := (p_payload->>'amount')::numeric;
  v_category := nullif(btrim(p_payload->>'category'), '');
  v_color := nullif(btrim(p_payload->>'color'), '');
  v_recurring := coalesce((p_payload->>'recurring')::boolean, false);
  v_wallet_id := nullif(p_payload->>'wallet_id', '')::uuid;
  -- Sem carteira no pedido e com cartao: a carteira e a do cartao, nao a
  -- Principal. Com as duas no pedido e divergentes, a conferencia do cartao
  -- mais abaixo recusa (23503).
  if v_wallet_id is null and p_kind <> 'bill' and nullif(p_payload->>'card_id', '') is not null then
    select c.wallet_id into v_wallet_id
    from public.credit_cards c
    where c.id = nullif(p_payload->>'card_id', '')::uuid and c.user_id = v_user;
  end if;
  if v_wallet_id is null then
    select w.id into v_wallet_id
    from public.wallets w
    where w.user_id = v_user
    order by w.is_default desc, w.created_at asc
    limit 1;
  end if;
  if v_wallet_id is null or not exists (
    select 1 from public.wallets w where w.id = v_wallet_id and w.user_id = v_user
  ) then
    raise exception 'Carteira nao pertence ao usuario' using errcode = '23503';
  end if;

  if v_description is null or char_length(v_description) > 200
     or v_amount is null or v_amount <= 0 or v_amount > 999999999.99
     or v_category is null or char_length(v_category) > 60
     or v_color is null or char_length(v_color) > 9 then
    raise exception 'Dados financeiros invalidos' using errcode = '22023';
  end if;
  if p_kind = 'installment' and char_length(v_description) > 190 then
    raise exception 'Descricao longa demais para parcelamento' using errcode = '22023';
  end if;

  if p_kind = 'bill' then
    v_date := (p_payload->>'due_date')::date;
    if v_date is null then
      raise exception 'Data da conta ausente' using errcode = '22023';
    end if;
    insert into public.bills (
      id, user_id, description, amount, category, color, due_date, status,
      recurring, wallet_id, source, source_event_id
    ) values (
      v_parent, v_user, v_description, v_amount, v_category, v_color, v_date,
      'due', v_recurring, v_wallet_id, v_source_financeiro, p_request_id::text
    ) on conflict (source, source_event_id) do nothing
    returning id into v_id;

    if v_id is null then
      select b.id into v_id from public.bills b
      where b.source = v_source_financeiro
        and b.source_event_id = p_request_id::text
        and b.user_id = v_user;
    end if;
    if v_id is null then
      raise exception 'Falha ao persistir conta por voz';
    end if;
    v_ids := jsonb_build_array(v_id);
  else
    v_type := p_payload->>'type';
    v_date := (p_payload->>'occurred_on')::date;
    v_payment_method := nullif(p_payload->>'payment_method', '');
    v_card_id := nullif(p_payload->>'card_id', '')::uuid;
    v_installments := case
      when p_kind = 'installment' then (p_payload->>'installments')::integer
      else 1
    end;

    if v_type is null or v_type not in ('in', 'out')
       or v_date is null
       or (v_payment_method is not null and v_payment_method not in ('debit', 'credit', 'pix', 'cash'))
       or v_installments is null or v_installments not between 1 and 120
       or (p_kind = 'installment' and (
         v_installments < 2 or v_type <> 'out'
         or v_payment_method is distinct from 'credit' or v_card_id is null
       )) then
      raise exception 'Lancamento de voz invalido' using errcode = '22023';
    end if;
    -- Decisao do autor (23/09/2026): lancamento no credito nunca e gravado
    -- sem cartao. A hint e o contrato com o app, o widget e o Granabo: eles
    -- levam a fala para revisao (escolher o cartao) em vez de descartar.
    if v_payment_method = 'credit' and v_card_id is null then
      raise exception 'Lancamento no credito exige cartao'
        using errcode = '23514', hint = 'cartao_obrigatorio';
    end if;
    if v_card_id is not null and not exists (
      select 1 from public.credit_cards c
      where c.id = v_card_id and c.user_id = v_user
        and (c.wallet_id = v_wallet_id or c.wallet_id is null)
    ) then
      raise exception 'Cartao nao pertence a carteira escolhida' using errcode = '23503';
    end if;

    if p_kind = 'transaction' then
      insert into public.transactions (
        id, user_id, type, description, amount, category, color, occurred_on,
        recurring, card_id, wallet_id, payment_method, source, source_event_id
      ) values (
        v_parent, v_user, v_type, v_description, v_amount, v_category, v_color,
        v_date, v_recurring, v_card_id, v_wallet_id, v_payment_method,
        v_source_financeiro, p_request_id::text
      ) on conflict (source, source_event_id) do nothing
      returning id into v_id;

      if v_id is null then
        select t.id into v_id from public.transactions t
        where t.source = v_source_financeiro
          and t.source_event_id = p_request_id::text
          and t.user_id = v_user;
      end if;
      if v_id is null then
        raise exception 'Falha ao persistir lancamento por voz';
      end if;
      v_ids := jsonb_build_array(v_id);
    else
      v_base := round(v_amount / v_installments, 2);
      v_last := round(v_amount - v_base * (v_installments - 1), 2);

      with inseridas as (
        insert into public.transactions (
          id, user_id, type, description, amount, category, color, occurred_on,
          recurring, parent_id, card_id, wallet_id, payment_method, installment_current,
          installment_total, source, source_event_id
        )
        select
          case when serie.i = 1 then v_parent else gen_random_uuid() end,
          v_user,
          v_type,
          format('%s (%s/%s)', v_description, serie.i, v_installments),
          case when serie.i = v_installments then v_last else v_base end,
          v_category,
          v_color,
          public.somar_meses_data(v_date, serie.i - 1),
          false,
          case when serie.i = 1 then null else v_parent end,
          v_card_id,
          v_wallet_id,
          v_payment_method,
          serie.i,
          v_installments,
          v_source_financeiro,
          p_request_id::text || ':' || serie.i
        from generate_series(1, v_installments) as serie(i)
        on conflict (source, source_event_id) do nothing
        returning id, installment_current
      )
      select coalesce(jsonb_agg(to_jsonb(i.id) order by i.installment_current), '[]'::jsonb)
      into v_ids from inseridas i;

      if jsonb_array_length(v_ids) = 0 then
        select coalesce(jsonb_agg(to_jsonb(t.id) order by t.installment_current), '[]'::jsonb)
        into v_ids
        from public.transactions t
        where t.source = v_source_financeiro
          and t.source_event_id like p_request_id::text || ':%'
          and t.user_id = v_user;
      end if;
    end if;
  end if;

  if (p_kind = 'bill' and jsonb_array_length(v_ids) <> 1)
     or (p_kind <> 'bill' and jsonb_array_length(v_ids) <> v_installments) then
    raise exception 'Falha ao persistir operacao de voz';
  end if;

  update public.voice_operations
  set status = 'committed', result_ids = v_ids, completed_at = statement_timestamp()
  where id = p_request_id
  returning * into v_operation;

  return jsonb_build_object(
    'status', 'committed',
    'operation_id', v_operation.id,
    'kind', v_operation.kind,
    'ids', v_operation.result_ids,
    'replayed', false
  );
end;
$$;

revoke all on function public.registrar_operacao_voz(uuid, text, text, jsonb) from public, anon;
grant execute on function public.registrar_operacao_voz(uuid, text, text, jsonb) to authenticated;
