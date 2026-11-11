// Provider, gate e modal REAIS; somente React, relógio e APIs do aparelho são dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
let total = 0;
const falhas = [];
const rejeicoes = [];
const testarInterface = process.argv.includes('--interface');
const watchdog = setTimeout(() => { console.error('FALHA: regressão pendurada sem conclusão'); process.exit(1); }, 5000);
process.on('unhandledRejection', e => rejeicoes.push(e));
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function ambiente(opcoes = {}) {
  let agora = 1000, proximo = 1, atual;
  const timers = new Map(), listeners = new Set(), logs = [], chamadas = [];
  let nativo = null;
  const relogio = {
    setTimeout(fn, ms) { const id = proximo++; timers.set(id, { fn, em: agora + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async avancar(ms) {
      const fim = agora + ms;
      while (true) {
        const alvo = [...timers].filter(([,t]) => t.em <= fim).sort((a,b) => a[1].em-b[1].em)[0];
        if (!alvo) break;
        agora = alvo[1].em; timers.delete(alvo[0]); alvo[1].fn(); await flush();
      }
      agora = fim; await flush();
    },
  };
  const mudaram = (a,b) => !a || !b || a.length !== b.length || a.some((v,i) => !Object.is(v,b[i]));
  const React = {
    createContext: valor => ({ valor }), use: ctx => ctx.valor,
    useState(ini) {
      const c = atual, i = c.i++;
      if (!(i in c.slots)) c.slots[i] = typeof ini === 'function' ? ini() : ini;
      return [c.slots[i], v => { const novo = typeof v === 'function' ? v(c.slots[i]) : v; if (!Object.is(novo,c.slots[i])) { c.slots[i]=novo; c.sujo=true; } }];
    },
    useRef(ini) { const c=atual,i=c.i++; return c.slots[i] ??= { current:ini }; },
    useCallback(fn,deps) { const c=atual,i=c.i++; if (!c.slots[i] || mudaram(c.slots[i].deps,deps)) c.slots[i]={fn,deps}; return c.slots[i].fn; },
    useEffect(fn,deps) {
      const c=atual,i=c.i++,velho=c.slots[i];
      if (!velho || mudaram(velho.deps,deps)) c.efeitos.push(()=>{velho?.limpar?.();c.slots[i]={deps,limpar:fn()};});
    },
  };
  const AppState = { currentState:'active', addEventListener(_,fn) { listeners.add(fn); return { remove:()=>listeners.delete(fn) }; } };
  const local = {
    hasHardwareAsync: opcoes.hardware ?? (async()=>true), isEnrolledAsync:async()=>true,
    authenticateAsync: opcoes.autenticar ?? (async opts => {
      chamadas.push(['autenticar',opts]);
      if (nativo) return { success:false,error:'app_cancel' };
      return new Promise(resolve => { nativo=resolve; });
    }),
    cancelAuthenticate: async()=>{ chamadas.push(['cancelar']); if(opcoes.cancelar) return opcoes.cancelar(); const resolve=nativo;nativo=null;resolve?.({success:false,error:'user_cancel'}); },
  };
  const storage = { getItem:opcoes.ler ?? (async()=>opcoes.salvo ?? '1'), setItem:async(k,v)=>chamadas.push(['gravar',k,v]) };
  const jsx=(tipo,props)=>({tipo,props:props??{}});
  const rn={AppState,Platform:{OS:opcoes.web?'web':'android'},StyleSheet:{create:s=>s},Text:'Text',View:'View',Modal:'Modal'};
  function carregar(rel, extras={}) {
    const exports={};
    const imports={react:React,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':rn,
      '@react-native-async-storage/async-storage':storage,'expo-local-authentication':local,...extras};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(raiz,rel),'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    }).outputText,{exports,require:id=>{assert.ok(id in imports,`import inesperado ${id}`);return imports[id]},
      console:{error:(...v)=>logs.push(v),warn:(...v)=>logs.push(v)},Date:class extends Date {static now(){return agora;}},
      setTimeout:relogio.setTimeout,clearTimeout:relogio.clearTimeout}, {filename:rel});
    return exports;
  }
  const mod=carregar('lib/app-lock-context.tsx');
  function montar(fn,props={}) {
    const c={i:0,slots:[],efeitos:[],sujo:false}, instancia={};
    instancia.render=()=>{
      let arvore;
      for(let i=0;i<30;i++){
        atual=c;c.i=0;c.efeitos=[];c.sujo=false;arvore=fn(props);c.efeitos.forEach(f=>f());
        if(!c.sujo)return arvore;
      }
      throw Error('render não estabilizou');
    };
    instancia.desmontar=()=>c.slots.forEach(s=>s?.limpar?.());
    instancia.render();return instancia;
  }
  const provider=montar(mod.AppLockProvider,{children:'conteudo'});
  const valor=()=>{const anterior=atual;try{return provider.render().props.value;}finally{atual=anterior;}};
  const tema={theme:{paper:'#052229'},radius:{pill:99},spacing:{lg:20,sm:8,xl:24},fonts:{light:'Neue',regular:'Neue'},type:{corpo:14}};
  const registro=carregar('lib/janelas-abertas.ts');
  const gate=carregar('components/AppLockGate.tsx',{'@/lib/app-lock-context':{useAppLock:valor},'@expo/vector-icons/Ionicons':'Icon','@/lib/theme':tema,'./AppPressable':'Botao','./BrandLogotype':'Marca'});
  const modal=carregar('components/AppModal.tsx',{'@/lib/app-lock-context':{useAppLock:valor},'@/lib/motion':{useReducedMotion:()=>false},'@/lib/breakpoints':{useSheetFlutuante:()=>({})},'@/lib/janelas-abertas':registro,
    'react-native-safe-area-context':{SafeAreaProvider:'SafeArea',useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}});
  return {valor,provider,gate,modal,registro,montar,relogio,chamadas,logs,
    async pronto(){await flush();valor();},
    async estado(s){AppState.currentState=s;for(const f of [...listeners])f(s);await flush();valor();},
    concluir(r){const resolve=nativo;nativo=null;resolve?.(r);},
  };
}
function nos(no,fn,res=[]){if(!no||typeof no!=='object')return res;if(Array.isArray(no)){no.forEach(n=>nos(n,fn,res));return res;}if(fn(no))res.push(no);nos(no.props?.children,fn,res);return res;}
const texto=no=>no==null||no===false?'':typeof no!=='object'?String(no):Array.isArray(no)?no.map(texto).join(' '):texto(no.props?.children);
async function caso(nome,fn){try{await fn();total++;console.log('OK '+nome);}catch(e){falhas.push(nome);console.error('FALHA '+nome+': '+e.message);}}
(async()=>{
  await caso('inicialização normal e web sem prompt',async()=>{
    const a=ambiente({salvo:'0'});await a.pronto();assert.equal(a.valor().pronto,true);assert.equal(a.valor().bloqueado,false);
    const w=ambiente({web:true,salvo:'0'});assert.equal(w.valor().pronto,true);await w.pronto();assert.equal(w.chamadas.length,0);
  });
  if (testarInterface) await caso('cobertura inicial vazia e desbloqueio com rótulo fixo',async()=>{
    const a=ambiente();
    const gate=a.montar(a.gate.default,{children:'financeiro'});
    const inicial=gate.render();
    const [conteudo,cobertura]=inicial.props.children;
    assert.equal(conteudo.props.pointerEvents,'none');
    assert.equal(conteudo.props.accessibilityElementsHidden,true);
    assert.equal(conteudo.props.importantForAccessibility,'no-hide-descendants');
    assert.equal(cobertura.props.style.backgroundColor,'#052229');
    assert.equal(nos(cobertura,n=>['Marca','Text','Botao'].includes(n.tipo)).length,0);

    await a.pronto();
    const bloqueado=gate.render();
    assert.equal(nos(bloqueado,n=>n.tipo==='Marca').length,1);
    assert.equal(nos(bloqueado,n=>n.tipo==='Text'&&texto(n)==='Seus valores estão protegidos.').length,1);
    const [botao]=nos(bloqueado,n=>n.tipo==='Botao');
    assert.match(texto(botao),/Desbloquear/);
    assert.equal(botao.props.disabled,false);

    await flush();
    const [ocupado]=nos(gate.render(),n=>n.tipo==='Botao');
    assert.equal(nos(ocupado,n=>n.tipo==='Text').map(texto).join(''),'Desbloquear');
    assert.equal(ocupado.props.disabled,true);
    assert.equal(ocupado.props.accessibilityState.busy,true);
    assert.equal(ocupado.props.accessibilityState.disabled,true);
    a.concluir({success:true});
    await flush();
  });
  if (testarInterface) for (const [falha,salvo] of [['pendurado','0'],['rejeitado','1']]) await caso(`gate recupera storage ${falha} pelo botão sem expor financeiro`,async()=>{
    let leituras=0,retomar;
    const a=ambiente({ler:()=>{
      leituras++;
      if(leituras===1)return falha==='pendurado'?new Promise(()=>{}):Promise.reject(Error('storage indisponível'));
      return new Promise(resolve=>{retomar=resolve;});
    }});
    const gate=a.montar(a.gate.default,{children:'financeiro'});
    assert.equal(nos(gate.render(),n=>['Marca','Text','Botao'].includes(n.tipo)).length,0);
    if(falha==='pendurado')await a.relogio.avancar(5001);else await a.pronto();
    assert.equal(a.valor().pronto,true);
    assert.equal(a.valor().bloqueado,true);
    assert.ok(a.logs.length);
    const erro=gate.render();
    assert.equal(erro.props.children[0].props.pointerEvents,'none');
    assert.equal(erro.props.children[0].props.accessibilityElementsHidden,true);
    assert.equal(nos(erro,n=>n.props.accessibilityRole==='alert').length,1);
    assert.match(texto(erro),/Não consegui conferir a proteção/);
    const [botao]=nos(erro,n=>n.tipo==='Botao');
    assert.equal(botao.props.disabled,false);
    assert.equal(a.chamadas.length,0,'erro de preparação não abre prompt automático');
    botao.props.onPress();
    await flush();
    assert.equal(leituras,2);
    assert.equal(a.valor().pronto,false);
    const relendo=gate.render();
    assert.equal(relendo.props.children[0].props.importantForAccessibility,'no-hide-descendants');
    assert.equal(nos(relendo,n=>['Marca','Text','Botao'].includes(n.tipo)).length,0);
    retomar(salvo);await flush();
    if(salvo==='1'){
      const aguardando=gate.render();
      assert.equal(aguardando.props.children[0].props.pointerEvents,'none');
      assert.equal(nos(aguardando,n=>n.tipo==='Botao')[0].props.accessibilityState.busy,true);
      assert.equal(a.chamadas.filter(x=>x[0]==='autenticar').length,1);
      a.concluir({success:true});await flush();
    }
    assert.equal(a.valor().bloqueado,false);
    const aberto=gate.render();
    assert.equal(aberto.props.children[0].props.pointerEvents,'auto');
    assert.equal(aberto.props.children[0].props.accessibilityElementsHidden,false);
    assert.equal(aberto.props.children[1],false);
    assert.equal(a.chamadas.filter(x=>x[0]==='autenticar').length,salvo==='1'?1:0);
    assert.equal(a.chamadas.filter(x=>x[0]==='gravar').length,0);
  });
  await caso('storage pendurado termina fechado com recibo e pode retomar',async()=>{
    let pendurado=true;const a=ambiente({ler:()=>pendurado?new Promise(()=>{}):Promise.resolve('0')});
    await a.relogio.avancar(10001);assert.equal(a.valor().pronto,true);assert.equal(a.valor().bloqueado,true);assert.ok(a.valor().erro);
    pendurado=false;await a.valor().desbloquear();assert.equal(a.valor().bloqueado,false);assert.equal(a.chamadas.length,0);
  });
  await caso('erro de hardware deixa recibo sem abrir o conteúdo',async()=>{
    const a=ambiente({hardware:async()=>{throw Error('falha nativa')}});await a.pronto();
    assert.equal(a.valor().pronto,true);assert.equal(a.valor().bloqueado,true);assert.ok(a.valor().erro);assert.ok(a.logs.length);
  });
  await caso('falha biométrica resolvida deixa recibo no gate real',async()=>{
    const a=ambiente({autenticar:async()=>({success:false,error:'app_cancel'})});await a.pronto();
    await a.valor().desbloquear();assert.equal(a.valor().bloqueado,true);assert.ok(a.valor().erro);
    if (testarInterface) { const g=a.montar(a.gate.default,{children:'financeiro'}).render();assert.ok(nos(g,n=>n.props.accessibilityRole==='alert').length); }
  });
  await caso('rejeição biométrica não escapa e libera tentativa',async()=>{
    const a=ambiente({autenticar:async()=>{throw Error('Activity perdida')}});await a.pronto();
    assert.equal(await a.valor().desbloquear(),false);assert.ok(a.valor().erro);assert.equal(a.valor().autenticando,false);
  });
  await caso('toques concorrentes fazem uma chamada nativa',async()=>{
    const a=ambiente();await a.pronto();const p=a.valor().desbloquear(),q=a.valor().desbloquear();await flush();
    assert.equal(a.chamadas.filter(x=>x[0]==='autenticar').length,1);a.concluir({success:true});assert.equal(await p,true);assert.equal(await q,true);assert.equal(a.valor().bloqueado,false);
  });
  await caso('biometria pendurada vence prazo e não aceita sucesso tardio',async()=>{
    let resolver;const a=ambiente({autenticar:()=>new Promise(r=>resolver=r)});await a.pronto();const p=a.valor().desbloquear();await flush();
    await a.relogio.avancar(90001);assert.equal(a.valor().autenticando,false);assert.ok(a.valor().erro);assert.ok(a.chamadas.some(x=>x[0]==='cancelar'));
    resolver({success:true});await flush();assert.equal(await p,false);assert.equal(a.valor().bloqueado,true);
  });
  await caso('retorno da Activity recupera promessa antiga sem reiniciar processo',async()=>{
    const a=ambiente();await a.pronto();const p=a.valor().desbloquear();await flush();await a.estado('background');await a.relogio.avancar(31000);await a.estado('active');await a.relogio.avancar(501);
    assert.ok(a.chamadas.some(x=>x[0]==='cancelar'));assert.equal(await p,false);assert.ok(a.valor().erro);
    const nova=a.valor().desbloquear();await flush();assert.equal(a.chamadas.filter(x=>x[0]==='autenticar').length,2);a.concluir({success:true});assert.equal(await nova,true);assert.equal(a.valor().bloqueado,false);
  });
  await caso('PIN válido concluído no retorno não é cancelado nem rebloqueado',async()=>{
    const a=ambiente();await a.pronto();const p=a.valor().desbloquear();await flush();await a.estado('background');await a.relogio.avancar(31000);
    await a.estado('active');a.concluir({success:true});await flush();await a.relogio.avancar(501);assert.equal(await p,true);assert.equal(a.valor().bloqueado,false);
    assert.equal(a.chamadas.filter(x=>x[0]==='cancelar').length,0);
  });
  await caso('cancelamento antigo pendurado impede corrida com prompt novo',async()=>{
    let liberar;const a=ambiente({cancelar:()=>new Promise(r=>liberar=r)});await a.pronto();const p=a.valor().desbloquear();await flush();await a.estado('background');await a.estado('active');await a.relogio.avancar(501);
    assert.ok(a.chamadas.some(x=>x[0]==='cancelar'));assert.equal(await p,false);assert.equal(a.valor().bloqueado,true);
    const q=a.valor().desbloquear();await flush();await a.relogio.avancar(3001);assert.equal(await q,false);
    assert.equal(a.chamadas.filter(x=>x[0]==='autenticar').length,1);assert.ok(a.valor().erro);
    a.concluir({success:false,error:'user_cancel'});liberar();await flush();
    const nova=a.valor().desbloquear();await flush();a.concluir({success:true});assert.equal(await nova,true);
  });
  if (testarInterface) await caso('modais nativos só aparecem/registram depois do desbloqueio',async()=>{
    const a=ambiente();const m=a.montar(a.modal.default,{visible:true,children:'janela pendente'});
    assert.equal(m.render().props.visible,false);assert.equal(a.registro.quantasJanelasAbertas(),0);
    await a.pronto();assert.equal(m.render().props.visible,false);const p=a.valor().desbloquear();await flush();a.concluir({success:true});await p;
    assert.equal(m.render().props.visible,true);assert.equal(a.registro.quantasJanelasAbertas(),1);
    await a.estado('background');await a.relogio.avancar(31001);await a.estado('active');assert.equal(m.render().props.visible,false);assert.equal(a.registro.quantasJanelasAbertas(),0);
    m.desmontar();
  });
  if (testarInterface) await caso('AlertaHost compartilha provider da trava na árvore real',async()=>{
    const file=path.join(raiz,'app/_layout.tsx');
    const fonte=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let hosts=0;
    function visitar(no,pais=[]){
      let proximos=pais;
      if(ts.isJsxElement(no))proximos=[...pais,no.openingElement.tagName.getText(fonte)];
      if(ts.isJsxSelfClosingElement(no)&&no.tagName.getText(fonte)==='AlertaHost'){
        hosts++;assert.ok(pais.includes('AppLockProvider'),'alertas também precisam aguardar a trava');
      }
      ts.forEachChild(no,filho=>visitar(filho,proximos));
    }
    visitar(fonte);assert.equal(hosts,1);
  });
  await caso('resultado de autenticação após desmontar não altera outro ciclo',async()=>{
    let resolver;const a=ambiente({autenticar:()=>new Promise(r=>resolver=r)});await a.pronto();const p=a.valor().desbloquear();await flush();a.provider.desmontar();resolver({success:true});await flush();assert.equal(await p,false);assert.equal(a.valor().bloqueado,true);
  });
  await new Promise(r=>setImmediate(r));
  if(rejeicoes.length)console.log('Rejeições não capturadas observadas: '+rejeicoes.length);
  console.log(`app-lock: ${total} cenários OK; ${falhas.length} falhas`);
  assert.equal(falhas.length,0,'regressões: '+falhas.join(', '));
  assert.equal(rejeicoes.length,0,'nenhuma rejeição sem captura');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
