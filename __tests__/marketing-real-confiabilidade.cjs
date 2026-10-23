'use strict';
// Migrations e RPCs reais, PostgreSQL em memoria. Nao prova locks multissessao.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {randomUUID}=require('node:crypto');
const MIGRATION='20261022120000_admin_marketing_confiabilidade.sql';
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(a,m)=>{assert.ok(a,m);checks++;};
const modules=new Map();
function load(rel){const file=path.resolve(__dirname,'..',rel);if(modules.has(file))return modules.get(file).exports;
 const m=new Module(file,module);modules.set(file,m);m.require=id=>id.startsWith('npm:')?{}:load(path.relative(path.resolve(__dirname,'..'),path.resolve(path.dirname(file),id)));
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
(async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   grant usage on schema public to anon,authenticated,service_role;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const name of ['20261015190000_admin_marketing_fundacao.sql','20261016140000_admin_marketing_operacoes.sql','20261018001000_admin_marketing_real.sql','20261018230000_admin_marketing_renovacao.sql','20261019120000_admin_marketing_consultar_preparo.sql','20261019210000_admin_marketing_real_v2_aditiva.sql','20261020120000_admin_marketing_real_recuperacao_v1.sql','20261021083000_admin_marketing_real_midia_formato.sql',MIGRATION])
   await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  const rpc=async(n,args=[])=>(await db.query(`select public.admin_marketing_real_${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
  const admin=randomUUID(),ig=randomUUID(),fb=randomUUID();
  await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,capacidades,pausada)
   values($1,'instagram','123','IG','MARKETING_IG_TOKEN','verificada',now()+interval '1 day',$3,false),($2,'facebook','456','FB','MARKETING_FB_TOKEN','verificada',now()+interval '1 day',$3,false)`,[ig,fb,[{formato:'feed',estado:'disponivel',revisao:1}]]);
  await db.exec(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,pausa_instagram=false,pausa_facebook=false,recuperacao_pendente=false,capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 day';set role service_role`);
  let serial=0;
  const previa=async(policy,contas=[ig,fb])=>{
   const hex=(++serial).toString(16).padStart(16,'0');
   let s=await rpc('snapshot_iniciar',[admin,{pecaId:hex,versao:hex.padStart(40,'0'),aceiteId:'fixture',aceiteRevisao:1,legenda:'Teste.',legendaSha256:'a'.repeat(64),midias:[{ordem:0,sha256:'b'.repeat(64),mime:'image/jpeg',tipo:'imagem',bytes:100}],capa:null}]);
   s=await rpc('snapshot_finalizar',[admin,s.id,1,{identidade:s.identidade,midias:s.dados.midias,capa:null}]);
   return rpc('previa',[admin,{snapshotId:s.id,snapshotRevisao:s.revisao,destinos:contas.map(contaId=>({contaId,formato:'feed',publicarEm:new Date(Date.now()+3600000).toISOString(),fuso:'America/Sao_Paulo'})),...policy}]);
  };
  const politica={politicaExecucao:'recuperacao-2h-v1',capacidadesCliente:['execucao-2h-v1'],consentimentoExecucao:true};
  await assert.rejects(previa({politicaExecucao:politica.politicaExecucao}),/atualizar-cliente|consentimento/);checks++;
  await assert.rejects(previa(politica),/politica-nao-pronta/);checks++;
  eq(await rpc('email_liberado'),false,'envio nasce bloqueado antes do consentimento');
  await db.exec(`reset role;update public.admin_marketing_controles set politica_2h_habilitada=true,email_envio_habilitado=true,email_autorizacao_id=gen_random_uuid(),email_autorizado_em=now();
   insert into public.admin_marketing_monitor_saude(id) values(true);
   insert into public.admin_marketing_email_saude(id,configurado,saudavel) values(true,true,true);
   insert into public.admin_marketing_integracoes_saude(id,worker_hc_em,monitor_hc_em,email_aceito_em) values(true,now(),now(),now());set role service_role;`);
  const p=await previa(politica);eq(p.destinos.length,2);
  eq(Date.parse(p.destinos[0].executarAte)-Date.parse(p.destinos[0].publicarEm),7200000,'prazo selado por destino');
  await assert.rejects(rpc('confirmar',[admin,p.id,p.hash,1,randomUUID()]),/atualizar-cliente/);checks++;
  const key=randomUUID(),args=[admin,p.id,p.hash,1,key,['execucao-2h-v1'],'e5.real.v1'];
  const lote=await rpc('confirmar_politica',args);eq((await rpc('confirmar_politica',args)).replay,true);
  const d=await rpc('consultar',[admin,{acao:'consultar',loteId:lote.loteId}]);
  eq(d.jobs.length,2);eq(d.resultadoPorRede.length,2);eq(d.jobs[0].politicaExecucao,politica.politicaExecucao);
  const leg=await previa({});const ll=await rpc('confirmar',[admin,leg.id,leg.hash,1,randomUUID()]);
  const ld=await rpc('consultar',[admin,{acao:'consultar',loteId:ll.loteId}]);
  eq(Date.parse(ld.jobs[0].executarAte)-Date.parse(ld.jobs[0].publicarEm),900000,'legado nao ampliado');
  await db.exec('reset role');
  await assert.rejects(db.query('update public.admin_marketing_autorizacoes set executar_ate=executar_ate+interval \'1 minute\' where id=(select autorizacao_id from public.admin_marketing_agendamentos where lote_id=$1 limit 1)',[lote.loteId]),/imutavel/);checks++;
  // Falha no segundo destino reverte lote, autorizacoes e jobs.
  const bad=await previa(politica);await db.query('update public.admin_marketing_real_contas set pausada=true where id=$1',[fb]);
  const before=await db.query('select count(*)::int n from public.admin_marketing_real_lotes');
  await assert.rejects(rpc('confirmar_politica',[admin,bad.id,bad.hash,1,randomUUID(),['execucao-2h-v1'],'e5.real.v1']),/conta-indisponivel|operacao-pausada/);checks++;
  eq((await db.query('select count(*)::int n from public.admin_marketing_real_lotes')).rows,before.rows);
  const job=d.jobs[0];
  await db.query(`update public.admin_marketing_agendamentos set estado='precisa-conferir',codigo_erro='resultado-nao-confirmado' where id=$1`,[job.jobId]);
  const inc=await rpc('incidentes',[admin]);ok(inc.incidentes.some(i=>i.jobId===job.jobId),'incidente atomico');
  eq((await db.query('select count(*)::int n from public.admin_marketing_email_outbox')).rows[0].n,1,'email em outbox atomica');
  await db.query(`update public.admin_marketing_agendamentos set codigo_erro='resultado-nao-confirmado' where id=$1`,[job.jobId]);
  eq((await db.query('select count(*)::int n from public.admin_marketing_email_outbox')).rows[0].n,1,'sem spam por mesmo incidente');
  const incident=inc.incidentes.find(i=>i.jobId===job.jobId),ackKey=randomUUID();
  await rpc('incidente_reconhecer',[admin,incident.incidenteId,ackKey]);await rpc('incidente_reconhecer',[admin,incident.incidenteId,ackKey]);
  ok((await rpc('incidentes',[admin])).incidentes.find(i=>i.incidenteId===incident.incidenteId).reconhecidoEm);
  // Uma autorizacao efetivamente confirmada no passado: horario+90min, dentro de2h.
  await db.query('update public.admin_marketing_real_contas set pausada=false where id=$1',[fb]);
  const clonar=async(pol,minutos)=>{
   const publicar=new Date(Date.now()-minutos*60000).toISOString();
   const ate=new Date(Date.parse(publicar)+(pol==='recuperacao-2h-v1'?7200000:900000)).toISOString();
   const d={...p.destinos[0],publicarEm:publicar,executarAte:ate,politicaExecucao:pol,consentimentoExecucao:pol==='recuperacao-2h-v1'};
   const a=(await db.query(`insert into public.admin_marketing_autorizacoes(chave,admin_id,peca_id,versao,manifesto,rede,conta_destino,formato,publicar_em,confirmado_em)
    select $2,admin_id,peca_id,versao,jsonb_set(manifesto,'{_destino}',$3),rede,conta_destino,formato,$4::timestamptz,$4::timestamptz-interval '1 hour'
    from public.admin_marketing_autorizacoes where id=(select autorizacao_id from public.admin_marketing_agendamentos where id=$1) returning id`,[job.jobId,randomUUID().replace(/-/g,'').repeat(2),d,publicar])).rows[0];
   return (await db.query(`insert into public.admin_marketing_agendamentos(autorizacao_id,estrategia,estado,lote_id,snapshot_id,conta_id,etapa,processamento,proxima_verificacao_em)
    select $2,'executor-remoto','programado-no-painel',lote_id,snapshot_id,conta_id,'publicar','{"container":"900"}',now() from public.admin_marketing_agendamentos where id=$1 returning *`,[job.jobId,a.id])).rows[0];
  };
  await assert.rejects(clonar('legado-15min',16),/autorizacao-vencida/);checks++;
  await assert.rejects(clonar('recuperacao-2h-v1',121),/autorizacao-vencida/);checks++;
  const tarde=await clonar('recuperacao-2h-v1',90),worker=randomUUID();
  await db.exec(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()+interval '1 day'`);
  await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where id=$1',[tarde.id]);
  const [claim]=await rpc('claim',[worker,3]);eq(claim.jobId,tarde.id,'claim2h usa prazo duravel, nao15min');
  eq(await rpc('diario',[worker,claim.jobId,claim.leaseId,claim.revisao,{estado:'adiado',codigo:'efeito-nao-admitido'}]),true);
  await rpc('recibo',[worker,claim.jobId,claim.leaseId,claim.revisao,{estado:'adiado',codigo:'efeito-nao-admitido'}]);
  await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where id=$1',[tarde.id]);
  const [retry]=await rpc('claim',[worker,3]);eq(retry.envioId,claim.envioId,'retoma mesmo intento publicar sem admitir');
  eq((await db.query("select count(*)::int n from public.admin_marketing_envios where agendamento_id=$1 and operacao='publicar'",[tarde.id])).rows[0].n,1,'indice publicar permanece unico');
  eq(await rpc('admitir',[worker,retry.jobId,retry.leaseId,retry.revisao]),true);
  const recibo={estado:'publicacao-aceita',remotoId:'901',processamento:{container:'900',publicacaoId:'901'}};
  eq(await rpc('diario',[worker,retry.jobId,retry.leaseId,retry.revisao,recibo]),true,'ID duravel antes de recibo');
  await db.query("update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 second' where id=$1",[tarde.id]);
  await rpc('claim',[randomUUID(),3]);
  eq((await db.query('select etapa,remoto_id from public.admin_marketing_agendamentos where id=$1',[tarde.id])).rows[0],{etapa:'verificar-publicacao',remoto_id:'901'},'journal recupera resultado sem novo POST');
  await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where id=$1',[tarde.id]);
  const [readback]=await rpc('claim',[worker,3]);eq(readback.etapa,'verificar-publicacao');
  await rpc('recibo',[worker,readback.jobId,readback.leaseId,readback.revisao,{estado:'publicado',remotoId:'901',processamento:{publicacaoId:'901',permalink:'https://www.instagram.com/p/fixture/'}}]);
  eq((await rpc('consultar',[admin,{acao:'consultar',jobId:tarde.id}])).jobs[0].estado,'publicado');
  // Monitor: 3min sem executor e atraso2min, lembrete30min, ACK diario.
  await rpc('monitor',[randomUUID(),admin]);
  ok((await rpc('incidentes',[admin])).incidentes.some(i=>i.codigo==='executor-sem-sinal'));
  await db.query("update public.admin_marketing_incidentes set proximo_lembrete_em=now()-interval '1 second' where id=$1",[incident.incidenteId]);
  await rpc('monitor',[randomUUID(),admin]);
  ok(Date.parse((await rpc('incidentes',[admin])).incidentes.find(i=>i.incidenteId===incident.incidenteId).proximoLembreteEm)>Date.now()+23*3600000,'ACK lembrete diario');
  // Cliente e executor V2 usam o mesmo prazo e preservam vinculo editorial.
  const cid=randomUUID(),pid='c'.repeat(16),versao='d'.repeat(40);
  for(const [operacao,geracaoEsperada] of [['iniciarRevisao',0],['registrarVersao',1],['registrarAceite',1]])
   await rpc('editorial_v2',[admin,{operacao,geracaoEsperada,conteudoId:cid,pecaId:pid,versao,idempotencia:randomUUID()}]);
  let s2=await rpc('snapshot_iniciar_v2',[admin,{pecaId:pid,versao,conteudoId:cid,geracaoEditorial:1,aceiteId:'fixture',aceiteRevisao:1,legenda:'V2.',legendaSha256:'a'.repeat(64),midias:[{ordem:0,sha256:'c'.repeat(64),mime:'image/jpeg',tipo:'imagem',bytes:100}],capa:null}]);
  s2=await rpc('snapshot_finalizar',[admin,s2.id,1,{identidade:s2.identidade,midias:s2.dados.midias,capa:null}]);
  const p2=await rpc('previa_v2',[admin,{snapshotId:s2.id,snapshotRevisao:s2.revisao,destinos:[{contaId:ig,formato:'feed',publicarEm:new Date(Date.now()+3600000).toISOString(),fuso:'America/Sao_Paulo'}],...politica}]);
  eq(p2.destinos[0].politicaExecucao,politica.politicaExecucao);
  const l2=await rpc('confirmar_politica',[admin,p2.id,p2.hash,1,randomUUID(),['execucao-2h-v1'],'e5.real.v2']);
  const j2=(await rpc('consultar_v2',[admin,{acao:'consultar',loteId:l2.loteId}])).jobs[0];
  eq(Date.parse(j2.executarAte),Date.parse(p2.destinos[0].executarAte),'consulta preserva prazo selado na previa');
  eq(Date.parse(j2.executarAte)-Date.parse(j2.publicarEm),7200000);
  await db.exec(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()+interval '1 day'`);
  await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where id=$1',[j2.jobId]);
  const [c2]=await rpc('claim_v2',[worker,3]);eq(c2.jobId,j2.jobId);eq(c2.politicaExecucao,politica.politicaExecucao);
  eq(await rpc('admitir_v2',[worker,c2.jobId,c2.leaseId,c2.revisao]),true);
  await rpc('diario',[worker,c2.jobId,c2.leaseId,c2.revisao,{estado:'processando',processamento:{itens:['800'],container:'800'}}]);
  await rpc('recibo_v2',[worker,c2.jobId,c2.leaseId,c2.revisao,{estado:'processando',processamento:{itens:['800'],container:'800'}}]);
  await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where id=$1',[j2.jobId]);
  const [consulta2]=await rpc('claim_v2',[worker,3]);
  await rpc('recibo_v2',[worker,consulta2.jobId,consulta2.leaseId,consulta2.revisao,{estado:'adiado',codigo:'consulta-indisponivel',retryAfterSegundos:300}]);
  ok((await db.query('select meta_proxima_admissao_em>now()+interval \'299 seconds\' as v from public.admin_marketing_real_contas where id=$1',[ig])).rows[0].v,'RetryAfter bloqueia novos POST por conta');
  await db.query(`insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao,estado,iniciado_em,terminado_em,efeito_admitido_em)
   values($1,$2,99,'preparar','incerto',now(),now(),now())`,[j2.jobId,'9'.repeat(64)]);
  await db.query("update public.admin_marketing_agendamentos set etapa='preparar',estado='programado-no-painel',proxima_verificacao_em=now() where id=$1",[j2.jobId]);
  await rpc('claim_v2',[randomUUID(),3]);
  eq((await db.query('select estado,codigo_erro from public.admin_marketing_agendamentos where id=$1',[j2.jobId])).rows[0],{estado:'precisa-conferir',codigo_erro:'efeito-anterior-incerto'},'ID anterior de outro filho nao autoriza repetir preparo incerto');
  // E-mail perdido nao ganha uma nova chave depois de expirar a deduplicacao do provedor.
  const batch=await rpc('email_claim',[worker]);ok(batch.length>0);
  await db.query("update public.admin_marketing_email_outbox set estado='pendente',primeiro_envio_em=now()-interval '24 hours',lease_id=null,lease_ate=null where id=$1",[batch[0].emailId]);
  await rpc('email_claim',[randomUUID()]);
  eq((await db.query('select estado from public.admin_marketing_email_outbox where id=$1',[batch[0].emailId])).rows[0].estado,'incerto');
  eq((await rpc('monitor',[randomUUID(),admin])).saudavel,false,'outbox incerta deixa saude degradada');
  await db.query('update public.admin_marketing_incidentes set resolvido_em=now() where id in (select incidente_id from public.admin_marketing_email_outbox where estado=\'incerto\')');
  // Executor/Graph + SQL novos na mesma cadeia, resposta do recibo perdida apos ID duravel.
  await db.query('update public.admin_marketing_real_contas set meta_proxima_admissao_em=null');
  await db.exec(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()+interval '1 day'`);
  const pp=await previa(politica,[fb]),ll2=await rpc('confirmar_politica',[admin,pp.id,pp.hash,1,randomUUID(),['execucao-2h-v1'],'e5.real.v1']);
  const je=(await rpc('consultar',[admin,{acao:'consultar',loteId:ll2.loteId}])).jobs[0];
  await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now(),etapa=\'preparar\' where id=$1',[je.jobId]);
  const network=[];
  const client={rpc:(name,args)=>({abortSignal:async()=>{
   if(name.endsWith('renovacao_iniciar'))return {data:null,error:null};
   try{return {data:(await db.query(`select public.${name}(${Object.keys(args).map((k,i)=>k+'=> $'+(i+1)).join(',')}) r`,Object.values(args))).rows[0].r,error:null};}
   catch(e){return {data:null,error:{message:e.message}};}
  }}),from:()=>{let id;const q={select:()=>q,eq:(k,v)=>(id=v,q),abortSignal:()=>q,single:async()=>({data:(await db.query('select estado,dados from public.admin_marketing_real_snapshots where id=$1',[id])).rows[0],error:null})};return q;},
   storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://fixture.supabase.co/storage/v1/object/sign/marketing-remoto/fixture'},error:null})})}};
  const {criarExecutorReal}=load('supabase/functions/_shared/marketing-real-executor.ts');
  const en={MARKETING_REAL_EXECUTOR_ATIVO:'true',MARKETING_REAL_EXECUTOR_SECRET:'s'.repeat(40),META_GRAPH_API_VERSION:'v25.0',MARKETING_FB_TOKEN:'fixture',MARKETING_IG_TOKEN:'fixture',SUPABASE_URL:'https://fixture.supabase.co'};
  const executar=criarExecutorReal({env:k=>en[k],cliente:()=>client,log:()=>{},rede:async(input,init)=>{
   const url=new URL(input);network.push({path:url.pathname,method:init.method});
   if(init.method==='POST')ok((await db.query("select count(*)::int n from public.admin_marketing_envios where agendamento_id=$1 and estado='iniciado' and efeito_admitido_em is not null",[je.jobId])).rows[0].n===1,'POST tem admissao duravel');
   if(url.pathname.endsWith('/photos'))return Response.json({id:'12001'});
   if(url.pathname.endsWith('/feed'))return Response.json({id:'456_12002'});
   return Response.json({id:'456_12002',is_published:true,permalink_url:'https://www.facebook.com/456/posts/12002'});
  }});
  const tick=async()=>{const r=await executar(new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-real-secret':en.MARKETING_REAL_EXECUTOR_SECRET},body:'{}'}));await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where id=$1',[je.jobId]);return r.status;};
  eq(await tick(),200); // photos
  // Publicar so depois do horario: fixture cria uma autorizacao atrasada ja testada acima.
  const jf=await clonar('recuperacao-2h-v1',1);
  await db.exec(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()+interval '1 day'`);
  await db.query("update public.admin_marketing_agendamentos set proxima_verificacao_em=now(),processamento='{\"container\":\"900\"}' where id=$1",[jf.id]);
  // Usa IG da autorizacao clonar; o resultado POST e guardado pelo diario antes do recibo.
  const client2=Object.create(client);client2.rpc=(name,args)=>({abortSignal:async()=>{
   if(name.endsWith('renovacao_iniciar'))return {data:null,error:null};
   if(name.endsWith('recibo')&&args.p_resultado.estado==='publicacao-aceita')return {data:null,error:{message:'fixture-perda'}};
   return client.rpc(name,args).abortSignal();
  }});
  const exec2=criarExecutorReal({env:k=>en[k],cliente:()=>client2,log:()=>{},rede:async(input,init)=>{network.push({path:new URL(input).pathname,method:init.method});return Response.json({id:'13001'});}});
  const request=()=>new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-real-secret':en.MARKETING_REAL_EXECUTOR_SECRET},body:'{}'});
  eq((await exec2(request())).status,503,'recibo perdido fica explicito');
  eq((await db.query('select count(*)::int n from public.admin_marketing_ids_diario where agendamento_id=$1',[jf.id])).rows[0].n,1);
  const postsAntes=network.filter(x=>x.method==='POST').length;
  await db.query("update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 second' where id=$1",[jf.id]);
  await rpc('claim',[randomUUID(),3]);
  eq((await db.query('select remoto_id from public.admin_marketing_agendamentos where id=$1',[jf.id])).rows[0].remoto_id,'13001');
  eq(network.filter(x=>x.method==='POST').length,postsAntes,'recuperar diario nao repete publish');
  // Emular passagem do tempo SO no banco fixture; nenhum guard de producao e relaxado.
  await db.exec('begin;alter table public.admin_marketing_autorizacoes disable trigger admin_marketing_autorizacao_prazo');
  await db.query(`update public.admin_marketing_autorizacoes set publicar_em=publicar_em-interval '3 hours',
   executar_ate=executar_ate-interval '3 hours',confirmado_em=confirmado_em-interval '3 hours'
   where id=$1`,[jf.autorizacao_id]);
  await db.exec('alter table public.admin_marketing_autorizacoes enable trigger admin_marketing_autorizacao_prazo;commit');
  await db.query("update public.admin_marketing_agendamentos set estado='precisa-conferir',etapa='reconciliar',lease_id=null,worker_id=null,lease_expira_em=null,lease_revisao=null,proxima_verificacao_em=now() where id=$1",[jf.id]);
  const [aposPrazo]=await rpc('claim',[randomUUID(),1]);eq(aposPrazo.jobId,jf.id,'ID final continua consultavel depois2h');eq(aposPrazo.etapa,'reconciliar');
  // Saude do canal: fila envelhecida/falha atual, recuperacao e historico preservado.
  await db.exec('begin');
  await db.exec(`update public.admin_marketing_incidentes set resolvido_em=now();
   update public.admin_marketing_integracoes_saude set email_falhou_em=null,email_aceito_em=now();
   update public.admin_marketing_email_saude set configurado=true,saudavel=true,concluido_em=now();`);
  eq((await rpc('email_saude')).saudavel,true);
  const canalId=await rpc('incidente_abrir',[admin,randomUUID(),'publicacao-falhou']);
  await db.query("update public.admin_marketing_email_outbox set criado_em=now()-interval '3 minutes' where incidente_id=$1",[canalId]);
  eq((await rpc('email_saude')).saudavel,false,'fila envelhecida impede HC verde mesmo sem erro HTTP');
  await db.query("update public.admin_marketing_email_outbox set estado='falhou',codigo_erro='email-recusado' where incidente_id=$1",[canalId]);
  eq((await rpc('email_saude')).saudavel,false);
  const recuperado=(await db.query("insert into public.admin_marketing_email_outbox(incidente_id,sequencia,estado,provedor_id,primeiro_envio_em) values($1,1,'aceito','provider-fixture',now()) returning id",[canalId])).rows[0];
  eq((await rpc('email_saude')).saudavel,true,'lembrete novo aceito supera falha historica sem apagar seu recibo');
  await rpc('email_entrega',[recuperado.id,'provider-fixture','falhou','email-entrega-falhou']);
  eq((await rpc('email_saude')).saudavel,false,'bounce posterior a aceito reabre alerta');
  await db.exec('rollback');
  const pr=await rpc('previa',[admin,{jobId:je.jobId,destinos:[{contaId:fb,formato:'feed',publicarEm:new Date(Date.now()+5400000).toISOString(),fuso:'America/Sao_Paulo'}],...politica}]);
  await rpc('email_concluido',[true,false,'email-recusado']);
  await assert.rejects(rpc('comando',[admin,{acao:'reagendar',jobId:je.jobId,revisaoEsperada:(await db.query('select revisao from public.admin_marketing_agendamentos where id=$1',[je.jobId])).rows[0].revisao,
   idempotencia:randomUUID(),previaId:pr.id,previaHash:pr.hash,publicarEm:pr.destinos[0].publicarEm,fuso:'America/Sao_Paulo',capacidadesCliente:['execucao-2h-v1']}]),/politica-nao-pronta/);checks++;
  eq((await rpc('confirmar_politica',args)).replay,true,'canal degradado nao impede replay de intencao ja confirmada');
  // A ativacao operacional exige entrega, nao apenas configuracao/aceitacao.
  await db.exec('update public.admin_marketing_controles set politica_2h_habilitada=false');
  await assert.rejects(db.exec(fs.readFileSync('scripts/meta-confiabilidade-ativar.sql','utf8')),/email-entrega-nao-verificada/);checks++;
  await db.exec('rollback');
  eq((await db.query('select politica_2h_habilitada v from public.admin_marketing_controles where id')).rows[0].v,false);
  // Recuperacao completa: operadores Edge + RPCs reais, apenas HTTP dublado.
  // Cada recibo roda em sua propria transacao, como no runtime.
  await db.exec(`update public.admin_marketing_agendamentos set estado='cancelado',concluido_em=now(),lease_id=null,worker_id=null,lease_expira_em=null,lease_revisao=null;
   update public.admin_marketing_incidentes set resolvido_em=now();
   update public.admin_marketing_integracoes_saude set email_falhou_em=null,email_aceito_em=now();
   insert into public.admin_marketing_executor_saude(id,concluido_em,http,processados,incertos) values(true,now(),200,0,0)
    on conflict(id) do update set concluido_em=now(),http=200;`);
  await rpc('email_concluido',[true,true,null]);
  const {criarOperadorIncidentes}=load('supabase/functions/_shared/marketing-real-incidentes.ts');
  const secretOps='e'.repeat(40),httpEmail=[],pings=[];
  const envOps={MARKETING_MONITOR_SECRET:secretOps,MARKETING_EMAIL_SECRET:secretOps,RESEND_API_KEY:'fixture',
   EMAIL_ENCAMINHAR_PARA:'autor@example.invalid',ADMIN_MARKETING_USER_ID:admin,
   MARKETING_HEALTHCHECKS_MONITOR_URL:'https://hc-ping.com/11111111-1111-4111-8111-111111111111'};
  let aceitarEmail=false;
  const ops={env:k=>envOps[k],cliente:()=>client,log:()=>{},rede:async(input,init)=>{
   const u=new URL(input);
   if(u.hostname==='hc-ping.com'){pings.push(u.pathname);return new Response('ok');}
   assert.equal(u.origin,'https://api.resend.com');httpEmail.push({path:u.pathname,method:init.method,key:init.headers['Idempotency-Key']});
   if(init.method==='POST')return aceitarEmail?Response.json({id:randomUUID()}):Response.json({code:'validation_error'},{status:400});
   assert.equal(init.method,'GET');return Response.json({id:u.pathname.split('/').at(-1),last_event:'delivered'});
  }};
  const operar=async tipo=>criarOperadorIncidentes(tipo,ops)(new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-ops-secret':secretOps},body:'{}'}));
  const negocio=await rpc('incidente_abrir',[admin,randomUUID(),'publicacao-falhou']);
  await db.exec('update public.admin_marketing_controles set email_envio_habilitado=false');
  eq((await rpc('email_claim',[randomUUID()])).length,0,'SQL nao reserva outbox pendente sem consentimento');
  eq((await operar('email')).status,503,'Edge real nao envia antes de liberacao');
  eq(httpEmail.filter(x=>x.method==='POST').length,0,'ZERO POST com RPCs reais antes do consentimento');
  const consentimentoId=randomUUID();
  eq(await rpc('email_liberar',[consentimentoId]),true);
  eq(await rpc('email_liberar',[consentimentoId]),true,'replay do consentimento idempotente');
  await assert.rejects(rpc('email_liberar',[randomUUID()]),/autorizacao-email-divergente/);checks++;
  eq((await operar('email')).status,503,'recusa real dublada produz falha duravel');
  const reciboAntigo=(await db.query('select * from public.admin_marketing_email_outbox where incidente_id=$1',[negocio])).rows[0];
  eq(reciboAntigo.estado,'falhou');
  eq((await operar('monitor')).status,503);ok(pings.at(-1).endsWith('/fail'));
  const canalAntes=(await db.query("select * from public.admin_marketing_incidentes where codigo='canal-email-indisponivel' and resolvido_em is null")).rows[0];
  eq(canalAntes.agendamento_id,null,'alerta de canal tem recuperacao propria sem job');
  await rpc('incidente_reconhecer',[admin,canalAntes.id,randomUUID()]);
  eq((await operar('monitor')).status,503,'ACK sozinho nao restaura canal');
  eq((await db.query('select resolvido_em from public.admin_marketing_incidentes where id=$1',[canalAntes.id])).rows[0].resolvido_em,null);
  delete envOps.RESEND_API_KEY;
  eq((await operar('email')).status,503,'config ausente continua vermelha');
  const postsAntesConfig=httpEmail.filter(x=>x.method==='POST').length;
  eq((await operar('monitor')).status,503);eq(httpEmail.filter(x=>x.method==='POST').length,postsAntesConfig,'monitor nao envia email');
  envOps.RESEND_API_KEY='fixture';aceitarEmail=true;
  await db.exec("update public.admin_marketing_incidentes set proximo_lembrete_em=now()-interval '1 second' where resolvido_em is null");
  eq((await operar('monitor')).status,503,'lembrete enfileirado ainda nao e prova de envio');
  eq((await operar('email')).status,200,'dispatcher grava aceite e consulta entrega autenticada');
  eq((await operar('monitor')).status,200,'canal recupera apos recibos novos sem apagar antigos');
  ok(!pings.at(-1).endsWith('/fail'),'heartbeat volta verde somente depois da recuperacao');
  ok((await db.query('select resolvido_em from public.admin_marketing_incidentes where id=$1',[canalAntes.id])).rows[0].resolvido_em);
  ok((await db.query('select resolvida_em from public.admin_marketing_notificacoes where chave=$1',[canalAntes.chave])).rows[0].resolvida_em);
  eq((await db.query('select resolvido_em from public.admin_marketing_incidentes where id=$1',[negocio])).rows[0].resolvido_em,null,'recuperacao do canal nao resolve incidente de negocio');
  eq((await db.query('select * from public.admin_marketing_email_outbox where id=$1',[reciboAntigo.id])).rows[0],reciboAntigo,'recibo da falha antiga permanece identico');
  const novoAceito=(await db.query('select * from public.admin_marketing_email_outbox where incidente_id=$1 order by sequencia desc limit 1',[negocio])).rows[0];
  eq(novoAceito.estado,'aceito');eq(novoAceito.entrega_estado,'entregue');
  await rpc('email_entrega',[novoAceito.id,novoAceito.provedor_id,'falhou','email-entrega-falhou']);
  eq((await operar('monitor')).status,503,'falha atual apos recuperacao volta a impedir verde');
  const canalNovo=(await db.query("select id from public.admin_marketing_incidentes where codigo='canal-email-indisponivel' and resolvido_em is null")).rows[0];
  ok(canalNovo.id!==canalAntes.id,'recorrencia abre outra ocorrencia sem reescrever a resolvida');
  await rpc('incidente_reconhecer',[admin,canalNovo.id,randomUUID()]);
  eq((await operar('monitor')).status,503,'ACK da recorrencia nao esconde falha atual');
  console.log('marketing-real-confiabilidade: recuperacao Edge+SQL+monitor comprovada, HTTP somente dublado');
  // Limite90 precisa valer dentro do lote; retries da mesma chave nao consomem vaga nova.
  await db.exec('begin');
  await db.exec("update public.admin_marketing_incidentes set resolvido_em=now();update public.admin_marketing_email_outbox set primeiro_envio_em=now()-interval '2 days'");
  const quota=await rpc('incidente_abrir',[admin,randomUUID(),'quota-fixture']);
  await db.query("update public.admin_marketing_email_outbox set estado='aceito',primeiro_envio_em=now() where incidente_id=$1",[quota]);
  await db.query("insert into public.admin_marketing_email_outbox(incidente_id,sequencia,estado,primeiro_envio_em) select $1,n,case when n<89 then 'aceito' else 'pendente' end,case when n<89 then now() else null end from generate_series(1,93) n",[quota]);
  const quotaWorker=randomUUID(),reserva=await rpc('email_claim',[quotaWorker]);
  eq(reserva.length,1,'89 inicios diarios deixam somente uma vaga, nao um lote de tres');
  eq((await db.query("select count(*)::int n from public.admin_marketing_email_outbox where primeiro_envio_em>=date_trunc('day',now())")).rows[0].n,90);
  eq((await rpc('email_claim',[randomUUID()])).length,0,'segundo claim nao atravessa90');
  await db.query("update public.admin_marketing_email_outbox set lease_ate=now()-interval '1 second' where id=$1",[reserva[0].emailId]);
  const reenvio=await rpc('email_claim',[randomUUID()]);
  eq(reenvio.map(e=>e.emailId),[reserva[0].emailId],'retry da mesma chave continua possivel com90 inicios');
  eq((await db.query("select count(*)::int n from public.admin_marketing_email_outbox where primeiro_envio_em>=date_trunc('day',now())")).rows[0].n,90);
  await db.query("update public.admin_marketing_email_outbox set primeiro_envio_em=now()-interval '23 hours' where incidente_id=$1 and primeiro_envio_em is not null",[quota]);
  eq((await rpc('email_claim',[randomUUID()])).length,0,'limite usa24h moveis, sem reset na virada do dia');
  await db.exec('rollback');
  // Cron/Vault/HTTP sao dublados; executa os scripts SQL REAIS sem extensao de rede.
  await db.exec(`reset role;set search_path=public,pg_catalog;
   create view public.pg_extension as select 'pg_cron'::name extname union all select 'pg_net'::name;
   create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
   insert into vault.decrypted_secrets values('marketing_supabase_url','https://fixture.invalid'),('marketing_service_role','fixture'),('marketing_monitor_secret','fixture'),('marketing_email_secret','fixture');
   create schema cron;create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
   create function cron.schedule(text,text,text) returns bigint language sql as 'insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid';
   create function cron.alter_job(job_id bigint,active boolean default null) returns void language sql as 'update cron.job set active=$2 where jobid=$1';
   create schema net;create table net.chamadas(url text);
   create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as 'begin insert into net.chamadas values(url);return 1;end';
   update public.admin_marketing_controles set email_envio_habilitado=false,politica_2h_habilitada=false;`);
  await db.exec(fs.readFileSync('scripts/meta-confiabilidade-configurar.sql','utf8'));
  eq((await db.query("select active from cron.job where jobname='marketing-incidentes-email'")).rows[0].active,false,'configurar instala dispatcher INATIVO');
  eq((await db.query("select active from cron.job where jobname='marketing-incidentes-monitor'")).rows[0].active,true,'monitor independente permanece ativo');
  for(const row of (await db.query("select command from cron.job where active and jobname='marketing-incidentes-email'")).rows)await db.exec(row.command);
  eq((await db.query('select count(*)::int n from net.chamadas')).rows[0].n,0,'ZERO POST do cron antes da liberacao');
  await assert.rejects(db.exec(fs.readFileSync('scripts/meta-confiabilidade-email-liberar.sql','utf8')),/consentimento-email-ausente/);checks++;
  await db.exec('rollback');
  eq(await rpc('email_liberado'),false,'SQL de liberacao sem autorizacao nao muda flag');
  eq((await db.query("select active from cron.job where jobname='marketing-incidentes-email'")).rows[0].active,false);
  const liberarSql=fs.readFileSync('scripts/meta-confiabilidade-email-liberar.sql','utf8').replace('begin;',"begin;select set_config('app.marketing_email_autorizacao','"+randomUUID()+"',true);");
  await db.exec(liberarSql);
  eq(await rpc('email_liberado'),true,'liberacao nominal persistida');
  eq((await db.query("select active from cron.job where jobname='marketing-incidentes-email'")).rows[0].active,true);
  eq((await db.query('select politica_2h_habilitada v from public.admin_marketing_controles where id')).rows[0].v,false,'consentimento email nao ativa2h');
  for(const row of (await db.query("select command from cron.job where active and jobname='marketing-incidentes-email'")).rows)await db.exec(row.command);
  eq((await db.query('select count(*)::int n from net.chamadas')).rows[0].n,1,'somente depois da liberacao o cron dublado despacha');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc('monitor',[randomUUID()]),/permission denied/);checks++;await assert.rejects(rpc('email_liberar',[randomUUID()]),/permission denied/);checks++;await db.exec('reset role');}
  console.log(`marketing-real-confiabilidade: ${checks} verificacoes; RPCs/SQL reais, sem rede externa`);
 }finally{await db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
