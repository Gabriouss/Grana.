/* Item 47 (20/11/2026): o painel do dia em Desafios montava todas as saídas do
   dia de uma vez. Um dia com 2.000 saídas importadas virava 2.000 linhas no
   ScrollView. Este teste executa o DesafiosCalendario real com o cálculo real
   (categorias-cliente + gastos-categoria) e trava: primeira pintura em lote,
   total do dia completo, "Ver mais itens" até o fim e lote zerado ao trocar de
   dia. ARQUIVO=<caminho> roda contra outra versão (baseline RED). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar, root } = require('./_carregar-ts.cjs');

let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const es = (v) => ({ __esModule: true, default: v });
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });

const formato = carregar('lib/format.ts');
const core = carregar('lib/gastos-categoria.ts');
const transacao = carregar('lib/transaction-rules.ts');
const calendario = carregar('lib/desafios-calendario.ts', { './format': formato });

function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    exports, Date, Set, Map, Promise, Number, String, Math, console,
    require: (id) => { if (id in mocks) return mocks[id]; throw new Error(`import não simulado ${id}`); },
  }, { filename: file });
  return exports;
}
const cliente = load('lib/categorias-cliente.ts', {
  './data': {}, './cache-de-tela': {}, './sessao-offline': {}, './gastos-categoria': core,
});

// Mês corrente: a grade usa os dias recebidos, sem consulta de histórico.
const hoje = new Date();
const inicio = formato.isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
const fim = formato.isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
const dia = inicio.slice(0, 8) + '01';
const N = 2000;
const linhas = Array.from({ length: N }, (_, i) => ({
  id: `tx-${i}`, amount: 1.5, type: 'out', payment_method: 'debit', card_id: null, category: 'Mercado',
  color: '#00a6ca', description: `Compra ${i}`, occurred_on: dia, created_at: `${dia}T12:00:00Z`,
}));
const resultado = { userId: 'u', inicio, fim, atualizadoEm: '', linhas, consumo: core.apurarGastosCategoria(linhas, { inicio, fim, idsPagamentos: new Set() }), doCache: false };

// useState por ordem de chamada; valores sobrepostos simulam o estado depois dos toques.
let estado = {}, setters = {}, chamada = 0;
const react = {
  useState: (v) => { const i = chamada++; const atual = i in estado ? estado[i] : typeof v === 'function' ? v() : v; return [atual, (n) => { setters[i] = (setters[i] ?? []).concat([n]); }]; },
  useMemo: (fn) => fn(), useEffect: () => {}, useRef: () => ({ current: null }),
};
const arquivo = process.env.ARQUIVO || 'components/DesafiosCalendario.tsx';
const DesafiosCalendario = load(arquivo, {
  react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s) => s }, Text: 'Text', View: 'View' },
  '@expo/vector-icons/Ionicons': es('Ionicons'), './AppPressable': es('AppPressable'), './MonthSelector': es('MonthSelector'), './PrivacyValue': es('PrivacyValue'),
  '@/lib/data': { fetchDiasComRegistro: async () => new Set() },
  '@/lib/categorias-cliente': cliente,
  '@/lib/use-categorias': { useCategorias: () => ({ resultado, erro: null, carregar: async () => {} }) },
  '@/lib/demo-data': { DEMO_TRANSACTIONS: [] }, '@/lib/format': formato, '@/lib/transaction-rules': transacao,
  '@/lib/desafios-calendario': calendario,
  '@/lib/theme': {
    theme: new Proxy({}, { get: (_, k) => String(k) }), menta: () => 'menta', fonts: {}, radius: {}, touchTarget: 48, lh: (n) => n,
    card: {}, spacing: new Proxy({}, { get: () => 4 }), type: new Proxy({}, { get: () => 14 }),
  },
  '@/lib/sem-viuva': { semViuva: (t) => t },
}).default;

function* nos(no) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { for (const n of no) yield* nos(n); return; }
  yield no; yield* nos(no.props?.children);
}
const textoDe = (no) => [no.props?.children].flat(Infinity).filter(t => typeof t === 'string' || typeof t === 'number').join('');
const indiceDia = 4, indiceLote = 5; // mes, historico, erro, tentativa, diaEscolhido, visiveis
function render(sobrepor) {
  chamada = 0; estado = sobrepor; setters = {};
  return DesafiosCalendario({ dias: new Set([dia]), weekActivity: [], streak: 0, demo: false });
}
const linhasNaTela = (arvore) => [...nos(arvore)].filter(n => n.type === 'View' && typeof n.key === 'string' && n.key.startsWith('tx-'));
const botaoVerMais = (arvore) => [...nos(arvore)].find(n => n.type === 'AppPressable' && [...nos(n.props.children)].some(t => t.type === 'Text' && /Ver mais/.test(textoDe(t))));

// 1. Primeira pintura: lote pequeno, total do dia completo.
let arvore = render({ [indiceDia]: dia });
const primeira = linhasNaTela(arvore).length;
check(primeira > 0 && primeira <= 50, `primeira pintura monta no máximo 50 linhas (montou ${primeira} de ${N})`);
const totais = [...nos(arvore)].filter(n => n.type === 'Text' && /R\$/.test(textoDe(n))).map(textoDe);
check(totais.includes(`− R$ ${formato.formatMoney(N * 1.5)}`), `cabeçalho mostra o total do dia inteiro (${totais[0]})`);

// 2. "Ver mais itens" avança em lotes até todas as linhas; depois some.
let visiveis = primeira, voltas = 0;
while (true) {
  const botao = botaoVerMais(arvore);
  if (visiveis >= N) { check(!botao, 'sem "Ver mais" quando tudo está na tela'); break; }
  check(!!botao, `"Ver mais" presente com ${visiveis} de ${N}`);
  botao.props.onPress();
  const set = setters[indiceLote]?.at(-1);
  visiveis = typeof set === 'function' ? set(visiveis) : set;
  arvore = render({ [indiceDia]: dia, [indiceLote]: visiveis });
  check(linhasNaTela(arvore).length === Math.min(visiveis, N), `lote ${++voltas} mostra ${Math.min(visiveis, N)} linhas`);
  assert.ok(voltas < N, 'laço sem progresso');
}
const ids = new Set(linhasNaTela(arvore).map(n => n.key));
check(ids.size === N, 'todas as saídas do dia aparecem, sem repetir');

// 3. Trocar de dia volta ao primeiro lote.
const outroDia = [...nos(arvore)].find(n => n.type === 'AppPressable' && n.props.accessibilityState && !n.props.accessibilityState.selected);
outroDia.props.onPress();
check(setters[indiceLote]?.at(-1) === primeira, 'escolher outro dia volta ao primeiro lote');

console.log(`desafios-painel-lote: ${checks} verificações ok`);
