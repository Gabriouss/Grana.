const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const watchdog=setTimeout(()=>{console.error('Pix botão: teste não concluiu');process.exit(1);},10000);
function criar(){const c={user:'a',demo:false,slots:[],i:0,effects:[],calls:[],alerts:[],analyzed:0,canceled:0};
  const linha=(id)=>({id,data:'2026-10-05',centavos:3742,descricao:'Pix enviado',direcao:'out',categoria:'Alimentação',cor:'#1fa98d',natureza:'movimento'});
  const rows=['falta','data','revisar','conciliado','ignorar'].map((status,i)=>({status,linha:linha(String(i)),motivo:'Fixture',...(status==='data'?{alvo:{occurred_on:'2026-10-06'}}:{})}));
  const imports={react:{useState(init){const i=c.i++;if(!(i in c.slots))c.slots[i]=typeof init==='function'?init():init;return [c.slots[i],v=>{c.slots[i]=typeof v==='function'?v(c.slots[i]):v;}];},useRef(init){const i=c.i++;return c.slots[i]??(c.slots[i]={current:init});},
    useEffect(fn,deps){const i=c.i++,old=c.slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};c.slots[i]=next;c.effects.push(()=>{old?.cleanup?.();next.cleanup=fn();});}}},
    'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},
    'react-native':{ActivityIndicator:'ActivityIndicator',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:x=>x}},
    'expo-router':{useRouter:()=>({push:()=>{}})},'@/lib/auth-context':{useSession:()=>({session:c.user?{user:{id:c.user}}:null})},
    '@/lib/wallet-context':{useWallet:()=>({activeWalletId:'total',wallets:[{id:'p',name:'Principal',user_id:'a',is_default:true,created_at:'2026-01-01'}]})},
    '@/lib/demo-context':{useDemo:()=>({isDemoMode:c.demo})},'@/lib/alerta':{Alert:{alert:(...x)=>c.alerts.push(x)}},'@/lib/erros':{mensagemErro:e=>e.message},
    '@/lib/escolher-arquivo':{escolherArquivoDeExtrato:async opts=>{assert.equal(opts.limparCopia,true);return c.cancelPick?null:{texto:'fixture'};}},
    '@/lib/conciliacao-pix-servico':{analisarExtratoPix:async op=>{c.analyzed++;assert.equal(op.carteiraId,'p');return {resultados:rows.map(r=>({...r})),cancelar:()=>{c.canceled++;}};},
      confirmarItensPix:async(a,choices)=>{c.calls.push(choices);await c.pending;return choices.map(e=>({id:e.id,status:c.fail?'erro':'salvo',mensagem:c.fail?'Não confirmado.':'Salvo.'}));}},
    '@/lib/format':{formatDateLabel:x=>x,formatMoney:x=>String(x)},'@/lib/theme':{fonts:{},radius:{},spacing:{},theme:{},type:{},lh:()=>20},};
  for(const name of ['AppModal','Sheet','AppPressable','CategoryPickerModal'])imports['./'+name]={__esModule:true,default:name};
  const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/ConciliarPixBotao.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
    {exports:api,Date,console:{warn(){}},require:id=>{if(!(id in imports))throw Error(id);return imports[id];}});
  c.render=()=>{c.i=0;const tree=api.default();for(const fn of c.effects.splice(0))fn();return tree;};return c;}
function nodes(t){if(!t)return [];if(Array.isArray(t))return t.flatMap(nodes);return typeof t==='object'?[t,...nodes(t.props?.children)]:[];}
/* Perfil real, transpilado e renderizado sem rede, com o flag remoto importar_extrato ligado ou desligado.
   A trava da E7 vem do módulo real; hooks e módulos de fora do caminho viram dublês inertes. */
