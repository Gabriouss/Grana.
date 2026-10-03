-- 02/10/2026 - Apagar a primeira conta de uma serie de boletos nao leva as outras.
--
-- Decisao do autor em 02/10/2026, ao ver que apagar a primeira conta de uma
-- serie recorrente apagava tambem os meses ja pagos: "quero" manter o
-- historico, a mesma regra que ele deu para lancamentos em 01/10 ("os
-- lancamentos passados permanecem").
--
-- Todas as contas de uma serie apontam para a primeira (`parent_id`), e
-- `bills.parent_id` e `on delete cascade`: apagar a primeira levava a serie
-- inteira, pagas e em aberto. A regra mora no BANCO, e nao na pergunta do app,
-- porque o aparelho tem build antiga na mao (regra 9 do AGENTS.md).
--
-- O que o gatilho faz: quando sai uma conta que e cabeca (`parent_id` nulo) e
-- tem filhas, a filha de vencimento mais antigo vira a nova cabeca e as outras
-- passam a apontar para ela. A serie continua inteira e continua sendo UMA
-- serie: `pagar_conta` segue gerando o mes seguinte com
-- `coalesce(parent_id, id)`, e o indice unico (user_id, parent_id, due_date)
-- segue impedindo a duplicata. Soltar as filhas (parent_id nulo em todas), como
-- em `transactions`, quebraria isso: cada uma viraria cabeca da propria serie e
-- pagar duas vezes o mesmo mes passaria pelo indice.
--
-- POR QUE AFTER E POR QUE "A0_": igual a 20261001140000. BEFORE DELETE que
-- atualiza as filhas quebra o delete em massa (27000). AFTER roda no fim do
-- comando, e o nome "A0_" o poe antes do gatilho da chave estrangeira
-- ("RI_ConstraintTrigger_a_*"), que e quem faz o cascade. No delete em massa
-- (exclusao da conta) as filhas ja sairam e o gatilho nao acha nada.
--
-- O que NAO muda: apagar uma conta que nao e cabeca; `reabrir_conta`, que apaga
-- a proxima conta criada pelo pagamento (ela nunca e cabeca com filhas).
--
-- Efeito no app: o aviso de `lib/excluir-boleto.ts` ("os N dos meses seguintes
-- tambem serao removidos") fica falso e sai no mesmo commit.
-- ASCII de proposito no corpo da funcao.

create or replace function public.promover_proxima_conta_da_serie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nova uuid;
begin
  if old.parent_id is not null then
    return null;
  end if;

  select b.id into v_nova
  from public.bills b
  where b.parent_id = old.id and b.user_id = old.user_id
  order by b.due_date asc, b.created_at asc, b.id asc
  limit 1;

  if v_nova is null then
    return null;
  end if;

  update public.bills set parent_id = null
   where id = v_nova and user_id = old.user_id;

  update public.bills set parent_id = v_nova
   where parent_id = old.id and user_id = old.user_id;

  return null;
end;
$$;

revoke all on function public.promover_proxima_conta_da_serie()
  from public, anon, authenticated;

drop trigger if exists "A0_promover_proxima_conta_da_serie" on public.bills;
create trigger "A0_promover_proxima_conta_da_serie"
  after delete on public.bills
  for each row execute function public.promover_proxima_conta_da_serie();
