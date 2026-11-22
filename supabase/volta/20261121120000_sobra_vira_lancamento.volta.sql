-- VOLTA de 20261121120000_sobra_vira_lancamento.sql. NÃO é migration: só se
-- roda à mão, pelo Supremo, com o ok do autor, num lote e numa transação só.
--
-- Repõe o modelo de 07/11: a sobra volta a viver em `sobra_do_mes.valor` e
-- os lançamentos "Sobra do mês" ligados são apagados. O valor reposto é o
-- `amount` ATUAL do lançamento ligado (se a pessoa editou, vale o editado).
-- Linha convertida cujo lançamento foi apagado volta com valor 0: a pessoa
-- tinha tirado aquele dinheiro da conta, e a pergunta não volta.
--
-- ABORTA INTEIRA, sem apagar nada, se algum lançamento ligado deixou de ser
-- uma sobra: entrada avulsa (sem série, parcela, filho nem crédito), no dia 1
-- do mês da linha, na Principal, na categoria "Sobra do mês" e dentro do teto
-- da coluna. Esse caso se resolve com a pessoa, à mão, antes de rodar de novo.
--
-- A ordem importa: o gatilho e o check de convertida saem ANTES de repor o
-- valor; com eles ativos o valor volta a zero e o lançamento seria apagado.
--
-- Conferir antes, só leitura:
--   begin read only;
--   select count(*) filter (where convertida) convertidas,
--          count(*) filter (where transaction_id is not null) ligadas
--     from public.sobra_do_mes;
--   rollback;
begin;
set local lock_timeout = '5s';

-- Ninguém confirma, edita nem apaga durante a volta. Mesma ordem da RPC.
lock table public.sobra_do_mes, public.transactions in access exclusive mode;

-- 1. Alguma ligada mudou de natureza? Então nada é tocado.
do $$
declare
  v_fora integer;
begin
  select count(*) into v_fora
    from public.sobra_do_mes s
    join public.transactions t on t.user_id = s.user_id and t.id = s.transaction_id
   where not coalesce((
         t.type = 'in'
     and t.category = 'Sobra do mês'
     and t.amount <= 99999999.99
     and t.occurred_on = to_date(s.mes || '-01', 'YYYY-MM-DD')
     and not t.recurring
     and t.parent_id is null
     and coalesce(t.installment_total, 1) <= 1
     and t.card_id is null
     and coalesce(t.payment_method, '') <> 'credit'
     and not exists (select 1 from public.transactions f where f.parent_id = t.id)
     and (t.wallet_id is null or t.wallet_id = (
           select w.id from public.wallets w
            where w.user_id = s.user_id and w.is_default
            order by w.created_at asc, w.id asc limit 1))
   ), false);
  if v_fora > 0 then
    raise exception 'volta abortada: % lançamento(s) ligado(s) deixaram de ser sobra; nada foi apagado', v_fora;
  end if;
end $$;

-- 2. Tira o que zeraria o valor reposto.
alter table public.sobra_do_mes drop constraint if exists sobra_do_mes_convertida_sem_valor;
alter table public.sobra_do_mes drop constraint if exists sobra_do_mes_transacao_mesmo_dono_fkey;
drop index if exists public.sobra_do_mes_transaction_id_uniq;

create or replace function public.sobra_do_mes_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.confirmado_em := now();
  return new;
end $$;

-- 3. Fixa a lista: repor e apagar usam exatamente os mesmos lançamentos.
create temporary table sobra_volta_ids on commit drop as
  select user_id, mes, transaction_id from public.sobra_do_mes where transaction_id is not null;

-- 4. Repõe o valor e só depois apaga.
update public.sobra_do_mes s
   set valor = t.amount
  from sobra_volta_ids v
  join public.transactions t on t.user_id = v.user_id and t.id = v.transaction_id
 where s.user_id = v.user_id and s.mes = v.mes;

delete from public.transactions t
 using sobra_volta_ids v
 where t.user_id = v.user_id and t.id = v.transaction_id;

alter table public.sobra_do_mes drop column if exists transaction_id;
alter table public.sobra_do_mes drop column if exists convertida;

drop function if exists public.confirmar_sobra_do_mes(text, numeric);
drop function if exists public.sobra_do_mes_descricao(text);

-- 5. Funções como eram antes da migration.
create or replace function public.get_gamification_summary()
returns table (
  transaction_count bigint,
  income_count bigint,
  expense_count bigint,
  income_total numeric,
  expense_category_count bigint,
  paid_bill_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.transactions t where t.user_id = (select auth.uid())),
    (select count(*) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'in'),
    (select count(*) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'out'),
    (select coalesce(sum(t.amount), 0) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'in'),
    (select count(distinct t.category) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'out'),
    (select count(*) from public.bills b where b.user_id = (select auth.uid()) and b.status = 'paid');
$$;
revoke all on function public.get_gamification_summary() from public, anon;
grant execute on function public.get_gamification_summary() to authenticated, service_role;

create or replace function public.entradas_por_carteira()
returns table (wallet_id uuid, entradas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  return query
  select t.wallet_id, sum(t.amount)::numeric as entradas
  from public.transactions t
  where t.user_id = v_user
    and t.type = 'in'
    and coalesce(t.payment_method, '') <> 'credit'
    and t.card_id is null
  group by t.wallet_id;
end;
$$;

comment on function public.entradas_por_carteira() is
  'Total de entradas de caixa por carteira, de todo o período (sem saídas, sem estorno no cartão). Rótulo do seletor de carteira; não é saldo (regra 20).';

revoke all on function public.entradas_por_carteira() from public, anon;
grant execute on function public.entradas_por_carteira() to authenticated;

commit;
