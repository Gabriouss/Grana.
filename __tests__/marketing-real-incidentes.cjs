'use strict';
// Executa os modulos TypeScript reais; todo transporte externo e dublado.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const vm=require('node:vm');
const cache=new Map(),root=path.resolve(__dirname,'..');
function load(rel){const file=path.resolve(root,rel);if(cache.has(file))return cache.get(file).exports;
 const m=new Module(file,module);cache.set(file,m);m.require=id=>id.startsWith('npm:')?{}:id.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),id))):require(id);
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const {criarOperadorIncidentes,enviarIncidenteEmail,retryAfterSegundos,configuracaoEmailMarketing,consultarEntregaEmail}=load('supabase/functions/_shared/marketing-real-incidentes.ts');
const {criarAdaptadorGraphReal}=load('supabase/functions/_shared/marketing-real-graph.ts');
const {validarPublicacaoReal}=load('supabase/functions/_shared/admin-publicacoes-reais.ts');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
(async()=>{
 const admin=randomUUID(),secret='s'.repeat(40),event={emailId:randomUUID(),incidenteId:randomUUID(),codigo:'publicacao-incerta',jobId:randomUUID(),rede:'instagram',adminId:admin};
 const env={MARKETING_MONITOR_SECRET:secret,MARKETING_EMAIL_SECRET:secret,MARKETING_RESEND_API_KEY:'fixture',MARKETING_INCIDENTES_EMAIL_FROM:'alerta@example.invalid',MARKETING_INCIDENTES_EMAIL_TO:'autor@example.invalid',ADMIN_MARKETING_USER_ID:admin};
 let calls=[],logs=[],rpcCalls=[];
 let response=()=>Response.json({id:'provider-fixture'});
 let monitorSaudavel=true,emailLiberado=true;
 const deps={env:k=>env[k],log:s=>logs.push(s),rede:async(u,i)=>{calls.push({url:String(u),...i});return response();},cliente:()=>({rpc:(name,args)=>({abortSignal:async()=>{rpcCalls.push({name,args});return {data:name.endsWith('email_claim')?[event]:name.endsWith('email_consultas')?[]:name.endsWith('email_liberado')?emailLiberado:name.endsWith('_monitor')?{saudavel:monitorSaudavel}:true,error:null};}})})};
 const signal=()=>AbortSignal.timeout(1000);
 eq((await enviarIncidenteEmail(event,deps,signal())).estado,'aceito');
 eq((await enviarIncidenteEmail(event,deps,signal())).estado,'aceito');
 eq(calls[0].body,calls[1].body,'corpo imutavel em replay');eq(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
 response=()=>new Response('',{status:429,headers:{'Retry-After':'300'}});
 eq((await enviarIncidenteEmail(event,deps,signal())).retryAfterSegundos,300);
 eq(retryAfterSegundos('100000'),3600);eq(retryAfterSegundos('invalid'),60);
 deps.rede=async()=>{throw new Error('segredo-de-transporte-nao-pode-vazar');};
 eq((await enviarIncidenteEmail(event,deps,signal())).estado,'pendente','replay permitido so janela Resend');
 eq((await enviarIncidenteEmail({...event,adminId:randomUUID()},deps,signal())).codigo,'email-configuracao-ausente');
 const monitor=criarOperadorIncidentes('monitor',deps);
 eq((await monitor(new Request('https://fixture.invalid'))).status,405);
 eq((await monitor(new Request('https://fixture.invalid',{method:'POST',body:'{}'}))).status,401);
 eq(rpcCalls.length,0,'nao-autorizado nao abre banco nem pinga monitor');
 eq((await monitor(new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-ops-secret':secret},body:'{}'}))).status,200);
 eq(rpcCalls[0].name,'admin_marketing_real_monitor');
 eq(logs.some(l=>l.includes('segredo-de-transporte')),false,'log sanitizado');
 response=()=>Response.json({id:'provider-fixture'});deps.rede=async(u,i)=>{calls.push({url:String(u),...i});return response();};
 const email=criarOperadorIncidentes('email',deps);
 const postCount=()=>calls.filter(c=>c.method==='POST').length;
 const postsAntesLiberacao=postCount(),claimsAntesLiberacao=rpcCalls.filter(c=>c.name.endsWith('email_claim')).length;
 emailLiberado=false;
 eq((await email(new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-ops-secret':secret},body:'{}'}))).status,503,'config Resend e credencial do cron nao substituem consentimento nominal');
 eq(postCount(),postsAntesLiberacao,'ZERO POST antes da liberacao nominal, mesmo com outbox dublada pendente');
 eq(rpcCalls.filter(c=>c.name.endsWith('email_claim')).length,claimsAntesLiberacao,'nao reserva antes da liberacao');
 emailLiberado='true';
 eq((await email(new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-ops-secret':secret},body:'{}'}))).status,503,'valor nao booleano falha fechado');
 eq(postCount(),postsAntesLiberacao);
 emailLiberado=true;
 eq((await email(new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-ops-secret':secret},body:'{}'}))).status,200);
 eq(rpcCalls.findLast(r=>r.name==='admin_marketing_real_email_recibo').args.p_resultado.estado,'aceito');
 eq(rpcCalls.at(-1).name,'admin_marketing_real_email_concluido');
 const fallback={RESEND_API_KEY:'fixture-reuso',EMAIL_ENCAMINHAR_PARA:'autor@example.invalid',ADMIN_MARKETING_USER_ID:admin};
 eq(configuracaoEmailMarketing(k=>fallback[k]).valida,true,'reuso das referencias existentes sem duplicar segredo');
 eq(configuracaoEmailMarketing(k=>fallback[k]).from,'admin@granaponto.com.br');
 env.MARKETING_HEALTHCHECKS_MONITOR_URL='https://hc-ping.com/11111111-1111-4111-8111-111111111111';
 monitorSaudavel=false;calls=[];
 eq((await monitor(new Request('https://fixture.invalid',{method:'POST',headers:{'x-marketing-ops-secret':secret},body:'{}'}))).status,503);
 eq(calls.length,1);eq(new URL(calls[0].url).pathname.endsWith('/fail'),true,'email quebrado nunca pinga verde');
 eq(rpcCalls.filter(r=>r.name==='admin_marketing_real_integracao_recibo').length,0,'fail nao atualiza prova positiva');
 response=()=>Response.json({id:'provider-fixture',last_event:'delivered'});
 eq((await consultarEntregaEmail('provider-fixture',deps,signal())).estado,'entregue');
 eq(calls.at(-1).method,'GET','entrega e consultada sem reenviar email');
 response=()=>Response.json({id:'provider-fixture',last_event:'bounced'});
 eq((await consultarEntregaEmail('provider-fixture',deps,signal())).estado,'falhou');
 response=()=>Response.json({id:'provider-fixture',last_event:'sent'});
 eq((await consultarEntregaEmail('provider-fixture',deps,signal())).estado,'adiada','aceito/sent nao equivale entrega');
 const nodeLoader=require('../tools/admin-local/adaptadores/_contratos-marketing.cjs');
 eq(typeof nodeLoader.carregar('supabase/functions/_shared/marketing-real-incidentes.ts').criarOperadorIncidentes,'function','loader Node real permite dependencias novas');
 // Runner de escrita precisa barrar antes da rede e antes de qualquer arquivo novo.
 const fixtureSql=Buffer.from('select 1;'),fixtureHash=require('node:crypto').createHash('sha256').update(fixtureSql).digest('hex');
 let redesOps=0,escritasOps=0;const errosOps=[],processoOps={argv:['node','runner','aplicar','E:/Grana-temporarios/qa-ops','gate.json'],env:{},exitCode:0};
 await vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/meta-confiabilidade-sql.cjs'),'utf8'),{
  require:id=>id==='node:fs'?{readFileSync:file=>String(file).endsWith('manifesto.json')?JSON.stringify({arquivos:[{arquivo:'supabase/migrations/20261022120000_admin_marketing_confiabilidade.sql',sha256:fixtureHash}]}):String(file).endsWith('gate.json')?'{}':fixtureSql,writeFileSync:()=>{escritasOps++;}}:require(id),
  process:processoOps,console:{error:s=>errosOps.push(s),log:()=>{}},fetch:()=>{redesOps++;throw Error('rede proibida');},Buffer,AbortSignal,
 });
 eq(processoOps.exitCode,1);eq(errosOps,['sinal-raiz-ausente']);eq(redesOps,0);eq(escritasOps,0);
 for(const nominal of [{},{consentimentoEmail:false,autorizacaoEmailId:randomUUID()},{consentimentoEmail:true,autorizacaoEmailId:'invalida'}]){
  const errors=[],proc={argv:['node','runner','email-liberar','E:/Grana-temporarios/qa-ops','gate.json'],env:{},exitCode:0};
  await vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/meta-confiabilidade-sql.cjs'),'utf8'),{
   require:id=>id==='node:fs'?{readFileSync:file=>String(file).endsWith('manifesto.json')?JSON.stringify({arquivos:[{arquivo:'scripts/meta-confiabilidade-email-liberar.sql',sha256:fixtureHash}]}):String(file).endsWith('gate.json')?JSON.stringify({raizAutorizou:true,acao:'email-liberar',sha256:fixtureHash,...nominal}):fixtureSql,writeFileSync:()=>{escritasOps++;}}:require(id),
   process:proc,console:{error:s=>errors.push(s),log:()=>{}},fetch:()=>{redesOps++;throw Error('rede proibida');},Buffer,AbortSignal,
  });
  eq(proc.exitCode,1);eq(errors,['consentimento-email-ausente']);
 }
 eq(redesOps,0,'gate generico nao envia nem configura email');eq(escritasOps,0);
 const job={jobId:randomUUID(),rede:'instagram',formato:'feed',etapa:'publicar',remotoContaId:'123',processamento:{container:'456'}};
 const snap={legenda:'Aprovada.',midias:[{objeto:'fixture',sha256:'a'.repeat(64),mime:'image/jpeg',tipo:'imagem',bytes:1}]};
 let posts=0;
 const graph=criarAdaptadorGraphReal({versao:'v25.0',token:'fixture',signal:signal(),assinar:async()=>'',rede:async(u,i)=>{if(i.method==='POST')posts++;throw new Error('resultado perdido');}});
 eq((await graph.executar(job,snap)).estado,'incerto');
 eq((await graph.executar({...job,etapa:'reconciliar'},snap)).codigo,'publicacao-sem-id-recuperavel');
 eq(posts,1,'consulta sem ID nunca repete publish');
 const consulta=criarAdaptadorGraphReal({versao:'v25.0',token:'fixture',signal:signal(),assinar:async()=>'',rede:async()=>new Response('{}',{status:429,headers:{'Retry-After':'120'}})});
 const r=await consulta.executar({...job,etapa:'verificar-publicacao',remotoId:'789'},snap);eq(r.estado,'adiado');eq(r.retryAfterSegundos,120);
 const base={recurso:'publicacoes-reais',modo:'real',acao:'previa',snapshotId:randomUUID(),snapshotRevisao:1,destinos:[{contaId:randomUUID(),formato:'feed',publicarEm:new Date(Date.now()+3600000).toISOString(),fuso:'America/Sao_Paulo'}]};
 assert.throws(()=>validarPublicacaoReal({...base,politicaExecucao:'recuperacao-2h-v1'}),/atualizar-cliente/);checks++;
 eq(validarPublicacaoReal({...base,politicaExecucao:'recuperacao-2h-v1',capacidadesCliente:['execucao-2h-v1'],consentimentoExecucao:true}).consentimentoExecucao,true);
 console.log(`marketing-real-incidentes: ${checks} verificacoes, Edge/Graph reais, transporte dublado`);
})().catch(e=>{console.error(e);process.exitCode=1;});
