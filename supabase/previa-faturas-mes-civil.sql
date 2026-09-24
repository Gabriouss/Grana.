-- PRÉVIA, SOMENTE LEITURA: pagamentos de fatura gravados no eixo antigo (mês
-- civil) e colisões com a unique (card_id, year, month). 23/09/2026.
--
-- Nada aqui altera o banco: é um único SELECT. Não existe UPDATE neste
-- arquivo, de propósito. Mover uma linha é decisão do autor, linha a linha,
-- depois de ler esta saída. Substitui a prévia de 06/09
-- (docs/superpowers/specs/2026-09-06-migracao-fatura-cartao-preview.sql), que
-- misturava os dois eixos, não filtrava usuário, ignorava a unique e usava o
-- fechamento sem o limite de fim de mês.
--
-- O problema. Até a 1.6.0, o app gravava (year, month) como o mês CIVIL
-- navegado ("fatura de setembro" = compras de 1 a 30/09). A partir do código
-- de 06/09/2026 (46bd60d, 094058b; primeira versão com ele: 1.7.0, subida às
-- 18:31 do mesmo dia), a chave é o mês de FECHAMENTO ("fatura de setembro" =
-- a que fecha em setembro). O que decide o eixo de uma linha é a versão do
-- APK de quem pagou, e o banco não guarda isso: `created_at` antes do corte é
-- só um indício, e o corte está em `params` para ser ajustado.
--
-- Uma compra de mês civil cai em DUAS faturas por fechamento (antes e depois
-- do dia de corte). Por isso a prévia não "converte": mostra, para cada linha
-- suspeita, os dois candidatos (a própria chave lida como fechamento, e a
-- chave do mês seguinte), a soma das compras de cada um, o vencimento de cada
-- um, e sugere pelo valor pago. Empate ou nenhum próximo: revisar à mão.
--
-- Como rodar: SQL Editor do Supabase (que usa papel com acesso a auth.users).
-- Para ver só uma conta, preencher `email_filtro` em `params`. A saída tem
-- dado financeiro: não colar em arquivo versionado nem no vault (regras 12 e
-- 15).
--
-- Convenções: `month` é 0-indexado na tabela; aqui as colunas de saída usam
-- AAAA-MM legível. Dia efetivo de fechamento/vencimento = min(dia, último dia
-- do mês), a mesma regra de lib/faturaCiclo.ts.

with params as (
  select
    timestamptz '2026-09-06 18:31:51-03' as corte,  -- antes disto: indício de mês civil
    ''::text as email_filtro                         -- vazio = todas as contas
),
base as (
  select
    inv.id as invoice_id,
    inv.user_id,
    u.email,
    inv.card_id,
    c.name as cartao,
    c.closing_day,
    c.due_day,
    inv.year,
    inv.month,
    inv.amount,
    inv.paid_on,
    inv.created_at,
    inv.created_at < p.corte as antes_do_corte,
    make_date(inv.year, inv.month + 1, 1) as mes_chave
  from public.credit_card_invoices inv
  join public.credit_cards c on c.id = inv.card_id
  join auth.users u on u.id = inv.user_id
  cross join params p
  where p.email_filtro = '' or lower(u.email) = lower(p.email_filtro)
),
datas as (
  select
    b.*,
    -- fechamento efetivo de um mês: primeiro dia + (min(dia, dias do mês) - 1)
    (m.ant + (least(b.closing_day, extract(day from (m.ant + interval '1 month' - interval '1 day'))::int) - 1)) as fecha_ant,
    (m.cur + (least(b.closing_day, extract(day from (m.cur + interval '1 month' - interval '1 day'))::int) - 1)) as fecha_cur,
    (m.seg + (least(b.closing_day, extract(day from (m.seg + interval '1 month' - interval '1 day'))::int) - 1)) as fecha_seg,
    m.cur as civil_inicio,
    m.seg as civil_fim,
    -- vencimento: no mês do fechamento se due_day >= closing_day, senão no seguinte
    case when b.due_day >= b.closing_day
      then m.cur + (least(b.due_day, extract(day from (m.cur + interval '1 month' - interval '1 day'))::int) - 1)
      else m.seg + (least(b.due_day, extract(day from (m.seg + interval '1 month' - interval '1 day'))::int) - 1)
    end as vence_a,
    case when b.due_day >= b.closing_day
      then m.seg + (least(b.due_day, extract(day from (m.seg + interval '1 month' - interval '1 day'))::int) - 1)
      else m.seg2 + (least(b.due_day, extract(day from (m.seg2 + interval '1 month' - interval '1 day'))::int) - 1)
    end as vence_b
  from base b
  cross join lateral (
    select
      (b.mes_chave - interval '1 month')::date as ant,
      b.mes_chave as cur,
      (b.mes_chave + interval '1 month')::date as seg,
      (b.mes_chave + interval '2 month')::date as seg2
  ) m
),
somas as (
  select
    d.*,
    -- A = a chave lida como fechamento (eixo novo); B = fatura do mês seguinte.
    -- Estorno (type 'in') abate.
    (select coalesce(sum(case when t.type = 'out' then t.amount else -t.amount end), 0)
       from public.transactions t
      where t.card_id = d.card_id and t.occurred_on >= d.fecha_ant and t.occurred_on < d.fecha_cur) as soma_a,
    (select coalesce(sum(case when t.type = 'out' then t.amount else -t.amount end), 0)
       from public.transactions t
      where t.card_id = d.card_id and t.occurred_on >= d.fecha_cur and t.occurred_on < d.fecha_seg) as soma_b,
    (select coalesce(sum(case when t.type = 'out' then t.amount else -t.amount end), 0)
       from public.transactions t
      where t.card_id = d.card_id and t.occurred_on >= d.civil_inicio and t.occurred_on < d.civil_fim) as soma_civil,
    exists (
      select 1 from public.credit_card_invoices o
      where o.card_id = d.card_id
        and make_date(o.year, o.month + 1, 1) = d.civil_fim
    ) as chave_b_ja_existe
  from datas d
)
select
  email,
  cartao,
  closing_day as fecha_dia,
  due_day as vence_dia,
  to_char(mes_chave, 'YYYY-MM') as chave_gravada,
  created_at,
  paid_on,
  amount as valor_pago,
  antes_do_corte,
  to_char(fecha_ant, 'DD/MM') || ' a ' || to_char(fecha_cur - 1, 'DD/MM') as ciclo_a,
  soma_a,
  vence_a,
  to_char(fecha_cur, 'DD/MM') || ' a ' || to_char(fecha_seg - 1, 'DD/MM') as ciclo_b,
  soma_b,
  vence_b,
  soma_civil,
  chave_b_ja_existe,
  case
    when not antes_do_corte then 'manter (gravada no eixo novo)'
    when abs(soma_a - amount) < abs(soma_b - amount) and abs(soma_a - amount) <= 0.01 * greatest(amount, 1) then 'manter (valor bate com A)'
    when abs(soma_b - amount) < abs(soma_a - amount) and abs(soma_b - amount) <= 0.01 * greatest(amount, 1) then
      case when chave_b_ja_existe then 'COLISÃO: B já tem pagamento; revisar à mão'
           else 'mover para ' || to_char(civil_fim, 'YYYY-MM') || ' (valor bate com B)' end
    when abs(soma_civil - amount) <= 0.01 * greatest(amount, 1) then 'revisar: pagou o mês civil inteiro (A e B misturados)'
    else 'revisar: valor não bate com nenhum candidato'
  end as sugestao
from somas
order by email, cartao, mes_chave;
