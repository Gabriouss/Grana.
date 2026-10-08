// Executa as entradas reais da Início e RespostaVozWidget e a revisão real.
// Transporte/dados de teste são dublês; parsing e formulário vêm dos módulos.
process.env.TZ = 'America/Sao_Paulo';
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const compile = (text, jsx = false) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText;
const read = (file) => fs.readFileSync(file, 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
class Clock extends Date { constructor(...v) { super(...(v.length ? v : [2026, 8, 30, 12])); } static now() { return new Clock().getTime(); } }
const libs = {};
function lib(name) {
  if (libs[name]) return libs[name];
  const exports = libs[name] = {};
  vm.runInNewContext(compile(read(`lib/${name}.ts`)), { exports, Date: Clock, console, require: (id) => lib(id.replace('./', '')) });
  return exports;
}
function extract(file, predicate) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node; (function visit(n) { if (predicate(n, ast)) node = n; ts.forEachChild(n, visit); })(ast);
  assert.ok(node, `entrada real em ${file}`);
  return node.getText(ast);
}
const named = (file, name) => extract(file, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
const appCallback = extract('app/(app)/index.tsx', (n) => ts.isJsxAttribute(n) && n.name.getText() === 'onTranscribed').replace(/^onTranscribed=\{([\s\S]*)\}$/, '$1');
const widgetEffect = extract('app/(app)/index.tsx', (n) => ts.isCallExpression(n) && n.expression.getText() === 'useEffect' && n.arguments[0].getText().includes('params.colarTexto'));
const wallets = [{ id: 'p', name: 'Pessoal', is_default: true, color: '#fff' }];
const cards = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'p', closing_day: 10 }];
const h = lib('heuristics'), fmt = lib('format'), dates = lib('data-da-fala');
async function entrada(source, text, ref, saved) {
  const state = {}, router = { push: (v) => { state.route = v; }, replace() {} };
  const ctx = { ...h, ...dates, wallets, creditCards: cards, router,
    destinoDaFala: (t) => /cr[eé]dito/.test(t) ? 'credito' : 'carteira',
    destinoDaFalaComReferencias: async (t) => /cr[eé]dito/.test(t) ? 'credito' : 'carteira',
    referenciaDaFalaGuardada: async () => ref, todayISO: () => '2026-09-30',
    setVoiceText: (v) => { state.initialText = v; }, setReferenciaDaVoz: (v) => { state.referenciaDaVoz = v; },
    setFalaGuardadaDaRevisao: (v) => { state.falaGuardada = v; }, setPasteModalOpen: (v) => { state.open = v; },
    text, ref, saved,
  };
  if (source === 'app') vm.runInNewContext(compile(`const callback = ${appCallback}; callback(text, ref);`), ctx);
  else {
    await vm.runInNewContext(compile(named('components/RespostaVozWidget.tsx', 'abrirFala') + '\nabrirFala(text, saved, ref);'), ctx);
    ctx.params = state.route.params; ctx.useEffect = (fn) => fn();
    if (state.route.pathname === '/(app)/') vm.runInNewContext(compile(widgetEffect), ctx);
  }
  return state;
}
function revisao(extra) {
  const cells = []; let cursor = 0;
  const react = {
    useState(v) { const k = cursor++; if (!(k in cells)) cells[k] = typeof v === 'function' ? v() : v; return [cells[k], (v) => { cells[k] = typeof v === 'function' ? v(cells[k]) : v; }]; },
    useRef(v) { const k = cursor++; if (!(k in cells)) cells[k] = { current: v }; return cells[k]; },
    useEffect(fn, deps) { const k = cursor++; const old = cells[k]; if (!old || deps.some((v, i) => v !== old[i])) { cells[k] = deps; fn(); } },
  };
  const writes = [], errors = []; let fail = false, hold;
  const mods = {
    react, 'react/jsx-runtime': { Fragment: 'Fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Text: 'Text', TextInput: 'TextInput', View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: (s) => s } },
    './AppModal': 'AppModal', './AppPressable': 'AppPressable', './Sheet': 'Sheet', '@expo/vector-icons/Ionicons': 'Ionicons',
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, type: {}, fonts: {}, hitSlopPara: () => 0, lh: () => 0 },
    '@/lib/heuristics': h, '@/lib/format': fmt, '@/lib/data-da-fala': dates, '@/lib/nota-foto-parser': lib('nota-foto-parser'),
    '@/lib/voz-confiabilidade': lib('voz-confiabilidade'), '@/lib/limits': lib('limits'),
    '@/lib/data': { fetchCategories: async () => [] }, '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
    '@/lib/wallet-context': { useWallet: () => ({ wallets, activeWallet: wallets[0] }) },
    '@/lib/alerta': { Alert: { alert: (...v) => errors.push(v) } }, '@/lib/erros': { mensagemErro: () => 'falha simulada' },
    '@/lib/lancamentos-alterados': { marcarLancamentosAlterados() {} }, 'expo-crypto': { randomUUID: () => 'op' },
    '@/lib/voz': { mensagemDeErroVoz: (v) => ({ titulo: v, texto: v }) },
    '@/lib/offline-cache': { salvarOuGuardarNoAparelho: async (v) => { writes.push(plain(v)); return { guardado: false }; } },
    '@/lib/voice-operations': { desfechoDaOperacaoVoz: require('./desfecho-voz-real.cjs'), registrarOperacaoVoz: async (id, source, payload, _, saved) => {
      writes.push(plain({ id, source, payload, saved }));
      if (hold) await hold;
      if (fail) throw Error('falha simulada');
      return { status: 'committed', operationId: id, ids: ['tx'], replayed: false };
    } },
  };
  mods['./TransactionSheet'] = require('./sheet-real.cjs')(mods, Clock);
  const exports = {};
  vm.runInNewContext(compile(read(process.env.PROVA_PASTE || 'components/PasteReceiptModal.tsx'), true), { exports, Date: Clock, console, require: (id) => { assert.ok(id in mods, id); return mods[id]; } });
  const render = () => { cursor = 0; return exports.default({ visible: true, onClose() {}, onSuccess() {}, ...extra }); };
  render(); const node = render();
  assert.equal(node.type, mods['./TransactionSheet'].default, 'revisão é o formulário do manual');
  return { render, node, writes, errors, fail: (v) => { fail = v; }, hold: (v) => { hold = v; }, sheet: () => node.type(render().props) };
}
function find(node, predicate) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { for (const n of node) { const r = find(n, predicate); if (r) return r; } } else { if (predicate(node)) return node; return find(node.props?.children, predicate); } }
(async () => {
  const ref = { referencia: '2026-09-30', aproximada: false };
  const a = await entrada('app', 'mercado 50 reais ontem', ref);
  const w = await entrada('widget', 'mercado 50 reais ontem', ref, 'fala-widget');
  const app = revisao(a), widget = revisao(w);
  assert.deepEqual(plain(app.node.props.inicial), plain(widget.node.props.inicial), 'débito: valores iguais pelos dois caminhos reais');
  for (const runtime of [app, widget]) {
    const tree = runtime.sheet(); find(tree, (n) => n.props?.onPress?.name === 'salvar').props.onPress();
    await new Promise(setImmediate);
  }
  assert.deepEqual(app.writes[0].payload, widget.writes[0].payload, 'débito: payload igual');
  assert.equal(widget.writes[0].saved, 'fala-widget', 'widget mantém id da fala guardada');
  const focus = revisao({ initialText: 'Refri 829', referenciaDaVoz: ref });
  const input = find(focus.sheet(), (n) => n.type === 'TextInput' && n.props.accessibilityLabel === 'Valor do lançamento em reais');
  assert.equal(input.props.value, ''); assert.equal(input.props.autoFocus, true, 'Refri 829: valor vazio com foco, sem sugerir valor');
  const retry = revisao(a); retry.fail(true);
  const valores = { ...retry.node.props.inicial, description: 'Mercado editado', amount: '65,00' };
  let release; retry.hold(new Promise((r) => { release = r; }));
  const p1 = retry.node.props.onSalvar(valores), p2 = retry.node.props.onSalvar(valores);
  assert.equal(retry.writes.length, 1, 'clique duplo não duplica chamada'); release(); await Promise.all([p1, p2]);
  assert.equal(retry.render().props.visible, true, 'falha preserva revisão');
  assert.equal(retry.errors.at(-1)[0], 'Erro ao salvar'); retry.fail(false); retry.hold(null);
  await retry.render().props.onSalvar(valores);
  assert.equal(retry.writes[1].id, retry.writes[0].id, 'retry mantém requestId');
  assert.equal(retry.writes[1].payload.amount, 65);
  const states = [];
  for (const source of ['app', 'widget']) {
    const route = (await entrada(source, 'almoço ontem 30 reais no crédito C6', ref)).route;
    const state = {}, context = { ...h, ...dates, wallets, cards, walletCards: cards, activeWallet: wallets[0], categoriasExtras: [], operacaoVoz: {}, randomUUID: () => 'op', ...fmt,
      valorSeguroParaRevisaoVoz: lib('voz-confiabilidade').valorSeguroParaRevisaoVoz, Alert: { alert() {} }, text: route.params.texto, ref: dates.referenciaDosParametros(route.params, '2026-09-30') };
    for (const campo of ['FalaOuvida', 'DicaDaDataVoz', 'EditingTxId', 'TxWalletId', 'TxDesc', 'TxAmount', 'TxCategory', 'TxCatColor', 'TxCardId', 'TxInstallments', 'TxRecurring', 'TxDate', 'NewTxOpen']) context['set' + campo] = (v) => { state[campo] = v; };
    vm.runInNewContext(compile(named('app/(app)/credito.tsx', 'abrirNovaCompraDoTexto') + '\nabrirNovaCompraDoTexto(text, ref);'), context);
    states.push(plain(state));
  }
  assert.deepEqual(states[0], states[1], 'crédito: duas entradas reais abrem mesmos valores, faixa e data');
  console.log('janela-unica-paridade: débito e crédito, foco, chamada dupla, falha e retry OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
