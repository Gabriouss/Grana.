// Ponte TS REAL, apenas o módulo Expo nativo é controlado por promessas.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const fonte=fs.readFileSync(path.join(__dirname,'../modules/grana-avisos/index.ts'),'utf8');
const watchdog=setTimeout(()=>{console.error('FALHA: ponte assincrona pendurada sem conclusao');process.exit(1);},8000);
const js=ts.transpileModule(fonte,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
function pendente(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function ambiente(extra={}){
  const chamadas=[];let dono=null;
  const nativo={
    definirDono:async(id)=>{chamadas.push(['dono',id]);dono=id;},
    garantirListaInicial:async()=>{chamadas.push(['lista']);},
    definirApp:async()=>{chamadas.push(['app']);},
    definirAceite:async()=>{chamadas.push(['aceite']);},
    lerDiario:async()=>{chamadas.push(['ler',dono]);return JSON.stringify({itens:[{id:dono}],ilegiveis:0});},
    apagarDiario:async()=>{chamadas.push(['apagar',dono]);},
    limparTudo:async()=>{chamadas.push(['limpar']);dono=null;},...extra,
  };
  const exports={};vm.runInNewContext(js,{exports,require:id=>{assert.equal(id,'expo-modules-core');return {Platform:{OS:'android'},requireOptionalNativeModule:()=>nativo};}});
  return {api:exports,nativo,chamadas};
}
(async()=>{
  {
    const d=pendente(),l=pendente();const a=ambiente();
    a.nativo.definirDono=async(id)=>{a.chamadas.push(['dono',id]);await d.promise;};
    a.nativo.garantirListaInicial=async()=>{a.chamadas.push(['lista']);await l.promise;};
    const dono=a.api.definirDonoAvisos('A'),lista=a.api.garantirListaInicialAvisos(['banco']);
    const lendo=a.api.naContaDosAvisos('A',()=>a.api.lerDiarioAvisos());
    await flush();assert.deepEqual(a.chamadas.map(c=>c[0]),['dono']);
    d.resolve();await flush();assert.deepEqual(a.chamadas.map(c=>c[0]),['dono','lista']);
    l.resolve();await Promise.all([dono,lista,lendo]);assert.deepEqual(a.chamadas.map(c=>c[0]),['dono','lista','ler']);
    console.log('OK ponte real serializa dono->lista->leitura sem esperar no chamador JS');
  }
  {
    const a=ambiente();await a.api.definirDonoAvisos('A');
    const fim=pendente();const iniciou=pendente();
    const lendo=a.api.naContaDosAvisos('A',async()=>{const dados=await a.api.lerDiarioAvisos();iniciou.resolve();await fim.promise;return dados;});
    const cancelada=assert.rejects(lendo,/conta_dos_avisos_mudou/);
    await iniciou.promise;
    const b=a.api.definirDonoAvisos('B');
    let chamadasAntigas=0;
    const antigaNaFila=a.api.naContaDosAvisos('A',async()=>{chamadasAntigas++;return a.api.lerDiarioAvisos();});
    const recusada=assert.rejects(antigaNaFila,/dono_dos_avisos_nao_confirmado/);
    await flush();assert.equal(a.chamadas.filter(c=>c[0]==='dono').length,1,'dono B nao troca diario durante caixa A');
    fim.resolve();await cancelada;await b;await recusada;assert.equal(chamadasAntigas,0);
    const nova=await a.api.naContaDosAvisos('B',()=>a.api.lerDiarioAvisos());assert.equal(nova.itens[0].id,'B');
    assert.deepEqual(a.chamadas.filter(c=>c[0]==='ler').map(c=>c[1]),['A','B']);
    console.log('OK leitura A segura troca nativa, descarta resultado vencido e nao consulta B para caixa A');
  }
  {
    const a=ambiente();await a.api.definirDonoAvisos('A');const origem=a.api.sessaoDosAvisos();
    const espera=pendente(),entrou=pendente();
    const lendo=a.api.naContaDosAvisos('A',async()=>{entrou.resolve();await espera.promise;return 'antigo';});
    const recusada=assert.rejects(lendo,/conta_dos_avisos_mudou/);await entrou.promise;
    const b=a.api.definirDonoAvisos('B');const bRecusado=assert.rejects(b,/conta_dos_avisos_mudou/);
    const novoA=a.api.definirDonoAvisos('A');assert.equal(a.api.mesmaSessaoDosAvisos(origem),false);
    espera.resolve();await Promise.all([recusada,bRecusado,novoA]);
    assert.equal(await a.api.naContaDosAvisos('A',async()=>'novo'),'novo');
    assert.deepEqual(a.chamadas.filter(c=>c[0]==='dono').map(c=>c[1]),['A','A']);
    console.log('OK A->B->A invalida geracao antiga, inclusive mutacao B ainda na fila');
  }
  {
    const a=ambiente();await a.api.definirDonoAvisos('A');const aceitando=pendente();
    a.nativo.definirAceite=()=>aceitando.promise;
    const aceite=a.api.definirAceiteAvisos(true),falhou=assert.rejects(aceite,/fixture disco/);
    const app=a.api.definirAppAvisos('banco',true);await flush();assert.equal(a.chamadas.some(c=>c[0]==='app'),false);
    aceitando.reject(Error('fixture disco'));await falhou;await app;
    assert.equal(a.chamadas.filter(c=>c[0]==='app').length,1,'fila segue apos falha, sem ocultar rejeicao do chamador');
    console.log('OK falha nativa assincrona volta ao chamador e nao mata operacoes seguintes');
  }
  {
    const a=ambiente();await a.api.definirDonoAvisos('A');const lendo=pendente();
    a.nativo.lerDiario=()=>lendo.promise;
    const anterior=a.api.lerDiarioAvisos(),falhou=assert.rejects(anterior,/conta_dos_avisos_mudou/);
    const b=a.api.definirDonoAvisos('B');await b;
    lendo.resolve(JSON.stringify({itens:[{id:'A'}],ilegiveis:0}));await falhou;
    console.log('OK diario direto tambem rejeita resposta de dono anterior');
  }
  {
    const a=ambiente();await a.api.definirDonoAvisos('A');const d=pendente();
    a.nativo.definirApp=()=>d.promise;
    const app=a.api.definirAppAvisos('banco',true),appRecusado=assert.rejects(app,/conta_dos_avisos_mudou/);
    const apagar=a.api.apagarDiarioAvisos(),apagarRecusado=assert.rejects(apagar,/conta_dos_avisos_mudou/);
    await flush();const b=a.api.definirDonoAvisos('B');d.resolve();
    await Promise.all([appRecusado,apagarRecusado,b]);assert.equal(a.chamadas.some(c=>c[0]==='apagar'),false);
    console.log('OK apagar pendente de A nao limpa diario de B');
  }
  console.log('6 grupos da ponte assincrona real passaram');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
