-- Preparada localmente. NAO aplicar/ativar sem a publicacao autorizada.
-- Fila real unica; sim_* permanece historico e isolado. Limites abaixo sao
-- operacionais do Grana., nunca declaracoes de quotas da Meta.
begin;

alter table public.admin_marketing_autorizacoes drop constraint admin_marketing_autorizacoes_formato_check;
alter table public.admin_marketing_autorizacoes add constraint admin_marketing_autorizacoes_formato_check
  check (formato in ('feed','carrossel','reels','stories'));

create table public.admin_marketing_real_contas (
  id uuid primary key default gen_random_uuid(),
  rede text not null check (rede in ('facebook','instagram')),
  remoto_id text not null check (remoto_id ~ '^[0-9]{1,40}$'),
  rotulo text not null check (char_length(rotulo) between 1 and 100),
  credencial_ref text not null check (credencial_ref ~ '^MARKETING_[A-Z0-9_]{1,80}$'),
  revisao integer not null default 1 check (revisao>0),
  conexao text not null default 'nao-verificada' check (conexao in ('verificada','revogada','expirada','nao-verificada','indisponivel')),
  verificada_em timestamptz,
  valida_ate timestamptz,
  capacidades jsonb not null default '[]' check (jsonb_typeof(capacidades)='array' and octet_length(capacidades::text)<=16384),
  pausada boolean not null default true,
  unique(rede,remoto_id)
);
create table public.admin_marketing_real_snapshots (
  id uuid primary key default gen_random_uuid(), admin_id uuid not null,
  identidade text not null unique check (identidade ~ '^[0-9a-f]{64}$'),
  revisao integer not null default 1 check (revisao>0),
  estado text not null default 'recebendo' check (estado in ('recebendo','pronto','revogado')),
  dados jsonb not null check (jsonb_typeof(dados)='object' and octet_length(dados::text)<=131072),
  criado_em timestamptz not null default now()
);
create table public.admin_marketing_real_previas (
  id uuid primary key default gen_random_uuid(), admin_id uuid not null,
  snapshot_id uuid not null references public.admin_marketing_real_snapshots(id),
  snapshot_revisao integer not null,
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  destinos jsonb not null check (jsonb_typeof(destinos)='array' and jsonb_array_length(destinos) between 1 and 8),
  criado_em timestamptz not null default now(), expira_em timestamptz not null default now()+interval '10 minutes'
);
create table public.admin_marketing_real_lotes (
  id uuid primary key default gen_random_uuid(), admin_id uuid not null,
  idempotencia uuid not null, pedido_hash text not null,
  previa_id uuid not null references public.admin_marketing_real_previas(id),
  criado_em timestamptz not null default now(), unique(admin_id,idempotencia)
);
create table public.admin_marketing_real_comandos (
  admin_id uuid not null, idempotencia uuid not null, pedido jsonb not null,
  resultado jsonb not null, criado_em timestamptz not null default now(), primary key(admin_id,idempotencia)
);
alter table public.admin_marketing_agendamentos
  add column lote_id uuid references public.admin_marketing_real_lotes(id),
  add column snapshot_id uuid references public.admin_marketing_real_snapshots(id),
  add column conta_id uuid references public.admin_marketing_real_contas(id),
  add column revisao integer not null default 1 check (revisao>0),
  add column etapa text not null default 'preparar' check (etapa in ('preparar','consultar-preparo','publicar','verificar-publicacao','cancelar','reconciliar')),
  add column processamento jsonb not null default '{}' check (jsonb_typeof(processamento)='object' and octet_length(processamento::text)<=65536),
  add column worker_id uuid,
  add column lease_revisao integer,
  add column pausado boolean not null default false,
  add column cancelamento_solicitado_em timestamptz,
  add constraint marketing_real_referencias check ((snapshot_id is null and conta_id is null and lote_id is null) or
    (snapshot_id is not null and conta_id is not null and lote_id is not null));
alter table public.admin_marketing_controles add column revisao integer not null default 1 check(revisao>0);
alter table public.admin_marketing_envios drop constraint admin_marketing_envios_operacao_check;
alter table public.admin_marketing_envios add constraint admin_marketing_envios_operacao_check check
  (operacao in ('preparar','agendar','publicar','cancelar','reconciliar','consultar-preparo','verificar-publicacao'));
alter table public.admin_marketing_envios drop constraint admin_marketing_envios_tentativa_check;
alter table public.admin_marketing_envios add constraint admin_marketing_envios_tentativa_check check(tentativa between 1 and 1000);
alter table public.admin_marketing_envios add column efeito_admitido_em timestamptz;
grant update(efeito_admitido_em) on public.admin_marketing_envios to service_role;
-- Inclui falha/incerto: uma segunda chamada publicar nao se torna segura por
-- falta de recibo. Resolver uma falha comprovadamente sem efeito e manual.
create unique index admin_marketing_publicar_unico_idx on public.admin_marketing_envios(agendamento_id) where operacao='publicar';
create index admin_marketing_real_lote_idx on public.admin_marketing_agendamentos(lote_id,id);
create index admin_marketing_real_snapshot_idx on public.admin_marketing_agendamentos(snapshot_id);
create index admin_marketing_real_conta_idx on public.admin_marketing_agendamentos(conta_id);
create index admin_marketing_real_previa_snapshot_idx on public.admin_marketing_real_previas(snapshot_id);
create index admin_marketing_real_lote_previa_idx on public.admin_marketing_real_lotes(previa_id);

