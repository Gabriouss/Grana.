-- Fecha a discrepância entre prévia/confirmação v1 e o preparo do executor Graph.
-- Dependência: recuperação v1 20261020120000. Não altera linhas existentes,
-- assinaturas das RPCs, estados, pausas ou regras de idempotência/replay.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Decisão pura sobre o snapshot já verificado pelo importador. Capacidade da
-- conta não transforma MP4 em Feed. O executor continua sendo a defesa final.
-- IG: JPEG, Feed/imagem única, carrossel 2..10, Reel/vídeo, Story único.
-- Facebook: Feed/imagem única, carrossel só imagens, Reel/vídeo, sem Story.
create function public.admin_marketing_real_midia_compativel(p_dados jsonb,p_rede text,p_formato text)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare n integer;
begin
  if p_rede is null or p_rede not in ('instagram','facebook')
    or p_formato is null or p_formato not in ('feed','carrossel','reels','stories')
    or jsonb_typeof(p_dados->'midias') is distinct from 'array' then return false; end if;
  n:=jsonb_array_length(p_dados->'midias');
  if n not between 1 and 10 or (p_formato='carrossel' and n<2)
    or (p_formato<>'carrossel' and n<>1) then return false; end if;
  if exists(select 1 from jsonb_array_elements(p_dados->'midias') m
    where not coalesce((m->>'tipo'='imagem' and m->>'mime' in ('image/jpeg','image/png'))
      or (m->>'tipo'='video' and m->>'mime'='video/mp4'),false)) then return false; end if;
  if (p_formato='feed' and p_dados->'midias'->0->>'tipo'<>'imagem')
    or (p_formato='reels' and p_dados->'midias'->0->>'tipo'<>'video') then return false; end if;
  if p_rede='facebook' and (p_formato='stories' or (p_formato='carrossel'
    and exists(select 1 from jsonb_array_elements(p_dados->'midias') m where m->>'tipo'<>'imagem')))
    then return false; end if;
  if p_rede='instagram' and (exists(select 1 from jsonb_array_elements(p_dados->'midias') m
    where m->>'tipo'='imagem' and m->>'mime'<>'image/jpeg')
    or (p_formato='reels' and p_dados->'capa' is not null and p_dados->'capa'<>'null'::jsonb
      and p_dados->'capa'->>'mime' is distinct from 'image/jpeg')) then return false; end if;
  return true;
