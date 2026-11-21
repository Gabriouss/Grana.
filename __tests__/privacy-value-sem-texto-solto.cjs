// Achado 53-A (21/11/2026): com valores ocultos, o PrivacyValue clona o filho
// único trocando os children pela máscara. Se o filho for uma <View>, a string
// cai solta dentro dela ("Text strings must be rendered within a <Text>") e o
// valor some. Módulos reais (LineAreaChart, LinhaFluxo e PrivacyValue) em vm;
// só React, RN, svg e expo-blur são dublês. A árvore é expandida até o fim,
// componentes de função inclusive, para ver o que o RN de fato receberia.
// PRIVACY_BASE=<pasta> troca LineAreaChart.tsx pela versão daquela pasta (RED).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
const watchdog = setTimeout(() => { console.error('PrivacySemTextoSolto FALHA: teste não concluiu'); process.exit(1); }, 15000);

const COR = { up: '#UP', down: '#DOWN', accent2: '#A2', rule: '#RULE', inkFaint: '#FAINT', ink: '#INK', paper: '#PAPER', accent: '#ACCENT' };
const LINHA = { espessura: 2, raioPonto: 2.5, raioPontoSelecionado: 4, opacidadePonto: 0.8, opacidadeTopoDegrade: 0.3, opacidadeGrade: 0.6 };

function ambiente({ hidden }) {
  let atual;
  const cache = new Map();
  const mudaram = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const ELEM = Symbol('elem');
  const jsx = (tipo, props, key) => ({ [ELEM]: true, tipo, props: props ?? {}, key });
  const react = {
    useState(ini) { const c = atual, i = c.i++; if (!(i in c.slots)) c.slots[i] = typeof ini === 'function' ? ini() : ini; return [c.slots[i], v => { c.slots[i] = typeof v === 'function' ? v(c.slots[i]) : v; }]; },
    useRef(v) { const c = atual, i = c.i++; return c.slots[i] ??= { current: v }; },
    useEffect() { atual.i++; },
    useMemo(fn, deps) { const c = atual, i = c.i++; if (mudaram(c.slots[i]?.deps, deps)) c.slots[i] = { valor: fn(), deps }; return c.slots[i].valor; },
    memo: f => f,
    isValidElement: v => !!(v && v[ELEM]),
    cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
  };
  const svg = ['Circle', 'Defs', 'G', 'Line', 'LinearGradient', 'Path', 'Stop'];
  const mods = {
    react: { __esModule: true, default: react, ...react }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'android' }, StyleSheet: { create: v => v, absoluteFill: {} },
      Animated: { View: 'AnimatedView', Value: class { setValue() {} }, timing: () => ({ start() {} }) }, Easing: { bezier: () => () => {} } },
    'react-native-svg': { __esModule: true, default: 'Svg', Text: 'SvgText', ...Object.fromEntries(svg.map(v => [v, v])) },
    'expo-blur': { BlurView: 'BlurView' },
    '@/lib/theme': { theme: COR, radius: {}, spacing: { xs: 4, sm: 8, md: 12, lg: 20 }, type: { legenda: 11, nota: 12, apoio: 13, corpo: 14, titulo: 18 }, fonts: { light: 'L', regular: 'R' }, graficoLinha: LINHA },
    '@/lib/privacy-context': { usePrivacy: () => ({ hidden }) },
    '@/lib/motion': { UI_OUT: [0, 0, 1, 1], useReducedMotion: () => true },
    '@/lib/format': { formatMoney: n => Number(n).toFixed(2).replace('.', ','), todayISO: () => '2026-11-11' },
    '@/lib/chart-labels': { visibleChartLabels: n => Array.from({ length: n }, (_, i) => i) },
    './AppPressable': 'AppPressable', './StackedBarChart': {},
  };
  function carregar(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    const base = process.env.PRIVACY_BASE && rel === 'components/LineAreaChart.tsx';
    const arquivo = path.join(base ? process.env.PRIVACY_BASE : raiz, rel);
    const source = fs.readFileSync(arquivo, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { fileName: arquivo, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
      { exports, require(id) {
        if (id in mods) return mods[id];
        assert.ok(id.startsWith('./'), 'import inesperado ' + id);
        const relativo = path.join(path.dirname(rel), id).replaceAll('\\', '/');
        return carregar(fs.existsSync(path.join(raiz, relativo + '.ts')) ? relativo + '.ts' : relativo + '.tsx');
      } }, { filename: rel });
    return exports;
  }
  /* Expande componentes de função (PrivacyValue incluso) até sobrarem só
     tipos nativos em string. */
  function expandir(no) {
    if (no == null || typeof no !== 'object') return no;
    if (Array.isArray(no)) return no.map(expandir);
    if (typeof no.tipo === 'function') {
      const c = { i: 0, slots: [] }; const antes = atual; atual = c;
      const r = no.tipo(no.props); atual = antes; return expandir(r);
    }
    return { ...no, props: { ...no.props, children: expandir(no.props.children) } };
  }
  function montar(fn, props) { return expandir({ [ELEM]: true, tipo: fn, props }); }
  return { carregar, montar };
}

