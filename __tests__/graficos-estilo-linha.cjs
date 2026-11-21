// Item 53 (20/11/2026): a linha da tela Gráficos segue o estilo do gráfico da Início.
// Módulos reais (LineAreaChart, FlowChart e o desenho compartilhado) em vm; só React, RN e svg são dublês.
// GRAFICOS_LINHA_BASE=<pasta> troca LineAreaChart.tsx e FlowChart.tsx pela versão daquela pasta (RED).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
const watchdog = setTimeout(() => { console.error('GraficosEstiloLinha FALHA: teste não concluiu'); process.exit(1); }, 15000);

const COR = { up: '#UP', down: '#DOWN', accent2: '#ACCENT2', rule: '#RULE', inkFaint: '#FAINT', ink: '#INK', paper: '#PAPER', accent: '#ACCENT' };
const LINHA = { espessura: 2, raioPonto: 2.5, raioPontoSelecionado: 4, opacidadePonto: 0.8, opacidadeTopoDegrade: 0.3, opacidadeGrade: 0.6 };

function nos(no, pred, acc = []) { if (no == null || typeof no !== 'object') return acc; if (Array.isArray(no)) no.forEach(n => nos(n, pred, acc)); else { if (pred(no)) acc.push(no); nos(no.props?.children, pred, acc); } return acc; }
function texto(no) { if (no == null || typeof no === 'boolean') return ''; if (typeof no !== 'object') return String(no); return Array.isArray(no) ? no.map(texto).join('') : texto(no.props?.children); }
const estilo = s => Array.isArray(s) ? Object.assign({}, ...s.flat().filter(Boolean)) : (s ?? {});

function ambiente({ hidden = false } = {}) {
  let atual;
  const cache = new Map();
  const mudaram = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(ini) { const c = atual, i = c.i++; if (!(i in c.slots)) c.slots[i] = typeof ini === 'function' ? ini() : ini; return [c.slots[i], v => { c.slots[i] = typeof v === 'function' ? v(c.slots[i]) : v; }]; },
    useRef(v) { const c = atual, i = c.i++; return c.slots[i] ??= { current: v }; },
    useEffect(fn, deps) { const c = atual, i = c.i++, old = c.slots[i]; if (mudaram(old?.deps, deps)) c.efeitos.push(() => { old?.limpar?.(); c.slots[i] = { deps, limpar: fn() }; }); },
    useMemo(fn, deps) { const c = atual, i = c.i++; if (mudaram(c.slots[i]?.deps, deps)) c.slots[i] = { valor: fn(), deps }; return c.slots[i].valor; },
    memo: f => f,
  };
  const jsx = (tipo, props, key) => ({ tipo, props: props ?? {}, key });
  const svg = ['Circle', 'Defs', 'G', 'Line', 'LinearGradient', 'Path', 'Stop'];
  const mods = {
    react: { __esModule: true, default: react, ...react }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: v => v, absoluteFill: {} },
      Animated: { View: 'AnimatedView', Value: class { setValue() {} }, timing: () => ({ start() {} }) }, Easing: { bezier: () => () => {} } },
    'react-native-svg': { __esModule: true, default: 'Svg', Text: 'SvgText', ...Object.fromEntries(svg.map(v => [v, v])) },
    '@/lib/theme': { theme: COR, radius: {}, spacing: { xs: 4, sm: 8, md: 12, lg: 20 }, type: { legenda: 11, nota: 12, apoio: 13, corpo: 14, titulo: 18 }, fonts: { light: 'L', regular: 'R' }, graficoLinha: LINHA },
    '@/lib/privacy-context': { usePrivacy: () => ({ hidden }) },
    '@/lib/motion': { UI_OUT: [0, 0, 1, 1], useReducedMotion: () => true },
    '@/lib/format': { formatMoney: n => Number(n).toFixed(2).replace('.', ','), todayISO: () => '2026-11-11' },
    '@/lib/chart-labels': { visibleChartLabels: n => Array.from({ length: n }, (_, i) => i) },
    './AppPressable': 'AppPressable', './PrivacyValue': 'PrivacyValue', './StackedBarChart': {},
  };
  function carregar(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    const base = process.env.GRAFICOS_LINHA_BASE && ['components/LineAreaChart.tsx', 'components/FlowChart.tsx'].includes(rel);
    const arquivo = path.join(base ? process.env.GRAFICOS_LINHA_BASE : raiz, rel);
    const source = fs.readFileSync(arquivo, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { fileName: arquivo, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
      { exports, Date: class extends Date { constructor(...a) { super(...(a.length ? a : ['2026-11-11T12:00:00'])); } static now() { return new Date('2026-11-11T12:00:00').getTime(); } }, require(id) {
        if (id in mods) return mods[id];
        assert.ok(id.startsWith('./'), 'import inesperado ' + id);
        const relativo = path.join(path.dirname(rel), id).replaceAll('\\', '/');
        return carregar(fs.existsSync(path.join(raiz, relativo + '.ts')) ? relativo + '.ts' : relativo + '.tsx');
      } }, { filename: rel });
    return exports;
  }
  function montar(fn, props) {
    const c = { i: 0, slots: [], efeitos: [] };
    const render = () => { atual = c; c.i = 0; c.efeitos = []; const tree = fn(props); c.efeitos.forEach(f => f()); return tree; };
    render(); return render();
  }
  return { carregar, montar };
}

