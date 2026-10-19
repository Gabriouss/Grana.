-- Painel: o Calendario mostra "Preparando n/m" enquanto o executor sobe as midias.
-- So acrescenta o campo preparo ao DTO de consultar (itens ja criados na rede,
-- total de midias do snapshot e se o container do carrossel IG ja existe).
-- Nenhum id remoto, URL ou token: so contagens. O resto da funcao e identico ao
-- de 20261018230000_admin_marketing_renovacao.sql.
begin;
create or replace function public.admin_marketing_real_consultar(p_admin uuid,p_filtro jsonb)
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
      'snapshotId',g.snapshot_id,'estrategia',g.estrategia,'estado',g.estado,'codigoErro',g.codigo_erro,
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

commit;
