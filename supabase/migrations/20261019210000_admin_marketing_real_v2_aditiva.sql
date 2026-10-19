-- e5.real.v2 ADITIVA/OPT-IN. Não altera/renomeia RPCs v1 usadas pelo executor v4.
-- Aplicar só com autorização do autor após revisão; worker novo exige flag v2.
-- Identidade editorial remota e fences compartilham o lock de controles da fila.
begin;

create table public.admin_marketing_conteudos (
  id uuid primary key, admin_id uuid not null, geracao integer not null check(geracao>0),
  estado text not null check(estado in ('em-revisao','aguardando-aceite','aceito')),
  peca_id text not null check(peca_id ~ '^[0-9a-f]{16}$'),
  versao text not null check(versao ~ '^[0-9a-f]{40}$'), atualizado_em timestamptz not null default now()
);
create table public.admin_marketing_conteudo_aliases (
  admin_id uuid not null, peca_id text not null check(peca_id ~ '^[0-9a-f]{16}$'),
  conteudo_id uuid not null references public.admin_marketing_conteudos(id), primary key(admin_id,peca_id)
);
create index admin_marketing_conteudo_alias_idx on public.admin_marketing_conteudo_aliases(conteudo_id);
create table public.admin_marketing_executor_saude (
  id boolean primary key default true check(id), concluido_em timestamptz not null,
  http integer not null check(http between 100 and 599), processados integer not null, incertos integer not null
);
alter table public.admin_marketing_conteudos enable row level security;
alter table public.admin_marketing_conteudo_aliases enable row level security;
alter table public.admin_marketing_executor_saude enable row level security;
revoke all on public.admin_marketing_conteudos,public.admin_marketing_conteudo_aliases,public.admin_marketing_executor_saude from public,anon,authenticated,service_role;
grant select,insert on public.admin_marketing_conteudos,public.admin_marketing_conteudo_aliases,public.admin_marketing_executor_saude to service_role;
grant update(geracao,estado,peca_id,versao,atualizado_em) on public.admin_marketing_conteudos to service_role;
grant update(concluido_em,http,processados,incertos) on public.admin_marketing_executor_saude to service_role;
alter table public.admin_marketing_agendamentos
  add column motivo_suspensao text,
  add column etapa_interrompida text,
  add column substitui_id uuid references public.admin_marketing_agendamentos(id);
grant update(motivo_suspensao,etapa_interrompida,substitui_id) on public.admin_marketing_agendamentos to service_role;
-- Jobs legados permanecem intactos, inclusive e1206cca. A adoção editorial
-- é explícita por aliases inequívocos; iniciarRevisao suspende só essa unidade.

