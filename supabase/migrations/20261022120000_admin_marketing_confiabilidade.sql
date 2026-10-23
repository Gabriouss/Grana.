-- Confiabilidade Meta. APLICACAO depende de revisao e sinal do maestro.
-- Nao instala cron nem amplia autorizacoes existentes. service_role exclusivamente.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
grant update(destinos,hash) on public.admin_marketing_real_previas to service_role;
alter table public.admin_marketing_controles add column email_envio_habilitado boolean not null default false,
 add column email_autorizacao_id uuid,add column email_autorizado_em timestamptz;
grant update(email_envio_habilitado,email_autorizacao_id,email_autorizado_em) on public.admin_marketing_controles to service_role;
grant update(iniciado_em,tentativa) on public.admin_marketing_envios to service_role;
alter table public.admin_marketing_controles add column politica_2h_habilitada boolean not null default false;
grant update(politica_2h_habilitada) on public.admin_marketing_controles to service_role;
alter table public.admin_marketing_real_contas add column meta_proxima_admissao_em timestamptz;
grant update(meta_proxima_admissao_em) on public.admin_marketing_real_contas to service_role;

alter table public.admin_marketing_autorizacoes
 add column politica_execucao text not null default 'legado-15min',
 add column executar_ate timestamptz;
update public.admin_marketing_autorizacoes set executar_ate=publicar_em+interval '15 minutes';
alter table public.admin_marketing_autorizacoes alter column executar_ate set not null;
alter table public.admin_marketing_autorizacoes add constraint admin_marketing_prazo_politica check
 (politica_execucao in ('legado-15min','recuperacao-2h-v1') and executar_ate=publicar_em+
 case politica_execucao when 'recuperacao-2h-v1' then interval '2 hours' else interval '15 minutes' end);

create function public.admin_marketing_real_limite(p_publicar timestamptz,p_politica text)
returns timestamptz language sql immutable security invoker set search_path='' as $$
 select p_publicar+case p_politica when 'recuperacao-2h-v1' then interval '2 hours'
 when 'legado-15min' then interval '15 minutes' end
$$;
create function public.admin_marketing_real_prazo_valido(p_publicar timestamptz,p_politica text,p_agora timestamptz default now())
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(p_agora<=public.admin_marketing_real_limite(p_publicar,p_politica),false)
$$;

create function public.admin_marketing_real_autorizacao_prazo()
returns trigger language plpgsql security invoker set search_path='' as $$
declare d jsonb:=new.manifesto->'_destino';
begin
 if tg_op='UPDATE' then
  if (new.publicar_em,new.executar_ate,new.politica_execucao,new.manifesto,new.chave,new.admin_id,new.rede,new.conta_destino,new.formato)
   is distinct from (old.publicar_em,old.executar_ate,old.politica_execucao,old.manifesto,old.chave,old.admin_id,old.rede,old.conta_destino,old.formato)
   then raise exception 'autorizacao-imutavel';end if;
  return new;
 end if;
 new.politica_execucao:=coalesce(d->>'politicaExecucao','legado-15min');
 new.executar_ate:=public.admin_marketing_real_limite(new.publicar_em,new.politica_execucao);
 if new.executar_ate is null then raise exception 'politica-invalida';end if;
 if new.politica_execucao='recuperacao-2h-v1' and
  (d->'consentimentoExecucao' is distinct from 'true'::jsonb or d->>'executarAte' is null
   or (d->>'executarAte')::timestamptz<>new.executar_ate)
  then raise exception 'consentimento-invalido';end if;
 if not public.admin_marketing_real_prazo_valido(new.publicar_em,new.politica_execucao) then raise exception 'autorizacao-vencida';end if;
 return new;
end $$;
create trigger admin_marketing_autorizacao_prazo before insert or update on public.admin_marketing_autorizacoes
for each row execute function public.admin_marketing_real_autorizacao_prazo();

-- Wrappers preservam assinaturas legadas. Sem capacidade explicita nao se confirma 2h.
create function public.admin_marketing_real_exigir_capacidade(p_previa uuid,p_capacidades jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.admin_marketing_real_previas p,jsonb_array_elements(p.destinos) d where p.id=p_previa
  and d->>'politicaExecucao'='recuperacao-2h-v1') and not coalesce(p_capacidades @> '["execucao-2h-v1"]'::jsonb,false)
 then raise exception 'atualizar-cliente';end if;
end $$;

-- Incidente e painel/email sao gravados na mesma transacao do estado do job.
create table public.admin_marketing_incidentes (
 id uuid primary key default gen_random_uuid(),admin_id uuid not null,
 chave text not null unique,codigo text not null check(codigo ~ '^[a-z0-9-]{1,80}$'),
 agendamento_id uuid references public.admin_marketing_agendamentos(id),rede text,
 criado_em timestamptz not null default now(),reconhecido_em timestamptz,resolvido_em timestamptz,
 proximo_lembrete_em timestamptz not null default now()+interval '30 minutes',sequencia integer not null default 0);
create table public.admin_marketing_email_outbox (
 id uuid primary key default gen_random_uuid(),incidente_id uuid not null references public.admin_marketing_incidentes(id),
 sequencia integer not null default 0,estado text not null default 'pendente' check(estado in ('pendente','enviando','aceito','incerto','falhou')),
 tentativas integer not null default 0,criado_em timestamptz not null default now(),disponivel_em timestamptz not null default now(),
 lease_id uuid,lease_ate timestamptz,primeiro_envio_em timestamptz,provedor_id text,codigo_erro text,
 entrega_estado text not null default 'nao-verificada' check(entrega_estado in ('nao-verificada','entregue','falhou','adiada')),
 entrega_verificada_em timestamptz,proximo_status_em timestamptz not null default now(),
 unique(incidente_id,sequencia));
create table public.admin_marketing_incidentes_ack(admin_id uuid not null,idempotencia uuid not null,
 incidente_id uuid not null references public.admin_marketing_incidentes(id),primary key(admin_id,idempotencia));
alter table public.admin_marketing_incidentes_ack enable row level security;
revoke all on public.admin_marketing_incidentes_ack from public,anon,authenticated;
grant select,insert on public.admin_marketing_incidentes_ack to service_role;
create index admin_marketing_incidentes_abertos_idx on public.admin_marketing_incidentes(proximo_lembrete_em,id) where resolvido_em is null;
create index admin_marketing_email_fila_idx on public.admin_marketing_email_outbox(disponivel_em,id) where estado in ('pendente','enviando');
create table public.admin_marketing_monitor_saude(id boolean primary key default true check(id),concluido_em timestamptz not null default now());
create table public.admin_marketing_integracoes_saude(id boolean primary key default true check(id),
 worker_hc_em timestamptz,monitor_hc_em timestamptz,email_aceito_em timestamptz,email_falhou_em timestamptz);
alter table public.admin_marketing_integracoes_saude enable row level security;
revoke all on public.admin_marketing_integracoes_saude from public,anon,authenticated;
grant select,insert,update on public.admin_marketing_integracoes_saude to service_role;
create table public.admin_marketing_email_saude(id boolean primary key default true check(id),
 concluido_em timestamptz not null default now(),configurado boolean not null,saudavel boolean not null,codigo text);
alter table public.admin_marketing_email_saude enable row level security;
revoke all on public.admin_marketing_email_saude from public,anon,authenticated;
grant select,insert,update on public.admin_marketing_email_saude to service_role;
create table public.admin_marketing_ids_diario (
 id uuid primary key default gen_random_uuid(),envio_id uuid not null references public.admin_marketing_envios(id),tentativa integer not null,
 agendamento_id uuid not null references public.admin_marketing_agendamentos(id),rede text not null,
 conta_id uuid not null references public.admin_marketing_real_contas(id),etapa text not null,
 resultado jsonb not null check(octet_length(resultado::text)<=65536),criado_em timestamptz not null default now(),unique(envio_id,tentativa));
create index admin_marketing_ids_job_idx on public.admin_marketing_ids_diario(agendamento_id,criado_em);
alter table public.admin_marketing_incidentes enable row level security;
alter table public.admin_marketing_email_outbox enable row level security;
alter table public.admin_marketing_monitor_saude enable row level security;
alter table public.admin_marketing_ids_diario enable row level security;
revoke all on public.admin_marketing_incidentes,public.admin_marketing_email_outbox,public.admin_marketing_monitor_saude,public.admin_marketing_ids_diario from public,anon,authenticated;
grant select,insert,update on public.admin_marketing_incidentes,public.admin_marketing_email_outbox,public.admin_marketing_monitor_saude to service_role;
grant select,insert on public.admin_marketing_ids_diario to service_role;

