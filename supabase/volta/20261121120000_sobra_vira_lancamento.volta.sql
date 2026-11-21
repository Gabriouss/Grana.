-- VOLTA de 20261121120000_sobra_vira_lancamento.sql. NÃO é migration: só se
-- roda à mão, pelo Supremo, com o ok do autor, numa transação só.
--
-- Repõe o modelo de 07/11: a sobra volta a viver em `sobra_do_mes.valor` e
-- os lançamentos "Sobra do mês" ligados são apagados. O valor reposto é o
-- `amount` ATUAL do lançamento ligado (se a pessoa editou, vale o editado).
-- Linha convertida cujo lançamento foi apagado volta com valor 0: a pessoa
-- tinha tirado aquele dinheiro da conta, e a pergunta não volta.
--
-- Conferir antes, só leitura:
--   begin read only;
--   select count(*) filter (where convertida) convertidas,
--          count(*) filter (where transaction_id is not null) ligadas
--     from public.sobra_do_mes;
--   rollback;
begin;

update public.sobra_do_mes s
   set valor = t.amount
  from public.transactions t
 where t.user_id = s.user_id and t.id = s.transaction_id;

-- Guarda os ids antes de soltar a ligação.
create temporary table sobra_volta_ids on commit drop as
  select user_id, transaction_id from public.sobra_do_mes where transaction_id is not null;

alter table public.sobra_do_mes drop constraint if exists sobra_do_mes_convertida_sem_valor;
alter table public.sobra_do_mes drop constraint if exists sobra_do_mes_transacao_mesmo_dono_fkey;
drop index if exists public.sobra_do_mes_transaction_id_uniq;

delete from public.transactions t
 using sobra_volta_ids v
 where t.user_id = v.user_id and t.id = v.transaction_id;

alter table public.sobra_do_mes drop column if exists transaction_id;
alter table public.sobra_do_mes drop column if exists convertida;

drop function if exists public.confirmar_sobra_do_mes(text, numeric);
drop function if exists public.sobra_do_mes_descricao(text);

create or replace function public.sobra_do_mes_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.confirmado_em := now();
  return new;
end $$;

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

commit;
