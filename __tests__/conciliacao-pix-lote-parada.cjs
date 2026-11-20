// Item 39 (20/11/2026): primeiro item salvo e próxima RPC retida. Serviço e botão reais;
// Supabase, arquivo, alerta e hooks dublados. Assere QUAIS RPCs saíram e com qual chave.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const watchdog=setTimeout(()=>{console.error('Pix lote: teste não concluiu');process.exit(1);},15000);
const CSV='Data;Descrição;Valor;ID\n05/10/2026;Pix enviado;-2,00;x\n06/10/2026;Pix enviado;-3,00;y\n07/10/2026;Pix enviado;-4,00;z';
const flush=()=>new Promise(r=>setImmediate(r));
// RED: PIX_BASE_DIR aponta cópias da base (lib/ e components/) guardadas fora do clone.
const fonte=rel=>process.env.PIX_BASE_DIR?path.join(process.env.PIX_BASE_DIR,rel):rel;
// Na base o lote não devolve nada enquanto a RPC está presa: o prazo transforma o travamento em falha legível.
const comPrazo=(p,msg)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(Error(msg)),300))]);
function carregar(){
  const c={session:{user:{id:'a'},access_token:'fixture'},rpcs:[],events:0,presas:[]};
  // Cada RPC de confirmação fica na mão do teste: resolver(i) devolve "inserido" para a i-ésima.
  const supabase={auth:{getSession:async()=>({data:{session:c.session},error:null}),getUser:async()=>({data:{user:{id:'a'}},error:null}),
    onAuthStateChange:fn=>{c.listener=fn;return {data:{subscription:{unsubscribe(){}}}};}},
    from(table){const q={select(){return q;},eq(){return q;},order(){return q;},range(){return q;},setHeader(){return Promise.resolve({data:table==='wallets'?[{id:'p',user_id:'a',is_default:true,created_at:'2026-01-01'}]:[],error:null});}};return q;},
    rpc(name,params){return {setHeader(){c.rpcs.push({name,params});if(name==='obter_estado_acesso')return Promise.resolve({data:{allowed:true},error:null});
      let soltar;const p=new Promise(r=>{soltar=r;});c.presas.push(()=>soltar({data:{situacao:'inserido',id:'srv-'+c.presas.length},error:null}));return p;}};}};
  const cache=new Map();function real(f){f=path.resolve(f);if(cache.has(f))return cache.get(f);const api={};cache.set(f,api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {exports:api,Date,Promise,Symbol,console:{warn(){}},require(id){if(id==='expo-crypto')return {CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(alg,s)=>crypto.createHash(alg).update(s).digest('hex')};
        if(id==='./supabase')return {supabase};if(['./lancamentos-alterados','./cache-de-tela','./widgets-home-events'].includes(id))return {marcarLancamentosAlterados:()=>{c.events++;},invalidarRespostasAtrasadas(){},notificarDadosDosWidgetsAlterados(){}};
        if(id.startsWith('.'))return real(path.resolve('lib',id+'.ts'));throw Error('fronteira inesperada '+id);}}, {filename:f});return api;}
  c.api=real(fonte('lib/conciliacao-pix-servico.ts'));
  c.analisar=()=>c.api.analisarExtratoPix({userId:'a',carteiraId:'p',origemConta:'Banco Modelo conta fixture',texto:CSV});
  c.escritas=()=>c.rpcs.filter(x=>x.name==='confirmar_conciliacao_pix');
  return c;
}
const escolha=id=>({id,categoria:'Alimentação',cor:'#1fa98d'});
const casos=[];const caso=(n,fn)=>casos.push([n,fn]);

caso('serviço: recibo do primeiro sai com a segunda RPC presa; parar não repete e preserva a chave',async()=>{
  const c=carregar(),a=await c.analisar(),vistos=[];let parar;const pedido=new Promise(r=>{parar=r;});
  const lote=c.api.confirmarItensPix(a,['0','1','2'].map(escolha),{parar:pedido,aoRecibo:r=>vistos.push(r)});
  await flush();c.presas[0]();await flush();await flush();
  assert.deepEqual(vistos.map(r=>[r.id,r.status]),[['0','salvo']],'recibo do item salvo não chegou durante o lote');
  assert.equal(c.escritas().length,2,'segunda RPC deveria estar em voo');
  parar();const recibos=await comPrazo(lote,'lote preso: parar não devolveu o controle');
  assert.deepEqual(Array.from(recibos,r=>[r.id,r.status]),[['0','salvo'],['1','erro']]);
  assert.match(recibos[1].mensagem,/mesma chave/);
  assert.equal(c.escritas().length,2,'terceiro item não pode sair depois da parada');assert.equal(c.events,1);
  c.presas[1]();await flush();assert.equal(vistos.length,2,'resposta tardia não gera recibo novo');assert.equal(c.escritas().length,2,'nenhuma repetição automática');
  // Nova tentativa manual do incerto: mesma chave, uma RPC só.
  const chave=c.escritas()[1].params.p_item.chave;const de_novo=c.api.confirmarItensPix(a,[escolha('1')]);await flush();c.presas[2]();
  assert.equal((await de_novo)[0].status,'salvo');assert.equal(c.escritas().length,3);assert.equal(c.escritas()[2].params.p_item.chave,chave);
  a.cancelar();
});

