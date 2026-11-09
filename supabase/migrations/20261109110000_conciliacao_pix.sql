-- Preparada para revisão; NÃO aplicada. Nenhum extrato bruto chega a esta RPC.
-- A chave é SHA-256 de usuário/carteira/origem + identidade bancária ou fingerprint.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_index i
    where i.indexrelid = pg_catalog.to_regclass('public.transactions_user_fitid_uniq')
      and i.indisunique and i.indpred is null
      and pg_catalog.pg_get_indexdef(i.indexrelid) like '% USING btree (user_id, fitid)') then
    raise exception 'Conciliação requer o índice único por usuário e fitid';
  end if;
end $$;

create or replace function public.confirmar_conciliacao_pix(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_wallet uuid := (p_item->>'wallet_id')::uuid;
  v_chave text := p_item->>'chave';
  v_operacao text := p_item->>'operacao';
  v_data date := (p_item->>'data')::date;
  v_centavos bigint := (p_item->>'centavos')::bigint;
  v_tipo text := p_item->>'direcao';
  v_alvo uuid := nullif(p_item->>'alvo_id', '')::uuid;
  v_principal uuid;
  v_atual public.transactions;
  v_id uuid;
  v_candidatos bigint;
  v_snapshot jsonb;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não confirmado' using errcode = '42501';
  end if;
  if v_chave is null or v_chave !~ '^pix1:[0-9a-f]{64}:[0-9a-f]{64}$'
    or v_operacao is null or v_operacao not in ('novo', 'data')
    or v_data is null or extract(year from v_data) not between 1000 and 9999
    or v_centavos is null or v_centavos <= 0 or v_centavos > 999999999999
    or v_tipo is null or v_tipo not in ('in','out') then
    raise exception 'Item de conciliação inválido' using errcode = '22023';
  end if;
  perform 1 from public.wallets w where w.id = v_wallet and w.user_id = v_user for share;
  if not found then raise exception 'Carteira não confirmada' using errcode = '42501'; end if;
  select w.id into v_principal from public.wallets w where w.user_id = v_user and w.is_default
    order by w.created_at, w.id limit 1;
  if v_principal is null then raise exception 'Carteira Principal não identificada' using errcode = '22023'; end if;

  -- Serializa confirmações E7 da mesma pessoa entre aparelhos; o índice também protege reenvios.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conciliacao-pix:' || v_user::text, 0));
  select * into v_atual from public.transactions t where t.user_id = v_user and t.fitid = v_chave for update;
  if found then
    if coalesce(v_atual.wallet_id, v_principal) = v_wallet and v_atual.card_id is null
      and v_atual.payment_method is distinct from 'credit' and v_atual.type = v_tipo
      and v_atual.amount * 100 = v_centavos and v_atual.occurred_on = v_data
      and (v_alvo is null or v_atual.id = v_alvo) then
      return jsonb_build_object('situacao','ja_confirmado','id',v_atual.id);
    end if;
    return jsonb_build_object('situacao','conflito');
  end if;

  select count(*) into v_candidatos from public.transactions t
    where t.user_id = v_user and coalesce(t.wallet_id, v_principal) = v_wallet
      and t.card_id is null and t.payment_method is distinct from 'credit'
      and t.type = v_tipo and t.amount * 100 = v_centavos
      and t.occurred_on between v_data - 3 and v_data + 3;
  if v_operacao = 'novo' then
    if v_alvo is not null or v_candidatos <> 0 then return jsonb_build_object('situacao','conflito'); end if;
    if length(btrim(coalesce(p_item->>'categoria',''))) not between 1 and 60
      or length(btrim(coalesce(p_item->>'descricao',''))) not between 1 and 200
      or coalesce(p_item->>'cor','') !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'Confira descrição e categoria' using errcode = '22023';
    end if;
    insert into public.transactions(user_id, wallet_id, type, description, amount, category, color,
      occurred_on, recurring, payment_method, fitid)
    values(v_user, v_wallet, v_tipo, p_item->>'descricao', v_centavos::numeric / 100,
      p_item->>'categoria', p_item->>'cor', v_data, false,
      case when lower(p_item->>'descricao') ~ '\mpix\M' then 'pix' else null end, v_chave)
    returning id into v_id;
    return jsonb_build_object('situacao','inserido','id',v_id);
  end if;

  if v_alvo is null or v_candidatos <> 1 then return jsonb_build_object('situacao','conflito'); end if;
  select * into v_atual from public.transactions t where t.id = v_alvo and t.user_id = v_user for update;
  if not found or coalesce(v_atual.wallet_id, v_principal) <> v_wallet or v_atual.card_id is not null
    or v_atual.payment_method = 'credit' or v_atual.type <> v_tipo or v_atual.amount * 100 <> v_centavos
    or abs(v_atual.occurred_on - v_data) > 3 or v_atual.fitid is not null then
    return jsonb_build_object('situacao','conflito');
  end if;
  v_snapshot := jsonb_build_object('occurred_on',v_atual.occurred_on,'amount',v_atual.amount,'type',v_atual.type,
    'description',v_atual.description,'category',v_atual.category,'color',v_atual.color,'wallet_id',v_atual.wallet_id,
    'card_id',v_atual.card_id,'payment_method',v_atual.payment_method,'fitid',v_atual.fitid,
    'recurring',v_atual.recurring,'parent_id',v_atual.parent_id,
    'installment_current',v_atual.installment_current,'installment_total',v_atual.installment_total);
  if p_item->'esperado' is distinct from v_snapshot then return jsonb_build_object('situacao','conflito'); end if;
  update public.transactions set occurred_on = v_data, fitid = v_chave
    where id = v_alvo and user_id = v_user;
  return jsonb_build_object('situacao','corrigido','id',v_alvo);
end;
$$;
revoke all on function public.confirmar_conciliacao_pix(jsonb) from public, anon;
grant execute on function public.confirmar_conciliacao_pix(jsonb) to authenticated;
