// Telas reais transpiladas; cliques e rerenders com dados inventados, sem rede.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { carregar } = require('./_carregar-ts.cjs');
const core = carregar('lib/gastos-categoria.ts');
const format = carregar('lib/format.ts');
const periodo = { inicio: '2026-11-01', fim: '2026-11-30' };
const categorias = ['Moradia', 'Lazer', 'Investimentos', 'Energético', 'Assinaturas'];
const tx = (id, category, payment_method = 'debit') => ({ id, category, payment_method, card_id: payment_method === 'credit' ? 'card' : null,
  wallet_id: 'wallet', type: 'out', amount: 10, occurred_on: '2026-11-08', description: id, color: '#147a99' });
const linhas = [...categorias.map((c, i) => tx('debito-' + i, c)), tx('credito', 'Somente crédito', 'credit'), tx('credito-misto', 'Moradia', 'credit')];
linhas.at(-1).occurred_on = '2026-11-26'; // compra de novembro na fatura de dezembro.
linhas.push({ ...tx('receita-ficticia', 'Salário', 'pix'), type: 'in' });
const resultado = { ...periodo, linhas, consumo: core.apurarGastosCategoria(linhas, periodo), doCache: false };
function tela(arquivo, params = {}) {
  const slots = []; let cursor = 0, array = 0;
  const jsx = (type, props) => ({ type, props });
  const inerte = new Proxy({}, { get: (_, nome) => nome === '__esModule' ? false : () => undefined });
  const credit = arquivo.includes('credito.tsx');
  const api = {};
  const react = {
    memo: f => f, useEffect() {}, useMemo: f => f(), useCallback: f => f,
    useRef(v) { const i = cursor++; return slots[i] ??= { current: v }; },
    useState(v) {
      const i = cursor++;
      if (!(i in slots)) {
        if (Array.isArray(v)) { const j = array++; v = credit && j === 0 ? [{ id: 'card', name: 'Cartão fictício', closing_day: 20, due_day: 27, wallet_id: 'wallet', limit_amount: 1000, color: '#147a99' }] : j === (credit ? 1 : 0) ? linhas : v; }
        slots[i] = v === true ? false : typeof v === 'function' ? v() : v;
      }
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
  };
  const requerer = id => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'react-native') return new Proxy({ Platform: { OS: 'web' }, StyleSheet: { create: v => v }, AppState: {} }, { get: (o, k) => o[k] ?? k });
    if (id === 'expo-router') return { useRouter: () => ({ setParams: p => Object.assign(params, p), push() {} }), useLocalSearchParams: () => params, useFocusEffect() {} };
    if (id === '@/lib/abertura-por-parametro') return { useAberturaPorParametro: (abrir, fn) => { if (abrir) fn(); } };
    if (id === '@/lib/use-categorias') return { useCategorias: () => ({ resultado, erro: null, carregar() {} }), useVisaoCategorias: () => ({ visao: 'tudo', mudar() {} }) };
    if (id === '@/lib/categorias-cliente') return carregar('lib/categorias-cliente.ts', { './data': {}, './cache-de-tela': {}, './sessao-offline': {} });
    if (id === '@/lib/theme') return { theme: {}, radius: {}, spacing: {}, screenRhythm: {}, card: {}, fonts: {}, type: {}, lh: () => 1, hitSlopPara: () => ({}) };
    if (id === '@/lib/wallet-context') return { useWallet: () => ({ activeWalletId: 'total', wallets: [], activeWalletName: 'Total' }) };
    if (id === '@/lib/privacy-context') return { usePrivacy: () => ({ hidden: false, toggle() {} }) };
    if (id === '@/lib/demo-context') return { useDemo: () => ({ isDemoMode: true }) };
    if (id === '@/lib/tab-bar') return { useTabBarInset: () => ({ paddingConteudoComFab: 100, total: 50 }) };
    if (id === '@/lib/breakpoints') return { useBreakpoint: () => ({ ehCompacto: false }) };
    if (id === '@/lib/teclado') return { useKeyboardHeight: () => 0 };
    if (id === '@/components/FaixaOffline') return { useModoOffline: () => false, useMotivoOffline: () => null, useRecarregarAoChegarDadoNovo() {} };
    if (['@/lib/format', '@/lib/transaction-rules'].includes(id)) return format;
    if (['@/lib/types', '@/lib/filtro-compras', '@/lib/creditoFaturas', '@/lib/sem-viuva', '@/lib/faturaCiclo'].includes(id)) return carregar(id.replace('@/', '') + '.ts');
    if (id.startsWith('@/components/')) return { __esModule: true, default: id };
    return inerte;
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, { exports: api, require: requerer, console, Date: class extends Date { constructor(...a) { super(...(a.length ? a : ['2026-11-09T12:00:00Z'])); } },
    Map, Set, Promise, setTimeout, clearTimeout, Intl });
  return () => { cursor = 0; array = 0; return api.default(); };
}
function nos(no) { if (!no || typeof no !== 'object') return []; if (Array.isArray(no)) return no.flatMap(nos);
  return [no, ...nos(no.props?.children), ...nos(no.props?.ListHeaderComponent)]; }
