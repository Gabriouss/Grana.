-- Pedido expresso do autor, 17/10/2026: guardado anterior nao altera o mes.
-- PREPARADA, NAO APLICADA. Saldos existentes sao anteriores: origem historica
-- desconhecida nao pode ser inventada como receita/aporte do mes vigente.
alter table public.goals add column if not exists month_reserves jsonb not null default '{}'::jsonb;

create or replace function public.deposit_to_goal(p_goal_id uuid, p_delta numeric, p_origin text)
returns public.goals language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_before public.goals;
  v_after public.goals;
  v_mes text := to_char(statement_timestamp() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_reserva numeric;
  v_delta numeric := round(p_delta, 2);
  v_xp integer := 0;
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if p_origin is null or p_origin not in ('mes', 'anterior') or v_delta is null
    or v_delta::text in ('NaN', 'Infinity', '-Infinity') or v_delta = 0 then
    raise exception 'Valor ou origem inválida' using errcode = '22023';
  end if;
  select * into v_before from public.goals where id = p_goal_id and user_id = v_user for update;
  if not found then raise exception 'Meta não encontrada' using errcode = 'P0002'; end if;
  v_reserva := coalesce((v_before.month_reserves ->> v_mes)::numeric, 0);
  if v_delta < 0 and -v_delta > (case when p_origin = 'mes' then v_reserva else v_before.current_amount - v_reserva end) then
    raise exception 'Valor maior que o disponível nessa origem' using errcode = '22023';
  end if;
  update public.goals set current_amount = current_amount + v_delta,
    month_reserves = case when p_origin = 'mes'
      then jsonb_set(month_reserves, array[v_mes], to_jsonb(v_reserva + v_delta)) else month_reserves end
    where id = p_goal_id and user_id = v_user returning * into v_after;
  if v_delta > 0 then v_xp := least(200, greatest(5, round(v_delta / 10)::integer)); end if;
  if v_before.current_amount < v_before.target_amount and v_after.current_amount >= v_after.target_amount then
    v_xp := v_xp + 150;
  end if;
  if v_xp > 0 then
    insert into public.user_gamification(user_id, lifetime_xp, updated_at)
      values(v_user, v_xp, statement_timestamp())
      on conflict(user_id) do update set lifetime_xp = public.user_gamification.lifetime_xp + v_xp,
        updated_at = excluded.updated_at;
  end if;
  return v_after;
end;
$$;
revoke all on function public.deposit_to_goal(uuid,numeric,text) from public, anon;
grant execute on function public.deposit_to_goal(uuid,numeric,text) to authenticated;

-- APK antigo continua chamando dois argumentos. Aporte segue do mes; resgate
-- usa primeiro o aporte vigente e depois o saldo anterior, sem nova receita.
create or replace function public.deposit_to_goal(p_goal_id uuid, p_delta numeric)
returns public.goals language plpgsql security definer set search_path = '' as $$
declare
  v_goal public.goals;
  v_mes text := to_char(statement_timestamp() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_atual numeric;
  v_retirar numeric;
begin
  if p_delta is null or p_delta::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Valor inválido' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  select * into v_goal from public.goals where id = p_goal_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Meta não encontrada' using errcode = 'P0002'; end if;
  if p_delta >= 0 then return public.deposit_to_goal(p_goal_id, p_delta, 'mes'); end if;
  v_atual := coalesce((v_goal.month_reserves ->> v_mes)::numeric, 0);
  v_retirar := least(-round(p_delta, 2), v_goal.current_amount);
  if least(v_retirar, v_atual) > 0 then
    v_goal := public.deposit_to_goal(p_goal_id, -least(v_retirar, v_atual), 'mes');
  end if;
  if v_retirar > v_atual then
    v_goal := public.deposit_to_goal(p_goal_id, -(v_retirar - v_atual), 'anterior');
  end if;
  return v_goal;
end;
$$;
revoke all on function public.deposit_to_goal(uuid,numeric) from public, anon;
grant execute on function public.deposit_to_goal(uuid,numeric) to authenticated;
