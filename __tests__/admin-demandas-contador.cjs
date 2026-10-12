'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  const js = ts.transpileModule(fs.readFileSync(path.join('tools/admin-local/web/telas', nome), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (id) => load(id.replace('./', '')), console, Date, setTimeout: () => 0, clearTimeout() {} });
  return m.exports;
}
const pecas = load('_pecas.js'), ajustes = load('ajustes.js');
const p = (id, extra = {}) => ({ id, familia: id, estado: 'para-aprovacao', ...extra });
const pedido = (pecaId, estado, extra = {}) => ({ pecaId, estado, criadoEm: '2026-10-12T10:00:00Z', ...extra });
const acervo = [p('a'), p('b', { familia: 'a' }), p('c'), p('d', { aprovada: true }), p('e', { aprovada: true, estado: 'aprovados' })];
const familias = pecas.agruparFamilias(acervo);
const fila = [pedido('c', 'novo')];
assert.equal(ajustes.contarPrecisaDeVoce(familias, fila), 2, 'uma familia sem aceite e uma aceita aguardando mover');
for (const codigo of ['entrega-parada', 'lease-vencendo', 'lease-vencido']) {
  const alertas = [{ codigo, motivo: 'Aviso do servidor', proximoPasso: 'Confira o vigia.' }];
  const f = [pedido('c', codigo === 'entrega-parada' ? 'novo' : 'em-correcao', { alertas })];
  const s = ajustes.situacaoDaFamilia(familias.find((g) => g.principal.id === 'c'), f);
  assert.equal(s.secao, 'voce'); assert.equal(s.proximo, 'Confira o vigia.'); assert.equal(s.alertas[0].motivo, 'Aviso do servidor');
  assert.equal(ajustes.contarPrecisaDeVoce(familias, f), 3);
  assert.equal(f[0].estado, codigo === 'entrega-parada' ? 'novo' : 'em-correcao', 'UI nao altera estado da fila');
}
assert.equal(ajustes.situacaoDaDemanda(p('c', { ajuste: { alertas: [{ codigo: 'entrega-parada', proximoPasso: 'Retome a entrega.' }] } }), []).secao, 'voce');
assert.equal(ajustes.situacaoDaDemanda(p('c'), [pedido('c', 'novo', { alertas: [{ codigo: 'desconhecido' }] })]).secao, 'agentes');
assert.equal(ajustes.textoAlertaDemanda({codigo:'entrega-parada',idadeMs:11*60000}),'Pedido aguardando há 11 min. O vigia está inativo.');
assert.equal(ajustes.textoAlertaDemanda({codigo:'lease-vencendo',restanteMs:4*60000}),'A reserva da correção vence em 4 min.');
assert.equal(ajustes.textoAlertaDemanda({codigo:'lease-vencido'}),'A reserva da correção venceu.');
const src = fs.readFileSync('tools/admin-local/web/app.js', 'utf8');
const trecho = src.slice(src.indexOf('function contadorAprovacao(n)'), src.indexOf('async function renderizar()'));
const link = {}, calls = [], logs = [];
let falha = false, obsoleta = false;
const s = { document: { querySelector: () => link }, console: { warn: (...a) => logs.push(a) },
  agruparFamilias: pecas.agruparFamilias, contarPrecisaDeVoce: ajustes.contarPrecisaDeVoce,
  api: async (url) => { calls.push(url); if (falha) throw Error('fixture'); return { dados: url.endsWith('/pecas') ? { pecas: acervo } : { pedidos: fila } }; },
};
vm.runInNewContext(trecho, s);
(async () => {
  await s.atualizarContadorAprovacao(() => obsoleta);
  assert.equal(link.textContent, 'Aprovação (2)');
  assert.deepEqual(calls, ['/api/marketing/pecas', '/api/marketing/ajustes'], 'contador somente GET, sem efeitos');
  falha = true; await s.atualizarContadorAprovacao(() => obsoleta);
  assert.equal(link.textContent, 'Aprovação'); assert(link.title.includes('conferir')); assert.equal(logs.length, 1);
  obsoleta = true; link.textContent = 'Aprovação (8)'; falha = false;
  await s.atualizarContadorAprovacao(() => obsoleta); assert.equal(link.textContent, 'Aprovação (8)', 'resposta antiga nao sobrescreve contador');
  assert(fs.readFileSync('tools/admin-local/web/index.html', 'utf8').includes('data-contador-aprovacao'));
  console.log('admin-demandas-contador: familias, promocao pendente, alertas DTO, menu real, falha e resposta antiga OK; zero POST/rede');
})().catch((e) => { console.error(e); process.exitCode = 1; });
