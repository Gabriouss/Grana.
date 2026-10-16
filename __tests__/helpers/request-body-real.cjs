const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
module.exports = function requestBodyReal(globals = {}) {
  const api = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/request-body.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: api, Uint8Array, Error, setTimeout, clearTimeout, ...globals });
  return api;
};
