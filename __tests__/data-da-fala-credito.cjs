/*
 * Revisão de voz no Crédito com a data da fala (data na voz, 30/09/2026).
 *
 *   node __tests__/data-da-fala-credito.cjs
 *
 * Tudo EXECUTADO, com o código REAL da tela (r2 do Forge: grep não prova a
 * integração):
 *   1. `abrirNovaCompraDoTexto`, extraída de app/(app)/credito.tsx e rodada
 *      com as funções reais (heurísticas, confiabilidade da voz e
 *      `dataInicialDaRevisao`): a data inicial do formulário vem do núcleo,
 *      contada da captura; data duvidosa deixa o campo vazio; valor e
 *      descrição leem o texto sem a data.
 *   2. components/TransactionSheet.tsx REAL num mini-runtime de hooks: com
 *      a data vazia, o Salvar não grava e diz "Escolha a data"; com
 *      `semDataFutura`, a futura escolhida no seletor vira hoje; a data
 *      escolhida é a que chega a `onSalvar` (que o Crédito passa como
 *      `occurred_on` ao `registrarOperacaoVoz`).
 *   3. `handleSaveCreditTx`, extraída de credito.tsx e executada, recebe o
 *      que o TransactionSheet real devolve: a chamada a `registrarOperacaoVoz`
 *      leva a data EDITADA, o destino crédito, o cartão e a fatura certa.
 *      `PROVA_CREDITO=<cópia>` roda contra outra versão da tela (prova
 *      vermelha: a data volta a hoje ou a edição é ignorada).
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
const h = lib('heuristics');
const conf = lib('voz-confiabilidade');
const dataDaFala = lib('data-da-fala');

const TELA = process.env.PROVA_CREDITO || 'app/(app)/credito.tsx';
function extrair(nome) {
  const fonte = fs.readFileSync(path.isAbsolute(TELA) ? TELA : path.join(root, TELA), 'utf8');
  const arquivo = ts.createSourceFile('credito.tsx', fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let achada;
  (function visitar(no) { if (ts.isFunctionDeclaration(no) && no.name?.text === nome) achada = no; ts.forEachChild(no, visitar); })(arquivo);
  assert.ok(achada, `${nome} existe em credito.tsx`);
  return ts.transpileModule(achada.getText(arquivo), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
}

/* ── 1. abrirNovaCompraDoTexto, extraída e executada ───────────────────── */
function abrirNovaCompra(texto, ref) {
  const estado = {};
  const alertas = [];
  const wallets = [{ id: 'p', name: 'Pessoal', is_default: true }];
  const cards = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'p', closing_day: 10 }];
  const contexto = {
    ...h, valorSeguroParaRevisaoVoz: conf.valorSeguroParaRevisaoVoz, dataInicialDaRevisao: dataDaFala.dataInicialDaRevisao,
    Alert: { alert: (...a) => alertas.push(a) }, wallets, cards, walletCards: cards, activeWallet: wallets[0], categoriasExtras: [],
    operacaoVoz: {}, randomUUID: () => 'op', todayISO: () => HOJE, formatMoney: (v) => String(v),
    texto, referencia: ref,
  };
  for (const campo of ['EditingTxId', 'TxWalletId', 'TxDesc', 'TxAmount', 'TxCategory', 'TxCatColor', 'TxCardId', 'TxInstallments', 'TxRecurring', 'TxDate', 'NewTxOpen']) {
    contexto['set' + campo] = (v) => { estado[campo] = v; };
  }
  vm.runInNewContext(extrair('abrirNovaCompraDoTexto') + '\nabrirNovaCompraDoTexto(texto, referencia);', contexto);
  return { estado, alertas };
}
{
  let r = abrirNovaCompra('almoço ontem 30 reais no crédito C6', { referencia: HOJE, aproximada: false });
  assert.equal(r.estado.TxDate, '2026-09-29', '"ontem" contado da captura');
  assert.equal(r.estado.TxDesc, 'Almoço', 'a descrição fica sem "ontem"');
  assert.equal(r.estado.TxAmount, '30', 'o valor não é contaminado');
  assert.equal(r.estado.NewTxOpen, true);
  r = abrirNovaCompra('almoço ontem 30 reais no crédito C6', { referencia: '2026-09-27', aproximada: false });
  assert.equal(r.estado.TxDate, '2026-09-26', 'caso 28: fala guardada revista dias depois conta da captura');
  assert.equal(r.alertas.length, 0, 'data segura: nenhum aviso');
  r = abrirNovaCompra('cinema amanhã 40 reais no crédito C6', { referencia: HOJE, aproximada: false });
  assert.equal(r.estado.TxDate, '', 'futura: o campo começa vazio, nada pré-selecionado');
  assert.deepEqual(r.alertas.at(-1), ['Escolha a data', 'Você disse 01/10, que ainda não chegou.'], 'futura: o aviso explica, com a data dita');
  r = abrirNovaCompra('almoço ontem 30 reais no crédito C6', { referencia: HOJE, aproximada: true });
  assert.equal(r.estado.TxDate, '', 'referência aproximada: "ontem" fica para a pessoa escolher');
  assert.deepEqual(r.alertas.at(-1), ['Escolha a data', 'Você disse ontem. Entendi 29/09.'], 'aproximada: o aviso mostra a proposta');
  r = abrirNovaCompra('almoço 30 reais no crédito C6 dia 30 de fevereiro', { referencia: HOJE, aproximada: false });
  assert.deepEqual(r.alertas.at(-1), ['Escolha a data', 'Você disse 30/02, que não existe.'], 'impossível: o aviso explica');
  r = abrirNovaCompra('almoço 30 reais no crédito C6', { referencia: HOJE, aproximada: false });
  assert.equal(r.estado.TxDate, HOJE, 'sem data dita: a data da captura');
  /* Achado 8: "dia 10 reais" é o valor. A revisão do Crédito abre na data
     da captura, com R$ 10, e sem aviso de data. */
  r = abrirNovaCompra('passe do dia 10 reais no crédito C6', { referencia: HOJE, aproximada: false });
  assert.equal(r.estado.TxDate, HOJE, 'achado 8: na data da captura, nunca 10/09');
  assert.equal(r.estado.TxAmount, '10', 'achado 8: o valor é 10');
  assert.equal(r.alertas.length, 0, 'achado 8: sem aviso de data');
}
ok('Crédito: a data inicial da revisão vem do núcleo, contada da captura; duvidosa começa vazia, com aviso e proposta');

