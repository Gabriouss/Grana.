// V19 (Vigil, 15/10/2026): sem rede, Débito e Pix ficava 15 a 20 s no spinner.
// Causa medida: com o token vencido, o getSession() do auth-js REAL refaz a
// renovação com espera crescente até perto de 30 s (25,4 s), e
// idDoUsuarioLocal() perguntava sem prazo. Executa lib/sessao-offline.ts REAL
// com o supabase-js REAL do node_modules, fetch sem rede e relógio virtual
// (setTimeout avança o relógio na hora). Asserta no tempo, no id devolvido e em
// quantas vezes a rede foi tentada. O mutante sem prazo padrão tem que reprovar.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.join(__dirname, '..');
const fonteReal = fs.readFileSync(path.join(raiz, 'lib/sessao-offline.ts'), 'utf8');

const DataReal = Date;
const setTimeoutReal = global.setTimeout;
const clearTimeoutReal = global.clearTimeout;
const fetchReal = global.fetch;

async function cenario(fonte, { vencida = true } = {}) {
  let agora = DataReal.UTC(2026, 9, 15, 18, 0, 0);
  class DataVirtual extends DataReal {
    constructor(...a) { a.length ? super(...a) : super(agora); }
    static now() { return agora; }
  }
  const timers = [];
  const st = (fn, ms = 0, ...args) => { const t = { quando: agora + Math.max(0, ms), fn: () => fn(...args), vivo: true }; timers.push(t); return t; };
  const ct = (t) => { if (t && typeof t === 'object') t.vivo = false; };
  global.Date = DataVirtual; global.setTimeout = st; global.clearTimeout = ct;
  let tentativas = 0;
  global.fetch = async () => { tentativas++; throw new TypeError('Network request failed'); };

  // O supabase-js lê Date/setTimeout globais em tempo de execução.
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
  const js = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, {
    module: mod, exports: mod.exports, console, Date: DataVirtual, setTimeout: st, clearTimeout: ct,
    require: (id) => (id === './supabase' ? { supabase, armazenamentoSessao: armazenamento, CHAVE_SESSAO: CHAVE } : require(id)),
  });

  const avancar = () => new Promise((r) => setImmediate(r)).then(() => {
    const vivos = timers.filter((t) => t.vivo).sort((a, b) => a.quando - b.quando);
    if (!vivos.length) return false;
    const t = vivos[0]; t.vivo = false; agora = Math.max(agora, t.quando); t.fn(); return true;
  });
  async function medir(fn) {
    const inicio = agora; const antes = tentativas;
    let fim = null, valor;
    fn().then((v) => { valor = v; fim = agora; });
    for (let i = 0; i < 10000 && fim === null; i++) if (!(await avancar())) await new Promise((r) => setImmediate(r));
    return { ms: fim - inicio, id: valor, tentativas: tentativas - antes };
  }
  // Dispara a 1a e, ainda com a renovação no ar, a 2a: as duas da mesma tela.
  const primeira = mod.exports.idDoUsuarioLocal();
  const segunda = mod.exports.idDoUsuarioLocal();
  const ambas = await medir(() => Promise.all([primeira, segunda]));
  const depois = await medir(() => mod.exports.idDoUsuarioLocal());
  return { ambas, depois, mod: mod.exports };
}

(async () => {
  try {
    const { ambas, depois, mod } = await cenario(fonteReal);
    assert.equal(mod.PRAZO_DONO_PADRAO_MS, 2000);
    assert.deepEqual(ambas.id, ['conta-AUDIT', 'conta-AUDIT'], 'sem rede, o dono vem do disco');
    assert.ok(ambas.ms <= 2000, `sem rede e token vencido, o dono sai em até 2 s (foi ${ambas.ms} ms)`);
    assert.equal(depois.id, 'conta-AUDIT');
    assert.ok(depois.ms <= 2000, `pergunta seguinte também não espera a renovação (${depois.ms} ms)`);

    const valida = await cenario(fonteReal, { vencida: false });
    assert.equal(valida.ambas.ms, 0, 'sessão válida responde da memória, sem esperar prazo');
    assert.equal(valida.ambas.tentativas, 0, 'sessão válida não vai à rede');

    // Mutante: sem o prazo padrão, volta a esperar a renovação inteira (~25 s).
    const mutante = await cenario(fonteReal.replace('prazoMs: number = PRAZO_DONO_PADRAO_MS', 'prazoMs?: number'));
    assert.ok(mutante.ambas.ms > 20000, `mutante espera a renovação inteira (${mutante.ambas.ms} ms)`);
    console.log(`sessao-sem-rede-prazo: ok (real ${ambas.ms} ms; mutante ${mutante.ambas.ms} ms)`);
  } finally {
    global.Date = DataReal; global.setTimeout = setTimeoutReal; global.clearTimeout = clearTimeoutReal; global.fetch = fetchReal;
  }
})().catch((e) => { console.error(e); process.exit(1); });
