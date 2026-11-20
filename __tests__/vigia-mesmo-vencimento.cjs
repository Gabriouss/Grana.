// Focal20: vigia e EntitlementProvider reais, fronteiras e relogio controlados.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[3]||path.join(__dirname,'..'));
const mode=process.argv[2]||'integrated';
if(!['baseline','candidate','integrated'].includes(mode))throw Error('modo baseline|candidate|integrated obrigatorio');
if(process.env.PROVIDERS_BASE)throw Error('PROVIDERS_BASE deve estar ausente');
const ts=require(path.join(root,'node_modules/typescript'));
const {ambiente,flush,pendente}=require(path.join(root,'__tests__/helpers/providers-controlados.cjs'));
const T0=Date.parse('2026-11-11T12:00:00Z'), iso=t=>new Date(t).toISOString();
const state=(delta=-1000,extra={})=>({enforced:true,active:true,allowed:true,status:'active',access_until:iso(T0+delta),grace_until:null,...extra});
if(mode==='candidate'&&!process.argv[4])throw Error('candidato externo explicito obrigatorio');
const file=mode==='candidate'?path.resolve(process.argv[4]):path.join(root,'lib/vigia-acesso.ts');
function load(clock){
 const exports={};
 const DateFake=class extends Date { constructor(...a){a.length?super(...a):super(clock.now);} static now(){return clock.now;} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,Date:DateFake,Math,Number,Promise,Set,console},{filename:file});
 return exports;
}
let checks=0;const failures=[];
function verify(label,fn){checks++;try{fn();}catch(e){failures.push(label+': '+e.message);}}
function simple(){
 const clock={now:T0},m=load(clock),timers=new Map(),c={calls:[],seq:0,reply:state(),first:null,auto:true};
 c.v=m.criarVigiaDoAcesso({agora:()=>clock.now,recarregar:async()=>{c.calls.push(clock.now);if(c.auto)c.v.acompanhar({...c.reply});},
 ouvirPrimeiroPlano:fn=>{c.first=fn;return()=>{};},agendar:(fn,ms)=>{const id=++c.seq;timers.set(id,{fn,due:clock.now+ms});return id;},cancelar:id=>timers.delete(id)});
 c.tick=async ms=>{const end=clock.now+ms;let guard=0;while(true){const next=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;if(++guard>200)throw Error('fixture excedeu 200 callbacks');clock.now=next[1].due;timers.delete(next[0]);next[1].fn();await flush();}clock.now=end;await flush();};
 return Object.assign(c,{m,clock,timers});
}
async function unit(){
 // Sem simulacao de regra comercial: sao contratos existentes de msAteFimDoAcesso.
 const c=simple();
 for(const [name,input,expected] of [
 ['futuro',state(10000),12000],['expirado',state(),2000],
 ['carencia past_due',state(-1000,{status:'past_due',grace_until:iso(T0+30000)}),32000],
 ['carencia ignorada active',state(10000,{grace_until:iso(T0+90000)}),12000],
 ['negado',state(10000,{allowed:false}),null],['cobranca desligada',state(10000,{enforced:false}),null],
 ['sem data',state(0,{access_until:null}),null],['invalida',state(0,{access_until:'invalid'}),null],
 ['distante',state(2147483647),null],['nulo',null,null]]){
  verify('contrato prazo '+name,()=>assert.equal(c.m.msAteFimDoAcesso(input,T0),expected));
 }
 c.v.acompanhar(state());await c.tick(2000);
 verify('primeira expiracao reconsulta uma vez',()=>assert.equal(c.calls.length,1));
 for(let i=0;i<6;i++){c.v.acompanhar({...state()});await c.tick(2000);}
 verify('mesmo vencimento confirmado nao repete em 2s',()=>assert.equal(c.calls.length,1));
 await c.tick(48000); // now=62s, sessenta segundos desde primeira consulta.
 const before=c.calls.length;c.first();for(let i=0;i<10;i++)c.m.avisarAcessoNegado();await flush();
 verify('eventos fazem uma consulta depois de 60s',()=>assert.equal(c.calls.length,before+1));
 for(let i=0;i<10;i++)c.first();await flush();
 verify('rajada nao repete',()=>assert.equal(c.calls.length,before+1));
 const n=c.calls.length;c.reply=state(67000);c.v.acompanhar(c.reply);
 await c.tick(6999);verify('nova expiracao respeita instante+folga',()=>assert.equal(c.calls.length,n));
 await c.tick(1);verify('nova expiracao consulta mesmo dentro de 60s',()=>assert.equal(c.calls.length,n+1));
 // Mesmo instante em outra representacao de data nao e um prazo novo.
 c.v.acompanhar({...c.reply,access_until:new Date(T0+67000).toUTCString()});await c.tick(2000);
 verify('prazo equivalente nao rearma',()=>assert.equal(c.calls.length,n+1));
 c.reply=state(100000);c.v.acompanhar(c.reply);c.v.acompanhar({...c.reply,allowed:false});
 await c.tick(60000);verify('negado cancela temporizador',()=>assert.equal(c.calls.length,n+1));
 c.v.parar();
 // Callback de timer ja retirado da fila nao pode sobreviver a parar/reagendar.
 let fn;let count=0;const v=c.m.criarVigiaDoAcesso({agora:()=>T0,recarregar:()=>{count++;},ouvirPrimeiroPlano:()=>()=>{},agendar:f=>{fn=f;return 1;},cancelar:()=>{}});
 v.acompanhar(state(1000));const old=fn;v.acompanhar(state(2000));old();await flush();
 verify('timer cancelado nao consulta',()=>assert.equal(count,0));
 fn();v.parar();await flush();verify('microtask pendente nao consulta apos parar',()=>assert.equal(count,0));
}
function provider(){
 const clock={now:T0},m=load(clock),c={owner:'A',calls:[],foreground:new Set(),oldForeground:[],pendingA:null,reply:state(),writes:[]};
 const store=new Map();
 const a=ambiente({
 './vigia-acesso':m,
 './auth-context':{useSession:()=>({session:{user:{id:c.owner},access_token:'token-'+c.owner},isLoading:false,emRecuperacao:false,sessaoNaoConfirmada:false})},
 './assinatura':{vincularAssinaturasPendentes:async()=>({houveFalha:false})},
 './offline-cache':{isLikelyNetworkError:()=>false},
 './supabase':{supabase:{rpc:name=>{const owner=c.owner;c.calls.push({owner,name,at:clock.now});const promise=c.pendingA&&owner==='A'?c.pendingA.promise:Promise.resolve({data:{...c.reply},error:null});promise.setHeader=()=>promise;promise.abortSignal=()=>promise;return promise;}}},
 './notifications':{sincronizarAvisosAssinatura:async()=>{}},'./modo-teste':{MODO_TESTE:false},
 './cache-de-tela':{assinarLeituraEsvaziou:()=>()=>{}},
 'react-native':{AppState:{addEventListener:(_,fn)=>{c.foreground.add(fn);c.oldForeground.push(fn);return{remove:()=>c.foreground.delete(fn)};}}},
 '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async k=>store.get(k)??null,setItem:async(k,v)=>{store.set(k,v);c.writes.push(JSON.parse(v).userId);}}},
 });
 const p=a.mount(a.load('lib/entitlement-context.tsx').EntitlementProvider);
 const value=()=>p.render().props.value;
 async function settle(){for(let i=0;i<4;i++){value();await flush();}}
 async function tick(ms){clock.now+=ms;await a.advance(ms);await settle();}
 return {a,p,c,m,value,settle,tick};
}
async function integration(){
 const e=provider();
 try{
  await e.settle();verify('provider inicial consulta uma vez',()=>assert.equal(e.c.calls.length,1));
  await e.tick(2000);verify('provider primeiro timer consulta uma vez',()=>assert.equal(e.c.calls.length,2));
  for(let i=0;i<6;i++)await e.tick(2000);
  verify('provider real nao entra em ciclo mesmo estado vencido',()=>assert.equal(e.c.calls.length,2));
  verify('nao muda direito devolvido pelo servidor',()=>assert.equal(e.value().estado.allowed,true));
  const old=e.c.oldForeground[0];e.c.owner='B';await e.settle();
  const before=e.c.calls.length;
  verify('troca dono consulta B uma vez',()=>assert.equal(e.c.calls.at(-1).owner,'B'));
  old('active');await e.settle();verify('callback de A parado nao consulta B',()=>assert.equal(e.c.calls.length,before));
  await e.tick(2000);verify('B tem vigia propria para mesmo prazo',()=>assert.equal(e.c.calls.length,before+1));
  await e.tick(2000);verify('B tambem nao repete prazo antigo',()=>assert.equal(e.c.calls.length,before+1));
  e.c.reply=state(25000);await e.value().recarregar();await e.settle();
  const n=e.c.calls.length;await e.tick(8999);verify('provider nova expiracao aguarda',()=>assert.equal(e.c.calls.length,n));
  await e.tick(1);verify('provider nova expiracao consulta',()=>assert.equal(e.c.calls.length,n+1));
  e.c.reply=state(0,{allowed:false,active:false});await e.value().recarregar();await e.settle();
  verify('direito negado continua negado',()=>assert.equal(e.value().estado.allowed,false));
  const no=e.c.calls.length;await e.tick(60000);verify('negado nao reconsulta por timer',()=>assert.equal(e.c.calls.length,no));
 }finally{e.p.unmount();}
 const r=provider();
 try{
  r.c.pendingA=pendente();await r.settle();r.c.owner='B';r.c.reply=state(0,{allowed:false,active:false});await r.settle();
  r.c.pendingA.resolve({data:state(),error:null});await r.settle();
  verify('resposta A tardia nao libera B',()=>assert.equal(r.value().estado.allowed,false));
  verify('resposta A tardia nao persiste A',()=>assert.ok(!r.c.writes.includes('A')));
 }finally{r.p.unmount();}
}
(async()=>{await unit();await integration();console.log(JSON.stringify({mode,status:failures.length?'FAIL':'PASS',checks,failures},null,2));process.exitCode=failures.length?1:0;})().catch(e=>{console.error('ERRO DE FIXTURE/INFRA; NAO RED CAUSAL',e.stack);process.exitCode=2;});
