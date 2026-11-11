// Executa o TSX real; só React e fronteiras fornecidas pelo teste são dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const pendente = () => { let resolve, reject; const promise = new Promise((s, n) => { resolve = s; reject = n; }); return { promise, resolve, reject }; };
function ambiente(imports = {}) {
  let atual;
  const logs = [], alertas = [];
  const mudou = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    createContext: value => ({ value }), use: ctx => ctx.value,
    useState(ini) { const c = atual, i = c.i++; if (!(i in c.slots)) c.slots[i] = typeof ini === 'function' ? ini() : ini; return [c.slots[i], v => { c.slots[i] = typeof v === 'function' ? v(c.slots[i]) : v; }]; },
    useRef(ini) { const c = atual, i = c.i++; return c.slots[i] ??= { current: ini }; },
    useCallback(fn, deps) { const c = atual, i = c.i++; if (!c.slots[i] || mudou(c.slots[i].deps, deps)) c.slots[i] = { fn, deps }; return c.slots[i].fn; },
    useEffect(fn, deps) { const c = atual, i = c.i++, old = c.slots[i]; if (!old || mudou(old.deps, deps)) c.effects.push(() => { old?.cleanup?.(); c.slots[i] = { deps, cleanup: fn() }; }); },
  };
  const jsx = (tipo, props) => ({ tipo, props: props ?? {} });
  const rn = { Platform: { OS: 'android' }, Alert: { alert: (...v) => alertas.push(v) }, StyleSheet: { create: v => v }, Pressable: 'Pressable', Text: 'Text', View: 'View' };
  function carregar(rel, extras = {}) {
    const exports = {};
    const mods = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': rn, ...imports, ...extras };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { exports, require: id => { assert.ok(id in mods, `import inesperado ${id}`); return mods[id]; }, console: { warn: (...v) => logs.push(v), error: (...v) => logs.push(v) } }, { filename: rel });
    return exports;
  }
  function montar(fn) {
    const c = { i: 0, slots: [], effects: [] };
    const render = () => { atual = c; c.i = 0; c.effects = []; const tree = fn(); c.effects.forEach(f => f()); return tree; };
    render(); return { render, desmontar: () => c.slots.forEach(s => s?.cleanup?.()) };
  }
  return { carregar, montar, logs, alertas, rn };
}
module.exports = { ambiente, flush, pendente };
