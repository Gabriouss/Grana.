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
  assert.match(fs.readFileSync('app/(app)/perfil.tsx','utf8'),/CONCILIACAO_PIX_LIBERADA && ligado\('importar_extrato'\).*ConciliarPixBotao/);
  const gate={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/conciliacao-pix-disponibilidade.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:gate});assert.equal(gate.CONCILIACAO_PIX_LIBERADA,false,'APK de teste mantém E7 oculta mesmo com importar_extrato ligado ou desconhecido');
  console.log('Pix botão real: preview sem gravar, revisão fora do lote, ignorado desmarca, confirmação explícita/cancelamento, toque duplo e recibo parcial OK');
})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