create function public.admin_marketing_real_editorial_v2(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.admin_marketing_conteudos; cmd public.admin_marketing_real_comandos;
  cid uuid:=(p_pedido->>'conteudoId')::uuid; idem uuid:=(p_pedido->>'idempotencia')::uuid;
  op text:=p_pedido->>'operacao'; esperado integer:=(p_pedido->>'geracaoEsperada')::integer;
  pid text:=p_pedido->>'pecaId'; v text:=p_pedido->>'versao'; a text; resultado jsonb;
begin
  if p_admin is null or cid is null or idem is null or esperado is null or esperado<0
    or pid is null or pid !~ '^[0-9a-f]{16}$' or v is null or v !~ '^[0-9a-f]{40}$'
    or op is null or op not in ('iniciarRevisao','registrarVersao','registrarAceite') then raise exception 'pedido-invalido'; end if;
  perform 1 from public.admin_marketing_controles where id for update;
  select * into cmd from public.admin_marketing_real_comandos where admin_id=p_admin and idempotencia=idem;
  if found then
    if cmd.pedido is distinct from p_pedido then raise exception 'idempotencia-divergente'; end if;
    return cmd.resultado||'{"replay":true}';
  end if;
  select * into c from public.admin_marketing_conteudos where id=cid for update;
  if found then
    if c.admin_id<>p_admin then raise exception 'nao-autorizado'; end if;
    if c.geracao<>esperado then raise exception 'geracao-divergente'; end if;
  elsif esperado<>0 or op<>'iniciarRevisao' then raise exception 'geracao-divergente'; end if;
  if op='iniciarRevisao' then
    insert into public.admin_marketing_conteudos(id,admin_id,geracao,estado,peca_id,versao)
      values(cid,p_admin,1,'em-revisao',pid,v) on conflict(id) do update
      set geracao=admin_marketing_conteudos.geracao+1,estado='em-revisao',peca_id=pid,versao=v,atualizado_em=now() returning * into c;
  else
    if op='registrarVersao' then
      -- Mesmo hash permite acrescentar alias de promoção, mas não trocar uma
      -- versão aceita sem abrir revisão antes de alterar os arquivos.
      if c.estado='aceito' and c.versao<>v then raise exception 'revisao-nao-iniciada'; end if;
      update public.admin_marketing_conteudos set versao=v,peca_id=pid,
        estado=case when estado='aceito' then estado else 'aguardando-aceite' end,atualizado_em=now() where id=cid returning * into c;
    else
      if c.versao<>v or c.estado not in ('aguardando-aceite','aceito') then raise exception 'versao-divergente'; end if;
      update public.admin_marketing_conteudos set estado='aceito',peca_id=pid,atualizado_em=now() where id=cid returning * into c;
    end if;
  end if;
  if coalesce(jsonb_typeof(p_pedido->'aliases'),'array')<>'array' or coalesce(jsonb_array_length(p_pedido->'aliases'),0)>100 then raise exception 'pedido-invalido'; end if;
  for a in select distinct value from jsonb_array_elements_text(coalesce(p_pedido->'aliases','[]')||jsonb_build_array(pid)) loop
    if a !~ '^[0-9a-f]{16}$' then raise exception 'pedido-invalido'; end if;
    if exists(select 1 from public.admin_marketing_conteudo_aliases where admin_id=p_admin and peca_id=a and conteudo_id<>cid) then raise exception 'identidade-ambigua'; end if;
    insert into public.admin_marketing_conteudo_aliases(admin_id,peca_id,conteudo_id) values(p_admin,a,cid) on conflict do nothing;
  end loop;
  if op='iniciarRevisao' then
    update public.admin_marketing_agendamentos g set pausado=true,aceite_revogado_em=now(),
      motivo_suspensao='revisao-editorial',revisao=g.revisao+1,atualizado_em=now()
    from public.admin_marketing_autorizacoes au where au.id=g.autorizacao_id
      and au.admin_id=p_admin and g.snapshot_id is not null and g.estado not in ('publicado','cancelado','falhou')
      and (au.manifesto->>'conteudoId'=cid::text or exists(select 1 from public.admin_marketing_conteudo_aliases x where x.admin_id=p_admin and x.peca_id=au.peca_id and x.conteudo_id=cid));
  end if;
  resultado:=jsonb_build_object('conteudoId',cid,'geracaoEditorial',c.geracao,'versaoAtual',c.versao,'estadoEditorial',c.estado,'replay',false);
  insert into public.admin_marketing_real_comandos(admin_id,idempotencia,pedido,resultado) values(p_admin,idem,p_pedido,resultado);
  return resultado;
end $$;

create function public.admin_marketing_real_acompanhar_v2(p_admin uuid,p_filtro jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare c public.admin_marketing_conteudos; cid uuid; jobs jsonb;
begin
  if p_admin is null then raise exception 'nao-autorizado'; end if;
  if p_filtro ? 'conteudoId' then cid:=(p_filtro->>'conteudoId')::uuid;
  else select conteudo_id into cid from public.admin_marketing_conteudo_aliases where admin_id=p_admin and peca_id=p_filtro->>'pecaId'; end if;
  select * into c from public.admin_marketing_conteudos where id=cid and admin_id=p_admin;
  if cid is not null and not found then raise exception 'nao-autorizado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('jobId',g.id,'estado',g.estado,'revisao',g.revisao,'versao',au.versao,'motivoSuspensao',g.motivo_suspensao,
    'destino',jsonb_build_object('contaId',g.conta_id,'rede',au.rede,'formato',au.formato,'publicarEm',au.publicar_em),'snapshotId',g.snapshot_id) order by g.criado_em desc),'[]') into jobs
    from public.admin_marketing_agendamentos g join public.admin_marketing_autorizacoes au on au.id=g.autorizacao_id
    where au.admin_id=p_admin and g.snapshot_id is not null and (au.peca_id=p_filtro->>'pecaId' or au.manifesto->>'conteudoId'=cid::text
      or exists(select 1 from public.admin_marketing_conteudo_aliases x where x.admin_id=p_admin and x.conteudo_id=cid and x.peca_id=au.peca_id));
  return jsonb_build_object('conteudoId',c.id,'geracaoEditorial',c.geracao,'estadoEditorial',c.estado,'versaoAtual',c.versao,'jobs',jobs,
    'legadoPendente',exists(select 1 from jsonb_array_elements(jobs) j where j->>'estado' not in ('publicado','cancelado','falhou') and j->>'motivoSuspensao'='identidade-editorial-pendente'));
end $$;

