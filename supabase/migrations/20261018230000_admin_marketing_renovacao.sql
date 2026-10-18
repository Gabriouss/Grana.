-- Preparada localmente. NAO aplicar sem o "sim" do autor (regra 11).
-- Renovacao automatica da capacidade: o executor real, chamado pelo cron que
-- ja existe, le a Graph (so GET) uma vez por dia e grava aqui o resultado.
-- Leitura inconclusiva (rede, prazo, erro desconhecido) nao renova nem revoga:
-- so deixa recibo. Nunca promove formato que nao estava disponivel nem conta
-- que gente nao verificou; nunca mexe em pausa nem em revisao (as revisoes
-- amarram as autorizacoes ja confirmadas).
begin;

alter table public.admin_marketing_real_contas
  add column renovacao jsonb not null default '{}' check (jsonb_typeof(renovacao)='object' and octet_length(renovacao::text)<=4096);
grant update(renovacao) on public.admin_marketing_real_contas to service_role;
-- controles ja tem UPDATE de tabela para service_role (fundacao).
alter table public.admin_marketing_controles
  add column renovacao_tentada_em timestamptz,
  add column renovacao_lease uuid,
  add column renovacao_lease_expira_em timestamptz,
  add column renovacao jsonb not null default '{}' check (jsonb_typeof(renovacao)='object' and octet_length(renovacao::text)<=4096);

create table public.admin_marketing_real_renovacoes (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  resultado text not null default 'iniciada' check (resultado in ('iniciada','renovada','parcial','inconclusiva')),
  detalhe jsonb not null default '{}' check (jsonb_typeof(detalhe)='object' and octet_length(detalhe::text)<=32768)
);
create index admin_marketing_real_renovacoes_idx on public.admin_marketing_real_renovacoes(iniciado_em desc);
alter table public.admin_marketing_real_renovacoes enable row level security;
revoke all on public.admin_marketing_real_renovacoes from public,anon,authenticated,service_role;
grant select,insert on public.admin_marketing_real_renovacoes to service_role;
grant update(terminado_em,resultado,detalhe) on public.admin_marketing_real_renovacoes to service_role;

