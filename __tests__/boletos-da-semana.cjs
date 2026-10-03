/*
 * "Vence esta semana" na Inicio lista tambem o boleto ATRASADO (achado P2 da
 * auditoria de 03/10/2026): antes, diffDays >= 0 escondia o atrasado e a tela
 * dizia "Nenhuma conta a vencer". Modulo real; pago e futuro distante ficam fora.
 *
 *   node __tests__/boletos-da-semana.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const mod = {};
const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'lib/boletos-da-semana.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(js, { exports: mod, Date, Math, require: () => ({}) });
const { boletosDaSemana, boletoAtrasado } = mod;

const hoje = new Date(2026, 9, 3, 15, 0, 0);
const b = (id, due_date, status = 'pending') => ({ id, due_date, status });
const lista = [
  b('atrasado', '2026-09-20', 'overdue'),
  b('ontem', '2026-10-02'),
  b('hoje', '2026-10-03'),
  b('d6', '2026-10-09'),
  b('d7', '2026-10-10'),
  b('pago-atrasado', '2026-09-01', 'paid'),
];
const r = boletosDaSemana(lista, hoje).map((x) => x.id);
assert.deepEqual(r, ['atrasado', 'ontem', 'hoje', 'd6']);
assert.equal(boletoAtrasado(b('x', '2026-10-02'), hoje), true);
assert.equal(boletoAtrasado(b('x', '2026-10-03'), hoje), false);
assert.deepEqual(boletosDaSemana([b('so-atrasado', '2026-09-20')], hoje).map((x) => x.id), ['so-atrasado']);
console.log('  ok  boletos da semana incluem atrasado, excluem pago e alem de 6 dias');
