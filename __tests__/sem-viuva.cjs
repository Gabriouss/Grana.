/*
 * `semViuva` (lib/sem-viuva.ts): as duas últimas palavras ficam unidas por
 * espaço não separável, para a última linha nunca ter uma palavra só (regra 29).
 *
 * Em 24/10/2026 a auditoria Leis de UI achou viúvas na landing que o
 * `text-wrap: balance` não tira: "Contas com / vencimento" em 360 px e a
 * primeira resposta da FAQ ("...se / precisar.") em 390 px. Carrega o módulo
 * real, transpilado em memória.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const codigo = ts.transpileModule(fs.readFileSync('lib/sem-viuva.ts', 'utf8'), {
  fileName: 'lib/sem-viuva.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const modulo = { exports: {} };
vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports });
const { semViuva } = modulo.exports;

const NBSP = ' ';
const casos = [
  ['Contas com vencimento', `Contas com${NBSP}vencimento`],
  ['...com uma categoria sugerida que você ajusta se precisar.', `...com uma categoria sugerida que você ajusta se${NBSP}precisar.`],
  // espaço no fim não vira o ponto de união
  ['O que já está comprometido ', `O que já está${NBSP}comprometido`],
  // quebra de linha ou mais de um espaço antes da última palavra também une
  ['Cada lançamento\n na sua  categoria', `Cada lançamento\n na sua${NBSP}categoria`],
  // uma palavra só fica como está
  ['Preços', 'Preços'],
  ['', ''],
];
for (const [entrada, esperado] of casos) assert.equal(semViuva(entrada), esperado, JSON.stringify(entrada));
// idempotente: aplicar duas vezes não muda nada
for (const [entrada] of casos) assert.equal(semViuva(semViuva(entrada)), semViuva(entrada), `idempotente: ${JSON.stringify(entrada)}`);

console.log(`sem-viuva: ${casos.length * 2} verificações passaram`);
