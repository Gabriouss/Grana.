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
  for (const texto of [undefined, null, '', '  \n\t']) assert.equal(legenda.faltaLegenda({ tipo, legenda: texto, editorial: { copyCanonica: 'Só referência' } }), true);
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
  const botao = todos(secao).find((n) => n.attrs.texto === 'Aceitar versão corrigida');
  assert.equal(botao.attrs.disabled, !texto.trim());
  if (!texto.trim()) {
    assert(todos(secao).some((n) => /Falta a legenda para publicar/.test(n.attrs.texto || '')));
    botao.disabled = true;
    ajustes.agir(ctx, pedido, 'aceitar', botao);
  }
}
assert.equal(posts, 0, 'sem escrita quando o aceite está bloqueado');
console.log('admin-legenda-publicacao-tela: formatos, espaços, composto, DTO, local atual e aceite corrigido bloqueado sem POST OK');
