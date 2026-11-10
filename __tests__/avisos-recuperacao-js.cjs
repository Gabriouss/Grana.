// Ponte TypeScript real; só Expo/native e relógio são fronteiras substituídas.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const file=path.join(__dirname,'../modules/grana-avisos/index.ts');
let chamadas=0,evento,removido=false,estado={acesso:true,aceite:true,conectado:false,recuperando:true,falhaConexao:null,ultimoSinal:0,desconectadoEm:0,ultimaFalha:null};
const logs=[];
function carregar(native,os='android'){
 const m={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,require:(id)=>{assert.equal(id,'expo-modules-core');return {Platform:{OS:os},requireOptionalNativeModule:()=>native};},console:{error:(...args)=>logs.push(args)}});return m.exports;
}
const native={estado:()=>JSON.stringify(estado),recuperarConexao:()=>{chamadas++;return JSON.stringify(estado);},addListener:(nome,fn)=>{assert.equal(nome,'estadoAlterado');evento=fn;return {remove(){removido=true;}};}};
const ponte=carregar(native);
assert.equal(typeof ponte.recuperarConexaoAvisos,'function','a ponte oferece recuperação explícita ao Atualizar estado');
assert.equal(ponte.recuperarConexaoAvisos().recuperando,true);assert.equal(chamadas,1);
let recebido;const parar=ponte.observarEstadoAvisos(e=>recebido=e);
estado={...estado,conectado:true,recuperando:false};evento();assert.equal(recebido.conectado,true);assert.equal(chamadas,1,'evento só consulta estado, não cria loop de rebind');
estado={...estado,conectado:false,falhaConexao:'ConexaoSemResposta'};evento();assert.equal(recebido.falhaConexao,'ConexaoSemResposta');
parar();assert.ok(removido);
let falhou=false;ponte.observarEstadoAvisos(()=>{},()=>{falhou=true;});native.estado=()=>{throw Error('fixture');};evento();assert.ok(falhou,'erro do evento deixa recibo na interface');
assert.equal(logs.length,1);assert.ok(!JSON.stringify(logs).includes('fixture'),'log não inclui mensagem arbitrária do erro');
const ausente=carregar(null);assert.equal(ausente.recuperarConexaoAvisos().conectado,false);ausente.observarEstadoAvisos(()=>{})();
assert.equal(carregar(native,'web').avisosDisponivel,false);
console.log('avisos-recuperacao-js: ponte real, estado vivo/erro, sem loop e limpeza OK');
