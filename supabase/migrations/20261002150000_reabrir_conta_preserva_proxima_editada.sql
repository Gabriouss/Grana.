-- 02/10/2026 - B6: reabrir uma conta so apaga a proxima se ela continua
-- exatamente o que o pagamento criou.
--
-- Sintoma (Harbor): pagar abril cria maio; a pessoa edita maio (valor 222);
-- reabrir abril apagava maio, levando a edicao embora. Causa: reabrir_conta
-- so testava status 'due' e vinculo de pagamento nulo.
--
-- Agora a conta seguinte so e apagada se descricao, valor, categoria, cor,
-- carteira, recorrencia, serie e vencimento ainda forem os que o pagamento
-- gerou (mesmo calculo de pagar_conta, 20261002140000). Se foi editada, fica, e
-- so o vinculo `next_bill_id` e solto. Errar para o lado de deixar uma conta
-- sobrando e seguro; errar para o lado de apagar dado da pessoa nao e.
-- Efeito conhecido: se a conta PAGA foi editada depois do pagamento (B4), a
-- seguinte deixa de bater com ela e tambem fica. Decisao a rever pelo autor.
-- ASCII de proposito no corpo da funcao.

create or replace function public.reabrir_conta(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bill public.bills;
  v_dia integer;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  select * into v_bill
  from public.bills b
  where b.id = p_bill_id and b.user_id = v_user
  for update;
  if not found then
    raise exception 'Conta não encontrada' using errcode = 'P0002';
  end if;

  if v_bill.paid_transaction_id is not null then
    delete from public.transactions
    where id = v_bill.paid_transaction_id and user_id = v_user;
  end if;

  -- A conta do mês seguinte que ESTE pagamento criou sai junto, se ainda for
  -- igual ao que foi criado. Paga ou editada, fica.
  if v_bill.next_bill_id is not null then
    v_dia := public.dia_desejado_da_serie(v_bill.due_date, v_bill.recurrence_day, null);
    delete from public.bills n
    where n.id = v_bill.next_bill_id
      and n.user_id = v_user
      and n.status = 'due'
      and n.paid_transaction_id is null
      and n.recurring
      and n.parent_id is not distinct from coalesce(v_bill.parent_id, v_bill.id)
      and n.description = v_bill.description
      and n.amount = v_bill.amount
      and n.category = v_bill.category
      and n.color = v_bill.color
      and n.wallet_id is not distinct from v_bill.wallet_id
      and n.due_date = public.proximo_vencimento_da_serie(v_bill.due_date, v_dia);
  end if;

  update public.bills
  set status = 'due', paid_transaction_id = null, next_bill_id = null
  where id = v_bill.id and user_id = v_user
  returning * into v_bill;
  return v_bill;
end;
$$;

revoke all on function public.reabrir_conta(uuid) from public, anon;
grant execute on function public.reabrir_conta(uuid) to authenticated;
