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

// Executa o AppModal real. Cada Modal cria outra janela nativa; a área segura
// precisa ser MEDIDA dentro dela (T7, S9, S40, T16), mas não aplicada em volta
// de tudo: um SafeAreaView ali deixava a faixa das barras com o fundo branco
// da janela nativa e tirava a barra de status de baixo do escurecido (T19).
const insetsDoModal = { top: 42, bottom: 24, left: 0, right: 0 };
const appModalMod = carregar('components/AppModal.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { Platform: { OS: 'android' }, Modal: 'Modal' },
  'react-native-safe-area-context': {
    SafeAreaProvider: 'SafeAreaProvider',
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => insetsDoModal,
  },
  '@/lib/motion': { useReducedMotion: () => false },
  '@/lib/breakpoints': { useSheetFlutuante: () => ({ janela: 'do modal' }) },
});
const modalTree = appModalMod.default({ visible: true, transparent: true, children: 'conteudo' });
assert.equal(modalTree.type, 'Modal');
assert.equal(modalTree.props.statusBarTranslucent, true);
assert.equal(modalTree.props.children.type, 'SafeAreaProvider');
assert.equal(modalTree.props.children.props.children, 'conteudo', 'nada recua o conteúdo entre o provider e a tela');
assert.ok(!JSON.stringify(modalTree).includes('SafeAreaView'), 'AppModal não pode envolver o conteúdo em SafeAreaView');
let recebido = null;
appModalMod.InsetsDoModal({ children: (insets) => { recebido = insets; return null; } });
assert.deepEqual(recebido, insetsDoModal);
console.log('OK: AppModal mede a área segura na própria janela nativa, sem recuar o fundo.');

// As telas cheias precisam ler o recuo DENTRO do AppModal. Chamado fora, o
// hook lê a janela de baixo, onde o topo vem zero no Android.
for (const arquivo of ['components/OnboardingModal.tsx', 'components/QrScannerModal.tsx', 'components/MonthlyWrappedModal.tsx']) {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  assert.ok(!/useSafeAreaInsets\(/.test(fonte), `${arquivo} lê o recuo fora da janela do modal`);
  assert.ok(fonte.includes('<InsetsDoModal>'), `${arquivo} precisa do recuo medido no modal`);
}
console.log('OK: telas cheias em modal recuam pelo InsetsDoModal.');

// S9 (24/09/2026): a mesma classe nos painéis que montam o próprio fundo. O
// useSheetFlutuante lê o recuo do topo; chamado no corpo do componente que
// abre o AppModal, ele lia a janela de baixo e, com o teclado aberto, o painel
// "Categoria" subia até a linha do relógio. O JanelaFlutuante chama o hook
// dentro do modal e entrega o resultado ao conteúdo.
let janela = null;
appModalMod.JanelaFlutuante({ children: (j) => { janela = j; return null; } });
assert.deepEqual({ ...janela }, { janela: 'do modal' });

// Guarda da classe: nenhum arquivo que abre um AppModal lê o recuo no próprio
// corpo. Quem precisa dele usa InsetsDoModal ou JanelaFlutuante (ou o Sheet).
function tsx(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = `${dir}/${e.name}`;
    if (e.isDirectory()) return tsx(caminho);
    return e.name.endsWith('.tsx') ? [caminho] : [];
  });
}
const culpados = [...tsx('components'), ...tsx('app')]
  .filter((arquivo) => arquivo !== 'components/AppModal.tsx')
  .filter((arquivo) => {
    const fonte = fs.readFileSync(arquivo, 'utf8');
    return fonte.includes('<AppModal') && /\b(useSheetFlutuante|useSafeAreaInsets)\(/.test(fonte);
  });
assert.deepEqual(culpados, [], `leem o recuo fora da janela do modal: ${culpados.join(', ')}`);
console.log('OK: nenhum painel em AppModal lê o recuo fora da janela do modal (S9).');