/* ── 2. TransactionSheet REAL, mini-runtime de hooks ───────────────────── */
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
const format = lib('format');
const mods = {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View' },
  './AppModal': es('AppModal'),
  './ToggleSwitch': es('ToggleSwitch'),
  '@expo/vector-icons/Ionicons': es('Ionicons'),
  '@/components/AppPressable': es('AppPressable'),
  '@/components/Sheet': es('Sheet'),
  '@/components/DatePickerModal': es('DatePickerModal'),
  '@/components/CategoryPickerModal': es('CategoryPickerModal'),
  '@/lib/format': format,
  '@/lib/limits': { LIMITS: new Proxy({}, { get: () => 100 }) },
  '@/lib/heuristics': h,
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
mods['./AppPressable'] = 'AppPressable';
mods['@/components/LinhaDataDaCompra'] = componente('components/LinhaDataDaCompra.tsx');
const TransactionSheet = componente('components/TransactionSheet.tsx').default;

function* nos(no) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { for (const n of no) yield* nos(n); return; }
  yield no;
  yield* nos(no.props?.children);
}
{
  const gravados = [];
  let props;
  const render = () => { cursor = 0; return TransactionSheet(props); };
  const abrir = (occurred_on, semDataFutura) => {
    celulas.length = 0;
    props = {
      visible: true, onClose() {}, modo: 'credito', editando: false, salvando: false, onSalvar: (v) => gravados.push(v),
      carteiras: [{ id: 'p', name: 'Pessoal', is_default: true }], cartoes: [{ id: 'c6', name: 'C6', wallet_id: 'p' }],
      inicial: { type: 'out', description: 'Almoço', amount: '30', category: 'Alimentação', color: '#fff', occurred_on, recurring: false, installments: 1, card_id: 'c6', wallet_id: 'p' },
      semDataFutura,
    };
    return render();
  };
  const rotulo = (arvore) => [...nos(arvore)].find((n) => /^Data do lançamento:/.test(String(n.props?.accessibilityLabel)))?.props.accessibilityLabel;
  const salvar = () => [...nos(render())].find((n) => n.props?.onPress?.name === 'salvar').props.onPress();
  const seletor = () => [...nos(render())].find((n) => n.type === 'DatePickerModal');
  const erro = () => [...nos(render())].filter((n) => n.type === 'Text').map((n) => [].concat(n.props.children).join('')).find((t) => t === 'Escolha a data');

  let tela = abrir('', true);
  assert.equal(rotulo(tela), 'Data do lançamento: Escolha a data', 'data vazia: o campo diz "Escolha a data"');
  salvar();
  assert.equal(gravados.length, 0, 'sem data, o Salvar não grava');
  assert.equal(erro(), 'Escolha a data', 'e pede a data');
  assert.equal(seletor().props.currentISO, HOJE, 'o seletor abre em hoje, sem quebrar com a data vazia');
  seletor().props.onSelectDate('2026-10-03');
  assert.equal(rotulo(render()), 'Data do lançamento: 30 set 2026', 'semDataFutura: a futura vira hoje');
  seletor().props.onSelectDate('2026-09-20');
  salvar();
  assert.equal(gravados.at(-1)?.occurred_on, '2026-09-20', 'a data escolhida é a que chega ao onSalvar');
  ok('TransactionSheet: data vazia bloqueia o Salvar; na revisão de voz, futura vira hoje; a escolhida é a salva');

  abrir('2026-09-30', false);
  seletor().props.onSelectDate('2026-10-03');
  salvar();
  assert.equal(gravados.at(-1)?.occurred_on, '2026-10-03', 'fora da revisão de voz, o formulário continua como era');
  ok('TransactionSheet fora da revisão de voz: comportamento de antes (sem semDataFutura)');
}

