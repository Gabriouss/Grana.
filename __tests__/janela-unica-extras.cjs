/*
 * Janela única de lançamento (pedido do autor, 07/10/2026): os extras das
 * origens de captura entram POR CIMA do formulário do manual, sem virar outro
 * formulário.
 *
 *   node __tests__/janela-unica-extras.cjs
 *
 * Executa o components/TransactionSheet.tsx REAL num mini-runtime de hooks.
 *   1. Sem os extras, o manual é o de sempre: nenhuma faixa, nenhum link,
 *      Saída | Entrada presentes, descrição vazia bloqueia.
 *   2. `falaOuvida` mostra "Ouvi: ..." logo abaixo do título; `acaoSecundaria`
 *      vira o link abaixo do Salvar; `avisoDeOrigem` e `camposExtras` aparecem
 *      no lugar (antes dos campos; entre o valor e a categoria).
 *   3. `seloDaData` e `dicaDaData` acompanham a data até a pessoa escolher
 *      outra (calendário, Hoje ou Ontem).
 *   4. `descricaoPadrao` grava o texto padrão com a descrição vazia;
 *      `somenteSaida` esconde Saída | Entrada e grava saída;
 *      `semCarteiraPadrao` abre sem carteira e o Salvar pede a escolha.
 *   5. A categoria continua pelo seletor: nenhuma nuvem de chips na janela.
 */
process.env.TZ = 'America/Sao_Paulo';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };

const HOJE = '2026-09-30';
const AGORA = new Date(2026, 8, 30, 12).getTime();
class DataFalsa extends Date {
  constructor(...a) { if (a.length) super(...a); else super(AGORA); }
  static now() { return AGORA; }
}
const libs = new Map();
function lib(nome) {
  if (libs.has(nome)) return libs.get(nome);
  const exports = {};
  libs.set(nome, exports);
  vm.runInNewContext(ts.transpileModule(ler(`lib/${nome}.ts`), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console, JSON, Date: DataFalsa, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
    require: (id) => { if (id.startsWith('./')) return lib(id.slice(2)); throw new Error(`import não simulado em lib/${nome}: ${id}`); },
  }, { filename: `lib/${nome}.ts` });
  return exports;
}

const celulas = [];
let cursor = 0;
const react = {
  useState(inicial) {
    const k = cursor++;
    if (!(k in celulas)) celulas[k] = typeof inicial === 'function' ? inicial() : inicial;
    return [celulas[k], (v) => { celulas[k] = typeof v === 'function' ? v(celulas[k]) : v; }];
  },
  useRef(inicial) { const k = cursor++; if (!(k in celulas)) celulas[k] = { current: inicial }; return celulas[k]; },
  useMemo: (fn) => fn(),
  useEffect(efeito, deps) {
    const k = cursor++;
    const antes = celulas[k];
    if (!antes || !deps || deps.some((d, i) => d !== antes[i])) { celulas[k] = deps ?? []; efeito(); }
  },
};
const jsx = (type, props) => (typeof type === 'function' ? type(props ?? {}) : { type, props: props ?? {} });
const es = (v) => ({ __esModule: true, default: v });
const mods = {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View' },
  './AppModal': es('AppModal'),
  './ToggleSwitch': es('ToggleSwitch'),
  './AppPressable': 'AppPressable',
  '@expo/vector-icons/Ionicons': es('Ionicons'),
  '@/components/AppPressable': es('AppPressable'),
  '@/components/Sheet': es('Sheet'),
  '@/components/DatePickerModal': es('DatePickerModal'),
  '@/components/CategoryPickerModal': es('CategoryPickerModal'),
  '@/lib/format': lib('format'),
  '@/lib/limits': { LIMITS: new Proxy({}, { get: () => 100 }) },
  '@/lib/heuristics': lib('heuristics'),
  '@/lib/theme': { theme: new Proxy({}, { get: (_, k) => String(k) }), radius: {}, fonts: {}, touchTarget: 48, hitSlopPara: () => 0, spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, type: new Proxy({}, { get: () => 14 }), lh: () => 0 },
};
function componente(arquivo) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(ler(arquivo), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, console, Date: DataFalsa, Math, Number, String, Object, Array, JSON, Proxy,
    require: (n) => { assert.ok(n in mods, `import inesperado em ${arquivo}: ${n}`); return mods[n]; } }, { filename: arquivo });
  return exports;
}
mods['@/components/LinhaDataDaCompra'] = componente('components/LinhaDataDaCompra.tsx');
const TransactionSheet = componente('components/TransactionSheet.tsx').default;

