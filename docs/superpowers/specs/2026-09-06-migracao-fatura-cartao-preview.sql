-- Migração de credit_card_invoices para o ciclo de fatura (design em
-- docs/superpowers/specs/2026-09-03-ciclo-fatura-cartao-design.md).
--
-- ANTES desta mudança, `year`/`month` em credit_card_invoices era gravado
-- sob a convenção de MÊS CIVIL (o mês navegado na tela quando alguém tocava
-- "Pagar Fatura"). A partir da correção implementada em 2026-09-06,
-- `year`/`month` passa a significar o mês de FECHAMENTO da fatura. Faturas
-- já pagas antes da correção ficam com a chave antiga, no sentido antigo —
-- este script recalcula essa chave.
--
-- NÃO existe um vínculo salvo entre uma fatura paga e as transações que a
-- compuseram (só `paid_transaction_id`, que aponta pra saída do PAGAMENTO
-- em si, não pras compras). A única forma de descobrir "quais lançamentos
-- este registro somava" é reconstruir o agrupamento antigo (mês civil) e
-- reclassificar essas MESMAS transações pela regra nova (mesFaturaDoLancamento
-- em lib/faturaCiclo.ts, reimplementada aqui em SQL puro).
--
-- ── Como usar ────────────────────────────────────────────────────────────
-- 1. Rode SÓ a consulta de PRÉVIA abaixo (é a única parte ativa deste
--    arquivo). Ela não altera nada — é um SELECT.
-- 2. Revise linha a linha com o autor: "de → para" faz sentido? Alguma
--    linha com `ciclos_distintos_encontrados <> 1` precisa de olhar manual
--    (0 = as transações originais já não existem mais / foram editadas;
--    mais de 1 = as transações desse mês civil se espalham por mais de uma
--    fatura nova, e a migração automática NÃO decide sozinha qual delas é a
--    certa).
-- 3. Só depois da aprovação explícita do autor, descomente e rode o UPDATE
--    no fim do arquivo — ele só toca as linhas com exatamente 1 ciclo novo
--    encontrado (as ambíguas ficam de fora, de propósito).
-- 4. Nunca altera amount, paid_on, wallet_id nem paid_transaction_id — só a
--    chave (year, month).

-- ── 1) PRÉVIA (SELECT — rodar isto primeiro) ──────────────────────────────

with fatura_do_lancamento as (
  -- Reimplementação em SQL de mesFaturaDoLancamento (lib/faturaCiclo.ts):
  -- dia < closing_day → fecha no mesmo mês do lançamento;
  -- dia >= closing_day → fecha no mês seguinte (regra de corte).
  select
    t.id as transaction_id,
    t.card_id,
    t.occurred_on,
    case
      when extract(day from t.occurred_on)::int < c.closing_day
        then extract(year from t.occurred_on)::int
      else extract(year from (date_trunc('month', t.occurred_on) + interval '1 month'))::int
    end as fatura_year,
    case
      when extract(day from t.occurred_on)::int < c.closing_day
        then extract(month from t.occurred_on)::int - 1  -- 0-indexado, mesma convenção do app
      else extract(month from (date_trunc('month', t.occurred_on) + interval '1 month'))::int - 1
    end as fatura_month
  from public.transactions t
  join public.credit_cards c on c.id = t.card_id
  where t.card_id is not null
),
mapeamento as (
  select
    inv.id as invoice_id,
    inv.card_id,
    cc.name as card_name,
    cc.closing_day,
    inv.year as ano_antigo_civil,
    inv.month as mes_antigo_civil,   -- 0-indexado
    inv.amount,
    inv.paid_on,
    count(distinct (f.fatura_year || '-' || lpad((f.fatura_month + 1)::text, 2, '0'))) as ciclos_distintos_encontrados,
    array_agg(distinct (f.fatura_year || '-' || lpad((f.fatura_month + 1)::text, 2, '0'))) as ciclos_novos_possiveis,
    min(f.fatura_year) as sugestao_ano_novo,
    min(f.fatura_month) as sugestao_mes_novo  -- 0-indexado; só confiável quando ciclos_distintos_encontrados = 1
  from public.credit_card_invoices inv
  join public.credit_cards cc on cc.id = inv.card_id
  left join fatura_do_lancamento f
    on f.card_id = inv.card_id
    and extract(year from f.occurred_on)::int = inv.year
    and extract(month from f.occurred_on)::int - 1 = inv.month
  group by inv.id, inv.card_id, cc.name, cc.closing_day, inv.year, inv.month, inv.amount, inv.paid_on
)
select
  invoice_id,
  card_name,
  closing_day,
  (ano_antigo_civil || '-' || lpad((mes_antigo_civil + 1)::text, 2, '0')) as "de (mes civil antigo)",
  case
    when ciclos_distintos_encontrados = 1
      then (sugestao_ano_novo || '-' || lpad((sugestao_mes_novo + 1)::text, 2, '0'))
    else '⚠ AMBÍGUO — ver ciclos_novos_possiveis'
  end as "para (fatura nova)",
  ciclos_distintos_encontrados,
  ciclos_novos_possiveis,
  amount,
  paid_on
from mapeamento
order by ano_antigo_civil, mes_antigo_civil, card_name;

-- ── 2) UPDATE (só depois da revisão acima aprovada pelo autor) ────────────
-- Comentado de propósito. Descomente e rode manualmente só depois do passo
-- 2 do cabeçalho. Só toca linhas com exatamente 1 ciclo novo encontrado.
--
-- with fatura_do_lancamento as (
--   select
--     t.id as transaction_id,
--     t.card_id,
--     t.occurred_on,
--     case
--       when extract(day from t.occurred_on)::int < c.closing_day
--         then extract(year from t.occurred_on)::int
--       else extract(year from (date_trunc('month', t.occurred_on) + interval '1 month'))::int
--     end as fatura_year,
--     case
--       when extract(day from t.occurred_on)::int < c.closing_day
--         then extract(month from t.occurred_on)::int - 1
--       else extract(month from (date_trunc('month', t.occurred_on) + interval '1 month'))::int - 1
--     end as fatura_month
--   from public.transactions t
--   join public.credit_cards c on c.id = t.card_id
--   where t.card_id is not null
-- ),
-- alvo as (
--   select
--     inv.id,
--     min(f.fatura_year) as novo_ano,
--     min(f.fatura_month) as novo_mes,
--     count(distinct (f.fatura_year || '-' || lpad((f.fatura_month + 1)::text, 2, '0'))) as ciclos
--   from public.credit_card_invoices inv
--   join fatura_do_lancamento f
--     on f.card_id = inv.card_id
--     and extract(year from f.occurred_on)::int = inv.year
--     and extract(month from f.occurred_on)::int - 1 = inv.month
--   group by inv.id
--   having count(distinct (f.fatura_year || '-' || lpad((f.fatura_month + 1)::text, 2, '0'))) = 1
-- )
-- update public.credit_card_invoices inv
-- set year = alvo.novo_ano, month = alvo.novo_mes
-- from alvo
-- where inv.id = alvo.id;