alter table public.admin_marketing_real_contas enable row level security;
alter table public.admin_marketing_real_snapshots enable row level security;
alter table public.admin_marketing_real_previas enable row level security;
alter table public.admin_marketing_real_lotes enable row level security;
alter table public.admin_marketing_real_comandos enable row level security;
-- GRANT nao tira o herdado: o default ACL do Supabase da ALL em tabela nova a
-- service_role, e com isso os GRANTs por coluna abaixo nao restringiriam nada
-- (mesma licao do B2-2, revisao do Watchtower de 17/10/2026). Revoga tudo de
-- todos os papeis da API antes de conceder o minimo.
revoke all on public.admin_marketing_real_contas,public.admin_marketing_real_snapshots,
  public.admin_marketing_real_previas,public.admin_marketing_real_lotes,public.admin_marketing_real_comandos from public,anon,authenticated,service_role;
grant select,insert on public.admin_marketing_real_contas,public.admin_marketing_real_snapshots,
  public.admin_marketing_real_previas,public.admin_marketing_real_lotes,public.admin_marketing_real_comandos to service_role;
grant update(revisao,conexao,verificada_em,valida_ate,capacidades,pausada,credencial_ref) on public.admin_marketing_real_contas to service_role;
grant update(revisao,estado) on public.admin_marketing_real_snapshots to service_role;
-- A fundacao usa GRANT por coluna. Novas colunas mutaveis sao explicitas.
grant update(revisao,etapa,processamento,worker_id,lease_revisao,pausado,cancelamento_solicitado_em) on public.admin_marketing_agendamentos to service_role;
grant update(revisao) on public.admin_marketing_controles to service_role;

-- O worker legado nao pode tocar nos jobs do contrato real novo. Mantemos a
-- assinatura antiga, regras e selecao existentes para os registros legados.
create or replace function public.admin_marketing_reservar()
returns table(agendamento_id uuid, envio_id uuid, lease_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare
  a public.admin_marketing_agendamentos;
  e uuid;
  l uuid := gen_random_uuid();
begin
  update public.admin_marketing_envios v set estado='incerto', terminado_em=now(), codigo_erro='lease-vencida'
    from public.admin_marketing_agendamentos g
    where g.snapshot_id is null and v.agendamento_id=g.id and v.estado='iniciado' and g.estado='preparando' and g.lease_expira_em<=now();
  update public.admin_marketing_agendamentos set estado='precisa-conferir', lease_id=null,
    lease_expira_em=null, codigo_erro='lease-vencida', atualizado_em=now()
    where snapshot_id is null and estado='preparando' and lease_expira_em<=now();
  if not exists(select 1 from public.admin_marketing_controles
    where id and habilitado and not pausa_global and not recuperacao_pendente
      and capacidade_validada_em >= now()-interval '1 day' and margem_validada_ate > now()) then
    return;
  end if;
  -- Atraso não autoriza publicar fora do horário confirmado.
  update public.admin_marketing_agendamentos g set estado='precisa-conferir', codigo_erro='horario-vencido', atualizado_em=now()
    from public.admin_marketing_autorizacoes u
    where g.snapshot_id is null and g.autorizacao_id=u.id and g.estado='programado-no-painel' and u.publicar_em < now()-interval '15 minutes';
  select g.* into a from public.admin_marketing_agendamentos g
    join public.admin_marketing_autorizacoes u on u.id=g.autorizacao_id
    cross join public.admin_marketing_controles c
    where g.snapshot_id is null and g.estado='programado-no-painel' and g.estrategia='executor-remoto'
      and g.aceite_revogado_em is null and g.proxima_verificacao_em<=now()
      and u.publicar_em between now()-interval '15 minutes' and now()
      and (case u.rede when 'facebook' then not c.pausa_facebook else not c.pausa_instagram end)
      and not exists(select 1 from public.admin_marketing_envios v
        where v.agendamento_id=g.id and v.operacao='publicar')
    order by u.publicar_em,g.id for update of g skip locked limit 1;
  if not found then return; end if;
  insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao)
    values(a.id,encode(sha256(convert_to(a.id::text||':publicar:1','UTF8')),'hex'),1,'publicar') returning id into e;
  update public.admin_marketing_agendamentos set estado='preparando', lease_id=l,
    lease_expira_em=now()+interval '2 minutes', atualizado_em=now() where id=a.id;
  return query select a.id,e,l;
end $$;