function* nos(no) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { for (const n of no) yield* nos(n); return; }
  yield no;
  yield* nos(no.props?.children);
}
const texto = (n) => [...nos(n)].filter((x) => typeof x !== 'object').join('') || [].concat(n.props?.children ?? []).filter((c) => typeof c !== 'object').join('');
const textos = (arvore) => [...nos(arvore)].filter((n) => n.type === 'Text').map((n) => [].concat(n.props.children).filter((c) => typeof c !== 'object').join(''));

const gravados = [];
let props;
const render = () => { cursor = 0; return TransactionSheet(props); };
const BASE = { type: 'out', description: 'Mercado', amount: '50,00', category: 'Alimentação', color: '#fff', occurred_on: '2026-09-26', recurring: false, installments: 1, card_id: null, wallet_id: 'p' };
function abrir(extra = {}, inicial = {}) {
  celulas.length = 0;
  gravados.length = 0;
  props = {
    visible: true, onClose() {}, modo: 'carteira', editando: false, salvando: false, onSalvar: (v) => gravados.push(v),
    carteiras: [{ id: 'total', name: 'Total' }, { id: 'p', name: 'Pessoal', is_default: true, color: '#0f0' }, { id: 's', name: 'Salário', color: '#00f' }],
    inicial: { ...BASE, ...inicial },
    ...extra,
  };
  return render();
}
const porRotulo = (arvore, re) => [...nos(arvore)].find((n) => re.test(String(n.props?.accessibilityLabel)));
const salvar = () => [...nos(render())].find((n) => n.props?.onPress?.name === 'salvar').props.onPress();
const seletor = () => [...nos(render())].find((n) => n.type === 'DatePickerModal');
const indice = (arvore, pred) => [...nos(arvore)].findIndex(pred);

/* ── 1. Sem extras: o manual de sempre ─────────────────────────────────── */
{
  const tela = abrir({}, { description: '' });
  assert.ok(!textos(tela).some((t) => /^Ouvi: /.test(t)), 'sem fala, nenhuma faixa "Ouvi:"');
  assert.ok(porRotulo(tela, /^Tipo: saída$/) && porRotulo(tela, /^Tipo: entrada$/), 'Saída | Entrada presentes');
  assert.ok(textos(tela).includes('Carteira'), 'rótulo "Carteira"');
  assert.ok(porRotulo(tela, /^Data: hoje$/) && porRotulo(tela, /^Data: ontem$/) && porRotulo(tela, /^Data: escolher no calendário$/), 'Hoje | Ontem | Calendário');
  assert.ok(textos(tela).includes('Repetir mensalmente'), '"Repetir mensalmente"');
  assert.ok(!porRotulo(tela, /^Carteira Total$/), '"Total" não é carteira de lançamento');
  salvar();
  assert.equal(gravados.length, 0, 'manual: descrição vazia continua bloqueando');
  ok('sem extras, a janela do manual não muda (descrição obrigatória, sem faixa, sem link)');
}

/* ── 2. Extras de origem, no lugar ─────────────────────────────────────── */
{
  let tocou = 0;
  const tela = abrir({
    falaOuvida: 'mercado 50 reais',
    avisoDeOrigem: { type: 'AvisoDeOrigem', props: {} },
    camposExtras: { type: 'CamposExtras', props: {} },
    acaoSecundaria: { rotulo: 'Gravar de novo', onPress: () => { tocou++; } },
  });
  assert.ok(textos(tela).includes('Ouvi: "mercado 50 reais"'), 'a faixa "Ouvi:" traz a fala');
  const iOuvi = indice(tela, (n) => n.type === 'Text' && /^Ouvi: /.test([].concat(n.props.children).join('')));
  const iTitulo = indice(tela, (n) => n.props?.accessibilityRole === 'header');
  const iAviso = indice(tela, (n) => n.type === 'AvisoDeOrigem');
  const iDescricao = indice(tela, (n) => n.props?.accessibilityLabel === 'Descrição do lançamento');
  const iValor = indice(tela, (n) => n.props?.accessibilityLabel === 'Valor do lançamento em reais');
  const iExtras = indice(tela, (n) => n.type === 'CamposExtras');
  const iCategoria = indice(tela, (n) => /^Categoria: /.test(String(n.props?.accessibilityLabel)));
  const iSalvar = indice(tela, (n) => n.props?.onPress?.name === 'salvar');
  const link = porRotulo(tela, /^Gravar de novo$/);
  const iLink = indice(tela, (n) => n === link);
  assert.ok(iTitulo < iOuvi && iOuvi < iAviso && iAviso < iDescricao, 'título, "Ouvi:", aviso de origem e só então os campos');
  assert.ok(iValor < iExtras && iExtras < iCategoria, 'campos extras entre o valor e a categoria');
  assert.ok(link && iSalvar < iLink, 'a ação secundária fica abaixo do Salvar');
  assert.equal(link.props.accessibilityRole, 'button');
  link.props.onPress();
  assert.equal(tocou, 1, 'e chama quem a passou');
  assert.equal(texto(porRotulo(tela, /^Tipo: saída$/)) !== undefined, true);
  ok('"Ouvi:", aviso de origem, campos extras e ação secundária entram no fluxo da janela do manual');
}

