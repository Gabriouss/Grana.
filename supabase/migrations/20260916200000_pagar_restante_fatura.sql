-- Fatura paga em parte: pagar o que falta (16/09/2026).
--
-- `pagar_fatura_cartao` grava UM pagamento por fatura e, se já existe um,
-- devolve o existente sem gravar nada — é a proteção contra toque duplo. Quem
-- pagava a fatura antes do fechamento e depois comprava mais no mesmo ciclo
-- ficava sem ter como quitar o resto, e a tela de Crédito ainda dizia
-- "Paga ✓" com qualquer pagamento.
--
-- O restante vira uma saída PRÓPRIA (com a data e a carteira de quando foi
-- pago), somada ao valor do registro da fatura e lembrada em
-- `extra_transaction_ids`, para o `reabrir_fatura_cartao` desfazer tudo junto.
-- Juntar numa saída só mudaria a data de um dos pagamentos e mentiria no saldo
-- entre as duas datas.
--
-- Aditiva: o app anterior ignora a coluna nova, e o desfazer continua
-- funcionando para quem pagou uma vez só.

alter table public.credit_card_invoices
  add column if not exists extra_transaction_ids uuid[] not null default '{}';

create or replace function public.pagar_restante_fatura_cartao(
  p_invoice_id uuid,
  p_valor_ja_pago numeric,
  p_amount numeric,
  p_paid_on date,
  p_wallet_id uuid default null
)
returns public.credit_card_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invoice public.credit_card_invoices;
  v_card public.credit_cards;
  v_tx_id uuid;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_paid_on is null or p_valor_ja_pago is null then
    raise exception 'Dados de pagamento inválidos' using errcode = '22023';
  end if;

  select * into v_invoice
  from public.credit_card_invoices i
  where i.id = p_invoice_id and i.user_id = v_user
  for update;
  if not found then
    raise exception 'Fatura não encontrada' using errcode = 'P0002';
  end if;

  -- Toque duplo: o segundo pedido chega com o valor pago que a tela viu
  -- ANTES do primeiro, e não soma outra vez.
  if v_invoice.amount <> p_valor_ja_pago then
    return v_invoice;
  end if;

  select * into v_card
  from public.credit_cards c
  where c.id = v_invoice.card_id and c.user_id = v_user;
  if not found then
    raise exception 'Cartão não encontrado' using errcode = 'P0002';
  end if;

  if p_wallet_id is not null and not exists (
    select 1 from public.wallets w where w.id = p_wallet_id and w.user_id = v_user
  ) then
    raise exception 'Carteira não pertence ao usuário' using errcode = '23503';
  end if;

  insert into public.transactions (
    user_id, type, description, amount, category, color, occurred_on, wallet_id
  ) values (
    v_user,
    'out',
    format('Pagamento fatura — %s (%s/%s) — restante', v_card.name,
      lpad((v_invoice.month + 1)::text, 2, '0'), v_invoice.year),
    p_amount,
    'Cartão de crédito',
    v_card.color,
    p_paid_on,
    p_wallet_id
  ) returning id into v_tx_id;

  update public.credit_card_invoices
  set amount = amount + p_amount,
      extra_transaction_ids = array_append(extra_transaction_ids, v_tx_id)
  where id = v_invoice.id and user_id = v_user
  returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke all on function public.pagar_restante_fatura_cartao(uuid, numeric, numeric, date, uuid) from public, anon;
grant execute on function public.pagar_restante_fatura_cartao(uuid, numeric, numeric, date, uuid) to authenticated;

-- Desfazer o pagamento apaga também as saídas do restante.
create or replace function public.reabrir_fatura_cartao(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invoice public.credit_card_invoices;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  select * into v_invoice
  from public.credit_card_invoices i
  where i.id = p_invoice_id and i.user_id = v_user
  for update;
  if not found then
    raise exception 'Fatura não encontrada' using errcode = 'P0002';
  end if;

  delete from public.credit_card_invoices
  where id = v_invoice.id and user_id = v_user;
  delete from public.transactions
  where user_id = v_user
    and (id = v_invoice.paid_transaction_id or id = any(v_invoice.extra_transaction_ids));
end;
$$;

revoke all on function public.reabrir_fatura_cartao(uuid) from public, anon;
grant execute on function public.reabrir_fatura_cartao(uuid) to authenticated;
