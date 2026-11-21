-- Sobra do mês vira lançamento de entrada (plano do Meridian aprovado pelo
-- autor em 21/11/2026, decisões P1 a P5). NÃO APLICADA: quem aplica é o
-- Supremo, com o ok do autor, depois da contagem só de leitura do plano.
-- Volta: 20261121120000_sobra_vira_lancamento.volta.sql (fora de migrations).
--
-- Antes, a sobra confirmada vivia só em `sobra_do_mes.valor` e cinco lugares
-- a somavam por fora. Agora, ao confirmar, a RPC grava UM lançamento de
-- entrada no dia 1 do mês (P2), na carteira Principal padrão do dono,
-- categoria "Sobra do mês" (P1), e a linha da sobra passa a significar
-- "pergunta deste mês respondida": valor 0, apontando para o lançamento.
--
-- Cliente antigo que lê `valor` passa a somar 0 e vê o lançamento como entrada
-- comum: conta uma vez. O gatilho impede que um cliente antigo com estado velho
-- regrave um valor numa linha convertida (somaria duas vezes).

-- 1. Ligação com o lançamento. A chave composta garante o mesmo dono; apagar o
--    lançamento zera só `transaction_id` (a linha continua respondida, P3).
alter table public.sobra_do_mes
  add column if not exists transaction_id uuid null,
  add column if not exists convertida boolean not null default false;

alter table public.sobra_do_mes drop constraint if exists sobra_do_mes_transacao_mesmo_dono_fkey;
alter table public.sobra_do_mes
  add constraint sobra_do_mes_transacao_mesmo_dono_fkey
  foreign key (user_id, transaction_id) references public.transactions (user_id, id)
  on delete set null (transaction_id);

alter table public.sobra_do_mes drop constraint if exists sobra_do_mes_convertida_sem_valor;
alter table public.sobra_do_mes
  add constraint sobra_do_mes_convertida_sem_valor check (not convertida or valor = 0) not valid;

create unique index if not exists sobra_do_mes_transaction_id_uniq
  on public.sobra_do_mes (transaction_id) where transaction_id is not null;

-- 2. Carimbo estendido. Linha já convertida continua convertida e com valor 0,
--    qualquer que seja o upsert do cliente. NÃO restaura `transaction_id`: o
--    `on delete set null` da chave estrangeira é um UPDATE que passa por aqui.
create or replace function public.sobra_do_mes_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.confirmado_em := now();
  if tg_op = 'UPDATE' and old.convertida then
    new.valor := 0;
    new.convertida := true;
  end if;
  return new;
end $$;

-- 3. Descrição do lançamento: "Sobra de <mês anterior>". Pura, sem acesso a dado.
create or replace function public.sobra_do_mes_descricao(p_mes text) returns text
language sql immutable set search_path = '' as $$
  select 'Sobra de ' || (array['janeiro','fevereiro','março','abril','maio','junho','julho',
    'agosto','setembro','outubro','novembro','dezembro'])[
      extract(month from (to_date(p_mes || '-01', 'YYYY-MM-DD') - interval '1 month'))::int]
$$;
revoke all on function public.sobra_do_mes_descricao(text) from public, anon;
grant execute on function public.sobra_do_mes_descricao(text) to authenticated, service_role;

