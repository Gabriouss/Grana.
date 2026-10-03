-- 02/10/2026 - B3: a serie de boletos nao perde o dia desejado.
--
-- Sintoma (Harbor, prova executavel): conta recorrente de 31/01 paga gera
-- 28/02, e pagar a de fevereiro gera 28/03, e nao 31/03. Causa: pagar_conta
-- soma um mes sobre o `due_date` da conta que esta sendo paga, que ja foi
-- encolhido pelo fim de mes; o dia 31 original so existia na cabeca da serie.
-- Apagar a cabeca (migration 20261002120000) promove outra conta e apaga de vez
-- a unica referencia do dia.
--
-- Correcao no BANCO (regra 9: a build 1.10.5 instalada nao muda): coluna
-- `recurrence_day` (so as RPCs e o gatilho escrevem; fora do `grant update`),
-- que guarda o dia desejado. O valor guardado so vale se for COERENTE com a
-- data da conta: o dia da conta tem de ser o proprio dia desejado ou o ultimo
-- dia do mes quando o dia desejado nao cabe. Se a pessoa editou o vencimento
-- na mao, o dia guardado fica velho e vale o dia que ela escolheu.
-- Para serie antiga sem o campo, o dia da cabeca serve de candidato.
--
-- Decisao do maestro a rever pelo autor: 31/01 -> 28/02 -> 31/03 (e nao 28/03);
-- 29/30/31 se ajustam ao fim do mes, inclusive em ano bissexto.
-- ASCII de proposito no corpo das funcoes.

alter table public.bills
  add column if not exists recurrence_day smallint
  check (recurrence_day is null or recurrence_day between 1 and 31);

comment on column public.bills.recurrence_day is
  'Dia do mes desejado para a serie (1 a 31). Gravado por pagar_conta e pelo gatilho de promocao da cabeca; so vale se for coerente com due_date (ver dia_desejado_da_serie).';

-- Dia desejado, validado contra a data da conta.
create or replace function public.dia_desejado_da_serie(
  p_due date, p_guardado integer, p_cabeca_due date
)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  with c as (
    select extract(day from p_due)::integer as proprio,
           extract(day from (date_trunc('month', p_due) + interval '1 month - 1 day'))::integer as ultimo,
           coalesce(p_guardado, extract(day from p_cabeca_due)::integer,
                    extract(day from p_due)::integer) as candidato
  )
  select case
    when c.candidato >= c.proprio and c.proprio = least(c.candidato, c.ultimo)
      then c.candidato
    else c.proprio
  end
  from c;
$$;

-- Vencimento do mes seguinte para o dia desejado, com o fim do mes respeitado.
create or replace function public.proximo_vencimento_da_serie(p_due date, p_dia integer)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  with alvo as (
    select (date_trunc('month', p_due) + interval '1 month')::date as primeiro
  )
  select (
    alvo.primeiro
    + least(p_dia, extract(day from (alvo.primeiro + interval '1 month - 1 day'))::integer)
    - 1
  )::date
  from alvo;
$$;

revoke all on function public.dia_desejado_da_serie(date, integer, date)
  from public, anon, authenticated;
revoke all on function public.proximo_vencimento_da_serie(date, integer)
  from public, anon, authenticated;

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
  v_dia integer;
  v_cabeca_due date;
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
    select h.due_date into v_cabeca_due
    from public.bills h
    where h.id = v_bill.parent_id and h.user_id = v_user;
    v_dia := public.dia_desejado_da_serie(
      v_bill.due_date, v_bill.recurrence_day, v_cabeca_due);
    v_next_due := public.proximo_vencimento_da_serie(v_bill.due_date, v_dia);
    -- Com o conflito, nada é inserido e o RETURNING não devolve linha:
    -- v_next_id fica nulo. É isso que separa "este pagamento criou" de
    -- "já existia", e só a primeira é desfeita ao reabrir.
    insert into public.bills (
      user_id, description, amount, category, color, due_date, status,
      recurring, wallet_id, parent_id, recurrence_day
    ) values (
      v_user, v_bill.description, v_bill.amount, v_bill.category, v_bill.color,
      v_next_due, 'due', true, v_bill.wallet_id, v_parent, v_dia
    ) on conflict (user_id, parent_id, due_date) do nothing
    returning id into v_next_id;

    update public.bills
    set recurrence_day = v_dia,
        next_bill_id = coalesce(v_next_id, next_bill_id)
    where id = v_bill.id and user_id = v_user
    returning * into v_bill;
  end if;

  return v_bill;
end;
$$;

revoke all on function public.pagar_conta(uuid, date) from public, anon;
grant execute on function public.pagar_conta(uuid, date) to authenticated;

-- A promocao da cabeca (20261002120000) passa a levar o dia desejado, que sem
-- isso so existia na cabeca apagada.
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

  update public.bills
     set parent_id = null,
         recurrence_day = coalesce(recurrence_day, old.recurrence_day,
                                   extract(day from old.due_date)::integer)
   where id = v_nova and user_id = old.user_id;

  update public.bills
     set parent_id = v_nova,
         recurrence_day = coalesce(recurrence_day, old.recurrence_day,
                                   extract(day from old.due_date)::integer)
   where parent_id = old.id and user_id = old.user_id;

  return null;
end;
$$;

revoke all on function public.promover_proxima_conta_da_serie()
  from public, anon, authenticated;
