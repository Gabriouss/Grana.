const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const watchdog=setTimeout(()=>{console.error('Pix arquivo: teste não concluiu');process.exit(1);},10000);
function carregar(op={}){const conteudo=Buffer.from('Data;Descrição;Valor\n05/10/2026;Pix enviado;-2,00');const c={read:0,deleted:[],picked:[]};const cache=new Map();function real(f){f=path.resolve(f);if(cache.has(f))return cache.get(f);const api={};cache.set(f,api);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,console:{warn(){}},Date,TextDecoder,
    require(id){if(id==='react-native')return {Platform:{OS:'android'}};if(id==='expo-document-picker')return {getDocumentAsync:async opts=>{c.picked.push(opts);return op.cancel?{canceled:true}:{canceled:false,assets:[{name:op.name??'fixture.csv',uri:op.uri??'cache/copied-fixture'}]};}};
      if(id==='expo-file-system/legacy')return {cacheDirectory:'cache/',getInfoAsync:async()=>({exists:true,size:op.large?9999999:conteudo.length}),readAsStringAsync:async()=>{c.read++;if(op.fail)throw Error('private-fixture');return conteudo.toString('base64');},deleteAsync:async uri=>{c.deleted.push(uri);if(op.deleteFail)throw Error('private-fixture');}};
      if(id.startsWith('.'))return real(path.resolve(path.dirname(f),id+'.ts'));throw Error(id);}}, {filename:f});return api;}
  c.run=()=>real('lib/escolher-arquivo.ts').escolherArquivoDeExtrato({limiteBytes:1000,limparCopia:true});return c;}
(async()=>{const c=carregar();assert.match((await c.run()).texto,/Descrição/);assert.equal(c.read,1);assert.deepEqual(c.deleted,['cache/copied-fixture']);assert.equal(c.picked[0].copyToCacheDirectory,true);
  for(const op of [{large:true},{name:'fixture.pdf'},{fail:true},{deleteFail:true}]){const f=carregar(op);await assert.rejects(f.run());assert.equal(f.deleted.length,1);if(op.large||op.name)assert.equal(f.read,0);}
  const original=carregar({uri:'content://original'});await assert.rejects(original.run());assert.equal(original.read,0);assert.equal(original.deleted.length,0,'não apaga original da pessoa');
  const cancel=carregar({cancel:true});assert.equal(await cancel.run(),null);assert.equal(cancel.read,0);assert.equal(cancel.deleted.length,0);
  console.log('Pix arquivo real: tamanho antes de ler, cancelamento, limpeza de cópia em sucesso/erro, falha de limpeza visível e original preservado OK');
})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
