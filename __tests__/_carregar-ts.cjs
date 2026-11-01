/* Carrega módulos REAIS de lib/ (ts.transpileModule + vm), receita da regra 9. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const cache = new Map();
function carregar(arquivo, dubles = {}) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
    require: (id) => {
      if (id in dubles) return dubles[id];
      if (id.startsWith('.')) {
        const alvo = path.join(path.dirname(arquivo), id.endsWith('.ts') ? id : id + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregar(alvo, dubles);
      }
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}
module.exports = { carregar, root };
