// Módulos reais: provider, tela e parser instalado do Expo. Apenas hooks/I/O são dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); await new Promise(setImmediate); };
const pending = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const unhandled = [];
const onUnhandled = e => unhandled.push(e);
process.on('unhandledRejection', onUnhandled);

function compile(file, mocks, globals = {}) {
  const source = process.env.CALLBACK_BASE && !file.startsWith('node_modules/')
    ? execFileSync('git', ['show', `${process.env.CALLBACK_BASE}:${file}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, file), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, allowJs: true,
  } }).outputText, { exports, require: id => mocks[id] ?? {}, URL, Object, __DEV__: false, ...globals }, { filename: file });
  return exports;
}

const linking = compile('node_modules/expo-linking/build/createURL.js', {
  'expo-constants': { __esModule: true, default: { expoConfig: { scheme: 'com.gabriouss.grana' } } },
  './Schemes': { hasCustomScheme: () => true },
  './validateURL': { validateURL: url => assert.equal(typeof url, 'string') },
});

function runtime(options = {}) {
  const effects = [], slots = [], timers = new Map(), alerts = [], logs = [], calls = [], routes = [];
  let index = 0, warm, removed = false, timerId = 0;
  const react = {
    createContext: () => ({}), use: () => null, useCallback: f => f,
    useRef: value => ({ current: value }),
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = value; return [slots[i], v => { slots[i] = v; }]; },
    useEffect: f => effects.push(f),
  };
  const jsx = (type, props) => ({ type, props });
  const router = { replace: to => routes.push(to) };
  const sessionState = { session: null, emRecuperacao: false };
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: options.os ?? 'android' }, StyleSheet: { create: x => x }, View: 'View', Text: 'Text', ActivityIndicator: 'Spinner' },
    'expo-linking': { ...linking, getInitialURL: () => options.initial ?? Promise.resolve(null),
      addEventListener: (_, callback) => { warm = callback; return { remove: () => { removed = true; } }; } },
    './alerta': { Alert: { alert: (...args) => alerts.push(args) } },
    './auth-errors': { traduzirErroAuth: () => ({ mensagem: 'Link recusado' }) },
    './supabase': { supabase: { auth: { exchangeCodeForSession: (...args) => {
      calls.push(args); return options.exchange ? options.exchange() : Promise.resolve({ error: null });
    } } } },
    'expo-router': { useRouter: () => router },
    '@/lib/auth-context': { useSession: () => sessionState },
    '@/components/AppPressable': { __esModule: true, default: 'Button' },
    '@/lib/theme': { fonts: {}, theme: {}, spacing: {}, type: {} },
  };
  const globals = { console: { warn: (...args) => logs.push(args) },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id) };
  const auth = compile('lib/auth-context.tsx', mocks, globals);
  return { auth, alerts, logs, calls, routes, timers, sessionState,
    mountProvider() { index = 0; effects.length = 0; auth.SessionProvider({ children: null }); return effects.at(-1)(); },
    warm: url => warm({ url }), removed: () => removed,
    screen: compile('app/auth/callback.tsx', mocks, globals).default,
    render(screen, runEffects = false) { index = 0; effects.length = 0; const tree = screen();
      const cleanups = runEffects ? effects.map(f => f()) : []; return { tree, cleanups }; },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat().flatMap(nodes)];
}
const CODE = 'codigo-sintetico-para-teste';
const native = `com.gabriouss.grana:///auth/callback?code=${CODE}`;
const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('percentuais e sinal de mais são texto já decodificado, inclusive query inválida', () => {
  const c = runtime();
  for (const text of ['Uso 100%', '%E0%A4%A', 'A+B', '%20 literal', 'Link expirado']) {
    const value = c.auth.extrairCallbackSeguro(`com.gabriouss.grana:///auth/callback?error_description=${encodeURIComponent(text)}`);
    assert.equal(value?.erro, text);
  }
  assert.equal(c.auth.extrairCallbackSeguro('com.gabriouss.grana:///auth/callback?error_description=100%').erro, '100%');
});
test('domínio, rota, recuperação e flowId preservados', () => {
  const c = runtime();
  assert.equal(c.auth.extrairCallbackSeguro(`https://outro.invalid/auth/callback?code=${CODE}`), null);
  assert.equal(c.auth.extrairCallbackSeguro(`com.gabriouss.grana:///outra?code=${CODE}`), null);
  const result = c.auth.extrairCallbackSeguro(native + '&type=recovery&sb_flow_id=fluxo-teste');
  assert.equal(result.code, CODE); assert.equal(result.recuperacao, true); assert.equal(result.flowId, 'fluxo-teste');
});
for (const cold of [true, false]) {
  test(`${cold ? 'cold' : 'warm'}: rejeição PKCE termina com recibo e uma única troca`, async () => {
    const before = unhandled.length;
    const c = runtime({ initial: Promise.resolve(cold ? native : null), exchange: () => Promise.reject(new Error('SEGREDO-SINTETICO')) });
    c.mountProvider(); if (!cold) await Promise.resolve(c.warm(native)).catch(() => {}); await flush();
    assert.equal(c.calls.length, 1); assert.equal(c.alerts.length, 1); assert.equal(c.logs.length, 1);
    assert.equal(unhandled.length, before); assert.ok(!JSON.stringify([...c.alerts, ...c.logs]).includes('SEGREDO-SINTETICO'));
  });
  test(`${cold ? 'cold' : 'warm'}: erro percentual mostra mensagem sem trocar código`, async () => {
    const url = native + '&error_description=Uso+100%25';
    const c = runtime({ initial: Promise.resolve(cold ? url : null) }); c.mountProvider();
    if (!cold) await Promise.resolve(c.warm(url)).catch(() => {}); await flush();
    assert.equal(c.calls.length, 0); assert.equal(c.alerts[0]?.[1], 'Uso 100%');
  });
}
test('getInitialURL rejeitado deixa recibo sem erro não tratado', async () => {
  const before = unhandled.length; const c = runtime({ initial: Promise.reject(new Error('falha sintética')) });
  c.mountProvider(); await flush(); assert.equal(c.alerts.length, 1); assert.equal(c.calls.length, 0); assert.equal(unhandled.length, before);
});
test('desmontagem antes da URL inicial impede troca e aviso tardios', async () => {
  const deferred = pending(); const c = runtime({ initial: deferred.promise }); const cleanup = c.mountProvider();
  cleanup(); deferred.resolve(native); await flush(); assert.equal(c.calls.length, 0); assert.equal(c.alerts.length, 0); assert.equal(c.removed(), true);
});
test('App Link de cadastro evita PKCE e web não instala segundo consumidor', async () => {
  const c = runtime(); c.mountProvider(); await c.warm(`https://www.granaponto.com.br/auth/callback?code=${CODE}`);
  assert.equal(c.calls.length, 0); assert.equal(c.alerts[0][0], 'E-mail confirmado');
  const web = runtime({ os: 'web' }); assert.equal(web.mountProvider(), undefined); assert.equal(web.calls.length, 0);
});
test('SDK com erro devolvido e sucesso mantêm uma troca, sem retry', async () => {
  for (const error of [null, { message: 'recusado' }]) {
    const c = runtime({ exchange: () => Promise.resolve({ error }) }); c.mountProvider(); await c.warm(native);
    assert.equal(c.calls.length, 1); assert.equal(c.alerts.length, error ? 1 : 0);
  }
});
test('tela pendente conclui em dez segundos e oferece retorno utilizável', () => {
  const c = runtime(); const first = c.render(c.screen, true);
  assert.ok(nodes(first.tree).some(n => n.type === 'Spinner'));
  assert.equal(c.timers.size, 1); const timer = [...c.timers.values()][0]; assert.equal(timer.ms, 10_000); timer.fn();
  const tree = c.render(c.screen).tree; assert.ok(!nodes(tree).some(n => n.type === 'Spinner'));
  const button = nodes(tree).find(n => n.type === 'Button'); assert.ok(button); button.props.onPress(); assert.equal(c.routes.at(-1), '/sign-in');
  first.cleanups.forEach(f => f?.()); assert.equal(c.timers.size, 0);
});
test('sessão confirmada sai do callback e recuperação conserva rota restrita', () => {
  for (const recovery of [true, false]) {
    const c = runtime(); c.sessionState.session = { user: { id: 'conta-sintetica' } }; c.sessionState.emRecuperacao = recovery;
    c.render(c.screen, true); assert.equal(c.routes.at(-1), recovery ? '/nova-senha' : '/');
  }
});

(async () => {
  let failed = 0;
  for (const { name, fn } of cases) { try { await fn(); console.log('OK', name); } catch (error) { failed++; console.error('FALHOU', name, error); } }
  process.removeListener('unhandledRejection', onUnhandled);
  console.log(`${cases.length - failed}/${cases.length} grupos; ${failed} falhas`); process.exitCode = failed ? 1 : 0;
})();
