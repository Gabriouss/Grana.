const assert=require('node:assert/strict');
const {ambiente,flush,pendente}=require('./helpers/providers-controlados.cjs');
const session=id=>({access_token:'a',refresh_token:'r',user:{id},expires_at:1794400000});
const acesso=allowed=>({enforced:true,active:allowed,allowed,status:allowed?'active':'canceled',access_until:'2099-01-01T00:00:00Z',grace_until:null});
const casos=[];const caso=(nome,fn)=>casos.push([nome,fn]);
function authEnv(options={}){
  let listener;const disco=options.disco??{getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}};
  const saida=pendente(),update=pendente();let saidas=0;
  const auth={getSession:options.getSession??(async()=>({data:{session:null},error:null})),onAuthStateChange:fn=>{listener=fn;return{data:{subscription:{unsubscribe(){}}}};},updateUser:()=>update.promise};
  let geracaoSaida=0;
  const iniciarSaidaLocal=sessao=>{
    const origem=++geracaoSaida;
    return {
      atual:()=>origem===geracaoSaida,
      confirmar:async()=>{},
      servidor:async()=>{if(sessao)await saida.promise;},
      limpar:async()=>{await disco.removeItem?.('sessao');},
    };
  };
  const a=ambiente({'react-native':{Platform:{OS:'web'}},'./alerta':{},'expo-linking':{},'./supabase':{supabase:{auth},armazenamentoSessao:disco,CHAVE_SESSAO:'sessao',iniciarSaidaLocal},
    './auth-errors':{traduzirErroAuth:e=>e},'./assinatura':{vincularAssinaturasPendentes:async()=>({houveFalha:false})},'./push-notifications':{},
    './entitlement-cache':{},'./cache-de-tela':{},'./offline-cache':{},'./widgets-home-sync':{},'./data':{limparDiasComRegistro(){}},
    './sair-da-conta':{sairDaConta:async etapas=>{saidas++;await saida.promise;etapas.aplicarSaida();}},'./modo-teste':{MODO_TESTE:false}, ...options.modulos});
  const p=a.mount(a.load('lib/auth-context.tsx').SessionProvider);
  return {...a,valor:()=>p.render().props.value,emit:(e,s)=>listener(e,s),p,saida,update,saidas:()=>saidas};
}
caso('sessão: disco A tardio não substitui B nem ressuscita após SIGNED_OUT',async()=>{
  for(const evento of ['SIGNED_IN','SIGNED_OUT']){
    const disco=pendente();const a=authEnv({disco:{getItem:()=>disco.promise}});a.valor();await flush();
    a.emit(evento,evento==='SIGNED_IN'?session('B'):null);await flush();
    disco.resolve(JSON.stringify(session('A')));await flush();
    assert.equal(a.valor().session?.user.id??null,evento==='SIGNED_IN'?'B':null);assert.equal(a.valor().isLoading,false);
    a.p.unmount();
  }
});
caso('sessão: bootstrap e fallback não publicam após desmontar',async()=>{
  const inicial=pendente();const a=authEnv({getSession:()=>inicial.promise});a.valor();a.emit('SIGNED_IN',session('B'));await flush();
  inicial.resolve({data:{session:session('A')},error:null});await flush();assert.equal(a.valor().session.user.id,'B');a.p.unmount();
});
caso('recuperação: cancelar mantém guarda e invalida sucesso tardio, sem saída duplicada',async()=>{
  const a=authEnv();a.valor();await flush();a.emit('PASSWORD_RECOVERY',session('A'));await flush();
  assert.equal(a.valor().emRecuperacao,true);
  const salvar=a.valor().definirNovaSenha('senha-audit');const cancelar=a.valor().cancelarRecuperacao();
  void a.valor().cancelarRecuperacao();await flush();
  assert.equal(a.saidas(),1);assert.equal(a.valor().emRecuperacao,true);assert.equal(a.valor().isLoading,true);
  a.update.resolve({error:null});await salvar;assert.equal(a.valor().emRecuperacao,true);
  a.emit('TOKEN_REFRESHED',session('A'));assert.equal(a.valor().emRecuperacao,true);
  a.saida.resolve();await cancelar;assert.equal(a.valor().session,null);assert.equal(a.valor().emRecuperacao,false);a.p.unmount();
});
function entitlementEnv(options={}){
  const c={userId:'A',notifs:[],rpc:[],writes:[],disco:new Map()};
  const store={getItem:options.getItem??(async k=>c.disco.get(k)??null),setItem:options.setItem??(async(k,v)=>{c.writes.push(JSON.parse(v).userId);c.disco.set(k,v);})};
  const a=ambiente({'./auth-context':{useSession:()=>({session:c.userId?session(c.userId):null,isLoading:false,sessaoNaoConfirmada:false})},
    './assinatura':{vincularAssinaturasPendentes:options.vincular??(async()=>({houveFalha:false}))},'./offline-cache':{isLikelyNetworkError:e=>e?.name==='TypeError'},
    './supabase':{supabase:{auth:{getSession:async()=>({data:{session:c.userId?session(c.userId):null},error:null})},rpc:()=>{const d=pendente();c.rpc.push(d);d.promise.setHeader=()=>d.promise;d.promise.abortSignal=s=>{d.signal=s;return d.promise;};return d.promise;}}},'./modo-teste':{MODO_TESTE:false},
    './notifications':{sincronizarAvisosAssinatura:async(...v)=>c.notifs.push(v)},'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
    './cache-de-tela':{assinarLeituraEsvaziou:()=>()=>{}},'@react-native-async-storage/async-storage':{__esModule:true,default:store}});
  const p=a.mount(a.load('lib/entitlement-context.tsx').EntitlementProvider);
  return {...a,c,p,valor:(effects=true)=>p.render(effects).props.value};
}
caso('acesso: B negado permanece negado após A permitido; cache/avisos também isolados',async()=>{
  const a=entitlementEnv();a.valor();await flush();const old=a.c.rpc[0];
  a.c.userId='B';assert.equal(a.valor(false).estado,null);a.valor();await flush();
  a.c.rpc[1].resolve({data:acesso(false),error:null});await flush();assert.equal(a.valor().estado.allowed,false);
  old.resolve({data:acesso(true),error:null});await flush();assert.equal(a.valor().estado.allowed,false);
  assert.deepEqual(a.c.writes,['B']);assert.equal(a.c.notifs.filter(v=>v.length===2&&v[0]==='A').length,0);a.p.unmount();
});
caso('acesso: primeira pintura da troca esconde concessão anterior e callback velho é inerte',async()=>{
  const a=entitlementEnv();a.valor();await flush();a.c.rpc[0].resolve({data:acesso(true),error:null});await flush();const old=a.valor();
  assert.equal(old.estado.allowed,true);a.c.userId='B';const primeiro=a.valor(false);assert.equal(primeiro.estado,null);assert.equal(primeiro.modoOffline,false);
  await old.recarregar();assert.equal(a.c.rpc.length,1);a.p.unmount();
});
caso('acesso: última geração vence recargas da mesma conta',async()=>{
  const a=entitlementEnv();a.valor();await flush();const antiga=a.c.rpc[0];const nova=a.valor().recarregar();await flush();
  a.c.rpc[1].resolve({data:acesso(false),error:null});await nova;antiga.resolve({data:acesso(true),error:null});await flush();assert.equal(a.valor().estado.allowed,false);a.p.unmount();
});
caso('acesso: voltar a A não reaproveita publicação ou callback do primeiro ciclo A',async()=>{
  const a=entitlementEnv();a.valor();await flush();a.c.rpc[0].resolve({data:acesso(true),error:null});await flush();const old=a.valor();
  a.c.userId='B';a.valor();await flush();a.c.userId='A';assert.equal(a.valor(false).estado,null);await old.recarregar();assert.equal(a.c.rpc.length,2);a.valor();await flush();assert.equal(a.c.rpc.length,3);a.p.unmount();
});
caso('acesso: persistência A em voo termina antes da escrita B, sem avisos antigos',async()=>{
  const gravacao=pendente();let n=0;const dados=new Map();
  const a=entitlementEnv({getItem:async k=>dados.get(k)??null,setItem:async(k,v)=>{if(++n===1)await gravacao.promise;dados.set(k,v);}});
  a.valor();await flush();a.c.rpc[0].resolve({data:acesso(true),error:null});await flush();a.c.userId='B';a.valor();await flush();a.c.rpc[1].resolve({data:acesso(false),error:null});await flush();assert.equal(a.valor().estado.allowed,false);
  gravacao.resolve();await flush();assert.equal(JSON.parse(dados.get('grana:cache:estado-acesso')).userId,'B');assert.equal(a.c.notifs.filter(v=>v.length===2&&v[0]==='A').length,0);a.p.unmount();
});
caso('carteiras: troca limpa seleção/somas; lista, seleção e agregados tardios são descartados',async()=>{
  const c={userId:'A',listas:[],saldos:[],entradas:[],leituras:[]};
  const a=ambiente({'./auth-context':{useSession:()=>({session:session(c.userId),isLoading:false,sessaoNaoConfirmada:false})},'./demo-context':{useDemo:()=>({isDemoMode:false})},'./demo-data':{},
    './wallets':{fetchWallets:()=>{const d=pendente();c.listas.push(d);return d.promise;},calcularSaldosComAgregado:(_,v)=>v,calcularEntradasComAgregado:(_,v)=>v},
    './data':{fetchSaldosPorCarteira:()=>{const d=pendente();c.saldos.push(d);return d.promise;},fetchEntradasPorCarteira:()=>{const d=pendente();c.entradas.push(d);return d.promise;}},
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:()=>{const d=pendente();c.leituras.push(d);return d.promise;},setItem:async()=>{}}}});
  const p=a.mount(a.load('lib/wallet-context.tsx').WalletProvider);const valor=(effects=true)=>p.render(effects).props.value;
  valor();c.listas[0].resolve([{id:'wa',name:'A'}]);await flush();const old=valor();old.setActiveWalletId('wa');
  const saldo=old.refreshSaldos(),entrada=old.refreshEntradas(),lista=old.refreshWallets();
  c.userId='B';const first=valor(false);assert.equal(first.wallets.length,0);assert.equal(first.activeWalletId,'total');assert.equal(first.saldos.total,0);valor();await flush();
  c.listas.at(-1).resolve([{id:'wb',name:'B'}]);c.leituras.at(-1).resolve('wb');await flush();
  c.listas[1].resolve([{id:'wa',name:'A'}]);c.leituras[0].resolve('wa');c.saldos[0].resolve({total:99,porCarteira:{wa:99}});c.entradas[0].resolve({total:88,porCarteira:{wa:88}});
  await Promise.all([saldo,entrada,lista]);const end=valor();assert.equal(end.wallets[0].id,'wb');assert.equal(end.activeWalletId,'wb');assert.equal(end.saldos.total,0);assert.equal(end.entradas.total,0);
  const n=c.listas.length;await old.refreshWallets();assert.equal(c.listas.length,n);
  const atual=valor();const saldoAntigo=atual.refreshSaldos(),saldoNovo=atual.refreshSaldos();c.saldos[2].resolve({total:20,porCarteira:{wb:20}});await saldoNovo;c.saldos[1].resolve({total:10,porCarteira:{wb:10}});await saldoAntigo;assert.equal(valor().saldos.total,20);p.unmount();
});
// Verifica rejeições perdidas e detecta teste que aguardaria promessa sem fim.
module.exports={authEnv,entitlementEnv,session,acesso};
if(require.main===module){
const rejeicoes=[];process.on('unhandledRejection',e=>rejeicoes.push(e));
const watchdog=setTimeout(()=>{console.error('FALHA: suíte não concluiu');process.exit(1);},45000);
(async()=>{let failures=0;for(const[n,fn]of casos){try{await fn();console.log('OK '+n);}catch(e){failures++;console.error('FALHA '+n+': '+e.stack);}}await new Promise(r=>setImmediate(r));if(rejeicoes.length){failures++;console.error(rejeicoes);}clearTimeout(watchdog);console.log(`${casos.length-failures}/${casos.length} grupos`);process.exitCode=failures?1:0;})();
}
