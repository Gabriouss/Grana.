-- 02/10/2026 - B4: editar um boleto JA PAGO atualiza a saida vinculada.
--
-- Sintoma (Harbor): conta paga editada de 100 para 120, saida segue 100; o
-- boleto e o caixa passam a contar historias diferentes. Causa: nada ligava o
-- UPDATE de `bills` a `transactions`.
--
-- Gatilho AFTER UPDATE: se a conta continua paga e tem saida vinculada, e
-- descricao, valor, categoria, cor ou carteira mudaram, a saida recebe os mesmos
-- valores. Nao ha laco: nenhum gatilho de `transactions` escreve em `bills` no
-- UPDATE (o unico, 20261002160000, e de DELETE). O pagamento em si (status
-- due -> paid) e a reabertura nao passam por aqui. A data do vencimento nao e
-- sincronizada: a saida guarda o dia em que o dinheiro saiu.
-- O `grant update` de `bills` cobre so colunas de edicao; o gatilho roda como
-- security definer para escrever em `transactions`. Decisao do maestro a rever
-- pelo autor.

create or replace function public.sincronizar_saida_da_conta_paga()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from 'paid'
     or old.status is distinct from 'paid'
     or new.paid_transaction_id is null then
    return null;
  end if;

  update public.transactions
     set description = new.description,
         amount = new.amount,
         category = new.category,
         color = new.color,
         wallet_id = new.wallet_id
   where id = new.paid_transaction_id
     and user_id = new.user_id;
  return null;
end;
$$;

revoke all on function public.sincronizar_saida_da_conta_paga()
  from public, anon, authenticated;

drop trigger if exists "A0_sincronizar_saida_da_conta_paga" on public.bills;
create trigger "A0_sincronizar_saida_da_conta_paga"
  after update of description, amount, category, color, wallet_id on public.bills
  for each row
  when (old.description is distinct from new.description
     or old.amount is distinct from new.amount
     or old.category is distinct from new.category
     or old.color is distinct from new.color
     or old.wallet_id is distinct from new.wallet_id)
  execute function public.sincronizar_saida_da_conta_paga();
