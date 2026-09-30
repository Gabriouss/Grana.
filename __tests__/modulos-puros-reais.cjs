/*
 * Módulos PUROS (sem import) de lib/, reais, para os testes que carregam a
 * tarefa da voz ou uma tela com uma lista fechada de dublês. A tarefa lê a
 * data da fala (`data-da-fala`) e a fatura do crédito (`faturaCiclo`)
 * nesses módulos (data na voz, 30/09/2026); um dublê deles esconderia
 * justamente a decisão que o teste quer ver.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function puro(nome) {
  const arquivo = path.join(__dirname, '..', 'lib', `${nome}.ts`);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, Date, JSON, Number, String, Object, Array, RegExp, Math, Set, Map }, { filename: arquivo });
  return exports;
}

const dataDaFala = require('./data-da-fala-real.cjs');
const faturaCiclo = puro('faturaCiclo');
module.exports = {
  './data-da-fala': dataDaFala,
  '@/lib/data-da-fala': dataDaFala,
  './faturaCiclo': faturaCiclo,
  '@/lib/faturaCiclo': faturaCiclo,
};
