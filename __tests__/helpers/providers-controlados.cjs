// Hooks, relógio e fronteiras controlados; os providers e a guarda são reais.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const flush = async () => { for (let i=0;i<60;i++) await Promise.resolve(); };
const pendente = () => { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
function ambiente(mocks={}) {
  let atual,agora=Date.parse('2026-11-11T12:00:00Z'),id=0;
  const timers=new Map(),cache=new Map(),logs=[];
  const mudou=(a,b)=>!a||!b||a.length!==b.length||a.some((v,i)=>!Object.is(v,b[i]));
  const react={createContext:()=>{const c={};c.Provider=c;return c;},use:c=>c.value,useContext:c=>c.value,
    useState(v){const c=atual,i=c.i++;if(!(i in c.slots))c.slots[i]=typeof v==='function'?v():v;return[c.slots[i],v=>{c.slots[i]=typeof v==='function'?v(c.slots[i]):v;}];},
    useRef(v){const c=atual,i=c.i++;return c.slots[i]??={current:v};},
    useCallback(fn,deps){const c=atual,i=c.i++;if(mudou(c.slots[i]?.deps,deps))c.slots[i]={fn,deps};return c.slots[i].fn;},
    useMemo(fn,deps){return this.useCallback(fn,deps)();},
    useEffect(fn,deps){const c=atual,i=c.i++,old=c.slots[i];if(mudou(old?.deps,deps))c.effects.push(()=>{old?.cleanup?.();c.slots[i]={deps,cleanup:fn()};});},
  };
  // useMemo é chamado sem receptor no código transpilado.
  react.useMemo=(fn,deps)=>react.useCallback(fn,deps)();
  const jsx=(type,props,key)=>({type,props:props??{},key});
  const st=(fn,ms)=>{const n=++id;timers.set(n,{fn,em:agora+ms});return n;};
  function load(rel){rel=path.resolve(root,rel);if(cache.has(rel))return cache.get(rel);const exports={};cache.set(rel,exports);
    const relative=path.relative(root,rel).replaceAll('\\','/');
    let source=process.env.PROVIDERS_BASE && /^(lib\/(auth-context|entitlement-context|wallet-context|sessao-offline|assinatura)|app\/(nova-senha|_layout))\./.test(relative)
      ?execFileSync('git',['show',`${process.env.PROVIDERS_BASE}:${relative}`],{cwd:root,encoding:'utf8'}):fs.readFileSync(rel,'utf8');
    // Expor a função privada da base só cria a mesma porta de teste. Não
    // altera a guarda ou o fluxo que se pretende reproduzir em RED.
    if(relative==='app/_layout.tsx'&&!source.includes('export function RootNavigator'))source+='\nexport { RootNavigator };\n';
    const defaults={react:{__esModule:true,default:react,...react},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'}};
    vm.runInNewContext(ts.transpileModule(source,{fileName:rel,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
      {exports,require(key){if(key in mocks)return mocks[key];if(key in defaults)return defaults[key];if(key.startsWith('.')){const p=path.resolve(path.dirname(rel),key);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'.tsx');}throw Error('Import sem dublê: '+key);},
        Date:class extends Date{constructor(...a){a.length?super(...a):super(agora);}static now(){return agora;}},atob,Promise,Map,Set,AbortController,
        setTimeout:st,clearTimeout:n=>timers.delete(n),setInterval:st,clearInterval:n=>timers.delete(n),console:{warn:(...a)=>logs.push(a),error:(...a)=>logs.push(a)},__DEV__:false}, {filename:rel});return exports;
  }
  function mount(fn,props={}){const c={i:0,slots:[],effects:[]};return {render(effects=true){atual=c;c.i=0;c.effects=[];const tree=fn(props);if(effects)c.effects.forEach(f=>f());return tree;},unmount(){c.slots.forEach(s=>s?.cleanup?.());}};}
  return {load,mount,logs,flush,async advance(ms){const fim=agora+ms;while(true){const t=[...timers].filter(([,t])=>t.em<=fim).sort((a,b)=>a[1].em-b[1].em)[0];if(!t)break;agora=t[1].em;timers.delete(t[0]);t[1].fn();await flush();}agora=fim;await flush();}};
}
module.exports={ambiente,flush,pendente};
