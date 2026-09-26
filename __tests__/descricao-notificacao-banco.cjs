/*
 * "Colar comprovante" com texto de notificação de banco (achado G3 do
 * Watchtower, 26/09/2026).
 *
 *   node __tests__/descricao-notificacao-banco.cjs
 *
 * "Você gastou R$ 32,50 no Mercado Modelo em Alimentação" era gravado como
 * "Você gastou no Mercado Modelo em Ali...": a frase caía na regra da sobra
 * do texto, e nem "você gastou" nem a categoria citada no fim com "em" eram
 * tirados. O formato de Pix ("transferiu ... para Mercado Modelo") já
 * funcionava.
 *
 * Roda o `lib/heuristics.ts` REAL (colar comprovante e voz no app e no
 * widget) e a cópia Deno REAL de `_shared/interpretar-lancamento.ts` (Granabô).
 * A cópia do `whatsapp-webhook` é conferida por `sync-parser.js`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { heuristics } = require('./voz-auditoria-rodada6.cjs');

const cache = new Map();
function carregarDeno(arquivo) {
  const abs = path.resolve(arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, RegExp, Number, Math, Set, Map,
    require: (id) => carregarDeno(path.resolve(path.dirname(abs), id)),
  }, { filename: arquivo });
  return exports;
}
const chat = carregarDeno('supabase/functions/_shared/interpretar-lancamento.ts');

const CASOS = [
  ['Você gastou R$ 32,50 no Mercado Modelo em Alimentação', 'out', 'Mercado Modelo'],
  ['Voce gastou R$ 12,00 na Padaria Modelo em Alimentação', 'out', 'Padaria Modelo'],
  ['Você gastou R$ 32,50 no Mercado Modelo', 'out', 'Mercado Modelo'],
  ['Você pagou R$ 80,00 na Farmácia Central em Saúde', 'out', 'Farmácia Central'],
  ['Você recebeu R$ 100,00 de João', 'in', 'João'],
  /* Não pode regredir: */
  ['Você transferiu R$ 50,00 para Mercado Modelo', 'out', 'Mercado Modelo'],
  ['gastei 50 em alimentação', 'out', 'Alimentação'],
  ['gastei 32 no mercado', 'out', 'Mercado'],
  ['almoço de 30 reais', 'out', 'Almoço'],
];

let passou = 0;
for (const [frase, tipo, esperado] of CASOS) {
  assert.equal(heuristics.descricaoDoLancamento(frase, tipo), esperado, `app: "${frase}"`);
  assert.equal(chat.descricaoDoLancamento(frase, tipo), esperado, `Granabô: "${frase}"`);
  passou += 2;
}
console.log(`descricao-notificacao-banco: ${passou} checagens OK`);