/* Só o que se vê: cor, traço, tracejado, área, pontos, grade e rótulos. Um
   tracejado de 900 com deslocamento 0 (resto do traçado progressivo antigo) e
   opacidade 1 desenham o mesmo que nenhum dos dois. */
function primitivas(tree) {
  const arred = v => typeof v === 'number' ? Math.round(v * 100) / 100 : v;
  const traco = p => (p.strokeDasharray === undefined || (p.strokeDasharray === 900 && !p.strokeDashoffset)) ? 'contínuo' : String(p.strokeDasharray);
  const opac = v => v === undefined ? 1 : arred(v);
  const degrades = Object.fromEntries(nos(tree, n => n.tipo === 'LinearGradient').map(g => [g.props.id, nos(g, n => n.tipo === 'Stop').map(s => [s.props.stopColor, s.props.stopOpacity])]));
  return {
    linhas: nos(tree, n => n.tipo === 'Path' && n.props.fill === 'none').map(n => ({ d: n.props.d, cor: n.props.stroke, espessura: n.props.strokeWidth, traco: traco(n.props), opacidade: opac(n.props.opacity) })),
    areas: nos(tree, n => n.tipo === 'Path' && n.props.fill !== 'none').map(n => ({ d: n.props.d, degrade: degrades[String(n.props.fill).replace(/^url\(#|\)$/g, '')], opacidade: opac(n.props.opacity) })),
    pontos: nos(tree, n => n.tipo === 'Circle').map(n => [arred(n.props.cx), arred(n.props.cy), n.props.r, n.props.fill, opac(n.props.opacity)]),
    grade: nos(tree, n => n.tipo === 'Line').map(n => [arred(n.props.y1), n.props.stroke, n.props.opacity]),
    rotulos: nos(tree, n => n.tipo === 'Text' && !nos(n, m => m !== n && m.tipo === 'Text').length).map(n => { const e = estilo(n.props.style); return [texto(n), e.top ?? null, e.left ?? null, e.right ?? null]; }).filter(r => r.slice(1).some(v => v !== null)),
    rotulosSvg: nos(tree, n => n.tipo === 'SvgText').length,
    toques: nos(tree, n => n.tipo === 'AppPressable').map(n => n.props.accessibilityLabel),
  };
}

const coluna = (label, entradas, saidas, total = saidas) => ({ label, sublabel: label, total, entradas, saidas, segments: [] });
const colunas = [coluna('Set/26', 2000, 500), coluna('Out/26', 0, 2000), coluna('Nov/26', 800, 1000)];
const casos = [], caso = (nome, fn) => casos.push([nome, fn]);
const grafico = (props, opts) => { const a = ambiente(opts); return primitivas(a.montar(a.carregar('components/LineAreaChart.tsx').default, { width: 300, height: 160, ...props })); };

caso('Despesas: saídas no estilo da Início (theme.down, tracejada, sem área)', () => {
  const p = grafico({ columns: colunas, modo: 'saidas' });
  assert.deepEqual(p.linhas.map(l => [l.cor, l.traco, l.espessura]), [[COR.down, '4 3', LINHA.espessura]]);
  assert.equal(p.areas.length, 0, 'saídas não têm degradê na Início');
  assert.ok(p.pontos.length === 3 && p.pontos.every(pt => pt[3] === COR.down));
});
caso('Renda: entradas no estilo da Início (theme.up, contínua, com degradê theme.up)', () => {
  const p = grafico({ columns: colunas.map(c => ({ ...c, total: c.entradas })), modo: 'entradas' });
  assert.deepEqual(p.linhas.map(l => [l.cor, l.traco]), [[COR.up, 'contínuo']]);
  assert.equal(p.areas.length, 1);
  assert.deepEqual(p.areas[0].degrade, [[COR.up, LINHA.opacidadeTopoDegrade], [COR.up, 0]]);
});
caso('Geral: duas linhas como o "Ambos" da Início, cada uma com o próprio valor', () => {
  const p = grafico({ columns: colunas.map(c => ({ ...c, total: c.entradas + c.saidas })), modo: 'ambos' });
  assert.deepEqual(p.linhas.map(l => [l.cor, l.traco]), [[COR.up, 'contínuo'], [COR.down, '4 3']]);
  assert.equal(p.areas.length, 1);
  // Teto 2000 nas duas: Set/26 entradas e Out/26 saídas tocam o topo (y=18); total somado não entra no desenho.
  const ys = p.pontos.map(pt => pt[1]);
  assert.equal(ys[0], 18); assert.equal(ys[4], 18);
  assert.match(p.toques[0], /entradas R\$ 2000,00, saídas R\$ 500,00$/);
});
caso('nenhuma cor fora das da Início e eixos no formato do FlowChart', () => {
  for (const modo of ['saidas', 'entradas', 'ambos']) {
    const p = grafico({ columns: colunas, modo });
    const cores = [...p.linhas.map(l => l.cor), ...p.pontos.map(pt => pt[3]), ...p.areas.flatMap(a => a.degrade.map(s => s[0]))];
    assert.ok(!cores.includes(COR.accent2), `${modo}: ainda desenha em accent2`);
    assert.equal(p.rotulosSvg, 0, `${modo}: rótulos em <SvgText>, a Início usa <Text>`);
    assert.deepEqual(p.grade.map(g => g[1]), Array(5).fill(COR.rule));
    // Eixo Y da Início: 5 linhas em maxVal/4, rótulo em <Text> 8px acima da linha; eixo X só início e fim.
    assert.deepEqual(p.rotulos.filter(r => r[1] !== null).map(r => r[0]), ['R$ 0', 'R$ 500', 'R$ 1 mil', 'R$ 1,5 mil', 'R$ 2 mil']);
    assert.deepEqual(p.rotulos.filter(r => r[1] === null).map(r => r[0]), ['Set/26', 'Nov/26']);
  }
});
caso('modo privacidade some com a escala e com os valores do toque', () => {
  const p = grafico({ columns: colunas, modo: 'ambos' }, { hidden: true });
  assert.ok(p.rotulos.filter(r => r[1] !== null).every(r => r[0] === ''));
  assert.ok(p.toques.every(t => /valores ocultos$/.test(t)));
});
caso('vazio, carregando e erro continuam no mesmo contêiner', () => {
  const a = ambiente(), C = a.carregar('components/LineAreaChart.tsx').default;
  assert.equal(nos(a.montar(C, { columns: [], carregando: true }), n => n.tipo === 'ActivityIndicator').length, 1);
  assert.match(texto(a.montar(C, { columns: [], erro: 'Não deu para carregar seus lançamentos.' })), /carregar seus lançamentos/);
  assert.match(texto(a.montar(C, { columns: [] })), /Sem dados suficientes/);
});

/* Retrato do FlowChart de antes do item 53 (ea11c74f), com a mesma entrada:
   a Início não pode mudar de visual com a extração do desenho. */
const tx = (amount, occurred_on, type) => ({ id: occurred_on + type + amount, amount, occurred_on, type });
const ENTRADA_INICIO = { transactions: [tx(2000, '2026-11-05', 'in'), tx(300, '2026-11-02', 'out'), tx(900, '2026-11-12', 'out'), tx(150, '2026-11-28', 'in')], period: 'month', year: 2026, month: 10 };
const retrato = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'graficos-estilo-linha.retrato.json'), 'utf8'));
caso('Início: o FlowChart desenha exatamente o mesmo que antes', () => {
  const a = ambiente(), p = primitivas(a.montar(a.carregar('components/FlowChart.tsx').default, ENTRADA_INICIO));
  const r = retrato(); for (const chave of Object.keys(r)) assert.deepEqual(p[chave], r[chave], 'Início mudou em ' + chave);
});
caso('Gráficos (Geral) e Início usam o mesmo traço, ponto e degradê', () => {
  const g = grafico({ columns: colunas, modo: 'ambos' });
  const estiloDe = p => ({ linhas: p.linhas.map(l => [l.cor, l.traco, l.espessura, l.opacidade]), areas: p.areas.map(x => x.degrade), raios: [...new Set(p.pontos.map(pt => pt[2]))].sort(), opac: [...new Set(p.pontos.map(pt => pt[4]))].sort(), grade: [...new Set(p.grade.map(x => x.slice(1).join()))] });
  assert.deepEqual(estiloDe(g), estiloDe(retrato()));
});

if (process.argv[2] === '--retratar') {
  const a = ambiente(), p = primitivas(a.montar(a.carregar('components/FlowChart.tsx').default, ENTRADA_INICIO));
  fs.writeFileSync(path.join(__dirname, 'graficos-estilo-linha.retrato.json'), JSON.stringify(p, null, 1) + '\n');
  console.log('retrato gravado'); clearTimeout(watchdog);
} else {
  let falhas = 0;
  for (const [nome, fn] of casos) { try { fn(); console.log('GraficosEstiloLinha OK ' + nome); } catch (e) { falhas++; console.error('GraficosEstiloLinha FALHA ' + nome + ': ' + e.message); } }
  console.log(`GraficosEstiloLinha ${casos.length - falhas}/${casos.length} grupos`); process.exitCode = falhas ? 1 : 0;
  clearTimeout(watchdog);
}
