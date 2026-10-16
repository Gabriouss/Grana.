const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const ADMIN='11111111-1111-1111-1111-111111111111', OTHER='22222222-2222-2222-2222-222222222222';
const NOW='2026-10-16T02:59:00.000Z', TOKEN='FAKE_META_TOKEN_SENTINEL';
let checks=0;
function eq(a,b,msg) { assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),msg); checks++; }
function harness(opts={}) {
  const calls=[], keys=[], logs=[], cache=new Map(); let handler;
  const env={SUPABASE_URL:'https://fake.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',ADMIN_USER_IDS:ADMIN,
    META_READ_ACCESS_TOKEN:TOKEN,META_AD_ACCOUNT_ID:'123',META_GRAPH_API_VERSION:'v26.0',...opts.env};
  class Clock extends Date { constructor(...args) { super(...(args.length?args:[NOW])); } static now() { return Date.parse(NOW); } }
  const client={auth:{ getUser:async()=>({data:{user:opts.revoked?null:{id:opts.sub??ADMIN,factors:opts.noTotp?[]:[{factor_type:'totp',status:'verified'}]}}})},
    from:()=>{throw new Error('database forbidden');},rpc:()=>{throw new Error('RPC forbidden');}};
  async function network(input,init) {
    const url=new URL(input); calls.push({url:String(url),method:init.method,auth:init.headers.Authorization,signal:init.signal});
    if(opts.network) return opts.network(url,init,calls.length);
    if(url.pathname.endsWith('/act_123')) return Response.json({currency:opts.currency??'BRL',timezone_name:opts.timezone??'America/Sao_Paulo'});
    if(url.pathname.endsWith('/campaigns')) return Response.json({data:[{id:'1',name:'Campanha ficticia',status:'ACTIVE',effective_status:'ACTIVE'}]});
    const range=JSON.parse(url.searchParams.get('time_range'));
    const extra=Number(url.searchParams.get('after')?.replace('cursor','')??0);
    const day=new Date(Date.parse(range.since+'T00:00:00Z')+extra*86400000).toISOString().slice(0,10);
    const row={campaign_id:'1',date_start:day,date_stop:day,spend:'12.34',impressions:'100',clicks:'5',account_currency:'BRL'};
    if(opts.missing) delete row.spend;
    const next=opts.pages && (opts.pages==='infinito'||extra===0);
    return Response.json({data:opts.empty?[]:[row],...(next?{paging:{next:'https://attacker.invalid/?access_token='+TOKEN,cursors:{after:'cursor'+(extra+1)}}}:{})});
  }
  function load(file) {
    file=path.resolve(file); if(cache.has(file)) return cache.get(file);
    const api={};cache.set(file,api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
      exports:api,Date:Clock,Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,AbortController,atob,crypto:webcrypto,fetch:network,
      setTimeout:(fn,ms)=>setTimeout(fn,opts.fast?Math.min(ms,25):ms),clearTimeout,
      console:{log:s=>logs.push(s),warn:(...s)=>logs.push(s),error:(...s)=>logs.push(s)},
      Deno:{env:{get:k=>env[k]},serve:h=>{handler=h;}},
      require:id=>id.startsWith('npm:')?{createClient:(_url,key)=>{keys.push(key);return client;}}:load(path.resolve(path.dirname(file),id)),
    }); return api;
  }
  const api=load('supabase/functions/_shared/admin-meta.ts');
  load('supabase/functions/admin-meta/index.ts');
  const jwt='valid.'+Buffer.from(JSON.stringify({sub:opts.sub??ADMIN,aal:opts.aal??'aal2'})).toString('base64url')+'.sig';
  return {calls,keys,logs,api,request:async(body={recurso:'meta-leitura'},origin='https://granaponto.com.br')=>{
    const r=await handler(new Request('https://fake.invalid',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(body)}));
    return {status:r.status,body:await r.json()};
  }};
}
async function main() {
  const h=harness();
  const periods=h.api.periodosMeta(new Date(NOW));
  eq(periods.atual.desde,'2026-09-15');eq(periods.atual.ateExclusivo,'2026-10-15');
  eq(periods.anterior.desde,'2026-08-16');eq(periods.anterior.ateExclusivo,'2026-09-15');
  eq(h.api.periodosMeta(new Date('2026-10-16T03:00:00Z')).atual.ateExclusivo,'2026-10-16','meia-noite SP');
  for(const key of ['META_READ_ACCESS_TOKEN','META_AD_ACCOUNT_ID','META_GRAPH_API_VERSION']) {
    const x=harness({env:{[key]:''}}),r=await x.request();eq(r.status,200);eq(r.body.dados.meta.estado,'nao-configurado');eq(x.calls.length,0);
    eq(r.body.dados.meta.investimentoCentavos,null);
  }
  for(const opts of [{sub:OTHER},{aal:'aal1'},{noTotp:true},{revoked:true}]) {
    const x=harness(opts);eq((await x.request()).status,opts.revoked?401:403);eq(x.calls.length,0);eq(x.keys.includes('service'),false);
  }
  eq((await h.request({recurso:'meta-leitura'},'https://evil.invalid')).status,403);eq(h.calls.length,0);
  eq((await h.request({recurso:'meta-leitura',token:TOKEN})).status,400);eq(h.calls.length,0);
  const results=await Promise.all([h.request(),h.request()]);
  eq(results[0].status,200);eq(results[0].body.dados.meta.atual.investimentoCentavos,1234);
  eq(h.calls.length,4,'coalescencia de duas leituras');
  await h.request();eq(h.calls.length,4,'cache de 15 minutos');
  eq(h.calls.every(c=>c.method==='GET' && new URL(c.url).origin==='https://graph.facebook.com'),true);
  eq(h.calls.every(c=>!c.url.includes(TOKEN)&&c.auth==='Bearer '+TOKEN),true,'token so no header');
  eq(JSON.stringify(results[0].body).includes(TOKEN),false);eq(JSON.stringify(h.logs).includes(TOKEN),false);
  eq(results[0].body.dados.cakto.receitaConfirmadaCentavos,null);
  const hoje=await h.request({recurso:'meta-leitura',incluirHoje:true});eq(hoje.body.dados.meta.hoje.intervalo.parcial,true);
  const pag=harness({pages:true}),rp=await pag.request();eq(rp.body.dados.meta.atual.investimentoCentavos,2468);
  eq(pag.calls.every(c=>new URL(c.url).origin==='https://graph.facebook.com'),true,'nao segue next arbitrario');
  const cap=harness({pages:'infinito'}),rc=await cap.request();eq(rc.body.dados.meta.atual.estado,'parcial');eq(rc.body.dados.meta.investimentoCentavos,null);eq(cap.calls.length<=10,true);
  const zero=await harness({empty:true}).request();eq(zero.body.dados.meta.atual.investimentoCentavos,0);eq(zero.body.dados.meta.variacaoPercentual,null);
  const missing=await harness({missing:true}).request();eq(missing.body.dados.meta.investimentoCentavos,null);
  for(const opts of [{currency:'USD'},{timezone:'UTC'}]) {
    const x=harness(opts),r=await x.request();eq(r.body.dados.meta.estado,'parcial');eq(r.body.dados.meta.investimentoCentavos,null);eq(x.calls.length,1);
  }
  for(const [status,code,expected] of [[400,190,'credencial-recusada'],[400,200,'permissao-recusada'],[429,4,'limite-meta'],[503,0,'provedor-indisponivel']]) {
    const x=harness({network:async()=>Response.json({error:{code,message:TOKEN}},{status})}),r=await x.request();
    eq(r.body.dados.meta.motivo,expected);eq(JSON.stringify(r.body).includes(TOKEN),false);eq(JSON.stringify(x.logs).includes(TOKEN),false);
  }
  const stuck=harness({fast:true,network:async()=>new Response(new ReadableStream({start(){}}))});
  eq((await stuck.request()).status,504,'prazo cobre corpo pendurado');
  const count=stuck.calls.length;await new Promise(r=>setTimeout(r,60));eq(stuck.calls.length,count,'timeout nao inicia chamadas novas');
  eq(stuck.calls[0].signal.aborted,true,'aborta transporte');
  console.log(`admin-meta: ${checks} verificacoes, GET/admin/MFA/paginacao/cache/prazo, sem rede real`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
