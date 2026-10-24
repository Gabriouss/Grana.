 'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function montar(teste=false){
 const c={userId:'A',loading:false,notifs:[],pending:[],rpc:[],disco:new Map(),warnings:[]};
 const slots=[],effects=[];let cursor=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
 const react={createContext:()=>({}),use(){},useState(init){const i=cursor++;if(!(i in slots))slots[i]=init;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v});},useCallback(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn;},useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const prev=slots[i];effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:fn()};});}}};
 const cache=new Map();
 const store={getItem:async k=>c.disco.get(k)??null,setItem:async(k,v)=>{c.disco.set(k,v);},removeItem:async k=>{c.disco.delete(k);}};
 const mocks={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props})},'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
  './auth-context':{useSession:()=>({session:c.userId?{user:{id:c.userId}}:null,sessaoNaoConfirmada:false,isLoading:c.loading})},
  './notifications':{sincronizarAvisosAssinatura:async(...a)=>{c.notifs.push(a);}},'./assinatura':{vincularAssinaturasPendentes:async()=>({houveFalha:false})},
  './offline-cache':{isLikelyNetworkError:e=>e?.code==='NETWORK'},'./supabase':{supabase:{rpc:(name)=>{c.rpc.push(name);return new Promise((resolve,reject)=>c.pending.push({resolve,reject}));}}},
  './modo-teste':{MODO_TESTE:teste},'./cache-de-tela':{assinarLeituraEsvaziou:()=>()=>{}},'@react-native-async-storage/async-storage':{__esModule:true,default:store}};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:m,exports:m.exports,require(id){if(id in mocks)return mocks[id];if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts');throw Error('import nao esperado '+id);},Date,Promise,Map,Set,Math,console:{error:(...a)=>c.warnings.push(a),warn:(...a)=>c.warnings.push(a)},setTimeout:()=>1,clearTimeout(){}});return m.exports;}
 const Provider=load('lib/entitlement-context.tsx').EntitlementProvider;c.seed=estado=>load('lib/entitlement-cache.ts').guardarAcesso('A',estado);
 c.render=()=>{cursor=0;const t=Provider({children:null});while(effects.length)effects.shift()();return t.props.value;};c.flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};return c;
}
let checks=0;const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;};
const state={enforced:true,allowed:true,active:true,status:'canceled',access_until:'2099-01-01T00:00:00Z',grace_until:null};
(async()=>{
 const c=montar();await c.seed(state);c.render();await c.flush();eq(c.notifs.length,1);eq(c.notifs[0],['A'],'cache so limpa avisos de outras contas');eq(c.rpc,['obter_estado_acesso']);
 const confirmado={...state,status:'active'};c.pending.shift().resolve({data:confirmado,error:null});await c.flush();c.render();await c.flush();eq(c.notifs.length,2);eq(c.notifs[1][0],'A');eq(c.notifs[1][1],confirmado,'somente estado confirmado chega ao agendador');eq(c.rpc.length,1,'render nao dispara laço');
 const semRede=montar();await semRede.seed(state);semRede.render();await semRede.flush();semRede.pending.shift().reject(Object.assign(new Error('offline'),{code:'NETWORK'}));await semRede.flush();const off=semRede.render();eq(off.estado.allowed,true);eq(semRede.notifs.length,1,'falha/offline nao cancela propria agenda nem cria plano do cache');
 semRede.userId=null;semRede.render();await semRede.flush();eq(semRede.notifs.at(-1),[null],'logout cancela assinatura pelo canal de identidade');
 const troca=montar();troca.render();await troca.flush();const old=troca.pending.shift();troca.userId='B';troca.render();await troca.flush();old.resolve({data:state,error:null});await troca.flush();eq(troca.notifs.filter(x=>x.length===2).length,0,'RPC atrasada da conta A nao agenda depois da troca');
 troca.pending.shift().resolve({data:confirmado,error:null});await troca.flush();eq(troca.notifs.at(-1)[0],'B');eq(troca.notifs.at(-1)[1],confirmado);
 const demo=montar(true);demo.render();await demo.flush();eq(demo.rpc.length,0);eq(demo.notifs.length,0,'landing/teste nunca toca notificacoes');
 console.log(JSON.stringify({suite:'assinatura-entitlement',checks}));
})().catch(e=>{console.error(e);process.exitCode=1;});
