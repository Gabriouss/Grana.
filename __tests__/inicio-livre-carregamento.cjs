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
const foco = find(n => ts.isCallExpression(n) && n.expression.getText(ast) === 'useFocusEffect').arguments[0];
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
function scenario(failCore = { on: false }) {
  const calls = [], states = { fontesLivreDisponiveis: true, carregandoFontesLivre: false, invoicePayments: [{ old: true }] };
  let goals = deferred(), payments = deferred();
  const env = {
    useCallback: fn => fn, cargaAtualInicio: { current: 0 }, versaoLancamentosCarregada: { current: -1 }, repetirFontesNoFoco: { current: false },
    versaoDosLancamentos: () => 7, isDemoMode: false,
    fetchTransactions: async () => { calls.push('transactions'); if (failCore.on) throw Error('rede indisponivel'); return [{ id: 'novo' }]; },
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
  const leves = [];
  const focar = compile(`exports.focar = ${foco.getText(ast)};`, 'foco.tsx', { ...env, load, carregarDadosLeves: async () => { leves.push(1); },
    ultimoModoCarregadoRef: { current: false }, carregarPerfil: async () => null, carregarDiagnostico: async () => null, setDiagnostico() {},
    carregarLayoutHome: async () => null, setHomeLayout() {}, pieAnim: { setValue() {} }, reduzirMovimento: true }).focar;
  const cargas = () => calls.filter(c => c === 'transactions').length;
  return { load, states, calls, get goals() { return goals; }, get payments() { return payments; }, render, env, focar, leves, cargas,
    renovar() { goals = deferred(); payments = deferred(); } };
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
  const failedCore = scenario({ on: true });
  Object.assign(failedCore.states, { fontesLivreDisponiveis: false, carregandoFontesLivre: true, invoicePayments: null });
  await failedCore.load();
  assert.deepEqual(failedCore.calls, ['transactions', 'bills', 'budgets', 'cards']);
  assert.equal(failedCore.states.error, 'falha principal');
  assert.match(failedCore.render().card, /Livre indisponível/, 'falha principal nao deixa recibo de busca pendente');
  console.log('ok: falha da busca principal encerra carregamento');

  // Carga substituída: quem encerra a espera é a carga vigente.
  const sucesso = scenario(); let a = sucesso.load(); await turn(); let b = sucesso.load(); await turn();
  assert.equal(sucesso.states.carregandoFontesLivre, true);
  sucesso.goals.resolve([]); await turn(); sucesso.payments.resolve([]); await Promise.all([a, b]);
  assert.equal(sucesso.states.carregandoFontesLivre, false);
  assert.match(sucesso.render().card, /10.00/);
  const corte = { on: false }, comCorte = scenario(corte); a = comCorte.load(); await turn(); corte.on = true; await comCorte.load();
  assert.equal(comCorte.states.carregandoFontesLivre, false, 'substituta com falha principal nao prende em Conferindo');
  assert.match(comCorte.render().card, /Livre indisponível/);
  comCorte.goals.reject(Error('resposta velha')); await a;
  assert.equal(comCorte.states.carregandoFontesLivre, false);
  console.log('ok: carga substituida nunca prende o estado neutro');

  // Responde às fontes da carga em andamento; `falhar` diz qual delas recusa.
  async function fontes(s, falhar) {
    if (falhar === 'goals') s.goals.reject(Error('cofrinhos indisponiveis')); else s.goals.resolve([]);
    await turn();
    if (falhar === 'payments') s.payments.reject(Error('pagamentos indisponiveis')); else s.payments.resolve([]);
    await turn();
  }

  const leve = scenario(); leve.load(); await turn(); await fontes(leve);
  leve.focar(); leve.focar(); await turn();
  assert.equal(leve.cargas(), 1, 'sem falha o foco nao refaz a carga pesada');
  assert.equal(leve.leves.length, 2);
  console.log('ok: sem falha o foco continua leve');

  for (const falha of ['goals', 'payments']) {
    const s = scenario(); s.load(); await turn(); await fontes(s, falha);
    assert.match(s.render().card, /Livre indisponível/);
    await turn();
    assert.equal(s.cargas(), 1, 'falha nao dispara nova tentativa sozinha');

    s.renovar(); s.focar(); await turn();
    assert.equal(s.cargas(), 2, 'foco depois de falha tenta de novo com carga completa');
    assert.equal(s.leves.length, 0);
    assert.match(s.render().card, /Conferindo/);
    s.focar(); await turn();
    assert.equal(s.cargas(), 2, 'foco nao sobrepoe a nova tentativa em andamento');

    await fontes(s, falha);
    assert.equal(s.states.carregandoFontesLivre, false, 'nova falha nao prende em Conferindo');
    assert.match(s.render().card, /Livre indisponível/, 'nova falha mantem a mensagem');
    await turn();
    assert.equal(s.cargas(), 2, 'nova falha nao vira laco');

    s.renovar(); s.focar(); await turn(); await fontes(s);
    assert.equal(s.cargas(), 3, 'cada foco faz uma tentativa');
    assert.match(s.render().card, /10\.00/, 'fonte de volta devolve o Livre sem puxar');
    assert.doesNotMatch(s.render().timeline, /Não consegui/);
    s.focar(); await turn();
    assert.equal(s.cargas(), 3, 'depois de recuperar, o foco volta a ser leve');
    console.log('ok: falha de ' + falha + ' recupera no foco, sem laco nem sobreposicao');
  }

  const corteNoFoco = { on: false }, s2 = scenario(corteNoFoco); s2.load(); await turn(); await fontes(s2, 'payments');
  corteNoFoco.on = true; s2.renovar(); s2.focar(); await turn();
  assert.equal(s2.cargas(), 2);
  assert.equal(s2.states.carregandoFontesLivre, false);
  assert.match(s2.render().card, /Livre indisponível/);
  corteNoFoco.on = false; s2.renovar(); s2.focar(); await turn(); await fontes(s2);
  assert.equal(s2.cargas(), 3, 'falha da busca principal na nova tentativa nao perde a proxima');
  assert.match(s2.render().card, /10\.00/);
  console.log('ok: falha principal na nova tentativa nao perde a proxima');
}
module.exports = main;
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
