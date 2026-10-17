// A1, rodada 2 de 17/10/2026: modulos reais + SDK real, fetch sem rede.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const {createClient}=require('@supabase/supabase-js');
const root=path.resolve(__dirname,'..');
const estado={usuario:'A',sessao:'A',trocarNoEnvio:false};
const pedidos=[];
const supabase=createClient('https://audit.invalid','AUDIT_PUBLIC',{
  accessToken:async()=>{
    if(estado.trocarNoEnvio)estado.usuario='B';
    return 'AUDIT_B'; // A sessao global ja e B quando o SDK prepara o fetch.
  },
  global:{fetch:async(url,init)=>{
    const headers=new Headers(init.headers);
    const body=init.body?JSON.parse(init.body):null;
    pedidos.push({url:String(url),auth:headers.get('Authorization'),body});
    const rpc=String(url).includes('/rpc/');
    const parcelas=String(url).includes('adicionar_compra_parcelada');
    const row={id:'audit-id',user_id:'A',...(body??{})};
    const repetido=body?.client_request_id==='repetido';
    const consultaRepetido=String(url).includes('client_request_id=eq.repetido');
    const data=rpc?(parcelas?[row]:row):init.method==='GET'?(consultaRepetido?{id:'antigo',user_id:'A'}:[]):repetido?[]:headers.get('Accept')?.includes('object')?row:[row];
    return Response.json(data,{status:200});
  }},
});
const mocks={
  './supabase':{supabase},
  './sessao-offline':{idDoUsuarioLocal:async()=>estado.usuario,
    lerSessaoDoDisco:async()=>estado.sessao?{user:{id:estado.sessao},access_token:'AUDIT_A'}:null},
  './cache-de-tela':{comCacheOffline:(_,fn)=>fn,invalidarRespostasAtrasadas(){},atualizarTelaGuardada:async()=>{}},
  './widgets-home-events':{notificarDadosDosWidgetsAlterados(){}},
  './lancamentos-alterados':{marcarLancamentosAlterados(){}},
  './creditLimitAlert':{checarLimiteCartao:async()=>{}},
  './fila-pendente':{entradasPendentesPorCarteira:async()=>({}),juntarPendentes:async x=>x},
  './voz-pendente-na-lista':{juntarVozPendente:async x=>x},
};
const cache=new Map();
function load(relative){
  const file=path.resolve(root,relative);if(cache.has(file))return cache.get(file).exports;
  const m=new Module(file,module);cache.set(file,m);
  m.require=id=>{
    if(id in mocks)return mocks[id];
    if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id.endsWith('.ts')?id:id+'.ts'));
    throw Error('Import inesperado: '+id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
  return m.exports;
}
const data=load('lib/data.ts');const goals=load('lib/goals.ts');
const entrada={type:'out',description:'AUDIT',amount:10,category:'Outros',color:'#fff',occurred_on:'2026-10-17'};
(async()=>{
  const acoes=[
    ()=>data.addTransaction(entrada,'A'),
    ()=>data.addBill({...entrada,due_date:'2026-10-17'},'A'),
    ()=>data.addTransaction({...entrada,client_request_id:'primeiro'},'A'),
    ()=>data.addTransaction({...entrada,client_request_id:'repetido'},'A'),
    ()=>data.addInstallmentPurchase({...entrada,totalAmount:10,installments:2},'A'),
    ()=>goals.createGoal({title:'AUDIT',target_amount:100,color:'#fff',icon:'flag'},'A'),
    ()=>goals.metaJaGravada({title:'AUDIT',target_amount:100,color:'#fff',icon:'flag'},'2026-10-17T00:00:00Z','A'),
  ];
  for(const acao of acoes){
    estado.usuario='A';estado.sessao='A';estado.trocarNoEnvio=true;
    const antes=pedidos.length;await acao();
    assert.equal(estado.usuario,'B','SDK mudou a sessao antes do fetch real');
    assert.ok(pedidos.length>antes);
    for(const p of pedidos.slice(antes)){
      assert.equal(p.auth,'Bearer AUDIT_A','nenhum pedido financeiro usa Bearer B');
      if(p.body?.user_id)assert.equal(p.body.user_id,'A');
    }
    const n=pedidos.length;
    await assert.rejects(acao(),/conta mudou/);
    assert.equal(pedidos.length,n,'conta B nao envia operacao de A');
  }
  estado.usuario='A';estado.sessao=null;
  await assert.rejects(data.addTransaction(entrada,'A'));
  console.log('fila-gravacao-conta: 7 casos reais fixam dono/Bearer A mesmo com SDK em B; inclui upsert e leitura idempotente');
})().catch(e=>{console.error(e);process.exitCode=1});
