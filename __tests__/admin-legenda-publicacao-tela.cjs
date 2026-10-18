const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const modulos = new Map();
function carregar(nome) {
  if (modulos.has(nome)) return modulos.get(nome).exports;
  const m = { exports: {} }; modulos.set(nome, m);
  const fonte = fs.readFileSync(path.join('tools/admin-local/web/telas', nome), 'utf8');
  const js = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports: m.exports, module: m, require: (n) => carregar(n.replace('./', '')), console, Date, setTimeout: () => 0, clearTimeout() {}, localStorage: { getItem() { return null; } } });
  return m.exports;
}
const legenda = carregar('_legenda-publicacao.js');
for (const tipo of ['imagem', 'video', 'carrossel', 'texto']) {
  for (const texto of [undefined, null, '', '  \n\t']) assert.equal(legenda.faltaLegenda({ tipo, legenda: texto, editorial: { copyCanonica: 'Só referência' } }), tipo !== 'texto', 'documento de copy (texto) não exige legenda (18/10)');
  assert.equal(legenda.faltaLegenda({ tipo, legenda: 'Texto real', composicao: { legenda: 'incluida' } }), false);
}
assert.equal(legenda.faltaLegenda({ legenda: 'Texto real', bloqueiosAprovacao: [{ codigo: 'legenda-obrigatoria' }] }), true);
assert.match(legenda.localLegenda({}), /COPYS-FINAIS.md/);
assert.match(legenda.localLegenda({ fonteLegenda: 'docs/audit/COPYS-FINAIS.md' }), /docs\/audit\/COPYS-FINAIS.md/);
const h = (tag, attrs = {}, ...filhos) => ({ tag, attrs, children: filhos.flat(Infinity).filter(Boolean), appendChild(v) { this.children.push(v); }, replaceChildren(...v) { this.children = v.flat(Infinity).filter(Boolean); } });
const todos = (n) => [n, ...(n.children || []).filter((v) => typeof v === 'object').flatMap(todos)];
const ajustes = carregar('ajustes.js');
let posts = 0;
const ctx = { h, obsoleta: () => false, formatar: { dataHora: (v) => v }, acao() { posts++; }, confirmar() { throw Error('não deveria abrir confirmação'); } };
const pedido = { id: 'audit', pecaId: 'a'.repeat(16), estado: 'corrigido-aguardando-aceite', versaoCorrigida: 'b'.repeat(40), commit: 'c'.repeat(40), criadoEm: '2026-10-18', tentativas: 0 };
for (const texto of ['', '   ', 'Texto real']) {
  const secao = ajustes.secaoAjustesDaPeca(ctx, [pedido], pedido.pecaId, { pronta: true, pedidoId: pedido.id, observadores: new Set() }, { legenda: texto, composicao: { video: [], legenda: texto ? 'incluida' : 'sem-legenda' } });
  // 18/10: o aceite é só pelo botão Aprovar da peça; a seção do pedido não tem mais botão de aceite.
  assert.equal(todos(secao).some((n) => n.attrs.texto === 'Aceitar versão corrigida'), false);
  assert.equal(todos(secao).some((n) => /Falta a legenda para publicar/.test(n.attrs.texto || '')), !texto.trim());
}
assert.equal(posts, 0, 'sem escrita quando o aceite está bloqueado');
console.log('admin-legenda-publicacao-tela: formatos, espaços, composto, DTO, local atual e seção do pedido sem botão de aceite, sem POST OK');
// 18/10: documento de copy (tipo texto) não exige legenda; arte continua exigindo, no servidor e na tela.
{
  const servidor = require('../tools/admin-local/marketing/legenda-publicacao.cjs');
  assert.equal(servidor.temLegenda({ tipo: 'texto', legenda: '' }), true);
  assert.equal(servidor.temLegenda({ tipo: 'imagem', legenda: '' }), false);
  assert.equal(servidor.temLegenda({ tipo: 'video' }), false);
  assert.equal(servidor.bloqueiosAprovacao({ tipo: 'texto' }).length, 0);
}