/* Toda string ou número que não esteja dentro de um <Text> (ou <SvgText>). */
function textosSoltos(no, dentroDeTexto = false, acc = []) {
  if (no == null || typeof no === 'boolean') return acc;
  if (typeof no === 'string' || typeof no === 'number') { if (!dentroDeTexto && String(no) !== '') acc.push(String(no)); return acc; }
  if (Array.isArray(no)) { no.forEach(n => textosSoltos(n, dentroDeTexto, acc)); return acc; }
  const ehTexto = no.tipo === 'Text' || no.tipo === 'SvgText';
  textosSoltos(no.props?.children, dentroDeTexto || ehTexto, acc);
  return acc;
}
function nos(no, pred, acc = []) { if (no == null || typeof no !== 'object') return acc; if (Array.isArray(no)) no.forEach(n => nos(n, pred, acc)); else { if (pred(no)) acc.push(no); nos(no.props?.children, pred, acc); } return acc; }
function texto(no) { if (no == null || typeof no === 'boolean') return ''; if (typeof no !== 'object') return String(no); return Array.isArray(no) ? no.map(texto).join('') : texto(no.props?.children); }
const estilo = s => [s].flat(3).filter(Boolean).reduce((a, x) => ({ ...a, ...x }), {});

const coluna = (label, entradas, saidas) => ({ label, sublabel: label, total: entradas + saidas, entradas, saidas, segments: [{ category: 'Mercado', amount: saidas, color: '#C' }] });
const colunas = [coluna('Out/26', 2000, 500), coluna('Nov/26', 800, 1000)];
const MASCARA = 'R$ 0.000,00';

const casos = [], caso = (nome, fn) => casos.push([nome, fn]);
const grafico = (modo, hidden) => { const a = ambiente({ hidden }); return a.montar(a.carregar('components/LineAreaChart.tsx').default, { columns: colunas, modo, width: 300, height: 160 }); };

caso('Geral com valores ocultos: nenhuma string solta fora de <Text>', () => {
  const soltos = textosSoltos(grafico('ambos', true));
  assert.deepEqual(soltos, [], 'texto solto dentro de View: ' + JSON.stringify(soltos));
});
caso('Geral com valores ocultos: as duas máscaras do cabeçalho, nas cores de entrada e saída', () => {
  const arv = grafico('ambos', true);
  const cores = nos(arv, n => n.tipo === 'Text' && texto(n) === MASCARA).map(m => estilo(m.props.style).color);
  assert.ok(cores.includes(COR.up) && cores.includes(COR.down), 'máscaras esperadas em up e down, vieram ' + JSON.stringify(cores));
  assert.ok(!/2000,00|800,00|1000,00/.test(texto(arv)), 'valor real vazou com valores ocultos');
});
caso('Geral com valores visíveis: os dois valores, sem string solta', () => {
  const arv = grafico('ambos', false);
  assert.deepEqual(textosSoltos(arv), []);
  const t = texto(arv);
  assert.match(t, /\+ R\$ 800,00/); assert.match(t, /− R\$ 1000,00/);
});
caso('Despesas e Renda com valores ocultos continuam sem string solta', () => {
  for (const modo of ['saidas', 'entradas']) assert.deepEqual(textosSoltos(grafico(modo, true)), [], modo);
});

let falhas = 0;
for (const [nome, fn] of casos) { try { fn(); console.log('PrivacySemTextoSolto OK ' + nome); } catch (e) { falhas++; console.error('PrivacySemTextoSolto FALHA ' + nome + ': ' + e.message); } }
console.log(`PrivacySemTextoSolto ${casos.length - falhas}/${casos.length} grupos`); process.exitCode = falhas ? 1 : 0;
clearTimeout(watchdog);
