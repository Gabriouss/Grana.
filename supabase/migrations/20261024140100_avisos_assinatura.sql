-- Fase 4: executar somente pelo roteiro de implantação autorizado pelo autor.
create table if not exists public.avisos_assinatura_enviados (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  tipo text not null check (tipo in ('antes_7','antes_3','antes_1','venceu')),
  data_limite timestamptz not null,
  estado text not null default 'reservado' check (estado in ('reservado','enviado','incerto','falhou')),
  reservado_em timestamptz not null default now(),
  concluido_em timestamptz,
  provedor_id text,
  codigo text,
  unique (subscription_id, tipo, data_limite)
);
alter table public.avisos_assinatura_enviados enable row level security;
revoke all on public.avisos_assinatura_enviados from public, anon, authenticated;
grant select, insert, update, delete on public.avisos_assinatura_enviados to service_role;

-- Paginação por chave. Não expõe auth.users ou e-mails ao cliente.
create or replace function public.listar_assinaturas_para_avisos(p_apos uuid default null, p_limite integer default 500)
returns table (id uuid, user_id uuid, status text, access_until timestamptz, grace_until timestamptz,
  email_conta text, email_compra text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, s.status, s.access_until, s.grace_until,
    u.email, s.email_compra
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
  where (p_apos is null or s.id > p_apos)
    and u.deleted_at is null and not coalesce(u.is_anonymous, false)
    and (u.banned_until is null or u.banned_until <= statement_timestamp())
  order by s.id limit greatest(1, least(coalesce(p_limite, 500), 500));
$$;
revoke all on function public.listar_assinaturas_para_avisos(uuid,integer) from public, anon, authenticated;
grant execute on function public.listar_assinaturas_para_avisos(uuid,integer) to service_role;

-- A reserva é também a última conferência de elegibilidade. Serializa com
-- atualizações do webhook na assinatura e impede duas execuções do cron.
create or replace function public.reservar_aviso_assinatura(p_subscription_id uuid, p_tipo text, p_data_limite timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions%rowtype;
  prazo timestamptz;
  email_destino text;
  aviso uuid;
  dias integer;
begin
  if not coalesce((select enforce_subscriptions from public.app_backend_config where id=1), false) then return null; end if;
  select * into s from public.subscriptions where id=p_subscription_id for update;
  if not found or s.user_id is null or s.status in ('refunded','chargeback') then return null; end if;
  prazo := case when s.status='past_due' then coalesce(s.grace_until,s.access_until) else s.access_until end;
  if prazo is distinct from p_data_limite then return null; end if;
  dias := (prazo at time zone 'America/Sao_Paulo')::date - (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
  if p_tipo='venceu' then
    if prazo >= statement_timestamp() or prazo < statement_timestamp()-interval '24 hours' then return null; end if;
    if exists(select 1 from public.subscriptions r where r.user_id=s.user_id and
      (r.access_until >= statement_timestamp() or (r.status='past_due' and r.grace_until >= statement_timestamp()))) then return null; end if;
  elsif s.status not in ('canceled','past_due') or prazo <= statement_timestamp()
    or p_tipo is distinct from ('antes_' || dias::text) or dias not in (7,3,1) then return null;
  elsif exists(select 1 from public.subscriptions r where r.user_id=s.user_id and r.id<>s.id
    and (greatest(r.access_until,case when r.status='past_due' then r.grace_until end) > prazo
      or (greatest(r.access_until,case when r.status='past_due' then r.grace_until end) = prazo
        and (r.status='active' or r.id<s.id)))) then return null;
  end if;
  select coalesce(nullif(trim(u.email),''),nullif(trim(s.email_compra),'')) into email_destino
    from auth.users u where u.id=s.user_id and u.deleted_at is null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until <= statement_timestamp());
  if email_destino is null then return null; end if;
  insert into public.avisos_assinatura_enviados(subscription_id,tipo,data_limite)
    values(s.id,p_tipo,prazo) on conflict(subscription_id,tipo,data_limite) do nothing returning id into aviso;
  if aviso is null then return null; end if;
  return jsonb_build_object('id',aviso,'email',email_destino,'status',s.status);
end;
$$;
revoke all on function public.reservar_aviso_assinatura(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.reservar_aviso_assinatura(uuid,text,timestamptz) to service_role;

-- O cron nasce INATIVO. O roteiro só o ativa após deploy e conferências.
-- Os valores dos segredos são cadastrados fora do Git, no Supabase Vault.
select cron.schedule('grana-avisos-assinatura', '0 13 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='assinatura_project_url') || '/functions/v1/avisos-assinatura',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='assinatura_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 110000);
$job$);
select cron.alter_job(jobid, active := false) from cron.job where jobname='grana-avisos-assinatura';
