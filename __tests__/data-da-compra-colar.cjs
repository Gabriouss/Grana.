/*
 * "Data da compra" editável no Colar, a mesma linha da foto (30/09/2026).
 *
 *   node __tests__/data-da-compra-colar.cjs
 *
 * Executa o components/PasteReceiptModal.tsx REAL, com o
 * components/LinhaDataDaCompra.tsx REAL e as funções reais de leitura
 * (lib/nota-foto-parser, lib/heuristics, lib/format), num mini-runtime de
 * hooks. O relógio é falso (30/09/2026, America/Sao_Paulo). Afirma o que
 * chega ao gravador (`occurred_on`), e não só o que aparece:
 *   1. data lida do texto: campo com o selo "lida do texto", editável, e a
 *      data escolhida é a gravada; futura no seletor vira hoje;
 *   2. texto sem data: hoje, sem selo;
 *   3. data recusada: campo sem data, dica, e o Salvar não grava até a
 *      pessoa escolher;
 *   4. revisão de voz: sem a linha e com a data de hoje, como o widget
 *      (a data da fala entra na feature da voz, num commit só).
 */
process.env.TZ = 'America/Sao_Paulo';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const desfechoReal = require('./desfecho-voz-real.cjs');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (c, nome) => { assert.ok(c, nome); checagens++; console.log('  ok  ' + nome); };

const AGORA = new Date(2026, 8, 30, 12, 0, 0).getTime();
class DataFalsa extends Date {
  constructor(...a) { if (a.length) super(...a); else super(AGORA); }
  static now() { return AGORA; }
}

const compilar = (arquivo, jsx) => ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;

/* lib/ REAL, com o relógio falso. */
const libs = new Map();
function lib(nome) {
  if (libs.has(nome)) return libs.get(nome);
  const exports = {};
  libs.set(nome, exports);
  vm.runInNewContext(compilar(`lib/${nome}.ts`), {
    exports, console, JSON, Date: DataFalsa, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
    require: (id) => {
      if (id.startsWith('./')) return lib(id.slice(2));
      throw new Error(`import não simulado em lib/${nome}: ${id}`);
    },
  }, { filename: `lib/${nome}.ts` });
  return exports;
}

/* ── mini-runtime de hooks (efeito só quando as dependências mudam) ────── */
const celulas = [];
let cursor = 0;
const react = {
  useState(inicial) {
    const k = cursor++;
    if (!(k in celulas)) celulas[k] = typeof inicial === 'function' ? inicial() : inicial;
    return [celulas[k], (v) => { celulas[k] = typeof v === 'function' ? v(celulas[k]) : v; }];
  },
  useRef(inicial) {
    const k = cursor++;
    if (!(k in celulas)) celulas[k] = { current: inicial };
    return celulas[k];
  },
  useEffect(efeito, deps) {
    const k = cursor++;
    const antes = celulas[k];
    if (!antes || !deps || deps.some((d, i) => d !== antes[i])) { celulas[k] = deps ?? []; efeito(); }
  },
};