caso('serviço: parada pedida no recibo do primeiro não envia os seguintes',async()=>{
  const c=carregar(),a=await c.analisar();let parar;const pedido=new Promise(r=>{parar=r;});
  const lote=c.api.confirmarItensPix(a,['0','1','2'].map(escolha),{parar:pedido,aoRecibo:()=>parar()});
  await flush();c.presas[0]();const recibos=await comPrazo(lote,'lote não terminou');
  assert.deepEqual(Array.from(recibos,r=>r.status),['salvo']);assert.equal(c.escritas().length,1);a.cancelar();
});

function botao(c){const t={slots:[],i:0,effects:[],alerts:[]};
  const imports={react:{useState(init){const i=t.i++;if(!(i in t.slots))t.slots[i]=typeof init==='function'?init():init;return [t.slots[i],v=>{t.slots[i]=typeof v==='function'?v(t.slots[i]):v;}];},useRef(init){const i=t.i++;return t.slots[i]??(t.slots[i]={current:init});},
    useEffect(fn,deps){const i=t.i++,old=t.slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){const next={deps};t.slots[i]=next;t.effects.push(()=>{old?.cleanup?.();next.cleanup=fn();});}}},
    'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},
    'react-native':{ActivityIndicator:'ActivityIndicator',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:x=>x}},
    'expo-router':{useRouter:()=>({push(){}})},'@/lib/auth-context':{useSession:()=>({session:{user:{id:'a'}}})},
    '@/lib/wallet-context':{useWallet:()=>({activeWalletId:'p',wallets:[{id:'p',name:'Principal',user_id:'a',is_default:true,created_at:'2026-01-01'}]})},
    '@/lib/demo-context':{useDemo:()=>({isDemoMode:false})},'@/lib/alerta':{Alert:{alert:(...x)=>t.alerts.push(x)}},'@/lib/erros':{mensagemErro:e=>e.message},
    '@/lib/escolher-arquivo':{escolherArquivoDeExtrato:async()=>({texto:CSV})},'@/lib/conciliacao-pix-servico':c.api,
    '@/lib/format':{formatDateLabel:x=>x,formatMoney:x=>String(x)},'@/lib/theme':{fonts:{},radius:{},spacing:{},theme:{},type:{},lh:()=>20}};
  for(const name of ['AppModal','Sheet','AppPressable','CategoryPickerModal'])imports['./'+name]={__esModule:true,default:name};
  const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(fonte('components/ConciliarPixBotao.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,
    {exports:api,Date,Promise,console:{warn(){}},require:id=>{if(!(id in imports))throw Error(id);return imports[id];}});
  t.render=()=>{t.i=0;const tree=api.default();for(const fn of t.effects.splice(0))fn();return tree;};return t;}
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const textos=t=>nodes(t).flatMap(n=>{const ch=n.props?.children;return typeof ch==='string'?[ch]:Array.isArray(ch)?ch.filter(x=>typeof x==='string'||typeof x==='number').map(String):[];});

caso('botão real: confirmado aparece durante o lote preso e "Parar o lote" devolve a saída',async()=>{
  const c=carregar(),t=botao(c);const find=l=>nodes(t.render()).find(n=>n.props?.accessibilityLabel===l);
  find('Conferir Pix pelo extrato').props.onPress();find('Banco e apelido desta conta').props.onChangeText('Banco fixture');await find('Escolher extrato').props.onPress();
  // Categoria escolhida pela própria tela: o teste não depende do palpite do heurístico.
  for(const n of ['1','2']){find('Categoria do item '+n).props.onPress();nodes(t.render()).find(x=>x.type==='CategoryPickerModal').props.onSelectCategory({name:'Alimentação',color:'#1fa98d'});}
  find('Selecionar item 1').props.onPress();find('Selecionar item 2').props.onPress();find('Confirmar selecionados').props.onPress();
  t.alerts.at(-1)[2].find(b=>b.text==='Confirmar').onPress();await flush();
  assert.equal(typeof c.presas[0],'function','nenhuma RPC saiu; último alerta: '+JSON.stringify(t.alerts.at(-1)?.slice(0,2)));
  c.presas[0]();await flush();await flush();
  const meio=t.render();
  assert.ok(textos(meio).includes('Lançamento confirmado.'),'recibo do item salvo não aparece com a próxima RPC presa');
  const parar=nodes(meio).find(n=>n.props?.accessibilityLabel==='Parar o lote');assert.ok(parar,'sem saída durante o lote');
  assert.equal(c.escritas().length,2);parar.props.onPress();await flush();await flush();
  assert.equal(t.alerts.at(-1)[0],'Conferência atualizada');assert.match(t.alerts.at(-1)[1],/1 de 2/);
  assert.equal(find('Fechar conferência').props.disabled,false,'Fechar continua bloqueado depois de parar');
  assert.equal(find('Parar o lote'),undefined);assert.equal(c.escritas().length,2,'nenhuma RPC repetida');
});

const rejeicoes=[];process.on('unhandledRejection',e=>rejeicoes.push(e));
(async()=>{let f=0;for(const[n,fn]of casos){try{await fn();console.log('OK '+n);}catch(e){f++;console.error('FALHA '+n+': '+e.stack);}}await flush();if(rejeicoes.length){f++;console.error(rejeicoes);}clearTimeout(watchdog);console.log(`${casos.length-f}/${casos.length} casos`);process.exitCode=f?1:0;})();
