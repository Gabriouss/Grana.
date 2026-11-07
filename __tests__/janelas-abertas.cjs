// Registro de janelas abertas: módulo real compilado em vm; só o React é dublê.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const fonte = fs.readFileSync(path.join(__dirname, '..', 'lib', 'janelas-abertas.ts'), 'utf8');
const { outputText } = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const mod = { exports: {} };
vm.runInNewContext(outputText, { module: mod, exports: mod.exports, require: () => ({ useState() {}, useEffect() {} }) });
const { registrarJanelaAberta, quantasJanelasAbertas } = mod.exports;

assert.equal(quantasJanelasAbertas(), 0);
const a = registrarJanelaAberta();
const b = registrarJanelaAberta();
assert.equal(quantasJanelasAbertas(), 2);
a(); a();
assert.equal(quantasJanelasAbertas(), 1, 'liberar duas vezes não conta duas');
b();
assert.equal(quantasJanelasAbertas(), 0);
console.log('ok: registro de janelas abertas conta, libera uma vez e nunca fica negativo');

// AppModal só registra quando visível e quando não é a janela dos avisos.
const modal = fs.readFileSync(path.join(__dirname, '..', 'components', 'AppModal.tsx'), 'utf8');
assert.match(modal, /visivel && !semRegistro \? registrarJanelaAberta\(\) : undefined/);
console.log('ok: AppModal registra só enquanto visível e fora da janela de avisos');