const registro = { alertas: [], gravados: [], voz: [] };
const imports = {
  react,
  'react/jsx-runtime': {
    Fragment: 'Fragment',
    jsx: (type, props) => (typeof type === 'function' ? type(props) : { type, props }),
    jsxs: (type, props) => (typeof type === 'function' ? type(props) : { type, props }),
  },
  'react-native': { ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View', ScrollView: 'ScrollView' },
  './AppModal': { __esModule: true, default: 'AppModal' },
  '@/lib/alerta': { Alert: { alert: (...a) => registro.alertas.push(a) } },
  '@expo/vector-icons/Ionicons': 'Ionicons',
  '@/lib/theme': { theme: {}, radius: {}, spacing: {}, type: {}, fonts: {}, touchTarget: 48, lh: () => 0 },
  '@/lib/heuristics': lib('heuristics'),
  '@/lib/format': lib('format'),
  '@/lib/nota-foto-parser': lib('nota-foto-parser'),
  '@/lib/voz-confiabilidade': lib('voz-confiabilidade'),
  '@/lib/limits': lib('limits'),
  '@/lib/data': { fetchCategories: async () => [] },
  '@/lib/offline-cache': { salvarOuGuardarNoAparelho: async (input) => { registro.gravados.push(input); return { guardado: false }; } },
  '@/lib/lancamentos-alterados': { marcarLancamentosAlterados() {} },
  '@/lib/erros': { mensagemErro: (e) => String(e) },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
  '@/lib/wallet-context': { useWallet: () => ({ wallets: [{ id: 'w', name: 'AUDIT', is_default: true, color: '#fff' }], activeWallet: { id: 'w' } }) },
  './CategoryChips': 'CategoryChips',
  './AppPressable': 'AppPressable',
  './Sheet': 'Sheet',
  './DatePickerModal': 'DatePickerModal',
  'expo-crypto': { randomUUID: () => 'op-1' },
  '@/lib/voice-operations': {
    desfechoDaOperacaoVoz: desfechoReal,
    registrarOperacaoVoz: async (id, source, payload, transcricao, falaGuardada) => {
      registro.voz.push({ id, source, payload, falaGuardada });
      return { status: 'committed', operationId: id, kind: payload.kind, ids: ['tx'], replayed: false };
    },
  },
  '@/lib/voz': { mensagemDeErroVoz: (c) => ({ titulo: 'Erro ' + c, texto: '' }) },
};
function componente(arquivo) {
  const exports = {};
  vm.runInNewContext(compilar(arquivo, true), {
    exports, console, Promise, String, Number, Object, Array, JSON, Date: DataFalsa,
    require: (n) => { assert.ok(n in imports, `import não simulado em ${arquivo}: ${n}`); return imports[n]; },
  }, { filename: arquivo });
  return exports;
}
imports['./LinhaDataDaCompra'] = componente('components/LinhaDataDaCompra.tsx');
const PasteReceiptModal = componente('components/PasteReceiptModal.tsx').default;

let props;
const render = () => { cursor = 0; return PasteReceiptModal(props); };
function achar(no, pred, acc = []) {
  if (!no || typeof no !== 'object') return acc;
  if (Array.isArray(no)) { no.forEach((n) => achar(n, pred, acc)); return acc; }
  if (pred(no)) acc.push(no);
  achar(no.props?.children, pred, acc);
  return acc;
}
const porRotulo = (arvore, re) => achar(arvore, (n) => re.test(String(n.props?.accessibilityLabel)))[0];
const linhaData = (arvore) => porRotulo(arvore, /^Data da compra:/);
const seletor = (arvore) => achar(arvore, (n) => n.type === 'DatePickerModal')[0];
const textos = (arvore) => achar(arvore, (n) => n.type === 'Text').map((n) => [].concat(n.props.children).join(''));
const esperar = () => new Promise((r) => setImmediate(r));

function abrir(extra = {}) {
  celulas.length = 0;
  props = { visible: true, onClose() {}, onSuccess() {}, ...extra };
  return render();
}
function colar(texto) {
  abrir();
  porRotulo(render(), /^Texto do comprovante$/).props.onChangeText(texto);
  achar(render(), (n) => n.props?.onPress?.name === 'handleProcessText')[0].props.onPress();
  return render();
}
async function salvar() {
  await achar(render(), (n) => n.props?.onPress?.name === 'handleSave')[0].props.onPress();
  await esperar();
}

(async () => {
  /* ── 1. Data lida do texto: selo, edição e a data gravada ─────────────── */
  let tela = colar('Pix enviado para Mercado AUDIT R$ 50,00 em 26/09/2026 18:42');
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data da compra: 26 set 2026, lida do texto. Toque para mudar', 'a data do texto aparece no campo, com o selo');
  ok(!textos(tela).some((t) => /Também reconhecido:.*data/.test(t)), 'a data não aparece mais como chip em "Também reconhecido"');
  linhaData(tela).props.onPress();
  ok(seletor(render()).props.visible === true && seletor(render()).props.currentISO === '2026-09-26', 'o toque abre o seletor na data lida');
  seletor(render()).props.onSelectDate('2026-10-02');
  ok(linhaData(render()).props.accessibilityLabel === 'Data da compra: 30 set 2026. Toque para mudar', 'futura no seletor vira hoje, sem selo');
  ok(seletor(render()).props.visible === false, 'o seletor fecha');
  seletor(render()).props.onSelectDate('2026-09-20');
  registro.gravados.length = 0;
  await salvar();
  ok(registro.gravados.length === 1 && registro.gravados[0].occurred_on === '2026-09-20', 'grava a data escolhida no campo');

  /* ── 2. Sem data no texto: hoje, sem selo ─────────────────────────────── */
  tela = colar('Pix enviado para Mercado AUDIT R$ 50,00');
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data da compra: 30 set 2026. Toque para mudar', 'sem data no texto, hoje e sem selo');
  registro.gravados.length = 0;
  await salvar();
  ok(registro.gravados[0]?.occurred_on === '2026-09-30', 'grava hoje');

  /* ── 3. Data recusada: campo sem data, dica e Salvar bloqueado ────────── */
  tela = colar('Pix enviado para Mercado AUDIT R$ 50,00 em 05/10/2026 18:42');
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data da compra: Escolha a data. Toque para escolher', 'data futura no texto: o campo fica sem data');
  ok(textos(tela).includes('A data do texto não foi usada. Escolha a data.'), 'com a dica');
  registro.gravados.length = 0;
  registro.alertas.length = 0;
  await salvar();
  ok(registro.gravados.length === 0 && registro.alertas.at(-1)?.[0] === 'Escolha a data', 'o Salvar não grava sem data e pede a escolha');
  linhaData(render()).props.onPress();
  seletor(render()).props.onSelectDate('2026-09-28');
  ok(!textos(render()).includes('A data do texto não foi usada. Escolha a data.'), 'escolhida a data, a dica some');
  await salvar();
  ok(registro.gravados.length === 1 && registro.gravados[0].occurred_on === '2026-09-28', 'e grava a data escolhida');

  /* ── 4. Revisão de voz: comportamento de hoje (sem linha, data de hoje) ─ */
  abrir({ initialText: 'mercado 50 reais ontem', falaGuardada: 'fala-1' });
  tela = render();
  ok(!linhaData(tela), 'a revisão de voz não mostra a linha neste commit');
  registro.voz.length = 0;
  await salvar();
  ok(registro.voz.length === 1 && registro.voz[0].payload.occurred_on === '2026-09-30' && registro.voz[0].falaGuardada === 'fala-1',
    'a revisão de voz grava hoje, como o widget, com a fala guardada');

  console.log(`\n${checagens} checagens da data da compra no Colar passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });
