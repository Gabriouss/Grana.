const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function carregar(path, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => {
    assert.ok(name in imports, name);
    return imports[name];
  }, ...globals });
  return exports;
}

// Executa ambos os efeitos do hook real, incluindo registro e limpeza dos
// painéis. Timers de foco são suspensos; não simulamos layout do navegador.
const listeners = new Set();
let cleanups = [];
const document = {
  activeElement: null, body: {},
  addEventListener: (type, fn) => { if (type === 'keydown') listeners.add(fn); },
  removeEventListener: (type, fn) => listeners.delete(fn),
};
const accessibility = carregar('lib/modal-accessibility.ts', {
  react: { useEffect: fn => cleanups.push(fn()) },
  'react-native': { Platform: { OS: 'web' } },
}, { document, setTimeout: () => 1, clearTimeout: () => {},
  MutationObserver: class { disconnect() {} } });
const closed = [];
function abrir(name, callback) {
  cleanups = [];
  accessibility.useModalAccessibility({ current: { isConnected: true } }, true, callback);
  const own = cleanups;
  return () => own.forEach(fn => fn?.());
}
function escape(prevented = false) {
  const event = { key: 'Escape', defaultPrevented: prevented, stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; } };
  for (const fn of [...listeners]) { fn(event); if (event.stopped) break; }
}
const closeParent = abrir('formulario', () => closed.push('formulario'));
const closeChild = abrir('categoria', () => closed.push('categoria'));
escape();
assert.deepEqual(closed, ['categoria']);
closeChild();
escape(true);
assert.deepEqual(closed, ['categoria']);
escape();
assert.deepEqual(closed, ['categoria', 'formulario']);
closeParent();
assert.equal(listeners.size, 0);

// Mesmo se código JavaScript escapar da assinatura TypeScript, um painel do
// topo sem ação não pode deixar o Escape fechar o painel inferior.
const closeBottom = abrir('baixo', () => closed.push('baixo'));
const closeTopWithoutCallback = abrir('topo-sem-callback', undefined);
escape();
assert.deepEqual(closed, ['categoria', 'formulario']);
closeTopWithoutCallback();
closeBottom();
assert.equal(listeners.size, 0);

// Compõe o Sheet real e achata seus estilos na ordem usada pelo React Native.
// Um estilo do chamador não pode substituir o teto de altura calculado.
const jsx = (type, props) => ({ type, props });
const sheet = carregar('components/Sheet.tsx', {
  react: { useRef: () => ({ current: null }) },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { Platform: { OS: 'android' }, Pressable: 'Pressable',
    ScrollView: 'ScrollView', StyleSheet: { create: x => x } },
  '@/lib/theme': { theme: {}, radius: { xl: 20 }, spacing: { md: 12, lg: 16, xl: 24 } },
  '@/lib/breakpoints': { useSheetFlutuante: () => ({ aoMedirFundo() {},
    scrimStyle: {}, sheetStyle: { maxHeight: 308, width: '100%' } }) },
  '@/lib/modal-accessibility': { useModalAccessibility() {} },
  '@/lib/teclado': { useKeyboardHeight: () => 260 },
});
const tree = sheet.default({ centered: true, sheetStyle: { maxHeight: '90%', maxWidth: 520 }, children: 'conteudo' });
const panel = tree.props.children;
const style = Object.assign({}, ...panel.props.style.filter(Boolean));
assert.equal(style.maxHeight, 308);
assert.equal(style.maxWidth, 520);
assert.equal(panel.props.children.type, 'ScrollView');
assert.equal(panel.props.children.props.keyboardShouldPersistTaps, 'handled');
console.log('OK: Escape fecha apenas o topo; Sheet preserva teto calculado e rolagem.');
