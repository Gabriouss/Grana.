/* Lançamento salvo sem rede não é gravado duas vezes (achado T22, 25/09/2026).
 *
 *   node __tests__/fila-sem-duplicata.cjs
 *
 * Sentinel: três saídas salvas sem rede apareceram duas vezes cada no banco
 * depois da sincronização. Conferido em produção (só leitura): seis linhas,
 * pares com ~1,5 s de diferença, intercaladas a-b-c-a-b-c, `client_request_id`
 * nulo. Duas rodadas de `flushPendingQueue` (carga de Lançamentos e timer de
 * nova tentativa) liam a mesma fila e inseriam os mesmos itens.
 *
 * Duas camadas, as duas testadas aqui com os módulos REAIS (lib/data.ts,
 * lib/fila-pendente.ts, lib/offline-cache.ts, lib/cache-de-tela.ts) e um
 * banco simulado com o índice único (user_id, client_request_id):
 *   1. uma rodada por vez;
 *   2. chave de idempotência gravada no item antes do primeiro envio, e
 *      `upsert` com ignoreDuplicates.
 * E um terceiro defeito da mesma família: o fim da rodada sobrescrevia a fila
 * com a foto do começo, apagando o que fosse guardado durante ela.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.equal(JSON.stringify(a), JSON.stringify(b), nome); passou++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Banco simulado com o índice único ──────────────────────────────────── */
const estado = { rede: true, usuario: 'u-1', perderResposta: false, aoInserir: null, atraso: 0 };
const banco = { transactions: [], bills: [] };
const inserts = [];
const disco = new Map();
const AsyncStorage = {
  getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
  setItem: async (k, v) => { disco.set(k, v); },
  removeItem: async (k) => { disco.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  getAllKeys: async () => [...disco.keys()],
};
const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
function consulta(tabela) {
  const q = { filtros: [], linha: null, upsert: false, unico: false };
  for (const m of ['select', 'order', 'range']) q[m] = () => q;
  q.eq = (c, v) => { q.filtros.push((t) => t[c] === v); return q; };
  q.gte = (c, v) => { q.filtros.push((t) => t[c] >= v); return q; };
  q.lte = (c, v) => { q.filtros.push((t) => t[c] <= v); return q; };
  q.insert = (linha) => { q.linha = linha; return q; };
  q.upsert = (linha, opcoes) => { q.linha = linha; q.upsert = opcoes; return q; };
  q.single = () => { q.unico = true; return q; };
  q.then = (res, rej) => (async () => {
    if (!estado.rede) return semRede();
    const tab = banco[tabela] ?? [];
    if (q.linha) {
      inserts.push({ tabela, description: q.linha.description, chave: q.linha.client_request_id ?? null, upsert: !!q.upsert });
      if (estado.atraso) await esperar(estado.atraso);
      const k = q.linha.client_request_id;
      const repetida = k && tab.some((t) => t.user_id === q.linha.user_id && t.client_request_id === k);
      if (repetida && !q.upsert) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      let gravada = null;
      if (!repetida) {
        gravada = { id: `${tabela}-${tab.length + 1}`, created_at: new Date().toISOString(), ...q.linha };
        tab.push(gravada);
        estado.aoInserir?.(gravada);
      }
      /* Gravou, mas a resposta não voltou: o cliente vê falta de rede. */
      if (estado.perderResposta) { estado.perderResposta = false; return semRede(); }
      if (q.upsert) return { data: gravada ? [gravada] : [], error: null };
      return { data: gravada, error: null };
    }
    const linhas = tab.filter((t) => q.filtros.every((f) => f(t)));
    if (q.unico) return linhas.length === 1 ? { data: linhas[0], error: null } : { data: null, error: { code: 'PGRST116', message: `${linhas.length} linhas` } };
    return { data: linhas, error: null };
  })().then(res, rej);
  return q;
}
const supabase = { from: (t) => consulta(t), rpc: async () => ({ data: [], error: null }) };

const agendados = [];
const setTimeoutControlado = (fn, ms, ...a) => {
  if (ms >= 30_000) { const t = { fn, ms }; agendados.push(t); return t; }
  return setTimeout(fn, ms, ...a);
};
const dubles = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
  './supabase': { supabase },
  './sessao-offline': { idDoUsuarioLocal: async () => estado.usuario },
  './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './goals': { createGoal: async (input) => ({ id: 'meta-1', ...input }) },
  './recorrencia': {},
  './notifications': { getNotifications: () => null },
};
const cache = new Map();
function carregar(arquivo) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console: { ...console, error() {} }, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl,
    Uint8Array, crypto: globalThis.crypto, setTimeout: setTimeoutControlado, clearTimeout, __DEV__: false,
    require: (id) => {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) {
        const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregar(alvo);
      }
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

