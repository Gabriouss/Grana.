/*
 * V24, decisao B do autor (04/10/2026): excluir um cartao mantem as compras no
 * historico, mas credito sem cartao nao vence em fatura nenhuma. O
 * "Comprometimento futuro" nao o soma. Modulo REAL: lib/projections.ts (e
 * lib/transaction-rules.ts, diagnostico.ts). Nao toca o calculo de saldo nem o
 * Livre para gastar (regra 20): o teste de saldo segue em regra-20-saldo-do-mes.cjs.
 *
 *   node __tests__/projecao-ignora-credito-sem-cartao.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const cache = new Map();
function carregar(arquivo) {
  if (cache.has(arquivo)) return cache.get(arquivo);
  const exports = {}; cache.set(arquivo, exports);
  const js = ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, { exports, console, Math, Date, Object, Array, Number, String, Set, Map, JSON, require(id) {
    if (id === './supabase') return { supabase: {} }; // diagnostico.ts so usa o banco ao salvar o diagnostico
    if (id.startsWith('./')) return carregar(path.posix.join('lib', id.slice(2) + '.ts'));
    throw new Error('import nao simulado: ' + id);
  } });
  return exports;
}
const { projetarComprometimentoFuturo } = carregar('lib/projections.ts');

const hoje = new Date(2026, 9, 4);
const parcela = (id, valor, data, extra) => ({
  id, type: 'out', amount: valor, occurred_on: data, installment_total: 3, installment_current: 1,
  payment_method: 'credit', card_id: 'c6', ...extra,
});
let n = 0; const ok = (m) => { n++; console.log('  ok  ' + m); };

const comCartao = [parcela('a', 100, '2026-11-10'), parcela('b', 100, '2026-12-10')];
const orfas = [parcela('o1', 360, '2026-11-12', { card_id: null }), parcela('o2', 360, '2026-12-12', { card_id: null })];

const so = projetarComprometimentoFuturo(comCartao, [], 6, hoje);
assert.equal(so[1].parcelasFuturas, 100); assert.equal(so[2].parcelasFuturas, 100);
ok('compra com card_id entra na projecao (nov e dez R$ 100)');

const misto = projetarComprometimentoFuturo([...comCartao, ...orfas], [], 6, hoje);
assert.equal(misto[1].parcelasFuturas, 100, 'orfa de R$ 360 nao soma em novembro');
assert.equal(misto[2].parcelasFuturas, 100, 'orfa de R$ 360 nao soma em dezembro');
assert.deepEqual(misto.map((m) => m.total), so.map((m) => m.total));
ok('compra no credito com card_id null NAO entra (era o R$ 360 do V24)');

const soOrfas = projetarComprometimentoFuturo(orfas, [], 6, hoje);
assert.ok(soOrfas.every((m) => m.parcelasFuturas === 0 && m.total === 0));
ok('so orfas: comprometimento zero');

// Parcela fora do credito (debito, sem cartao por natureza) nao e crédito sem cartão: segue contando.
const debito = projetarComprometimentoFuturo([parcela('d', 50, '2026-11-05', { payment_method: 'debit', card_id: null })], [], 6, hoje);
assert.equal(debito[1].parcelasFuturas, 50);
ok('parcela que nao e credito continua entrando (regra so atinge credito sem cartao)');

// Contas recorrentes seguem iguais.
const rec = projetarComprometimentoFuturo(orfas, [{ id: 'r', amount: 80, recurring: true }], 3, hoje);
assert.equal(rec[0].contasRecorrentes, 80); assert.equal(rec[1].total, 80);
ok('contas recorrentes nao mudam');

console.log(`\n${n} checagens, 0 falhas`);