const encontrar = (arvore, tipo) => nos(arvore).find(n => n.type === tipo);
const texto = no => typeof no === 'string' ? no : !no || typeof no !== 'object' ? '' : Array.isArray(no) ? no.map(texto).join(' ') : texto(no.props?.children) + ' ' + texto(no.props?.ListHeaderComponent);
const renda = tela('app/(app)/lancamentos.tsx');
assert.ok(encontrar(renda(), '@/components/ChipsCategoria').props.opcoes.some(([nome]) => nome === 'Salário'));
encontrar(renda(), '@/components/ChipsCategoria').props.onSelect('Salário');
assert.equal(encontrar(renda(), 'FlatList').props.data.length, 1, 'chip de receita em Tudo preserva a entrada');
assert.equal(encontrar(renda(), 'FlatList').props.data[0].type, 'in');
encontrar(renda(), '@/components/SegmentedTabs').props.onChange('in');
encontrar(renda(), '@/components/SegmentedTabs').props.onChange('tudo');
assert.equal(encontrar(renda(), 'FlatList').props.data.length, 1, 'voltar de Entradas para Tudo não oculta a receita');
const render = tela('app/(app)/lancamentos.tsx', { modo: 'categoria', categoria: 'Moradia', ...periodo, forma: 'tudo' });
render();
encontrar(render(), '@/components/SegmentedTabs').props.onChange('tudo');
const observacoes = [];
for (const categoria of categorias) {
  let arvore = render();
  encontrar(arvore, '@/components/ChipsCategoria').props.onSelect(categoria);
  arvore = render();
  const lista = encontrar(arvore, 'FlatList').props.data;
  observacoes.push({ categoria, modo: texto(arvore).includes('Gastos na categoria'), lista,
    opcoes: encontrar(arvore, '@/components/ChipsCategoria').props.opcoes });
}
for (const o of observacoes) assert.ok(o.modo, 'sequência do vídeo deve manter modo categoria: ' + o.categoria);
for (const o of observacoes) {
  assert.equal(o.lista.length, 1); assert.equal(o.lista[0].category, o.categoria);
  assert.ok(o.lista.every(t => !format.isCreditTx(t)), 'crédito não vaza na categoria');
  assert.ok(o.opcoes.every(([c]) => c !== 'Somente crédito'));
}
let arvore = render(); encontrar(arvore, '@/components/ChipsCategoria').props.onTodas(); arvore = render();
assert.ok(texto(arvore).includes('Entradas') && !texto(arvore).includes('Gastos na categoria'), 'Todas volta ao resumo');
assert.ok(encontrar(arvore, 'FlatList').props.data.every(t => !format.isCreditTx(t)));
const navegar = [], alertas = [];
const abrir = carregar('lib/abrir-categoria.ts', { './alerta': { Alert: { alert: (...a) => alertas.push(a) } } }).abrirCategoria;
abrir(resultado, 'Moradia', 'credito', d => navegar.push(d));
assert.equal(navegar.pop().pathname, '/(app)/credito');
abrir(resultado, 'Moradia', 'avista', d => navegar.push(d));
assert.equal(navegar.pop().pathname, '/(app)/lancamentos');
abrir(resultado, 'Lazer', 'tudo', d => navegar.push(d));
assert.equal(navegar.pop().pathname, '/(app)/lancamentos');
abrir(resultado, 'Somente crédito', 'tudo', d => navegar.push(d));
assert.equal(navegar.pop().pathname, '/(app)/credito');
abrir(resultado, 'Moradia', 'tudo', d => navegar.push(d));
assert.equal(navegar.length, 0, 'categoria mista não escolhe por conta própria');
assert.equal(alertas.length, 1);
alertas[0][2][1].onPress();
const destino = navegar.pop(); assert.equal(destino.pathname, '/(app)/credito');
assert.equal(destino.params.inicio, periodo.inicio); assert.equal(destino.params.fim, periodo.fim);
const credito = tela('app/(app)/credito.tsx', destino.params); credito();
const listaCredito = encontrar(credito(), 'SectionList').props.sections.flatMap(s => s.data);
assert.equal(listaCredito.length, 1); assert.equal(listaCredito[0].id, 'credito-misto');
assert.ok(listaCredito.every(t => format.isCreditTx(t)), 'Crédito preserva o período e exclui débito/Pix');
assert.equal(listaCredito[0].occurred_on, '2026-11-26', 'o período do gráfico não vira ciclo de fechamento');
assert.ok(!texto(credito()).includes('Total das faturas'), 'categoria por compra não é apresentada como fatura');
assert.ok(/Gastos\s+na\s+categoria/.test(texto(credito())), 'Crédito tem total da categoria mesmo com um cartão');
assert.equal(encontrar(credito(), '@/components/CategoriasContexto').props.mostrarSeletor, false);
encontrar(credito(), '@/components/ChipsCategoria').props.onTodas();
assert.ok(texto(credito()).includes('Total das faturas'), 'Todas retorna à visão de faturas');
encontrar(render(), '@/components/ChipsCategoria').props.onSelect('Moradia');
assert.equal(encontrar(render(), '@/components/CategoriasContexto').props.mostrarSeletor, false);
alertas[0][2][0].onPress(); assert.equal(navegar.pop().pathname, '/(app)/lancamentos');
assert.equal(alertas[0][2][2].style, 'cancel');
abrir(null, 'Moradia', 'tudo', d => navegar.push(d)); assert.equal(navegar.length, 0);
const { componente, textos } = require('./_copy-componentes-reais.cjs');
const Contexto = componente('components/CategoriasContexto.tsx').default;
for (const visao of ['avista', 'credito']) {
  const arvore = Contexto({ visao, onChange() {}, resultado, erro: null, carregar() {}, mostrarSeletor: false });
  const palavras = textos(arvore);
  assert.ok(!palavras.includes('Tudo') && !palavras.includes('Débito e Pix') && !palavras.includes('Crédito'));
}
let limpezas = 0;
const chipsVazios = componente('components/ChipsCategoria.tsx').default({ opcoes: [], selecionada: 'ausente', onSelect() {}, onTodas() { limpezas++; } });
assert.ok(textos(chipsVazios).includes('Todas'), 'Todos permanece disponível no vazio/carregamento');
chipsVazios.props.children[0].props.onPress(); assert.equal(limpezas, 1);
console.log('fase4-categorias: sequência de chips e exclusão de crédito no módulo real OK');
module.exports = { tela, nos, encontrar, texto, linhas, resultado };
