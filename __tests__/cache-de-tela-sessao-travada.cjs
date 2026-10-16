// B5 / V19 (Vigil, 16/10/2026): depois do 163f576 o aviso offline de Débito
// e Pix ainda levava 8 a 9 s no emulador. Causa medida aqui: sem rede e com o
// token vencido, a consulta do supabase-js não falha rápido, ela espera a
// renovação da sessão (até ~25 s). `comCacheOffline` esperava o prazo inteiro
// de 4 s e depois mais 2 s para perguntar o dono, ~6 s antes de servir o disco.
//
// Executa lib/cache-de-tela.ts e lib/sessao-offline.ts REAIS com o supabase-js
// REAL, fetch sem rede e relógio virtual. Asserta no tempo até a tela receber o
// disco, no dado devolvido, no motivo da faixa e em quantas vezes a rede foi
// tentada. Sessão válida com rede lenta continua esperando o prazo de 4 s.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.join(__dirname, '..');
const fonteSessao = fs.readFileSync(path.join(raiz, 'lib/sessao-offline.ts'), 'utf8');
const fonteCache = fs.readFileSync(path.join(raiz, 'lib/cache-de-tela.ts'), 'utf8');

const DataReal = Date;
const setTimeoutReal = global.setTimeout;
const clearTimeoutReal = global.clearTimeout;
const fetchReal = global.fetch;
const transpilar = (f) => ts.transpileModule(f, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

const CHAVE_TELA = 'transacoes-periodo:2026-10-01..2026-10-31';
const DO_DISCO = [{ id: 'tx-AUDIT', amount: 10 }];

async function cenario({ fonteC = fonteCache, vencida = true, rede = 'sem' } = {}) {
  let agora = DataReal.UTC(2026, 9, 16, 1, 0, 0);
  class DataVirtual extends DataReal {
    constructor(...a) { a.length ? super(...a) : super(agora); }
    static now() { return agora; }
  }
  const timers = [];
  const st = (fn, ms = 0, ...args) => { const t = { quando: agora + Math.max(0, ms), fn: () => fn(...args), vivo: true }; timers.push(t); return t; };
  const ct = (t) => { if (t && typeof t === 'object') t.vivo = false; };
  const si = (fn, ms) => st(fn, ms); // setInterval não é usado no caminho medido
  global.Date = DataVirtual; global.setTimeout = st; global.clearTimeout = ct;
  let tentativas = 0;
  // 'sem': rede ausente, erro na hora. 'lenta': conecta e nunca responde.
  global.fetch = (url) => {
    tentativas++;
    if (rede === 'sem') return Promise.reject(new TypeError('Network request failed'));
    return new Promise(() => {});
  };

  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}@supabase${path.sep}`)) delete require.cache[k];
  const { createClient } = require(path.join(raiz, 'node_modules/@supabase/supabase-js'));
  const CHAVE = 'sb-teste-auth-token';
  const memoria = new Map();
  const armazenamento = {
    getItem: async (k) => memoria.get(k) ?? null,
    setItem: async (k, v) => { memoria.set(k, v); },
    removeItem: async (k) => { memoria.delete(k); },
  };
  memoria.set(CHAVE, JSON.stringify({
    access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(agora / 1000) + (vencida ? -60 : 3600),
    user: { id: 'conta-AUDIT', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' },
  }));
  const supabase = createClient('https://teste.invalid', 'anon', {
    auth: { storage: armazenamento, storageKey: CHAVE, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...a) => global.fetch(...a) },
  });

  const sessao = { exports: {} };
  vm.runInNewContext(transpilar(fonteSessao), {
    module: sessao, exports: sessao.exports, console, Date: DataVirtual, setTimeout: st, clearTimeout: ct,
    require: (id) => (id === './supabase' ? { supabase, armazenamentoSessao: armazenamento, CHAVE_SESSAO: CHAVE } : require(id)),
  });
  const disco = new Map();
  const asyncStorage = {
    getItem: async (k) => disco.get(k) ?? null,
    setItem: async (k, v) => { disco.set(k, v); },
    removeItem: async (k) => { disco.delete(k); },
    getAllKeys: async () => [...disco.keys()],
    multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  };
  disco.set('grana:cache:tela:' + CHAVE_TELA, JSON.stringify({ userId: 'conta-AUDIT', dados: DO_DISCO, guardadoEm: '2026-10-15T12:00:00.000Z' }));
  const cache = { exports: {} };
  vm.runInNewContext(transpilar(fonteC), {
    module: cache, exports: cache.exports, console, Date: DataVirtual, setTimeout: st, clearTimeout: ct, setInterval: si, clearInterval: ct,
    require: (id) => {
      if (id === './sessao-offline') return sessao.exports;
      if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
      return require(id);
    },
  });

  const buscar = async () => {
    const { data, error } = await supabase.from('transactions').select('*').gte('occurred_on', '2026-10-01').lte('occurred_on', '2026-10-31');
    if (error) throw error;
    return data;
  };
  const buscarComCache = cache.exports.comCacheOffline('transacoes-periodo', buscar, (i, f) => `${i}..${f}`);

  const avancar = () => new Promise((r) => setImmediate(r)).then(() => {
    const vivos = timers.filter((t) => t.vivo).sort((a, b) => a.quando - b.quando);
    if (!vivos.length) return false;
    const t = vivos[0]; t.vivo = false; agora = Math.max(agora, t.quando); t.fn(); return true;
  });
  async function medir(fn) {
    const inicio = agora; const antes = tentativas;
    let fim = null, valor, erro;
    fn().then((v) => { valor = v; fim = agora; }, (e) => { erro = e; fim = agora; });
    for (let i = 0; i < 20000 && fim === null; i++) if (!(await avancar())) await new Promise((r) => setImmediate(r));
    return { ms: fim - inicio, valor, erro, tentativas: tentativas - antes, motivo: cache.exports.motivoDoModoOffline() };
  }
  const primeira = await medir(() => buscarComCache('2026-10-01', '2026-10-31'));
  const segunda = await medir(() => buscarComCache('2026-10-01', '2026-10-31'));
  return { primeira, segunda };
}

(async () => {
  try {
    // Sem rede e token vencido: a tela recebe o disco em até 2 s.
    const { primeira, segunda } = await cenario();
    assert.equal(JSON.stringify(primeira.valor), JSON.stringify(DO_DISCO), 'serve o que estava no disco');
    assert.ok(primeira.ms <= 2000, `sem rede e token vencido, o disco chega em até 2 s (foi ${primeira.ms} ms)`);
    assert.ok(primeira.motivo, 'a faixa offline acende');
    assert.equal(JSON.stringify(segunda.valor), JSON.stringify(DO_DISCO));
    assert.ok(segunda.ms <= 100, `a tela seguinte com a sessão ainda travada não espera de novo (${segunda.ms} ms)`);

    // Sessão válida e rede que conecta e não responde: continua o prazo de 4 s.
    const lenta = await cenario({ vencida: false, rede: 'lenta' });
    assert.equal(JSON.stringify(lenta.primeira.valor), JSON.stringify(DO_DISCO));
    assert.equal(lenta.primeira.ms, 4000, `sessão válida espera o prazo de 4 s da rede (${lenta.primeira.ms} ms)`);
    assert.equal(lenta.primeira.motivo, 'lento');
    assert.ok(lenta.primeira.tentativas >= 1, 'com sessão válida a busca vai à rede');

    // Mutante: sem o atalho da sessão travada, volta ao prazo inteiro + dono.
    const mutante = await cenario({ fonteC: fonteCache.replace(/Promise\.race\(\[pedido, prazo, sessaoTravada\]\)/, 'Promise.race([pedido, prazo])') });
    assert.ok(mutante.primeira.ms >= 4000, `mutante espera o prazo inteiro (${mutante.primeira.ms} ms)`);
    console.log(`cache-de-tela-sessao-travada: ok (real ${primeira.ms} ms; seguinte ${segunda.ms} ms; rede lenta ${lenta.primeira.ms} ms; mutante ${mutante.primeira.ms} ms)`);
  } finally {
    global.Date = DataReal; global.setTimeout = setTimeoutReal; global.clearTimeout = clearTimeoutReal; global.fetch = fetchReal;
  }
})().catch((e) => { console.error(e); process.exit(1); });
