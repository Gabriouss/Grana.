 'use strict';
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path'),assert=require('node:assert/strict');
process.env.TZ='America/Sao_Paulo';
function criarTela(arquivo='app/assinar.tsx'){
 const T=Date.parse('2026-11-01T12:00:00-03:00');let momento=T;
 class Clock extends Date{constructor(...a){super(...(a.length?a:[momento]));}static now(){return momento;}}
 const ctx={userId:'conta-A',estado:{enforced:true,active:false,allowed:false,status:'canceled',access_until:'2026-10-31T18:45:00-03:00',grace_until:null},ligado:true,rpc:[],abertos:[],warnings:[],pendentes:[],timers:[],alertas:[],exportacoes:[]};
 const slots=[],effects=[];let cursor=0;
 const react={useState(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useEffect(fn,deps){const i=cursor++,prev=slots[i];if(!prev||deps.some((x,k)=>x!==prev.deps[k])){effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:fn()};});}}};
 const native=new Proxy({StyleSheet:{create:v=>v},Linking:{openURL:async u=>ctx.abertos.push(u)}},{get:(t,k)=>t[k]??String(k)});
 const mCache=new Map();
 function load(file){file=path.resolve(file);if(mCache.has(file))return mCache.get(file).exports;const m={exports:{}};mCache.set(file,m);
  const imports={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},'react-native':native,
   'expo-linking':{openURL:async u=>ctx.abertos.push(u)},'@/lib/entitlement-context':{useEntitlement:()=>({estado:ctx.estado,sincronizacao:{mensagem:null}})},
   '@/lib/auth-context':{useSession:()=>({session:{user:{id:ctx.userId,email:'fixture@invalid.test'}},signOut:async()=>{}})},
   '@/lib/feature-flags':{useFlags:()=>({ligado:()=>ctx.ligado})},'@/lib/alerta':{Alert:{alert:(...a)=>ctx.alertas.push(a)}},
   '@/lib/theme':{type:{apoio:14},fonts:{light:'Light',regular:'Regular'},spacing:{xs:4,sm:8,md:12,lg:16,xl:24,xxl:32},radius:{md:12,xl:20,pill:99},theme:{paper:'#052229',paperRaised:'#0b2d35',ink:'#effffa',inkSoft:'#a6d9ce',inkFaint:'#7fa9a0',rule:'rule',ruleStrong:'strong',accent2:'#aeffe3',danger:'danger'}},
   './supabase':{supabase:{rpc(...a){ctx.rpc.push(a);return new Promise(resolve=>ctx.pendentes.push(resolve));}}}};
  imports['@/lib/erros']={mensagemErro:(_e,v)=>v};imports['@/lib/exportar-meus-dados']={exportarMeusDados:async(...a)=>{ctx.exportacoes.push(a);return{nomeArquivo:'fixture.json',contagem:{transactions:2},indisponiveis:[],compartilhado:true};}};imports['./AppPressable']={__esModule:true,default:'@/components/AppPressable'};imports['@expo/vector-icons/Ionicons']={__esModule:true,default:'Ionicons'};
  const req=id=>{if(id in imports)return imports[id];if(id.startsWith('@/components/'))return{__esModule:true,default:id};if(id.startsWith('@/'))return load(path.resolve(id.slice(2))+'.ts');if(id.startsWith('./'))return load(path.resolve(path.dirname(file),id)+'.ts');throw Error('import nao dublado: '+id);};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:m,exports:m.exports,require:req,Date:Clock,console:{warn:(...a)=>ctx.warnings.push(a)},setTimeout:(fn,ms)=>{ctx.timers.push({fn,ms});return ctx.timers.length;},clearTimeout(){},process:{env:{EXPO_PUBLIC_CHECKOUT_URL:'https://checkout.invalid.test/mensal',EXPO_PUBLIC_BILLING_URL:'https://checkout.invalid.test/cobranca'}},URL},{filename:file});return m.exports;
 }
 const screen=load(arquivo).default;
 ctx.avancarTempo=ms=>{momento+=ms;};
 ctx.render=(props)=>{cursor=0;const t=screen(props);while(effects.length)effects.shift()();return t;};ctx.flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 return ctx;
}
function nodes(tree){if(tree==null||tree===false)return[];if(Array.isArray(tree))return tree.flatMap(nodes);if(typeof tree!=='object')return[];return[tree,...nodes(tree.props?.children)];}
function text(tree){if(tree==null||tree===false)return'';if(Array.isArray(tree))return tree.map(text).join(' ');if(typeof tree!=='object')return String(tree);if(tree.type==='Text'){const inline=v=>Array.isArray(v)?v.map(inline).join(''):(v==null||v===false?'':typeof v==='object'?text(v):String(v));return inline(tree.props?.children);}return text(tree.props?.children);}
async function main(){
 let checks=0;const ok=(b,n)=>{assert.ok(b,n);checks++;};const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;};
 const c=criarTela();let tree=c.render();ok(text(tree).includes('Sua assinatura venceu em 31/10'));ok(text(tree).includes('O vencimento não apaga seus dados'));ok(!text(tree).includes('Seu controle financeiro continua.'));eq(c.rpc,[['resumo_dados_guardados']]);
 c.pendentes.shift()({data:{lancamentos:18,contas:3,cartoes:1,metas:0},error:null});await c.flush();tree=c.render();ok(text(tree).includes('Guardados na sua conta'));ok(text(tree).includes('18'));ok(text(tree).includes('cartão'));ok(!text(tree).includes('MAIS VANTAJOSO'));
 const renovar=nodes(tree).find(n=>n.type==='Pressable'&&text(n).includes('Renovar assinatura'));ok(renovar);await renovar.props.onPress();ok(c.abertos[0].includes('email=fixture%40invalid.test'));ok(c.abertos[0].includes('confirmEmail='));
 c.userId='conta-B';tree=c.render();ok(!text(tree).includes('18'),'conta B nunca ve resumo da A, nem antes da nova resposta');
 c.pendentes.shift()({data:null,error:{code:'PGRST202'}});await c.flush();tree=c.render();ok(!text(tree).includes('Guardados na sua conta'));eq(c.warnings.length,1);
 c.estado={...c.estado,status:'past_due',grace_until:'2026-10-30T15:00:00Z'};tree=c.render();ok(text(tree).includes('O pagamento não foi confirmado'));ok(text(tree).includes('30/10'));ok(text(tree).includes('Atualizar cobrança'));ok(!text(tree).includes('Renovar assinatura'));
 const atualizar=nodes(tree).find(n=>n.type==='Pressable'&&text(n).includes('Atualizar cobrança'));await atualizar.props.onPress();eq(c.abertos.at(-1),'https://checkout.invalid.test/cobranca');
 for(const status of ['refunded','chargeback']){c.estado={...c.estado,status};tree=c.render();ok(text(tree).includes('Sua assinatura foi encerrada'));}
 const before=c.rpc.length;c.estado={...c.estado,status:null,access_until:null,grace_until:null};tree=c.render();ok(text(tree).includes('Seu controle financeiro continua.'));ok(text(tree).includes('Assinar o Grana.'));eq(c.rpc.length,before,'conta nova nao consulta resumo');
 ok(nodes(tree).some(n=>n.type==='@/components/BaixarMeusDadosBotao'));ok(text(tree).includes('Excluir conta e dados'));ok(text(tree).includes('Sair da conta'));
 const late=criarTela();late.render();const a=late.pendentes.shift();late.userId='conta-B';late.render();a({data:{lancamentos:987,contas:1,cartoes:1,metas:1},error:null});await late.flush();ok(!text(late.render()).includes('987'),'resposta tardia da conta anterior ignorada');
 console.log(JSON.stringify({suite:'assinar-vencida',checks}));
}
module.exports={criarTela,nodes,text};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
