'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),m={exports:{}};
const p={id:'a'.repeat(16),versao:'b'.repeat(40),estado:'para-aprovacao',caminho:'docs/marketing/fixture/para-aprovacao/peca'};
const pedido={pecaId:p.id,versaoAlvo:p.versao,estado:'novo',textoOriginal:'CANARIO_PRIVADO_CATALOGO',criadoEm:'2026-10-09T00:00:00Z',id:'11111111-1111-4111-8111-111111111111',caminho:p.caminho};
const source=process.argv.includes('--antes')?execFileSync('git',['show','HEAD:tools/admin-local/marketing/catalogo.cjs'],{cwd:root,encoding:'utf8'}):fs.readFileSync(root+'/tools/admin-local/marketing/catalogo.cjs','utf8');
let privados=[pedido],legados=[];
vm.runInNewContext(source,{
 module:m,exports:m.exports,Date,Buffer,structuredClone,console,
 require:s=> s==='fs'? {readFileSync:f=>JSON.stringify(String(f).endsWith('aprovacoes.json')?{aprovacoes:[],ajustes:legados}:{planejados:[]})}
  :s==='./ajustes-fila.cjs'?{fila:{listar:()=>privados}}: require(s),
});
const result=m.exports.enriquecer('/fixture',[p]);
assert.ok(!JSON.stringify(result).includes('CANARIO_PRIVADO_CATALOGO'),'texto privado nao pode atravessar enriquecimento usado por GET pecas/feed');
assert.equal(result[0].estadoEfetivo,'ajuste-pedido');assert.equal(result[0].ajuste.pedidoId,pedido.id);assert.equal(result[0].ajuste.motivo,undefined);assert.equal(result[0].ajuste.versao,p.versao);
privados=[];legados=[{id:p.id,versao:p.versao,motivo:'CANARIO_PRIVADO_LEGADO',pedidoEm:'CANARIO_PRIVADO_DATA',extra:{token:'CANARIO_PRIVADO_EXTRA'}}];
const legado=m.exports.enriquecer('/fixture',[p]);assert.ok(!JSON.stringify(legado).includes('CANARIO_'));assert.equal(legado[0].ajuste.pedidoEm,null);assert.equal(legado[0].ajuste.extra,undefined);
console.log('catalogo C: modulo real sem texto privado, zero rede/disco/env real');
