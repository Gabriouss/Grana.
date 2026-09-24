-- Idempotência da fila offline (24/09/2026).
--
-- Decisão do autor: todo lançamento guardado sem rede sobe ao reconectar. Para
-- isso ser seguro, reenviar tem de ser inofensivo: um envio que chegou ao banco
-- mas cuja resposta se perdeu (queda de rede, prazo do cliente) não pode gravar
-- de novo quando a fila tentar outra vez. `transactions` e `bills` não tinham
-- chave para isso; a de `source_event_id` é do WhatsApp, global (sem usuário) e
-- mudaria o `source` das entradas manuais.
--
-- Contrato (detalhe em E:\Grana-temporarios\2026-09-24-harbor\contrato-fila-offline.md):
--   - o aparelho gera `client_request_id` (uuid v4) UMA vez, antes do primeiro
--     envio, e o guarda com o item da fila; todo reenvio usa o mesmo;
--   - insert com `on_conflict=user_id,client_request_id` e
--     `resolution=ignore-duplicates`: o reenvio vira no-op, e o cliente busca a
--     linha pela chave;
--   - APK antigo não manda a chave: NULL não colide (NULLS DISTINCT, o padrão),
--     então ele continua gravando como hoje.
--
-- O índice NÃO é parcial, pelo mesmo motivo registrado em `fitid`: o
-- PostgREST não repete o predicado no ON CONFLICT e não inferiria um índice
-- parcial. E é por usuário: uma chave de outra conta nunca silencia a sua.
--
-- NÃO APLICADA. Aplicar depende do autor (regra 11 do AGENTS.md).

alter table public.transactions add column if not exists client_request_id uuid;
alter table public.bills add column if not exists client_request_id uuid;

create unique index if not exists transactions_user_client_request_uniq
  on public.transactions (user_id, client_request_id);
create unique index if not exists bills_user_client_request_uniq
  on public.bills (user_id, client_request_id);

-- Compra parcelada: a chave fica na PRIMEIRA parcela (a cabeça da série). Um
-- reenvio com a mesma chave devolve a série que já existe, sem inserir nada.
-- A assinatura antiga (10 parâmetros) sai: com as duas no banco, o PostgREST
-- acusa ambiguidade quando o APK antigo chama sem a chave. O parâmetro novo tem
-- default NULL, então a chamada antiga continua casando com a nova.
drop function if exists public.adicionar_compra_parcelada(text, numeric, text, text, date, integer, text, text, uuid, uuid);

create or replace function public.adicionar_compra_parcelada(
  p_description text,
  p_total_amount numeric,
  p_category text,
  p_color text,
  p_occurred_on date,
  p_installments integer,
  p_payment_method text default null,
  p_bank text default null,
  p_card_id uuid default null,
  p_wallet_id uuid default null,
  p_client_request_id uuid default null
)
returns setof public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_parent uuid := gen_random_uuid();
  v_existente uuid;
  v_base numeric(12,2);
  v_last numeric(12,2);
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  -- Reenvio da fila: a série já foi gravada com esta chave.
  if p_client_request_id is not null then
    select t.id into v_existente
    from public.transactions t
    where t.user_id = v_user and t.client_request_id = p_client_request_id;
    if v_existente is not null then
      return query
      select t.*
      from public.transactions t
      where t.user_id = v_user and (t.id = v_existente or t.parent_id = v_existente)
      order by t.installment_current;
      return;
    end if;
  end if;

  if p_installments not between 2 and 120 or p_total_amount <= 0
     or p_occurred_on is null then
    raise exception 'Parcelamento inválido' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 180
     or char_length(coalesce(p_category, '')) > 60 then
    raise exception 'Texto do parcelamento excede o limite' using errcode = '22023';
  end if;

  if p_card_id is not null and not exists (
    select 1 from public.credit_cards c where c.id = p_card_id and c.user_id = v_user
  ) then
    raise exception 'Cartão não pertence ao usuário' using errcode = '23503';
  end if;
  if p_wallet_id is not null and not exists (
    select 1 from public.wallets w where w.id = p_wallet_id and w.user_id = v_user
  ) then
    raise exception 'Carteira não pertence ao usuário' using errcode = '23503';
  end if;

  v_base := round(p_total_amount / p_installments, 2);
  v_last := round(p_total_amount - v_base * (p_installments - 1), 2);

  begin
    insert into public.transactions (
      id, user_id, type, description, amount, category, color, occurred_on,
      recurring, parent_id, payment_method, bank, card_id,
      installment_current, installment_total, wallet_id, client_request_id
    )
    select
      case when serie.i = 1 then v_parent else gen_random_uuid() end,
      v_user,
      'out',
      format('%s (%s/%s)', coalesce(nullif(trim(p_description), ''), 'Compra parcelada'), serie.i, p_installments),
      case when serie.i = p_installments then v_last else v_base end,
      p_category,
      p_color,
      public.somar_meses_data(p_occurred_on, serie.i - 1),
      false,
      case when serie.i = 1 then null else v_parent end,
      p_payment_method,
      p_bank,
      p_card_id,
      serie.i,
      p_installments,
      p_wallet_id,
      case when serie.i = 1 then p_client_request_id else null end
    from generate_series(1, p_installments) as serie(i);
  exception when unique_violation then
    -- Dois envios da mesma chave ao mesmo tempo: o outro gravou primeiro.
    if p_client_request_id is null then raise; end if;
    select t.id into v_parent
    from public.transactions t
    where t.user_id = v_user and t.client_request_id = p_client_request_id;
    if v_parent is null then raise; end if;
  end;

  return query
  select t.*
  from public.transactions t
  where t.user_id = v_user and (t.id = v_parent or t.parent_id = v_parent)
  order by t.installment_current;
end;
$$;

revoke all on function public.adicionar_compra_parcelada(text, numeric, text, text, date, integer, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.adicionar_compra_parcelada(text, numeric, text, text, date, integer, text, text, uuid, uuid, uuid) to authenticated;
