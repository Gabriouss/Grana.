const assert=require('node:assert/strict');
const {ambiente,flush,pendente}=require('./helpers/providers-controlados.cjs');
const {authEnv,entitlementEnv,session,acesso}=require('./providers-isolamento.cjs');
const casos=[];const caso=(n,fn)=>casos.push([n,fn]);
const nodes=(n,p,out=[])=>{if(!n||typeof n!=='object')return out;if(Array.isArray(n)){n.forEach(v=>nodes(v,p,out));return out;}if(p(n))out.push(n);nodes(n.props?.children,p,out);return out;};
const text=n=>n==null||n===false?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(' '):text(n.props?.children);
function layoutEnv(options={}){
  const c={fonts:[false,null],splash:[],protegidos:0};
  const tema={theme:{paper:'#052229',ink:'#fff'},fonts:{},spacing:{},radius:{},type:{},lh:v=>v};
  const Stack=()=>{};Stack.Protected='Protected';Stack.Screen='Screen';
  const mocks={
    '@/lib/data':{},'expo-router':{Stack,usePathname:()=>'/sign-in',useRouter:()=>({replace(){}})},'expo-router/head':'Head','expo-status-bar':{StatusBar:'StatusBar'},
    'expo-font':{useFonts:()=>c.fonts},'expo-splash-screen':{preventAutoHideAsync:async()=>{},hideAsync:async()=>c.splash.push('hide')},'expo-system-ui':{setBackgroundColorAsync:async()=>{}},
    'react-native':{Platform:{OS:options.android?'android':'web'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},StyleSheet:{create:s=>s},Text:'Text',View:'View',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator'},
    'react-native-safe-area-context':{SafeAreaProvider:'SafeArea'},'@/lib/auth-context':{SessionProvider:'SessionProvider',useSession:options.auth??(()=>({session:null,isLoading:false,emRecuperacao:false}))},
    '@/lib/privacy-context':{PrivacyProvider:'PrivacyProvider'},'@/lib/widget-privacy-context':{WidgetPrivacyProvider:'WidgetPrivacyProvider'},'@/lib/demo-context':{DemoProvider:'DemoProvider'},'@/lib/feature-flags':{FlagsProvider:'FlagsProvider'},
    '@/lib/theme':tema,'@/lib/foco-web':{instalarDocumentoWeb(){},instalarAnelDeFoco(){}},'@/lib/modal-accessibility':{acompanharFocoParaModais(){}},
    '@/lib/destino-pos-login':{capturarDestinoProtegido:()=>false,ehRotaDeAdmin:()=>false,restaurarDestino:()=>null},
    '@/lib/entitlement-context':{EntitlementProvider:'EntitlementProvider',useEntitlement:options.entitlement??(()=>({estado:null}))},
    '@/lib/faixa-topo':{FaixaTopoProvider:'FaixaTopoProvider'},'@/lib/app-lock-context':{AppLockProvider:'AppLockProvider'},'@/lib/screen-capture-context':{ScreenCaptureProvider:'ScreenCaptureProvider'},'@/lib/canal':{ehCanalPlay:()=>true},
    '@/lib/notifications':{carregarNotifPrefs:async()=>{c.protegidos++;return{lembreteDiarioAtivo:false};}},'@/lib/push-notifications':{sincronizarPushHabito:async()=> 'registrado',observarTrocaDeTokenPush:()=>null},'@/lib/contexto-lembrete':{},
    './supabase':{supabase:{auth:{getSession:async()=>({data:{session:options.auth?.().session??null},error:null})}},CHAVE_SESSAO:'sessao'},
    '@react-native-async-storage/async-storage':{__esModule:true,default:{}},
    '../assets/fonts/NeueMachina-Light.otf':1,'../assets/fonts/NeueMachina-Regular.otf':2,
  };
  for(const name of ['WebPhoneFrame','AppLockGate','AppPressable','AlertaHost','UpdateBanner','NovidadesModal','AvisoFlagModal','ConviteAppAndroid','RespostaVozWidget','VozesSalvasLocalmente','SincronizadorWidgetsHome'])mocks['@/components/'+name]=name;
  const a=ambiente(mocks);mocks['@/lib/entitlement-cache']=a.load('lib/entitlement-cache.ts');
  // O cache importado só fornece a guarda pura neste ambiente.
  return {...a,c,mod:a.load('app/_layout.tsx'),receipt:n=>typeof n.type==='function'?a.mount(n.type,n.props).render():n};
}
caso('fontes: erro encerra splash e oferece botão legível sem montar providers',async()=>{
  const a=layoutEnv();a.c.fonts=[false,new Error('fonte indisponível')];let retry=0;
  const p=a.mount(a.mod.PrepararAbertura??a.mod.default,{tentarNovamente:()=>retry++});const n=a.receipt(p.render());await flush();
  assert.equal(a.c.splash.length,1);assert.match(text(n),/Tentar novamente/);assert.equal(nodes(n,v=>v.type==='SessionProvider').length,0);
  const b=nodes(n,v=>v.props?.accessibilityRole==='button')[0];b.props.onPress();assert.equal(retry,1);
  assert.equal(nodes(n,v=>v.type==='Text').some(v=>v.props.style.fontFamily),false);p.unmount();
});
caso('fontes: pendência tem prazo de 8 s e nova tentativa troca a instância real',async()=>{
  const a=layoutEnv();const p=a.mount(a.mod.PrepararAbertura??a.mod.default,{tentarNovamente(){}});p.render();await a.advance(7_999);
  assert.equal(a.c.splash.length,0);await a.advance(1);const n=a.receipt(p.render());await flush();assert.match(text(n),/Tentar novamente/);assert.equal(a.c.splash.length,1);
  const raiz=a.mount(a.mod.default);const primeira=raiz.render();assert.equal(typeof primeira.props.tentarNovamente,'function');primeira.props.tentarNovamente();assert.notEqual(raiz.render().key,primeira.key);p.unmount();raiz.unmount();
});
caso('fontes: carregamento normal mantém árvore e Neue Machina',async()=>{
  const a=layoutEnv();a.c.fonts=[true,null];const p=a.mount(a.mod.PrepararAbertura??a.mod.default,{tentarNovamente(){}});const n=p.render();await flush();assert.equal(nodes(n,v=>v.type==='SessionProvider').length,1);assert.equal(a.c.splash.length,1);p.unmount();
});
caso('sessão: storage pendurado esgota total e retry recupera; resultado antigo fica inerte',async()=>{
  const old=pendente();let ler=()=>old.promise;const a=authEnv({disco:{getItem:()=>ler()}});a.valor();await flush();await a.advance(10_001);
  assert.equal(a.valor().isLoading,false);assert.ok(a.valor().erroInicializacao);assert.equal(a.valor().session,null);
  ler=async()=>JSON.stringify(session('B'));await a.valor().recarregarSessao();assert.equal(a.valor().session.user.id,'B');assert.equal(a.valor().erroInicializacao,null);assert.equal(a.valor().sessaoNaoConfirmada,true);
  old.resolve(JSON.stringify(session('A')));await flush();assert.equal(a.valor().session.user.id,'B');a.p.unmount();
});
caso('sessão: prazo inclui SDK e disco, data inválida não prende a inicialização',async()=>{
  const a=authEnv({getSession:()=>new Promise(()=>{}),disco:{getItem:()=>new Promise(()=>{})}});a.valor();await a.advance(10_001);assert.equal(a.valor().isLoading,false);assert.ok(a.valor().erroInicializacao);a.p.unmount();
  const b=authEnv({disco:{getItem:async()=>JSON.stringify({...session('A'),expires_at:1e300})}});b.valor();await flush();assert.equal(b.valor().isLoading,false);assert.equal(b.valor().session,null);b.p.unmount();
});
const recoverySession=(owner,id)=>({...session(owner),access_token:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({session_id:id,amr:[{method:'recovery',timestamp:1}]})).toString('base64url')+'.signature'});
caso('recuperação: restart restaura restrição pelo JWT; concluir vale só para a mesma sessão',async()=>{
  const memoria=new Map();const disco={getItem:async k=>memoria.get(k)??null,setItem:async(k,v)=>memoria.set(k,v)};const s=recoverySession('A','sessao-1');
  const make=s=>authEnv({disco,getSession:async()=>({data:{session:s},error:null})});const a=make(s);a.valor();await flush();assert.equal(a.valor().emRecuperacao,true);
  const salvar=a.valor().definirNovaSenha('senha-nova-audit');a.update.resolve({error:null});await salvar;assert.equal(a.valor().emRecuperacao,false);a.p.unmount();
  const b=make(s);b.valor();await flush();assert.equal(b.valor().emRecuperacao,false);b.p.unmount();
  const c=make(recoverySession('A','sessao-2'));c.valor();await flush();assert.equal(c.valor().emRecuperacao,true);c.p.unmount();
});
caso('acesso: cache pendurado é limitado e servidor ainda decide',async()=>{
  const a=entitlementEnv({getItem:()=>new Promise(()=>{})});a.valor();await flush();await a.advance(1_001);assert.equal(a.c.rpc.length,1);a.c.rpc[0].resolve({data:acesso(false),error:null});await flush();assert.equal(a.valor().estado.allowed,false);assert.equal(a.valor().carregando,false);a.p.unmount();
});
caso('acesso: vínculo pendurado termina fechado com recibo e aceita verificação posterior',async()=>{
  let vincular=()=>new Promise(()=>{});const a=entitlementEnv({vincular:()=>vincular()});a.valor();await flush();await a.advance(12_001);
  assert.equal(a.valor().estado.allowed,false);assert.equal(a.valor().carregando,false);assert.equal(a.valor().sincronizacao.atencao,true);assert.equal(a.c.rpc.length,0);
  vincular=async()=>({houveFalha:false});const retry=a.valor().recarregar();await flush();a.c.rpc[0].resolve({data:acesso(true),error:null});await retry;assert.equal(a.valor().estado.allowed,true);a.p.unmount();
});
caso('acesso: RPC pendurada aborta no total; offline só preserva concessão ainda válida',async()=>{
  for(const validade of ['ausente','valida','vencida']){
    const a=entitlementEnv();if(validade!=='ausente')a.c.disco.set('grana:cache:estado-acesso',JSON.stringify({userId:'A',estado:{...acesso(true),access_until:validade==='valida'?'2099-01-01':'2020-01-01'}}));
    a.valor();await flush();await a.advance(12_001);const v=a.valor();assert.equal(v.estado.allowed,validade==='valida');assert.equal(v.carregando,false);assert.equal(a.c.rpc[0].signal.aborted,true);
    a.c.rpc[0].resolve({data:acesso(true),error:null});await flush();assert.equal(a.valor().estado.allowed,validade==='valida');a.p.unmount();
  }
});
caso('raiz real: conta B não herda grupo protegido de A e recuperação não monta efeitos financeiros',async()=>{
  const e=entitlementEnv();e.valor();await flush();e.c.rpc[0].resolve({data:acesso(true),error:null});await flush();
  let rec=false;const a=layoutEnv({android:true,auth:()=>({session:session(e.c.userId),isLoading:false,emRecuperacao:rec}),entitlement:()=>e.valor()});const p=a.mount(a.mod.RootNavigator);
  const guard=(n,name)=>nodes(n,v=>v.type==='Protected'&&v.props.children?.props?.name===name)[0]?.props.guard??false;
  assert.equal(guard(p.render(),'(app)'),true);e.c.userId='B';const troca=p.render();assert.equal(guard(troca,'(app)'),false);await flush();e.c.rpc[1].resolve({data:acesso(false),error:null});await flush();assert.equal(guard(p.render(),'assinar'),true);
  rec=true;a.c.protegidos=0;const r=p.render();await flush();assert.equal(guard(r,'nova-senha'),true);assert.equal(guard(r,'(app)'),false);assert.equal(a.c.protegidos,0);assert.equal(nodes(r,v=>v.type==='SincronizadorWidgetsHome').length,0);p.unmount();e.p.unmount();
});
caso('raiz real: recibo da sessão tem retry; cancelamento não abre grupo autenticado durante limpeza',async()=>{
  const s=authEnv();s.valor();await flush();s.emit('PASSWORD_RECOVERY',session('A'));await flush();
  const a=layoutEnv({auth:()=>s.valor(),entitlement:()=>({estado:acesso(true)})});const p=a.mount(a.mod.RootNavigator);
  const opened=n=>nodes(n,v=>v.type==='Protected'&&v.props.children?.props?.name==='(app)'&&v.props.guard).length;
  assert.equal(opened(p.render()),0);const cancelar=s.valor().cancelarRecuperacao();assert.equal(opened(p.render()),0);s.saida.resolve();await cancelar;assert.equal(opened(p.render()),0);p.unmount();s.p.unmount();
  let retries=0;const b=layoutEnv({auth:()=>({session:null,isLoading:false,emRecuperacao:false,erroInicializacao:'Sessão indisponível',recarregarSessao:async()=>retries++})});const q=b.mount(b.mod.RootNavigator);const n=b.receipt(q.render());assert.match(text(n),/Sessão indisponível/);nodes(n,v=>v.props?.accessibilityRole==='button')[0].props.onPress();assert.equal(retries,1);q.unmount();
});
caso('tela real de nova senha: Cancelar é único e checagem anterior não envia senha após sair',async()=>{
  const breach=pendente(),saida=pendente();let cancelamentos=0,gravacoes=0;
  const a=ambiente({'react-native':{Platform:{OS:'web'},StyleSheet:{create:s=>s},Text:'Text',View:'View',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView'},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'@/lib/auth-context':{useSession:()=>({definirNovaSenha:async()=>{gravacoes++;return{error:null};},cancelarRecuperacao:async()=>{cancelamentos++;await saida.promise;}})},
    '@/lib/breakpoints':{},'@/lib/theme':{theme:{},spacing:{},radius:{},type:{},fonts:{},lh:v=>v},'@/lib/limits':{LIMITS:{password:72},validatePassword:()=>null},
    '@/lib/pwned':{checarSenhaVazada:()=>breach.promise},'@/components/AppPressable':'Button','@/components/PasswordInput':'PasswordInput','@/components/BrandLogotype':'BrandLogotype'});
  const p=a.mount(a.load('app/nova-senha.tsx').default);let n=p.render();for(const input of nodes(n,v=>v.type==='PasswordInput'))input.props.onChangeText('senha-audit-nova');n=p.render();
  const salvar=nodes(n,v=>v.type==='Button'&&text(v)==='Salvar senha')[0].props.onPress();
  const cancelar=nodes(n,v=>v.type==='Button'&&text(v)==='Cancelar e sair')[0].props.onPress;const primeiro=cancelar(),segundo=cancelar();await flush();assert.equal(cancelamentos,1);assert.match(text(p.render()),/Saindo/);
  saida.resolve();await Promise.all([primeiro,segundo]);breach.resolve({status:'segura'});await salvar;assert.equal(gravacoes,0);p.unmount();
});
const rejeicoes=[];process.on('unhandledRejection',e=>rejeicoes.push(e));
const watchdog=setTimeout(()=>{console.error('FALHA: suíte de boot não concluiu');process.exit(1);},45000);
(async()=>{let failures=0;for(const[n,fn]of casos){try{await fn();console.log('OK '+n);}catch(e){failures++;console.error('FALHA '+n+': '+e.stack);}}await new Promise(r=>setImmediate(r));if(rejeicoes.length){failures++;console.error(rejeicoes);}clearTimeout(watchdog);console.log(`${casos.length-failures}/${casos.length} grupos`);process.exitCode=failures?1:0;})();
