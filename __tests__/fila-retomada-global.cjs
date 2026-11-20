// Item 35 (20/11/2026): fila manual persistida volta a subir depois de reiniciar
// fora de Lançamentos. Raiz real (`RootNavigator`) + `offline-cache` e
// `fila-pendente` reais; disco, relógio, AppState, sessão e envio dublados.
const assert=require('node:assert/strict');
const {ambiente,flush}=require('./helpers/providers-controlados.cjs');
const casos=[];const caso=(n,fn)=>casos.push([n,fn]);
const acesso=allowed=>({allowed});
const item=(dono,chave)=>({localId:'local-'+chave,userId:dono,tipo:'transacao',clientRequestId:chave,criadoEm:'2026-11-20T10:00:00Z',
  input:{type:'out',description:'AUDIT',amount:10,category:'Outros',color:'#fff',occurred_on:'2026-11-20'}});

function cenario({dono='A',fila=[],enviar}={}){
  const disco=new Map();if(fila.length)disco.set('grana:queue:transactions-pendentes',JSON.stringify(fila));
  const estado={dono,ouvintes:[],envios:[],avisos:0,sessao:{user:{id:dono}},isLoading:false,emRecuperacao:false,erroInicializacao:null,allowed:true};
  const rede=new Error('Network request failed');
  estado.enviar=enviar??(async()=>{throw rede;});
  const Stack=()=>{};Stack.Protected='Protected';Stack.Screen='Screen';
  const mocks={
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async k=>disco.get(k)??null,setItem:async(k,v)=>{disco.set(k,v);},removeItem:async k=>{disco.delete(k);},multiRemove:async ks=>ks.forEach(k=>disco.delete(k)),getAllKeys:async()=>[...disco.keys()]}},
    './sessao-offline':{idDoUsuarioLocal:async()=>estado.dono},
    './data':{addTransaction:async(input,d)=>{estado.envios.push({chave:input.client_request_id,dono:d,sessao:estado.dono});return estado.enviar(input,d);},addBill:async()=>{throw Error('fora do caso');},addInstallmentPurchase:async()=>{throw Error('fora do caso');}},
    './goals':{createGoal:async()=>{throw Error('fora do caso');},metaJaGravada:async()=>false},
    './cache-de-tela':{avisarDadoNovo:()=>{estado.avisos++;},guardarTela:async()=>{},lerTela:async()=>null,lancamentoGravado:()=>false,isLikelyNetworkError:e=>e===rede},
    './lancamentos-alterados':{marcarLancamentosAlterados(){}},
    '@/lib/data':{fetchDiasDeAtividade:async()=>[],fetchTransactions:async()=>[]},
    'expo-router':{Stack,usePathname:()=>'/inicio',useRouter:()=>({replace(){}})},'expo-router/head':'Head','expo-status-bar':{StatusBar:'StatusBar'},
    'expo-font':{useFonts:()=>[true,null]},'expo-splash-screen':{preventAutoHideAsync:async()=>{},hideAsync:async()=>{}},'expo-system-ui':{setBackgroundColorAsync:async()=>{}},
    'react-native':{Platform:{OS:'ios'},AppState:{currentState:null,addEventListener:(_,fn)=>{estado.ouvintes.push(fn);return{remove(){estado.ouvintes=estado.ouvintes.filter(f=>f!==fn);}};}},StyleSheet:{create:s=>s},Text:'Text',View:'View',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator'},
    'react-native-safe-area-context':{SafeAreaProvider:'SafeArea'},
    '@/lib/auth-context':{SessionProvider:'SessionProvider',useSession:()=>({session:estado.sessao,isLoading:estado.isLoading,emRecuperacao:estado.emRecuperacao,erroInicializacao:estado.erroInicializacao,recarregarSessao:async()=>{}})},
    '@/lib/privacy-context':{PrivacyProvider:'PrivacyProvider'},'@/lib/widget-privacy-context':{WidgetPrivacyProvider:'WidgetPrivacyProvider'},'@/lib/demo-context':{DemoProvider:'DemoProvider'},'@/lib/feature-flags':{FlagsProvider:'FlagsProvider'},
    '@/lib/theme':{theme:{paper:'#052229',ink:'#fff'},fonts:{},spacing:{},radius:{},type:{},lh:v=>v},'@/lib/foco-web':{instalarDocumentoWeb(){},instalarAnelDeFoco(){}},'@/lib/modal-accessibility':{acompanharFocoParaModais(){}},
    '@/lib/destino-pos-login':{capturarDestinoProtegido:()=>false,consumirDestinoPosLogin:()=>null,ehRotaDeAdmin:()=>false,restaurarDestino:()=>null},
    '@/lib/entitlement-context':{EntitlementProvider:'EntitlementProvider',useEntitlement:()=>({estado:acesso(estado.allowed)})},
    '@/lib/faixa-topo':{FaixaTopoProvider:'FaixaTopoProvider'},'@/lib/app-lock-context':{AppLockProvider:'AppLockProvider'},'@/lib/screen-capture-context':{ScreenCaptureProvider:'ScreenCaptureProvider'},'@/lib/canal':{ehCanalPlay:()=>true},
    '@/lib/notifications':{carregarNotifPrefs:async()=>({lembreteDiarioAtivo:false})},'@/lib/push-notifications':{sincronizarPushHabito:async()=>'registrado',observarTrocaDeTokenPush:()=>null},'@/lib/contexto-lembrete':{},
    '../assets/fonts/NeueMachina-Light.otf':1,'../assets/fonts/NeueMachina-Regular.otf':2,
  };
  for(const n of ['WebPhoneFrame','AppLockGate','AppPressable','AlertaHost','UpdateBanner','NovidadesModal','AvisoFlagModal','ConviteAppAndroid','RespostaVozWidget','VozesSalvasLocalmente','SincronizadorWidgetsHome'])mocks['@/components/'+n]=n;
  const a=ambiente(mocks);
  mocks['@/lib/entitlement-cache']=a.load('lib/entitlement-cache.ts');
  mocks['@/lib/offline-cache']=a.load('lib/offline-cache.ts');
  const filaNoDisco=()=>JSON.parse(disco.get('grana:queue:transactions-pendentes')??'[]');
  const primeiroPlano=async()=>{for(const f of [...estado.ouvintes])f('active');await flush();};
  // RED: RAIZ_ARQUIVO aponta a cópia da base guardada fora do clone.
  return {a,estado,filaNoDisco,primeiroPlano,raiz:()=>a.mount(a.load(process.env.RAIZ_ARQUIVO||'app/_layout.tsx').RootNavigator)};
}

caso('reinício fora de Lançamentos: fila de A sobe uma vez com a chave do disco quando a rede volta',async()=>{
  const c=cenario({fila:[item('A','chave-disco')]});
  const p=c.raiz();p.render();await flush();
  // RED esperado sem o gatilho da raiz: nenhuma chamada.
  assert.equal(c.estado.envios.length,1,'a raiz não disparou a fila persistida');
  assert.equal(c.filaNoDisco().length,1);
  c.estado.enviar=async()=>({id:'real'});
  await c.a.advance(16*60_000);// teto da espera progressiva
  assert.deepEqual(c.estado.envios.map(e=>[e.chave,e.dono]),[['chave-disco','A'],['chave-disco','A']]);
  assert.equal(c.filaNoDisco().length,0);assert.ok(c.estado.avisos>=1,'tela aberta não foi avisada');
  await c.primeiroPlano();await c.a.advance(16*60_000);
  assert.equal(c.estado.envios.length,2,'fila vazia não pode gerar envio');p.unmount();
});

caso('primeiro plano repetido com envio retido: uma rodada só',async()=>{
  let soltar;const c=cenario({fila:[item('A','k1')],enviar:()=>new Promise(r=>{soltar=r;})});
  const p=c.raiz();p.render();await flush();
  for(let i=0;i<5;i++)await c.primeiroPlano();
  assert.equal(c.estado.envios.length,1);soltar({id:'real'});await flush();
  assert.equal(c.filaNoDisco().length,0);assert.equal(c.estado.envios.length,1);p.unmount();
});

caso('sessão carregando, em recuperação, com erro ou acesso bloqueado: nada sobe',async()=>{
  for(const ajuste of [{isLoading:true},{emRecuperacao:true},{erroInicializacao:'x'},{allowed:false},{sessao:null}]){
    const c=cenario({fila:[item('A','k')]});Object.assign(c.estado,ajuste);
    const p=c.raiz();p.render();await flush();await c.primeiroPlano();await c.a.advance(60_000);
    assert.equal(c.estado.envios.length,0,JSON.stringify(ajuste));p.unmount();
  }
});

caso('desmontagem: volta ao primeiro plano depois não dispara',async()=>{
  const c=cenario({fila:[item('A','k')]});c.estado.isLoading=true;
  const p=c.raiz();p.render();await flush();p.unmount();c.estado.isLoading=false;
  await c.primeiroPlano();assert.equal(c.estado.envios.length,0);
});

caso('troca A→B: B nunca envia item de A e a fila legítima de B ainda sobe',async()=>{
  let soltar;const c=cenario({fila:[item('A','de-A'),item('B','de-B')],enviar:()=>new Promise(r=>{soltar=r;})});
  const p=c.raiz();p.render();await flush();
  assert.deepEqual(c.estado.envios.map(e=>e.chave),['de-A']);
  // A sai e B entra enquanto a rodada de A está presa.
  c.estado.dono='B';c.estado.sessao={user:{id:'B'}};p.render();await flush();
  soltar({id:'real'});await flush();
  c.estado.enviar=async()=>({id:'real'});await c.a.advance(16*60_000);
  assert.ok(c.estado.envios.every(e=>e.chave!=='de-A'||e.dono==='A'),'item de A enviado como B');
  assert.ok(c.estado.envios.some(e=>e.chave==='de-B'&&e.dono==='B'),'fila de B não foi retomada');
  assert.deepEqual(c.filaNoDisco().map(i=>i.localId),[],'sobrou item na fila');p.unmount();
});

const rejeicoes=[];process.on('unhandledRejection',e=>rejeicoes.push(e));
const watchdog=setTimeout(()=>{console.error('FALHA: suíte não concluiu');process.exit(1);},45000);
(async()=>{let f=0;for(const[n,fn]of casos){try{await fn();console.log('OK '+n);}catch(e){f++;console.error('FALHA '+n+': '+e.stack);}}await new Promise(r=>setImmediate(r));if(rejeicoes.length){f++;console.error(rejeicoes);}clearTimeout(watchdog);console.log(`${casos.length-f}/${casos.length} casos`);process.exitCode=f?1:0;})();