end $$;
revoke all on function public.admin_marketing_real_midia_compativel(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.admin_marketing_real_midia_compativel(jsonb,text,text) to service_role;

create or replace function public.admin_marketing_real_previa(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.admin_marketing_real_snapshots; p public.admin_marketing_real_previas;
  c public.admin_marketing_real_contas; d jsonb; cap jsonb; lista jsonb:='[]';
  g public.admin_marketing_agendamentos; a public.admin_marketing_autorizacoes;
begin
  if p_admin is null or jsonb_array_length(p_pedido->'destinos') not between 1 and 8 then raise exception 'pedido-invalido'; end if;
  -- Mesmo lock e ordem de confirmar/comando/claim/admitir/recibo.
  perform 1 from public.admin_marketing_controles where id for update;
  if p_pedido ? 'jobId' then
    select j.* into g from public.admin_marketing_agendamentos j
      join public.admin_marketing_autorizacoes au on au.id=j.autorizacao_id
      where j.id=(p_pedido->>'jobId')::uuid and j.snapshot_id is not null and au.admin_id=p_admin for update of j;
    if not found then raise exception 'agendamento-inexistente'; end if;
    if not public.admin_marketing_real_reagendamento_permitido(g.id) then raise exception 'estado-incompativel'; end if;
    select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
    if jsonb_array_length(p_pedido->'destinos')<>1 then raise exception 'destino-invalido'; end if;
    if (p_pedido->'destinos'->0->>'contaId')::uuid is distinct from g.conta_id
      or p_pedido->'destinos'->0->>'formato' is distinct from a.formato then raise exception 'destino-invalido'; end if;
    p_pedido:=p_pedido||jsonb_build_object('snapshotId',g.snapshot_id,'snapshotRevisao',
      (select revisao from public.admin_marketing_real_snapshots where id=g.snapshot_id));
  end if;
  select * into s from public.admin_marketing_real_snapshots where id=(p_pedido->>'snapshotId')::uuid and admin_id=p_admin for share;
  if not found or s.estado<>'pronto' or s.revisao<>(p_pedido->>'snapshotRevisao')::integer then raise exception 'snapshot-indisponivel'; end if;
  for d in select value from jsonb_array_elements(p_pedido->'destinos') loop
    select * into c from public.admin_marketing_real_contas where id=(d->>'contaId')::uuid;
    if not found or c.conexao<>'verificada' or c.valida_ate is null or c.valida_ate<=now() then raise exception 'conta-indisponivel'; end if;
    if not public.admin_marketing_real_midia_compativel(s.dados,c.rede,d->>'formato')
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
  insert into public.admin_marketing_real_previas(admin_id,snapshot_id,snapshot_revisao,hash,destinos,reagendamento_job_id,reagendamento_revisao)
    values(p_admin,s.id,s.revisao,encode(sha256(convert_to(jsonb_build_object('snapshot',s.identidade,'destinos',lista,'jobId',g.id,'jobRevisao',g.revisao)::text,'UTF8')),'hex'),lista,g.id,g.revisao)
    returning * into p;
  return to_jsonb(p);
end $$;

create or replace function public.admin_marketing_real_confirmar(p_admin uuid,p_previa uuid,p_hash text,p_revisao integer,p_idempotencia uuid)
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
  if p.reagendamento_job_id is not null then raise exception 'estado-incompativel'; end if;
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
    if not public.admin_marketing_real_midia_compativel(s.dados,c.rede,d->>'formato')
      then raise exception 'midia-incompativel'; end if;
    if (d->>'publicarEm')::timestamptz<=now() then raise exception 'horario-invalido'; end if;
    h:=encode(sha256(convert_to(jsonb_build_object('snapshot',s.identidade,'destino',d-'contaRevisao'-'capacidadeRevisao')::text,'UTF8')),'hex');
    if exists(select 1 from public.admin_marketing_autorizacoes where chave=h)
      or public.admin_marketing_real_alvo_ocupado(s.id,c.id,d->>'formato',(d->>'publicarEm')::timestamptz,null)
      then raise exception 'agendamento-ja-existe'; end if;
    insert into public.admin_marketing_autorizacoes(chave,admin_id,peca_id,versao,manifesto,rede,conta_destino,formato,publicar_em)
      values(h,p_admin,s.dados->>'pecaId',s.dados->>'versao',s.dados||jsonb_build_object('_destino',d),c.rede,c.remoto_id,d->>'formato',(d->>'publicarEm')::timestamptz) returning id into u;
    insert into public.admin_marketing_agendamentos(autorizacao_id,estrategia,estado,lote_id,snapshot_id,conta_id,proxima_verificacao_em)
      values(u,'executor-remoto','programado-no-painel',l.id,s.id,c.id,greatest(now(),(d->>'publicarEm')::timestamptz-interval '30 minutes')) returning id into j;
  end loop;
  return jsonb_build_object('loteId',l.id,'replay',false);
end $$;

create or replace function public.admin_marketing_real_comando(p_admin uuid,p_pedido jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.admin_marketing_agendamentos; c public.admin_marketing_controles; conta public.admin_marketing_real_contas;
  antigo public.admin_marketing_real_comandos; resultado jsonb; acao text:=p_pedido->>'acao';
  idem uuid:=(p_pedido->>'idempotencia')::uuid; a public.admin_marketing_autorizacoes; nova uuid; novo_job uuid; h text; p public.admin_marketing_real_previas; d jsonb; s public.admin_marketing_real_snapshots;
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
    if not exists(select 1 from public.admin_marketing_autorizacoes where id=g.autorizacao_id and admin_id=p_admin) then raise exception 'agendamento-inexistente'; end if;
    if g.revisao is distinct from (p_pedido->>'revisaoEsperada')::integer then raise exception 'revisao-divergente'; end if;
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
      -- Um preparo incerto não vira publicação sem ID. Só consultar IDs privados conhecidos.
      if not public.admin_marketing_real_publicacao_possivel(g.id)
        and coalesce(g.etapa_interrompida,g.etapa) in ('preparar','consultar-preparo')
        and not (g.processamento ? 'container' or g.processamento ? 'video' or jsonb_array_length(coalesce(g.processamento->'itens','[]'))>0)
        then raise exception 'estado-incompativel'; end if;
      update public.admin_marketing_agendamentos set etapa=case
        when not public.admin_marketing_real_publicacao_possivel(g.id) and coalesce(g.etapa_interrompida,g.etapa) in ('preparar','consultar-preparo')
        then 'consultar-preparo' else 'reconciliar' end,estado='programado-no-painel',
        proxima_verificacao_em=now(),revisao=revisao+1,atualizado_em=now() where id=g.id;
    elsif acao='reagendar' then
      if g.lease_id is not null then raise exception 'operacao-em-andamento'; end if;
      if not public.admin_marketing_real_reagendamento_permitido(g.id) then raise exception 'estado-incompativel'; end if;
      if p_pedido->>'previaId' is null or p_pedido->>'previaHash' is null then raise exception 'previa-inexistente'; end if;
      select * into p from public.admin_marketing_real_previas where id=(p_pedido->>'previaId')::uuid and admin_id=p_admin;
      if not found then raise exception 'previa-inexistente'; end if;
      if p.reagendamento_job_id is distinct from g.id or p.reagendamento_revisao is distinct from g.revisao
        or p.hash is distinct from p_pedido->>'previaHash' or p.snapshot_id is distinct from g.snapshot_id
        then raise exception 'revisao-divergente'; end if;
      if p.expira_em<=now() then raise exception 'previa-expirada'; end if;
      select * into s from public.admin_marketing_real_snapshots where id=p.snapshot_id and admin_id=p_admin for share;
      if not found or s.estado<>'pronto' or s.revisao<>p.snapshot_revisao or g.aceite_revogado_em is not null
        then raise exception 'snapshot-indisponivel'; end if;
      if not c.habilitado or c.pausa_global or c.recuperacao_pendente or c.capacidade_validada_em is null
        or c.capacidade_validada_em<now()-interval '1 day' or c.margem_validada_ate is null or c.margem_validada_ate<=now()
        then raise exception 'operacao-bloqueada'; end if;
      select * into a from public.admin_marketing_autorizacoes where id=g.autorizacao_id;
      select * into conta from public.admin_marketing_real_contas where id=g.conta_id for share;
      d:=p.destinos->0;
      if jsonb_array_length(p.destinos)<>1 or (d->>'contaId')::uuid is distinct from g.conta_id
        or d->>'formato' is distinct from a.formato then raise exception 'destino-invalido'; end if;
      if conta.pausada or conta.conexao<>'verificada' or conta.valida_ate is null or conta.valida_ate<=now()
        or conta.revisao is distinct from (d->>'contaRevisao')::integer then raise exception 'conta-indisponivel'; end if;
      if (conta.rede='facebook' and c.pausa_facebook) or (conta.rede='instagram' and c.pausa_instagram)
        then raise exception 'operacao-pausada'; end if;
      if not exists(select 1 from jsonb_array_elements(conta.capacidades) k where k->>'formato'=a.formato
        and k->>'estado'='disponivel' and (k->>'revisao')::integer=(d->>'capacidadeRevisao')::integer)
        then raise exception 'capacidade-nao-comprovada'; end if;
      if not public.admin_marketing_real_midia_compativel(s.dados,conta.rede,a.formato)
        then raise exception 'midia-incompativel'; end if;
      if (p_pedido->>'publicarEm')::timestamptz is distinct from (d->>'publicarEm')::timestamptz
        or (d->>'publicarEm')::timestamptz<=now() or p_pedido->>'fuso' is distinct from d->>'fuso'
        then raise exception 'horario-invalido'; end if;
      if public.admin_marketing_real_alvo_ocupado(g.snapshot_id,g.conta_id,a.formato,(d->>'publicarEm')::timestamptz,g.id)
        then raise exception 'agendamento-ja-existe'; end if;
      h:=encode(sha256(convert_to(jsonb_build_object('anterior',g.id,'previa',p.id,'destino',d)::text,'UTF8')),'hex');
      insert into public.admin_marketing_autorizacoes(chave,admin_id,peca_id,versao,manifesto,rede,conta_destino,formato,publicar_em)
        values(h,p_admin,a.peca_id,a.versao,s.dados||jsonb_build_object('_destino',d),
          a.rede,a.conta_destino,a.formato,(d->>'publicarEm')::timestamptz) returning id into nova;
      update public.admin_marketing_agendamentos set estado='cancelado',concluido_em=now(),revisao=revisao+1,atualizado_em=now() where id=g.id;
      -- Containers, IDs, tentativas e leases ficam no anterior. Sucessor começa vazio.
      -- Pausa individual acompanha; reagendar não é retomar.
      insert into public.admin_marketing_agendamentos(autorizacao_id,estrategia,estado,lote_id,snapshot_id,conta_id,pausado,substitui_id,proxima_verificacao_em)
        values(nova,'executor-remoto','programado-no-painel',g.lote_id,g.snapshot_id,g.conta_id,g.pausado,g.id,
          greatest(now(),(d->>'publicarEm')::timestamptz-interval '30 minutes')) returning id into novo_job;
    else raise exception 'pedido-invalido'; end if;
    resultado:=public.admin_marketing_real_consultar(p_admin,jsonb_build_object('acao','consultar','jobId',coalesce(novo_job,g.id)));
  end if;
  insert into public.admin_marketing_real_comandos(admin_id,idempotencia,pedido,resultado) values(p_admin,idem,p_pedido,resultado);
  return resultado;
end $$;

commit;