/* ── 3. handleSaveCreditTx REAL, com o que o formulário real devolve ─── */
async function salvarPelaTela(valores) {
  const chamadas = [];
  const alertas = [];
  const contexto = {
    Alert: { alert: (...a) => alertas.push(a) }, parseAmount: format.parseAmount, todayISO: () => HOJE,
    cards: [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'p', closing_day: 10 }],
    editingTxId: null, isDemoMode: false,
    operacaoVoz: { current: 'op-voz' }, falaGuardadaDaRevisao: { current: 'fala-1' },
    registrarOperacaoVoz: async (id, source, payload, transcricao, falaGuardada) => {
      chamadas.push({ id, source, payload, falaGuardada });
      return { status: 'committed', operationId: id, kind: payload.kind, ids: ['tx'], replayed: false };
    },
    desfechoDaOperacaoVoz: require('./desfecho-voz-real.cjs'),
    mensagemDeErroVoz: (c) => ({ titulo: 'Erro ' + c, texto: '' }),
    salvarOuGuardarNoAparelho: async () => assert.fail('a revisão de voz grava pelo núcleo da voz'),
    salvarOuGuardarParceladaNoAparelho: async () => assert.fail('a revisão de voz grava pelo núcleo da voz'),
    updateTransaction: async () => assert.fail('não é edição'),
    marcarLancamentosAlterados() {}, loadData: async () => {}, hapticSuccess() {}, triggerToast() {},
    setTxSaving() {}, setNewTxOpen() {}, setTxDesc() {}, setTxAmount() {}, setTxInstallments() {}, setEditingTxId() {},
    setTransactions() {}, Math, Date: DataFalsa, String, Number, Array, Object,
    valores,
  };
  await vm.runInNewContext(extrair('handleSaveCreditTx') + '\nhandleSaveCreditTx(valores);', contexto);
  return { chamadas, alertas };
}
(async () => {
  const faturaCiclo = lib('faturaCiclo');
  const texto = 'cinema amanhã 40 reais no crédito C6';
  const aberto = abrirNovaCompra(texto, { referencia: HOJE, aproximada: false });
  const gravados = [];
  celulas.length = 0;
  const props = {
    visible: true, onClose() {}, modo: 'credito', editando: false, salvando: false, onSalvar: (v) => gravados.push(v),
    carteiras: [{ id: 'p', name: 'Pessoal', is_default: true }], cartoes: [{ id: 'c6', name: 'C6', wallet_id: 'p' }],
    inicial: { type: 'out', description: aberto.estado.TxDesc, amount: aberto.estado.TxAmount, category: aberto.estado.TxCategory || 'Lazer', color: '#fff',
      occurred_on: aberto.estado.TxDate, recurring: false, installments: 1, card_id: aberto.estado.TxCardId || 'c6', wallet_id: 'p' },
    semDataFutura: true,
  };
  const render = () => { cursor = 0; return TransactionSheet(props); };
  const salvarNoForm = () => [...nos(render())].find((n) => n.props?.onPress?.name === 'salvar').props.onPress();
  render();
  salvarNoForm();
  assert.equal(gravados.length, 0, 'sem escolher a data, o formulário não chega ao handler');
  [...nos(render())].find((n) => n.type === 'DatePickerModal').props.onSelectDate('2026-09-12');
  salvarNoForm();
  assert.equal(gravados.length, 1, 'escolhida a data, o formulário entrega ao handler');

  const { chamadas } = await salvarPelaTela(gravados[0]);
  assert.equal(chamadas.length, 1, 'o handler real grava UMA vez pelo núcleo da voz');
  const { id, source, payload, falaGuardada } = chamadas[0];
  assert.equal(id, 'op-voz');
  assert.equal(source, 'app');
  assert.equal(falaGuardada, 'fala-1', 'com a fala guardada');
  assert.equal(payload.occurred_on, '2026-09-12', 'a data EDITADA vai para a gravação (nem hoje, nem a dita)');
  assert.equal(payload.payment_method, 'credit', 'destino crédito');
  assert.equal(payload.card_id, 'c6');
  assert.equal(payload.wallet_id, 'p');
  assert.equal(payload.kind, 'transaction');
  const fatura = faturaCiclo.mesFaturaDoLancamento(payload.occurred_on, 10);
  assert.deepEqual({ ano: fatura.year, mes: fatura.month }, { ano: 2026, mes: 9 }, 'a compra de 12/09, depois do fechamento do dia 10, cai na fatura de outubro');
  ok('handleSaveCreditTx real: a data editada no formulário real chega ao registrarOperacaoVoz, no crédito, no cartão e na fatura certa');

  console.log(`\n${checagens} checagens da data da fala no Crédito passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });

