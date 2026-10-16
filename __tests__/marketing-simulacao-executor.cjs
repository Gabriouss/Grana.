const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const cache=new Map();let realNetwork=0;
function real(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);const api={};cache.set(file,api);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:api,Date,Error,Request,Response,Headers,URL,AbortController,TextEncoder,TextDecoder,Uint8Array,atob,crypto:webcrypto,
    setTimeout:(fn,ms)=>setTimeout(fn,fast?Math.min(ms,30):ms),clearTimeout,console,
    fetch:()=>{realNetwork++;throw new Error('rede proibida');},require:id=>real(path.resolve(path.dirname(file),id)),
  });return api;
}
let fast=false,checks=0;const clone=x=>JSON.parse(JSON.stringify(x));
const eq=(a,b,msg)=>{assert.deepEqual(clone(a),clone(b),msg);checks++;};
const {criarExecutorSimulacao}=real('supabase/functions/_shared/marketing-simulacao-executor.ts');
const {storeSupabaseSimulacao}=real('supabase/functions/_shared/admin-publicacoes-simulacao.ts');
const engine=real('supabase/functions/_shared/marketing-simulacao.ts');
const SECRET='SIMULACAO_FICTICIA_SECRET_COM_32_CHARS';
async function main(){
  const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');
    for(const f of ['20261016160000_admin_marketing_simulacao.sql','20261016170000_admin_marketing_sim_executor.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
    const calls=[];
    const col=k=>{if(!/^[a-z_]+(?:->>[a-z_]+)?$/.test(k))throw new Error('bad column');const [a,b]=k.split('->>');return '"'+a+'"'+(b?"->>'"+b+"'":'');};
    const client={
      from:table=>{
        assert.match(table,/^admin_marketing_sim_(outbox|controles|catalogo)$/);const filters=[],orders=[],values=[];
        let fields='*',limit=100,single=false;
        const param=v=>{values.push(v);return '$'+values.length;};
        const q={select:f=>{fields=f.split(',').map(col).join(',');return q;},
          eq:(k,v)=>{filters.push(col(k)+'='+param(v));return q;},
          in:(k,v)=>{filters.push(col(k)+' in ('+v.map(param).join(',')+')');return q;},
          lte:(k,v)=>{filters.push(col(k)+'<='+param(v));return q;},
          order:(k,o)=>{orders.push(col(k)+(o.ascending?' asc':' desc'));return q;},
          limit:n=>{limit=n;return q;},abortSignal:()=>q,
          maybeSingle:()=>{single=true;return q;},single:()=>{single=true;return q;},
          then:(ok,no)=>{calls.push({table,filters});return db.query('select '+fields+' from public.'+table+(filters.length?' where '+filters.join(' and '):'')+(orders.length?' order by '+orders.join(','):'')+' limit '+limit,values)
            .then(r=>({data:single?r.rows[0]??null:r.rows,error:null})).then(ok,no);},
        };return q;
      },
      rpc:(name,args)=>{
        assert.ok(['admin_marketing_sim_cas','admin_marketing_sim_pausar'].includes(name));
        const params=name.endsWith('_cas')?[args.p_chave,args.p_revisao,args.p_dados]:[args.p_rede,args.p_pausa];
        let signal;const q={abortSignal:s=>{signal=s;return q;},then:(ok,no)=>{
          calls.push({rpc:name,signal});return db.query('select public.'+name+'('+params.map((_,i)=>'$'+(i+1)).join(',')+') as r',params).then(r=>({data:r.rows[0].r,error:null})).then(ok,no);
        }};return q;
      },
    };
    const now=new Date(),due=new Date(now.getTime()+600000),tick=new Date(due.getTime()+1000);
    const p={pecaId:'a'.repeat(16),versao:'b'.repeat(40),aprovado:true,manifesto:{legendaSha256:'c'.repeat(64),capaSha256:null,midias:[{sha256:'d'.repeat(64),tipo:'imagem'}]}};
    await db.query('insert into public.admin_marketing_sim_catalogo(peca_id,versao,manifesto,aprovado) values($1,$2,$3,true)',[p.pecaId,p.versao,p.manifesto]);
    await db.exec('set role service_role');const store=storeSupabaseSimulacao(client,new AbortController().signal);
    for(const net of ['global','instagram','facebook'])await store.pausar(net,false);
    const target={pecaId:p.pecaId,rede:'instagram',conta:'123',formato:'feed',horario:due.toISOString(),estrategia:'executor-remoto'};
    for(let i=0;i<4;i++){
      const a={...target,conta:String(123+i)},key=await engine.identidadeSimulacao(p,a);
      await engine.confirmarSimulacao(store,a,key,'11111111-1111-1111-1111-111111111111',now);
    }
    let clients=0;const logs=[];
    function handler(env={},customClient=client){return criarExecutorSimulacao({
      env:k=>({MARKETING_SIM_EXECUTOR_ATIVO:'true',MARKETING_SIM_EXECUTOR_SECRET:SECRET,SUPABASE_URL:'https://fake.invalid',SUPABASE_SERVICE_ROLE_KEY:'service',...env})[k],
      cliente:()=>{clients++;return customClient;},agora:()=>tick,log:s=>logs.push(s),
    });}
    async function request(h,body='{}',secret=SECRET,method='POST'){
      const r=await h(new Request('https://fake.invalid',{method,headers:{'x-marketing-sim-secret':secret},...(method==='POST'?{body}:{})}));
      return {status:r.status,json:await r.json()};
    }
    for(const [env,secret,body,method,status] of [
      [{MARKETING_SIM_EXECUTOR_ATIVO:''},SECRET,'{}','POST',503],
      [{MARKETING_SIM_EXECUTOR_SECRET:''},SECRET,'{}','POST',503],
      [{},'wrong','{}','POST',401],[{},SECRET,'{}','GET',405],
      [{},SECRET,'{"modo":"real"}','POST',400],[{},SECRET,'x'.repeat(129),'POST',413],
    ]){eq((await request(handler(env),body,secret,method)).status,status);}
    eq(clients,0,'nenhuma credencial privilegiada ou escrita em pedido recusado');
    const h=handler(),r1=await request(h);eq(r1.status,200);eq(r1.json.processados,3);eq(r1.json.chamadasSimuladas,3);eq(r1.json.chamadasMetaReais,0);
    const r2=await request(h);eq(r2.json.processados,1);eq((await request(h)).json.processados,0,'recibos terminais saem da fila');
    eq((await db.query("select count(*)::int as n from public.admin_marketing_sim_outbox where dados->>'estado'='publicado'")).rows[0].n,4);
    const future={...target,conta:'999',horario:new Date(now.getTime()+43200000).toISOString()};
    const fk=await engine.identidadeSimulacao(p,future);await engine.confirmarSimulacao(store,future,fk,'11111111-1111-1111-1111-111111111111',now);
    eq((await request(h)).json.processados,0,'horario futuro nao ocupa lote elegivel');
    const native={...future,conta:'888',estrategia:'nativo-meta'},nk=await engine.identidadeSimulacao(p,native);
    await engine.confirmarSimulacao(store,native,nk,'11111111-1111-1111-1111-111111111111',now);
    eq((await request(h)).json.processados,1);eq((await store.ler(nk)).dados.estado,'agendado-na-meta');
    await store.pausar('global',true);
    await request(h);eq((await store.ler(nk)).dados.estado,'cancelado','pausa acorda cancelamento nativo simulado');
    eq((await store.ler(fk)).dados.motivo,'pausado');
    eq(realNetwork,0);eq(JSON.stringify(logs).includes(SECRET),false);
    const emptyClient={from:()=>{const q={};for(const k of ['select','in','lte','order','limit','abortSignal'])q[k]=()=>q;q.then=(ok,no)=>Promise.resolve({data:[],error:null}).then(ok,no);return q;}};
    const throttled=handler({},emptyClient);
    for(let i=0;i<12;i++)eq((await request(throttled)).status,200);
    eq((await request(throttled)).status,429,'admissao limitada sem acumular recusas');
    fast=true;let pendingSignal;
    const pendingClient={from:()=>{const q={};for(const k of ['select','in','lte','order','limit'])q[k]=()=>q;q.abortSignal=s=>{pendingSignal=s;return q;};q.then=()=>new Promise(()=>{});return q;}};
    eq((await request(handler({},pendingClient))).status,504,'prazo cobre consulta pendurada');eq(pendingSignal.aborted,true);
    console.log(`marketing-simulacao-executor: ${checks} verificacoes, worker/store/SQL reais, zero Meta/rede`);
  }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