create function public.admin_marketing_real_editorial_valido_v2(p_admin uuid,p_dados jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.admin_marketing_conteudos c join public.admin_marketing_conteudo_aliases a on a.conteudo_id=c.id
    where c.admin_id=p_admin and a.admin_id=p_admin and a.peca_id=p_dados->>'pecaId'
      and c.id::text=p_dados->>'conteudoId' and c.geracao::text=p_dados->>'geracaoEditorial'
      and c.versao=p_dados->>'versao' and c.estado='aceito')
$$;

create function public.admin_marketing_real_snapshot_iniciar_v2(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
  perform 1 from public.admin_marketing_controles where id for update;
  if not (p_pedido ? 'conteudoId') then raise exception 'atualizar-cliente'; end if;
  if not public.admin_marketing_real_editorial_valido_v2(p_admin,p_pedido) then raise exception 'revisao-editorial-pendente'; end if;
  r:=public.admin_marketing_real_snapshot_iniciar(p_admin,p_pedido);
  if r->>'admin_id'<>p_admin::text then raise exception 'nao-autorizado'; end if;
  return r;
end $$;

-- Uma só decisão de elegibilidade; usada antes da prévia e novamente na confirmação.
create function public.admin_marketing_real_elegibilidade_v2(p_admin uuid,p_snapshot uuid,p_destino jsonb,p_estimar boolean default true)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.admin_marketing_real_snapshots; c public.admin_marketing_real_contas;
  ctl public.admin_marketing_controles; motivos jsonb:='[]'; f text:=p_destino->>'formato';
  n integer; ticks integer; segundos integer; pendentes integer;
begin
  select * into s from public.admin_marketing_real_snapshots where id=p_snapshot and admin_id=p_admin;
  if not found then raise exception 'snapshot-inexistente'; end if;
  select * into c from public.admin_marketing_real_contas where id=(p_destino->>'contaId')::uuid;
  if not found then raise exception 'conta-indisponivel'; end if;
  select * into ctl from public.admin_marketing_controles where id;
  if s.estado<>'pronto' then motivos:=motivos||'"snapshot-indisponivel"'; end if;
  if not public.admin_marketing_real_editorial_valido_v2(p_admin,s.dados) then motivos:=motivos||'"revisao-editorial-pendente"'; end if;
  if not ctl.habilitado or ctl.recuperacao_pendente or ctl.capacidade_validada_em is null or ctl.capacidade_validada_em<now()-interval '1 day'
    or ctl.margem_validada_ate is null or ctl.margem_validada_ate<=now() then motivos:=motivos||'"operacao-bloqueada"'; end if;
  if ctl.pausa_global or c.pausada or (c.rede='facebook' and ctl.pausa_facebook) or (c.rede='instagram' and ctl.pausa_instagram) then motivos:=motivos||'"operacao-pausada"'; end if;
  if c.conexao<>'verificada' or c.valida_ate is null or c.valida_ate<=now() then motivos:=motivos||'"conta-indisponivel"'; end if;
  if not exists(select 1 from jsonb_array_elements(c.capacidades) k where k->>'formato'=f and k->>'estado'='disponivel'
    and (not(p_destino ? 'capacidadeRevisao') or k->>'revisao'=p_destino->>'capacidadeRevisao')) then motivos:=motivos||'"capacidade-nao-comprovada"'; end if;
  if p_destino ? 'contaRevisao' and p_destino->>'contaRevisao'<>c.revisao::text then motivos:=motivos||'"conta-indisponivel"'; end if;
  n:=jsonb_array_length(s.dados->'midias');
  if f not in ('feed','carrossel','reels','stories') or (f='carrossel' and n not between 2 and 10) or (f<>'carrossel' and n<>1)
    or (f='feed' and s.dados->'midias'->0->>'tipo'<>'imagem') or (f='reels' and s.dados->'midias'->0->>'tipo'<>'video')
    or (c.rede='facebook' and (f='stories' or (f='carrossel' and exists(select 1 from jsonb_array_elements(s.dados->'midias') m where m->>'tipo'<>'imagem')))) then motivos:=motivos||'"midia-incompativel"'; end if;
  if c.rede='instagram' and (exists(select 1 from jsonb_array_elements(s.dados->'midias') m where m->>'tipo'='imagem' and (m->>'mime'<>'image/jpeg' or (m->>'bytes')::bigint>8388608))
    or (f='reels' and s.dados->'capa'->>'mime' is not null and s.dados->'capa'->>'mime'<>'image/jpeg')) then motivos:=motivos||'"midia-incompativel"'; end if;
  if p_destino->>'fuso'<>'America/Sao_Paulo' or (p_destino->>'publicarEm')::timestamptz<=now() then motivos:=motivos||'"horario-invalido"'; end if;
  -- Estimativa interna conservadora: uma etapa por tick de minuto, três jobs por
  -- rodada. Não é quota nem garantia de latência Meta; será calibrada no piloto.
  select count(*) into pendentes from public.admin_marketing_agendamentos where snapshot_id is not null and estado in ('programado-no-painel','preparando') and not pausado;
  ticks:=case when c.rede='instagram' then n*2+case when f='carrossel' then 2 else 0 end else n end;
  segundos:=(ticks+2+ceil(pendentes/3.0)::integer)*60;
  if p_estimar and (p_destino->>'publicarEm')::timestamptz<now()+make_interval(secs=>segundos) then motivos:=motivos||'"antecedencia-insuficiente"'; end if;
  return jsonb_build_object('estado',case when jsonb_array_length(motivos)=0 then 'pronto' else 'bloqueado' end,'motivos',motivos,'preparoEstimadoSegundos',segundos);
end $$;

create function public.admin_marketing_real_previa_v2(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.admin_marketing_real_snapshots; c public.admin_marketing_real_contas; d jsonb; x jsonb; lista jsonb:='[]'; p public.admin_marketing_real_previas;
  g public.admin_marketing_agendamentos; au public.admin_marketing_autorizacoes;
begin
  if p_admin is null or jsonb_array_length(p_pedido->'destinos') not between 1 and 8 then raise exception 'pedido-invalido'; end if;
  perform 1 from public.admin_marketing_controles where id for update;
  if p_pedido ? 'jobId' then
    select j.* into g from public.admin_marketing_agendamentos j join public.admin_marketing_autorizacoes a on a.id=j.autorizacao_id
      where j.id=(p_pedido->>'jobId')::uuid and a.admin_id=p_admin;
    if not found then raise exception 'agendamento-inexistente'; end if;
    select * into au from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
    if jsonb_array_length(p_pedido->'destinos')<>1 or p_pedido->'destinos'->0->>'contaId'<>g.conta_id::text or p_pedido->'destinos'->0->>'formato'<>au.formato then raise exception 'destino-invalido'; end if;
    p_pedido:=p_pedido||jsonb_build_object('snapshotId',g.snapshot_id,'snapshotRevisao',(select revisao from public.admin_marketing_real_snapshots where id=g.snapshot_id));
  end if;
  select * into s from public.admin_marketing_real_snapshots where id=(p_pedido->>'snapshotId')::uuid and admin_id=p_admin;
  if not found then raise exception 'snapshot-inexistente'; end if;
  if not (s.dados ? 'conteudoId') then raise exception 'atualizar-cliente'; end if;
  if s.estado<>'pronto' or s.revisao<>(p_pedido->>'snapshotRevisao')::integer then raise exception 'snapshot-indisponivel'; end if;
  for d in select value from jsonb_array_elements(p_pedido->'destinos') loop
    select * into c from public.admin_marketing_real_contas where id=(d->>'contaId')::uuid;
    if not found then raise exception 'conta-indisponivel'; end if;
    x:=public.admin_marketing_real_elegibilidade_v2(p_admin,s.id,d);
    lista:=lista||jsonb_build_array(d||jsonb_build_object('rede',c.rede,'contaRevisao',c.revisao,
      'capacidadeRevisao',(select (k->>'revisao')::integer from jsonb_array_elements(c.capacidades) k where k->>'formato'=d->>'formato' limit 1))||x);
  end loop;
  if (select count(*) from jsonb_array_elements(lista))<>(select count(distinct (value->>'contaId',value->>'formato')) from jsonb_array_elements(lista)) then raise exception 'destino-duplicado'; end if;
  insert into public.admin_marketing_real_previas(admin_id,snapshot_id,snapshot_revisao,hash,destinos)
    values(p_admin,s.id,s.revisao,encode(sha256(convert_to(jsonb_build_object('snapshot',s.identidade,'destinos',lista)::text,'UTF8')),'hex'),lista) returning * into p;
  return to_jsonb(p);
end $$;

create function public.admin_marketing_real_confirmar_v2(p_admin uuid,p_previa uuid,p_hash text,p_revisao integer,p_idempotencia uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.admin_marketing_real_previas; d jsonb; e jsonb; l public.admin_marketing_real_lotes;
begin
  perform 1 from public.admin_marketing_controles where id for update;
  select * into l from public.admin_marketing_real_lotes where admin_id=p_admin and idempotencia=p_idempotencia;
  if found then return public.admin_marketing_real_confirmar(p_admin,p_previa,p_hash,p_revisao,p_idempotencia); end if;
  select * into p from public.admin_marketing_real_previas where id=p_previa and admin_id=p_admin;
  if not found then raise exception 'previa-inexistente'; end if;
  for d in select value from jsonb_array_elements(p.destinos) loop
    e:=public.admin_marketing_real_elegibilidade_v2(p_admin,p.snapshot_id,d);
    if e->>'estado'<>'pronto' then raise exception '%',e->'motivos'->>0; end if;
  end loop;
  return public.admin_marketing_real_confirmar(p_admin,p_previa,p_hash,p_revisao,p_idempotencia);
end $$;

create function public.admin_marketing_real_saude_v2(p_admin uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if p_admin is null then raise exception 'nao-autorizado'; end if;
  return jsonb_build_object('worker',(select jsonb_build_object('concluidoEm',concluido_em,'http',http,'processados',processados,'incertos',incertos) from public.admin_marketing_executor_saude where id),
    'atrasoSegundos',(select greatest(0,extract(epoch from now()-min(a.publicar_em)))::integer from public.admin_marketing_agendamentos g join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id where a.admin_id=p_admin and g.estado in ('programado-no-painel','preparando') and not g.pausado),
    'pendentes',(select count(*) from public.admin_marketing_agendamentos g join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id where a.admin_id=p_admin and g.estado in ('programado-no-painel','preparando','cancelamento-pendente')),
    'incertos',(select count(*) from public.admin_marketing_agendamentos g join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id where a.admin_id=p_admin and g.estado='precisa-conferir'),
    'recibosPendentes',(select count(*) from public.admin_marketing_envios where estado='iniciado'),
    'contas',(public.admin_marketing_real_consultar_v2(p_admin,'{"acao":"contas"}')->'contas'));
end $$;
create function public.admin_marketing_real_worker_concluido_v2(p_resultado jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if (p_resultado->>'http')::integer not between 100 and 599 or (p_resultado->>'processados')::integer<0 or (p_resultado->>'incertos')::integer<0 then raise exception 'pedido-invalido'; end if;
  insert into public.admin_marketing_executor_saude(id,concluido_em,http,processados,incertos) values(true,now(),(p_resultado->>'http')::integer,(p_resultado->>'processados')::integer,(p_resultado->>'incertos')::integer)
    on conflict(id) do update set concluido_em=excluded.concluido_em,http=excluded.http,processados=excluded.processados,incertos=excluded.incertos;
  return '{"registrado":true}';
end $$;


create function public.admin_marketing_real_claim_v2(p_worker uuid,p_limite integer)
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
  update public.admin_marketing_agendamentos set estado='precisa-conferir',etapa_interrompida=etapa,etapa='reconciliar',lease_id=null,worker_id=null,
    lease_expira_em=null,lease_revisao=null,codigo_erro='lease-vencida',revisao=revisao+1,atualizado_em=now()
    where snapshot_id is not null and lease_expira_em<=now();
  -- Readback continua disponível sem capacidade de novos efeitos.
  update public.admin_marketing_agendamentos j set estado='precisa-conferir',etapa_interrompida=j.etapa,
    codigo_erro='tentativas-esgotadas',revisao=j.revisao+1,atualizado_em=now()
    where j.snapshot_id is not null and j.lease_id is null and j.estado in ('programado-no-painel','cancelamento-pendente')
      and (select coalesce(max(v.tentativa),0) from public.admin_marketing_envios v where v.agendamento_id=j.id and v.operacao=j.etapa)>=1000;
  -- Orçamento interno de admissoes do Grana., NAO quota de publicacao Meta.
  if (select count(*) from public.admin_marketing_envios where iniciado_em>now()-interval '1 minute')>=12 then return saida; end if;
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
      and not (j.etapa in ('preparar','publicar') and (not controles.habilitado or controles.recuperacao_pendente or controles.margem_validada_ate is null or controles.margem_validada_ate<=now() or controles.capacidade_validada_em is null or controles.capacidade_validada_em<now()-interval '1 day' or controles.pausa_global or j.pausado or jc.pausada
        or jc.conexao<>'verificada' or jc.valida_ate is null or jc.valida_ate<=now()
        or (jc.rede='facebook' and controles.pausa_facebook) or (jc.rede='instagram' and controles.pausa_instagram)))
    order by j.proxima_verificacao_em,j.id for update of j skip locked limit p_limite loop
    select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
    select * into c from public.admin_marketing_real_contas where id=g.conta_id;
    select * into s from public.admin_marketing_real_snapshots where id=g.snapshot_id;
    if g.etapa in ('preparar','publicar') then
      if s.estado<>'pronto' or (s.dados ? 'conteudoId' and not public.admin_marketing_real_editorial_valido_v2(a.admin_id,s.dados)) or g.aceite_revogado_em is not null or a.publicar_em<now()-interval '15 minutes'
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
      'remotoId',g.remoto_id,'etapaInterrompida',g.etapa_interrompida,'etapa',g.etapa,'processamento',g.processamento,'snapshotId',g.snapshot_id,'contaId',g.conta_id,
      'rede',c.rede,'formato',a.formato,'publicarEm',a.publicar_em,'credencialRef',c.credencial_ref,'remotoContaId',c.remoto_id));
  end loop;
  return saida;
end $$;

create function public.admin_marketing_real_admitir_v2(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer)
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
  if not c.habilitado or c.margem_validada_ate is null or c.margem_validada_ate<=now() or c.capacidade_validada_em is null or c.capacidade_validada_em<now()-interval '1 day' or c.recuperacao_pendente or c.pausa_global or conta.pausada or g.pausado
    or (conta.rede='facebook' and c.pausa_facebook) or (conta.rede='instagram' and c.pausa_instagram)
    or conta.conexao<>'verificada' or conta.valida_ate is null or conta.valida_ate<=now()
    or conta.revisao<>(a.manifesto->'_destino'->>'contaRevisao')::integer or not exists(select 1 from jsonb_array_elements(conta.capacidades) k where k->>'formato'=a.formato and k->>'estado'='disponivel' and k->>'revisao'=a.manifesto->'_destino'->>'capacidadeRevisao') or g.aceite_revogado_em is not null or a.publicar_em<now()-interval '15 minutes'
    or (g.etapa='publicar' and a.publicar_em>now())
    or not exists(select 1 from public.admin_marketing_real_snapshots where id=g.snapshot_id and estado='pronto' and (not (dados ? 'conteudoId') or public.admin_marketing_real_editorial_valido_v2(a.admin_id,dados)))
    then return false; end if;
  update public.admin_marketing_envios set efeito_admitido_em=now() where agendamento_id=g.id
    and operacao=g.etapa and estado='iniciado' and efeito_admitido_em is null;
  get diagnostics n=row_count;return n=1;
end $$;

create function public.admin_marketing_real_comando_v2(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.admin_marketing_agendamentos; c public.admin_marketing_controles; conta public.admin_marketing_real_contas;
  antigo public.admin_marketing_real_comandos; resultado jsonb; acao text:=p_pedido->>'acao';
  idem uuid:=(p_pedido->>'idempotencia')::uuid; a public.admin_marketing_autorizacoes; nova uuid; novo_job uuid; h text; previa public.admin_marketing_real_previas; destino jsonb; elegibilidade jsonb;
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
    resultado:=public.admin_marketing_real_consultar_v2(p_admin,'{"acao":"contas"}');
  else
    select * into g from public.admin_marketing_agendamentos where id=(p_pedido->>'jobId')::uuid and snapshot_id is not null and exists(select 1 from public.admin_marketing_autorizacoes au where au.id=autorizacao_id and au.admin_id=p_admin) for update;
    if not found then raise exception 'agendamento-inexistente'; end if;
    if g.revisao<>(p_pedido->>'revisaoEsperada')::integer then raise exception 'revisao-divergente'; end if;
    if acao in ('pausar','retomar') then
      if g.estado in ('publicado','cancelado') or g.motivo_suspensao is not null then raise exception 'estado-incompativel'; end if;
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
      if (g.estado<>'programado-no-painel' and not (g.estado='precisa-conferir' and g.etapa_interrompida in ('preparar','consultar-preparo')))
        or g.lease_id is not null or exists(select 1 from public.admin_marketing_envios where agendamento_id=g.id
          and (estado='iniciado' or operacao='publicar' or (estado='incerto' and operacao not in ('preparar','consultar-preparo'))))
        then raise exception 'estado-incompativel'; end if;
      if (p_pedido->>'publicarEm')::timestamptz<=now() then raise exception 'horario-invalido'; end if;
      select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
      select * into previa from public.admin_marketing_real_previas where id=(p_pedido->>'previaId')::uuid and admin_id=p_admin;
      if not found or previa.hash is distinct from p_pedido->>'previaHash' or previa.expira_em<=now() or previa.snapshot_id<>g.snapshot_id then raise exception 'previa-inexistente'; end if;
      select value into destino from jsonb_array_elements(previa.destinos) where value->>'contaId'=g.conta_id::text and value->>'formato'=a.formato and (value->>'publicarEm')::timestamptz=(p_pedido->>'publicarEm')::timestamptz;
      if not found then raise exception 'destino-invalido'; end if;
      elegibilidade:=public.admin_marketing_real_elegibilidade_v2(p_admin,g.snapshot_id,destino);
      if elegibilidade->>'estado'<>'pronto' then raise exception '%',elegibilidade->'motivos'->>0; end if;

      if public.admin_marketing_real_alvo_ocupado(g.snapshot_id,g.conta_id,a.formato,(p_pedido->>'publicarEm')::timestamptz,g.id)
        then raise exception 'agendamento-ja-existe'; end if;
      h:=encode(sha256(convert_to(jsonb_build_object('anterior',a.chave,'horario',(p_pedido->>'publicarEm')::timestamptz)::text,'UTF8')),'hex');
      -- O _destino acompanha o horario novo; o manifesto nao guarda horario velho (B3).
      insert into public.admin_marketing_autorizacoes(chave,admin_id,peca_id,versao,manifesto,rede,conta_destino,formato,publicar_em)
        values(h,p_admin,a.peca_id,a.versao,jsonb_set(a.manifesto,'{_destino}',destino),
          a.rede,a.conta_destino,a.formato,(p_pedido->>'publicarEm')::timestamptz) returning id into nova;
      update public.admin_marketing_agendamentos set estado='cancelado',concluido_em=now(),revisao=revisao+1,atualizado_em=now() where id=g.id;
      -- A pausa individual vai junto: reagendar nao e retomar (B2).
      insert into public.admin_marketing_agendamentos(autorizacao_id,estrategia,estado,lote_id,snapshot_id,conta_id,pausado,proxima_verificacao_em)
        values(nova,'executor-remoto','programado-no-painel',g.lote_id,g.snapshot_id,g.conta_id,g.pausado,greatest(now(),(p_pedido->>'publicarEm')::timestamptz-interval '30 minutes')) returning id into novo_job;
      update public.admin_marketing_agendamentos set substitui_id=g.id where id=novo_job;
    else raise exception 'pedido-invalido'; end if;
    resultado:=public.admin_marketing_real_consultar_v2(p_admin,jsonb_build_object('acao','consultar','jobId',coalesce(novo_job,g.id)));
  end if;
  insert into public.admin_marketing_real_comandos(admin_id,idempotencia,pedido,resultado) values(p_admin,idem,p_pedido,resultado);
  return resultado;
end $$;

create function public.admin_marketing_real_consultar_v2(p_admin uuid,p_filtro jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saida jsonb; lid uuid; total integer;
begin
  if p_admin is null then raise exception 'pedido-invalido'; end if;
  if p_filtro->>'acao'='contas' then
    return jsonb_build_object('estado','disponivel','contas',coalesce((select jsonb_agg(jsonb_build_object(
      'contaId',id,'rede',rede,'rotulo',rotulo,'revisao',revisao,'conexao',conexao,'verificadaEm',verificada_em,
      'validaAte',valida_ate,'pausada',pausada,'capacidades',capacidades,'renovacao',renovacao) order by rede,id) from public.admin_marketing_real_contas),'[]'::jsonb),
      'controles',(select jsonb_build_object('revisao',revisao,'habilitado',habilitado,'pausaGlobal',pausa_global,
        'pausaFacebook',pausa_facebook,'pausaInstagram',pausa_instagram,'recuperacaoPendente',recuperacao_pendente,
        'margemValidaAte',margem_validada_ate,
        'capacidadeValidadaEm',capacidade_validada_em,'renovacao',renovacao) from public.admin_marketing_controles where id));
  end if;
  if p_filtro ? 'idempotencia' then
    select id into lid from public.admin_marketing_real_lotes where admin_id=p_admin and idempotencia=(p_filtro->>'idempotencia')::uuid;
    if not found then raise exception 'lote-inexistente'; end if;
  else lid:=(p_filtro->>'loteId')::uuid; end if;
  select coalesce(jsonb_agg(x.d order by x.criado_em desc,x.id desc),'[]') into saida from (
    select g.id,g.criado_em,jsonb_build_object('jobId',g.id,'loteId',g.lote_id,'revisao',g.revisao,
      'snapshotId',g.snapshot_id,'conteudoId',(select sn.dados->>'conteudoId' from public.admin_marketing_real_snapshots sn where sn.id=g.snapshot_id),'geracaoEditorial',(select (sn.dados->>'geracaoEditorial')::integer from public.admin_marketing_real_snapshots sn where sn.id=g.snapshot_id),'estadoEditorial',(select ec.estado from public.admin_marketing_conteudos ec where ec.id::text=a.manifesto->>'conteudoId'),'motivoSuspensao',g.motivo_suspensao,'etapaInterrompida',g.etapa_interrompida,'substituiId',g.substitui_id,'estrategia',g.estrategia,'estado',g.estado,'codigoErro',g.codigo_erro,
      'atualizadoEm',g.atualizado_em,'proximaVerificacaoEm',g.proxima_verificacao_em,'remotoId',g.remoto_id,
      'permalink',case when g.estado='publicado' and (g.processamento->>'permalink') ~ ('^https://(www\.|m\.|web\.)?'||a.rede||'\.com/')
        then g.processamento->>'permalink' end,'confirmadoEm',a.confirmado_em,'concluidoEm',g.concluido_em,
      'cancelamentoSolicitadoEm',g.cancelamento_solicitado_em,
      'preparo',jsonb_build_object('itens',case when jsonb_typeof(g.processamento->'itens')='array' then jsonb_array_length(g.processamento->'itens') else 0 end,
        'total',(select case when jsonb_typeof(sn.dados->'midias')='array' then jsonb_array_length(sn.dados->'midias') end from public.admin_marketing_real_snapshots sn where sn.id=g.snapshot_id),
        'container',g.processamento ? 'container'),
      'destino',jsonb_build_object('contaId',g.conta_id,'rede',a.rede,'formato',a.formato,'publicarEm',a.publicar_em,'fuso',a.fuso),
      'peca',jsonb_build_object('pecaId',a.peca_id,'versao',a.versao),
      'recibosLimitados',(select count(*)>50 from public.admin_marketing_envios e where e.agendamento_id=g.id),
      'recibos',coalesce((select jsonb_agg(r.d order by r.iniciado_em desc,r.id desc) from (
        select e.id,e.iniciado_em,jsonb_build_object('reciboId',e.id,'operacao',e.operacao,'estado',e.estado,'remotoId',e.remoto_id,
          'codigo',e.codigo_erro,'iniciadoEm',e.iniciado_em,'terminadoEm',e.terminado_em) d
        from public.admin_marketing_envios e where e.agendamento_id=g.id order by e.iniciado_em desc,e.id desc limit 50) r),'[]')) d
    from public.admin_marketing_agendamentos g join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id
    where a.admin_id=p_admin and g.snapshot_id is not null and (not(p_filtro ? 'jobId') or g.id=(p_filtro->>'jobId')::uuid)
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

create function public.admin_marketing_real_recibo_v2(p_worker uuid,p_job uuid,p_lease uuid,p_revisao integer,p_resultado jsonb)
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
    etapa_interrompida=case when resultado='incerto' then g.etapa else etapa_interrompida end,
    processamento=coalesce(p_resultado->'processamento',processamento),remoto_id=coalesce(rid,remoto_id),
    proxima_verificacao_em=case when proxima='publicar' then greatest(now()+interval '1 second',
      (select publicar_em from public.admin_marketing_autorizacoes where id=g.autorizacao_id))
      else now()+case when resultado='processando' then interval '30 seconds' when resultado='adiado' then interval '1 minute' else interval '1 second' end end,
    concluido_em=case when estado_job in ('publicado','cancelado') then now() else null end,
    lease_id=null,lease_expira_em=null,lease_revisao=null,worker_id=null,codigo_erro=p_resultado->>'codigo',revisao=revisao+1,atualizado_em=now()
    where id=g.id returning * into g;
  return jsonb_build_object('jobId',g.id,'revisao',g.revisao,'estado',g.estado,'etapa',g.etapa);
end $$;

-- Um cliente v1 não pode reautorizar conteúdo já adotado pelo editorial v2.
-- Sem vínculo editorial (inclusive o lote legado e1206cca), nada muda.
create function public.admin_marketing_real_proteger_editorial_v2()
returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.admin_marketing_autorizacoes; vinculado boolean;
begin
  if new.snapshot_id is null then return new; end if;
  select * into a from public.admin_marketing_autorizacoes where id=new.autorizacao_id;
  select exists(select 1 from public.admin_marketing_conteudo_aliases x
    where x.admin_id=a.admin_id and x.peca_id=a.peca_id) into vinculado;
  if vinculado and not public.admin_marketing_real_editorial_valido_v2(a.admin_id,a.manifesto)
    then raise exception 'revisao-editorial-pendente'; end if;
  return new;
end $$;
create trigger admin_marketing_proteger_editorial_v2 before insert on public.admin_marketing_agendamentos
for each row execute function public.admin_marketing_real_proteger_editorial_v2();
revoke all on function public.admin_marketing_real_proteger_editorial_v2() from public,anon,authenticated;
grant execute on function public.admin_marketing_real_proteger_editorial_v2() to service_role;

-- ACL explícita inclusive com default privileges abertos do Supabase.
do $acl$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('admin_marketing_real_editorial_v2','admin_marketing_real_acompanhar_v2','admin_marketing_real_editorial_valido_v2','admin_marketing_real_snapshot_iniciar_v2','admin_marketing_real_elegibilidade_v2','admin_marketing_real_previa_v2','admin_marketing_real_confirmar_v2','admin_marketing_real_saude_v2','admin_marketing_real_worker_concluido_v2','admin_marketing_real_claim_v2','admin_marketing_real_admitir_v2','admin_marketing_real_comando_v2','admin_marketing_real_consultar_v2','admin_marketing_real_recibo_v2') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $acl$;
commit;
