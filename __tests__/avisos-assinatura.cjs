// Executa seleção e handler REAIS, banco e Resend dublês, sem rede.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
let checks=0;const ok=(v,n)=>{assert.ok(v,n);checks++;};
function load(file,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports,require:n=>{if(n in imports)return imports[n];throw Error(n);},console,Date,Intl,Map,Set,Math,Number,String,JSON,Error,
 Response,Request,TextEncoder,AbortSignal,AbortController,setTimeout,clearTimeout,
 });return exports;}
const real=load('supabase/functions/_shared/avisos-assinatura.ts',{'./seguranca.ts':load('supabase/functions/_shared/seguranca.ts')});
const now=new Date('2026-10-24T13:00:00Z');
const sub=(x={})=>({id:'a',user_id:'u',status:'canceled',access_until:'2026-10-27T13:00:00Z',grace_until:null,email_conta:'conta@example.invalid',email_compra:'compra@example.invalid',...x});
const select=(list,at=now)=>real.selecionarAvisosAssinatura(list,at);
for(const [d,t] of [[7,'antes_7'],[3,'antes_3'],[1,'antes_1'],[2,null],[0,null]]){
 const a=select([sub({access_until:new Date(+now+d*86400000).toISOString()})]);ok((a[0]?.tipo??null)===t,`janela ${d}`);
}
ok(select([sub({status:'active'})]).length===0,'renovação automática sem lembrete');
ok(select([sub({status:'past_due',access_until:'2026-10-20T13:00:00Z',grace_until:'2026-10-27T13:00:00Z'})])[0]?.tipo==='antes_3','usa carência');
for(const status of ['refunded','chargeback'])ok(select([sub({status,access_until:'2026-10-24T12:00:00Z'})]).length===0,`sem ${status}`);
ok(select([sub({status:'active',access_until:'2026-10-24T12:00:00Z'})])[0]?.tipo==='venceu','active realmente vencida recebe aviso');
ok(select([sub({access_until:'2026-10-23T12:59:59Z'})]).length===0,'fora das últimas 24h');
ok(select([sub(),sub({id:'b',status:'active',access_until:'2026-11-24T13:00:00Z'})]).length===0,'outra assinatura renova');
ok(select([sub(),sub({id:'b'})]).length===1,'uma comunicação por conta');
ok(select([sub(),sub({id:'b',status:'active'})]).length===0,'active no mesmo prazo tem precedência');
ok(select([sub({access_until:'2026-10-28T01:00:00Z'})])[0]?.tipo==='antes_3','dia local BRT, não UTC');
ok(select([sub({access_until:'invalida'})]).length===0,'data inválida não avisa');
ok(select([sub({access_until:'2026-10-27T13:00:00.123456+00:00'})])[0]?.dataLimite==='2026-10-27T13:00:00.123456+00:00','timestamp SQL mantém microssegundos para igualdade e idempotência');
const secret='segredo-local-de-teste-sem-uso-real';
function scenario(options={}){
 const rows=new Map(),calls=[],emails=[],logs=[];let pages=0;
 const client={
  async rpc(name,args){calls.push({name,args});
   if(name==='listar_assinaturas_para_avisos')return options.listError?{error:{code:'PGRST202'}}:
    {data:options.pages?options.pages[pages++]??[]:options.subs??[sub()]};
   if(name==='reservar_aviso_assinatura'){
    if(options.renewed||rows.has(args.p_subscription_id))return {data:null};
    const r={id:args.p_subscription_id,email:'conta@example.invalid',estado:'reservado'};rows.set(r.id,r);return {data:r};
   }throw Error(name);
  },
  from(name){assert.equal(name,'avisos_assinatura_enviados');return {
   update(data){let id;return {eq(k,v){if(k==='id'){id=v;return this;}if(options.receiptError)return {error:{}};Object.assign(rows.get(id),data);return {error:null};}};},
   select(){return {neq(){return {count:[...rows.values()].filter(r=>r.estado!=='enviado').length,error:null};}};},
  };},
 };
 const handler=real.criarHandlerAvisosAssinatura({env:n=>n==='CRON_ASSINATURA_SECRET'?secret:n==='RESEND_API_KEY'?'chave-falsa':undefined,
  cliente:()=>client,agora:()=>now,log:s=>logs.push(s),rede:async(url,init)=>{
   emails.push({url,init,body:JSON.parse(init.body)});
   if(options.networkError)throw Error('erro com dado que não deve ir ao log');
   return Response.json(options.reject?{error:'rejeitado'}:{id:'resend-id'},{status:options.reject?422:200});
  }});
 return {calls,emails,rows,logs,run:(key=secret)=>handler(new Request('https://local.invalid',{method:'POST',headers:{'x-cron-secret':key},body:'{}'}))};
}
(async()=>{
 let s=scenario();ok((await s.run('errado')).status===401&&s.calls.length===0&&s.emails.length===0,'segredo errado não toca banco/Resend');
 s=scenario();ok((await s.run()).status===200,'sucesso');await s.run();
 ok(s.emails.length===1&&s.rows.size===1,'duas execuções, uma chamada e uma escrita');
 ok(s.emails[0].body.to[0]==='conta@example.invalid'&&s.emails[0].body.from==='Grana. <contato@granaponto.com.br>','destinatário e remetente');
 ok(s.emails[0].init.headers['Idempotency-Key']==='assinatura/a','Resend recebe chave estável');
 s=scenario({renewed:true});await s.run();ok(s.emails.length===0,'renovação após seleção aborta envio');
 s=scenario({networkError:true});ok((await s.run()).status===503,'incerto visível');await s.run();
 ok(s.emails.length===1&&s.rows.get('a').estado==='incerto','incerto não repete');
 ok(!s.logs.join().includes('dado que'),'logs sem payload de erro externo');
 s=scenario({reject:true});ok((await s.run()).status===503&&s.rows.get('a').estado==='falhou','rejeição persistida');
 s=scenario({receiptError:true});ok((await s.run()).status===503,'recibo com erro não vira sucesso');await s.run();ok(s.emails.length===1,'falha de recibo não duplica');
 s=scenario({listError:true});ok((await s.run()).status===503&&s.emails.length===0,'SQL ausente não envia');
 const first=Array.from({length:500},(_,i)=>sub({id:String(i).padStart(4,'0')}));
 s=scenario({pages:[first,[sub({id:'zz',status:'active',access_until:'2027-01-01T00:00:00Z'})],[]]});
 await s.run();ok(s.emails.length===0&&s.calls.filter(c=>c.name==='listar_assinaturas_para_avisos').length===2,'renovação na página seguinte impede envio');
 const copy=real.emailAvisoAssinatura(select([sub()])[0]);
 ok(!/[—–]/.test(copy.text)&&copy.text.includes('27/10/2026')&&copy.text.includes('https://granaponto.com.br/assinar'),'copy e link fixos/data BRT');
 const pendente=real.emailAvisoAssinatura(select([sub({status:'past_due',access_until:'2026-10-20T13:00:00Z',grace_until:'2026-10-27T13:00:00Z'})])[0]);
 ok(pendente.text.includes('Falar com o suporte')&&pendente.text.includes('atualizar a cobrança')&&!pendente.text.includes('Renovar assinatura')&&!pendente.text.includes('renove'),'past_due regulariza cobrança sem nova compra');
 ok(pendente.text.includes('link de cobrança recebido no e-mail da compra')&&pendente.html.includes('href="mailto:suporte@granaponto.com.br?subject='),'past_due encaminha link da compra ou suporte, sem rota de nova compra');
 ok(copy.text.includes('suporte@granaponto.com.br')&&copy.html.includes('href="mailto:suporte@granaponto.com.br"')&&!copy.text.includes('entre no app'),'acesso aos dados tem contato explícito independente da exportação do app');
 const aposCarencia=real.emailAvisoAssinatura(select([sub({status:'past_due',access_until:'2026-10-20T13:00:00Z',grace_until:'2026-10-24T12:00:00Z'})])[0]);
 ok(aposCarencia.subject.includes('acesso foi interrompido')&&aposCarencia.text.includes('24/10/2026')&&!aposCarencia.text.includes('Renovar assinatura')&&!aposCarencia.html.includes('https://granaponto.com.br/assinar'),'após carência usa data da carência e suporte, sem encaminhar nova compra');
 console.log(`avisos-assinatura: ${checks} checagens OK (módulos reais, rede dublê)`);
})().catch(e=>{console.error(e);process.exitCode=1;});
