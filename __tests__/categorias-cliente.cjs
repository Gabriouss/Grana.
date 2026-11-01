const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar, root } = require('./_carregar-ts.cjs');
const core = carregar('lib/gastos-categoria.ts');
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const tx = (id, amount, payment_method = 'debit') => ({ id, amount, payment_method, card_id: payment_method === 'credit' ? 'cartao' : null, type: 'out', category: 'Transporte', color: '#00a6ca', description: id, occurred_on: '2026-11-03', created_at: '2026-11-03T12:00:00Z' });
let linhas = [tx('debito', 60), tx('pix', 20, 'pix'), tx('credito', 50, 'credit'), tx('fatura', 50)];
let falha = false, usuario = 'usuario-a', notificacoes = 0;
const chamadas = [];
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports, Date, Set, Map, Promise, console: { ...console, error: () => {} },
    require: id => { if (id in mocks) return mocks[id]; throw new Error(`import não simulado ${id}`); },
  }, { filename: file });
  return exports;
}
const api = load('lib/categorias-cliente.ts', {
  './data': {
    fetchTransactionsDoPeriodo: async (...args) => { chamadas.push(args); if (falha) throw new Error('falhou'); return linhas; },
    fetchCardInvoicePayments: async () => [{ paid_transaction_id: 'fatura', extra_transaction_ids: ['parcial'] }],
  },
  './cache-de-tela': { estaServindoDoCache: () => false },
  './sessao-offline': { idDoUsuarioLocal: async () => usuario },
  './gastos-categoria': core,
  './creditLimitAlert': { checarLimiteCartao: () => { notificacoes++; } },
});
const format = carregar('lib/format.ts');
const jsx = (type, props) => ({ type, props: props ?? {} });
const tokens = new Proxy({}, { get: () => 14 });
const theme = { paper: 'paper', ink: 'ink', inkSoft: 'inkSoft', down: 'cyan', accent2: 'mint' };
const Teto = load('components/CategoriaTeto.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { Text: 'Text', View: 'View', StyleSheet: { create: x => x } },
  './AppPressable': { __esModule: true, default: 'AppPressable' }, './PrivacyValue': { __esModule: true, default: 'PrivacyValue' },
  '@/lib/gastos-categoria': core, '@/lib/format': format, '@/lib/sem-viuva': carregar('lib/sem-viuva.ts'),
  '@/lib/theme': { theme, fonts: { regular: 'Regular', light: 'Light' }, spacing: tokens, radius: tokens, type: tokens, lh: x => x, touchTarget: 48 },
}).default;
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' || typeof n === 'number' ? String(n) : '';
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : [];
async function main() {
  const r = await api.consultarCategorias('2026-11-01', '2026-11-30');
  check(r.resultado.consumo.total.tudo === 13000, '130 em Tudo, pagamento da fatura fora');
  for (const [visao, esperado] of [['tudo', 130], ['avista', 80], ['credito', 50]]) {
    const lista = api.linhasDaCategoria(r.resultado, 'Transporte', visao);
    check(lista.reduce((s, t) => s + t.amount, 0) === esperado, `lista bate com ${esperado} em ${visao}`);
    check(api.categoriasDaVisao(r.resultado.consumo, visao)[0].value === esperado, `donut ${visao}`);
    const tree = Teto({ categoria: 'Transporte', teto: 100, consumo: r.resultado.consumo.porCategoria[0], visao, abrir: () => {}, definir: () => {} });
    const out = text(tree).replaceAll('\u00a0', ' ');
    check(out.includes('130,00 de R$ 100,00'), `teto sempre em Tudo na visão ${visao}`);
    check(out.includes('R$ 30,00 acima do teto'), `excesso continua nas três visões: ${visao}`);
    if (visao !== 'tudo') check(out.includes(`Nesta visão: R$ ${esperado},00`), 'parcela da visão identificada');
    check(nodes(tree).filter(n => n.type === 'PrivacyValue').length >= 2, 'valores com privacidade');
    const press = nodes(tree).filter(n => n.type === 'AppPressable');
    check(press.length === 2 && press.every(n => !nodes(n.props.children).some(c => c.type === 'AppPressable')), 'ações sem clique aninhado');
  }
  linhas = [...linhas, linhas[0], tx('parcial', 10)];
  const repetido = await api.consultarCategorias('2026-11-01', '2026-11-30', r.resultado);
  check(repetido.resultado.consumo.total.tudo === 13000, 'duplicata conciliada e pagamento parcial fora');
  falha = true;
  const antigo = await api.consultarCategorias('2026-12-01', '2026-12-31', r.resultado);
  check(antigo.resultado === r.resultado && antigo.erro && antigo.resultado.inicio === '2026-11-01', 'falha preserva o último intervalo identificado, sem zero');
  check((await api.consultarCategorias('2026-11-01', '2026-11-30')).resultado === null, 'primeira falha não inventa resultado vazio');
  usuario = 'usuario-b';
  check((await api.consultarCategorias('2026-11-01', '2026-11-30', r.resultado)).resultado === null, 'sem vazamento entre usuários');
  check(notificacoes === 0 && chamadas.length >= 4, 'atualizações não disparam alertas de orçamento/cartão');
  const storage = new Map();
  const aviso = load('lib/categorias-aviso.ts', { '@react-native-async-storage/async-storage': { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => storage.set(k, v) } });
  check(await aviso.consumirAvisoCategorias('a'), 'primeira abertura mostra aviso');
  check(!await aviso.consumirAvisoCategorias('a'), 'atualização não repete aviso');
  check(await aviso.consumirAvisoCategorias('b'), 'aviso separado por usuário');
  const g = carregar('lib/gamification.ts');
  const rows = [tx('a', 60), tx('b', 20, 'pix'), tx('c', 50, 'credit')];
  const budget = [{ category: 'Transporte', amount: 100 }];
  const agora = new Date(2026, 10, 4, 12);
  const state = g.getGamificationState(rows, [], budget, undefined, [], { agora, consumoCategorias: core.apurarGastosCategoria(rows, { inicio: '2026-11-01', fim: '2026-11-30' }) });
  check(state.indicadores.find(i => i.label === 'Categorias dentro do teto').valor === '0 de 1', 'Desafios mede teto em Tudo');
  check(g.getGamificationState(rows, [], [], undefined, [], { agora }).score === state.score, 'teto não muda Score de hábito');
  const monthly = carregar('lib/monthly-wrapped.ts', { './supabase': { supabase: {} } });
  const wrapped = monthly.gerarMonthlyWrapped(rows, [], budget, 0, new Date(2026, 11, 1));
  check(wrapped.categoriaCampea.total === 130 && wrapped.categoriaCampea.fatiaDasSaidas === 1, 'resumo mensal usa consumo conjunto e denominador do consumo');
  const html = carregar('lib/pdf-report-html.ts').montarHtml({ ano: 2026, mes: 10, transactions: rows.filter(t => t.payment_method !== 'credit'), bills: [], carteira: 'Total', consumoCategorias: r.resultado.consumo });
  check(html.includes('130,00') && html.includes('100.0%') && html.includes('Débito, Pix e crédito juntos'), 'PDF usa agregado do consumo mesmo com fluxo em caixa');
  console.log(`categorias-cliente: ${checks} verificações passaram`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
