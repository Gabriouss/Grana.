-- NÃO APLICADA. Agenda interna do dry-run, sem instalar pg_cron ou fazer HTTP.
-- Depois de 20261016160000. Nenhum registro vira autorização/publicação real.
begin;
alter table public.admin_marketing_sim_outbox add column proxima_verificacao_em timestamptz not null default now();
create function public.admin_marketing_sim_proxima(p_dados jsonb)
returns timestamptz language sql stable security invoker set search_path='' as $$
  select case
    when p_dados->>'estado' in ('publicado','cancelado','falhou','precisa-conferir','agendado-na-meta') then 'infinity'::timestamptz
    when p_dados->'lease'->>'expiraEm' is not null then greatest(now(),(p_dados->'lease'->>'expiraEm')::timestamptz)
    when p_dados->>'motivo'='pausado' then now()+interval '5 minutes'
    when p_dados->>'estado'='programado-no-painel' and p_dados->'alvo'->>'estrategia'='executor-remoto'
      then greatest(now(),(p_dados->'alvo'->>'horario')::timestamptz)
    when p_dados->>'estado'='preparando' then now()+interval '30 seconds'
    else now() end
$$;
update public.admin_marketing_sim_outbox set proxima_verificacao_em=public.admin_marketing_sim_proxima(dados);
create index admin_marketing_sim_fila_idx on public.admin_marketing_sim_outbox(proxima_verificacao_em,chave);

create or replace function public.admin_marketing_sim_cas(p_chave text,p_revisao integer,p_dados jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r integer;
begin
  if p_revisao=-1 then
    perform 1 from public.admin_marketing_sim_controles where id for update;
    if exists(select 1 from public.admin_marketing_sim_outbox where chave=p_chave) then return null; end if;
    if (select count(*) from public.admin_marketing_sim_outbox)>=1000
      or (select count(*) from public.admin_marketing_sim_outbox
        where criado_em >= (date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'))>=100 then
      raise exception 'simulacao-limite';
    end if;
    insert into public.admin_marketing_sim_outbox(chave,dados,proxima_verificacao_em)
      values(p_chave,p_dados,public.admin_marketing_sim_proxima(p_dados)) on conflict do nothing returning revisao into r;
  else
    update public.admin_marketing_sim_outbox set dados=p_dados,revisao=revisao+1,atualizado_em=now(),
      proxima_verificacao_em=public.admin_marketing_sim_proxima(p_dados)
      where chave=p_chave and revisao=p_revisao returning revisao into r;
  end if;
  return r;
end $$;

create or replace function public.admin_marketing_sim_pausar(p_rede text,p_pausa boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_rede not in ('global','facebook','instagram') or p_rede is null or p_pausa is null then raise exception 'pedido-invalido'; end if;
  update public.admin_marketing_sim_controles set
    global_pausado=case when p_rede='global' then p_pausa else global_pausado end,
    facebook_pausado=case when p_rede='facebook' then p_pausa else facebook_pausado end,
    instagram_pausado=case when p_rede='instagram' then p_pausa else instagram_pausado end where id;
  -- Acorda inclusive agendamento nativo para pedir cancelamento na simulação.
  update public.admin_marketing_sim_outbox set proxima_verificacao_em=now()
    where dados->>'estado' not in ('publicado','cancelado','falhou','precisa-conferir')
      and (p_rede='global' or dados->'alvo'->>'rede'=p_rede);
end $$;
revoke all on function public.admin_marketing_sim_proxima(jsonb),public.admin_marketing_sim_cas(text,integer,jsonb),
  public.admin_marketing_sim_pausar(text,boolean) from public,anon,authenticated;
grant execute on function public.admin_marketing_sim_proxima(jsonb),public.admin_marketing_sim_cas(text,integer,jsonb),
  public.admin_marketing_sim_pausar(text,boolean) to service_role;
commit;
