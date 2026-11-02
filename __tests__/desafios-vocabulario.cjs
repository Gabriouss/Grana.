const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar, root } = require('./_carregar-ts.cjs');
const gamification = carregar('lib/gamification.ts');
const { semViuva } = carregar('lib/sem-viuva.ts');
const { formatBRL } = carregar('lib/format.ts');
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
const antigos = /FAIXA\s|Nível|nível|Rumo ao elo|\bXP\b|Semana Blindada|Hábito Inquebrável|Centurião Financeiro|Arquiteto de Gastos|Pontualidade Britânica|Guardião dos Vencimentos|Primeira Fortaleza|Mapeador 360°/;
const arquivos = ['app/(app)/desafios.tsx', 'components/GoalsCarousel.tsx', 'components/MonthlyWrappedModal.tsx', 'lib/pdf-report-html.ts'];
for (const file of arquivos) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) {
      const text = n.text;
      ok(!antigos.test(text), `${file}: vocabulário antigo: ${text}`);
      // O template HTML contém também comentários CSS preexistentes.
      if (!file.endsWith('pdf-report-html.ts')) ok(!/—/.test(text), `${file}: travessão no texto`);
      ok(!/[a-zÀ-ÿ]\?[a-zÀ-ÿ]|conclu\?das/.test(text), `${file}: acento corrompido`);
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
}
const inicio = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
ok(!/calcularLevelState|nivelAntes|depois\.level|Você chegou ao nível/.test(inicio), 'sem aviso de subir de nível na Início');
const badges = gamification.evaluateBadges([], [], [], 0, undefined, ['superavit_month']);
for (const badge of badges) {
  ok(!antigos.test(badge.title), `medalha ${badge.id}: título atual`);
  ok(!/—|não é .+, é /i.test(badge.description), `medalha ${badge.id}: copy`);
  ok(!/R\$ /.test(badge.description + badge.progressLabel), `medalha ${badge.id}: moeda unida`);
  ok(/\u00a0\S+$/.test(semViuva(badge.title)), 'últimas palavras unidas');
}
ok(formatBRL(5000).startsWith('R$\u00a0'), 'moeda unida ao número');

