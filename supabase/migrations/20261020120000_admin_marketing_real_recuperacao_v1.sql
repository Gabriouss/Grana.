-- Correção mínima e5.real.v1. SOMENTE arquivo/testes locais nesta rodada.
-- Não aplica v2, não reabre publicação, não altera jobs ao instalar.
-- Lock único de controles preservado em todas as transições com efeitos.
begin;

alter table public.admin_marketing_agendamentos
  add column if not exists etapa_interrompida text,
  add column if not exists substitui_id uuid references public.admin_marketing_agendamentos(id);
create unique index admin_marketing_real_sucessor_unico_idx on public.admin_marketing_agendamentos(substitui_id) where substitui_id is not null;
grant update(etapa_interrompida,substitui_id) on public.admin_marketing_agendamentos to service_role;
alter table public.admin_marketing_real_previas
  add column reagendamento_job_id uuid references public.admin_marketing_agendamentos(id),
  add column reagendamento_revisao integer;
create index admin_marketing_real_previa_job_idx on public.admin_marketing_real_previas(reagendamento_job_id) where reagendamento_job_id is not null;

-- Conservador inclusive com histórico legado: tentativa de publicar basta.
-- Preparo privado admitido pode ser abandonado, nunca repetido automaticamente.
create function public.admin_marketing_real_publicacao_possivel(p_job uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.admin_marketing_agendamentos j where j.id=p_job
    and (j.remoto_id is not null or j.processamento->>'publicacaoId' is not null
      or exists(select 1 from public.admin_marketing_envios v where v.agendamento_id=j.id
        and (v.operacao in ('publicar','agendar','verificar-publicacao','cancelar')
          or (v.operacao='reconciliar' and v.remoto_id is not null)))))
$$;
revoke all on function public.admin_marketing_real_publicacao_possivel(uuid) from public,anon,authenticated;
grant execute on function public.admin_marketing_real_publicacao_possivel(uuid) to service_role;

-- Mesma elegibilidade para lista, prévia e confirmação, sobre o diário completo.
create function public.admin_marketing_real_reagendamento_permitido(p_job uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.admin_marketing_agendamentos j
    join public.admin_marketing_real_snapshots s on s.id=j.snapshot_id
    where j.id=p_job and j.lease_id is null and j.estado in ('programado-no-painel','precisa-conferir','falhou')
      and j.aceite_revogado_em is null and s.estado='pronto'
      and not public.admin_marketing_real_publicacao_possivel(j.id))
$$;
revoke all on function public.admin_marketing_real_reagendamento_permitido(uuid) from public,anon,authenticated;
grant execute on function public.admin_marketing_real_reagendamento_permitido(uuid) to service_role;
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

