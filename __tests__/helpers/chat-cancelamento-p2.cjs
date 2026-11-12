// Módulos reais; só React, relógio, SDK/transporte e recursos visuais são fronteiras.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const compilados = new Map();
const pendente = () => { let resolve, reject; const promise = new Promise((s, n) => { resolve = s; reject = n; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
function observar(promise) {
  const r = { estado: 'pendente' };
  r.fim = promise.then(valor => { r.estado = 'resolvido'; r.valor = valor; }, erro => { r.estado = 'rejeitado'; r.erro = erro; });
  return r;
}
function ambiente(op = {}) {
  let agora = Date.parse('2026-11-11T12:00:00Z'), timerId = 0, atual;
  const timers = new Map(), listeners = new Set(), cache = new Map();
  const c = { posts: [], logs: [], sessionCalls: 0, historyCalls: 0, ownerSDK: 'A', ownerUI: 'A', visible: true, focuses: 0, writes: 0, writesAfterUnmount: 0, uiMounted: false };
  const session = dono => dono ? { user: { id: dono }, access_token: 'token-sintetico-' + dono } : null;
  const st = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, em: agora + ms }); return id; };
  const ct = id => timers.delete(id);
  const Clock = class extends Date { constructor(...args) { super(...(args.length ? args : [agora])); } static now() { return agora; } };
  c.advance = async ms => {
    const fim = agora + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.em <= fim).sort((a, b) => a[1].em - b[1].em)[0];
      if (!next) break;
      agora = next[1].em; timers.delete(next[0]); next[1].fn(); await flush();
    }
    agora = fim; await flush();
  };
  const sdk = { auth: {
    getSession() { c.sessionCalls++; return c.getSession ? c.getSession() : Promise.resolve({ data: { session: session(c.ownerSDK) } }); },
    onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; },
  }, from() { const q = { select() { return q; }, gte() { return q; }, order() { return q; }, limit() {
    c.historyCalls++; return c.history ? c.history() : Promise.resolve({ data: [], error: null });
  } }; return q; } };
  c.emit = (dono, evento = 'SIGNED_IN') => { c.ownerSDK = dono; for (const fn of [...listeners]) fn(evento, session(dono)); };
  c.session = session;
  c.listenerCount = () => listeners.size;
  c.timerCount = () => timers.size;
  const mudou = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(init) { const m = atual, i = m.i++; if (!(i in m.slots)) m.slots[i] = typeof init === 'function' ? init() : init; return [m.slots[i], v => {
      c.writes++; if (!m.mounted) c.writesAfterUnmount++;
      m.slots[i] = typeof v === 'function' ? v(m.slots[i]) : v;
    }]; },
    useRef(init) { const m = atual, i = m.i++; return m.slots[i] ??= { current: init }; },
    useCallback(fn, deps) { const m = atual, i = m.i++; if (mudou(m.slots[i]?.deps, deps)) m.slots[i] = { fn, deps }; return m.slots[i].fn; },
    useEffect(fn, deps) { const m = atual, i = m.i++, old = m.slots[i]; if (mudou(old?.deps, deps)) m.effects.push(() => { old?.cleanup?.(); m.slots[i] = { deps, cleanup: fn() }; }); },
  };
  class Value { constructor(v) { this.v = v; } setValue(v) { this.v = v; } interpolate() { return this; } }
  const rn = { Platform: { OS: 'android' }, StyleSheet: { create: v => v, absoluteFill: {}, hairlineWidth: 1 },
    Animated: { Value, multiply: () => new Value(1), View: 'Animated.View', timing: () => ({ start(fn) { fn?.({ finished: true }); } }) },
    Easing: { bezier: () => () => {} }, BackHandler: { addEventListener: () => ({ remove() {} }) }, Keyboard: { dismiss() {} },
    useWindowDimensions: () => ({ width: 400, height: 800, fontScale: 1 }),
  };
  for (const name of ['ActivityIndicator', 'FlatList', 'Pressable', 'Text', 'TextInput', 'View']) rn[name] = name;
  function jsx(type, props) {
    if (props?.ref && typeof props.ref === 'object') {
      if (type === 'TextInput') props.ref.current = { focus() { c.focuses++; } };
      if (type === 'FlatList') props.ref.current = { scrollToEnd() {} };
    }
    return { type, props: props ?? {} };
  }
  const tokens = new Proxy({}, { get: () => 16 });
  const visual = { __esModule: true, default: 'VisualInerte' };
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': rn,
    './supabase': { supabase: sdk }, './modo-teste': { MODO_TESTE: op.modoTeste === true }, './assistente-teste': { respostaDoTeste: () => 'resposta sintética' },
    '@/lib/auth-context': { useSession: () => ({ session: session(c.ownerUI) }) },
    '@/lib/sem-viuva': { semViuva: s => s }, '@/lib/motion': { UI_OUT: [0, 0, 1, 1], useReducedMotion: () => true },
    '@/lib/erros': { mensagemErro: (_, fallback) => fallback }, '@/lib/modal-accessibility': { useModalAccessibility() {} },
    '@/lib/janelas-abertas': { registrarJanelaAberta: () => () => {} },
    '@/lib/breakpoints': { geometriaDaConversa: () => ({ altura: 600, largura: 360, top: 0, left: 0 }) },
    '@/lib/theme': { theme: tokens, spacing: tokens, radius: tokens, fonts: tokens, type: tokens, lh: () => 20, touchTarget: 48, screenRhythm: tokens, sombras: {}, menta: () => '#fff' },
    'react-native-safe-area-context': { initialWindowMetrics: { insets: { top: 0, bottom: 0 } } },
    'expo-blur': { BlurView: 'BlurView' }, '@expo/vector-icons/Ionicons': visual,
    '@/components/AppPressable': { __esModule: true, default: 'AppPressable' },
    '@/components/DenunciarRespostaModal': visual, '@/components/Granabo3D': visual,
    '@/components/Sheet': { useKeyboardHeight: () => 0 },
  };
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const base = process.env.SENTINEL_CHAT_RED && ['lib/assistente.ts', 'components/Granachat.tsx'].includes(rel) ? process.env.SENTINEL_CHAT_RED : root;
    const abs = path.join(base, rel);
    if (!compilados.has(abs)) compilados.set(abs, ts.transpileModule(fs.readFileSync(abs, 'utf8'), { fileName: abs, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText);
    const api = {}; cache.set(rel, api);
    vm.runInNewContext(compilados.get(abs), {
      exports: api, Date: Clock, AbortController, setTimeout: st, clearTimeout: ct,
      process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.invalid' } },
      console: { error: (...v) => c.logs.push(v), warn: (...v) => c.logs.push(v) },
      fetch: async (url, options) => { c.posts.push({ url, options }); return c.fetch ? c.fetch(url, options) : {
        ok: true, status: 200, json: () => c.body ? c.body() : Promise.resolve({ resposta: '**resposta sintética**', ferramenta: 'fixture' }),
      }; },
      require(id) { if (id === '@/lib/assistente') return load('lib/assistente.ts'); if (id in mocks) return mocks[id]; throw Error('Import não simulado: ' + id); },
    }, { filename: rel });
    return api;
  }
  c.api = load('lib/assistente.ts');
  c.mount = () => {
    const api = load('components/Granachat.tsx');
    const m = { i: 0, slots: [], effects: [], mounted: true }; c.uiMounted = true;
    c.render = (effects = true) => {
      atual = m; m.i = 0; m.effects = [];
      c.tree = api.default({ visivel: c.visible, onFechar() { c.visible = false; }, reservaDaBarra: 0 });
      if (effects) for (const f of m.effects) f();
      return c.tree;
    };
    c.unmount = () => { m.mounted = false; c.uiMounted = false; for (const s of m.slots) s?.cleanup?.(); };
    c.render();
  };
  return c;
}
function nodes(n) { if (!n || typeof n !== 'object') return []; if (Array.isArray(n)) return n.flatMap(nodes); return [n, ...nodes(n.props?.children)]; }
const find = (c, label) => nodes(c.tree).find(n => n.props?.accessibilityLabel === label);
const linhas = c => nodes(c.tree).find(n => n.type === 'FlatList')?.props.data ?? [];
function digitar(c, texto) { nodes(c.tree).find(n => n.type === 'TextInput').props.onChangeText(texto); c.render(); }
module.exports = { ambiente, pendente, observar, flush, nodes, find, linhas, digitar };
