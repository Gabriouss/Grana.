/* O Grana. não registra entrada em cartão (decisão do autor, 26/09/2026:
 * "Não é para ter entrada de crédito no cartão").
 *
 *   node __tests__/sem-entrada-no-cartao.cjs
 *
 * Módulos REAIS: lib/transaction-rules.ts, lib/data.ts, lib/fila-pendente.ts e
 * lib/offline-cache.ts, com banco e disco simulados. As asserções contam o que
 * foi GRAVADO, não só o que foi devolvido.
 *
 *  1. A regra e o recibo da importação.
 *  2. addTransaction e addTransactionsBatch recusam entrada com cartão, sem
 *     gravar nada; entrada sem cartão e saída no cartão continuam.
 *  3. Um item desse tipo guardado na fila offline antes da regra vai para
 *     "precisa de revisão" (código 23514), em vez de ser retentado para sempre.
 *  4. A tela de importação separa as linhas de entrada numa fatura e avisa.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, nome); passou++; };

const gravadas = [];
const disco = new Map();
const AsyncStorage = {
  getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
  setItem: async (k, v) => { disco.set(k, v); },
  removeItem: async (k) => { disco.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  getAllKeys: async () => [...disco.keys()],
};
function consulta() {
  const q = { linhas: null };
  for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'range', 'single', 'maybeSingle']) q[m] = () => q;
  q.insert = (l) => { q.linhas = [].concat(l); return q; };
  q.upsert = (l) => { q.linhas = [].concat(l); return q; };
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (q.linhas) {
      const salvas = q.linhas.map((l, i) => ({ id: `db-${gravadas.length + i + 1}`, ...l }));
      gravadas.push(...salvas);
      return { data: salvas.length === 1 ? salvas[0] : salvas, error: null };
    }
    return { data: null, error: null };
  }).then(res, rej);
  return q;
}
const notificacoes = [];
const dubles = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
  './supabase': { supabase: { from: () => consulta(), rpc: async () => ({ data: [], error: null }) } },
  './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
  './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './goals': { createGoal: async () => {} },
  './recorrencia': {},
  './notifications': { getNotifications: () => ({ scheduleNotificationAsync: async (n) => { notificacoes.push(n); } }) },
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
    exports, console: { ...console, error() {} }, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number,
    Math, Set, Map, Intl, AbortController, Uint8Array, crypto: globalThis.crypto,
    setTimeout: (fn, ms, ...a) => (ms >= 30_000 ? { unref() {} } : setTimeout(fn, ms, ...a)), clearTimeout, __DEV__: false,
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

const regras = carregar('lib/transaction-rules.ts');
const data = carregar('lib/data.ts');
const pendente = carregar('lib/fila-pendente.ts');
const fila = carregar('lib/offline-cache.ts');

const base = { description: 'AUDIT', amount: 50, category: 'Outros', color: '#fff', occurred_on: '2026-09-26' };

(async () => {
  /* ── 1. Regra e recibo ─────────────────────────────────────────────── */
  ok(regras.entradaNoCartao({ type: 'in', card_id: 'c1' }), 'entrada com cartão é entrada no cartão');
  ok(regras.entradaNoCartao({ type: 'in', payment_method: 'credit' }), 'entrada no crédito sem cartão também');
  ok(!regras.entradaNoCartao({ type: 'in', payment_method: 'pix' }), 'entrada por Pix, sem cartão, continua valendo');
  ok(!regras.entradaNoCartao({ type: 'out', card_id: 'c1' }), 'compra no cartão continua valendo');
  igual(regras.avisoEntradasNoCartaoRecusadas(0), '', 'nada recusado, nada a dizer');
  ok(/^1 linha de entrada no cartão não foi importada, /.test(regras.avisoEntradasNoCartaoRecusadas(1)), 'singular');
  ok(/^3 linhas de entrada no cartão não foram importadas, /.test(regras.avisoEntradasNoCartaoRecusadas(3)), 'plural');
  ok(/exclua a compra original/.test(regras.avisoEntradasNoCartaoRecusadas(2)), 'o recibo diz o que fazer');
  ok(![regras.MENSAGEM_ENTRADA_NO_CARTAO, regras.avisoEntradasNoCartaoRecusadas(2)].some((t) => /[—–]|estorn/i.test(t)), 'copy sem travessão e sem nomear estorno');

  /* ── 2. Camada de dados ────────────────────────────────────────────── */
  await assert.rejects(data.addTransaction({ ...base, type: 'in', payment_method: 'credit', card_id: 'c1' }),
    (e) => e.code === '23514' && e.message === regras.MENSAGEM_ENTRADA_NO_CARTAO);
  passou++;
  igual(gravadas.length, 0, 'addTransaction: nada gravado');
  await data.addTransaction({ ...base, type: 'in', payment_method: 'pix' });
  await data.addTransaction({ ...base, type: 'out', payment_method: 'credit', card_id: 'c1' });
  igual(gravadas.map((g) => [g.type, g.card_id ?? null]), [['in', null], ['out', 'c1']], 'entrada sem cartão e compra no cartão gravam');

  gravadas.length = 0;
  await assert.rejects(data.addTransactionsBatch([
    { ...base, type: 'out', payment_method: 'credit', card_id: 'c1' },
    { ...base, type: 'in', payment_method: 'credit', card_id: 'c1' },
  ]), (e) => e.code === '23514');
  passou++;
  igual(gravadas.length, 0, 'lote com uma entrada no cartão: nenhuma linha entra');

  /* ── 3. Fila offline: item antigo desse tipo vai para a revisão ──────── */
  gravadas.length = 0;
  disco.set(pendente.QUEUE_KEY, JSON.stringify([
    { localId: 'local-velho', tipo: 'transacao', userId: 'u-1', input: { ...base, type: 'in', payment_method: 'credit', card_id: 'c1' } },
    { localId: 'local-bom', tipo: 'transacao', userId: 'u-1', input: { ...base, type: 'out' } },
  ]));
  const r = await fila.flushPendingQueue();
  igual([r.synced, r.remaining, r.emRevisao], [1, 0, 1], 'o item recusado vai para a revisão e não trava o de trás');
  igual((await pendente.listarEmRevisao()).map((i) => [i.localId, i.motivo.code]), [['local-velho', '23514']], 'com o motivo');
  igual(notificacoes.length, 1, 'com recibo visível');

  /* ── 4. A tela de importação ──────────────────────────────────────── */
  const tela = fs.readFileSync(path.join(root, 'components/ImportarExtratoModal.tsx'), 'utf8');
  ok(/const aImportar = ehCartao \? linhas\.filter\(\(l\) => l\.type !== 'in'\) : linhas;/.test(tela), 'numa fatura, as linhas de entrada ficam de fora antes de enviar');
  ok(/avisoEntradasNoCartaoRecusadas\(linhas\.length - aImportar\.length\)/.test(tela), 'e a contagem vira o recibo');
  ok(/if \(aImportar\.length === 0\) \{\s*Alert\.alert\('Nada importado', avisoEntradas\);/.test(tela), 'fatura só com entradas: avisa e não importa nada');
  ok(/avisoEntradas \? `\$\{resumo\}/.test(tela), 'o recibo entra no alerta de importação concluída');
  ok(/const prontos = aImportar\.map/.test(tela), 'só as linhas aceitas são enviadas');

  console.log(`sem-entrada-no-cartao: ${passou} checagens OK`);
})().catch((e) => { console.error(e); process.exit(1); });