const fila = carregar('lib/offline-cache.ts');
const QUEUE = 'grana:queue:transactions-pendentes';
const lerFila = () => JSON.parse(disco.get(QUEUE) ?? '[]');
const entrada = (d) => ({ type: 'out', description: d, amount: 2.22, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-25' });
const doBanco = (d) => banco.transactions.filter((t) => t.description === d).length;
const zerar = async () => {
  while (agendados.length) { agendados.shift().fn(); await esperar(10); }
  await fila.flushPendingQueue();
  disco.clear(); banco.transactions.length = 0; banco.bills.length = 0; inserts.length = 0;
  Object.assign(estado, { rede: true, perderResposta: false, aoInserir: null, atraso: 0 });
};

(async () => {
  /* ── 1. O caso do Sentinel: três salvos sem rede, duas rodadas juntas ── */
  estado.rede = false;
  for (const d of ['AUDIT T13a', 'AUDIT T13b', 'AUDIT T13c']) await fila.queuePendingTransaction(entrada(d));
  ok(lerFila().every((i) => /^[0-9a-f-]{36}$/.test(i.clientRequestId)), 'cada item guardado já nasce com a chave (uuid)');
  igual(new Set(lerFila().map((i) => i.clientRequestId)).size, 3, 'e as chaves são diferentes entre si');
  estado.rede = true;
  estado.atraso = 5; // cada insert demora um pouco, como na rede real
  const p1 = fila.flushPendingQueue();
  const p2 = fila.flushPendingQueue(); // carga de Lançamentos + timer, ao mesmo tempo
  ok(p1 === p2, 'duas chamadas simultâneas recebem a MESMA rodada');
  const [r1] = await Promise.all([p1, p2]);
  igual(['AUDIT T13a', 'AUDIT T13b', 'AUDIT T13c'].map(doBanco), [1, 1, 1], 'cada lançamento está UMA vez no banco');
  igual(inserts.length, 3, 'e só três envios saíram');
  igual([r1.synced, r1.remaining, lerFila().length], [3, 0, 0], 'fila vazia no fim');
  ok(inserts.every((i) => i.upsert && i.chave), 'todo envio da fila leva a chave e usa upsert');

  /* ── 2. Resposta perdida depois de gravar: o reenvio é no-op ─────────── */
  await zerar();
  estado.rede = false;
  await fila.queuePendingTransaction(entrada('AUDIT perdida'));
  estado.rede = true;
  estado.perderResposta = true;
  const r2 = await fila.flushPendingQueue();
  igual([doBanco('AUDIT perdida'), r2.remaining], [1, 1], 'gravou, mas a resposta se perdeu: o item fica na fila');
  const r3 = await fila.flushPendingQueue();
  igual([doBanco('AUDIT perdida'), r3.synced, r3.remaining], [1, 1, 0], 'o reenvio com a mesma chave não grava de novo e esvazia a fila');

  /* O mesmo pelo salvar direto: o primeiro envio chega ao banco e a resposta se perde. */
  await zerar();
  estado.perderResposta = true;
  const salvo = await fila.salvarOuGuardarNoAparelho(entrada('AUDIT direto'));
  ok(salvo.guardado, 'sem resposta, o salvar guarda na fila');
  const chaveDoBanco = banco.transactions.find((t) => t.description === 'AUDIT direto').client_request_id;
  igual(lerFila()[0].clientRequestId, chaveDoBanco, 'a fila guarda a MESMA chave do envio que chegou ao banco');
  await fila.flushPendingQueue();
  igual(doBanco('AUDIT direto'), 1, 'e a sincronização não duplica');

  /* ── 3. Guardado durante a rodada não some ───────────────────────────── */
  await zerar();
  estado.rede = false;
  await fila.queuePendingTransaction(entrada('AUDIT antes'));
  estado.rede = true;
  let novoGuardado = null;
  estado.aoInserir = () => {
    if (novoGuardado) return;
    estado.aoInserir = null;
    novoGuardado = fila.queuePendingTransaction(entrada('AUDIT durante'));
  };
  await fila.flushPendingQueue();
  await novoGuardado;
  igual(lerFila().map((i) => i.input.description), ['AUDIT durante'], 'o que foi guardado durante a rodada continua na fila');

  /* ── 4. Item antigo sem chave recebe uma, gravada ANTES do envio ─────── */
  await zerar();
  disco.set(QUEUE, JSON.stringify([{ localId: 'local-velho', tipo: 'transacao', input: entrada('AUDIT velho'), userId: 'u-1' }]));
  estado.rede = true;
  estado.perderResposta = true;
  await fila.flushPendingQueue();
  const chaveVelho = lerFila()[0]?.clientRequestId;
  ok(/^[0-9a-f-]{36}$/.test(chaveVelho ?? ''), 'item antigo ganhou chave, e ela está gravada no disco');
  igual(inserts[0].chave, chaveVelho, 'e foi com ela que o primeiro envio saiu');
  await fila.flushPendingQueue();
  igual(doBanco('AUDIT velho'), 1, 'reenvio do item antigo não duplica');

  /* ── 5. Boleto tem chave; meta não (sem coluna) ──────────────────────── */
  await zerar();
  estado.rede = false;
  await fila.enfileirarPendente('boleto', { description: 'AUDIT boleto', amount: 10, category: 'Casa', color: '#fff', due_date: '2026-10-10' }, { id: 'local-b1' });
  await fila.enfileirarPendente('meta', { title: 'AUDIT meta', target_amount: 100 }, { id: 'local-m1' });
  const [boleto, meta] = lerFila();
  ok(/^[0-9a-f-]{36}$/.test(boleto.clientRequestId) && !meta.clientRequestId, 'boleto guardado com chave, meta sem');
  estado.rede = true;
  estado.perderResposta = true;
  await fila.flushPendingQueue();
  await fila.flushPendingQueue();
  igual(banco.bills.filter((b) => b.description === 'AUDIT boleto').length, 1, 'boleto com resposta perdida também não duplica');

  /* ── 6. Com rede, salvar direto grava uma vez, com chave ─────────────── */
  await zerar();
  const direto = await fila.salvarOuGuardarNoAparelho(entrada('AUDIT com rede'));
  ok(!direto.guardado && doBanco('AUDIT com rede') === 1 && inserts[0].chave, 'com rede: grava direto, uma vez, com chave');

  console.log(`fila-sem-duplicata: ${passou} checagens OK`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
