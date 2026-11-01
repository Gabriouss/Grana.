// Regressão (01/11/2026): o painel do Sheet era um Pressable ANCESTRAL da
// rolagem. No Android isso fazia o toque em área comum virar responder de JS
// e o nativo interceptar o gesto, então a lista só rolava com o dedo começando
// em algo tocável. Aqui o Sheet REAL é compilado e a árvore devolvida é
// inspecionada: nenhum Pressable pode ser ancestral de ScrollView, e o
// Pressable de fechar tem de ser irmão do painel.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const ts = require('typescript');

const el = (type, props) => ({ type, props: props || {} });
const mocked = {
  'react/jsx-runtime': { jsx: el, jsxs: el, Fragment: 'Fragment' },
  react: { useRef: () => ({ current: null }), useEffect() {}, useState: (v) => [v, () => {}] },
  'react-native': {
    Keyboard: {}, Platform: { OS: 'android' }, Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
    StyleSheet: { create: (s) => s, absoluteFill: { position: 'absolute' } },
  },
  '@/lib/theme': { theme: {}, radius: {}, spacing: { lg: 1, md: 1, xl: 1 } },
  '@/lib/breakpoints': { useSheetFlutuante: () => ({ aoMedirFundo() {}, scrimStyle: {}, sheetStyle: { maxHeight: 100 } }) },
  '@/lib/modal-accessibility': { useModalAccessibility() {} },
  '@/lib/teclado': { useKeyboardHeight: () => 0 },
};
const saida = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/Sheet.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: saida, console, require: (id) => { if (!(id in mocked)) throw Error('Sheet import: ' + id); return mocked[id]; } });

let fechou = 0;
const raiz = saida.default({ onClose: () => { fechou++; }, children: 'conteudo' });

const kids = (n) => [].concat(n.props.children ?? []).filter((c) => c && typeof c === 'object');
function achar(n, tipo, ancestrais = []) {
  const out = [];
  if (n.type === tipo) out.push(ancestrais);
  for (const c of kids(n)) out.push(...achar(c, tipo, [...ancestrais, n]));
  return out;
}

const caminhos = achar(raiz, 'ScrollView');
assert.ok(caminhos.length >= 1, 'o Sheet deve conter a ScrollView do conteúdo');
for (const anc of caminhos) {
  assert.ok(!anc.some((a) => a.type === 'Pressable'), 'nenhum Pressable pode ser ancestral da rolagem');
}
// O fundo que fecha é irmão do painel, não pai.
const [fundoPressable] = kids(raiz).filter((c) => c.type === 'Pressable');
assert.ok(fundoPressable, 'o Pressable de fechar deve ser filho direto do contêiner');
assert.strictEqual(kids(fundoPressable).length, 0, 'o Pressable de fechar não pode envolver conteúdo');
fundoPressable.props.onPress();
assert.strictEqual(fechou, 1, 'tocar no fundo fecha');
// O painel mantém a semântica de janela.
const painel = kids(raiz).find((c) => c.type === 'View' && c.props.role === 'dialog');
assert.ok(painel && painel.props.accessibilityViewIsModal, 'painel segue como diálogo modal');
console.log('OK Sheet: nenhum Pressable acima da rolagem; fundo que fecha é irmão do painel.');
