// Provider e Gate REAIS. Relógio/React/fronteiras biométricas são controlados.
// APP_LOCK_P2_RED seleciona só a cópia anterior do provider, sem trocar o clone.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const rejeicoes=[];process.on('unhandledRejection',e=>rejeicoes.push(e));
const watchdog=setTimeout(()=>{console.error('FALHA: P2 pendurado sem conclusao');process.exit(1);},8000);
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
async function concluida(p){let terminou=false;p.then(()=>{terminou=true;},()=>{terminou=true;});await flush();assert.equal(terminou,true,'tentativa deve concluir no prazo avancado, sem esperar watchdog');return p;}
const pendente=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function ambiente(){
  let atual,agora=1000,id=0,promptAtual=null;const timers=new Map(),listeners=new Set(),logs=[],auth=[],cancel=[],gravacoes=[];
  const tempo={
    setTimeout(fn,ms){const k=++id;timers.set(k,{fn,em:agora+ms});return k;},clearTimeout(k){timers.delete(k);},
    async avancar(ms){const fim=agora+ms;while(true){const alvo=[...timers].filter(([,t])=>t.em<=fim).sort((a,b)=>a[1].em-b[1].em)[0];if(!alvo)break;agora=alvo[1].em;timers.delete(alvo[0]);alvo[1].fn();await flush();}agora=fim;await flush();},
  };
  const mudaram=(a,b)=>!a||!b||a.length!==b.length||a.some((v,i)=>!Object.is(v,b[i]));
  const React={
    createContext:valor=>({valor}),use:c=>c.valor,
    useState(ini){const c=atual,i=c.i++;if(!(i in c.slots))c.slots[i]=typeof ini==='function'?ini():ini;return [c.slots[i],v=>{c.slots[i]=typeof v==='function'?v(c.slots[i]):v;}];},
    useRef(ini){const c=atual,i=c.i++;return c.slots[i]??={current:ini};},
    useCallback(fn,deps){const c=atual,i=c.i++;if(!c.slots[i]||mudaram(c.slots[i].deps,deps))c.slots[i]={fn,deps};return c.slots[i].fn;},
    useEffect(fn,deps){const c=atual,i=c.i++;const antes=c.slots[i];if(!antes||mudaram(antes.deps,deps))c.effects.push(()=>{antes?.limpar?.();c.slots[i]={deps,limpar:fn()};});},
  };
  const jsx=(tipo,props)=>({tipo,props:props??{}});
  const rn={Platform:{OS:'android'},AppState:{addEventListener:(_,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)};}},StyleSheet:{create:s=>s},View:'View',Text:'Text'};
  const local={hasHardwareAsync:async()=>true,isEnrolledAsync:async()=>true,
    authenticateAsync:opts=>{
      const p=pendente();const chamada={...p,opts,
        resolve:r=>{if(promptAtual===chamada)promptAtual=null;p.resolve(r);},
        reject:e=>{if(promptAtual===chamada)promptAtual=null;p.reject(e);},
      };auth.push(chamada);promptAtual=chamada;return chamada.promise;
    },
    cancelAuthenticate:()=>{
      const p=pendente();cancel.push({...p,executado:false,executar(){
        assert.equal(this.executado,false,'uma unica execucao nativa por pedido');this.executado=true;
        // SDK57: activePromise/biometricPrompt são consultados ao EXECUTAR,
        // não quando JS pediu o cancelamento. Uma chamada tardia vê o atual.
        const alvo=promptAtual;alvo?.resolve({success:false,error:'user_cancel'});p.resolve();
        return alvo?auth.indexOf(alvo):null;
      }});return p.promise;
    },
  };
  function carregar(rel,extras={}){
    const file=rel==='lib/app-lock-context.tsx'&&process.env.APP_LOCK_P2_RED?path.join(process.env.APP_LOCK_P2_RED,rel):path.join(root,rel);
    const exports={};const imports={react:React,'react-native':rn,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
      '@react-native-async-storage/async-storage':{getItem:async()=>'1',setItem:async(...a)=>gravacoes.push(a)},'expo-local-authentication':local,...extras};
    const parsed=ts.transpileModule(fs.readFileSync(file,'utf8'),{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
    assert.equal((parsed.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
    vm.runInNewContext(parsed.outputText,{exports,require:n=>{assert.ok(n in imports,'import nao previsto '+n);return imports[n];},
      console:{error:(...a)=>logs.push(a)},Date:class extends Date{static now(){return agora;}},setTimeout:tempo.setTimeout,clearTimeout:tempo.clearTimeout},{filename:rel});return exports;
  }
  function montar(fn){const c={i:0,slots:[],effects:[]};return {render(){atual=c;c.i=0;c.effects=[];const tree=fn({children:'financeiro'});c.effects.forEach(f=>f());return tree;},desmontar(){c.slots.forEach(s=>s?.limpar?.());}};}
  const mod=carregar('lib/app-lock-context.tsx');let provider=montar(mod.AppLockProvider);provider.render();
  const valor=()=>{const antes=atual;try{return provider.render().props.value;}finally{atual=antes;}};
  const gate=carregar('components/AppLockGate.tsx',{'@/lib/app-lock-context':{useAppLock:valor},'@expo/vector-icons/Ionicons':'Icon','./AppPressable':'Botao','./BrandLogotype':'Marca',
    '@/lib/theme':{theme:{paper:'#052229'},radius:{pill:100},spacing:{lg:20,sm:8,xl:24},fonts:{light:'Neue',regular:'Neue'},type:{corpo:14}}});
  return {valor,auth,cancel,logs,gravacoes,tempo,
    abrirSemCerca:()=>local.authenticateAsync({promptMessage:'fixture-calibracao-da-fronteira'}),
    async pronto(){await flush();assert.equal(valor().pronto,true);},
    async interromper(){for(const fn of [...listeners])fn('background');await flush();for(const fn of [...listeners])fn('active');await tempo.avancar(251);},
    async remontar(){provider.desmontar();provider=montar(mod.AppLockProvider);provider.render();await flush();},
    gate(){return montar(gate.default).render();},
  };
}
function nos(n,fn,res=[]){if(!n||typeof n!=='object')return res;if(Array.isArray(n)){n.forEach(x=>nos(x,fn,res));return res;}if(fn(n))res.push(n);nos(n.props?.children,fn,res);return res;}
const texto=n=>n==null||n===false?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(texto).join(' '):texto(n.props?.children);
function fechadoComRecibo(a,padrao){assert.equal(a.valor().bloqueado,true);assert.equal(a.valor().autenticando,false);assert.match(a.valor().erro,padrao);assert.equal(a.gravacoes.length,0);const gate=a.gate();assert.equal(gate.props.children[0].props.pointerEvents,'none');assert.match(texto(nos(gate,n=>n.props.accessibilityRole==='alert')[0]),padrao);}
let total=0;const falhas=[];
async function caso(nome,fn){try{await fn();total++;console.log('OK P2 '+nome);}catch(e){falhas.push(nome);console.error('FALHA P2 '+nome+': '+e.message);}}
(async()=>{
  await caso('duas chamadas pendentes deixam recibo ativo e nao repetem cancelamento/prompt',async()=>{
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();await a.interromper();assert.equal(await concluida(velha),false);await a.tempo.avancar(2001);
    fechadoComRecibo(a,/anterior ainda não terminou/);assert.equal(a.auth.length,1);assert.equal(a.cancel.length,1);
    const nova=a.valor().desbloquear();await flush();await a.tempo.avancar(2001);assert.equal(await concluida(nova),false);
    fechadoComRecibo(a,/feche completamente/);assert.equal(a.auth.length,1);assert.equal(a.cancel.length,1);
  });
  await caso('auth terminou mas cancelamento pendente continua cerca; sucesso antigo nao abre',async()=>{
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();await a.interromper();assert.equal(await concluida(velha),false);
    a.auth[0].resolve({success:true});await flush();await a.tempo.avancar(2001);fechadoComRecibo(a,/terminou, mas.*cancelamento/);
    const negada=a.valor().desbloquear();await flush();await a.tempo.avancar(2001);assert.equal(await concluida(negada),false);assert.equal(a.auth.length,1);
    a.cancel[0].resolve();await flush();const nova=a.valor().desbloquear(),duplo=a.valor().desbloquear();await flush();assert.equal(a.auth.length,2);assert.equal(a.cancel.length,1);
    a.auth[1].resolve({success:true});assert.equal(await concluida(nova),true);assert.equal(await concluida(duplo),true);assert.equal(a.valor().bloqueado,false);
  });
  await caso('ACK de cancelamento nao e resultado da authenticate ainda pendente',async()=>{
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();await a.interromper();assert.equal(await concluida(velha),false);
    a.cancel[0].resolve();await flush();const bloqueada=a.valor().desbloquear();await flush();await a.tempo.avancar(2001);assert.equal(await concluida(bloqueada),false);
    fechadoComRecibo(a,/anterior ainda não terminou/);assert.equal(a.auth.length,1);
    a.auth[0].resolve({success:false,error:'user_cancel'});await flush();const nova=a.valor().desbloquear();await flush();assert.equal(a.auth.length,2);a.auth[1].resolve({success:true});assert.equal(await concluida(nova),true);
  });
  await caso('cancelamento rejeitado nao abre sobre auth ativa; fim confirmado permite retry',async()=>{
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();await a.interromper();assert.equal(await concluida(velha),false);
    a.cancel[0].reject(Error('fixture cancelamento'));await flush();const bloqueada=a.valor().desbloquear();await flush();await a.tempo.avancar(2001);assert.equal(await concluida(bloqueada),false);
    fechadoComRecibo(a,/anterior ainda não terminou/);assert.ok(a.logs.length);assert.equal(a.cancel.length,1);assert.equal(a.auth.length,1);
    a.auth[0].resolve({success:false,error:'user_cancel'});await flush();const nova=a.valor().desbloquear();await flush();a.auth[1].resolve({success:true});assert.equal(await concluida(nova),true);
  });
  await caso('cerca do modulo sobrevive remontagem e resposta velha nao altera provider novo',async()=>{
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();await a.remontar();assert.equal(await concluida(velha),false);assert.equal(a.cancel.length,1);
    const negada=a.valor().desbloquear();await flush();await a.tempo.avancar(2001);assert.equal(await concluida(negada),false);assert.equal(a.auth.length,1);
    a.auth[0].resolve({success:true});await flush();assert.equal(a.valor().bloqueado,true);a.cancel[0].resolve();await flush();
    const nova=a.valor().desbloquear();await flush();assert.equal(a.auth.length,2);a.auth[1].resolve({success:true});assert.equal(await concluida(nova),true);
  });
  await caso('termino das duas chamadas durante espera libera so uma nova confirmacao',async()=>{
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();await a.interromper();assert.equal(await concluida(velha),false);
    const nova=a.valor().desbloquear(),duplo=a.valor().desbloquear();await flush();assert.equal(a.auth.length,1);
    a.auth[0].resolve({success:false,error:'user_cancel'});a.cancel[0].resolve();await flush();assert.equal(a.auth.length,2);assert.equal(a.cancel.length,1);
    a.auth[1].resolve({success:true});assert.equal(await concluida(nova),true);assert.equal(await concluida(duplo),true);
  });
  await caso('app_cancel faz limpeza cercada antes de permitir proximo prompt',async()=>{
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();a.auth[0].resolve({success:false,error:'app_cancel'});await flush();assert.equal(await concluida(velha),false);
    assert.equal(a.cancel.length,1);await a.tempo.avancar(2001);fechadoComRecibo(a,/terminou, mas.*cancelamento/);
    a.cancel[0].resolve();await flush();const nova=a.valor().desbloquear();await flush();assert.equal(a.auth.length,2);a.auth[1].resolve({success:true});assert.equal(await concluida(nova),true);
  });
  await caso('rejeicao da authenticate tambem aguarda limpeza confirmada',async()=>{
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();a.auth[0].reject(Error('fixture Activity'));await flush();assert.equal(await concluida(velha),false);
    assert.equal(a.cancel.length,1);await a.tempo.avancar(2001);fechadoComRecibo(a,/terminou, mas.*cancelamento/);
    a.cancel[0].resolve();await flush();const nova=a.valor().desbloquear();await flush();a.auth[1].resolve({success:true});assert.equal(await concluida(nova),true);
  });
  await caso('cancelamento nativo tardio atingiria prompt novo; cerca impede sua abertura',async()=>{
    // Calibra a fronteira adversarial: uma abertura fora do provider seria
    // cancelada pelo pedido velho. Isto valida o dublê; não é QA no aparelho.
    const fronteira=ambiente();await fronteira.pronto();const antiga=fronteira.valor().desbloquear();await flush();await fronteira.interromper();assert.equal(await concluida(antiga),false);
    fronteira.auth[0].resolve({success:false,error:'user_cancel'});await flush();
    const semCerca=fronteira.abrirSemCerca();assert.equal(fronteira.cancel[0].executar(),1,'pedido velho consulta e fecha o NOVO prompt ativo');
    assert.equal((await semCerca).success,false);

    // Agora o provider real recebe exatamente o mesmo pedido atrasado.
    const a=ambiente();await a.pronto();const velha=a.valor().desbloquear();await flush();await a.interromper();assert.equal(await concluida(velha),false);
    a.auth[0].resolve({success:false,error:'user_cancel'});await flush();
    const negada=a.valor().desbloquear();await flush();await a.tempo.avancar(2001);assert.equal(await concluida(negada),false);
    fechadoComRecibo(a,/terminou, mas.*cancelamento/);assert.equal(a.auth.length,1);
    assert.equal(a.cancel[0].executar(),null,'nenhum prompt novo existe para o cancelamento velho atingir');
    await flush();const segura=a.valor().desbloquear();await flush();assert.equal(a.auth.length,2);assert.equal(a.cancel.length,1);
    a.auth[1].resolve({success:true});assert.equal(await concluida(segura),true);
  });
  await new Promise(r=>setImmediate(r));assert.equal(rejeicoes.length,0,'nenhuma rejeicao sem captura');
  console.log(`P2 cancelamento: ${total}/9 grupos; ${falhas.length} falhas`);assert.equal(falhas.length,0,'falhas P2: '+falhas.join(', '));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
