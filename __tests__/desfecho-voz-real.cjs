/*
 * A `desfechoDaOperacaoVoz` REAL, para os dublês de `./voice-operations`.
 *
 * A tarefa da voz (lib/widget-voz-task.ts) lê o desfecho de uma gravação
 * (nova, pendente, desfeita, já lançada) nessa função do núcleo, a mesma que
 * as telas de revisão leem (regra 13; achado C1 do Lynx, 30/09/2026). Os
 * testes que trocam o módulo inteiro por dublê recebem daqui a decisão real,
 * nunca uma cópia dela.
 *
 * O módulo é carregado de verdade (transpile + vm). Os imports do topo dele
 * só são vinculados na carga, então recebem objetos inertes: a função não
 * usa nenhum. `__tests__/voz-desfecho-paridade.cjs` confere que todo dublê
 * de `./voice-operations` tem a função.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const arquivo = path.join(__dirname, '..', 'lib', 'voice-operations.ts');
const modulo = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, { exports: modulo, console, require: () => ({}) });

if (typeof modulo.desfechoDaOperacaoVoz !== 'function') {
  throw new Error('lib/voice-operations.ts não exporta desfechoDaOperacaoVoz');
}
module.exports = modulo.desfechoDaOperacaoVoz;