create or replace function public.admin_marketing_real_claim(p_worker uuid,p_limite integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare controles public.admin_marketing_controles; g public.admin_marketing_agendamentos;
  a public.admin_marketing_autorizacoes; c public.admin_marketing_real_contas;
  s public.admin_marketing_real_snapshots; e uuid; fence uuid; t integer; sem_efeito boolean; saida jsonb:='[]';
begin
  if p_worker is null or p_limite not between 1 and 3 then raise exception 'pedido-invalido'; end if;
  select * into controles from public.admin_marketing_controles where id for update;
  -- Recuperação serializada com admitir/recibo/reagendar. Nunca apaga a etapa.
  for g in select * from public.admin_marketing_agendamentos where snapshot_id is not null
    and lease_expira_em<=now() order by id for update skip locked loop
    select exists(select 1 from public.admin_marketing_envios v where v.agendamento_id=g.id
      and v.operacao=g.etapa and v.estado='iniciado' and v.efeito_admitido_em is null)
      and not exists(select 1 from public.admin_marketing_envios v where v.agendamento_id=g.id
        and v.operacao=g.etapa and v.estado='iniciado' and v.efeito_admitido_em is not null) into sem_efeito;
    update public.admin_marketing_envios set estado=case when efeito_admitido_em is null
        and operacao not in ('publicar','cancelar') then 'falhou' else 'incerto' end,
      terminado_em=now(),codigo_erro=case when efeito_admitido_em is null and operacao not in ('publicar','cancelar')
        then 'lease-vencida-sem-efeito' else 'lease-vencida' end
      where agendamento_id=g.id and estado='iniciado';
    update public.admin_marketing_agendamentos set
      estado=case when g.etapa in ('consultar-preparo','verificar-publicacao','reconciliar')
        or (g.etapa='preparar' and sem_efeito)
        then 'programado-no-painel' else 'precisa-conferir' end,
      etapa_interrompida=case when g.etapa='reconciliar' then coalesce(g.etapa_interrompida,g.etapa) else g.etapa end,
      etapa=case when g.etapa='publicar' then 'reconciliar' else g.etapa end,
      lease_id=null,worker_id=null,lease_expira_em=null,lease_revisao=null,
      codigo_erro='lease-vencida',revisao=revisao+1,atualizado_em=now() where id=g.id;
  end loop;
  -- Retirar esgotados ANTES do LIMIT: não ocupar as vagas da fila com continue.
  update public.admin_marketing_agendamentos j set estado='precisa-conferir',codigo_erro='tentativas-esgotadas',
    revisao=j.revisao+1,atualizado_em=now()
    where j.snapshot_id is not null and j.lease_id is null and j.estado in ('programado-no-painel','cancelamento-pendente')
      and (select coalesce(max(v.tentativa),0) from public.admin_marketing_envios v
        where v.agendamento_id=j.id and v.operacao=j.etapa)>=1000;
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
  if g.etapa not in ('preparar','publicar') or c.margem_validada_ate is null or c.margem_validada_ate<=now()
    or c.capacidade_validada_em is null or c.capacidade_validada_em<now()-interval '1 day'
    or conta.revisao is distinct from (a.manifesto->'_destino'->>'contaRevisao')::integer
    or not exists(select 1 from jsonb_array_elements(conta.capacidades) k where k->>'formato'=a.formato
      and k->>'estado'='disponivel' and (k->>'revisao')::integer=(a.manifesto->'_destino'->>'capacidadeRevisao')::integer)
    or not c.habilitado or c.recuperacao_pendente or c.pausa_global or conta.pausada or g.pausado
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
  elsif resultado='incerto' then estado_job:='precisa-conferir';
    proxima:=case when g.etapa in ('preparar','consultar-preparo') then g.etapa else 'reconciliar' end;
  else raise exception 'recibo-invalido'; end if;
  update public.admin_marketing_envios set estado=case when resultado='incerto' then 'incerto' when resultado in ('falhou','adiado') then 'falhou' else 'confirmado' end,
    remoto_id=rid,codigo_erro=p_resultado->>'codigo',terminado_em=now() where id=v.id;
  update public.admin_marketing_agendamentos set estado=estado_job,etapa=proxima,
    etapa_interrompida=case when resultado='incerto' then
      case when g.etapa='reconciliar' then coalesce(g.etapa_interrompida,g.etapa) else g.etapa end else etapa_interrompida end,
    processamento=coalesce(p_resultado->'processamento',processamento),remoto_id=coalesce(rid,remoto_id),
    proxima_verificacao_em=case when proxima='publicar' then greatest(now()+interval '1 second',
      (select publicar_em from public.admin_marketing_autorizacoes where id=g.autorizacao_id))
      else now()+case when resultado='processando' then interval '30 seconds' when resultado='adiado' then interval '1 minute' else interval '1 second' end end,
    concluido_em=case when estado_job in ('publicado','cancelado') then now() else null end,
    lease_id=null,lease_expira_em=null,lease_revisao=null,worker_id=null,codigo_erro=p_resultado->>'codigo',revisao=revisao+1,atualizado_em=now()
    where id=g.id returning * into g;
  return jsonb_build_object('jobId',g.id,'revisao',g.revisao,'estado',g.estado,'etapa',g.etapa);
end $$;

create or replace function public.admin_marketing_real_consultar(p_admin uuid,p_filtro jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saida jsonb; lid uuid; alvo uuid; recibo jsonb; total integer;
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
    if not found then
      -- Reagendar mantém o lote original: sua chave pertence ao diário de comandos.
      -- O recibo identifica o alvo; o DTO abaixo sempre lê o estado ATUAL desse job.
      select resultado into recibo from public.admin_marketing_real_comandos
        where admin_id=p_admin and idempotencia=(p_filtro->>'idempotencia')::uuid;
      if not found or jsonb_typeof(recibo->'jobs') is distinct from 'array' then raise exception 'lote-inexistente'; end if;
      if jsonb_array_length(recibo->'jobs')<>1 or coalesce(recibo->'jobs'->0->>'jobId','')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then raise exception 'lote-inexistente'; end if;
      alvo:=(recibo->'jobs'->0->>'jobId')::uuid;
      select g.lote_id into lid from public.admin_marketing_agendamentos g
        join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id
        where g.id=alvo and g.snapshot_id is not null and a.admin_id=p_admin;
      if not found then raise exception 'lote-inexistente'; end if;
    end if;
  else lid:=(p_filtro->>'loteId')::uuid; end if;
  select coalesce(jsonb_agg(x.d order by x.criado_em desc,x.id desc),'[]') into saida from (
    select g.id,g.criado_em,jsonb_build_object('jobId',g.id,'loteId',g.lote_id,'revisao',g.revisao,
      'snapshotId',g.snapshot_id,'estrategia',g.estrategia,
      'etapa',g.etapa,'etapaInterrompida',g.etapa_interrompida,
      'reagendamento',jsonb_build_object('permitido',public.admin_marketing_real_reagendamento_permitido(g.id),
        'motivo',case when public.admin_marketing_real_reagendamento_permitido(g.id) then null else 'estado-incompativel' end,
        'motivos',case when public.admin_marketing_real_reagendamento_permitido(g.id) then '[]'::jsonb
          else '["estado-incompativel"]'::jsonb end),'estado',g.estado,'codigoErro',g.codigo_erro,
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
    where g.snapshot_id is not null and a.admin_id=p_admin and (alvo is null or g.id=alvo)
      and (not(p_filtro ? 'jobId') or g.id=(p_filtro->>'jobId')::uuid)
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
commit;
