/* Tela de acesso à câmera (components/PermissaoCamera.tsx), comum ao leitor de
 * QR e à foto da nota. Executa o componente real com dublês de React Native e
 * confere as três situações: permissão ainda consultando, pedido normal e
 * permissão negada de vez, em que "Permitir câmera" não abria nada. */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const chamadas = [];
const imports = {
  'react/jsx-runtime': {
    jsx: (type, props) => (typeof type === 'function' ? type(props) : { type, props }),
    jsxs: (type, props) => (typeof type === 'function' ? type(props) : { type, props }),
  },
  'react-native': {
    Linking: { openSettings: () => { chamadas.push('openSettings'); return Promise.resolve(); } },
    StyleSheet: { create: (s) => s },
    Text: 'Text',
    View: 'View',
  },
  expo: {},
  '@expo/vector-icons/Ionicons': 'Ionicons',
  '@/lib/theme': {
    theme: {}, radius: {}, spacing: {}, type: {}, fonts: {}, lh: () => 0,
  },
  './AppPressable': 'AppPressable',
};

const modulo = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('components/PermissaoCamera.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  { exports: modulo, console, require: (n) => { assert.ok(n in imports, n); return imports[n]; } },
);
const PermissaoCamera = modulo.default;

function achar(no, pred, acc = []) {
  if (!no || typeof no !== 'object') return acc;
  if (Array.isArray(no)) { no.forEach((n) => achar(n, pred, acc)); return acc; }
  if (pred(no)) acc.push(no);
  achar(no.props?.children, pred, acc);
  return acc;
}
const textos = (arvore) => achar(arvore, (n) => n.type === 'Text').map((n) => [].concat(n.props.children).join(''));
const botoes = (arvore) => achar(arvore, (n) => n.type === 'AppPressable');

const base = { motivo: 'Motivo.', onFechar: () => chamadas.push('fechar'), pedirPermissao: () => chamadas.push('pedir') };

// 1. Consultando: nada de tela de pedido piscando, só o fundo da câmera.
{
  const arvore = PermissaoCamera({ ...base, permissao: null });
  assert.equal(arvore.type, 'View');
  assert.equal(textos(arvore).length, 0, 'sem texto enquanto a permissão é consultada');
}

// 2. Pode perguntar: o botão pede a permissão.
{
  chamadas.length = 0;
  const arvore = PermissaoCamera({ ...base, permissao: { granted: false, canAskAgain: true } });
  assert.ok(textos(arvore).includes('Permitir câmera'));
  assert.ok(textos(arvore).includes('Motivo.'));
  botoes(arvore)[0].props.onPress();
  assert.deepEqual(chamadas, ['pedir']);
}

// 3. Negada de vez: o botão leva às configurações e o texto explica.
{
  chamadas.length = 0;
  const arvore = PermissaoCamera({ ...base, permissao: { granted: false, canAskAgain: false } });
  assert.ok(textos(arvore).includes('Abrir configurações'));
  assert.ok(!textos(arvore).includes('Permitir câmera'), 'botão morto não pode continuar dizendo "Permitir"');
  assert.ok(textos(arvore).some((t) => t.includes('configurações do aparelho')));
  botoes(arvore)[0].props.onPress();
  assert.deepEqual(chamadas, ['openSettings'], 'não chama o pedido que o sistema ignora');
  botoes(arvore)[1].props.onPress();
  assert.deepEqual(chamadas, ['openSettings', 'fechar']);
}

// Os dois leitores usam a mesma tela, sem cópia própria.
for (const arquivo of ['components/QrScannerModal.tsx', 'components/FotoNotaModal.tsx']) {
  const fonte = fs.readFileSync(arquivo, 'utf8');
  assert.ok(fonte.includes('<PermissaoCamera'), `${arquivo} usa PermissaoCamera`);
  assert.ok(!fonte.includes('Permitir câmera'), `${arquivo} não tem botão de permissão próprio`);
}

console.log('permissao-camera: 4 blocos passaram');
