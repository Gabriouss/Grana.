// PrismGraficosP2: tela e FlowChart reais; somente hooks, relógio, dados e nativo controlados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
const watchdog = setTimeout(() => { console.error('PrismGraficosP2 FALHA: teste não concluiu'); process.exit(1); }, 15000);
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const pendente = () => { let resolve, reject; const promise = new Promise((s, n) => { resolve = s; reject = n; }); return { promise, resolve, reject }; };
function nos(no, pred, acc = []) { if (no == null || typeof no !== 'object') return acc; if (Array.isArray(no)) no.forEach(n => nos(n, pred, acc)); else { if (pred(no)) acc.push(no); nos(no.props?.children, pred, acc); } return acc; }
function texto(no) { if (no == null || typeof no === 'boolean') return ''; if (typeof no !== 'object') return String(no); return Array.isArray(no) ? no.map(texto).join(' ') : texto(no.props?.children); }
function ambiente(opts = {}) {
  let atual, hoje = '2026-11-11', vivo = true, demo = false, wallet = 'total', recarga;
  const chamadas = [], logs = [], cache = new Map(), periodos = [];
  const mudaram = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(ini) { const c = atual, i = c.i++; if (!(i in c.slots)) c.slots[i] = typeof ini === 'function' ? ini() : ini; return [c.slots[i], v => { if (!vivo) chamadas.push(['estado-desmontado']); c.slots[i] = typeof v === 'function' ? v(c.slots[i]) : v; }]; },
    useRef(v) { const c = atual, i = c.i++; return c.slots[i] ??= { current: v }; },
    useCallback(fn, deps) { const c = atual, i = c.i++; if (mudaram(c.slots[i]?.deps, deps)) c.slots[i] = { fn, deps }; return c.slots[i].fn; },
    useEffect(fn, deps) { const c = atual, i = c.i++, old = c.slots[i]; if (mudaram(old?.deps, deps)) c.efeitos.push(() => { old?.limpar?.(); c.slots[i] = { deps, limpar: fn() }; }); },
  };
  react.useMemo = (fn, deps) => { const c = atual, i = c.i++; if (mudaram(c.slots[i]?.deps, deps)) c.slots[i] = { valor: fn(), deps }; return c.slots[i].valor; };
  const jsx = (tipo, props, key) => ({ tipo, props: props ?? {}, key });
  class Relogio extends Date {
    constructor(...args) { super(...(args.length ? args : [new Date(hoje + 'T12:00:00').getTime()])); }
    static now() { return new Date(hoje + 'T12:00:00').getTime(); }
  }
  const tema = { theme: { accent: '#0af', up: '#0a0', down: '#00a' }, radius: {}, spacing: { lg: 20, sm: 8 }, type: {}, fonts: {}, lh: () => 18,
    screenRhythm: { padding: 20 }, card: {}, graficoLinha: { raioPonto: 3, raioPontoSelecionado: 5 } };
  const mods = {
    react: { __esModule: true, default: react, ...react }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', StyleSheet: { create: v => v, absoluteFill: {} },
      Animated: { View: 'AnimatedView', Value: class { setValue() {} }, timing: () => ({ start() {} }) }, Easing: { bezier: () => () => {} } },
    'react-native-svg': { __esModule: true, default: 'Svg', ...Object.fromEntries(['Circle', 'Defs', 'Line', 'LinearGradient', 'Path', 'Stop'].map(v => [v, v])) },
    'expo-router': { useRouter: () => ({ push() {} }), useFocusEffect: () => {} },
    '@/lib/theme': tema, '@/lib/privacy-context': { usePrivacy: () => ({ hidden: false, toggle() {} }) },
    '@/lib/motion': { UI_OUT: [0, 0, 1, 1], useReducedMotion: () => true },
    '@/lib/wallet-context': { useWallet: () => ({ activeWalletId: wallet, activeWalletName: wallet }) },
    '@/lib/demo-context': { useDemo: () => ({ isDemoMode: demo }) },
    '@/lib/tab-bar': { useTabBarInset: () => ({ paddingConteudo: 40 }) },
    '@/lib/breakpoints': { colunaConteudo: {}, controleCompacto: {}, LARGURA_MAXIMA_CONTEUDO: 1200, useBreakpoint: () => ({ ehCompacto: true, largura: 400 }) },
    '@/lib/use-categorias': { useCategorias: () => ({ resultado: null, carregar() {} }), useVisaoCategorias: () => ({ visao: 'tudo', mudar() {} }) },
    '@/lib/categorias-cliente': { categoriasDaVisao: () => [] }, '@/lib/abrir-categoria': { abrirCategoria() {} },
    '@/lib/demo-data': { DEMO_TRANSACTIONS: [] }, '@/lib/lancamentos-teste': { lancamentosDeExemplo: () => opts.demoRows ?? [] },
    '@/lib/data': {
      fetchTransactions: () => { chamadas.push(['historico']); return opts.historico ? opts.historico.promise : Promise.resolve(opts.rows ?? []); },
      fetchTransactionsDoPeriodo: (inicio, fim) => { const p = pendente(); chamadas.push(['periodo', inicio, fim]); periodos.push({ inicio, fim, ...p }); if (!opts.controlarPeriodos) p.resolve(opts.rows ?? []); return p.promise; },
    },
    '@/components/FaixaOffline': { __esModule: true, default: 'FaixaOffline', useRecarregarAoChegarDadoNovo: fn => { recarga = fn; } },
    '@expo/vector-icons/Ionicons': 'Icon', './AppPressable': 'AppPressable',
  };
  function carregar(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    const red = process.env.PRISM_GRAFICOS_P2_RED && ['app/(app)/graficos.tsx', 'components/FlowChart.tsx'].includes(rel);
    const arquivo = path.join(red ? process.env.PRISM_GRAFICOS_P2_RED : raiz, rel);
    const source = fs.readFileSync(arquivo, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { fileName: arquivo, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
      { exports, Date: Relogio, console: { warn: (...v) => logs.push(v), error: (...v) => logs.push(v) }, require(id) {
        if (id in mods) return mods[id];
        if (id.startsWith('@/components/')) return id.slice(id.lastIndexOf('/') + 1);
        const relativo = id.startsWith('@/lib/') ? id.slice(2) : id.startsWith('.') ? path.join(path.dirname(rel), id).replaceAll('\\', '/') : null;
        assert.ok(relativo, 'import inesperado ' + id); return carregar(relativo + '.ts');
      } }, { filename: rel });
    return exports;
  }
  function montar(fn, props = {}) {
    const c = { i: 0, slots: [], efeitos: [] };
    const instancia = { render() { atual = c; c.i = 0; c.efeitos = []; const tree = fn(props); c.efeitos.forEach(f => f()); return tree; }, desmontar() { c.slots.forEach(s => s?.limpar?.()); vivo = false; }, props };
    instancia.render(); return instancia;
  }
  return { carregar, montar, chamadas, logs, periodos, setHoje: v => { hoje = v; }, setDemo: v => { demo = v; }, setWallet: v => { wallet = v; }, recarregar: () => recarga() };
}
const tx = (id, amount = 1, occurred_on = '2026-11-01', extra = {}) => ({ id, user_id: 'A', amount, occurred_on, type: 'out', category: 'Outros', color: '#0af', wallet_id: 'w1', ...extra });
function tela(opts = {}) {
  const a = ambiente(opts), m = a.montar(a.carregar('app/(app)/graficos.tsx').default);
  const buscar = tipo => nos(m.render(), n => n.tipo === tipo)[0];
  return { ...a, m, buscar, colunas: () => buscar('LineAreaChart').props.columns, rows: () => buscar('ExportPdfButton').props.transactions,
    modo(valor) { buscar('SegmentedTabs').props.onChange(valor); m.render(); },
    aba(valor) { nos(m.render(), n => n.tipo === 'SegmentedTabs')[1].props.onChange(valor); m.render(); },
    data(lado, iso) { const alvo = nos(m.render(), n => n.tipo === 'AppPressable' && texto(n).startsWith(lado === 'inicio' ? 'De ' : 'Até '))[0]; assert.ok(alvo, 'campo de período existe'); alvo.props.onPress(); buscar('DatePickerModal').props.onSelectDate(iso); m.render(); },
    refresh() { nos(m.render(), n => n.tipo === 'ScrollView')[0].props.refreshControl.props.onRefresh(); m.render(); },
    refrescando: () => nos(m.render(), n => n.tipo === 'ScrollView')[0].props.refreshControl.props.refreshing,
  };
}
const casos = [], caso = (nome, fn) => casos.push([nome, fn]);
caso('respostas de períodos em ordem inversa preservam o último pedido', async () => {
  const a = tela({ controlarPeriodos: true }); await flush(); a.modo('periodo'); const antigo = a.periodos.at(-1); a.data('inicio', '2026-10-01'); const novo = a.periodos.at(-1);
  novo.resolve([tx('atual', 20)]); await flush(); assert.equal(a.rows()[0].id, 'atual'); antigo.resolve([tx('antigo', 900)]); await flush(); assert.equal(a.rows()[0].id, 'atual');
  assert.equal(a.colunas().reduce((s, c) => s + c.total, 0), 20);
});
caso('erro/finally antigo não substitui estado nem encerra refresh novo pendente', async () => {
  const a = tela({ controlarPeriodos: true }); await flush(); a.modo('periodo'); const antigo = a.periodos.at(-1); a.refresh(); const novo = a.periodos.at(-1);
  antigo.reject(Error('erro antigo sintético')); await flush(); assert.equal(a.refrescando(), true); assert.equal(a.logs.length, 0);
  novo.resolve([tx('atual')]); await flush(); assert.equal(a.refrescando(), false); assert.equal(a.rows()[0].id, 'atual');
});
caso('histórico antigo não substitui o recorte mais recente nem escreve após desmontagem', async () => {
  const historico = pendente(), a = tela({ historico, controlarPeriodos: true }); a.modo('periodo'); a.periodos.at(-1).resolve([tx('recorte')]); await flush(); historico.resolve([tx('historico-antigo')]); await flush(); assert.equal(a.rows()[0].id, 'recorte');
  a.refresh(); const ultimo = a.periodos.at(-1); a.m.desmontar(); ultimo.resolve([tx('depois')]); await flush(); assert.equal(a.chamadas.filter(c => c[0] === 'estado-desmontado').length, 0);
});
caso('carga atual rejeitada ainda mostra erro e encerra o refresh', async () => {
  const a = tela({ controlarPeriodos: true }); await flush(); a.modo('periodo'); a.refresh(); a.periodos.at(-1).reject(Error('erro atual')); await flush(); assert.equal(a.refrescando(), false); assert.equal(a.logs.length, 1);
  assert.match(a.buscar('LineAreaChart').props.erro, /carregar seus lançamentos/);
});
caso('troca para demo invalida o pedido real anterior', async () => {
  const historico = pendente(), a = tela({ historico, demoRows: [tx('demo')] }); a.setDemo(true); a.m.render(); await flush(); historico.resolve([tx('real-antigo')]); await flush(); assert.equal(a.rows()[0].id, 'demo');
});
function meses(qtd) { return Array.from({ length: qtd }, (_, i) => { const d = new Date(2000, i, 1); return tx('m' + i, i + 1, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); }); }
caso('24/25/49/300 meses preservam todos os valores e teto de 24 pontos', async () => {
  for (const n of [24, 25, 49, 300]) {
    const a = tela({ rows: meses(n).reverse() }); await flush(); const colunas = a.colunas();
    assert.ok(colunas.length <= 24); assert.equal(colunas.reduce((s, c) => s + c.total, 0), n * (n + 1) / 2);
    assert.equal(colunas.flatMap(c => c.segments).reduce((s, c) => s + c.amount, 0), n * (n + 1) / 2);
    if (n === 24) { assert.equal(colunas.length, 24); assert.equal(colunas[0].label, 'Jan/00'); assert.equal(colunas.at(-1).label, 'Dez/01'); }
    else assert.match(colunas[0].label, / a /);
  }
});
caso('período longo respeita bordas parciais sem perder meses intermediários', async () => {
  const a = tela({ rows: meses(300) }); await flush(); a.modo('periodo'); a.data('inicio', '2000-01-15'); a.data('fim', '2024-12-10'); await flush();
  assert.equal(a.rows().length, 299); assert.ok(a.colunas().length <= 24); assert.equal(a.colunas().reduce((s, c) => s + c.total, 0), 45149);
});
caso('meses vazios, abas e crédito/carteira conservam filtros e totais', async () => {
  const rows = [tx('jan', 10, '2026-01-01'), tx('mar', 20, '2026-03-01'), tx('entrada', 100, '2026-03-01', { type: 'in' }), tx('credito', 999, '2026-02-01', { payment_method: 'credit', card_id: 'c' }), tx('outra', 5, '2026-03-01', { wallet_id: 'w2' })];
  const a = tela({ rows }); await flush(); assert.deepEqual(Array.from(a.colunas(), c => c.total), [10, 0, 25]);
  a.aba('renda'); assert.equal(a.colunas().reduce((s, c) => s + c.total, 0), 100);
  a.aba('geral'); assert.equal(a.colunas().reduce((s, c) => s + c.total, 0), 135);
  a.setWallet('w1'); a.m.render(); assert.equal(a.colunas().reduce((s, c) => s + c.total, 0), 130);
});
caso('ano a ano continua somando todos os anos agrupados', async () => {
  const rows = Array.from({ length: 60 }, (_, i) => tx('ano' + i, 1, `${1960 + i}-01-01`)); const a = tela({ rows }); await flush(); a.modo('anos'); await flush();
  assert.ok(a.colunas().length <= 24); assert.equal(a.colunas().reduce((s, c) => s + c.total, 0), 60);
});
function fluxo(rows, props = {}) {
  let agregacoes = 0;
  const rastrear = dados => { Object.defineProperty(dados, 'filter', { value(...args) { agregacoes++; return Array.prototype.filter.apply(this, args); } }); return dados; };
  const a = ambiente(), m = a.montar(a.carregar('components/FlowChart.tsx').default, { transactions: rastrear(rows), period: 'month', year: 2026, month: 10, ...props });
  const toques = () => nos(m.render(), n => n.tipo === 'AppPressable');
  return { ...a, m, toques, contagem: () => agregacoes, novasRows: r => { m.props.transactions = rastrear(r); m.render(); } };
}
function somasDosRotulos(a) {
  const moeda = v => Number(v.replaceAll('.', '').replace(',', '.'));
  return a.toques().map(n => { const v = n.props.accessibilityLabel.match(/entradas R\$ (.*), saídas R\$ (.*)$/); assert.ok(v); return [moeda(v[1]), moeda(v[2])]; });
}
caso('toques e layout não agregam novamente histórico longo; geometria/totais preservados', async () => {
  const rows = Array.from({ length: 5000 }, (_, i) => tx('f' + i, 1, `2026-11-${String(i % 30 + 1).padStart(2, '0')}`, { type: i % 2 ? 'in' : 'out' }));
  const a = fluxo(rows), inicial = a.contagem(), paths = nos(a.m.render(), n => n.tipo === 'Path').map(n => n.props.d);
  assert.equal(inicial, 14); assert.equal(somasDosRotulos(a).flat().reduce((s, v) => s + v, 0), 5000);
  a.toques()[0].props.onPress(); a.m.render(); a.toques().at(-1).props.onPress(); a.m.render();
  assert.equal(a.contagem(), inicial); assert.equal(a.toques().at(-1).props.accessibilityState.selected, true);
  assert.deepEqual(nos(a.m.render(), n => n.tipo === 'Path').map(n => n.props.d), paths);
  nos(a.m.render(), n => n.tipo === 'AnimatedView')[0].props.onLayout({ nativeEvent: { layout: { width: 400 } } }); a.m.render(); assert.equal(a.contagem(), inicial);
});
caso('dados/período novos invalidam agregação uma vez e mantêm valores de cada sentido', async () => {
  const a = fluxo([tx('out', 10), tx('in', 25, '2026-11-01', { type: 'in' })]);
  assert.deepEqual(somasDosRotulos(a).reduce((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0]), [25, 10]); const antes = a.contagem();
  a.novasRows([tx('novo', 40)]); assert.equal(a.contagem(), antes + 14); assert.equal(somasDosRotulos(a).flat().reduce((s, v) => s + v, 0), 40);
  const apos = a.contagem(); a.m.props.period = 'year'; a.m.render(); assert.equal(a.contagem(), apos + 24); assert.equal(somasDosRotulos(a).flat().reduce((s, v) => s + v, 0), 40);
});
caso('sete dias atualizam a régua ao virar o dia, sem recontar em toque', async () => {
  const a = fluxo([tx('dia5', 5, '2026-11-05'), tx('dia12', 12, '2026-11-12')], { period: '7days' });
  assert.equal(somasDosRotulos(a).flat().reduce((s, v) => s + v, 0), 5); const antes = a.contagem();
  a.setHoje('2026-11-12'); a.m.render(); assert.equal(a.contagem(), antes + 14); assert.equal(somasDosRotulos(a).flat().reduce((s, v) => s + v, 0), 12);
  const depois = a.contagem(); a.toques()[2].props.onPress(); a.m.render(); assert.equal(a.contagem(), depois);
});
(async () => {
  let falhas = 0;
  for (const [nome, fn] of casos) { try { await fn(); console.log('PrismGraficosP2 OK ' + nome); } catch (e) { falhas++; console.error('PrismGraficosP2 FALHA ' + nome + ': ' + e.message); } }
  console.log(`PrismGraficosP2 ${casos.length - falhas}/${casos.length} grupos`); process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('PrismGraficosP2 ' + e.message); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
