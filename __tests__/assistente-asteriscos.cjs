const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
// Módulo real: textoDoAssistente de lib/assistente.ts, com os casos literais dos prints do Granabô.
const fonte = fs.readFileSync('lib/assistente.ts', 'utf8');
const codigo = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(codigo, { exports: mod.exports, module: mod, console, process: { env: {} }, require: () => ({ supabase: {} }) });
const t = mod.exports.textoDoAssistente;
const casos = [
  ['**R$ 816,51**', 'R$ 816,51'],
  ['**Crédito:**', 'Crédito:'],
  ['- **Crédito:** R$ 816,51', '• Crédito: R$ 816,51'],
  ['— **Crédito:** R$ 816,51', '• Crédito: R$ 816,51'],
  ['– **Débito:** R$ 20,00', '• Débito: R$ 20,00'],
  ['**Total: R$ 816,51**', 'Total: R$ 816,51'],
  ['Gastos:\n— **Crédito:** R$ 10\n— **Débito, Pix e dinheiro:** R$ 5', 'Gastos:\n• Crédito: R$ 10\n• Débito, Pix e dinheiro: R$ 5'],
  ['R$ 20 * 2 = R$ 40', 'R$ 20 * 2 = R$ 40'],
  ['Pagou em 2 — sem juros', 'Pagou em 2 — sem juros'],
];
for (const [entrada, esperado] of casos) assert.equal(t(entrada), esperado, JSON.stringify(entrada));
assert.ok(!/\*/.test(t(casos[6][0])), 'nenhum asterisco literal sobra');
console.log(`${casos.length + 1}/${casos.length + 1} checagens de asteriscos do Granabo passaram`);
