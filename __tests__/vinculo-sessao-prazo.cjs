const assert=require('node:assert/strict');
const {ambiente,flush,pendente}=require('./helpers/providers-controlados.cjs');
const casos=[];const caso=(n,fn)=>casos.push([n,fn]);
function montar(options={}){
  const c={ciclo:{},rpc:[],leituras:0,remocoes:0,token:'ativacao-audit'};const controle=new AbortController();
  const a=ambiente({'./supabase':{supabase:{rpc:(nome,args)=>{const p=pendente();p.nome=nome;p.args=args;p.promise.setHeader=()=>p.promise;p.promise.abortSignal=s=>{p.sinal=s;return p.promise;};c.rpc.push(p);return p.promise;}}},
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:()=>{c.leituras++;return options.ler?options.ler():Promise.resolve(c.token);},removeItem:async()=>{c.remocoes++;c.token=null;}}}});
  const api=a.load('lib/assinatura.ts');const ciclo=c.ciclo;
  const contexto={dono:'A',tokenDeAcesso:'credencial-audit-A',geracao:ciclo,podeContinuar:()=>c.ciclo===ciclo,sinal:controle.signal,fim:Date.parse('2026-11-11T12:00:00Z')+12_000};
  return {...a,c,api,contexto,trocar(){c.ciclo={};controle.abort();}};
}
caso('vínculo real: chamadas concorrentes do mesmo ciclo compartilham RPCs e token',async()=>{
  const a=montar();const p=a.api.vincularAssinaturasPendentes(a.contexto),q=a.api.vincularAssinaturasPendentes(a.contexto);assert.equal(p,q);await flush();assert.equal(a.c.rpc.length,1);
  a.c.rpc[0].resolve({error:null});await flush();assert.equal(a.c.rpc.length,2);assert.equal(a.c.rpc[1].nome,'vincular_assinatura_por_token');a.c.rpc[1].resolve({data:true,error:null});
  assert.equal((await p).houveFalha,false);assert.equal(a.c.remocoes,1);assert.equal(a.c.rpc[0].sinal.aborted,true);
});
caso('vínculo real: troca durante RPC automática não inicia leitura/token com conta seguinte',async()=>{
  const a=montar();const p=a.api.vincularAssinaturasPendentes(a.contexto);await flush();a.trocar();assert.equal((await p).houveFalha,true);a.c.rpc[0].resolve({error:null});await flush();assert.equal(a.c.leituras,0);assert.equal(a.c.rpc.length,1);assert.equal(a.c.remocoes,0);
});
caso('vínculo real: troca durante storage não inicia RPC de token',async()=>{
  const disco=pendente();const a=montar({ler:()=>disco.promise});const p=a.api.vincularAssinaturasPendentes(a.contexto);await flush();a.c.rpc[0].resolve({error:null});await flush();assert.equal(a.c.leituras,1);a.trocar();await p;disco.resolve('ativacao-audit');await flush();assert.equal(a.c.rpc.length,1);assert.equal(a.c.remocoes,0);
});
caso('vínculo real: RPC de token A atrasada não remove pendência após troca',async()=>{
  const a=montar();const p=a.api.vincularAssinaturasPendentes(a.contexto);await flush();a.c.rpc[0].resolve({error:null});await flush();assert.equal(a.c.rpc.length,2);a.trocar();await p;a.c.rpc[1].resolve({data:true,error:null});await flush();assert.equal(a.c.remocoes,0);assert.equal(a.c.token,'ativacao-audit');
});
caso('vínculo real: prazo é total; resultado tardio é inerte e nova tentativa não herda trava',async()=>{
  let disco=pendente();const a=montar({ler:()=>disco.promise});const p=a.api.vincularAssinaturasPendentes(a.contexto);await flush();await a.advance(11_000);a.c.rpc[0].resolve({error:null});await flush();await a.advance(1_001);
  const r=await p;assert.equal(r.houveFalha,true);assert.equal(a.c.rpc.length,1);const anterior=disco;disco={promise:Promise.resolve(null)};
  a.contexto.fim+=12_000;const retry=a.api.vincularAssinaturasPendentes(a.contexto);await flush();assert.equal(a.c.rpc.length,2);a.c.rpc[1].resolve({error:null});assert.equal((await retry).houveFalha,false);
  anterior.resolve('ativacao-antiga');await flush();assert.equal(a.c.rpc.length,2);assert.equal(a.c.remocoes,0);
});
caso('vínculo real: compra nova guardada enquanto RPC responde não é apagada',async()=>{
  const a=montar();const p=a.api.vincularAssinaturasPendentes(a.contexto);await flush();a.c.rpc[0].resolve({error:null});await flush();a.c.token='outra-ativacao-audit';a.c.rpc[1].resolve({data:true,error:null});assert.equal((await p).houveFalha,false);assert.equal(a.c.token,'outra-ativacao-audit');assert.equal(a.c.remocoes,0);
});
const rejeicoes=[];process.on('unhandledRejection',e=>rejeicoes.push(e));const watchdog=setTimeout(()=>{console.error('FALHA: vínculo pendurado');process.exit(1);},45000);
(async()=>{let failures=0;for(const[n,fn]of casos){try{await fn();console.log('OK '+n);}catch(e){failures++;console.error('FALHA '+n+': '+e.stack);}}await new Promise(r=>setImmediate(r));if(rejeicoes.length){failures++;console.error(rejeicoes);}clearTimeout(watchdog);console.log(`${casos.length-failures}/${casos.length} grupos`);process.exitCode=failures?1:0;})();
