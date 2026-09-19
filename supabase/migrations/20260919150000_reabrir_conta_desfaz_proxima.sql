-- 19/09/2026 — Reabrir uma conta paga desfaz o pagamento INTEIRO.
--
-- Regra do autor, nas palavras dele: "Apertou, pagou. Apertou de novo, cancela
-- o pagamento e a saída do dinheiro é cancelada." O toque único fica como está.
--
-- O defeito (achado U1, lido no código pela M2 em 18/09): `pagar_conta` de uma
-- conta RECORRENTE faz três coisas, lança a saída, marca a conta como paga e
-- cria a conta do mês seguinte. `reabrir_conta` desfazia só as duas primeiras.
-- Pagar e reabrir deixava um boleto fantasma no mês seguinte; pagar de novo
-- não duplicava (o índice único segura), mas o fantasma continuava lá.
--
-- Por que precisa de coluna nova: na hora de reabrir, não havia como saber se
-- a conta do mês seguinte tinha nascido DAQUELE pagamento ou se já existia
-- antes (criada à mão, ou por um pagamento anterior que foi reaberto). O
-- `on conflict do nothing` escondia essa diferença. Agora o pagamento guarda o
-- id da conta que ele mesmo criou, e só essa é desfeita.
--
-- Aplicada à mão em produção: este projeto não tem
-- supabase_migrations.schema_migrations (regra 9 do AGENTS.md).

alter table public.bills
  add column if not exists next_bill_id uuid references public.bills(id) on delete set null;

comment on column public.bills.next_bill_id is
  'Conta do mês seguinte criada por ESTE pagamento (pagar_conta). Nula se a conta não é recorrente, não foi paga, ou se a do mês seguinte já existia. reabrir_conta apaga a conta apontada aqui, se ela ainda não foi paga.';

-- Sem índice, cada exclusão de conta varreria a tabela inteira para cumprir o
-- `on delete set null`. Parcial porque quase todas as linhas ficam nulas.
create index if not exists bills_next_bill_id_idx
  on public.bills (next_bill_id) where next_bill_id is not null;

-- Mesmo padrão das outras referências entre linhas: a FK simples cuida do SET
-- NULL, a composta prova que as duas contas são do mesmo dono.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bills_next_bill_same_owner_fkey'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_next_bill_same_owner_fkey
      foreign key (user_id, next_bill_id)
      references public.bills (user_id, id)
      not valid;
  end if;
  alter table public.bills validate constraint bills_next_bill_same_owner_fkey;
end
$$;

-- Contas já pagas antes desta migration: a conta seguinte que o pagamento
-- criou nasceu na MESMA transação que a saída, e `created_at default now()`
-- devolve o mesmo instante para toda a transação. Igualdade exata, então: uma
-- conta seguinte criada em outro momento nunca é ligada por engano.
update public.bills pago
set next_bill_id = proxima.id
from public.transactions saida, public.bills proxima
where pago.status = 'paid'
  and pago.recurring
  and pago.next_bill_id is null
  and saida.id = pago.paid_transaction_id
  and saida.user_id = pago.user_id
  and proxima.user_id = pago.user_id
  and proxima.parent_id = coalesce(pago.parent_id, pago.id)
  and proxima.due_date = public.somar_meses_data(pago.due_date, 1)
  and proxima.created_at = saida.created_at;

create or replace function public.pagar_conta(p_bill_id uuid, p_paid_on date)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bill public.bills;
  v_tx_id uuid;
  v_parent uuid;
  v_next_due date;
  v_next_id uuid;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if p_paid_on is null then
    raise exception 'Data de pagamento inválida' using errcode = '22023';
  end if;

  select * into v_bill
  from public.bills b
  where b.id = p_bill_id and b.user_id = v_user
  for update;

  if not found then
    raise exception 'Conta não encontrada' using errcode = 'P0002';
  end if;
  if v_bill.status = 'paid' then
    return v_bill;
  end if;

  insert into public.transactions (
    user_id, type, description, amount, category, color, occurred_on, wallet_id
  ) values (
    v_user, 'out', v_bill.description, v_bill.amount, v_bill.category,
    v_bill.color, p_paid_on, v_bill.wallet_id
  ) returning id into v_tx_id;

  update public.bills
  set status = 'paid', paid_transaction_id = v_tx_id
  where id = v_bill.id and user_id = v_user
  returning * into v_bill;

  if v_bill.recurring then
    v_parent := coalesce(v_bill.parent_id, v_bill.id);
    v_next_due := public.somar_meses_data(v_bill.due_date, 1);
    -- Com o conflito, nada é inserido e o RETURNING não devolve linha:
    -- v_next_id fica nulo. É isso que separa "este pagamento criou" de
    -- "já existia", e só a primeira é desfeita ao reabrir.
    insert into public.bills (
      user_id, description, amount, category, color, due_date, status,
      recurring, wallet_id, parent_id
    ) values (
      v_user, v_bill.description, v_bill.amount, v_bill.category, v_bill.color,
      v_next_due, 'due', true, v_bill.wallet_id, v_parent
    ) on conflict (user_id, parent_id, due_date) do nothing
    returning id into v_next_id;

    if v_next_id is not null then
      update public.bills
      set next_bill_id = v_next_id
      where id = v_bill.id and user_id = v_user
      returning * into v_bill;
    end if;
  end if;

  return v_bill;
end;
$$;

revoke all on function public.pagar_conta(uuid, date) from public, anon;
grant execute on function public.pagar_conta(uuid, date) to authenticated;

create or replace function public.reabrir_conta(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bill public.bills;
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

  -- A conta do mês seguinte que ESTE pagamento criou sai junto. Se ela já foi
  -- paga, fica: apagá-la levaria um pagamento de verdade embora.
  if v_bill.next_bill_id is not null then
    delete from public.bills
    where id = v_bill.next_bill_id
      and user_id = v_user
      and status = 'due'
      and paid_transaction_id is null;
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
