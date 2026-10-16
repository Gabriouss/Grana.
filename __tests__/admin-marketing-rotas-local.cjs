'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const { criarBackend } = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
const backend = criarBackend({configuracao:{ler:()=>null},rede:()=>assert.fail('rede real proibida')});
let sessao = null, csrf = false, chamadas = 0, verificacoesCsrf = 0, provas = 0;
const eq = (a,b) => {assert.deepEqual(a,b);provas++;};
const seg = { checarApi:()=>null, dentroDoLimite:()=>true, sessaoDe:()=>sessao,
  checarCabecalhos:(_req,op)=>{eq(op.exigeCsrf,true);eq(op.exigeOrigem,true);verificacoesCsrf++;return csrf?null:{status:403,codigo:'csrf',mensagem:'CSRF recusado'};} };
const exportsRotas = {exports:{}};
vm.runInNewContext(fs.readFileSync('tools/admin-local/rotas.cjs','utf8'), {
  module:exportsRotas, exports:exportsRotas.exports, Buffer, console, Date, URL, Set, Map,
  __dirname:require('node:path').resolve('tools/admin-local'),
  require:nome=>{
    nome=nome.replace(/\\/g,'/');
    if (nome==='path') return require('node:path');
    if (nome==='./config.cjs') return {RAIZ_DADOS:'.',SIMULAR:false,ocultar:String};
    if (nome==='./seguranca.cjs') return seg;
    if (nome==='./autenticacao.cjs') return {situacaoConta:()=>({estado:'ok',geracao:1})};
    if (nome==='./auditoria.cjs') return {registrar(){}};
    if (nome==='./adaptadores/meta-leitura.cjs') return {ler:p=>{chamadas++;return backend.meta(p);}};
    if (nome.endsWith('marketing/publicacoes-simulacao.cjs')) return {
      listar:()=>{chamadas++;return backend.simulacao({recurso:'publicacoes-simulacao',modo:'simulacao',acao:'listar'});},
      executar:(_,p)=>{chamadas++;return backend.simulacao(p);},
    };
    throw new Error('require inesperado: '+nome);
  },
});
async function pedir(rota,method='GET',body) {
  const req = Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
  req.headers={'x-grana-admin':'1'};req.method=method;
  const res={headersSent:false,statusCode:200,setHeader(){},writeHead(status){this.statusCode=status;this.headersSent=true;},end(text){this.body=JSON.parse(text);}};
  await exportsRotas.exports.tratarApi(req,res,new URL('http://127.0.0.1:4317'+rota));
  return res;
}
(async()=>{
  const rota='/api/marketing/publicacoes-simulacao';
  const p={recurso:'publicacoes-simulacao',modo:'simulacao',acao:'consultar',chave:'a'.repeat(64)};
  eq((await pedir(rota)).statusCode,401);eq(chamadas,0);
  sessao={id:'teste',s:{etapa:'totp',geracao:1}};
  eq((await pedir(rota,'POST',p)).statusCode,401);eq(chamadas,0);
  sessao.s.etapa='ok';
  eq((await pedir(rota,'POST',p)).statusCode,403);eq(chamadas,0);
  csrf=true;
  const consulta=await pedir(rota,'POST',p);
  eq(consulta.statusCode,200);eq(consulta.body.dados.status,'indisponivel');eq(chamadas,1);
  eq((await pedir(rota)).body.dados.status,'indisponivel');
  const real=await pedir(rota,'POST',{...p,modo:'real'});
  eq(real.statusCode,400);eq(real.body.erro.codigo,'pedido-invalido');
  const meta=await pedir('/api/marketing/resultados');
  eq(meta.body.dados.meta.estado,'nao-configurado'); // Sem Promise serializada como {}.
  eq(verificacoesCsrf,3);
  console.log(`admin-marketing-rotas-local: ${provas} provas OK`);
})().catch(e=>{console.error(e);process.exitCode=1;});
