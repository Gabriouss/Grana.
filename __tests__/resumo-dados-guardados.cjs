 'use strict';
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let retorno={data:{lancamentos:18,contas:3,cartoes:1,metas:0},error:null},calls=[],warnings=[];
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/resumo-dados-guardados.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require(id){assert.equal(id,'./supabase');return {supabase:{rpc:async(...a)=>{calls.push(a);if(retorno instanceof Error)throw retorno;return retorno;}}};},console:{warn:(...a)=>warnings.push(a)},Number,Object,Array});
(async()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(await m.exports.obterResumoDadosGuardados())),retorno.data);
 assert.deepEqual(calls,[['resumo_dados_guardados']],'RPC sem argumentos/sem escolher outra conta');
 let checks=2;
 for(const r of [{data:null,error:{code:'PGRST202'}},{data:null,error:{code:'42501'}},new Error('offline'),
  ...[null,[],{}, {lancamentos:1,contas:0,cartoes:0}, {lancamentos:-1,contas:0,cartoes:0,metas:0}, {lancamentos:'18',contas:0,cartoes:0,metas:0},
   {lancamentos:18,contas:0,cartoes:0,metas:Number.MAX_SAFE_INTEGER+1}, {lancamentos:18,contas:0,cartoes:0,metas:0,email:'nao permitido'}].map(data=>({data,error:null}))]){
  retorno=r;const before=warnings.length;assert.equal(await m.exports.obterResumoDadosGuardados(),null);assert.equal(warnings.length,before+1,'sempre deixa warn');checks+=2;
 }
 retorno={data:{lancamentos:0,contas:0,cartoes:0,metas:0},error:null};assert.deepEqual(JSON.parse(JSON.stringify(await m.exports.obterResumoDadosGuardados())),retorno.data);checks++;
 console.log(JSON.stringify({suite:'resumo-dados-guardados',checks,rpc:calls.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
