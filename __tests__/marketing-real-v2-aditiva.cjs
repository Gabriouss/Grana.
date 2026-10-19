'use strict';
// SQL e contratos reais em PGlite; nenhuma chamada a Supabase/Meta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function carregar(rel) {
 const abs=path.resolve(__dirname,'..',rel);
 if(cache.has(abs))return cache.get(abs).exports;
 const m=new Module(abs,module);cache.set(abs,m);
 m.require=id=>id.startsWith('npm:')?{}:carregar(path.relative(path.resolve(__dirname,'..'),path.resolve(path.dirname(abs),id)));
 m._compile(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,abs);
 return m.exports;
}
const {criarExecutorReal}=carregar('supabase/functions/_shared/marketing-real-executor.ts');
const {criarOperacaoPublicacoesReais,validarPublicacaoReal}=carregar('supabase/functions/_shared/admin-publicacoes-reais.ts');
const { randomUUID, createHash } = require('node:crypto');
const sha = b => createHash('sha256').update(b).digest('hex');
const MIGRATIONS = ['20261015190000_admin_marketing_fundacao.sql','20261016140000_admin_marketing_operacoes.sql',
  '20261018001000_admin_marketing_real.sql','20261018230000_admin_marketing_renovacao.sql','20261019120000_admin_marketing_consultar_preparo.sql'];