-- Devida quando a validacao tem mais de 20 h (claim e confirmar exigem menos
-- de 24 h): sobram 4 tentativas, uma por hora, antes de a fila parar.
create function public.admin_marketing_real_renovacao_iniciar(p_worker uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.admin_marketing_controles; l uuid; r uuid;
begin
  if p_worker is null then raise exception 'pedido-invalido'; end if;
  select * into c from public.admin_marketing_controles where id for update;
  -- Lease vencida sem registro vira recibo inconclusivo, nunca some.
  update public.admin_marketing_real_renovacoes set resultado='inconclusiva',terminado_em=now(),
    detalhe=jsonb_build_object('motivo','sem-registro') where resultado='iniciada' and iniciado_em<now()-interval '1 minute';
  if c.renovacao_lease is not null and c.renovacao_lease_expira_em>now() then return null; end if;
  if c.capacidade_validada_em>=now()-interval '20 hours' then return null; end if;
  if c.renovacao_tentada_em>now()-interval '1 hour' then return null; end if;
  if not exists(select 1 from public.admin_marketing_real_contas) then return null; end if;
  l:=gen_random_uuid();
  insert into public.admin_marketing_real_renovacoes(worker_id) values(p_worker) returning id into r;
  update public.admin_marketing_controles set renovacao_tentada_em=now(),renovacao_lease=l,
    renovacao_lease_expira_em=now()+interval '1 minute' where id;
  return jsonb_build_object('renovacaoId',r,'lease',l,'contas',(select jsonb_agg(jsonb_build_object('contaId',id,'rede',rede,
    'remotoId',remoto_id,'credencialRef',credencial_ref) order by rede,id) from public.admin_marketing_real_contas));
end $$;

create function public.admin_marketing_real_renovacao_registrar(p_worker uuid,p_renovacao uuid,p_lease uuid,p_resultado jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.admin_marketing_controles; x jsonb; conta public.admin_marketing_real_contas; res text; fmts jsonb;
  quando text:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); recibo jsonb; caps jsonb;
  inconclusivo boolean:=false; todas_ok boolean:=true; verificadas integer:=0; lista jsonb:='[]'; global text;
begin
  if p_worker is null or p_renovacao is null or p_lease is null or jsonb_typeof(p_resultado->'contas') is distinct from 'array'
    or jsonb_array_length(p_resultado->'contas')>50 then raise exception 'pedido-invalido'; end if;
  select * into c from public.admin_marketing_controles where id for update;
  if c.renovacao_lease is distinct from p_lease or c.renovacao_lease_expira_em<=now() then raise exception 'lease-invalida'; end if;
  -- Conta que nao veio no resultado (criada no meio do ciclo) deixa o ciclo inconclusivo.
  if exists(select 1 from public.admin_marketing_real_contas k where not exists(select 1 from jsonb_array_elements(p_resultado->'contas') e
    where e->>'contaId'=k.id::text)) then inconclusivo:=true; end if;
  for x in select value from jsonb_array_elements(p_resultado->'contas') loop
    res:=x->>'resultado';fmts:=coalesce(x->'formatos','{}');
    if res is null or res not in ('ok','permissao-ausente','expirada','revogada','indisponivel','inconclusivo')
      or (x ? 'motivo' and (x->>'motivo') !~ '^[a-z0-9:_-]{1,80}$') or jsonb_typeof(fmts)<>'object'
      or exists(select 1 from jsonb_each_text(fmts) f where f.key not in ('feed','carrossel','reels','stories') or f.value !~ '^(ok|ausente:[a-z_]{1,60})$')
      then raise exception 'resultado-invalido'; end if;
    select * into conta from public.admin_marketing_real_contas where id=(x->>'contaId')::uuid for update;
    if not found then continue; end if;
    recibo:=jsonb_build_object('em',quando,'resultado',res,'motivo',x->>'motivo','formatos',fmts);
    if res='inconclusivo' then inconclusivo:=true; end if;
    if res<>'ok' then todas_ok:=false; end if;
    -- Conta que gente nunca verificou nao e promovida pela maquina.
    if conta.conexao='nao-verificada' then
      update public.admin_marketing_real_contas set renovacao=recibo||'{"ignorada":"conta-nao-verificada"}' where id=conta.id;
    elsif res in ('ok','permissao-ausente') then
      -- So mexe no formato que ja estava disponivel ou que a propria renovacao tirou; revisao fica.
      select coalesce(jsonb_agg(case when fmts ? (k->>'formato') and (k->>'estado'='disponivel' or (k->>'estado'='indisponivel' and k->>'origem'='renovacao'))
          then case when fmts->>(k->>'formato')='ok' then (k-'origem'-'motivo')||jsonb_build_object('estado','disponivel','renovadaEm',quando)
            else k||jsonb_build_object('estado','indisponivel','origem','renovacao','motivo',fmts->>(k->>'formato'),'renovadaEm',quando) end
          else k end order by n),'[]') into caps from jsonb_array_elements(conta.capacidades) with ordinality e(k,n);
      update public.admin_marketing_real_contas set conexao='verificada',verificada_em=now(),valida_ate=now()+interval '7 days',
        capacidades=caps,renovacao=recibo where id=conta.id;
      verificadas:=verificadas+1;
    elsif res in ('expirada','revogada','indisponivel') then
      update public.admin_marketing_real_contas set conexao=res,renovacao=recibo where id=conta.id;
    else
      update public.admin_marketing_real_contas set renovacao=recibo where id=conta.id;
    end if;
    lista:=lista||jsonb_build_array(recibo||jsonb_build_object('contaId',conta.id,'rede',conta.rede));
  end loop;
  -- Sem nenhuma conta verificada de fato, nao ha o que validar no global.
  global:=case when inconclusivo then 'inconclusiva' when todas_ok and verificadas>0 then 'renovada' else 'parcial' end;
  update public.admin_marketing_real_renovacoes set terminado_em=now(),resultado=global,detalhe=jsonb_build_object('contas',lista)
    where id=p_renovacao and resultado='iniciada';
  if not found then raise exception 'renovacao-inexistente'; end if;
  update public.admin_marketing_controles set renovacao_lease=null,renovacao_lease_expira_em=null,
    renovacao=jsonb_build_object('em',quando,'resultado',global,'renovacaoId',p_renovacao),
    capacidade_validada_em=case when inconclusivo or verificadas=0 then capacidade_validada_em else now() end,
    margem_validada_ate=case when inconclusivo or verificadas=0 then margem_validada_ate else now()+interval '30 hours' end where id;
  return jsonb_build_object('renovacaoId',p_renovacao,'resultado',global);
end $$;

-- O painel le o ultimo recibo de cada conta e do ciclo para mostrar o aviso.
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

revoke all on function public.admin_marketing_real_renovacao_iniciar(uuid),
 public.admin_marketing_real_renovacao_registrar(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_marketing_real_renovacao_iniciar(uuid),
 public.admin_marketing_real_renovacao_registrar(uuid,uuid,uuid,jsonb) to service_role;
commit;
