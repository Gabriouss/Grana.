/*
 * O `lib/data-da-fala.ts` REAL, para os testes que executam uma função de
 * tela extraída do arquivo (as revisões de voz leem a data da fala nele,
 * data na voz, 30/09/2026). O módulo não tem import: carrega sozinho.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const arquivo = path.join(__dirname, '..', 'lib', 'data-da-fala.ts');
const modulo = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, { exports: modulo, Date, JSON, Number, String, Object, Array, RegExp, Math, Set, Map }, { filename: arquivo });

if (typeof modulo.dataDaFala !== 'function') throw new Error('lib/data-da-fala.ts não exporta dataDaFala');
module.exports = modulo;