function telaPerfil(flags){const slots=[];let cursor=0;
  const inerte=()=>new Proxy(function(){},{get:(_,k)=>k==='__esModule'?false:k===Symbol.toPrimitive?()=>'':k==='then'?undefined:k===Symbol.iterator?function*(){}:inerte(),apply:()=>inerte(),construct:()=>inerte()});
  const modulo=()=>new Proxy({},{get:(_,k)=>k==='__esModule'?false:inerte()});
  const trava={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/conciliacao-pix-disponibilidade.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:trava});
  const stubs={react:{useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return [slots[i],()=>{}];},useEffect(){},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v});},useCallback:f=>f,useMemo:f=>f()},
    'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},
    'react-native':new Proxy({Platform:{OS:'android',select:o=>o.android??o.default},StyleSheet:{create:v=>v,hairlineWidth:1},AppState:{addEventListener:()=>({remove(){}})}},{get:(o,k)=>o[k]??k}),
    'expo-router':{useRouter:()=>({push(){},replace(){},back(){}})},
    '@/lib/feature-flags':{useFlags:()=>({ligado:k=>flags[k]===true,flag:k=>flags[k]})},
    '@/lib/auth-context':{useSession:()=>({session:{user:{id:'usuario-ficticio',email:'pessoa@exemplo.invalid',user_metadata:{}}},signOut(){}})},
    '@/lib/privacy-context':{usePrivacy:()=>({hidden:false,toggle(){}})},'@/lib/widget-privacy-context':{useWidgetPrivacy:()=>({valoresVisiveis:true,toggle(){}})},
    '@/lib/demo-context':{useDemo:()=>({isDemoMode:false,toggleDemoMode(){}})},'@/lib/app-lock-context':{useAppLock:()=>({ativo:false,disponivel:false,alternar(){}})},
    '@/lib/screen-capture-context':{useScreenCapture:()=>({bloqueado:false,disponivel:false,alternar(){}})},'@/lib/tab-bar':{useTabBarInset:()=>({paddingConteudo:0})},
    '@/lib/motion':{useReducedMotion:()=>false},'@/components/Sheet':{useKeyboardHeight:()=>0},'@/lib/modal-accessibility':{useModalAccessibility(){}},
    '@/lib/conciliacao-pix-disponibilidade':trava};
  const requerer=id=>id in stubs?stubs[id]:id.startsWith('@/components/')?{__esModule:true,default:id}:modulo();
  const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/(app)/perfil.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
    {exports:api,require:requerer,console:{warn(){},log(){},error(){}},Date,Map,Set,Promise,setTimeout,clearTimeout,Intl,Math,JSON,Number,String,Object,Array,RegExp,Error});
  return nodes(api.default());}
const find=(c,label)=>nodes(c.render()).find(n=>n.props?.accessibilityLabel===label);
async function abrir(c){find(c,'Conferir Pix pelo extrato').props.onPress();find(c,'Banco e apelido desta conta').props.onChangeText('Banco fixture');await find(c,'Escolher extrato').props.onPress();}
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
  const c=criar();await abrir(c);assert.equal(c.analyzed,1);assert.equal(c.calls.length,0,'ler não confirma');
  assert.equal(find(c,'Confirmar item 3'),undefined,'ambíguo não tem ação comum');assert.equal(find(c,'Confirmar item 4'),undefined,'conciliado está oculto');
  find(c,'Selecionar item 1').props.onPress();find(c,'Selecionar item 2').props.onPress();find(c,'Ignorar item 2').props.onPress();
  find(c,'Confirmar selecionados').props.onPress();const alert=c.alerts.at(-1);assert.equal(alert[0],'Confirmar itens selecionados');assert.match(alert[1],/1 novos lançamentos e 0 correções/);assert.equal(c.calls.length,0,'cancelar confirmação não escreve');
  alert[2].find(b=>b.text==='Confirmar').onPress();await flush();assert.equal(c.calls.length,1);assert.equal(c.calls[0].length,1);assert.equal(c.calls[0][0].id,'0');
  assert.equal(c.alerts.at(-1)[0],'Conferência atualizada');find(c,'Fechar conferência').props.onPress();assert.ok(c.canceled>0);
  const d=criar();await abrir(d);let release;d.pending=new Promise(r=>{release=r;});find(d,'Confirmar item 1').props.onPress();find(d,'Confirmar item 1').props.onPress();assert.equal(d.calls.length,1,'duplo toque não abre dois lotes');release();await flush();
  const e=criar();e.cancelPick=true;await abrir(e);assert.equal(e.analyzed,0);assert.equal(e.calls.length,0);
  const f=criar();await abrir(f);f.fail=true;find(f,'Confirmar item 1').props.onPress();await flush();assert.match(f.alerts.at(-1)[1],/0 de 1/);assert.ok(nodes(f.render()).some(n=>n.props?.children==='Não confirmado.'));
  /* E7 liberada pelo autor em 09/11/2026 ("Pode ligar a conciliação completamente"): o Perfil real mostra a conferência
     com o flag remoto importar_extrato ligado e a esconde com ele desligado, que continua sendo o interruptor de emergência. */
  const perfilLigado=telaPerfil({importar_extrato:true}),perfilDesligado=telaPerfil({importar_extrato:false});
  for(const tela of [perfilLigado,perfilDesligado])assert.ok(tela.some(n=>n.type==='@/components/ExportarLancamentosBotao'),'o render chegou aos botões de dados do Perfil');
  assert.ok(perfilLigado.some(n=>n.type==='@/components/ConciliarPixBotao'),'Perfil esconde a Conciliação Pix com importar_extrato ligado');
  assert.ok(!perfilDesligado.some(n=>n.type==='@/components/ConciliarPixBotao'),'Perfil mostra a Conciliação Pix com importar_extrato desligado');
  console.log('Pix botão real: preview sem gravar, revisão fora do lote, ignorado desmarca, confirmação explícita/cancelamento, toque duplo, recibo parcial e Perfil com a conferência só com importar_extrato ligado OK');
})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