-- 4. Confirmar (p_valor informado) ou só converter a linha legada (p_valor nulo).
--    security invoker: a RLS de `transactions` e de `sobra_do_mes` e o
--    `tem_direito_acesso()` continuam valendo para quem chama.
--    Idempotente: a linha é travada, e linha já convertida devolve o estado sem gravar.
create or replace function public.confirmar_sobra_do_mes(p_mes text, p_valor numeric default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_linha public.sobra_do_mes%rowtype;
  v_nova boolean := false;
  v_valor numeric(14,2);
  v_carteira uuid;
  v_tx uuid;
begin
  if v_uid is null then
    raise exception 'sessão ausente' using errcode = '42501';
  end if;
  if not (select public.tem_direito_acesso()) then
    raise exception 'acesso indisponível' using errcode = '42501';
  end if;
  if p_mes is null or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'mês inválido' using errcode = '22023';
  end if;
  if p_valor is not null and (p_valor < 0 or p_valor > 99999999.99) then
    raise exception 'valor de sobra inválido' using errcode = '22023';
  end if;

  if p_valor is not null then
    insert into public.sobra_do_mes (user_id, mes, valor)
    values (v_uid, p_mes, 0)
    on conflict (user_id, mes) do nothing
    returning true into v_nova;
  end if;

  select * into v_linha from public.sobra_do_mes
   where user_id = v_uid and mes = p_mes
   for update;
  if not found then
    return jsonb_build_object('estado', 'pendente', 'mes', p_mes);
  end if;
  if v_linha.convertida then
    return jsonb_build_object('estado', 'convertida', 'mes', p_mes, 'transaction_id', v_linha.transaction_id);
  end if;

  -- Linha criada agora: vale o valor informado. Linha que já existia (cliente
  -- antigo confirmou antes): vale o que estava lá, a pergunta já tinha resposta.
  v_valor := round(case when coalesce(v_nova, false) then p_valor else v_linha.valor end, 2);

  if v_valor > 0 then
    select w.id into v_carteira from public.wallets w
     where w.user_id = v_uid and w.is_default
     order by w.created_at asc, w.id asc limit 1;
    insert into public.transactions
      (user_id, type, description, amount, category, color, occurred_on, recurring,
       parent_id, payment_method, card_id, wallet_id, client_request_id)
    values
      (v_uid, 'in', public.sobra_do_mes_descricao(p_mes), v_valor, 'Sobra do mês', '#74a17c',
       to_date(p_mes || '-01', 'YYYY-MM-DD'), false, null, null, null, v_carteira,
       md5('sobra-do-mes:' || v_uid::text || ':' || p_mes)::uuid)
    returning id into v_tx;
  end if;

  update public.sobra_do_mes
     set valor = 0, transaction_id = v_tx, convertida = true
   where user_id = v_uid and mes = p_mes;

  return jsonb_build_object('estado', 'convertida', 'mes', p_mes, 'transaction_id', v_tx);
end;
$$;
revoke all on function public.confirmar_sobra_do_mes(text, numeric) from public, anon;
grant execute on function public.confirmar_sobra_do_mes(text, numeric) to authenticated;

-- 5. Conversão das sobras já confirmadas. Idempotente: só linhas com valor > 0
--    ainda não convertidas. Dono sem carteira padrão: wallet_id nulo, que a
--    regra de 08/11 já conta na Principal.
do $$
declare
  r record;
  v_carteira uuid;
  v_tx uuid;
begin
  for r in select s.user_id, s.mes, s.valor from public.sobra_do_mes s
            where s.valor > 0 and not s.convertida
            order by s.user_id, s.mes
            for update
  loop
    select w.id into v_carteira from public.wallets w
     where w.user_id = r.user_id and w.is_default
     order by w.created_at asc, w.id asc limit 1;
    insert into public.transactions
      (user_id, type, description, amount, category, color, occurred_on, recurring,
       parent_id, payment_method, card_id, wallet_id, client_request_id)
    values
      (r.user_id, 'in', public.sobra_do_mes_descricao(r.mes), r.valor, 'Sobra do mês', '#74a17c',
       to_date(r.mes || '-01', 'YYYY-MM-DD'), false, null, null, null, v_carteira,
       md5('sobra-do-mes:' || r.user_id::text || ':' || r.mes)::uuid)
    returning id into v_tx;
    update public.sobra_do_mes set valor = 0, transaction_id = v_tx, convertida = true
     where user_id = r.user_id and mes = r.mes;
  end loop;
  update public.sobra_do_mes set convertida = true where valor = 0 and not convertida;
end $$;

alter table public.sobra_do_mes validate constraint sobra_do_mes_convertida_sem_valor;

-- 6. P4: a sobra fica fora das conquistas (contagem e total de receitas).
--    Mesma marca do cliente (lib/sobra-lancamento.ts): entrada na categoria
--    "Sobra do mês". Recategorizar faz dela uma entrada comum.
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
    (select count(*) from public.transactions t where t.user_id = (select auth.uid())
       and not (t.type = 'in' and t.category = 'Sobra do mês')),
    (select count(*) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'in'
       and t.category <> 'Sobra do mês'),
    (select count(*) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'out'),
    (select coalesce(sum(t.amount), 0) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'in'
       and t.category <> 'Sobra do mês'),
    (select count(distinct t.category) from public.transactions t where t.user_id = (select auth.uid()) and t.type = 'out'),
    (select count(*) from public.bills b where b.user_id = (select auth.uid()) and b.status = 'paid');
$$;
revoke all on function public.get_gamification_summary() from public, anon;
grant execute on function public.get_gamification_summary() to authenticated, service_role;