const V2 = '20261019210000_admin_marketing_real_v2_aditiva.sql';
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(a,m)=>{assert.ok(a,m);checks++;};
(async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const m of MIGRATIONS)await db.exec(fs.readFileSync('supabase/migrations/'+m,'utf8'));
  const corpos = async () => (await db.query(`select proname,prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and proname like 'admin_marketing_real_%' and proname not like '%_v2' order by proname`)).rows;
  const legado = await corpos();
  // Um job v1 já existente ao aplicar a migration (como e1206cca) não é pausado.
  const legacyAdmin=randomUUID(),legacyAccount=randomUUID();
  const raw=async(n,args)=>(await db.query(`select public.admin_marketing_real_${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
  await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
    values($1,'instagram','999','Legado','MARKETING_IG_TOKEN','verificada',now()+interval '7 days',false,$2)`,
    [legacyAccount,[{formato:'feed',estado:'disponivel',revisao:1,motivos:[]}]]);
  await db.query(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,pausa_instagram=false,pausa_facebook=false,
    recuperacao_pendente=false,capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 day'`);
  let ls=await raw('snapshot_iniciar',[legacyAdmin,{pecaId:'e'.repeat(16),versao:'f'.repeat(40),aceiteId:'legado',aceiteRevisao:1,
    legenda:'Legado.',legendaSha256:sha('Legado.'),midias:[{ordem:0,sha256:'a'.repeat(64),mime:'image/jpeg',tipo:'imagem',bytes:100}],capa:null}]);
  ls=await raw('snapshot_finalizar',[legacyAdmin,ls.id,1,{identidade:ls.identidade,midias:ls.dados.midias,capa:null}]);
  const lp=await raw('previa',[legacyAdmin,{snapshotId:ls.id,snapshotRevisao:2,destinos:[{contaId:legacyAccount,formato:'feed',publicarEm:new Date(Date.now()+7200000).toISOString(),fuso:'America/Sao_Paulo'}]}]);
  await raw('confirmar',[legacyAdmin,lp.id,lp.hash,1,randomUUID()]);
  const legacyRows=async()=>(await db.query('select * from public.admin_marketing_agendamentos where snapshot_id=$1',[ls.id])).rows;
  const legacyBefore=await legacyRows();
  await db.exec(fs.readFileSync('supabase/migrations/'+V2,'utf8'));
  eq(await corpos(), legado, 'todos os corpos RPC v1 preservados byte a byte');
  eq((await legacyRows()).map(({motivo_suspensao,etapa_interrompida,substitui_id,...j})=>j),legacyBefore,'migration não altera o job v1 já agendado');
  await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where snapshot_id=$1',[ls.id]);
  await db.exec('set role service_role');
  const lw=randomUUID(),[lc]=await raw('claim_v2',[lw,3]);
  eq(lc.jobId,legacyBefore[0].id,'worker v2 continua lendo job v1');
  eq(await raw('admitir_v2',[lw,lc.jobId,lc.leaseId,lc.revisao]),true,'job legado sem adoção editorial permanece autorizado');
  await raw('recibo_v2',[lw,lc.jobId,lc.leaseId,lc.revisao,{estado:'preparo-parcial',processamento:{itens:['700']}}]);
  await raw('comando',[legacyAdmin,{acao:'cancelar',jobId:lc.jobId,revisaoEsperada:(await legacyRows())[0].revisao,idempotencia:randomUUID()}]);
  const admin=randomUUID(),other=randomUUID(),cid=randomUUID(),conta=randomUUID();
  const pid='a'.repeat(16),version='b'.repeat(40),version2='c'.repeat(40);
  const rpc=async(n,args)=>(await db.query(`select public.admin_marketing_real_${n === 'snapshot_finalizar' ? n : n + '_v2'}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
  const rejects=async(p,pattern)=>{await assert.rejects(p,pattern);checks++;};
  const owner=async(sql,params=[])=>{await db.exec('reset role');try{return(await db.query(sql,params)).rows;}finally{await db.exec('set role service_role');}};
  await db.exec('set role service_role');
  await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
    values($1,'instagram','123','Fixture','MARKETING_IG_TOKEN','verificada',now()+interval '7 days',false,$2)`,[conta,[{formato:'carrossel',estado:'disponivel',revisao:1},{formato:'feed',estado:'disponivel',revisao:1}]]);
  await owner(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,pausa_instagram=false,pausa_facebook=false,recuperacao_pendente=false,capacidade_validada_em=now(),margem_validada_ate=now()+interval '30 hours'`);
  const edit=(operacao,geracaoEsperada,versao=version,extra={})=>({operacao,conteudoId:cid,geracaoEsperada,idempotencia:randomUUID(),pecaId:pid,versao,...extra});
  const opening=edit('iniciarRevisao',0);
  eq((await rpc('editorial',[admin,opening])).geracaoEditorial,1,'bootstrap generation1');
  eq((await rpc('editorial',[admin,opening])).replay,true,'lost response retries same generation');
  await rejects(rpc('editorial',[admin,{...opening,versao:version2}]),/idempotencia-divergente/);
  await rejects(rpc('editorial',[other,edit('iniciarRevisao',1)]),/nao-autorizado/);
  await rejects(rpc('editorial',[admin,edit('registrarAceite',1)]),/versao-divergente/);
  await rpc('editorial',[admin,edit('registrarVersao',1)]);await rpc('editorial',[admin,edit('registrarAceite',1)]);
  eq((await rpc('acompanhar',[admin,{pecaId:pid}])).estadoEditorial,'aceito');
  await rejects(rpc('editorial',[admin,edit('registrarVersao',1,version2)]),/revisao-nao-iniciada/);
  const snapPedido={pecaId:pid,versao:version,conteudoId:cid,geracaoEditorial:1,aceiteId:'fixture',aceiteRevisao:1,legenda:'Legenda.',legendaSha256:sha('Legenda.'),
    midias:[0,1,2,3,4].map(ordem=>({ordem,sha256:sha('imagem'+ordem),tipo:'imagem',mime:'image/jpeg',bytes:100,largura:1080,altura:1440})),capa:null};
  await rejects(rpc('snapshot_iniciar',[admin,{...snapPedido,conteudoId:undefined,geracaoEditorial:undefined}]),/atualizar-cliente/);
  let snap=await rpc('snapshot_iniciar',[admin,snapPedido]);
  snap=await rpc('snapshot_finalizar',[admin,snap.id,1,{identidade:snap.identidade,midias:snap.dados.midias,capa:null}]);
  const futuro=()=>new Date(Date.now()+7200000).toISOString();
  const dest=(publicarEm=futuro())=>({contaId:conta,rede:'instagram',formato:'carrossel',publicarEm,fuso:'America/Sao_Paulo'});
  const prever=destino=>rpc('previa',[admin,{snapshotId:snap.id,snapshotRevisao:2,destinos:[destino]}]);
  await rejects(rpc('previa',[other,{snapshotId:snap.id,snapshotRevisao:2,destinos:[dest()]}]),/snapshot-inexistente/);
  const bloqueada=await prever(dest(new Date(Date.now()+60000).toISOString()));
  ok(bloqueada.destinos[0].motivos.includes('antecedencia-insuficiente'),'preflight estimates five-slide preparation');
  await rejects(rpc('confirmar',[admin,bloqueada.id,bloqueada.hash,1,randomUUID()]),/antecedencia-insuficiente/);
  await owner(`update public.admin_marketing_controles set capacidade_validada_em=now()-interval '25 hours'`);
  const expirada=await prever(dest());eq(expirada.destinos[0].estado,'bloqueado');ok(expirada.destinos[0].motivos.includes('operacao-bloqueada'));
  await owner(`update public.admin_marketing_controles set capacidade_validada_em=now()`);
  const p=await prever(dest());eq(p.destinos[0].estado,'pronto');eq(p.snapshot_revisao,2);eq(p.destinos[0].preparoEstimadoSegundos,840);
  // A confirmação usa a MESMA elegibilidade e revalida depois da prévia pronta.
  await owner(`update public.admin_marketing_controles set pausa_instagram=true`);
  await rejects(rpc('confirmar',[admin,p.id,p.hash,1,randomUUID()]),/operacao-pausada/);
  await owner(`update public.admin_marketing_controles set pausa_instagram=false`);
  const idem=randomUUID(),lote=await rpc('confirmar',[admin,p.id,p.hash,1,idem]);
  eq((await rpc('confirmar',[admin,p.id,p.hash,1,idem])).loteId,lote.loteId);
  const job=async()=>(await rpc('consultar',[admin,{acao:'consultar',loteId:lote.loteId}])).jobs.find(j=>j.estado!=='cancelado');
  let j=await job();eq(j.conteudoId,cid);eq(j.geracaoEditorial,1);
  eq((await rpc('consultar',[other,{acao:'consultar',jobId:j.jobId}])).jobs.length,0,'owner on read');
  await rejects(rpc('comando',[other,{acao:'cancelar',jobId:j.jobId,revisaoEsperada:j.revisao,idempotencia:randomUUID()}]),/agendamento-inexistente/);
  // Preparation may run immediately for this fixture; no real external POST.
  await owner(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where id=$1`,[j.jobId]);
  const worker=randomUUID(),[claim]=await rpc('claim',[worker,3]);ok(claim,'claim valid generation');
  eq(await rpc('admitir',[worker,claim.jobId,claim.leaseId,claim.revisao]),true);
  await rpc('recibo',[worker,claim.jobId,claim.leaseId,claim.revisao,{estado:'preparo-parcial',processamento:{itens:['700']}}]);
  j=await job();
  // Reschedule after known private preparation: fresh preview, same snapshot.
  const novaHora=new Date(Date.now()+10800000).toISOString();
  await owner('update public.admin_marketing_real_contas set revisao=revisao+1 where id=$1',[conta]);
  const novaPrevia=await rpc('previa',[admin,{jobId:j.jobId,destinos:[dest(novaHora)]}]);
  eq(novaPrevia.snapshot_id,snap.id,'reschedule preview reuses original immutable snapshot');
  const reag=await rpc('comando',[admin,{acao:'reagendar',jobId:j.jobId,revisaoEsperada:j.revisao,idempotencia:randomUUID(),publicarEm:novaHora,fuso:'America/Sao_Paulo',previaId:novaPrevia.id,previaHash:novaPrevia.hash}]);
  const sucessor=reag.jobs[0];eq(sucessor.substituiId,j.jobId);eq(sucessor.preparo.itens,0,'private containers not reused');
  eq((await owner(`select a.manifesto->'_destino'->>'contaRevisao' r from public.admin_marketing_agendamentos g join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id where g.id=$1`,[sucessor.jobId]))[0].r,'2','sucessor guarda revisão da nova prévia, não a antiga');
  // Both PCs share CAS. Opening a revision holds old jobs BEFORE local writes.
  const revisao=edit('iniciarRevisao',1,version2);eq((await rpc('editorial',[admin,revisao])).geracaoEditorial,2);
  await rejects(rpc('editorial',[admin,edit('iniciarRevisao',1,version)]),/geracao-divergente/);
  let held=(await rpc('consultar',[admin,{acao:'consultar',jobId:sucessor.jobId}])).jobs[0];eq(held.motivoSuspensao,'revisao-editorial');
  await rejects(rpc('comando',[admin,{acao:'retomar',jobId:held.jobId,revisaoEsperada:held.revisao,idempotencia:randomUUID()}]),/estado-incompativel/);
  await rpc('editorial',[admin,edit('registrarVersao',2,version2)]);await rpc('editorial',[admin,edit('registrarAceite',2,version2)]);
  held=(await rpc('consultar',[admin,{acao:'consultar',jobId:sucessor.jobId}])).jobs[0];eq(held.motivoSuspensao,'revisao-editorial','approval does not resume old job');
  await rejects(rpc('confirmar',[admin,p.id,p.hash,1,randomUUID()]),/revisao-editorial-pendente/);
  // Cliente legado não recria autorização de conteúdo já suspenso no editorial.
  const oldSnap=await db.query(`select public.admin_marketing_real_snapshot_iniciar($1,$2) r`,[admin,{...snapPedido,conteudoId:undefined,geracaoEditorial:undefined}]);
  const os=oldSnap.rows[0].r;
  await rpc('snapshot_finalizar',[admin,os.id,1,{identidade:os.identidade,midias:os.dados.midias,capa:null}]);
  const op=(await db.query(`select public.admin_marketing_real_previa($1,$2) r`,[admin,{snapshotId:os.id,snapshotRevisao:2,destinos:[dest()]}])).rows[0].r;
  await rejects(db.query(`select public.admin_marketing_real_confirmar($1,$2,$3,1,$4)`,[admin,op.id,op.hash,randomUUID()]),/revisao-editorial-pendente/);
  // Readback remains claimable despite pause, expired operational capacity and editorial suspension.
  await owner(`update public.admin_marketing_agendamentos set etapa='verificar-publicacao',processamento='{"publicacaoId":"123_900"}',estado='programado-no-painel',proxima_verificacao_em=now() where id=$1`,[held.jobId]);
  await owner(`update public.admin_marketing_controles set habilitado=false,pausa_global=true,capacidade_validada_em=now()-interval '25 hours',margem_validada_ate=now()-interval '1 hour'`);
  // Executor REAL v2: capacidade vencida/pausa não impedem GET nem recibo.
  const args={claim:['p_worker','p_limite'],recibo:['p_worker','p_job','p_lease','p_revisao','p_resultado'],
    admitir:['p_worker','p_job','p_lease','p_revisao'],worker_concluido:['p_resultado'],
    renovacao_iniciar:['p_worker'],renovacao_registrar:['p_worker','p_renovacao','p_lease','p_resultado'],
    previa:['p_admin','p_pedido'],consultar:['p_admin','p_filtro']};
  const rpcCalls=[],graphCalls=[];
  const client={rpc(nome,params){return {abortSignal:async()=>{
    rpcCalls.push(nome);const key=nome.replace('admin_marketing_real_','').replace(/_v2$/,'');
    if(key==='renovacao_iniciar')return{data:null,error:null}; // cron de renovação fora deste cenário
    ok(args[key],'RPC de fronteira conhecida');
    try{return{data:(await db.query(`select public.${nome}(${args[key].map((_,i)=>'$'+(i+1)).join(',')}) r`,args[key].map(k=>params[k]))).rows[0].r,error:null};}
    catch(e){return{data:null,error:{message:e.message,code:e.code}};}
  }};},from(table){eq(table,'admin_marketing_real_snapshots');let id;
    const q={select:()=>q,eq:(_,v)=>{id=v;return q;},abortSignal:()=>q,single:async()=>({data:(await db.query('select * from public.admin_marketing_real_snapshots where id=$1',[id])).rows[0],error:null}),
      maybeSingle:async()=>q.single()};return q;
  }};
  const environment={MARKETING_REAL_EXECUTOR_ATIVO:'true',MARKETING_REAL_EXECUTOR_SECRET:'fixture-secret-'.repeat(3),
    META_GRAPH_API_VERSION:'v23.0',MARKETING_REAL_EXECUTOR_CONTRATO:'e5.real.v2',MARKETING_IG_TOKEN:'fixture-token'};
  const logs=[];
  const handler=criarExecutorReal({env:n=>environment[n],cliente:()=>client,log:l=>logs.push(l),rede:async(url,init)=>{
    graphCalls.push([String(url),init.method]);eq(init.method,'GET','readback não faz POST durante suspensão');
    ok(String(url).startsWith('https://graph.facebook.com/v23.0/123_900?'));
    return Response.json({id:'123_900',media_product_type:'FEED',permalink:'https://www.instagram.com/p/v2fixture/'});
  }});
  const invoke=()=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-real-secret':environment.MARKETING_REAL_EXECUTOR_SECRET},body:'{}'}));
  const result=await invoke();eq(result.status,200);eq((await result.json()).processados,1);
  eq(graphCalls.length,1);ok(rpcCalls.includes('admin_marketing_real_claim_v2'));ok(rpcCalls.includes('admin_marketing_real_recibo_v2'));
  ok(!rpcCalls.includes('admin_marketing_real_admitir_v2'),'consulta não precisa de admissão de efeito');
  eq((await rpc('saude',[admin])).worker.processados,1,'saúde gravada pelo executor real');
  eq((await (await invoke()).json()).processados,0,'publicado não repete nem no v2');
  const transport=client.rpc;
  client.rpc=(nome,params)=>nome==='admin_marketing_real_claim_v2'
    ?{abortSignal:async()=>({data:null,error:{message:'fonte-indisponivel'}})}:transport(nome,params);
  eq((await invoke()).status,503);eq((await rpc('saude',[admin])).worker.http,503,'saúde guarda o HTTP final também na falha do claim');
  client.rpc=(nome,params)=>nome==='admin_marketing_real_worker_concluido_v2'
    ?{abortSignal:async()=>({data:null,error:{message:'fonte-indisponivel'}})}:transport(nome,params);
  eq((await invoke()).status,200);ok(logs.some(l=>JSON.parse(l).codigo==='saude-executor-pendente'),'falha do recibo de saúde fica visível');
  client.rpc=transport;
  // Contrato Deno real usa DTO SQL por destino e identidade sem confundir revisões.
  const operation=criarOperacaoPublicacoesReais();
  const request={recurso:'publicacoes-reais',modo:'real',acao:'previa',contractVersion:'e5.real.v2',snapshotId:snap.id,snapshotRevisao:2,destinos:[dest()]};
  const dto=(await operation.executar(client,operation.validar(request),{userId:admin,agora:new Date(),signal:new AbortController().signal})).dados;
  eq(dto.contractVersion,'e5.real.v2');eq(dto.revisao,1);eq(dto.snapshot.revisao,2);eq(dto.snapshot.conteudoId,cid);
  eq(dto.podeConfirmar,false);ok(dto.destinos[0].motivos.includes('revisao-editorial-pendente'));
  eq(dto.destinos[0].estado,'bloqueado');
  assert.throws(()=>validarPublicacaoReal({...request,contractVersion:'e5.real.v999'}),{codigo:'atualizar-cliente'});checks++;
  await rpc('editorial',[admin,edit('iniciarRevisao',2,version2)]);
  eq((await rpc('consultar',[admin,{acao:'consultar',jobId:held.jobId}])).jobs[0].estado,'publicado','later revision preserves published fact');
  await rpc('worker_concluido',[{http:200,processados:1,incertos:0}]);const health=await rpc('saude',[admin]);eq(health.worker.http,200);ok(health.worker.concluidoEm);eq(health.incertos,0);
  await owner(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 day'`);
  await rpc('editorial',[admin,edit('registrarVersao',3,version2)]);await rpc('editorial',[admin,edit('registrarAceite',3,version2)]);
  let dez=await rpc('snapshot_iniciar',[admin,{...snapPedido,versao:version2,geracaoEditorial:3,
    midias:Array.from({length:10},(_,ordem)=>({...snapPedido.midias[0],ordem,sha256:sha('dez'+ordem)}))}]);
  dez=await rpc('snapshot_finalizar',[admin,dez.id,1,{identidade:dez.identidade,midias:dez.dados.midias,capa:null}]);
  const novoJob=async(horas)=>{
    const pv=await rpc('previa',[admin,{snapshotId:dez.id,snapshotRevisao:2,destinos:[dest(new Date(Date.now()+horas*3600000).toISOString())]}]);
    eq(pv.destinos[0].estado,'pronto','dez imagens passam no preflight');
    const lt=await rpc('confirmar',[admin,pv.id,pv.hash,1,randomUUID()]);
    return (await rpc('consultar',[admin,{acao:'consultar',loteId:lt.loteId}])).jobs[0];
  };
  const exausto=await novoJob(4),seguinte=await novoJob(5);
  await owner(`insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao,estado,terminado_em)
    values($1,$2,1000,'preparar','falhou',now())`,[exausto.jobId,sha('esgotado')]);
  await owner(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where id=any($1)`,[[exausto.jobId,seguinte.jobId]]);
  const w3=randomUUID(),claimed=await rpc('claim',[w3,3]);
  eq(claimed.map(c=>c.jobId),[seguinte.jobId],'esgotado sai da fila sem consumir lugar do seguinte');
  const attention=(await rpc('consultar',[admin,{acao:'consultar',jobId:exausto.jobId}])).jobs[0];
  eq(attention.estado,'precisa-conferir');eq(attention.codigoErro,'tentativas-esgotadas');eq(attention.etapaInterrompida,'preparar');
  // Lease perdida de preparação privada preserva etapa; não é publicação incerta.
  await owner(`update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 minute' where id=$1`,[seguinte.jobId]);
  eq(await rpc('claim',[randomUUID(),3]),[]);
  const interrupted=(await rpc('consultar',[admin,{acao:'consultar',jobId:seguinte.jobId}])).jobs[0];
  eq(interrupted.etapaInterrompida,'preparar');eq(interrupted.estado,'precisa-conferir');
  const newTime=new Date(Date.now()+6*3600000).toISOString();
  const retryPreview=await rpc('previa',[admin,{jobId:seguinte.jobId,destinos:[dest(newTime)]}]);
  const retry=(await rpc('comando',[admin,{acao:'reagendar',jobId:seguinte.jobId,revisaoEsperada:interrupted.revisao,
    idempotencia:randomUUID(),publicarEm:newTime,fuso:'America/Sao_Paulo',previaId:retryPreview.id,previaHash:retryPreview.hash}])).jobs[0];
  eq(retry.substituiId,seguinte.jobId);eq(retry.preparo.itens,0,'novo trabalho não reutiliza containers privados incertos');
  // Qualquer intento de publicar impede reagendar, ainda sem recibo ou identificação.
  await owner(`insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao,estado,terminado_em)
    values($1,$2,1,'publicar','incerto',now())`,[retry.jobId,sha('publicar-incerto')]);
  const blockedTime=new Date(Date.now()+7*3600000).toISOString();
  const bp=await rpc('previa',[admin,{jobId:retry.jobId,destinos:[dest(blockedTime)]}]);
  await rejects(rpc('comando',[admin,{acao:'reagendar',jobId:retry.jobId,revisaoEsperada:retry.revisao,
    idempotencia:randomUUID(),publicarEm:blockedTime,fuso:'America/Sao_Paulo',previaId:bp.id,previaHash:bp.hash}]),/estado-incompativel/);
  // Default grants cannot expose the new editorial RPC/tables to anon.
  for(const role of ['anon','authenticated']){
    eq((await owner(`select has_function_privilege($1,'public.admin_marketing_real_editorial_v2(uuid,jsonb)','execute') v`,[role]))[0].v,false);
    eq((await owner(`select has_table_privilege($1,'public.admin_marketing_conteudos','select') v`,[role]))[0].v,false);
  }
  console.log(`marketing-real-v2: ${checks} verificacoes SQL real; CAS/editorial/owner/eligibilidade/reagendamento/readback/ACL; zero rede`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
