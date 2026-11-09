const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const watchdog = setTimeout(() => { console.error('CSV botão: teste não concluiu'); process.exit(1); }, 10_000);
function botao() {
  const c = { user: 'a', demo: false, slots: [], cursor: 0, calls: [], alerts: [], effects: [] };
  const react = {
    useState(init) { const i=c.cursor++; if(!(i in c.slots)) c.slots[i]=typeof init==='function'?init():init; return [c.slots[i],v=>{c.slots[i]=v;}]; },
    useRef(init) { const i=c.cursor++; return c.slots[i]??(c.slots[i]={current:init}); },
    useEffect(fn,deps) { const i=c.cursor++; if(!c.slots[i]||deps.some((v,j)=>!Object.is(v,c.slots[i][j]))){c.slots[i]=deps;c.effects.push(fn);} },
  };
  const imports = {
    react, 'react/jsx-runtime': { jsx:(type,props)=>({type,props}), jsxs:(type,props)=>({type,props}), Fragment:'Fragment' },
    'react-native': { ActivityIndicator:'ActivityIndicator', Text:'Text', View:'View', Platform:{OS:'android'},StyleSheet:{create:x=>x} },
    '@expo/vector-icons/Ionicons':{__esModule:true,default:'Ionicons'},
    '@/lib/auth-context':{useSession:()=>({session:c.user?{user:{id:c.user}}:null})},
    '@/lib/demo-context':{useDemo:()=>({isDemoMode:c.demo})},
    '@/lib/wallet-context':{useWallet:()=>({activeWalletId:'p',wallets:[{id:'p',user_id:'a',name:'Principal'},{id:'o',user_id:'a',name:'Viagem'}]})},
    '@/lib/exportar-lancamentos':{exportarLancamentosCsv: async opts=>{c.calls.push(opts);await c.pending;if(c.fail)throw Error('Confira a conexão.');return {quantidade:2};}},
    '@/lib/alerta':{Alert:{alert:(...x)=>c.alerts.push(x)}},'@/lib/erros':{mensagemErro:e=>e.message},
    '@/lib/theme':{theme:{},fonts:{},radius:{},spacing:{},type:{},lh:()=>20},
  };
  for(const name of ['AppModal','Sheet','AppPressable','MonthSelector','SegmentedTabs'])imports['./'+name]={__esModule:true,default:name};
  const m={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/ExportarLancamentosBotao.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
    {exports:m.exports,module:m,Date,console:{warn(){}},require:id=>{if(!(id in imports))throw Error(id);return imports[id];}});
  c.render=()=>{c.cursor=0;const tree=m.exports.default();for(const fn of c.effects.splice(0))fn();return tree;};
  return c;
}
function nodes(tree){if(!tree)return [];if(Array.isArray(tree))return tree.flatMap(nodes);return typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];}
const byLabel=(c,label)=>nodes(c.render()).find(n=>n.props?.accessibilityLabel===label);
const abrir=c=>byLabel(c,'Exportar lançamentos em CSV').props.onPress();
(async()=>{
  const c=botao(); abrir(c);
  nodes(c.render()).find(n=>n.type==='MonthSelector').props.onChange(2026,0);
  nodes(c.render()).find(n=>n.props?.accessibilityRole==='radio'&&n.props.children[0].props.children==='Viagem').props.onPress();
  let release;c.pending=new Promise(r=>{release=r;});const go=byLabel(c,'Preparar CSV').props.onPress;const first=go();await go();
  assert.equal(c.calls.length,1);assert.equal(c.calls[0].periodo,'2026-01');assert.equal(c.calls[0].carteiraId,'o');assert.equal(c.calls[0].userId,'a');
  assert.equal(byLabel(c,'Preparar CSV').props.disabled,true);release();await first;assert.equal(c.alerts[0][0],'CSV preparado');
  assert.equal(nodes(c.render()).find(n=>n.type==='AppModal').props.visible,false);
  abrir(c);nodes(c.render()).find(n=>n.type==='SegmentedTabs').props.onChange('tudo');c.fail=true;await byLabel(c,'Preparar CSV').props.onPress();
  assert.equal(c.calls[1].periodo,'tudo');assert.equal(c.alerts.at(-1)[0],'Não foi possível exportar');assert.equal(byLabel(c,'Preparar CSV').props.disabled,false);
  assert.ok(nodes(c.render()).some(n=>n.type==='Text'&&String(n.props.children).includes('aguardam envio ficam de fora')));
  const d=botao();d.demo=true;abrir(d);assert.equal(d.alerts[0][0],'Dados de exemplo');assert.equal(d.calls.length,0);
  const e=botao();abrir(e);let liberar;e.pending=new Promise(r=>{liberar=r;});const voo=byLabel(e,'Preparar CSV').props.onPress();e.user='b';e.render();liberar();await voo;assert.equal(e.alerts.length,0);
  assert.match(fs.readFileSync('app/(app)/perfil.tsx','utf8'),/<ExportarLancamentosBotao\s*\/>/);
  console.log('CSV botão real: período/carteira, toque duplo, erro visível, pendentes explícitos, demonstração e troca de conta OK');
})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