/* ── 3. Selo e dica da data ────────────────────────────────────────────── */
{
  let tela = abrir({ seloDaData: 'lida do texto', dicaDaData: null, semDataFutura: true });
  assert.equal(porRotulo(tela, /^Data do lançamento:/).props.accessibilityLabel, 'Data do lançamento: 26 set 2026, lida do texto', 'o selo acompanha a data lida');
  assert.ok(textos(tela).includes('lida do texto'));
  seletor().props.onSelectDate('2026-10-02');
  tela = render();
  assert.equal(porRotulo(tela, /^Data do lançamento:/).props.accessibilityLabel, 'Data do lançamento: 30 set 2026', 'escolhida outra data, o selo some (e a futura vira hoje)');
  assert.ok(!textos(tela).includes('lida do texto'));

  tela = abrir({ dicaDaData: 'Você disse 01/10, que ainda não chegou.', semDataFutura: true }, { occurred_on: '' });
  assert.ok(textos(tela).includes('Você disse 01/10, que ainda não chegou.'), 'a dica da data aparece na janela');
  salvar();
  assert.equal(gravados.length, 0, 'sem data, nada é gravado');
  assert.ok(textos(render()).includes('Escolha a data'), 'e a janela pede a data');
  porRotulo(render(), /^Data: ontem$/).props.onPress();
  assert.ok(!textos(render()).includes('Você disse 01/10, que ainda não chegou.'), 'escolhida a data por "Ontem", a dica some');
  salvar();
  assert.equal(gravados.at(-1)?.occurred_on, '2026-09-29', 'e a data escolhida é a gravada');
  ok('selo e dica da data ficam na janela até a pessoa escolher outra data');
}

/* ── 4. descricaoPadrao, somenteSaida, semCarteiraPadrao ───────────────── */
{
  abrir({ descricaoPadrao: 'Sem descrição' }, { description: '   ' });
  salvar();
  assert.equal(gravados.at(-1)?.description, 'Sem descrição', 'origem de captura: descrição vazia grava o texto padrão');

  let tela = abrir({ somenteSaida: true }, { type: 'in' });
  assert.ok(!porRotulo(tela, /^Tipo: /), 'somenteSaida: sem Saída | Entrada');
  assert.equal([...nos(tela)].find((n) => n.type === 'CategoryPickerModal').props.tipo, 'out', 'e a lista de categorias é a de saída');
  salvar();
  assert.equal(gravados.at(-1)?.type, 'out', 'e grava saída');

  tela = abrir({ semCarteiraPadrao: true }, { wallet_id: '' });
  assert.ok(![...nos(tela)].some((n) => /^Carteira /.test(String(n.props?.accessibilityLabel)) && n.props.accessibilityState?.selected), 'semCarteiraPadrao: nenhuma carteira escolhida ao abrir');
  salvar();
  assert.equal(gravados.length, 0, 'sem carteira, nada é gravado');
  assert.ok(textos(render()).includes('Escolha em qual carteira este lançamento deve entrar.'), 'e a janela pede a carteira');
  porRotulo(render(), /^Carteira Salário$/).props.onPress();
  salvar();
  assert.equal(gravados.at(-1)?.wallet_id, 's', 'a carteira escolhida é a gravada');

  tela = abrir({}, { wallet_id: '' });
  salvar();
  assert.equal(gravados.at(-1)?.wallet_id, 'p', 'sem a prop, o manual continua caindo na carteira padrão');
  ok('descrição padrão, só saída e carteira sem padrão fazem o que dizem; o manual segue igual');
}

/* ── 5. Categoria pelo seletor, nunca chips ────────────────────────────── */
{
  const fonte = ler('components/TransactionSheet.tsx');
  assert.doesNotMatch(fonte, /CategoryChips/, 'a janela não tem nuvem de categorias');
  const tela = abrir({ falaOuvida: 'x' }, { category: '' });
  assert.ok(porRotulo(tela, /^Categoria: não escolhida$/), 'a categoria é a linha "Categoria, Escolher"');
  salvar();
  assert.equal(gravados.length, 0, 'sem categoria, não grava');
  assert.equal([...nos(render())].find((n) => n.type === 'CategoryPickerModal').props.visible, true, 'e a lista abre sozinha');
  ok('categoria sempre pelo seletor; sem escolha, pergunta e abre a lista');
}

console.log(`\n${checagens} checagens dos extras da janela única passaram — 0 falhas`);
