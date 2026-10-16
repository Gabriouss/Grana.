// V38 (Vigil, 16/10/2026): relógio +2 h, modo avião e abertura a frio deixavam
// só o fundo da tela por ~34 s. Causa: SessionProvider (lib/auth-context.tsx)
// esperava `supabase.auth.getSession()` sem prazo antes de desligar
// `isLoading`, e `app/_layout.tsx` segura a árvore de rotas enquanto
// `isLoading` (deveSegurarRotas). Sem rede e com o token vencido, o
// getSession do auth-js renova antes de responder e insiste por ~25 s.
//
// Executa o SessionProvider REAL (hooks de React dublados), lib/sessao-offline.ts
// REAL e o supabase-js REAL, com fetch sem rede e relógio virtual. Asserta no
// tempo até `isLoading` desligar, na sessão adotada (a do disco, não
// confirmada) e em que a sessão ficou marcada como travada. Mutante: sem o
// prazo, volta aos ~25 s.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.join(__dirname, '..');
const fonteAuth = fs.readFileSync(path.join(raiz, 'lib/auth-context.tsx'), 'utf8');
const fonteSessao = fs.readFileSync(path.join(raiz, 'lib/sessao-offline.ts'), 'utf8');
const transpilar = (f) => ts.transpileModule(f, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const DataReal = Date;
const setTimeoutReal = global.setTimeout;
const clearTimeoutReal = global.clearTimeout;
const fetchReal = global.fetch;

async function cenario({ fonteA = fonteAuth, guardada = 'vencida' } = {}) {
  let agora = DataReal.UTC(2026, 9, 16, 3, 0, 0);
  class DataVirtual extends DataReal {
    constructor(...a) { a.length ? super(...a) : super(agora); }
    static now() { return agora; }
  }
  const timers = [];
  const st = (fn, ms = 0, ...args) => { const t = { quando: agora + Math.max(0, ms), fn: () => fn(...args), vivo: true, unref() { return t; }, ref() { return t; } }; timers.push(t); return t; };
  const ct = (t) => { if (t && typeof t === 'object') t.vivo = false; };
  global.Date = DataVirtual; global.setTimeout = st; global.clearTimeout = ct;
  let tentativas = 0;
  global.fetch = () => { tentativas++; return Promise.reject(new TypeError('Network request failed')); };

  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}@supabase${path.sep}`)) delete require.cache[k];
  const { createClient } = require(path.join(raiz, 'node_modules/@supabase/supabase-js'));
  const CHAVE = 'sb-teste-auth-token';
  const memoria = new Map();
  const armazenamento = {
    getItem: async (k) => memoria.get(k) ?? null,
    setItem: async (k, v) => { memoria.set(k, v); },
    removeItem: async (k) => { memoria.delete(k); },
  };
  if (guardada) {
    memoria.set(CHAVE, JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(agora / 1000) + (guardada === 'vencida' ? -2 * 3600 : 3600),
      user: { id: 'conta-AUDIT', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' },
    }));
  }
  const supabase = createClient('https://teste.invalid', 'anon', {
    auth: { storage: armazenamento, storageKey: CHAVE, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...a) => global.fetch(...a) },
  });

  const sessao = { exports: {} };
  vm.runInNewContext(transpilar(fonteSessao), {
    module: sessao, exports: sessao.exports, console, Date: DataVirtual, setTimeout: st, clearTimeout: ct,
    require: (id) => (id === './supabase' ? { supabase, armazenamentoSessao: armazenamento, CHAVE_SESSAO: CHAVE } : require(id)),
  });

  // React dublado: um render só; efeitos rodam depois; setState grava a linha do tempo.
  const estados = []; const efeitos = []; const linha = [];
  let indice = 0;
  const react = {
    createContext: () => ({}),
    use: () => null,
    useCallback: (fn) => fn,
    useRef: (v) => ({ current: v }),
    useEffect: (fn) => { efeitos.push(fn); },
    useState: (inicial) => {
      const i = indice++;
      estados[i] = inicial;
      return [inicial, (v) => { estados[i] = typeof v === 'function' ? v(estados[i]) : v; linha.push({ i, v: estados[i], ms: agora - inicio }); }];
    },
  };
  const auth = { exports: {} };
  const silencioso = { ...console, warn: () => {} };
  vm.runInNewContext(transpilar(fonteA), {
    module: auth, exports: auth.exports, console: silencioso, Date: DataVirtual, setTimeout: st, clearTimeout: ct,
    require: (id) => ({
      react,
      'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'f' },
      'react-native': { Platform: { OS: 'android' } },
      './alerta': { Alert: { alert() {} } },
      'expo-linking': { getInitialURL: async () => null, addEventListener: () => ({ remove() {} }), createURL: (p) => p, parse: () => ({}) },
      './supabase': { supabase },
      './auth-errors': { traduzirErroAuth: (e) => e },
      './assinatura': { vincularAssinaturasPendentes: async () => ({ houveFalha: true }) },
      './push-notifications': { removerPushHabitoAntesDeSair: async () => {} },
      './entitlement-cache': { esquecerAcesso: async () => {} },
      './sessao-offline': sessao.exports,
      './cache-de-tela': { esquecerTelas: async () => {} },
      './offline-cache': { esquecerLancamentosLocais: async () => {} },
      './widgets-home-sync': { limparSnapshotWidgets: async () => {} },
      './sair-da-conta': { sairDaConta: async () => {} },
    })[id] ?? require(id),
  });

  const inicio = agora;
  auth.exports.SessionProvider({ children: null });
  // Ordem dos useState em SessionProvider: session, isLoading, emRecuperacao, sessaoNaoConfirmada.
  const [I_SESSAO, I_CARREGANDO, , I_NAO_CONFIRMADA] = [0, 1, 2, 3];
  assert.equal(estados[I_CARREGANDO], true, 'ordem dos useState mudou: o teste precisa ser revisto');
  efeitos.forEach((fn) => fn());

  const avancar = () => new Promise((r) => setImmediate(r)).then(() => {
    const vivos = timers.filter((t) => t.vivo).sort((a, b) => a.quando - b.quando);
    if (!vivos.length) return false;
    const t = vivos[0]; t.vivo = false; agora = Math.max(agora, t.quando); t.fn(); return true;
  });
  const carregou = () => linha.find((m) => m.i === I_CARREGANDO && m.v === false);
  for (let i = 0; i < 20000 && !carregou(); i++) if (!(await avancar())) await new Promise((r) => setImmediate(r));
  const fim = carregou();
  const travada = sessao.exports.sessaoEstaTravada();
  global.Date = DataReal; global.setTimeout = setTimeoutReal; global.clearTimeout = clearTimeoutReal; global.fetch = fetchReal;
  return { ms: fim ? fim.ms : Infinity, sessao: estados[I_SESSAO], naoConfirmada: estados[I_NAO_CONFIRMADA], travada, tentativas };
}

(async () => {
  try {
    // Token vencido, sem rede: a árvore de rotas solta em até 2 s com a sessão do disco.
    const vencida = await cenario();
    assert.ok(vencida.ms <= 2000, `abertura a frio com token vencido e sem rede solta as rotas em até 2 s (foi ${vencida.ms} ms)`);
    assert.equal(vencida.sessao?.user?.id, 'conta-AUDIT', 'adota a sessão guardada no aparelho');
    assert.equal(vencida.naoConfirmada, true, 'a sessão do disco entra como não confirmada');
    assert.equal(vencida.travada, true, 'o estouro marca a sessão como travada, e as telas servem o disco');
    assert.ok(vencida.tentativas >= 1, 'a renovação foi tentada');

    // Token válido: responde da memória, sessão confirmada, sem esperar prazo.
    const valida = await cenario({ guardada: 'valida' });
    assert.ok(valida.ms < 100, `token válido não espera (${valida.ms} ms)`);
    assert.equal(valida.sessao?.user?.id, 'conta-AUDIT');
    assert.equal(valida.naoConfirmada, false, 'sessão válida entra confirmada');

    // Sem login guardado: segue sem sessão, na hora (o portão de login continua).
    const nenhuma = await cenario({ guardada: null });
    assert.ok(nenhuma.ms < 100, `sem login guardado não espera (${nenhuma.ms} ms)`);
    assert.equal(nenhuma.sessao, null, 'sem login guardado não inventa sessão');

    // Mutante: getSession sem prazo, como antes do V38.
    const original = 'await sessaoDoCliente(PRAZO_DONO_PADRAO_MS).catch(';
    assert.ok(fonteAuth.includes(original), 'o trecho do prazo mudou: o mutante precisa ser revisto');
    const mutante = await cenario({ fonteA: fonteAuth.replace(original, 'await supabase.auth.getSession().catch(') });
    assert.ok(mutante.ms >= 20000, `mutante sem prazo volta a segurar a tela por ~25 s (${mutante.ms} ms)`);
    console.log(`abertura-fria-token-vencido: ok (vencido ${vencida.ms} ms; valido ${valida.ms} ms; sem login ${nenhuma.ms} ms; mutante ${mutante.ms} ms)`);
  } finally {
    global.Date = DataReal; global.setTimeout = setTimeoutReal; global.clearTimeout = clearTimeoutReal; global.fetch = fetchReal;
  }
})().catch((e) => { console.error(e); process.exit(1); });