// Executa os componentes reais, com adaptadores de plataforma e JSX de árvore.
const routes = [];
const jsx = (type, props) => ({ type, props: props ?? {} });
let values = [], index = 0, callbacks = [];
const token = new Proxy({}, { get: (_, k) => k === 'padding' ? 16 : 14 });
const theme = new Proxy({}, { get: (_, k) => String(k) });
const cache = new Map();
const states = [];
const data = {
  fetchTransactions: async () => [], fetchBills: async () => [], fetchBudgets: async () => [],
  fetchGamificationHistoricalSummary: async () => ({}), fetchConquistas: async () => [],
  fetchCreditCards: async () => [], fetchCardInvoicePayments: async () => [],
  fetchDiasDeAtividade: async () => new Set(['2026-11-01']),
  fetchDiasComRegistro: async () => new Set(['2026-11-01']), registrarConquistas: async () => {},
};
const mocks = {
  react: { useState: initial => { const i = index++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; }, useMemo: f => f(), useCallback: f => { callbacks.push(f); return f; }, useRef: v => ({ current: v }), useEffect: () => {} },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { Text: 'Text', View: 'View', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', StyleSheet: { create: x => x }, ActivityIndicator: 'ActivityIndicator' },
  'expo-router': { useRouter: () => ({ push: r => routes.push(r) }), useFocusEffect: () => {} },
  '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
  '@/lib/theme': { theme, spacing: token, radius: token, fonts: { light: 'Light', regular: 'Regular' }, type: token, lh: x => x, screenRhythm: token, card: token, touchTarget: 48, menta: a => `rgba(174,255,227,${a})` },
  '@/lib/format': carregar('lib/format.ts'), '@/lib/sem-viuva': { semViuva },
  '@/lib/data': data, '@/lib/goals': { fetchGoals: async () => [] },
  '@/lib/feature-flags': { useFlags: () => ({ ligado: () => true, flag: () => null }) },
  '@/lib/privacy-context': { usePrivacy: () => ({ hidden: false, toggle: () => {} }) },
  '@/lib/use-categorias': { useCategorias: () => ({ resultado: null, erro: null, carregando: false, carregar: async () => {} }) }, '@/lib/categorias-cliente': { gastosDoDia: () => ({ linhas: [], centavos: 0 }) },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) }, '@/lib/demo-data': {},
  '@/lib/tab-bar': { useTabBarInset: () => ({ paddingConteudo: 80 }) },
  '@/lib/breakpoints': { colunaConteudo: {}, useBreakpoint: () => ({}) }, '@/lib/haptics': { hapticTap: () => {} },
  '@/lib/gamification': { ...gamification, getGamificationState: (...args) => { states.push(args); return gamification.getGamificationState(...args); } },
};
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports, console, Date, Set, Map, Promise,
    require(id) {
      if (mocks[id]) return mocks[id];
      if (id.includes('AppPressable')) return { __esModule: true, default: 'AppPressable' };
      if (id.includes('PrivacyValue')) return { __esModule: true, default: 'PrivacyValue' };
      if (id.includes('FaixaOffline')) return { __esModule: true, default: 'FaixaOffline', useRecarregarAoChegarDadoNovo: () => {} };
      if (/HojeNoSeuMes|DesafiosCalendario|DesafiosPadraoGastos|MonthSelector/.test(id)) return load('components/' + id.split('/').at(-1) + '.tsx');
      if (id.startsWith('@/components/')) return { __esModule: true, default: id.split('/').at(-1) };
      if (id.startsWith('@/lib/')) return carregar('lib/' + id.split('/').at(-1) + '.ts');
      throw new Error('import não simulado: ' + id);
    },
  }, { filename: file });
  return exports;
}
function nodes(n) { if (Array.isArray(n)) return n.flatMap(nodes); if (!n || typeof n !== 'object') return []; return [n, ...nodes(n.props?.children)]; }
function text(n) { if (Array.isArray(n)) return n.map(text).join(''); if (typeof n === 'string' || typeof n === 'number') return String(n); return n && typeof n === 'object' ? text(n.props?.children) : ''; }
async function main() {
  const Hoje = load('components/HojeNoSeuMes.tsx').default;
  const empty = { bills: [], cards: [], goals: [], tx: [] };
  ok(Hoje(empty) === null, 'sem dado real, sem cartão');
  const iso = carregar('lib/format.ts').isoLocal(new Date());
  const tree = Hoje({ bills: [{ status: 'pending', due_date: iso }], cards: [{ name: 'Cartão', closing_day: new Date().getDate() }], goals: [{ id: 'meta-1', title: 'Viagem', deadline: iso, current_amount: 10, target_amount: 100 }], tx: [{ category: '' }] });
  const buttons = nodes(tree).filter(n => n.type === 'AppPressable');
  ok(buttons.length === 3, 'até três ações');
  buttons.forEach(b => b.props.onPress());
  assert.deepEqual(JSON.parse(JSON.stringify(routes)), ['/(app)/contas', '/(app)/credito', { pathname: '/(app)', params: { acao: 'deposit-goal', goalId: 'meta-1' } }]); checks++;
  nodes(Hoje({ ...empty, tx: [{ category: '' }] })).find(n => n.type === 'AppPressable').props.onPress();
  ok(routes.at(-1) === '/(app)/lancamentos', 'sem categoria leva a Lançamentos');
  ok(Hoje({ ...empty, bills: [{ status: 'paid', due_date: iso }], goals: [{ deadline: iso, current_amount: 100, target_amount: 100 }] }) === null, 'sem convite para conta paga ou meta concluída');
  const Padrao = load('components/DesafiosPadraoGastos.tsx').default;
  ok(Padrao({ padrao: null }) === null, 'abaixo do mínimo não renderiza padrão');
  const p = Padrao({ padrao: { ano: 2026, mes: 9, dia: { iso: '2026-10-12', total: 123.45 }, frases: {} } });
  ok(nodes(p).some(n => n.type === 'PrivacyValue' && text(n).includes('123,45')), 'valor estruturado protegido por PrivacyValue');
  const Tela = load('app/(app)/desafios.tsx').default;
  index = 0; callbacks = []; Tela();
  await callbacks.find(f => f.constructor.name === 'AsyncFunction')();
  ok(states[0][5].dias.has('2026-11-01'), 'tela passa dias carregados para a lógica real');
  index = 0; callbacks = []; const screen = Tela();
  const all = nodes(screen);
  ok(all.some(n => n.type === Hoje), 'ações presentes na tela');
  ok(all.some(n => n.type === load('components/DesafiosCalendario.tsx').default), 'calendário presente');
  ok(!text(screen).includes('Composição do Score'), 'detalhes recolhidos inicialmente');
  all.find(n => n.props.accessibilityState?.expanded === false).props.onPress();
  index = 0; const expanded = Tela();
  ok(text(expanded).replaceAll('\u00a0', ' ').includes('Composição do Score'), 'toque expande os detalhes');
  const Month = load('components/MonthSelector.tsx').default;
  const selector = Month({ year: 2026, month: 10, onChange: () => {}, anteriorDesabilitado: true, proximoDesabilitado: true });
  const arrows = nodes(selector).filter(n => n.type === 'AppPressable' && /Mês anterior|Próximo mês/.test(n.props.accessibilityLabel));
  ok(arrows.length === 2 && arrows.every(n => n.props.disabled), 'seletor existente aceita os limites do calendário');
  const normal = Month({ year: 2026, month: 10, onChange: () => {} });
  ok(nodes(normal).filter(n => n.type === 'AppPressable').every(n => !n.props.disabled), 'outros consumidores continuam sem limite');
  const contexto = carregar('lib/contexto-lembrete.ts');
  const agora = new Date(2026, 10, 1, 12);
  const dias = new Set(['2026-10-30', '2026-10-31', '2026-11-01']);
  const g = gamification.getGamificationState([], [], [], undefined, [], { dias, agora });
  ok(contexto.contextoDoLembrete([], agora, dias).streak === g.streak, 'lembrete e tela usam os mesmos dias mesmo sem linhas na janela de ocorrência');
  const monthly = carregar('lib/monthly-wrapped.ts', { './supabase': { supabase: {} } });
  const wrapped = monthly.gerarMonthlyWrapped([], [], [], 1000, agora, [{ current_amount: 100, target_amount: 100 }, { current_amount: 50, target_amount: 200 }]);
  ok(wrapped.metasConcluidas === 1 && wrapped.totalGuardado === 150, 'retrospectiva usa metas reais, sem converter XP em dinheiro');
  // Cache real de data.ts: exclusão/gravação por qualquer emissor invalida o mês fechado.
  let observador, consultas = 0;
  let linhas = [{ created_at: '2025-09-02T12:00:00-03:00', occurred_on: '2020-01-01' }];
  const versao = carregar('lib/lancamentos-alterados.ts');
  const fake = {
    './supabase': { supabase: { from: () => {
      const q = { select: () => q, gte: () => q, lt: () => q, order: () => q, range: async () => { consultas++; return { data: linhas }; } };
      return q;
    } } },
    './cache-de-tela': { comCacheOffline: (_key, fn) => fn },
    './paginacao': { buscarTodasAsPaginas: async fn => (await fn(0, 999)).data },
    './gamification': gamification, './desafios-calendario': carregar('lib/desafios-calendario.ts'), './format': carregar('lib/format.ts'),
    './fila-pendente': { juntarPendentes: async x => x }, './widgets-home-events': { observarDadosDosWidgets: fn => { observador = fn; } },
    './lancamentos-alterados': versao, './types': { CATEGORIES: [] },
  };
  const dataExports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/data.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: dataExports, Date, Set, Map, console, require: id => fake[id] ?? {},
  });
  ok((await dataExports.fetchDiasComRegistro(2025, 8)).has('2025-09-02'), 'cache lê created_at real');
  await dataExports.fetchDiasComRegistro(2025, 8);
  ok(consultas === 1, 'mês fechado reaproveitado');
  linhas = []; observador();
  ok((await dataExports.fetchDiasComRegistro(2025, 8)).size === 0 && consultas === 2, 'evento de exclusão limpa o cache real');
  linhas = [{ created_at: '2025-09-03T12:00:00-03:00', occurred_on: '2020-01-01' }];
  versao.marcarLancamentosAlterados();
  ok((await dataExports.fetchDiasComRegistro(2025, 8)).has('2025-09-03') && consultas === 3, 'fila offline invalida pela versão compartilhada');
  console.log(`desafios-vocabulario: ${checks} verificações passaram`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });

