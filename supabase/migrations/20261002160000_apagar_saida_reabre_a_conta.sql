-- 02/10/2026 - B5: apagar a saida vinculada a um boleto pago reabre o boleto.
--
-- Sintoma (Harbor): apagar em Lancamentos a saida que um boleto gerou deixava
-- o boleto 'paid' sem saida (a FK `on delete set null` solta o vinculo e nao
-- muda o status): o dinheiro "pago" nao existia mais no caixa.
--
-- Correcao no BANCO (regra 9). O boleto volta a 'due', sem vinculo de
-- pagamento e sem `next_bill_id`; nada e apagado, nem o boleto, nem a conta
-- seguinte que o pagamento criou (ela passa a ser uma conta comum).
--
-- POR QUE AFTER E "A0_": igual a 20261001140000. AFTER nao quebra delete em
-- lote nem a exclusao da conta (27000). O nome "A0_" o poe ANTES do gatilho da
-- chave estrangeira ("RI_ConstraintTrigger_a_*"), que e quem zera
-- `paid_transaction_id`; depois dele o vinculo ja teria sumido. Na exclusao da
-- conta (cascade de auth.users) o boleto pode ja ter saido: nada a atualizar.
-- Compativel com reabrir_conta, que apaga a saida e em seguida grava o mesmo
-- estado. Retorna sempre NULL, como os outros.
-- Decisao do maestro a rever pelo autor.

create or replace function public.reabrir_conta_da_saida_apagada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bills
     set status = 'due',
         paid_transaction_id = null,
         next_bill_id = null
   where paid_transaction_id = old.id
     and user_id = old.user_id
     and status = 'paid';
  return null;
end;
$$;

revoke all on function public.reabrir_conta_da_saida_apagada()
  from public, anon, authenticated;

drop trigger if exists "A0_reabrir_conta_da_saida_apagada" on public.transactions;
create trigger "A0_reabrir_conta_da_saida_apagada"
  after delete on public.transactions
  for each row execute function public.reabrir_conta_da_saida_apagada();
