-- pagar_fatura_cartao recusa fatura cujo ciclo ainda nao comecou (23/09/2026).
--
-- Ate aqui a RPC gravava qualquer (card_id, year, month) que o aparelho
-- mandasse, e a chave de uma fatura paga e o mes de FECHAMENTO dela. Um
-- cliente com o mes errado (a tela navegada, um app antigo que usava mes
-- civil, um toque na fatura do mes que vem) podia marcar como paga uma fatura
-- que ainda nao existe, e a fatura de verdade seguia aberta.
--
-- O que muda:
--   * ano entre 2000 e 2100, e todos os argumentos obrigatorios nao nulos;
--   * o ciclo da fatura precisa ter comecado (inicio <= hoje em Sao Paulo).
--     Pagar a fatura aberta antes do fechamento continua permitido. Recusa:
--     errcode 22023, hint 'ciclo_invalido' (contrato combinado com o Forge);
--   * dia efetivo do fechamento = min(closing_day, ultimo dia do mes), a mesma
--     regra que lib/faturaCiclo.ts e supabase/functions/_shared/fatura-ciclo.ts
--     passam a usar. Sem isso, um cartao que fecha dia 31 transbordava para
--     marco na fatura de fevereiro.
--
-- O que NAO muda: a chave (card_id, year, month), o pagamento repetido
-- devolvendo a linha existente (conferido ANTES da validacao, entao um toque
-- duplo numa linha antiga continua idempotente), a conferencia de que o cartao
-- e do usuario, a saida gravada em transactions.
--
-- Esta e a primeira migration com a definicao da RPC; antes ela so existia no
-- schema.sql. Antes de aplicar (regra 11), ler a definicao em producao:
--   select pg_get_functiondef('public.pagar_fatura_cartao(uuid,integer,integer,numeric,date,uuid)'::regprocedure);
-- e conferir que o resto do corpo e igual a este.

create or replace function public.pagar_fatura_cartao(
  p_card_id uuid,
  p_year integer,
  p_month integer,
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
  v_card public.credit_cards;
  v_invoice public.credit_card_invoices;
  v_tx_id uuid;
  v_mes_anterior date;
  v_inicio_ciclo date;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if p_month is null or p_month not between 0 and 11 or p_year is null or p_year not between 2000 and 2100
     or p_amount is null or p_amount <= 0 or p_paid_on is null then
    raise exception 'Dados de fatura inválidos' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_user::text || ':' || p_card_id::text || ':' || p_year::text || ':' || p_month::text,
    0
  ));

  select * into v_invoice
  from public.credit_card_invoices i
  where i.user_id = v_user and i.card_id = p_card_id
    and i.year = p_year and i.month = p_month
  for update;
  if found then
    return v_invoice;
  end if;

  select * into v_card
  from public.credit_cards c
  where c.id = p_card_id and c.user_id = v_user;
  if not found then
    raise exception 'Cartão não encontrado' using errcode = 'P0002';
  end if;

  -- (p_year, p_month) é o mês de FECHAMENTO da fatura (0-indexado). O ciclo
  -- dela começa no fechamento do mês anterior. Dia efetivo do fechamento =
  -- min(closing_day, último dia do mês): um cartão que fecha dia 31 fecha em
  -- 28/29 de fevereiro e em 30 de abril, como nos bancos. Pagar antes de o
  -- ciclo começar é pagar uma fatura que ainda não existe: recusa. A fatura
  -- aberta (ciclo já começado) continua podendo ser paga antes do fechamento.
  v_mes_anterior := (make_date(p_year, p_month + 1, 1) - interval '1 month')::date;
  v_inicio_ciclo := v_mes_anterior + (least(
    v_card.closing_day::int,
    extract(day from (v_mes_anterior + interval '1 month' - interval '1 day'))::int
  ) - 1);
  if v_inicio_ciclo > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Esta fatura ainda não começou'
      using errcode = '22023', hint = 'ciclo_invalido';
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
    format('Pagamento fatura — %s (%s/%s)', v_card.name, lpad((p_month + 1)::text, 2, '0'), p_year),
    p_amount,
    'Cartão de crédito',
    v_card.color,
    p_paid_on,
    p_wallet_id
  ) returning id into v_tx_id;

  insert into public.credit_card_invoices (
    user_id, card_id, year, month, amount, paid_on, wallet_id,
    paid_transaction_id
  ) values (
    v_user, p_card_id, p_year, p_month, p_amount, p_paid_on, p_wallet_id,
    v_tx_id
  ) returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke all on function public.pagar_fatura_cartao(uuid, integer, integer, numeric, date, uuid) from public, anon;
grant execute on function public.pagar_fatura_cartao(uuid, integer, integer, numeric, date, uuid) to authenticated;
