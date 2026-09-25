/* T18 (24/09/2026): em Gerenciar categorias, o lápis de uma categoria perto
   do fim da lista abria o formulário DENTRO da lista rolável sem rolar até
   ele, e a paleta e "Salvar categoria" ficavam por baixo do teclado.

   Executa o CategoryPickerModal real com um mini-runtime de hooks: carrega as
   categorias, toca no lápis da última, entrega os layouts que o Android
   entregaria e confere que a lista rola até a linha editada e que ela pode
   encolher junto com o painel. */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function carregar(path, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, console, Promise, require: (name) => {
    assert.ok(name in imports, `import inesperado: ${name}`);
    return imports[name];
  } });
  return exports;
}

// Mini-runtime: estado e refs por ordem de chamada, efeitos só quando as
// dependências mudam. Suficiente para um componente só.
let slots = [];
let indice = 0;
let efeitosPendentes = [];
const react = {
  useState(inicial) {
    const i = indice++;
    if (!(i in slots)) slots[i] = { valor: typeof inicial === 'function' ? inicial() : inicial };
    const slot = slots[i];
    return [slot.valor, (v) => { slot.valor = typeof v === 'function' ? v(slot.valor) : v; }];
  },
  useRef(inicial) {
    const i = indice++;
    if (!(i in slots)) slots[i] = { current: inicial };
    return slots[i];
  },
  useEffect(fn, deps) {
    const i = indice++;
    const antes = slots[i];
    if (!antes || !deps || deps.some((d, k) => d !== antes.deps[k])) {
      slots[i] = { deps };
      efeitosPendentes.push(fn);
    }
  },
};

// O painel mede a janela pelo JanelaFlutuante do AppModal: executado na hora,
// como faria o React, para o conteúdo entrar na árvore.
const janelaDoModal = { aoMedirFundo: () => {}, scrimStyle: {}, sheetStyle: { maxHeight: 400 } };
function JanelaFlutuante({ children }) { return children(janelaDoModal); }
const jsx = (type, props) => (type === JanelaFlutuante ? type(props ?? {}) : { type, props: props ?? {} });
const categorias = ['Alimentação', 'Moradia', 'Transporte', 'Lazer', 'Saúde', 'Assinaturas', 'Salário', 'Investimentos', 'Outros']
  .map((name, i) => ({ id: `p${i}`, name, color: '#111111', is_default: true }))
  .concat({ id: 'c1', name: 'AUDIT QA T18', color: '#222222', is_default: false });

let reduzir = false;
const Modal = carregar('components/CategoryPickerModal.tsx', {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': {
    ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView',
    StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View',
  },
  './AppModal': { __esModule: true, default: 'AppModal', JanelaFlutuante },
  '@/lib/alert': { Alert: { alert: () => {} } },
  '@expo/vector-icons/Ionicons': { default: 'Ionicons' },
  '@/lib/theme': {
    theme: {}, radius: {}, spacing: { xl: 24, md: 16 }, PALETTE_30: ['#000000'], fonts: {}, type: { apoio: 14 },
  },
  '@/lib/types': { CATEGORIES: [] },
  '@/lib/data': {
    addCategory: async () => {}, deleteCategory: async () => {}, updateCategory: async () => {},
    fetchCategories: async () => categorias, seedDefaultCategories: async () => {},
  },
  '@/lib/cache-de-tela': { isLikelyNetworkError: () => false },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
  '@/lib/motion': { useReducedMotion: () => reduzir },
  '@/lib/limits': { LIMITS: { category: 30 } },
  './AppPressable': { default: 'AppPressable' },
  './AccessibleModalPanel': { default: 'AccessibleModalPanel' },
  './ColorGridPicker': { default: 'ColorGridPicker' },
  './Sheet': { useKeyboardHeight: () => 300 },
}).default;

function render() {
  indice = 0;
  const arvore = Modal({ visible: true, onClose: () => {}, mode: 'manage' });
  const efeitos = efeitosPendentes;
  efeitosPendentes = [];
  efeitos.forEach((fn) => fn());
  return arvore;
}

function* nos(no) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { for (const n of no) yield* nos(n); return; }
  yield no;
  yield* nos(no.props?.children);
}
const acha = (arvore, pred) => [...nos(arvore)].find(pred);

async function cenario() {
  slots = [];
  render();
  await new Promise((r) => setImmediate(r));
  let arvore = render();

  const lista = acha(arvore, (n) => n.type === 'ScrollView');
  const estilo = Object.assign({}, ...[].concat(lista.props.style).filter(Boolean));
  assert.equal(estilo.flexShrink, 1, 'a lista precisa encolher com o painel quando o teclado abre');

  // Layout das linhas como o Android entregaria: 44 de altura cada.
  const linhas = lista.props.children[1];
  linhas.forEach((linha, i) => linha.props.onLayout({ nativeEvent: { layout: { y: i * 44 } } }));

  const lapis = acha(arvore, (n) => n.props?.accessibilityLabel === 'Editar categoria AUDIT QA T18');
  lapis.props.onPress();
  arvore = render();

  const rolagens = [];
  const listaDepois = acha(arvore, (n) => n.type === 'ScrollView');
  listaDepois.props.ref.current = { scrollTo: (o) => rolagens.push(o) };
  // O último casamento é o mais interno: o invólucro da linha também tem
  // onLayout e também contém o campo.
  const form = [...nos(arvore)].filter((n) => n.type === 'View' && typeof n.props.onLayout === 'function'
    && acha(n.props.children, (m) => m.props?.accessibilityLabel === 'Nome da categoria')).pop();
  assert.ok(form, 'formulário de edição aberto com o campo de nome');
  assert.ok(acha(form, (n) => n.type === 'Text' && n.props.children === 'Salvar categoria'), 'Salvar dentro do formulário');
  form.props.onLayout({ nativeEvent: { layout: { y: 44 } } });
  return rolagens;
}

(async () => {
  let rolagens = await cenario();
  assert.deepEqual(JSON.parse(JSON.stringify(rolagens)), [{ y: 9 * 44, animated: true }], 'a lista rola até a linha editada');
  reduzir = true;
  rolagens = await cenario();
  assert.deepEqual(JSON.parse(JSON.stringify(rolagens)), [{ y: 9 * 44, animated: false }], 'movimento reduzido rola sem animar');
  console.log('OK categoria em edição: a lista rola até o formulário e encolhe com o painel (T18).');
})().catch((e) => { console.error(e); process.exit(1); });
