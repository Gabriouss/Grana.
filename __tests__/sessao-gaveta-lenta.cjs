// Módulos reais, auth-js instalado, disco e relógio sintéticos. Sem contas ou rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const repo = process.env.SENTINEL54_REPO || path.resolve(__dirname, '..');
const source = process.env.SENTINEL54_SOURCE || repo;
const ts = require(path.join(repo, 'node_modules/typescript'));
const { GoTrueClient } = require(path.join(repo, 'node_modules/@supabase/auth-js'));
const turn = () => new Promise(resolve => setImmediate(resolve));
const NativeDate = Date;
const nativeTimers = { setTimeout, clearTimeout, setInterval, clearInterval };
const originalConsole = { error: console.error, warn: console.warn };

async function scenario({ delay = 0, target = 'active', dead = false, revoked = false, generation = false, repeated = false, initialAt, logoutWithoutSession = false }) {
  const start = NativeDate.parse('2026-11-20T12:00:00Z');
  let now = start, next = 0, network = 0;
  const timers = new Map(), logs = [], effects = [], cache = new Map();
  const unhandled = [];
  const recordUnhandled = error => unhandled.push(String(error));
  process.on('unhandledRejection', recordUnhandled);
  const callbacks = [];
  class ClockDate extends NativeDate {
    constructor(...args) { args.length ? super(...args) : super(now); }
    static now() { return now; }
  }
  const schedule = (fn, ms = 0, ...args) => {
    const id = ++next;
    timers.set(id, { at: now + Math.max(0, ms), fn: () => fn(...args) });
    return id;
  };
  const cancel = id => timers.delete(id);
  global.Date = ClockDate;
  global.setTimeout = schedule;
  global.clearTimeout = cancel;
  global.setInterval = () => ++next;
  global.clearInterval = () => {};
  console.error = (...args) => logs.push(args.map(String).join(' '));
  console.warn = (...args) => logs.push(args.map(String).join(' '));
  const key = 'sb-item54-auth-token';
  const activeKey = key + ':geracao-ativa';
  const id = generation ? 'g-' + '1'.repeat(32) : 'legado';
  const credentialKey = generation ? key + ':slot:' + id + ':' + key : key;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const session = { access_token: encode({ alg: 'HS256' }) + '.' + encode({ session_id: 'fixture-A' }) + '.fixture',
    refresh_token: 'fixture-refresh', expires_at: start / 1000 + 3600, expires_in: 3600,
    token_type: 'bearer', user: { id: 'fixture-A', app_metadata: {}, user_metadata: {} } };
  const credential = JSON.stringify(session);
  const disk = new Map([[credentialKey, credential]]);
  if (generation) disk.set(activeKey, JSON.stringify({ id, identidade: JSON.stringify(['fixture-A', 'fixture-A']) }));
  if (revoked) disk.set(key + ':saida:' + id, '1');
  let delayed = false, credentialStopped = false;
  const storage = {
    async getItem(name) {
      if (credentialStopped && name === credentialKey) return new Promise(() => {});
      const matches = target === 'active' ? name === activeKey : target === 'credential' ? name === credentialKey : name === key + ':saida:' + id;
      if (matches && (repeated || dead || !delayed)) {
        delayed = true;
        if (dead) return new Promise(() => {});
        await new Promise(resolve => schedule(resolve, delay));
      }
      return disk.get(name) ?? null;
    },
    async setItem(name, value) { effects.push(['set', name]); disk.set(name, value); },
    async removeItem(name) { effects.push(['remove', name]); disk.delete(name); },
  };
  const sdk = [];
  let mounted, hooks;
  const react = {
    createContext: () => { const value = {}; value.Provider = value; return value; },
    use: context => context.value,
    useState(initial) {
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
      const holder = hooks;
      return [holder.values[index], value => { holder.values[index] = typeof value === 'function' ? value(holder.values[index]) : value; }];
    },
    useRef(initial) { const index = hooks.index++; return hooks.values[index] ??= { current: initial }; },
    useCallback(fn, deps) {
      const index = hooks.index++, previous = hooks.values[index];
      if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) hooks.values[index] = { fn, deps };
      return hooks.values[index].fn;
    },
    useEffect(fn, deps) {
      const index = hooks.index++, previous = hooks.values[index];
      if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) {
        const holder = hooks;
        callbacks.push(() => { previous?.cleanup?.(); holder.values[index] = { deps, cleanup: fn() }; });
      }
    },
  };
  const mocks = {
    react: { ...react, __esModule: true, default: react },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Platform: { OS: 'web' } }, 'expo-linking': {},
    './alerta': { Alert: { alert: (...args) => logs.push(args.join(' ')) } },
    './auth-errors': { traduzirErroAuth: value => value }, './push-notifications': {},
    './entitlement-cache': {}, './cache-de-tela': {}, './offline-cache': {}, './widgets-home-sync': {},
    './sair-da-conta': {}, './data': { limparDiasComRegistro() {} }, './modo-teste': { MODO_TESTE: false },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {};
    cache.set(relative, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(source, relative), 'utf8'), { fileName: relative,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, { exports, Date: ClockDate, crypto: webcrypto, atob, URL, AbortController,
      console, setTimeout: schedule, clearTimeout: cancel,
      require(name) {
        if (name in mocks) return mocks[name];
        if (['./controle-sessao-local', './cliente-sessao-local', './sessao-offline'].includes(name)) return load('lib/' + name.slice(2) + '.ts');
        throw new Error('Import sem fronteira: ' + name);
      },
    }, { filename: relative });
    return exports;
  }
  const facade = load('lib/cliente-sessao-local.ts').criarClienteSessaoLocal(storage, key, (adapter, sdkKey) => {
    const auth = new GoTrueClient({ url: 'https://item54.invalid/auth/v1', storage: adapter, storageKey: sdkKey,
      autoRefreshToken: false, persistSession: true, detectSessionInUrl: false,
      fetch: async () => { network++; throw new Error('Rede proibida no teste'); },
    });
    sdk.push(auth);
    return { auth, removeAllChannels: async () => [] };
  }, () => logs.push('troca de cliente'));
  mocks['./supabase'] = { supabase: facade.cliente, armazenamentoSessao: facade.controle.leituraAtual,
    CHAVE_SESSAO: key, iniciarSaidaLocal: facade.iniciarSaidaLocal };
  if (initialAt !== undefined) {
    // Controle dirigido do callback vazio, mantendo o provider e a leitura reais.
    facade.cliente.auth.onAuthStateChange = callback => {
      const timer = schedule(() => callback('INITIAL_SESSION', null), initialAt);
      return { data: { subscription: { unsubscribe() { cancel(timer); } } } };
    };
  }
  function render() {
    hooks = mounted;
    hooks.index = 0;
    const value = load('lib/auth-context.tsx').SessionProvider({ children: null }).props.value;
    callbacks.splice(0).forEach(fn => fn());
    return value;
  }
  mounted = { index: 0, values: [] };
  try {
    render();
    for (let i = 0; i < 300; i++) {
      await turn();
      if (!render().isLoading) break;
      const pending = [...timers.entries()].filter(([, timer]) => timer.at <= start + 30_000)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!pending) throw new Error('Provider pendurado sem timer');
      now = pending[1].at;
      timers.delete(pending[0]);
      pending[1].fn();
    }
    await turn();
    const value = render();
    const result = { delay, target, dead, revoked, generation, repeated, initialAt, logoutWithoutSession, ms: now - start,
      user: value.session?.user.id ?? null, loading: value.isLoading, receipt: value.erroInicializacao,
      credentialPreserved: disk.get(credentialKey) === credential, effects, network, logs, unhandled };
    process.stdout.write(JSON.stringify({ measurement: result }) + '\n');
    assert.equal(result.loading, false, 'a abertura termina');
    assert.equal(result.credentialPreserved, true, 'falha de leitura preserva a credencial válida');
    assert.equal(network, 0, 'sessão válida restaura sem rede');
    assert.deepEqual(effects, [], 'recuperar a sessão não escreve nem apaga o disco');
    if (dead) {
      assert.equal(result.user, null);
      assert.match(result.receipt, /ler sua sessão/);
      assert.ok(result.ms <= 10_000, 'gaveta morta termina no prazo total');
    } else if (revoked) {
      assert.equal(result.user, null, 'slot revogado continua bloqueado');
    } else {
      assert.equal(result.user, 'fixture-A', 'gaveta lenta restaura o dono original');
      assert.equal(result.receipt, null, 'gaveta lenta conclui sem erro de abertura');
      assert.deepEqual(unhandled, [], 'SDK não deixa rejeição sem consumidor na leitura lenta');
      assert.ok(result.ms <= 10_000, 'leituras em sequência cabem no prazo total');
      assert.equal(logs.some(line => /persistência da sessão|Persistência da sessão/.test(line)), false, 'SDK inicializa sem erro de persistência');
    }
    if (logoutWithoutSession) {
      credentialStopped = true;
      const began = now;
      const exit = facade.iniciarSaidaLocal();
      let settled = false, failure;
      exit.servidor().then(() => { settled = true; }, error => { failure = error; settled = true; });
      for (let i = 0; i < 100 && !settled; i++) {
        await turn();
        if (settled) break;
        const pending = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!pending) throw new Error('Logout pendurado sem timer');
        now = pending[1].at;
        timers.delete(pending[0]);
        pending[1].fn();
      }
      result.logout = { ms: now - began, error: String(failure) };
      process.stdout.write(JSON.stringify({ logoutMeasurement: result.logout }) + '\n');
      assert.equal(settled, true);
      assert.ok(failure, 'leitura morta do logout rejeita com recibo');
      assert.ok(now - began <= 2_000, 'logout sem sessão conserva leitura da credencial em 2 s');
      await exit.confirmar();
      assert.equal(await facade.controle.admite(await facade.controle.corrente(), session), false, 'saída continua bloqueando o slot original');
    }
    return result;
  } finally {
    mounted.values.forEach(value => value?.cleanup?.());
    for (const auth of sdk) await auth.stopAutoRefresh();
    global.Date = NativeDate;
    Object.assign(global, nativeTimers);
    Object.assign(console, originalConsole);
    process.removeListener('unhandledRejection', recordUnhandled);
  }
}

(async () => {
  const cases = [
    { delay: 0 }, { delay: 2_100 }, { delay: 3_000 }, { delay: 5_000 },
    { delay: 5_000, target: 'credential' }, { delay: 5_000, target: 'mark' },
    { delay: 5_000, generation: true }, { delay: 1_000, target: 'mark', repeated: true },
    { delay: 3_000, revoked: true }, { dead: true }, { dead: true, target: 'credential' },
    { dead: true, initialAt: 8_000 }, { logoutWithoutSession: true },
  ];
  let failed = 0;
  for (const options of cases) {
    try { console.log(JSON.stringify({ status: 'PASS', ...await scenario(options) })); }
    catch (error) {
      failed++;
      console.log(JSON.stringify({ status: 'FAIL', options, message: error.message, stack: error.stack }));
    }
  }
  console.log(JSON.stringify({ cases: cases.length, passed: cases.length - failed, failed }));
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 2; });