create function public.admin_marketing_real_incidente_abrir(p_admin uuid,p_chave text,p_codigo text,p_job uuid default null,p_rede text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare iid uuid;h text:=encode(sha256(convert_to(p_admin::text||':'||p_chave,'UTF8')),'hex');
begin
 insert into public.admin_marketing_incidentes(admin_id,chave,codigo,agendamento_id,rede)
 values(p_admin,h,p_codigo,p_job,p_rede) on conflict(chave) do nothing returning id into iid;
 if iid is null then select id into iid from public.admin_marketing_incidentes where chave=h;return iid;end if;
 insert into public.admin_marketing_notificacoes(destinatario_id,chave,codigo,importancia,agendamento_id)
 values(p_admin,h,p_codigo,'critica',p_job) on conflict(destinatario_id,chave) do nothing;
 insert into public.admin_marketing_email_outbox(incidente_id) values(iid) on conflict do nothing;
 return iid;
end $$;
create function public.admin_marketing_real_incidente_estado()
returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.admin_marketing_autorizacoes;
begin
 select * into a from public.admin_marketing_autorizacoes where id=new.autorizacao_id;
 if new.estado in ('precisa-conferir','falhou') then
  perform public.admin_marketing_real_incidente_abrir(a.admin_id,new.id::text||':'||new.estado,
   case when new.estado='precisa-conferir' then 'publicacao-incerta' else 'publicacao-falhou' end,new.id,a.rede);
 elsif new.estado in ('publicado','cancelado') then
  update public.admin_marketing_notificacoes n set resolvida_em=now() from public.admin_marketing_incidentes i
   where i.agendamento_id=new.id and n.chave=i.chave and n.resolvida_em is null;
  update public.admin_marketing_incidentes set resolvido_em=now() where agendamento_id=new.id and resolvido_em is null;
 end if;
 return new;
end $$;
create trigger admin_marketing_incidente_estado after insert or update on public.admin_marketing_agendamentos
for each row execute function public.admin_marketing_real_incidente_estado();

create function public.admin_marketing_real_incidentes(p_admin uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('incidentes',coalesce(jsonb_agg(jsonb_build_object('incidenteId',id,'codigo',codigo,
 'jobId',agendamento_id,'rede',rede,'criadoEm',criado_em,'reconhecidoEm',reconhecido_em,'resolvidoEm',resolvido_em,
 'proximoLembreteEm',proximo_lembrete_em,
 'emailEstado',(select o.estado from public.admin_marketing_email_outbox o where o.incidente_id=i.id order by o.sequencia desc limit 1),
 'emailCodigo',(select o.codigo_erro from public.admin_marketing_email_outbox o where o.incidente_id=i.id order by o.sequencia desc limit 1),
 'emailEntrega',(select o.entrega_estado from public.admin_marketing_email_outbox o where o.incidente_id=i.id order by o.sequencia desc limit 1)) order by criado_em desc),'[]'::jsonb),
 'naoReconhecidos',(select count(*) from public.admin_marketing_incidentes where admin_id=p_admin and reconhecido_em is null and resolvido_em is null),
 'incidentesLimitados',(select count(*)>100 from public.admin_marketing_incidentes where admin_id=p_admin))
 from (select * from public.admin_marketing_incidentes where admin_id=p_admin order by criado_em desc,id desc limit 100) i
$$;
create function public.admin_marketing_real_incidente_reconhecer(p_admin uuid,p_incidente uuid,p_idempotencia uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_admin is null or p_idempotencia is null then raise exception 'pedido-invalido';end if;
 if not exists(select 1 from public.admin_marketing_incidentes where id=p_incidente and admin_id=p_admin) then raise exception 'incidente-inexistente';end if;
 insert into public.admin_marketing_incidentes_ack(admin_id,idempotencia,incidente_id) values(p_admin,p_idempotencia,p_incidente) on conflict do nothing;
 if exists(select 1 from public.admin_marketing_incidentes_ack where admin_id=p_admin and idempotencia=p_idempotencia and incidente_id<>p_incidente)
 then raise exception 'idempotencia-divergente';end if;
 update public.admin_marketing_incidentes set reconhecido_em=coalesce(reconhecido_em,now()),
 proximo_lembrete_em=case when reconhecido_em is null then now()+interval '1 day' else proximo_lembrete_em end
 where id=p_incidente and admin_id=p_admin;
 if not found then raise exception 'incidente-inexistente';end if;
 update public.admin_marketing_notificacoes n set lida_em=coalesce(lida_em,now()) from public.admin_marketing_incidentes i
 where i.id=p_incidente and i.admin_id=p_admin and n.chave=i.chave;
 return public.admin_marketing_real_incidentes(p_admin);
end $$;


create function public.admin_marketing_real_email_liberado()
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select email_envio_habilitado and email_autorizacao_id is not null and email_autorizado_em is not null
  from public.admin_marketing_controles where id),false)
$$;
create function public.admin_marketing_real_email_liberar(p_autorizacao uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.admin_marketing_controles;
begin
 if p_autorizacao is null then raise exception 'consentimento-email-ausente';end if;
 select * into c from public.admin_marketing_controles where id for update;
 if not found then raise exception 'controles-ausentes';end if;
 if c.email_envio_habilitado and c.email_autorizacao_id is distinct from p_autorizacao then raise exception 'autorizacao-email-divergente';end if;
 update public.admin_marketing_controles set email_envio_habilitado=true,email_autorizacao_id=p_autorizacao,
  email_autorizado_em=case when c.email_envio_habilitado then c.email_autorizado_em else now() end where id;
 return true;
end $$;
create function public.admin_marketing_real_email_saude()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('saudavel',public.admin_marketing_real_email_liberado() and
  coalesce((select configurado and saudavel and concluido_em>now()-interval '3 minutes' from public.admin_marketing_email_saude where id),false)
  and not exists(select 1 from public.admin_marketing_integracoes_saude where id and email_falhou_em is not null and (email_aceito_em is null or email_falhou_em>=email_aceito_em))
  and not exists(select 1 from public.admin_marketing_email_outbox o join public.admin_marketing_incidentes i on i.id=o.incidente_id
   where i.resolvido_em is null and not exists(select 1 from public.admin_marketing_email_outbox nova
    where nova.incidente_id=o.incidente_id and nova.sequencia>o.sequencia and nova.estado='aceito' and nova.entrega_estado<>'falhou')
   and (o.estado in ('falhou','incerto') or o.codigo_erro='email-configuracao-ausente'
    or (o.estado in ('pendente','enviando') and o.criado_em<now()-interval '2 minutes')
    or (o.estado='aceito' and o.entrega_estado<>'entregue' and o.primeiro_envio_em<now()-interval '10 minutes'))),
  'dispatcherEm',(select concluido_em from public.admin_marketing_email_saude where id),
  'configurado',coalesce((select configurado from public.admin_marketing_email_saude where id),false),
  'falhas',(select count(*) from public.admin_marketing_email_outbox o join public.admin_marketing_incidentes i on i.id=o.incidente_id where i.resolvido_em is null and o.estado in ('falhou','incerto')),
  'atrasados',(select count(*) from public.admin_marketing_email_outbox o join public.admin_marketing_incidentes i on i.id=o.incidente_id where i.resolvido_em is null and o.estado in ('pendente','enviando') and o.criado_em<now()-interval '2 minutes'))
$$;
create function public.admin_marketing_real_email_concluido(p_configurado boolean,p_saudavel boolean,p_codigo text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_codigo is not null and p_codigo !~ '^[a-z0-9-]{1,80}$' then raise exception 'pedido-invalido';end if;
 insert into public.admin_marketing_email_saude(id,configurado,saudavel,codigo) values(true,p_configurado,p_saudavel,p_codigo)
 on conflict(id) do update set concluido_em=now(),configurado=excluded.configurado,saudavel=excluded.saudavel,codigo=excluded.codigo;
end $$;
create function public.admin_marketing_real_politica_pronta()
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select c.politica_2h_habilitada and m.concluido_em>now()-interval '3 minutes'
 and i.worker_hc_em>now()-interval '3 minutes' and i.monitor_hc_em>now()-interval '3 minutes'
 and i.email_aceito_em is not null and (i.email_falhou_em is null or i.email_aceito_em>i.email_falhou_em)
 and (public.admin_marketing_real_email_saude()->>'saudavel')::boolean
 from public.admin_marketing_controles c join public.admin_marketing_monitor_saude m on m.id=c.id
 join public.admin_marketing_integracoes_saude i on i.id=c.id where c.id),false)
$$;
create function public.admin_marketing_real_integracao_recibo(p_alvo text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_alvo not in ('WORKER','MONITOR') then raise exception 'pedido-invalido';end if;
 insert into public.admin_marketing_integracoes_saude(id,worker_hc_em,monitor_hc_em)
 values(true,case when p_alvo='WORKER' then now() end,case when p_alvo='MONITOR' then now() end)
 on conflict(id) do update set worker_hc_em=case when p_alvo='WORKER' then now() else admin_marketing_integracoes_saude.worker_hc_em end,
 monitor_hc_em=case when p_alvo='MONITOR' then now() else admin_marketing_integracoes_saude.monitor_hc_em end;
end $$;
create function public.admin_marketing_real_efeito_pendente(p_job uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.admin_marketing_envios e where e.agendamento_id=p_job and e.estado='incerto'
  and e.efeito_admitido_em is not null and not exists(select 1 from public.admin_marketing_ids_diario d
   where d.envio_id=e.id and d.tentativa=e.tentativa and d.resultado->>'estado' in ('preparo-parcial','processando','pronto','publicacao-aceita','publicado')))
$$;
create function public.admin_marketing_real_intento_retomavel(p_job uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.admin_marketing_envios e join public.admin_marketing_agendamentos j on j.id=e.agendamento_id
 join public.admin_marketing_autorizacoes a on a.id=j.autorizacao_id
 where j.id=p_job and a.politica_execucao='recuperacao-2h-v1' and e.operacao='publicar' and e.efeito_admitido_em is null
 and e.estado='falhou' and e.codigo_erro in ('efeito-nao-admitido','lease-vencida-sem-efeito','sem-efeito','snapshot-indisponivel','midia-indisponivel')
 and public.admin_marketing_real_prazo_valido(a.publicar_em,a.politica_execucao))
$$;
create function public.admin_marketing_real_decorar(p_dados jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare lista jsonb; resultados jsonb;
begin
 if p_dados ? 'controles' then p_dados:=jsonb_set(p_dados,'{controles}',(p_dados->'controles')||jsonb_build_object('recuperacao2hDisponivel',public.admin_marketing_real_politica_pronta()));end if;
 if not (p_dados ? 'jobs') then return p_dados;end if;
 select coalesce(jsonb_agg(d||jsonb_build_object('publicarEm',a.publicar_em,'executarAte',a.executar_ate,'politicaExecucao',a.politica_execucao,
 'proximaAcao',case when g.estado in ('publicado','cancelado') then 'concluido' when g.estado in ('precisa-conferir','falhou') then 'conferir'
 when not public.admin_marketing_real_prazo_valido(a.publicar_em,a.politica_execucao) then 'prazo-encerrado'
 when now()>a.publicar_em then 'recuperar' else 'aguardar' end,
 'destino',(d->'destino')||jsonb_build_object('executarAte',a.executar_ate,'politicaExecucao',a.politica_execucao)) order by n),'[]'::jsonb)
 into lista from jsonb_array_elements(p_dados->'jobs') with ordinality x(d,n)
 join public.admin_marketing_agendamentos g on g.id=(d->>'jobId')::uuid
 join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id;
 select coalesce(jsonb_agg(jsonb_build_object('rede',d->'destino'->>'rede','contaId',d->'destino'->>'contaId',
 'jobId',d->>'jobId','estado',d->>'estado','remotoId',d->>'remotoId','permalink',d->>'permalink',
 'publicarEm',d->>'publicarEm','executarAte',d->>'executarAte','politicaExecucao',d->>'politicaExecucao','proximaAcao',d->>'proximaAcao')),'[]'::jsonb)
 into resultados from jsonb_array_elements(lista) d;
 return p_dados||jsonb_build_object('jobs',lista,'resultadoPorRede',resultados);
end $$;

-- DEFINICOES INTEGRADAS: corpos explicitos para auditoria, sem pg_get_functiondef em producao.
create or replace function public.admin_marketing_real_claim(p_worker uuid,p_limite integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare controles public.admin_marketing_controles; g public.admin_marketing_agendamentos;
  a public.admin_marketing_autorizacoes; c public.admin_marketing_real_contas;
  s public.admin_marketing_real_snapshots; e uuid; fence uuid; t integer; sem_efeito boolean; saida jsonb:='[]';
begin
  if p_worker is null or p_limite not between 1 and 3 then raise exception 'pedido-invalido'; end if;
  select * into controles from public.admin_marketing_controles where id for update;
  perform public.admin_marketing_real_diario_recuperar();
  update public.admin_marketing_agendamentos j set estado='precisa-conferir',codigo_erro='efeito-anterior-incerto',revisao=revisao+1
   where j.lease_id is null and j.estado='programado-no-painel' and j.etapa in ('preparar','publicar') and public.admin_marketing_real_efeito_pendente(j.id);
  -- Recuperação serializada com admitir/recibo/reagendar. Nunca apaga a etapa.
  for g in select * from public.admin_marketing_agendamentos where snapshot_id is not null
    and lease_expira_em<=now() order by id for update skip locked loop
    select exists(select 1 from public.admin_marketing_envios v where v.agendamento_id=g.id
      and v.operacao=g.etapa and v.estado='iniciado' and v.efeito_admitido_em is null)
      and not exists(select 1 from public.admin_marketing_envios v where v.agendamento_id=g.id
        and v.operacao=g.etapa and v.estado='iniciado' and v.efeito_admitido_em is not null) into sem_efeito;
    update public.admin_marketing_envios set estado=case when efeito_admitido_em is null
        and (operacao not in ('publicar','cancelar') or (operacao='publicar' and (select politica_execucao from public.admin_marketing_autorizacoes where id=g.autorizacao_id)='recuperacao-2h-v1')) then 'falhou' else 'incerto' end,
      terminado_em=now(),codigo_erro=case when efeito_admitido_em is null and (operacao not in ('publicar','cancelar') or (operacao='publicar' and (select politica_execucao from public.admin_marketing_autorizacoes where id=g.autorizacao_id)='recuperacao-2h-v1'))
        then 'lease-vencida-sem-efeito' else 'lease-vencida' end
      where agendamento_id=g.id and estado='iniciado';
    update public.admin_marketing_agendamentos set
      estado=case when g.etapa in ('consultar-preparo','verificar-publicacao','reconciliar')
        or (g.etapa in ('preparar','publicar') and sem_efeito and (g.etapa='preparar' or (select politica_execucao from public.admin_marketing_autorizacoes where id=g.autorizacao_id)='recuperacao-2h-v1'))
        then 'programado-no-painel' else 'precisa-conferir' end,
      etapa_interrompida=case when g.etapa='reconciliar' then coalesce(g.etapa_interrompida,g.etapa) else g.etapa end,
      etapa=case when g.etapa='publicar' and not sem_efeito then 'reconciliar' else g.etapa end,
      lease_id=null,worker_id=null,lease_expira_em=null,lease_revisao=null,
      codigo_erro='lease-vencida',revisao=revisao+1,atualizado_em=now() where id=g.id;
  end loop;
  -- Retirar esgotados ANTES do LIMIT: não ocupar as vagas da fila com continue.
  update public.admin_marketing_agendamentos j set estado='precisa-conferir',codigo_erro='tentativas-esgotadas',
    revisao=j.revisao+1,atualizado_em=now()
    where j.snapshot_id is not null and j.lease_id is null and j.estado in ('programado-no-painel','cancelamento-pendente')
      and (select coalesce(max(v.tentativa),0) from public.admin_marketing_envios v
        where v.agendamento_id=j.id and v.operacao=j.etapa)>=1000;
  update public.admin_marketing_agendamentos j set estado='programado-no-painel',etapa=case when j.processamento ? 'publicacaoId' or j.remoto_id is not null then 'reconciliar' else 'consultar-preparo' end
    from public.admin_marketing_autorizacoes au where au.id=j.autorizacao_id and au.politica_execucao='recuperacao-2h-v1'
     and j.estado='precisa-conferir' and j.lease_id is null and j.proxima_verificacao_em<=now()
     and (j.processamento ? 'publicacaoId' or j.remoto_id is not null);
  -- Quem espera (pausa, conta sem conexao, publicar antes do horario) sai no
  -- WHERE: pulado dentro do loop ocupava o LIMIT e travava a fila inteira (B1).
  -- Só consultas atravessam pausa/validade vencida. Nenhum POST novo.
  -- Nunca transformar a falta de token em sucesso.
  for g in select j.* from public.admin_marketing_agendamentos j
    join public.admin_marketing_autorizacoes ja on ja.id=j.autorizacao_id
    join public.admin_marketing_real_contas jc on jc.id=j.conta_id
    where j.snapshot_id is not null and j.lease_id is null and j.proxima_verificacao_em<=now()
      and j.estado in ('programado-no-painel','cancelamento-pendente')
      and not (j.etapa='publicar' and ja.publicar_em>now())
      and (j.etapa not in ('preparar','publicar') or jc.meta_proxima_admissao_em is null or jc.meta_proxima_admissao_em<=now())
      and (j.etapa in ('consultar-preparo','verificar-publicacao','reconciliar') or (
        controles.habilitado and not controles.recuperacao_pendente and controles.margem_validada_ate>now()
        and controles.capacidade_validada_em>=now()-interval '1 day'
        and not controles.pausa_global and not j.pausado and not jc.pausada
        and jc.conexao='verificada' and jc.valida_ate>now()
        and not (jc.rede='facebook' and controles.pausa_facebook) and not (jc.rede='instagram' and controles.pausa_instagram)
        and (select count(*) from public.admin_marketing_envios where iniciado_em>now()-interval '1 minute')<12))
    order by j.proxima_verificacao_em,j.id for update of j skip locked limit p_limite loop
    select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
    select * into c from public.admin_marketing_real_contas where id=g.conta_id;
    select * into s from public.admin_marketing_real_snapshots where id=g.snapshot_id;
    if g.etapa in ('preparar','publicar') then
      if s.estado<>'pronto' or g.aceite_revogado_em is not null or not public.admin_marketing_real_prazo_valido(a.publicar_em,a.politica_execucao)
        or c.revisao<>(a.manifesto->'_destino'->>'contaRevisao')::integer
        or not exists(select 1 from jsonb_array_elements(c.capacidades) k where k->>'formato'=a.formato
          and k->>'estado'='disponivel' and (k->>'revisao')::integer=(a.manifesto->'_destino'->>'capacidadeRevisao')::integer) then
        update public.admin_marketing_agendamentos set estado='precisa-conferir',codigo_erro='autorizacao-vencida',
          revisao=revisao+1,atualizado_em=now() where id=g.id; continue;
      end if;
    end if;
    if g.etapa='publicar' and exists(select 1 from public.admin_marketing_envios where agendamento_id=g.id and operacao='publicar')
      and not public.admin_marketing_real_intento_retomavel(g.id) then
      update public.admin_marketing_agendamentos set estado='precisa-conferir',codigo_erro='publicacao-ja-iniciada',
        revisao=revisao+1,atualizado_em=now() where id=g.id; continue;
    end if;
    select coalesce(max(tentativa),0)+1 into t from public.admin_marketing_envios where agendamento_id=g.id and operacao=g.etapa;
    if t>1000 then continue; end if;
    fence:=gen_random_uuid();
    if g.etapa='publicar' and public.admin_marketing_real_intento_retomavel(g.id) then
      update public.admin_marketing_envios set estado='iniciado',iniciado_em=now(),terminado_em=null,codigo_erro=null,tentativa=t
       where agendamento_id=g.id and operacao='publicar' returning id into e;
    else
    insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao)
      values(g.id,encode(sha256(convert_to(g.id::text||':'||g.etapa||':'||t,'UTF8')),'hex'),t,g.etapa) returning id into e;
    end if;
    update public.admin_marketing_agendamentos set estado='preparando',lease_id=fence,lease_expira_em=now()+interval '2 minutes',
      worker_id=p_worker,lease_revisao=revisao+1,revisao=revisao+1,atualizado_em=now() where id=g.id returning * into g;
    saida:=saida||jsonb_build_array(jsonb_build_object('jobId',g.id,'leaseId',fence,'revisao',g.revisao,'envioId',e,
      'etapa',g.etapa,'processamento',g.processamento,'snapshotId',g.snapshot_id,'contaId',g.conta_id,
      'rede',c.rede,'formato',a.formato,'publicarEm',a.publicar_em,'executarAte',a.executar_ate,'politicaExecucao',a.politica_execucao,'credencialRef',c.credencial_ref,'remotoContaId',c.remoto_id));
  end loop;
  return saida;
end $$;

create or replace function public.admin_marketing_real_admitir(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare g public.admin_marketing_agendamentos; c public.admin_marketing_controles;
  conta public.admin_marketing_real_contas; a public.admin_marketing_autorizacoes; n integer;
begin
  select * into c from public.admin_marketing_controles where id for update;
  select * into g from public.admin_marketing_agendamentos where id=p_job for update;
  if not found or g.worker_id is distinct from p_worker or g.lease_id is distinct from p_lease
    or g.lease_revisao is distinct from p_revisao or g.lease_expira_em<=now() then return false; end if;
  select * into conta from public.admin_marketing_real_contas where id=g.conta_id;
  select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
  if public.admin_marketing_real_efeito_pendente(g.id) or g.etapa not in ('preparar','publicar') or c.margem_validada_ate is null or c.margem_validada_ate<=now()
    or c.capacidade_validada_em is null or c.capacidade_validada_em<now()-interval '1 day'
    or conta.revisao is distinct from (a.manifesto->'_destino'->>'contaRevisao')::integer
    or not exists(select 1 from jsonb_array_elements(conta.capacidades) k where k->>'formato'=a.formato
      and k->>'estado'='disponivel' and (k->>'revisao')::integer=(a.manifesto->'_destino'->>'capacidadeRevisao')::integer)
    or not c.habilitado or c.recuperacao_pendente or c.pausa_global or conta.pausada or g.pausado
    or (conta.rede='facebook' and c.pausa_facebook) or (conta.rede='instagram' and c.pausa_instagram)
    or conta.meta_proxima_admissao_em>now() or conta.conexao<>'verificada' or conta.valida_ate is null or conta.valida_ate<=now()
    or g.aceite_revogado_em is not null or not public.admin_marketing_real_prazo_valido(a.publicar_em,a.politica_execucao)
    or (g.etapa='publicar' and a.publicar_em>now())
    or not exists(select 1 from public.admin_marketing_real_snapshots where id=g.snapshot_id and estado='pronto')
    then return false; end if;
  update public.admin_marketing_envios set efeito_admitido_em=now() where agendamento_id=g.id
    and operacao=g.etapa and estado='iniciado' and efeito_admitido_em is null;
  get diagnostics n=row_count;return n=1;
end $$;

create or replace function public.admin_marketing_real_recibo(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer,p_resultado jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.admin_marketing_agendamentos; v public.admin_marketing_envios;
  resultado text:=p_resultado->>'estado'; proxima text; estado_job text; rid text;
begin
  perform 1 from public.admin_marketing_controles where id for update;
  select * into g from public.admin_marketing_agendamentos where id=p_job and snapshot_id is not null for update;
  if not found or g.worker_id is distinct from p_worker or g.lease_id is distinct from p_lease
    or g.lease_revisao<>p_revisao or g.lease_expira_em<=now() then raise exception 'revisao-divergente'; end if;
  select * into v from public.admin_marketing_envios where agendamento_id=g.id and operacao=g.etapa and estado='iniciado' for update;
  if not found or resultado not in ('adiado','pronto','preparo-parcial','processando','publicacao-aceita','publicado','cancelado','falhou','incerto')
    or octet_length(p_resultado::text)>65536 then raise exception 'recibo-invalido'; end if;
  if exists(select 1 from jsonb_object_keys(p_resultado) k where k not in ('estado','processamento','remotoId','codigo','retryAfterSegundos'))
    then raise exception 'recibo-invalido'; end if;
  rid:=p_resultado->>'remotoId';
  if rid is not null and (char_length(rid)>200 or rid like 'sim-%') then raise exception 'recibo-invalido'; end if;
  proxima:=g.etapa; estado_job:='programado-no-painel';
  /* "Adiado" = a etapa nao produziu efeito e pode repetir. Vale so se o banco
     NAO admitiu efeito neste intento (todo POST passa por admitir antes de
     sair). Publicar e cancelar nunca sao adiados, e a decima tentativa vira
     conferencia humana, para uma consulta quebrada nao girar para sempre. */
  if resultado='adiado' and (v.efeito_admitido_em is not null or g.etapa='cancelar'
      or ((v.tentativa>=10 or g.etapa='publicar') and (select politica_execucao from public.admin_marketing_autorizacoes where id=g.autorizacao_id)<>'recuperacao-2h-v1')) then
    resultado:='incerto';
  end if;
  if resultado='adiado' then null;
  elsif resultado='preparo-parcial' and g.etapa in ('preparar','consultar-preparo') then proxima:='preparar';
  elsif resultado='pronto' and g.etapa in ('preparar','consultar-preparo') then proxima:='publicar';
  elsif resultado='processando' and g.etapa in ('preparar','consultar-preparo') then proxima:='consultar-preparo';
  elsif resultado='publicacao-aceita' and g.etapa='publicar' and rid is not null then proxima:='verificar-publicacao';
  elsif resultado='publicado' and g.etapa in ('verificar-publicacao','reconciliar') and rid is not null then estado_job:='publicado';
  elsif resultado='cancelado' and g.etapa in ('cancelar','reconciliar') then estado_job:='cancelado';
  elsif resultado='falhou' then estado_job:='falhou';
  elsif resultado='incerto' then estado_job:='precisa-conferir';
    proxima:=case when g.etapa in ('preparar','consultar-preparo') then g.etapa else 'reconciliar' end;
  else raise exception 'recibo-invalido'; end if;
  -- Inclusive worker anterior: recibo e diario aceitos na MESMA transacao.
  insert into public.admin_marketing_ids_diario(envio_id,tentativa,agendamento_id,rede,conta_id,etapa,resultado)
   select v.id,v.tentativa,g.id,c.rede,g.conta_id,g.etapa,p_resultado from public.admin_marketing_real_contas c where c.id=g.conta_id
   on conflict(envio_id,tentativa) do nothing;
  if exists(select 1 from public.admin_marketing_ids_diario d where d.envio_id=v.id and d.tentativa=v.tentativa and d.resultado is distinct from p_resultado)
   then raise exception 'idempotencia-divergente';end if;
  if p_resultado ? 'retryAfterSegundos' then update public.admin_marketing_real_contas set meta_proxima_admissao_em=now()+make_interval(secs=>least(3600,greatest(60,(p_resultado->>'retryAfterSegundos')::integer))) where id=g.conta_id;end if;
  update public.admin_marketing_envios set estado=case when resultado='incerto' then 'incerto' when resultado in ('falhou','adiado') then 'falhou' else 'confirmado' end,
    remoto_id=rid,codigo_erro=p_resultado->>'codigo',terminado_em=now() where id=v.id;
  update public.admin_marketing_agendamentos set estado=estado_job,etapa=proxima,
    etapa_interrompida=case when resultado='incerto' then
      case when g.etapa='reconciliar' then coalesce(g.etapa_interrompida,g.etapa) else g.etapa end else etapa_interrompida end,
    processamento=coalesce(p_resultado->'processamento',processamento),remoto_id=coalesce(rid,remoto_id),
    proxima_verificacao_em=case when proxima='publicar' then greatest(now()+interval '1 second',
      (select publicar_em from public.admin_marketing_autorizacoes where id=g.autorizacao_id))
      else now()+case when resultado='processando' then interval '30 seconds' when resultado='adiado' then make_interval(secs=>least(3600,greatest(60,coalesce((p_resultado->>'retryAfterSegundos')::integer,60)))) else interval '1 second' end end,
    concluido_em=case when estado_job in ('publicado','cancelado') then now() else null end,
    lease_id=null,lease_expira_em=null,lease_revisao=null,worker_id=null,codigo_erro=p_resultado->>'codigo',revisao=revisao+1,atualizado_em=now()
    where id=g.id returning * into g;
  return jsonb_build_object('jobId',g.id,'revisao',g.revisao,'estado',g.estado,'etapa',g.etapa);
end $$;

create or replace function public.admin_marketing_real_claim_v2(p_worker uuid,p_limite integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare controles public.admin_marketing_controles; g public.admin_marketing_agendamentos;
  a public.admin_marketing_autorizacoes; c public.admin_marketing_real_contas;
  s public.admin_marketing_real_snapshots; e uuid; fence uuid; t integer; saida jsonb:='[]'; sem_efeito boolean;
begin
  if p_worker is null or p_limite not between 1 and 3 then raise exception 'pedido-invalido'; end if;
  select * into controles from public.admin_marketing_controles where id for update;
  perform public.admin_marketing_real_diario_recuperar();
  update public.admin_marketing_agendamentos j set estado='precisa-conferir',codigo_erro='efeito-anterior-incerto',revisao=revisao+1
   where j.lease_id is null and j.estado='programado-no-painel' and j.etapa in ('preparar','publicar') and public.admin_marketing_real_efeito_pendente(j.id);
  -- Recuperação serializada com admitir/recibo/reagendar. Nunca apaga a etapa.
  for g in select * from public.admin_marketing_agendamentos where snapshot_id is not null
    and lease_expira_em<=now() order by id for update skip locked loop
    select exists(select 1 from public.admin_marketing_envios v where v.agendamento_id=g.id
      and v.operacao=g.etapa and v.estado='iniciado' and v.efeito_admitido_em is null)
      and not exists(select 1 from public.admin_marketing_envios v where v.agendamento_id=g.id
        and v.operacao=g.etapa and v.estado='iniciado' and v.efeito_admitido_em is not null) into sem_efeito;
    update public.admin_marketing_envios set estado=case when efeito_admitido_em is null
        and (operacao not in ('publicar','cancelar') or (operacao='publicar' and (select politica_execucao from public.admin_marketing_autorizacoes where id=g.autorizacao_id)='recuperacao-2h-v1')) then 'falhou' else 'incerto' end,
      terminado_em=now(),codigo_erro=case when efeito_admitido_em is null and (operacao not in ('publicar','cancelar') or (operacao='publicar' and (select politica_execucao from public.admin_marketing_autorizacoes where id=g.autorizacao_id)='recuperacao-2h-v1'))
        then 'lease-vencida-sem-efeito' else 'lease-vencida' end
      where agendamento_id=g.id and estado='iniciado';
    update public.admin_marketing_agendamentos set
      estado=case when g.etapa in ('consultar-preparo','verificar-publicacao','reconciliar')
        or (g.etapa in ('preparar','publicar') and sem_efeito and (g.etapa='preparar' or (select politica_execucao from public.admin_marketing_autorizacoes where id=g.autorizacao_id)='recuperacao-2h-v1'))
        then 'programado-no-painel' else 'precisa-conferir' end,
      etapa_interrompida=case when g.etapa='reconciliar' then coalesce(g.etapa_interrompida,g.etapa) else g.etapa end,
      etapa=case when g.etapa='publicar' and not sem_efeito then 'reconciliar' else g.etapa end,
      lease_id=null,worker_id=null,lease_expira_em=null,lease_revisao=null,
      codigo_erro='lease-vencida',revisao=revisao+1,atualizado_em=now() where id=g.id;
  end loop;
  -- Readback continua disponível sem capacidade de novos efeitos.
  update public.admin_marketing_agendamentos j set estado='precisa-conferir',etapa_interrompida=j.etapa,
    codigo_erro='tentativas-esgotadas',revisao=j.revisao+1,atualizado_em=now()
    where j.snapshot_id is not null and j.lease_id is null and j.estado in ('programado-no-painel','cancelamento-pendente')
      and (select coalesce(max(v.tentativa),0) from public.admin_marketing_envios v where v.agendamento_id=j.id and v.operacao=j.etapa)>=1000;
  -- Orçamento interno de admissoes do Grana., NAO quota de publicacao Meta.
  if (select count(*) from public.admin_marketing_envios where iniciado_em>now()-interval '1 minute')>=12 then return saida; end if;
  update public.admin_marketing_agendamentos j set estado='programado-no-painel',etapa=case when j.processamento ? 'publicacaoId' or j.remoto_id is not null then 'reconciliar' else 'consultar-preparo' end
    from public.admin_marketing_autorizacoes au where au.id=j.autorizacao_id and au.politica_execucao='recuperacao-2h-v1'
     and j.estado='precisa-conferir' and j.lease_id is null and j.proxima_verificacao_em<=now()
     and (j.processamento ? 'publicacaoId' or j.remoto_id is not null);
  -- Quem espera (pausa, conta sem conexao, publicar antes do horario) sai no
  -- WHERE: pulado dentro do loop ocupava o LIMIT e travava a fila inteira (B1).
  -- Consultas/cancelamento sao permitidos durante pausa/revogacao; POST de
  -- preparar/publicar nao. Nunca transformar a falta de token em sucesso.
  for g in select j.* from public.admin_marketing_agendamentos j
    join public.admin_marketing_autorizacoes ja on ja.id=j.autorizacao_id
    join public.admin_marketing_real_contas jc on jc.id=j.conta_id
    where j.snapshot_id is not null and j.lease_id is null and j.proxima_verificacao_em<=now()
      and j.estado in ('programado-no-painel','cancelamento-pendente')
      and not (j.etapa='publicar' and ja.publicar_em>now())
      and (j.etapa not in ('preparar','publicar') or jc.meta_proxima_admissao_em is null or jc.meta_proxima_admissao_em<=now())
      and not (j.etapa in ('preparar','publicar') and (not controles.habilitado or controles.recuperacao_pendente or controles.margem_validada_ate is null or controles.margem_validada_ate<=now() or controles.capacidade_validada_em is null or controles.capacidade_validada_em<now()-interval '1 day' or controles.pausa_global or j.pausado or jc.pausada
        or jc.conexao<>'verificada' or jc.valida_ate is null or jc.valida_ate<=now()
        or (jc.rede='facebook' and controles.pausa_facebook) or (jc.rede='instagram' and controles.pausa_instagram)))
    order by j.proxima_verificacao_em,j.id for update of j skip locked limit p_limite loop
    select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
    select * into c from public.admin_marketing_real_contas where id=g.conta_id;
    select * into s from public.admin_marketing_real_snapshots where id=g.snapshot_id;
    if g.etapa in ('preparar','publicar') then
      if s.estado<>'pronto' or (s.dados ? 'conteudoId' and not public.admin_marketing_real_editorial_valido_v2(a.admin_id,s.dados)) or g.aceite_revogado_em is not null or not public.admin_marketing_real_prazo_valido(a.publicar_em,a.politica_execucao)
        or c.revisao<>(a.manifesto->'_destino'->>'contaRevisao')::integer
        or not exists(select 1 from jsonb_array_elements(c.capacidades) k where k->>'formato'=a.formato
          and k->>'estado'='disponivel' and (k->>'revisao')::integer=(a.manifesto->'_destino'->>'capacidadeRevisao')::integer) then
        update public.admin_marketing_agendamentos set estado='precisa-conferir',codigo_erro='autorizacao-vencida',
          revisao=revisao+1,atualizado_em=now() where id=g.id; continue;
      end if;
    end if;
    if g.etapa='publicar' and exists(select 1 from public.admin_marketing_envios where agendamento_id=g.id and operacao='publicar')
      and not public.admin_marketing_real_intento_retomavel(g.id) then
      update public.admin_marketing_agendamentos set estado='precisa-conferir',codigo_erro='publicacao-ja-iniciada',
        revisao=revisao+1,atualizado_em=now() where id=g.id; continue;
    end if;
    select coalesce(max(tentativa),0)+1 into t from public.admin_marketing_envios where agendamento_id=g.id and operacao=g.etapa;
    if t>1000 then continue; end if;
    fence:=gen_random_uuid();
    if g.etapa='publicar' and public.admin_marketing_real_intento_retomavel(g.id) then
      update public.admin_marketing_envios set estado='iniciado',iniciado_em=now(),terminado_em=null,codigo_erro=null,tentativa=t
       where agendamento_id=g.id and operacao='publicar' returning id into e;
    else
    insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao)
      values(g.id,encode(sha256(convert_to(g.id::text||':'||g.etapa||':'||t,'UTF8')),'hex'),t,g.etapa) returning id into e;
    end if;
    update public.admin_marketing_agendamentos set estado='preparando',lease_id=fence,lease_expira_em=now()+interval '2 minutes',
      worker_id=p_worker,lease_revisao=revisao+1,revisao=revisao+1,atualizado_em=now() where id=g.id returning * into g;
    saida:=saida||jsonb_build_array(jsonb_build_object('jobId',g.id,'leaseId',fence,'revisao',g.revisao,'envioId',e,
      'remotoId',g.remoto_id,'etapaInterrompida',g.etapa_interrompida,'etapa',g.etapa,'processamento',g.processamento,'snapshotId',g.snapshot_id,'contaId',g.conta_id,
      'rede',c.rede,'formato',a.formato,'publicarEm',a.publicar_em,'executarAte',a.executar_ate,'politicaExecucao',a.politica_execucao,'credencialRef',c.credencial_ref,'remotoContaId',c.remoto_id));
  end loop;
  return saida;
end $$;

create or replace function public.admin_marketing_real_admitir_v2(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare g public.admin_marketing_agendamentos; c public.admin_marketing_controles;
  conta public.admin_marketing_real_contas; a public.admin_marketing_autorizacoes; n integer;
begin
  select * into c from public.admin_marketing_controles where id for update;
  select * into g from public.admin_marketing_agendamentos where id=p_job for update;
  if not found or g.worker_id is distinct from p_worker or g.lease_id is distinct from p_lease
    or g.lease_revisao is distinct from p_revisao or g.lease_expira_em<=now() then return false; end if;
  select * into conta from public.admin_marketing_real_contas where id=g.conta_id;
  select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
  if public.admin_marketing_real_efeito_pendente(g.id) or not c.habilitado or c.margem_validada_ate is null or c.margem_validada_ate<=now() or c.capacidade_validada_em is null or c.capacidade_validada_em<now()-interval '1 day' or c.recuperacao_pendente or c.pausa_global or conta.pausada or g.pausado
    or (conta.rede='facebook' and c.pausa_facebook) or (conta.rede='instagram' and c.pausa_instagram)
    or conta.meta_proxima_admissao_em>now() or conta.conexao<>'verificada' or conta.valida_ate is null or conta.valida_ate<=now()
    or conta.revisao<>(a.manifesto->'_destino'->>'contaRevisao')::integer or not exists(select 1 from jsonb_array_elements(conta.capacidades) k where k->>'formato'=a.formato and k->>'estado'='disponivel' and k->>'revisao'=a.manifesto->'_destino'->>'capacidadeRevisao') or g.aceite_revogado_em is not null or not public.admin_marketing_real_prazo_valido(a.publicar_em,a.politica_execucao)
    or (g.etapa='publicar' and a.publicar_em>now())
    or not exists(select 1 from public.admin_marketing_real_snapshots where id=g.snapshot_id and estado='pronto' and (not (dados ? 'conteudoId') or public.admin_marketing_real_editorial_valido_v2(a.admin_id,dados)))
    then return false; end if;
  update public.admin_marketing_envios set efeito_admitido_em=now() where agendamento_id=g.id
    and operacao=g.etapa and estado='iniciado' and efeito_admitido_em is null;
  get diagnostics n=row_count;return n=1;
end $$;

create or replace function public.admin_marketing_real_recibo_v2(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer,p_resultado jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.admin_marketing_agendamentos; v public.admin_marketing_envios;
  resultado text:=p_resultado->>'estado'; proxima text; estado_job text; rid text;
begin
  perform 1 from public.admin_marketing_controles where id for update;
  select * into g from public.admin_marketing_agendamentos where id=p_job and snapshot_id is not null for update;
  if not found or g.worker_id is distinct from p_worker or g.lease_id is distinct from p_lease
    or g.lease_revisao<>p_revisao or g.lease_expira_em<=now() then raise exception 'revisao-divergente'; end if;
  select * into v from public.admin_marketing_envios where agendamento_id=g.id and operacao=g.etapa and estado='iniciado' for update;
  if not found or resultado not in ('adiado','pronto','preparo-parcial','processando','publicacao-aceita','publicado','cancelado','falhou','incerto')
    or octet_length(p_resultado::text)>65536 then raise exception 'recibo-invalido'; end if;
  if exists(select 1 from jsonb_object_keys(p_resultado) k where k not in ('estado','processamento','remotoId','codigo','retryAfterSegundos'))
    then raise exception 'recibo-invalido'; end if;
  rid:=p_resultado->>'remotoId';
  if rid is not null and (char_length(rid)>200 or rid like 'sim-%') then raise exception 'recibo-invalido'; end if;
  proxima:=g.etapa; estado_job:='programado-no-painel';
  /* "Adiado" = a etapa nao produziu efeito e pode repetir. Vale so se o banco
     NAO admitiu efeito neste intento (todo POST passa por admitir antes de
     sair). Publicar e cancelar nunca sao adiados, e a decima tentativa vira
     conferencia humana, para uma consulta quebrada nao girar para sempre. */
  if resultado='adiado' and (v.efeito_admitido_em is not null or g.etapa='cancelar'
      or ((v.tentativa>=10 or g.etapa='publicar') and (select politica_execucao from public.admin_marketing_autorizacoes where id=g.autorizacao_id)<>'recuperacao-2h-v1')) then
    resultado:='incerto';
  end if;
  if resultado='adiado' then null;
  elsif resultado='preparo-parcial' and g.etapa in ('preparar','consultar-preparo') then proxima:='preparar';
  elsif resultado='pronto' and g.etapa in ('preparar','consultar-preparo') then proxima:='publicar';
  elsif resultado='processando' and g.etapa in ('preparar','consultar-preparo') then proxima:='consultar-preparo';
  elsif resultado='publicacao-aceita' and g.etapa='publicar' and rid is not null then proxima:='verificar-publicacao';
  elsif resultado='publicado' and g.etapa in ('verificar-publicacao','reconciliar') and rid is not null then estado_job:='publicado';
  elsif resultado='cancelado' and g.etapa in ('cancelar','reconciliar') then estado_job:='cancelado';
  elsif resultado='falhou' then estado_job:='falhou';
  elsif resultado='incerto' then estado_job:='precisa-conferir';proxima:='reconciliar';
  else raise exception 'recibo-invalido'; end if;
  -- Inclusive worker anterior: recibo e diario aceitos na MESMA transacao.
  insert into public.admin_marketing_ids_diario(envio_id,tentativa,agendamento_id,rede,conta_id,etapa,resultado)
   select v.id,v.tentativa,g.id,c.rede,g.conta_id,g.etapa,p_resultado from public.admin_marketing_real_contas c where c.id=g.conta_id
   on conflict(envio_id,tentativa) do nothing;
  if exists(select 1 from public.admin_marketing_ids_diario d where d.envio_id=v.id and d.tentativa=v.tentativa and d.resultado is distinct from p_resultado)
   then raise exception 'idempotencia-divergente';end if;
  if p_resultado ? 'retryAfterSegundos' then update public.admin_marketing_real_contas set meta_proxima_admissao_em=now()+make_interval(secs=>least(3600,greatest(60,(p_resultado->>'retryAfterSegundos')::integer))) where id=g.conta_id;end if;
  update public.admin_marketing_envios set estado=case when resultado='incerto' then 'incerto' when resultado in ('falhou','adiado') then 'falhou' else 'confirmado' end,
    remoto_id=rid,codigo_erro=p_resultado->>'codigo',terminado_em=now() where id=v.id;
  update public.admin_marketing_agendamentos set estado=estado_job,etapa=proxima,
    etapa_interrompida=case when resultado='incerto' then g.etapa else etapa_interrompida end,
    processamento=coalesce(p_resultado->'processamento',processamento),remoto_id=coalesce(rid,remoto_id),
    proxima_verificacao_em=case when proxima='publicar' then greatest(now()+interval '1 second',
      (select publicar_em from public.admin_marketing_autorizacoes where id=g.autorizacao_id))
      else now()+case when resultado='processando' then interval '30 seconds' when resultado='adiado' then make_interval(secs=>least(3600,greatest(60,coalesce((p_resultado->>'retryAfterSegundos')::integer,60)))) else interval '1 second' end end,
    concluido_em=case when estado_job in ('publicado','cancelado') then now() else null end,
    lease_id=null,lease_expira_em=null,lease_revisao=null,worker_id=null,codigo_erro=p_resultado->>'codigo',revisao=revisao+1,atualizado_em=now()
    where id=g.id returning * into g;
  return jsonb_build_object('jobId',g.id,'revisao',g.revisao,'estado',g.estado,'etapa',g.etapa);
end $$;

alter function public.admin_marketing_real_previa(uuid,jsonb) rename to admin_marketing_real_previa_base_c22;
create function public.admin_marketing_real_previa(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; lista jsonb; pol text:=coalesce(p_pedido->>'politicaExecucao','legado-15min');
begin
 if pol not in ('legado-15min','recuperacao-2h-v1') then raise exception 'politica-invalida';end if;
 if pol='recuperacao-2h-v1' and (p_pedido->'consentimentoExecucao' is distinct from 'true'::jsonb
  or not coalesce(p_pedido->'capacidadesCliente' @> '["execucao-2h-v1"]'::jsonb,false)) then raise exception 'atualizar-cliente';end if;
 if pol='recuperacao-2h-v1' and not public.admin_marketing_real_politica_pronta() then raise exception 'politica-nao-pronta';end if;
 r:=public.admin_marketing_real_previa_base_c22(p_admin,p_pedido-'politicaExecucao'-'capacidadesCliente'-'consentimentoExecucao');
 select jsonb_agg(d||jsonb_build_object('politicaExecucao',pol,'executarAte',to_char(public.admin_marketing_real_limite((d->>'publicarEm')::timestamptz,pol) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'consentimentoExecucao',pol='recuperacao-2h-v1') order by n) into lista from jsonb_array_elements(r->'destinos') with ordinality x(d,n);
 update public.admin_marketing_real_previas set destinos=lista,hash=encode(sha256(convert_to(jsonb_build_object('base',r->>'hash','destinos',lista)::text,'UTF8')),'hex')
 where id=(r->>'id')::uuid returning to_jsonb(admin_marketing_real_previas.*) into r;
 return r;
end $$;
alter function public.admin_marketing_real_confirmar(uuid,uuid,text,integer,uuid) rename to admin_marketing_real_confirmar_base_c22;
create function public.admin_marketing_real_confirmar(p_admin uuid,p_previa uuid,p_hash text,p_revisao integer,p_idempotencia uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.admin_marketing_real_exigir_capacidade(p_previa,coalesce(nullif(current_setting('app.marketing_capacidades',true),''),'[]')::jsonb);
 return public.admin_marketing_real_confirmar_base_c22(p_admin,p_previa,p_hash,p_revisao,p_idempotencia);
end $$;
alter function public.admin_marketing_real_consultar(uuid,jsonb) rename to admin_marketing_real_consultar_base_c22;
create function public.admin_marketing_real_consultar(p_admin uuid,p_filtro jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
 select public.admin_marketing_real_decorar(public.admin_marketing_real_consultar_base_c22(p_admin,p_filtro))
$$;
alter function public.admin_marketing_real_comando(uuid,jsonb) rename to admin_marketing_real_comando_base_c22;
create function public.admin_marketing_real_comando(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_pedido->>'acao'='reagendar' then perform public.admin_marketing_real_exigir_capacidade((p_pedido->>'previaId')::uuid,p_pedido->'capacidadesCliente');end if;
 if p_pedido->>'acao'='reagendar' and not public.admin_marketing_real_politica_pronta()
  and not exists(select 1 from public.admin_marketing_real_comandos where admin_id=p_admin and idempotencia=(p_pedido->>'idempotencia')::uuid)
  and exists(select 1 from public.admin_marketing_real_previas p,jsonb_array_elements(p.destinos) d where p.id=(p_pedido->>'previaId')::uuid and d->>'politicaExecucao'='recuperacao-2h-v1')
 then raise exception 'politica-nao-pronta';end if;
 return public.admin_marketing_real_comando_base_c22(p_admin,p_pedido);
end $$;
alter function public.admin_marketing_real_previa_v2(uuid,jsonb) rename to admin_marketing_real_previa_v2_base_c22;
create function public.admin_marketing_real_previa_v2(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; lista jsonb; pol text:=coalesce(p_pedido->>'politicaExecucao','legado-15min');
begin
 if pol not in ('legado-15min','recuperacao-2h-v1') then raise exception 'politica-invalida';end if;
 if pol='recuperacao-2h-v1' and (p_pedido->'consentimentoExecucao' is distinct from 'true'::jsonb
  or not coalesce(p_pedido->'capacidadesCliente' @> '["execucao-2h-v1"]'::jsonb,false)) then raise exception 'atualizar-cliente';end if;
 if pol='recuperacao-2h-v1' and not public.admin_marketing_real_politica_pronta() then raise exception 'politica-nao-pronta';end if;
 r:=public.admin_marketing_real_previa_v2_base_c22(p_admin,p_pedido-'politicaExecucao'-'capacidadesCliente'-'consentimentoExecucao');
 select jsonb_agg(d||jsonb_build_object('politicaExecucao',pol,'executarAte',to_char(public.admin_marketing_real_limite((d->>'publicarEm')::timestamptz,pol) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'consentimentoExecucao',pol='recuperacao-2h-v1') order by n) into lista from jsonb_array_elements(r->'destinos') with ordinality x(d,n);
 update public.admin_marketing_real_previas set destinos=lista,hash=encode(sha256(convert_to(jsonb_build_object('base',r->>'hash','destinos',lista)::text,'UTF8')),'hex')
 where id=(r->>'id')::uuid returning to_jsonb(admin_marketing_real_previas.*) into r;
 return r;
end $$;
alter function public.admin_marketing_real_confirmar_v2(uuid,uuid,text,integer,uuid) rename to admin_marketing_real_confirmar_v2_base_c22;
create function public.admin_marketing_real_confirmar_v2(p_admin uuid,p_previa uuid,p_hash text,p_revisao integer,p_idempotencia uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.admin_marketing_real_exigir_capacidade(p_previa,coalesce(nullif(current_setting('app.marketing_capacidades',true),''),'[]')::jsonb);
 return public.admin_marketing_real_confirmar_v2_base_c22(p_admin,p_previa,p_hash,p_revisao,p_idempotencia);
end $$;
alter function public.admin_marketing_real_consultar_v2(uuid,jsonb) rename to admin_marketing_real_consultar_v2_base_c22;
create function public.admin_marketing_real_consultar_v2(p_admin uuid,p_filtro jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
 select public.admin_marketing_real_decorar(public.admin_marketing_real_consultar_v2_base_c22(p_admin,p_filtro))
$$;
alter function public.admin_marketing_real_comando_v2(uuid,jsonb) rename to admin_marketing_real_comando_v2_base_c22;
create function public.admin_marketing_real_comando_v2(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_pedido->>'acao'='reagendar' then perform public.admin_marketing_real_exigir_capacidade((p_pedido->>'previaId')::uuid,p_pedido->'capacidadesCliente');end if;
 if p_pedido->>'acao'='reagendar' and not public.admin_marketing_real_politica_pronta()
  and not exists(select 1 from public.admin_marketing_real_comandos where admin_id=p_admin and idempotencia=(p_pedido->>'idempotencia')::uuid)
  and exists(select 1 from public.admin_marketing_real_previas p,jsonb_array_elements(p.destinos) d where p.id=(p_pedido->>'previaId')::uuid and d->>'politicaExecucao'='recuperacao-2h-v1')
 then raise exception 'politica-nao-pronta';end if;
 return public.admin_marketing_real_comando_v2_base_c22(p_admin,p_pedido);
end $$;

create function public.admin_marketing_real_confirmar_politica(p_admin uuid,p_previa uuid,p_hash text,p_revisao integer,p_idempotencia uuid,p_capacidades jsonb,p_contrato text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; anterior text:=current_setting('app.marketing_capacidades',true);
begin
 if p_contrato not in ('e5.real.v1','e5.real.v2') then raise exception 'atualizar-cliente';end if;
 if not exists(select 1 from public.admin_marketing_real_lotes where admin_id=p_admin and idempotencia=p_idempotencia)
  and exists(select 1 from public.admin_marketing_real_previas p,jsonb_array_elements(p.destinos) d where p.id=p_previa and d->>'politicaExecucao'='recuperacao-2h-v1')
  and not public.admin_marketing_real_politica_pronta() then raise exception 'politica-nao-pronta';end if;
 perform set_config('app.marketing_capacidades',coalesce(p_capacidades,'[]')::text,true);
 if p_contrato='e5.real.v2' then r:=public.admin_marketing_real_confirmar_v2(p_admin,p_previa,p_hash,p_revisao,p_idempotencia);
 else r:=public.admin_marketing_real_confirmar(p_admin,p_previa,p_hash,p_revisao,p_idempotencia);end if;
 perform set_config('app.marketing_capacidades',coalesce(anterior,''),true);return r;
end $$;

-- Journal de resposta: reenvio do mesmo recibo e permitido, novo efeito nao.
create function public.admin_marketing_real_diario(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer,p_resultado jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.admin_marketing_agendamentos;e public.admin_marketing_envios;c public.admin_marketing_real_contas;
begin
 select * into j from public.admin_marketing_agendamentos where id=p_job for update;
 if not found or j.worker_id is distinct from p_worker or j.lease_id is distinct from p_lease or j.lease_revisao is distinct from p_revisao then return false;end if;
 select * into e from public.admin_marketing_envios where agendamento_id=j.id and estado='iniciado' and operacao=j.etapa;
 if not found then return false;end if;
 select * into c from public.admin_marketing_real_contas where id=j.conta_id;
 insert into public.admin_marketing_ids_diario(envio_id,tentativa,agendamento_id,rede,conta_id,etapa,resultado)
 values(e.id,e.tentativa,j.id,c.rede,c.id,j.etapa,p_resultado) on conflict(envio_id,tentativa) do nothing;
 if exists(select 1 from public.admin_marketing_ids_diario where envio_id=e.id and tentativa=e.tentativa and resultado is distinct from p_resultado)
 then raise exception 'idempotencia-divergente';end if;
 return true;
end $$;

create function public.admin_marketing_real_monitor(p_worker uuid,p_admin uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a record;i public.admin_marketing_incidentes;ultimo timestamptz;http_worker integer;canal jsonb;
begin
 if p_worker is null then raise exception 'pedido-invalido';end if;
 -- Uma ordem de locks para monitor e transicoes dos jobs.
 perform 1 from public.admin_marketing_controles where id for update;
 select concluido_em,http into ultimo,http_worker from public.admin_marketing_executor_saude where id;
 for a in select distinct admin_id from public.admin_marketing_autorizacoes union select p_admin where p_admin is not null loop
  if ultimo is null or ultimo<now()-interval '3 minutes' or http_worker>=400 then
   if not exists(select 1 from public.admin_marketing_incidentes where admin_id=a.admin_id and codigo='executor-sem-sinal' and resolvido_em is null) then
    perform public.admin_marketing_real_incidente_abrir(a.admin_id,'executor:'||gen_random_uuid()::text,'executor-sem-sinal');
   end if;
  else
   update public.admin_marketing_notificacoes n set resolvida_em=now() from public.admin_marketing_incidentes inc
    where inc.admin_id=a.admin_id and inc.codigo='executor-sem-sinal' and n.chave=inc.chave and n.resolvida_em is null;
   update public.admin_marketing_incidentes set resolvido_em=now() where admin_id=a.admin_id and codigo='executor-sem-sinal' and resolvido_em is null;
  end if;
 end loop;
 for a in select j.id,j.estado,au.admin_id,au.rede,au.executar_ate,j.etapa,j.processamento,j.remoto_id
  from public.admin_marketing_agendamentos j join public.admin_marketing_autorizacoes au on au.id=j.autorizacao_id
  where j.snapshot_id is not null and j.estado not in ('publicado','cancelado') and au.publicar_em<now()-interval '2 minutes'
 loop
  perform public.admin_marketing_real_incidente_abrir(a.admin_id,a.id::text||':atraso','publicacao-atrasada',a.id,a.rede);
  if a.executar_ate<now() and a.estado not in ('precisa-conferir','falhou') and a.etapa in ('preparar','publicar') then
   update public.admin_marketing_agendamentos set estado='precisa-conferir',codigo_erro='autorizacao-vencida',revisao=revisao+1 where id=a.id and lease_id is null;
  end if;
 end loop;
 -- Incertos sao sinalizados imediatamente pelo trigger, independentemente desta varredura.
 for i in select * from public.admin_marketing_incidentes where resolvido_em is null and proximo_lembrete_em<=now()
 order by proximo_lembrete_em,id for update skip locked limit 100 loop
  update public.admin_marketing_incidentes set sequencia=sequencia+1,proximo_lembrete_em=now()+
   case when reconhecido_em is null then interval '30 minutes' else interval '1 day' end where id=i.id;
  insert into public.admin_marketing_email_outbox(incidente_id,sequencia) values(i.id,i.sequencia+1) on conflict do nothing;
 end loop;
 insert into public.admin_marketing_monitor_saude(id,concluido_em) values(true,now()) on conflict(id) do update set concluido_em=excluded.concluido_em;
 canal:=public.admin_marketing_real_email_saude();
 if not (canal->>'saudavel')::boolean then
  for a in select distinct admin_id from public.admin_marketing_autorizacoes union select p_admin where p_admin is not null loop
   -- Registro visivel sem depender do canal de email quebrado para disparar alerta externo.
   if not exists(select 1 from public.admin_marketing_incidentes where admin_id=a.admin_id and codigo='canal-email-indisponivel' and resolvido_em is null) then
    perform public.admin_marketing_real_incidente_abrir(a.admin_id,'canal-email:'||gen_random_uuid()::text,'canal-email-indisponivel');
   end if;
  end loop;
 else
  update public.admin_marketing_notificacoes n set resolvida_em=now() from public.admin_marketing_incidentes inc
   where inc.codigo='canal-email-indisponivel' and n.chave=inc.chave and n.resolvida_em is null;
  update public.admin_marketing_incidentes set resolvido_em=now() where codigo='canal-email-indisponivel' and resolvido_em is null;
 end if;
 return jsonb_build_object('codigo','monitor-concluido','saudavel',(canal->>'saudavel')::boolean,'email',canal);
end $$;

-- Journal confirmado no banco pode ser aplicado novamente sem nenhuma chamada Meta.
-- O fence original continua obrigatorio; nao aceita recibo de outra tentativa.
create function public.admin_marketing_real_diario_recuperar()
returns void language plpgsql security invoker set search_path='' as $$
declare r record;
begin
 for r in select j.id,j.worker_id,j.lease_id,j.lease_revisao,d.resultado,
  (select sn.dados ? 'conteudoId' from public.admin_marketing_real_snapshots sn where sn.id=j.snapshot_id) as editorial_v2
 from public.admin_marketing_agendamentos j join public.admin_marketing_envios e on e.agendamento_id=j.id and e.operacao=j.etapa and e.estado='iniciado'
 join public.admin_marketing_ids_diario d on d.envio_id=e.id and d.tentativa=e.tentativa
 where j.lease_id is not null and j.lease_expira_em<=now()
 order by j.id for update of j skip locked limit 20 loop
  update public.admin_marketing_agendamentos set lease_expira_em=now()+interval '1 minute' where id=r.id;
  if r.editorial_v2 then perform public.admin_marketing_real_recibo_v2(r.worker_id,r.id,r.lease_id,r.lease_revisao,r.resultado);
  else perform public.admin_marketing_real_recibo(r.worker_id,r.id,r.lease_id,r.lease_revisao,r.resultado);end if;
 end loop;
end $$;

create function public.admin_marketing_real_email_claim(p_worker uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.admin_marketing_email_outbox;i public.admin_marketing_incidentes;saida jsonb:='[]';usados integer;
begin
 if p_worker is null then raise exception 'pedido-invalido';end if;
 if not public.admin_marketing_real_email_liberado() then return saida;end if;
 -- Serializa apenas a reserva no DB, sem manter lock durante HTTP/Resend.
 perform pg_advisory_xact_lock(hashtextextended('admin_marketing_real_email_orcamento',0));
 -- Resend deduplica por 24h. Resultado incerto depois disso nao e reenviado automaticamente.
 update public.admin_marketing_email_outbox set estado='incerto',codigo_erro='janela-idempotencia-vencida'
 where estado in ('pendente','enviando') and (lease_ate is null or lease_ate<=now()) and primeiro_envio_em<now()-interval '23 hours';
 -- Maximo90 chaves novas em24h moveis, incluindo reservas ainda sem recibo.
 -- Retry da mesma chave dentro23h nao consome uma nova vaga.
 select count(*) into usados from public.admin_marketing_email_outbox where primeiro_envio_em>=now()-interval '24 hours';
 for e in select o.* from public.admin_marketing_email_outbox o join public.admin_marketing_incidentes inc on inc.id=o.incidente_id
 where inc.resolvido_em is null and o.disponivel_em<=now() and (o.estado='pendente' or (o.estado='enviando' and o.lease_ate<=now()))
 and (o.primeiro_envio_em is not null or usados<90)
 order by (o.primeiro_envio_em is null),o.disponivel_em,o.id for update of o skip locked limit 3 loop
  if e.primeiro_envio_em is null then
   if usados>=90 then continue;end if;
   usados:=usados+1;
  end if;
  select * into i from public.admin_marketing_incidentes where id=e.incidente_id;
  update public.admin_marketing_email_outbox set estado='enviando',lease_id=p_worker,lease_ate=now()+interval '2 minutes',
   tentativas=tentativas+1,primeiro_envio_em=coalesce(primeiro_envio_em,now()) where id=e.id;
  saida:=saida||jsonb_build_array(jsonb_build_object('emailId',e.id,'incidenteId',i.id,'codigo',i.codigo,'rede',i.rede,'jobId',i.agendamento_id,'adminId',i.admin_id));
 end loop;return saida;
end $$;

-- Status autenticado no provedor. Aceitacao de POST nunca preenche entrega_estado.
create function public.admin_marketing_real_email_consultas()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.admin_marketing_email_outbox;saida jsonb:='[]';
begin
 for e in select * from public.admin_marketing_email_outbox where estado='aceito' and provedor_id is not null
  and proximo_status_em<=now() and primeiro_envio_em>now()-interval '1 day'
  order by proximo_status_em,id for update skip locked limit 3 loop
  update public.admin_marketing_email_outbox set proximo_status_em=now()+case when entrega_estado='entregue' then interval '1 hour' else interval '1 minute' end where id=e.id;
  saida:=saida||jsonb_build_array(jsonb_build_object('emailId',e.id,'provedorId',e.provedor_id));
 end loop;return saida;
end $$;
create function public.admin_marketing_real_email_entrega(p_email uuid,p_provedor text,p_estado text,p_codigo text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_estado not in ('entregue','falhou','adiada','nao-verificada') or (p_codigo is not null and p_codigo !~ '^[a-z0-9-]{1,80}$')
 then raise exception 'recibo-invalido';end if;
 update public.admin_marketing_email_outbox set entrega_estado=p_estado,entrega_verificada_em=now(),
  codigo_erro=p_codigo,estado=case when p_estado='falhou' then 'falhou' else estado end
 where id=p_email and provedor_id=p_provedor and estado='aceito';
 if not found then return false;end if;
 if p_estado='falhou' then
  update public.admin_marketing_integracoes_saude set email_falhou_em=now() where id;
 end if;return true;
end $$;
create function public.admin_marketing_real_email_recibo(p_worker uuid,p_email uuid,p_resultado jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_resultado->>'estado' not in ('aceito','pendente','incerto','falhou') then raise exception 'recibo-invalido';end if;
 update public.admin_marketing_email_outbox set estado=p_resultado->>'estado',provedor_id=p_resultado->>'provedorId',
  codigo_erro=p_resultado->>'codigo',disponivel_em=now()+make_interval(secs=>least(3600,greatest(60,coalesce((p_resultado->>'retryAfterSegundos')::integer,60)))),
  lease_id=null,lease_ate=null
 where id=p_email and lease_id=p_worker and estado='enviando';
 if not found then return false;end if;
 if p_resultado->>'estado' in ('aceito','falhou') then
  insert into public.admin_marketing_integracoes_saude(id,email_aceito_em,email_falhou_em)
  values(true,case when p_resultado->>'estado'='aceito' then now() end,case when p_resultado->>'estado'='falhou' then now() end)
  on conflict(id) do update set email_aceito_em=case when p_resultado->>'estado'='aceito' then now() else admin_marketing_integracoes_saude.email_aceito_em end,
   email_falhou_em=case when p_resultado->>'estado'='falhou' then now() else admin_marketing_integracoes_saude.email_falhou_em end;
 end if;return true;
end $$;

-- Todas as novas RPCs e bases renomeadas permanecem fechadas aos clientes anon/auth.
do $$ declare f record;begin
 for f in select p.oid::regprocedure assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'admin_marketing_real_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);
  execute format('grant execute on function %s to service_role',f.assinatura);
 end loop;
end $$;
commit;
