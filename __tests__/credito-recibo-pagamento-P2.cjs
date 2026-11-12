// PrismCreditoReciboP2: TSX/handler/loadData e cálculos de fatura reais; fronteiras controladas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
const watchdog = setTimeout(() => { console.error('PrismCreditoReciboP2 FALHA: execução inconclusa'); process.exit(1); }, 20000);
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const pendente = () => { let resolve, reject; const promise = new Promise((s, n) => { resolve = s; reject = n; }); return { promise, resolve, reject }; };
const sessao = (dono = 'A', id = dono + '-sessao', refresh = 'r1') => dono ? { user: { id: dono }, refresh_token: refresh, access_token: 'x.' + Buffer.from(JSON.stringify({ session_id: id })).toString('base64url') + '.x' } : null;
const card = { id: 'cA', user_id: 'A', wallet_id: 'wA', name: 'Cartão sintético', bank: 'nubank', color: '#0af', limit_amount: 1000, closing_day: 15, due_day: 22, last_four: '0000' };
const compra = { id: 'tA', user_id: 'A', type: 'out', description: 'Compra sintética', amount: 100, category: 'Outros', color: '#0af', occurred_on: '2026-11-01', payment_method: 'credit', card_id: 'cA', wallet_id: 'wA', recurring: false, parent_id: null, installment_current: 1, installment_total: 1, created_at: '2026-11-01T12:00:00Z' };
const pagamento = (amount = 100, extra = {}) => ({ id: 'pA', user_id: 'A', card_id: 'cA', year: 2026, month: 10, amount, paid_on: '2026-11-11', wallet_id: 'wA', paid_transaction_id: 'saida-A', extra_transaction_ids: [], created_at: '2026-11-11T12:00:00Z', ...extra });
function nos(no, pred, res = []) { if (no == null || typeof no !== 'object') return res; if (Array.isArray(no)) no.forEach(n => nos(n, pred, res)); else { if (pred(no)) res.push(no); nos(no.props?.children, pred, res); } return res; }
const texto = no => no == null || typeof no === 'boolean' ? '' : typeof no !== 'object' ? String(no) : Array.isArray(no) ? no.map(texto).join(' ') : texto(no.props?.children);
function ambiente(opts = {}) {
  let atual, vivo = true, session = sessao(), demo = !!opts.demo, servidor = opts.restante ? pagamento(40) : null;
  const chamadas = [], alertas = [], logs = [], cache = new Map(), listeners = new Set(), rpc = pendente();
  const mudaram = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    memo: fn => fn,
    useState(ini) { const c = atual, i = c.i++; if (!(i in c.slots)) c.slots[i] = typeof ini === 'function' ? ini() : ini; return [c.slots[i], v => { if (!vivo) chamadas.push(['estado-desmontado']); const novo = typeof v === 'function' ? v(c.slots[i]) : v; if (!Object.is(novo, c.slots[i])) { c.slots[i] = novo; c.sujo = true; } }]; },
    useRef(v) { const c = atual, i = c.i++; return c.slots[i] ??= { current: v }; },
    useCallback(fn, deps) { const c = atual, i = c.i++; if (mudaram(c.slots[i]?.deps, deps)) c.slots[i] = { fn, deps }; return c.slots[i].fn; },
    useMemo(fn, deps) { const c = atual, i = c.i++; if (mudaram(c.slots[i]?.deps, deps)) c.slots[i] = { valor: fn(), deps }; return c.slots[i].valor; },
    useEffect(fn, deps) { const c = atual, i = c.i++, old = c.slots[i]; if (mudaram(old?.deps, deps)) c.efeitos.push(() => { old?.limpar?.(); c.slots[i] = { deps, limpar: fn() }; }); },
  };
  const jsx = (tipo, props, key) => ({ tipo, props: props ?? {}, key });
  class Relogio extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-11T12:00:00-03:00'])); } static now() { return Date.parse('2026-11-11T12:00:00-03:00'); } }
  const wallet = { id: 'wA', user_id: 'A', name: 'Carteira sintética', is_default: true, color: '#0af' }, wallets = [wallet];
  const carregarCartoes = async () => { chamadas.push(['refresh-cartoes']); if (opts.cartoes) return await opts.cartoes.promise; return [card]; };
  const pagar = tipo => async input => { chamadas.push([tipo, input]); const registro = await rpc.promise; servidor = registro; return registro; };
  const mods = {
    react: { __esModule: true, default: react, ...react }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Platform: { OS: 'android' }, ActivityIndicator: 'Busy', FlatList: 'FlatList', SectionList: 'SectionList', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: v => v } },
    'expo-router': { useRouter: () => ({ push() {}, setParams() {} }), useFocusEffect: () => {}, useLocalSearchParams: () => ({}) },
    'expo-crypto': { randomUUID: () => 'uuid-sintetico' }, '@expo/vector-icons/Ionicons': 'Icon',
    '@/lib/auth-context': { useSession: () => ({ session }) }, '@/lib/demo-context': { useDemo: () => ({ isDemoMode: demo }) },
    '@/lib/wallet-context': { useWallet: () => ({ activeWalletId: 'total', activeWallet: wallet, wallets }) },
    '@/lib/privacy-context': { usePrivacy: () => ({ hidden: false, toggle() {} }) },
    '@/lib/teclado': { useKeyboardHeight: () => 0 }, '@/lib/tab-bar': { useTabBarInset: () => ({ paddingConteudoComFab: 40, total: 40 }) },
    '@/lib/breakpoints': { colunaConteudo: {}, useBreakpoint: () => ({ ehCompacto: true }) },
    '@/lib/theme': { fonts: {}, radius: {}, spacing: {}, theme: {}, screenRhythm: {}, card: {}, type: {}, lh: () => 16, touchTarget: 44, hitSlopPara: () => ({}) },
    '@/lib/limits': { LIMITS: {} }, '@/lib/use-categorias': { useCategorias: () => ({ resultado: null }) }, '@/lib/categorias-cliente': { linhasDaCategoria: () => [] },
    '@/lib/abertura-por-parametro': { useAberturaPorParametro() {} },
    '@/lib/voice-operations': {}, '@/lib/voz': {}, '@/lib/heuristics': {}, '@/lib/voz-confiabilidade': {},
    '@/lib/cache-de-tela': { isLikelyNetworkError: () => false }, '@/lib/offline-cache': {}, '@/lib/lancamentos-alterados': {}, '@/lib/excluir-lancamento': {},
    '@/lib/demo-data': { DEMO_CREDIT_CARDS: [card], DEMO_TRANSACTIONS: [compra] }, '@/lib/lancamentos-teste': { lancamentosDeExemplo: () => [compra] },
    '@/lib/alerta': { Alert: { alert: (...v) => alertas.push(v) } },
    '@/lib/haptics': { hapticSuccess: () => chamadas.push(['haptic-sucesso']), hapticTap() {}, hapticDelete() {} },
    '@/components/FaixaOffline': { __esModule: true, default: 'FaixaOffline', useRecarregarAoChegarDadoNovo() {} },
    '@/lib/data': {
      fetchCategories: async () => [], fetchCreditCards: carregarCartoes, fetchCreditTransactionsForMonth: async () => [compra],
      fetchCardInvoicePayments: async () => servidor ? [servidor] : [], fetchDatasDeCompra: async () => ({}),
      fetchRecurrenceContext: async () => { chamadas.push(['recorrencia']); return opts.recorrencia ? await opts.recorrencia.promise : []; },
      criarOcorrenciasRecorrentes: async () => { chamadas.push(['criar-recorrencia']); },
      payCardInvoice: pagar('rpc-fatura'), payCardInvoiceRemainder: pagar('rpc-restante'),
    },
    '@/lib/notifications': {
      carregarNotifPrefs: async () => { chamadas.push(['notificacoes']); return opts.notificacoes ? await opts.notificacoes.promise : { lembretesContasAtivo: false }; },
      scheduleCardInvoiceReminders: async () => {}, cancelCardInvoiceReminders: async () => {}, cancelarLembretesDeCartoesRemovidos: async () => {}, cancelarLembretesDoCartao: async () => {},
    },
  };
  const auth = { onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; } };
  mods['@/lib/supabase'] = { supabase: { auth } }; mods['./supabase'] = mods['@/lib/supabase'];
  function carregar(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    const red = process.env.PRISM_CREDITO_RECIBO_P2_RED && rel === 'app/(app)/credito.tsx';
    let source = fs.readFileSync(path.join(red ? process.env.PRISM_CREDITO_RECIBO_P2_RED : raiz, rel), 'utf8');
    if (rel === 'app/(app)/credito.tsx') {
      const marca = '  function confirmReopenInvoice() {';
      assert.ok(source.includes(marca), 'porta de teste localizada no TSX real');
      // Só expõe closures/setters reais; não substitui o handler ou loadData.
      source = source.replace(marca, '  exports.__reciboCredito = { pagar: handlePayInvoice, loadData, setCards, setTransactions, setInvoicePayments, setSelectedCardId, setPayAmount, setPayWalletId, setPayInvoiceOpen, setLoading, paySaving, payInvoiceOpen, toastMsg, toastVisible, invoicePayments, cards, erroCarga, totalInvoice, pagandoRestante };\n' + marca);
    }
    vm.runInNewContext(ts.transpileModule(source, { fileName: rel, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
      { exports, Date: Relogio, atob, setTimeout, clearTimeout, console: { warn: (...v) => logs.push(v), error: (...v) => logs.push(v) }, require(id) {
        if (id in mods) return mods[id]; if (id.startsWith('@/components/')) return id.slice(id.lastIndexOf('/') + 1);
        const relativo = id.startsWith('@/lib/') ? id.slice(2) : id.startsWith('.') ? path.join(path.dirname(rel), id).replaceAll('\\', '/') : null;
        assert.ok(relativo, 'import inesperado ' + id); return carregar(relativo + '.ts');
      } }, { filename: rel });
    return exports;
  }
  const modulo = carregar('app/(app)/credito.tsx'), c = { i: 0, slots: [], efeitos: [], sujo: false };
  function render() {
    let tree;
    for (let i = 0; i < 30; i++) { atual = c; c.i = 0; c.efeitos = []; c.sujo = false; tree = modulo.default(); c.efeitos.forEach(fn => fn()); if (!c.sujo) return tree; }
    throw Error('render não estabilizou');
  }
  render();
  const inicial = modulo.__reciboCredito;
  inicial.setCards([card]); inicial.setTransactions([compra]); inicial.setInvoicePayments(servidor ? [servidor] : []); inicial.setSelectedCardId('cA');
  inicial.setPayAmount(opts.amount ?? (opts.restante ? '60,00' : '100,00')); inicial.setPayWalletId('wA'); inicial.setPayInvoiceOpen(true); inicial.setLoading(false); render();
  return { rpc, chamadas, alertas, logs, render,
    estado() { render(); return modulo.__reciboCredito; }, pagar() { return modulo.__reciboCredito.pagar(); },
    async pronto() { await flush(); render(); assert.equal(modulo.__reciboCredito.totalInvoice, 100); assert.equal(modulo.__reciboCredito.pagandoRestante, !!opts.restante); },
    trocar(dono, id, refresh) { session = sessao(dono, id, refresh); for (const fn of listeners) fn(dono ? 'SIGNED_IN' : 'SIGNED_OUT', session); },
    mudarDemo(v) { demo = v; render(); },
    desmontar() { c.slots.forEach(s => s?.limpar?.()); vivo = false; },
  };
}
const contar = (a, tipo) => a.chamadas.filter(c => c[0] === tipo).length;
function observar(p) { const r = { terminou: false }; p.then(() => { r.terminou = true; }); return r; }
function sucesso(a, mensagem = 'Fatura paga') { const e = a.estado(); assert.equal(e.toastMsg, mensagem); assert.equal(e.toastVisible, true); assert.equal(e.payInvoiceOpen, false); assert.equal(e.paySaving, false); }
const casos = [], caso = (nome, fn) => casos.push([nome, fn]);
caso('pagamento e restante concluem recibo enquanto refresh de cartões está pendente', async () => {
  for (const restante of [false, true]) {
    const cartoes = pendente(), a = ambiente({ restante, cartoes }); await a.pronto(); const p = a.pagar(), r = observar(p);
    await flush(); assert.equal(r.terminou, false); assert.equal(a.estado().paySaving, true); assert.equal(contar(a, restante ? 'rpc-restante' : 'rpc-fatura'), 1);
    a.rpc.resolve(pagamento()); await flush(); assert.equal(r.terminou, true); sucesso(a); assert.equal(a.estado().invoicePayments[0].amount, 100); assert.equal(contar(a, 'refresh-cartoes'), 1);
    cartoes.resolve([card]); await flush(); await p; assert.equal(a.alertas.length, 0);
  }
});
caso('recorrência pendente não segura o recibo financeiro', async () => {
  const recorrencia = pendente(), a = ambiente({ recorrencia }); await a.pronto(); const p = a.pagar(), r = observar(p); a.rpc.resolve(pagamento()); await flush();
  assert.equal(contar(a, 'recorrencia'), 1); assert.equal(r.terminou, true); sucesso(a); assert.equal(contar(a, 'notificacoes'), 0); recorrencia.resolve([]); await flush(); await p;
});
caso('preferências de notificação pendentes não seguram pagamento parcial', async () => {
  const notificacoes = pendente(), a = ambiente({ notificacoes, amount: '50,00' }); await a.pronto(); const p = a.pagar(), r = observar(p); a.rpc.resolve(pagamento(50)); await flush();
  assert.equal(contar(a, 'notificacoes'), 1); assert.equal(r.terminou, true); sucesso(a, 'Pagamento registrado'); notificacoes.resolve({ lembretesContasAtivo: false }); await flush(); await p;
});
caso('falhas secundárias de cartões/recorrência/notificações não viram erro ao pagar nem retry', async () => {
  for (const etapa of ['cartoes', 'recorrencia', 'notificacoes']) {
    const secundaria = pendente(), a = ambiente({ [etapa]: secundaria }); await a.pronto(); const p = a.pagar(), r = observar(p); a.rpc.resolve(pagamento()); await flush();
    assert.equal(r.terminou, true); sucesso(a); secundaria.reject(Error('falha secundária sintética')); await flush(); await p;
    sucesso(a); assert.equal(a.alertas.filter(v => v[0] === 'Erro ao pagar fatura').length, 0); assert.equal(contar(a, 'rpc-fatura'), 1); assert.ok(a.logs.length);
  }
});
caso('conflito inicial mantém mensagem e conclui antes do refresh, sem sucesso falso', async () => {
  const cartoes = pendente(), a = ambiente({ cartoes }); await a.pronto(); const p = a.pagar(), r = observar(p); a.rpc.resolve(pagamento(50)); await flush();
  assert.equal(r.terminou, true); assert.equal(a.alertas[0][0], 'Essa fatura já tinha um pagamento');
  assert.equal(a.alertas[0][1], 'Nada novo foi lançado. Confira a fatura atualizada e, se ainda faltar algo, use "Pagar restante".');
  assert.equal(contar(a, 'haptic-sucesso'), 0); assert.equal(a.estado().toastVisible, false); assert.equal(a.estado().payInvoiceOpen, false); cartoes.resolve([card]); await flush(); await p;
});
caso('conflito do restante mantém mensagem e não repete a RPC', async () => {
  const cartoes = pendente(), a = ambiente({ cartoes, restante: true }); await a.pronto(); const p = a.pagar(), r = observar(p); a.rpc.resolve(pagamento(90)); await flush();
  assert.equal(r.terminou, true); assert.equal(a.alertas[0][0], 'Pagamento não lançado');
  assert.equal(a.alertas[0][1], 'O valor pago desta fatura mudou antes deste pagamento. Confira a fatura atualizada e tente de novo, se ainda faltar algo.');
  assert.equal(contar(a, 'rpc-restante'), 1); assert.equal(contar(a, 'haptic-sucesso'), 0); cartoes.resolve([card]); await flush(); await p;
});
caso('rejeição da RPC preserva erro existente e não começa refresh', async () => {
  const a = ambiente(); await a.pronto(); const p = a.pagar(); a.rpc.reject(Error('recusa financeira sintética')); await p; await flush();
  assert.equal(a.alertas[0][0], 'Erro ao pagar fatura'); assert.equal(a.alertas[0][1], 'recusa financeira sintética'); assert.equal(contar(a, 'refresh-cartoes'), 0); assert.equal(contar(a, 'rpc-fatura'), 1); assert.equal(a.estado().paySaving, false); assert.equal(a.estado().toastVisible, false);
});
caso('toques no mesmo quadro fazem uma única chamada financeira', async () => {
  const cartoes = pendente(), a = ambiente({ cartoes }); await a.pronto(); const p = a.pagar(), q = a.pagar(); await flush(); assert.equal(contar(a, 'rpc-fatura'), 1);
  a.rpc.resolve(pagamento()); await flush(); sucesso(a); cartoes.resolve([card]); await flush(); await Promise.all([p, q]);
});
caso('troca de conta e A -> B -> A descartam publicação financeira abandonada', async () => {
  for (const voltar of [false, true]) {
    const a = ambiente(); await a.pronto(); const p = a.pagar(); a.trocar('B'); if (voltar) a.trocar('A'); a.rpc.resolve(pagamento()); await p; await flush();
    assert.equal(contar(a, 'refresh-cartoes'), 0); assert.equal(contar(a, 'haptic-sucesso'), 0); assert.equal(a.estado().toastVisible, false); assert.equal(a.alertas.length, 0); assert.equal(contar(a, 'rpc-fatura'), 1);
  }
});
caso('nova sessão da mesma conta cancela recibo; refresh da mesma sessão preserva', async () => {
  for (const nova of [true, false]) {
    const a = ambiente(); await a.pronto(); const p = a.pagar(); a.trocar('A', nova ? 'A-nova' : 'A-sessao', 'r2'); a.rpc.resolve(pagamento()); await flush(); await p;
    assert.equal(contar(a, 'haptic-sucesso'), nova ? 0 : 1); if (!nova) sucesso(a);
  }
});
caso('desmontagem antes do retorno da RPC não publica estado/alerta/refresh', async () => {
  const a = ambiente(); await a.pronto(); const p = a.pagar(); a.desmontar(); a.rpc.resolve(pagamento()); await p; await flush();
  assert.equal(contar(a, 'estado-desmontado'), 0); assert.equal(contar(a, 'refresh-cartoes'), 0); assert.equal(contar(a, 'haptic-sucesso'), 0); assert.equal(a.alertas.length, 0);
});
caso('refresh financeiro abandonado antes dos cartões não consulta novos meses nem publica dono alheio', async () => {
  const cartoes = pendente(), a = ambiente({ cartoes }); await a.pronto(); const p = a.pagar(); a.rpc.resolve(pagamento()); await flush(); sucesso(a);
  a.trocar('B'); cartoes.resolve([{ ...card, user_id: 'B', id: 'cB' }]); await flush(); await p;
  assert.equal(a.estado().cards[0].id, 'cA'); assert.equal(contar(a, 'recorrencia'), 0); assert.equal(contar(a, 'notificacoes'), 0);
});
caso('recorrência pendente da conta anterior não cria ocorrências nem agenda notificações', async () => {
  const recorrencia = pendente(), a = ambiente({ recorrencia }); await a.pronto(); const p = a.pagar(); a.rpc.resolve(pagamento()); await flush(); sucesso(a);
  a.trocar('B'); recorrencia.resolve([{ ...compra, id: 'serie', recurring: true, occurred_on: '2026-10-01', payment_method: 'pix', card_id: null }]); await flush(); await p;
  assert.equal(contar(a, 'criar-recorrencia'), 0); assert.equal(contar(a, 'notificacoes'), 0);
});
caso('registro devolvido de outro dono não gera sucesso nem refresh automático', async () => {
  const a = ambiente(); await a.pronto(); const p = a.pagar(); a.rpc.resolve(pagamento(100, { user_id: 'B' })); await p; await flush();
  assert.equal(contar(a, 'haptic-sucesso'), 0); assert.equal(contar(a, 'refresh-cartoes'), 0); assert.equal(a.alertas[0][0], 'Confira o pagamento');
});
caso('demo inicial e restante preservam pagamento local sem RPC/refresh', async () => {
  for (const restante of [false, true]) {
    const a = ambiente({ demo: true, restante }); await a.pronto(); await a.pagar(); await flush(); sucesso(a);
    assert.equal(contar(a, 'rpc-fatura') + contar(a, 'rpc-restante'), 0); assert.equal(contar(a, 'refresh-cartoes'), 0); assert.equal(a.estado().invoicePayments[0].amount, 100);
  }
});
caso('valor inválido continua sem chamada financeira', async () => {
  const a = ambiente({ amount: '0,00' }); await a.pronto(); await a.pagar(); assert.equal(a.alertas[0][0], 'Valor inválido'); assert.equal(contar(a, 'rpc-fatura'), 0); assert.equal(contar(a, 'refresh-cartoes'), 0);
});
(async () => {
  let falhas = 0;
  for (const [nome, fn] of casos) { try { await fn(); console.log('PrismCreditoReciboP2 OK ' + nome); } catch (e) { falhas++; console.error('PrismCreditoReciboP2 FALHA ' + nome + ': ' + e.message); } }
  console.log(`PrismCreditoReciboP2 ${casos.length - falhas}/${casos.length} grupos`); process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('PrismCreditoReciboP2 ' + e.message); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
