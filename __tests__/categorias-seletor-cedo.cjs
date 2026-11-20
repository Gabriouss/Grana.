/* Item 48 (20/11/2026): o seletor de categorias só chamava fetchCategories
   depois de seedDefaultCategories (getUser + upsert). Numa conta já semeada,
   com cache e rede lenta, a lista ficava vazia enquanto as duas respostas não
   chegavam. Executa o CategoryPickerModal real com promessas controladas:
   lista cedo, primeira conta recebe as padrão, resposta velha não sobrescreve
   a nova, falha total não trava o carregando. ARQUIVO=<caminho> roda outra
   versão (baseline RED). */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const adiado = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };

let slots = [], indice = 0, efeitos = [];
const react = {
  useState(inicial) {
    const i = indice++;
    if (!(i in slots)) slots[i] = { valor: typeof inicial === 'function' ? inicial() : inicial };
    const slot = slots[i];
    return [slot.valor, (v) => { slot.valor = typeof v === 'function' ? v(slot.valor) : v; }];
  },
  useRef(inicial) { const i = indice++; if (!(i in slots)) slots[i] = { current: inicial }; return slots[i]; },
  useEffect(fn, deps) {
    const i = indice++; const antes = slots[i];
    if (!antes || !deps || deps.some((d, k) => d !== antes.deps[k])) { slots[i] = { deps }; efeitos.push(fn); }
  },
};
const janela = { aoMedirFundo: () => {}, scrimStyle: {}, sheetStyle: {} };
function JanelaFlutuante({ children }) { return children(janela); }
const jsx = (type, props) => (type === JanelaFlutuante ? type(props ?? {}) : { type, props: props ?? {} });

let seed, buscas, erros;
const modulo = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(process.env.ARQUIVO || 'components/CategoryPickerModal.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: modulo, Promise, console: { ...console, error: (...a) => erros.push(a) }, require: (name) => ({
  react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View' },
  './AppModal': { __esModule: true, default: 'AppModal', JanelaFlutuante },
  '@/lib/alerta': { Alert: { alert: () => {} } },
  '@expo/vector-icons/Ionicons': { default: 'Ionicons' },
  '@/lib/theme': { theme: {}, radius: {}, spacing: { xl: 24, md: 16 }, PALETTE_30: ['#000000'], fonts: {}, type: { apoio: 14 }, hitSlopPara: () => 0 },
  '@/lib/types': { CATEGORIES: [] },
  '@/lib/heuristics': { categoriaServeAoTipo: () => true },
  '@/lib/data': {
    addCategory: async () => {}, deleteCategory: async () => {}, updateCategory: async () => {},
    seedDefaultCategories: () => seed.p,
    fetchCategories: () => { const d = adiado(); buscas.push(d); return d.p; },
  },
  '@/lib/cache-de-tela': { isLikelyNetworkError: () => false },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
  '@/lib/motion': { useReducedMotion: () => false },
  '@/lib/limits': { LIMITS: { category: 30 } },
  './AppPressable': { default: 'AppPressable' }, './AccessibleModalPanel': { default: 'AccessibleModalPanel' },
  './ColorGridPicker': { default: 'ColorGridPicker' }, './Sheet': { useKeyboardHeight: () => 0 },
})[name] ?? assert.fail(`import inesperado: ${name}`) });
const Modal = modulo.default;

function render() {
  indice = 0;
  const arvore = Modal({ visible: true, onClose: () => {}, mode: 'manage' });
  const fns = efeitos; efeitos = []; fns.forEach((fn) => fn());
  return arvore;
}
function* nos(no) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { for (const n of no) yield* nos(n); return; }
  yield no; yield* nos(no.props?.children);
}
const nomes = (a) => [...nos(a)].filter((n) => n.type === 'Text' && typeof n.props.children === 'string').map((n) => n.props.children);
const carregando = (a) => [...nos(a)].some((n) => n.type === 'ActivityIndicator');
const tick = () => new Promise((r) => setImmediate(r));
const cat = (name, i) => ({ id: `id-${name}`, name, color: '#111111', is_default: i < 9 });
const novo = () => { slots = []; efeitos = []; buscas = []; erros = []; seed = adiado(); render(); };

(async () => {
  // 1. Conta semeada, cache válido, getUser/upsert lentos: lista antes da semeadura.
  novo();
  check(buscas.length === 1, `fetchCategories chamado antes da semeadura terminar (${buscas.length} chamadas)`);
  buscas[0]?.resolve(['Alimentação', 'Moradia'].map(cat)); await tick();
  let a = render();
  check(nomes(a).includes('Alimentação') && !carregando(a), 'lista do cache aparece com a semeadura pendente');
  seed.resolve(); await tick();
  check(buscas.length === 2, 'busca de novo depois da semeadura');
  buscas[1].resolve(['Alimentação', 'Moradia', 'Investimentos'].map(cat)); await tick();
  a = render();
  check(nomes(a).includes('Investimentos'), 'padrão nova semeada aparece depois');

  // 2. Primeira conta: lista inicial vazia mantém o carregando até a semeadura.
  novo();
  buscas[0]?.resolve([]); await tick();
  a = render();
  check(carregando(a), 'conta sem semeadura continua carregando com a lista inicial vazia');
  seed.resolve(); await tick();
  buscas.at(-1).resolve(['Alimentação', 'Outros'].map(cat)); await tick();
  a = render();
  check(nomes(a).includes('Outros') && !carregando(a), 'primeira conta recebe as padrão semeadas');

  // 3. Respostas invertidas: a busca velha chega depois e não apaga a nova.
  novo();
  seed.resolve(); await tick();
  check(buscas.length === 2, 'duas buscas em voo');
  buscas[1].resolve(['Alimentação', 'Investimentos'].map(cat)); await tick();
  buscas[0].resolve(['Alimentação'].map(cat)); await tick();
  a = render();
  check(nomes(a).includes('Investimentos'), 'resposta velha não sobrescreve a lista nova');

  // 4. Semeadura e as duas buscas falham: recibo no log, lista vazia, sem carregando eterno.
  novo();
  buscas[0]?.reject(new Error('busca 1')); seed.reject(new Error('rls')); await tick();
  buscas.at(-1).reject(new Error('busca 2')); await tick(); await tick();
  a = render();
  check(!carregando(a), 'falha total encerra o carregando');
  check(erros.some((e) => /seedDefaultCategories/.test(e[0])) && erros.some((e) => /fetchCategories/.test(e[0])), 'falhas deixam recibo no log');

  console.log(`categorias-seletor-cedo: ${checks} verificações ok`);
})().catch((e) => { console.error(e); process.exit(1); });
