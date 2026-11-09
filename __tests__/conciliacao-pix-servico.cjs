const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const watchdog=setTimeout(()=>{console.error('Pix serviço: teste não concluiu');process.exit(1);},10000);
function carregar(op={}){
  const c={session:{user:{id:'a'},access_token:'fixture'},rpcs:[],reads:[],tx:op.tx??[],unsubscribe:0,events:0};
  const supabase={auth:{getSession:async()=>({data:{session:c.session},error:null}),getUser:async()=>({data:{user:{id:'a'}},error:null}),
    onAuthStateChange:fn=>{c.listener=fn;return {data:{subscription:{unsubscribe:()=>{c.unsubscribe++;}}}};}},
    from(table){const q={select(){return q;},eq(k,v){assert.equal(k,'user_id');assert.equal(v,'a');return q;},order(){return q;},range(){return q;},setHeader(k,v){assert.equal(k,'Authorization');assert.equal(v,'Bearer fixture');c.reads.push(table);return Promise.resolve({data:table==='wallets'?[{id:'p',user_id:'a',is_default:true,created_at:'2026-01-01'}]:c.tx,error:null});}};return q;},
    rpc(name,params){return {setHeader(k,v){assert.equal(k,'Authorization');assert.equal(v,'Bearer fixture');c.rpcs.push({name,params});return Promise.resolve(op.rpc?.(c,name,params)??{data:name==='obter_estado_acesso'?{allowed:true}:{situacao:'inserido',id:'synthetic'},error:null});}};}};
  const cache=new Map();function real(f){f=path.resolve(f);if(cache.has(f))return cache.get(f);const api={};cache.set(f,api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {exports:api,Date,console:{warn(){}},require(id){if(id==='expo-crypto')return {CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(alg,s)=>crypto.createHash(alg).update(s).digest('hex')};
        if(id==='./supabase')return {supabase};if(['./lancamentos-alterados','./cache-de-tela','./widgets-home-events'].includes(id))return {marcarLancamentosAlterados:()=>{c.events++;},invalidarRespostasAtrasadas(){},notificarDadosDosWidgetsAlterados(){}};
        if(id.startsWith('.'))return real(path.resolve(path.dirname(f),id+'.ts'));throw Error('fronteira inesperada '+id);}}, {filename:f});return api;}
  c.api=real('lib/conciliacao-pix-servico.ts');c.analisar=texto=>c.api.analisarExtratoPix({userId:'a',carteiraId:'p',origemConta:'Banco Modelo conta fixture',texto:texto??'Data;Descrição;Valor;ID\n05/10/2026;Pix enviado;-37,42;bank-private-id'});
  c.escritas=()=>c.rpcs.filter(x=>x.name==='confirmar_conciliacao_pix');return c;
}
(async()=>{
  const c=carregar(),a=await c.analisar();assert.equal(a.resultados[0].status,'falta');assert.equal(c.escritas().length,0);assert.ok(c.reads.includes('wallets'));assert.ok(c.reads.includes('transactions'));
  const chave=a.resultados[0].linha.fitid;assert.match(chave,/^pix1:[0-9a-f]{64}:[0-9a-f]{64}$/);const a2=await c.analisar();assert.equal(a2.resultados[0].linha.fitid,chave);
  const e={id:'0',categoria:'Alimentação',cor:'#1fa98d'};const r=await c.api.confirmarItensPix(a,[e]);assert.equal(r[0].status,'salvo');assert.equal(c.escritas().length,1);assert.equal(c.events,1);
  const payload=JSON.stringify(c.escritas()[0]);assert.ok(!payload.includes('bank-private-id'));assert.ok(!payload.includes('Banco Modelo'));assert.ok(!payload.includes('texto'));
  await assert.rejects(c.api.confirmarItensPix(a,[e,e]));assert.equal(c.escritas().length,1);a.cancelar();await assert.rejects(c.api.confirmarItensPix(a,[e]));a2.cancelar();
  const d=carregar(),b=await d.analisar();d.session={user:{id:'b'},access_token:'changed'};d.listener('SIGNED_IN',d.session);assert.equal((await d.api.confirmarItensPix(b,[e]))[0].status,'erro');assert.equal(d.escritas().length,0);b.cancelar();
  const n=carregar({rpc:(_c,name)=>name==='confirmar_conciliacao_pix'?{data:null,error:{code:'PGRST202'}}:undefined}),na=await n.analisar();const missing=await n.api.confirmarItensPix(na,[e]);assert.equal(missing[0].status,'erro');assert.match(missing[0].mensagem,/não está disponível/);assert.equal(n.escritas().length,1);assert.equal(n.events,0);na.cancelar();
  const f=carregar(),fa=await f.analisar('Data;Descrição;Valor;ID\n05/10/2026;Dinheiro reservado;-2,00;neutral');await assert.rejects(f.api.confirmarItensPix(fa,[e]));assert.equal(f.escritas().length,0);fa.cancelar();
  const g=carregar({rpc:(ctx,name)=>name==='confirmar_conciliacao_pix'?{data:{situacao:ctx.escritas().length===1?'inserido':'conflito',id:'fixture'},error:null}:undefined});
  const ga=await g.analisar('Data;Descrição;Valor;ID\n05/10/2026;Pix enviado;-2,00;x\n06/10/2026;Pix enviado;-3,00;y');const lote=await g.api.confirmarItensPix(ga,[e,{...e,id:'1'}]);assert.deepEqual(Array.from(lote,x=>x.status),['salvo','conflito']);assert.equal(g.escritas().length,2);ga.cancelar();
  console.log('Pix serviço real: preview sem escrita, chave local por origem, confirmação explícita, conta/cancelamento, RPC ausente sem fallback e lote parcial com recibo OK');
})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
