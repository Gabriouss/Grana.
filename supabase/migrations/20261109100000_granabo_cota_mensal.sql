-- Pendente, nao aplicada. Cota mensal apenas para o Granabo; voz permanece igual.
-- Contador mensal inicia em zero na implantacao: o contador diario legado nao
-- permite reconstruir o uso do mes. Nenhum historico pessoal e consultado.
alter table public.ai_usage_counters
  add column if not exists mes_inicio date,
  add column if not exists mes_usos integer not null default 0 check (mes_usos >= 0);

create or replace function public.consumir_cota_ia(p_tipo text)
returns table (
  permitido boolean,
  motivo text,
  minuto_restante integer,
  dia_restante integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_minuto_inicio timestamptz := date_trunc('minute', statement_timestamp());
  v_dia_inicio date := (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_minuto_limite integer;
  v_dia_limite integer;
  -- Decisao 19: Anual vitalicio para as contas atuais. Unico limite mensal.
  c_assistente_mes constant integer := 200;
  v_mes_inicio date := date_trunc('month', statement_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_mes_usos integer;
  v_linha public.ai_usage_counters;
  v_minuto_usos integer;
  v_dia_usos integer;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  if p_tipo = 'assistente' then
    v_minuto_limite := 10;
    v_dia_limite := null; -- Granabo nao tem cota diaria.
  elsif p_tipo = 'voz' then
    v_minuto_limite := 12;
    v_dia_limite := 60;
  else
    raise exception 'Tipo de cota inválido' using errcode = '22023';
  end if;

  insert into public.ai_usage_counters (
    user_id, tipo, minuto_inicio, dia_inicio
  ) values (
    v_user, p_tipo, v_minuto_inicio, v_dia_inicio
  ) on conflict (user_id, tipo) do nothing;

  select * into v_linha
  from public.ai_usage_counters
  where user_id = v_user and tipo = p_tipo
  for update;

  v_minuto_usos := case
    when v_linha.minuto_inicio = v_minuto_inicio then v_linha.minuto_usos
    else 0
  end;
  if p_tipo = 'assistente' then
    v_mes_usos := case when v_linha.mes_inicio = v_mes_inicio then v_linha.mes_usos else 0 end;
    if v_mes_usos >= c_assistente_mes then
      return query select false, 'mes', greatest(v_minuto_limite - v_minuto_usos, 0), 0;
      return;
    end if;
    if v_minuto_usos >= v_minuto_limite then
      return query select false, 'minuto', 0, greatest(c_assistente_mes - v_mes_usos, 0);
      return;
    end if;
    update public.ai_usage_counters
    set minuto_inicio = v_minuto_inicio,
        minuto_usos = v_minuto_usos + 1,
        mes_inicio = v_mes_inicio,
        mes_usos = v_mes_usos + 1,
        atualizado_em = statement_timestamp()
    where user_id = v_user and tipo = p_tipo;
    -- Mantem a assinatura da RPC; o quarto campo legado e o saldo do mes no assistente.
    return query select true, null::text,
      greatest(v_minuto_limite - v_minuto_usos - 1, 0),
      greatest(c_assistente_mes - v_mes_usos - 1, 0);
    return;
  end if;

  v_dia_usos := case
    when v_linha.dia_inicio = v_dia_inicio then v_linha.dia_usos
    else 0
  end;

  if v_dia_usos >= v_dia_limite then
    update public.ai_usage_counters
    set minuto_inicio = v_minuto_inicio,
        minuto_usos = v_minuto_usos,
        dia_inicio = v_dia_inicio,
        dia_usos = v_dia_usos,
        atualizado_em = statement_timestamp()
    where user_id = v_user and tipo = p_tipo;
    return query select false, 'dia', greatest(v_minuto_limite - v_minuto_usos, 0), 0;
    return;
  end if;

  if v_minuto_usos >= v_minuto_limite then
    update public.ai_usage_counters
    set minuto_inicio = v_minuto_inicio,
        minuto_usos = v_minuto_usos,
        dia_inicio = v_dia_inicio,
        dia_usos = v_dia_usos,
        atualizado_em = statement_timestamp()
    where user_id = v_user and tipo = p_tipo;
    return query select false, 'minuto', 0, greatest(v_dia_limite - v_dia_usos, 0);
    return;
  end if;

  update public.ai_usage_counters
  set minuto_inicio = v_minuto_inicio,
      minuto_usos = v_minuto_usos + 1,
      dia_inicio = v_dia_inicio,
      dia_usos = v_dia_usos + 1,
      atualizado_em = statement_timestamp()
  where user_id = v_user and tipo = p_tipo;

  return query select true, null::text,
    greatest(v_minuto_limite - v_minuto_usos - 1, 0),
    greatest(v_dia_limite - v_dia_usos - 1, 0);
end;
$$;

revoke all on function public.consumir_cota_ia(text) from public, anon;
grant execute on function public.consumir_cota_ia(text) to authenticated;
