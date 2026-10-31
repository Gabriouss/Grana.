// Executa o callback load e os JSX reais da Inicio; apenas I/O e React sao dubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
const ast = ts.createSourceFile('inicio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result;
  function visit(node) { if (!result && predicate(node)) result = node; if (!result) ts.forEachChild(node, visit); }
  visit(ast); assert.ok(result, 'trecho real encontrado'); return result;
}
const callback = find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'load').initializer;
const card = find(n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'SafeToSpendCard');
const timeline = find(n => ts.isPropertyAssignment(n) && n.name.getText(ast) === 'timeline').initializer;
const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
const runtime = { jsx, jsxs: jsx, Fragment: 'Fragment' };
function compile(code, filename, env = {}, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(code, { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, console: { error() {} }, ...env, require(id) {
    if (id === 'react/jsx-runtime') return runtime;
    if (id in mocks) return mocks[id];
    throw Error('import nao simulado: ' + id);
  } }, { filename });
  return exports;
}
const token = new Proxy({}, { get: () => 16 });
const SafeToSpendCard = compile(fs.readFileSync(path.join(root, 'components/SafeToSpendCard.tsx'), 'utf8'), 'card.tsx', {}, {
  'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: x => x } },
  '@/lib/theme': { theme: token, radius: token, spacing: token, card: token, fonts: token, type: token, lh: () => 20 },
  '@/lib/format': { formatMoney: n => n.toFixed(2), formatBRLSaldo: String, formatBRLSubtraido: String },
  '@/lib/safe-to-spend': { rotuloDiasRestantes: n => `${n} dias` },
  './PrivacyValue': { default: ({ children }) => jsx('PrivacyValue', { children }) },
}).default;
const data = { livrePorDia: 10, livreTotal: 100, saldoAtual: 200, reservadoEmMetas: 50, creditoNaoPago: 50, diasRestantes: 10 };
function visible(node) {
  if (node == null || node === false) return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(visible).join(' ');
  const p = node.props || {};
  if (p.accessibilityElementsHidden || p.importantForAccessibility === 'no-hide-descendants') return '';
  return visible(p.children);
}
function deferred() { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const turn = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function scenario(failCore = false) {
  const calls = [], states = { fontesLivreDisponiveis: true, carregandoFontesLivre: false, invoicePayments: [{ old: true }] };
  const goals = deferred(), payments = deferred();
  const env = {
    useCallback: fn => fn, cargaAtualInicio: { current: 0 }, versaoLancamentosCarregada: { current: -1 },
    versaoDosLancamentos: () => 7, isDemoMode: false,
    fetchTransactions: async () => { calls.push('transactions'); if (failCore) throw Error('rede indisponivel'); return [{ id: 'novo' }]; },
    fetchBills: async () => { calls.push('bills'); return []; },
    fetchBudgets: async () => { calls.push('budgets'); return []; },
    fetchCreditCards: async () => { calls.push('cards'); return []; },
    fetchGoals: () => { calls.push('goals'); return goals.promise; },
    fetchCardInvoicePayments: () => { calls.push('payments'); return payments.promise; },
    fetchGamification: async () => ({ lifetime_xp: 0 }),
    carregarNotifPrefs: async () => ({ lembreteDiarioAtivo: false }), cancelDailyHabitReminder: async () => {},
    ehTabelaNovaAusente: () => false, isLikelyNetworkError: () => false, mensagemErro: () => 'falha principal',
  };
  for (const key of ['Transactions', 'Bills', 'Budgets', 'CreditCards', 'Error', 'Goals', 'LifetimeXp', 'Loading', 'Refreshing', 'InvoicePayments', 'FontesLivreDisponiveis', 'CarregandoFontesLivre']) {
    const state = key[0].toLowerCase() + key.slice(1);
    env['set' + key] = value => { states[state] = value; };
  }
  const load = compile(`exports.load = ${callback.getText(ast)};`, 'load.tsx', env).load;
  function render() {
    const scope = { ...states, SafeToSpendCard, safeToSpend: data, arquetipoSugerido: null,
      View: 'View', Text: 'Text', styles: {}, comprometimentoFuturo: [{ total: 10 }],
      FutureTimelineChart: () => jsx('Text', { children: 'PROJECAO 10' }), spacing: token };
    const cardTree = compile(`exports.tree = ${card.getText(ast)};`, 'card-use.tsx', scope).tree;
    const timelineTree = compile(`exports.render = ${timeline.getText(ast)};`, 'timeline.tsx', scope).render();
    return { card: visible(cardTree), timeline: visible(timelineTree), cardTree, timelineTree };
  }
  return { load, states, calls, goals, payments, render, env };
}
async function main() {
  const s = scenario(), work = s.load(); await turn();
  assert.deepEqual(s.calls, ['transactions', 'bills', 'budgets', 'cards', 'goals']);
  assert.equal(s.states.transactions[0].id, 'novo', 'lista atualizada antes das fontes opcionais');
  assert.equal(s.states.invoicePayments, null, 'pagamentos antigos nunca combinam com lancamentos novos');
  assert.doesNotMatch(s.render().card, /indisponível|Atualize/, 'busca pendente nao e falha do Livre');
  assert.match(s.render().card, /Conferindo/, 'recarga tem recibo neutro');
  assert.doesNotMatch(s.render().card, /10\.00|200/, 'valores ainda nao conferidos ficam ocultos');
  assert.doesNotMatch(s.render().timeline, /Não consegui|PROJECAO/, 'projecao pendente nao afirma falha ou valor');
  function views(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach(n => views(n, out)); return out; }
    if (node.type === 'View') out.push(node);
    views(node.props?.children, out); return out;
  }
  // O espaço vem dos próprios valores, que seguem no fluxo: altura fixa sobrava no card normal.
  assert.equal(views(s.render().cardTree).some(n => n.props.style?.minHeight), false, 'card sem altura minima escrita a mao');
  const hiddenValues = views(s.render().cardTree).find(n => n.props.importantForAccessibility === 'no-hide-descendants');
  assert.ok(hiddenValues, 'valores continuam no fluxo durante a espera');
  assert.equal(hiddenValues.props.style.opacity, 0, 'dados antigos invisiveis e fora da acessibilidade');
  assert.equal(hiddenValues.props['aria-hidden'], true);
  const reservedTimeline = views(s.render().timelineTree).find(n => n.props.style?.minHeight === 168);
  assert.ok(reservedTimeline, 'projecao reserva espaco enquanto busca');
  s.goals.resolve([]); await turn();
  assert.equal(s.calls.at(-1), 'payments');
  assert.doesNotMatch(s.render().timeline, /Não consegui/);
  s.payments.resolve([]); await work;
  assert.match(s.render().card, /10\.00/); assert.match(s.render().timeline, /PROJECAO/);
  assert.equal(views(s.render().cardTree).some(n => n.props.style?.minHeight), false, 'sem sobra de altura no sucesso');
  assert.ok(views(s.render().timelineTree).find(n => n.props.style?.minHeight === 168), 'mesmo espaco no sucesso');
  assert.equal(s.env.versaoLancamentosCarregada.current, 7);
  console.log('ok: pendente de cofrinhos e pagamentos, depois sucesso sem valor misturado');

  for (const fail of ['goals', 'payments']) {
    const s = scenario(), work = s.load(); await turn();
    if (fail === 'goals') s.goals.reject(Error('cofrinhos indisponiveis')); else s.goals.resolve([]);
    await turn();
    if (fail === 'payments') s.payments.reject(Error('pagamentos indisponiveis')); else s.payments.resolve([]);
    await work;
    assert.match(s.render().card, /Livre indisponível/);
    assert.equal(s.states.transactions[0].id, 'novo', 'falha opcional preserva lancamentos');
    assert.equal(s.states.error, null, 'falha opcional nao derruba tela');
    assert.deepEqual(s.calls, ['transactions', 'bills', 'budgets', 'cards', 'goals', 'payments']);
    assert.equal(/Não consegui confirmar os pagamentos/.test(s.render().timeline), fail === 'payments');
    console.log('ok: falha real de ' + fail + ' visivel sem derrubar lista');
  }
  const failedCore = scenario(true);
  Object.assign(failedCore.states, { fontesLivreDisponiveis: false, carregandoFontesLivre: true, invoicePayments: null });
  await failedCore.load();
  assert.deepEqual(failedCore.calls, ['transactions', 'bills', 'budgets', 'cards']);
  assert.equal(failedCore.states.error, 'falha principal');
  assert.match(failedCore.render().card, /Livre indisponível/, 'falha principal nao deixa recibo de busca pendente');
  console.log('ok: falha da busca principal encerra carregamento');
}
module.exports = main;
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