create function public.admin_marketing_real_snapshot_iniciar(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.admin_marketing_real_snapshots; h text; m jsonb; lista jsonb:='[]'; i integer:=0; d jsonb;
begin
  if p_admin is null or jsonb_typeof(p_pedido)<>'object' or octet_length(p_pedido::text)>131072
    or (p_pedido->>'pecaId') !~ '^[0-9a-f]{16}$' or (p_pedido->>'versao') !~ '^[0-9a-f]{40}$'
    or coalesce(p_pedido->>'aceiteId','')='' or (p_pedido->>'aceiteRevisao')::integer<1
    or jsonb_typeof(p_pedido->'midias')<>'array' or jsonb_array_length(p_pedido->'midias') not between 1 and 10
    then raise exception 'snapshot-invalido'; end if;
  h:=encode(sha256(convert_to(p_pedido::text,'UTF8')),'hex');
  perform 1 from public.admin_marketing_controles where id for update;
  select * into s from public.admin_marketing_real_snapshots where identidade=h;
  if found then return to_jsonb(s); end if;
  s.id:=gen_random_uuid();
  for m in select value from jsonb_array_elements(p_pedido->'midias') loop
    if m->>'sha256' !~ '^[0-9a-f]{64}$' or (m->>'bytes')::bigint not between 1 and 47185919
      or m->>'mime' not in ('image/jpeg','image/png','video/mp4') then raise exception 'midia-invalida'; end if;
    lista:=lista||jsonb_build_array(m||jsonb_build_object('ordem',i,'objeto','snapshots/'||s.id||'/'||i||'-'||(m->>'sha256')));i:=i+1;
  end loop;
  d:=jsonb_set(p_pedido,'{midias}',lista);
  if p_pedido->'capa' is not null and p_pedido->'capa'<>'null'::jsonb then
    m:=p_pedido->'capa';
    if m->>'sha256' !~ '^[0-9a-f]{64}$' or m->>'mime' not in ('image/jpeg','image/png')
      or (m->>'bytes')::bigint not between 1 and 47185919 then raise exception 'midia-invalida'; end if;
    d:=jsonb_set(d,'{capa}',m||jsonb_build_object('objeto','snapshots/'||s.id||'/capa-'||(m->>'sha256')));
  end if;
  insert into public.admin_marketing_real_snapshots(id,admin_id,identidade,dados) values(s.id,p_admin,h,d) returning * into s;
  return to_jsonb(s);
end $$;

create function public.admin_marketing_real_snapshot_finalizar(p_admin uuid,p_snapshot uuid,p_revisao integer,p_verificacao jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.admin_marketing_real_snapshots; esperado jsonb;
begin
  select * into s from public.admin_marketing_real_snapshots where id=p_snapshot and admin_id=p_admin for update;
  if not found then raise exception 'snapshot-inexistente'; end if;
  if s.estado='pronto' then return to_jsonb(s); end if;
  if s.estado<>'recebendo' or s.revisao<>p_revisao then raise exception 'revisao-divergente'; end if;
  -- Verificacao vem do importador server-side que leu os bytes, nao do browser.
  esperado:=jsonb_build_object('identidade',s.identidade,'midias',s.dados->'midias','capa',coalesce(s.dados->'capa','null'::jsonb));
  if p_verificacao is distinct from esperado then raise exception 'midia-divergente'; end if;
  update public.admin_marketing_real_snapshots set estado='pronto',revisao=revisao+1 where id=s.id returning * into s;
  return to_jsonb(s);
end $$;

create function public.admin_marketing_real_previa(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.admin_marketing_real_snapshots; p public.admin_marketing_real_previas;
  c public.admin_marketing_real_contas; d jsonb; cap jsonb; lista jsonb:='[]';
begin
  if p_admin is null or jsonb_array_length(p_pedido->'destinos') not between 1 and 8 then raise exception 'pedido-invalido'; end if;
  select * into s from public.admin_marketing_real_snapshots where id=(p_pedido->>'snapshotId')::uuid;
  if not found or s.estado<>'pronto' or s.revisao<>(p_pedido->>'snapshotRevisao')::integer then raise exception 'snapshot-indisponivel'; end if;
  for d in select value from jsonb_array_elements(p_pedido->'destinos') loop
    select * into c from public.admin_marketing_real_contas where id=(d->>'contaId')::uuid;
    if not found or c.conexao<>'verificada' or c.valida_ate is null or c.valida_ate<=now() then raise exception 'conta-indisponivel'; end if;
    -- Instagram: "JPEG is the only image format supported" (IG Content Publishing).
    if c.rede='instagram' and (exists(select 1 from jsonb_array_elements(s.dados->'midias') m
        where m->>'mime' like 'image/%' and m->>'mime'<>'image/jpeg')
      or (d->>'formato'='reels' and s.dados->'capa' is not null and s.dados->'capa'<>'null'::jsonb and s.dados->'capa'->>'mime'<>'image/jpeg'))
      then raise exception 'midia-incompativel'; end if;
    select value into cap from jsonb_array_elements(c.capacidades) where value->>'formato'=d->>'formato' and value->>'estado'='disponivel';
    if not found then raise exception 'capacidade-nao-comprovada'; end if;
    if d->>'fuso'<>'America/Sao_Paulo' or (d->>'publicarEm')::timestamptz<=now() then raise exception 'horario-invalido'; end if;
    lista:=lista||jsonb_build_array(jsonb_build_object('contaId',c.id,'rede',c.rede,'formato',d->>'formato',
      'publicarEm',to_char((d->>'publicarEm')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'fuso','America/Sao_Paulo','contaRevisao',c.revisao,'capacidadeRevisao',(cap->>'revisao')::integer));
  end loop;
  if (select count(*) from jsonb_array_elements(lista))<>(select count(distinct value) from jsonb_array_elements(lista))
    then raise exception 'destino-duplicado'; end if;
  insert into public.admin_marketing_real_previas(admin_id,snapshot_id,snapshot_revisao,hash,destinos)
    values(p_admin,s.id,s.revisao,encode(sha256(convert_to(jsonb_build_object('snapshot',s.identidade,'destinos',lista)::text,'UTF8')),'hex'),lista)
    returning * into p;
  return to_jsonb(p);
end $$;

create function public.admin_marketing_real_confirmar(p_admin uuid,p_previa uuid,p_hash text,p_revisao integer,p_idempotencia uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.admin_marketing_real_previas; s public.admin_marketing_real_snapshots;
  l public.admin_marketing_real_lotes; c public.admin_marketing_real_contas; d jsonb;
  u uuid; j uuid; h text; controles public.admin_marketing_controles;
begin
  if p_admin is null or p_idempotencia is null then raise exception 'pedido-invalido'; end if;
  select * into controles from public.admin_marketing_controles where id for update;
  select * into l from public.admin_marketing_real_lotes where admin_id=p_admin and idempotencia=p_idempotencia;
  if found then
    if l.previa_id<>p_previa or l.pedido_hash<>p_hash then raise exception 'idempotencia-divergente'; end if;
    return jsonb_build_object('loteId',l.id,'replay',true);
  end if;
  select * into p from public.admin_marketing_real_previas where id=p_previa and admin_id=p_admin;
  if not found then raise exception 'previa-inexistente'; end if;
  if p.hash<>p_hash or p_revisao<>1 then raise exception 'revisao-divergente'; end if;
  if p.expira_em<=now() then raise exception 'previa-expirada'; end if;
  select * into s from public.admin_marketing_real_snapshots where id=p.snapshot_id for share;
  if s.estado<>'pronto' or s.revisao<>p.snapshot_revisao then raise exception 'snapshot-indisponivel'; end if;
  if not controles.habilitado or controles.pausa_global or controles.recuperacao_pendente
    or controles.capacidade_validada_em is null or controles.capacidade_validada_em<now()-interval '1 day'
    or controles.margem_validada_ate is null or controles.margem_validada_ate<=now() then raise exception 'operacao-bloqueada'; end if;
  insert into public.admin_marketing_real_lotes(admin_id,idempotencia,pedido_hash,previa_id)
    values(p_admin,p_idempotencia,p_hash,p_previa) returning * into l;
  -- Ordem fixa por conta evita inversao de locks em lotes concorrentes.
  for d in select value from jsonb_array_elements(p.destinos) order by value->>'contaId',value->>'formato' loop
    select * into c from public.admin_marketing_real_contas where id=(d->>'contaId')::uuid for share;
    if not found or c.pausada or c.conexao<>'verificada' or c.valida_ate is null or c.valida_ate<=now()
      or c.revisao<>(d->>'contaRevisao')::integer then raise exception 'conta-indisponivel'; end if;
    if (c.rede='facebook' and controles.pausa_facebook) or (c.rede='instagram' and controles.pausa_instagram)
      then raise exception 'operacao-pausada'; end if;
    if not exists(select 1 from jsonb_array_elements(c.capacidades) k where k->>'formato'=d->>'formato'
      and k->>'estado'='disponivel' and (k->>'revisao')::integer=(d->>'capacidadeRevisao')::integer)
      then raise exception 'capacidade-nao-comprovada'; end if;
    if (d->>'publicarEm')::timestamptz<=now() then raise exception 'horario-invalido'; end if;
    h:=encode(sha256(convert_to(jsonb_build_object('snapshot',s.identidade,'destino',d-'contaRevisao'-'capacidadeRevisao')::text,'UTF8')),'hex');
    if exists(select 1 from public.admin_marketing_autorizacoes where chave=h) then raise exception 'agendamento-ja-existe'; end if;
    insert into public.admin_marketing_autorizacoes(chave,admin_id,peca_id,versao,manifesto,rede,conta_destino,formato,publicar_em)
      values(h,p_admin,s.dados->>'pecaId',s.dados->>'versao',s.dados||jsonb_build_object('_destino',d),c.rede,c.remoto_id,d->>'formato',(d->>'publicarEm')::timestamptz) returning id into u;
    insert into public.admin_marketing_agendamentos(autorizacao_id,estrategia,estado,lote_id,snapshot_id,conta_id,proxima_verificacao_em)
      values(u,'executor-remoto','programado-no-painel',l.id,s.id,c.id,greatest(now(),(d->>'publicarEm')::timestamptz-interval '30 minutes')) returning id into j;
  end loop;
  return jsonb_build_object('loteId',l.id,'replay',false);
end $$;

create function public.admin_marketing_real_consultar(p_admin uuid,p_filtro jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saida jsonb; lid uuid; total integer;
begin
  if p_admin is null then raise exception 'pedido-invalido'; end if;
  if p_filtro->>'acao'='contas' then
    return jsonb_build_object('estado','disponivel','contas',coalesce((select jsonb_agg(jsonb_build_object(
      'contaId',id,'rede',rede,'rotulo',rotulo,'revisao',revisao,'conexao',conexao,'verificadaEm',verificada_em,
      'validaAte',valida_ate,'pausada',pausada,'capacidades',capacidades) order by rede,id) from public.admin_marketing_real_contas),'[]'::jsonb),
      'controles',(select jsonb_build_object('revisao',revisao,'habilitado',habilitado,'pausaGlobal',pausa_global,
        'pausaFacebook',pausa_facebook,'pausaInstagram',pausa_instagram,'recuperacaoPendente',recuperacao_pendente,
        'margemValidaAte',margem_validada_ate) from public.admin_marketing_controles where id));
  end if;
  if p_filtro ? 'idempotencia' then
    select id into lid from public.admin_marketing_real_lotes where admin_id=p_admin and idempotencia=(p_filtro->>'idempotencia')::uuid;
    if not found then raise exception 'lote-inexistente'; end if;
  else lid:=(p_filtro->>'loteId')::uuid; end if;
  select coalesce(jsonb_agg(x.d order by x.criado_em desc,x.id desc),'[]') into saida from (
    select g.id,g.criado_em,jsonb_build_object('jobId',g.id,'loteId',g.lote_id,'revisao',g.revisao,
      'snapshotId',g.snapshot_id,'estrategia',g.estrategia,'estado',g.estado,'codigoErro',g.codigo_erro,
      'atualizadoEm',g.atualizado_em,'proximaVerificacaoEm',g.proxima_verificacao_em,'remotoId',g.remoto_id,
      'permalink',null,'confirmadoEm',a.confirmado_em,'concluidoEm',g.concluido_em,
      'cancelamentoSolicitadoEm',g.cancelamento_solicitado_em,
      'destino',jsonb_build_object('contaId',g.conta_id,'rede',a.rede,'formato',a.formato,'publicarEm',a.publicar_em,'fuso',a.fuso),
      'peca',jsonb_build_object('pecaId',a.peca_id,'versao',a.versao),
      'recibosLimitados',(select count(*)>50 from public.admin_marketing_envios e where e.agendamento_id=g.id),
      'recibos',coalesce((select jsonb_agg(r.d order by r.iniciado_em desc,r.id desc) from (
        select e.id,e.iniciado_em,jsonb_build_object('reciboId',e.id,'operacao',e.operacao,'estado',e.estado,'remotoId',e.remoto_id,
          'codigo',e.codigo_erro,'iniciadoEm',e.iniciado_em,'terminadoEm',e.terminado_em) d
        from public.admin_marketing_envios e where e.agendamento_id=g.id order by e.iniciado_em desc,e.id desc limit 50) r),'[]')) d
    from public.admin_marketing_agendamentos g join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id
    where g.snapshot_id is not null and (not(p_filtro ? 'jobId') or g.id=(p_filtro->>'jobId')::uuid)
      and (lid is null or g.lote_id=lid)
      and (not(p_filtro ? 'cursor') or (g.criado_em,g.id)<((p_filtro->'cursor'->>'criadoEm')::timestamptz,(p_filtro->'cursor'->>'id')::uuid))
    order by g.criado_em desc,g.id desc limit least(coalesce((p_filtro->>'limite')::integer,20),50)+1
  ) x;
  total:=jsonb_array_length(saida);
  return jsonb_build_object('loteId',lid,'jobs',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(saida) with ordinality x(value,n)
    where n<=least(coalesce((p_filtro->>'limite')::integer,20),50)),
    'limitado',total>least(coalesce((p_filtro->>'limite')::integer,20),50),
    'proximoCursor',case when total>least(coalesce((p_filtro->>'limite')::integer,20),50) then
      (select jsonb_build_object('id',g.id,'criadoEm',g.criado_em) from public.admin_marketing_agendamentos g
       where g.id=(saida->(least(coalesce((p_filtro->>'limite')::integer,20),50)-1)->>'jobId')::uuid) else null end);
end $$;

create function public.admin_marketing_real_comando(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.admin_marketing_agendamentos; c public.admin_marketing_controles; conta public.admin_marketing_real_contas;
  antigo public.admin_marketing_real_comandos; resultado jsonb; acao text:=p_pedido->>'acao';
  idem uuid:=(p_pedido->>'idempotencia')::uuid; a public.admin_marketing_autorizacoes; nova uuid; novo_job uuid; h text;
begin
  if p_admin is null or idem is null then raise exception 'pedido-invalido'; end if;
  select * into c from public.admin_marketing_controles where id for update;
  select * into antigo from public.admin_marketing_real_comandos where admin_id=p_admin and idempotencia=idem;
  if found then if antigo.pedido is distinct from p_pedido then raise exception 'idempotencia-divergente'; end if;return antigo.resultado;end if;
  if acao in ('pausar','retomar') and p_pedido ? 'escopo' then
    if p_pedido->>'escopo'='conta' then
      select * into conta from public.admin_marketing_real_contas where id=(p_pedido->>'contaId')::uuid for update;
      if not found or conta.revisao<>(p_pedido->>'revisaoEsperada')::integer then raise exception 'revisao-divergente'; end if;
      update public.admin_marketing_real_contas set pausada=(acao='pausar'),revisao=revisao+1 where id=conta.id;
    else
      if c.revisao<>(p_pedido->>'revisaoEsperada')::integer then raise exception 'revisao-divergente'; end if;
      if p_pedido->>'escopo' not in ('global','facebook','instagram') then raise exception 'pedido-invalido'; end if;
      update public.admin_marketing_controles set revisao=revisao+1,atualizado_em=now(),
        pausa_global=case when p_pedido->>'escopo'='global' then acao='pausar' else pausa_global end,
        pausa_facebook=case when p_pedido->>'escopo'='facebook' then acao='pausar' else pausa_facebook end,
        pausa_instagram=case when p_pedido->>'escopo'='instagram' then acao='pausar' else pausa_instagram end where id;
    end if;
    resultado:=public.admin_marketing_real_consultar(p_admin,'{"acao":"contas"}');
  else
    select * into g from public.admin_marketing_agendamentos where id=(p_pedido->>'jobId')::uuid and snapshot_id is not null for update;
    if not found then raise exception 'agendamento-inexistente'; end if;
    if g.revisao<>(p_pedido->>'revisaoEsperada')::integer then raise exception 'revisao-divergente'; end if;
    if acao in ('pausar','retomar') then
      if g.estado in ('publicado','cancelado') then raise exception 'estado-incompativel'; end if;
      update public.admin_marketing_agendamentos set pausado=(acao='pausar'),revisao=revisao+1,atualizado_em=now() where id=g.id;
    elsif acao='cancelar' then
      if g.estado='publicado' then raise exception 'ja-publicado'; end if;
      if g.estado<>'cancelado' then
        if g.lease_id is not null then raise exception 'operacao-em-andamento'; end if;
        if exists(select 1 from public.admin_marketing_envios where agendamento_id=g.id and operacao='publicar') then
          -- Pedido em voo nao e cancelamento confirmado, nem reabre o POST.
          if g.lease_id is not null then raise exception 'operacao-em-andamento'; end if;
          update public.admin_marketing_agendamentos set estado='cancelamento-pendente',etapa='cancelar',
            cancelamento_solicitado_em=now(),proxima_verificacao_em=now(),revisao=revisao+1,atualizado_em=now() where id=g.id;
        else
          update public.admin_marketing_agendamentos set estado='cancelado',concluido_em=now(),cancelamento_solicitado_em=now(),
            revisao=revisao+1,atualizado_em=now() where id=g.id;
        end if;
      end if;
    elsif acao='reconciliar' then
      if g.estado<>'precisa-conferir' or g.lease_id is not null then raise exception 'estado-incompativel'; end if;
      update public.admin_marketing_agendamentos set etapa='reconciliar',estado='programado-no-painel',
        proxima_verificacao_em=now(),revisao=revisao+1,atualizado_em=now() where id=g.id;
    elsif acao='reagendar' then
      if g.estado<>'programado-no-painel' or exists(select 1 from public.admin_marketing_envios where agendamento_id=g.id)
        then raise exception 'estado-incompativel'; end if;
      if (p_pedido->>'publicarEm')::timestamptz<=now() then raise exception 'horario-invalido'; end if;
      select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
      h:=encode(sha256(convert_to(jsonb_build_object('anterior',a.chave,'horario',(p_pedido->>'publicarEm')::timestamptz)::text,'UTF8')),'hex');
      insert into public.admin_marketing_autorizacoes(chave,admin_id,peca_id,versao,manifesto,rede,conta_destino,formato,publicar_em)
        values(h,p_admin,a.peca_id,a.versao,a.manifesto,a.rede,a.conta_destino,a.formato,(p_pedido->>'publicarEm')::timestamptz) returning id into nova;
      update public.admin_marketing_agendamentos set estado='cancelado',concluido_em=now(),revisao=revisao+1,atualizado_em=now() where id=g.id;
      insert into public.admin_marketing_agendamentos(autorizacao_id,estrategia,estado,lote_id,snapshot_id,conta_id,proxima_verificacao_em)
        values(nova,'executor-remoto','programado-no-painel',g.lote_id,g.snapshot_id,g.conta_id,greatest(now(),(p_pedido->>'publicarEm')::timestamptz-interval '30 minutes')) returning id into novo_job;
    else raise exception 'pedido-invalido'; end if;
    resultado:=public.admin_marketing_real_consultar(p_admin,jsonb_build_object('acao','consultar','jobId',coalesce(novo_job,g.id)));
  end if;
  insert into public.admin_marketing_real_comandos(admin_id,idempotencia,pedido,resultado) values(p_admin,idem,p_pedido,resultado);
  return resultado;
end $$;

create function public.admin_marketing_real_claim(p_worker uuid,p_limite integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare controles public.admin_marketing_controles; g public.admin_marketing_agendamentos;
  a public.admin_marketing_autorizacoes; c public.admin_marketing_real_contas;
  s public.admin_marketing_real_snapshots; e uuid; fence uuid; t integer; saida jsonb:='[]';
begin
  if p_worker is null or p_limite not between 1 and 3 then raise exception 'pedido-invalido'; end if;
  select * into controles from public.admin_marketing_controles where id for update;
  -- Expirar NUNCA reabre publicar: a unicidade do diario tambem impede.
  update public.admin_marketing_envios v set estado='incerto',terminado_em=now(),codigo_erro='lease-vencida'
    from public.admin_marketing_agendamentos j where v.agendamento_id=j.id and j.snapshot_id is not null
      and j.lease_expira_em<=now() and v.estado='iniciado';
  update public.admin_marketing_agendamentos set estado='precisa-conferir',etapa='reconciliar',lease_id=null,worker_id=null,
    lease_expira_em=null,lease_revisao=null,codigo_erro='lease-vencida',revisao=revisao+1,atualizado_em=now()
    where snapshot_id is not null and lease_expira_em<=now();
  if not controles.habilitado or controles.recuperacao_pendente or controles.margem_validada_ate is null
    or controles.margem_validada_ate<=now() or controles.capacidade_validada_em is null
    or controles.capacidade_validada_em<now()-interval '1 day' then return saida; end if;
  -- Orçamento interno de admissoes do Grana., NAO quota de publicacao Meta.
  if (select count(*) from public.admin_marketing_envios where iniciado_em>now()-interval '1 minute')>=12 then return saida; end if;
  for g in select j.* from public.admin_marketing_agendamentos j
    where j.snapshot_id is not null and j.lease_id is null and j.proxima_verificacao_em<=now()
      and j.estado in ('programado-no-painel','cancelamento-pendente')
    order by j.proxima_verificacao_em,j.id for update skip locked limit p_limite loop
    select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
    select * into c from public.admin_marketing_real_contas where id=g.conta_id;
    select * into s from public.admin_marketing_real_snapshots where id=g.snapshot_id;
    if g.etapa='publicar' and a.publicar_em>now() then continue; end if;
    -- Consultas/cancelamento sao permitidos durante pausa/revogacao; POST de
    -- preparar/publicar nao. Nunca transformar a falta de token em sucesso.
    if g.etapa in ('preparar','publicar') then
      if controles.pausa_global or g.pausado or c.pausada or c.conexao<>'verificada' or c.valida_ate is null or c.valida_ate<=now()
        or (c.rede='facebook' and controles.pausa_facebook) or (c.rede='instagram' and controles.pausa_instagram)
        then continue; end if;
      if s.estado<>'pronto' or g.aceite_revogado_em is not null or a.publicar_em<now()-interval '15 minutes'
        or c.revisao<>(a.manifesto->'_destino'->>'contaRevisao')::integer
        or not exists(select 1 from jsonb_array_elements(c.capacidades) k where k->>'formato'=a.formato
          and k->>'estado'='disponivel' and (k->>'revisao')::integer=(a.manifesto->'_destino'->>'capacidadeRevisao')::integer) then
        update public.admin_marketing_agendamentos set estado='precisa-conferir',codigo_erro='autorizacao-vencida',
          revisao=revisao+1,atualizado_em=now() where id=g.id; continue;
      end if;
    end if;
    if g.etapa='publicar' and exists(select 1 from public.admin_marketing_envios where agendamento_id=g.id and operacao='publicar') then
      update public.admin_marketing_agendamentos set estado='precisa-conferir',codigo_erro='publicacao-ja-iniciada',
        revisao=revisao+1,atualizado_em=now() where id=g.id; continue;
    end if;
    select coalesce(max(tentativa),0)+1 into t from public.admin_marketing_envios where agendamento_id=g.id and operacao=g.etapa;
    if t>1000 then continue; end if;
    fence:=gen_random_uuid();
    insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao)
      values(g.id,encode(sha256(convert_to(g.id::text||':'||g.etapa||':'||t,'UTF8')),'hex'),t,g.etapa) returning id into e;
    update public.admin_marketing_agendamentos set estado='preparando',lease_id=fence,lease_expira_em=now()+interval '2 minutes',
      worker_id=p_worker,lease_revisao=revisao+1,revisao=revisao+1,atualizado_em=now() where id=g.id returning * into g;
    saida:=saida||jsonb_build_array(jsonb_build_object('jobId',g.id,'leaseId',fence,'revisao',g.revisao,'envioId',e,
      'etapa',g.etapa,'processamento',g.processamento,'snapshotId',g.snapshot_id,'contaId',g.conta_id,
      'rede',c.rede,'formato',a.formato,'publicarEm',a.publicar_em,'credencialRef',c.credencial_ref,'remotoContaId',c.remoto_id));
  end loop;
  return saida;
end $$;

create function public.admin_marketing_real_admitir(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer)
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
  if not c.habilitado or c.recuperacao_pendente or c.pausa_global or conta.pausada or g.pausado
    or (conta.rede='facebook' and c.pausa_facebook) or (conta.rede='instagram' and c.pausa_instagram)
    or conta.conexao<>'verificada' or conta.valida_ate is null or conta.valida_ate<=now()
    or g.aceite_revogado_em is not null or a.publicar_em<now()-interval '15 minutes'
    or (g.etapa='publicar' and a.publicar_em>now())
    or not exists(select 1 from public.admin_marketing_real_snapshots where id=g.snapshot_id and estado='pronto')
    then return false; end if;
  update public.admin_marketing_envios set efeito_admitido_em=now() where agendamento_id=g.id
    and operacao=g.etapa and estado='iniciado' and efeito_admitido_em is null;
  get diagnostics n=row_count;return n=1;
end $$;

create function public.admin_marketing_real_recibo(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer,p_resultado jsonb)
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
  if exists(select 1 from jsonb_object_keys(p_resultado) k where k not in ('estado','processamento','remotoId','codigo'))
    then raise exception 'recibo-invalido'; end if;
  rid:=p_resultado->>'remotoId';
  if rid is not null and (char_length(rid)>200 or rid like 'sim-%') then raise exception 'recibo-invalido'; end if;
  proxima:=g.etapa; estado_job:='programado-no-painel';
  /* "Adiado" = a etapa nao produziu efeito e pode repetir. Vale so se o banco
     NAO admitiu efeito neste intento (todo POST passa por admitir antes de
     sair). Publicar e cancelar nunca sao adiados, e a decima tentativa vira
     conferencia humana, para uma consulta quebrada nao girar para sempre. */
  if resultado='adiado' and (v.efeito_admitido_em is not null or v.tentativa>=10 or g.etapa in ('publicar','cancelar')) then
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
  update public.admin_marketing_envios set estado=case when resultado='incerto' then 'incerto' when resultado in ('falhou','adiado') then 'falhou' else 'confirmado' end,
    remoto_id=rid,codigo_erro=p_resultado->>'codigo',terminado_em=now() where id=v.id;
  update public.admin_marketing_agendamentos set estado=estado_job,etapa=proxima,
    processamento=coalesce(p_resultado->'processamento',processamento),remoto_id=coalesce(rid,remoto_id),
    proxima_verificacao_em=case when proxima='publicar' then greatest(now()+interval '1 second',
      (select publicar_em from public.admin_marketing_autorizacoes where id=g.autorizacao_id))
      else now()+case when resultado='processando' then interval '30 seconds' when resultado='adiado' then interval '1 minute' else interval '1 second' end end,
    concluido_em=case when estado_job in ('publicado','cancelado') then now() else null end,
    lease_id=null,lease_expira_em=null,lease_revisao=null,worker_id=null,codigo_erro=p_resultado->>'codigo',revisao=revisao+1,atualizado_em=now()
    where id=g.id returning * into g;
  return jsonb_build_object('jobId',g.id,'revisao',g.revisao,'estado',g.estado,'etapa',g.etapa);
end $$;

revoke all on function public.admin_marketing_reservar(),
 public.admin_marketing_real_snapshot_iniciar(uuid,jsonb),public.admin_marketing_real_snapshot_finalizar(uuid,uuid,integer,jsonb),
 public.admin_marketing_real_previa(uuid,jsonb),
 public.admin_marketing_real_consultar(uuid,jsonb),public.admin_marketing_real_comando(uuid,jsonb),
 public.admin_marketing_real_admitir(uuid,uuid,uuid,integer),
 public.admin_marketing_real_confirmar(uuid,uuid,text,integer,uuid),
 public.admin_marketing_real_claim(uuid,integer),public.admin_marketing_real_recibo(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.admin_marketing_reservar(),
 public.admin_marketing_real_snapshot_iniciar(uuid,jsonb),public.admin_marketing_real_snapshot_finalizar(uuid,uuid,integer,jsonb),
 public.admin_marketing_real_previa(uuid,jsonb),
 public.admin_marketing_real_consultar(uuid,jsonb),public.admin_marketing_real_comando(uuid,jsonb),
 public.admin_marketing_real_admitir(uuid,uuid,uuid,integer),
 public.admin_marketing_real_confirmar(uuid,uuid,text,integer,uuid),
 public.admin_marketing_real_claim(uuid,integer),public.admin_marketing_real_recibo(uuid,uuid,uuid,integer,jsonb) to service_role;
commit;
