/* Gravar um lançamento avisa as telas montadas (achado do Harbor, 27/09/2026).
 *
 *   node __tests__/lancamento-gravado-avisa-telas.cjs
 *
 * A aba Lançamentos fica montada em segundo plano e só buscava de novo ao
 * ganhar foco; numa rede lenta mostrava "Tudo (6)" por uns 6 s depois de o
 * Colar gravar o sétimo. Agora os pontos comuns de gravação chamam
 * `lancamentoGravado()` (lib/cache-de-tela.ts): o dado atrasado sai e as
 * telas que assinam `assinarDadoNovo` recarregam na hora.
 *
 * Módulos REAIS: lib/cache-de-tela.ts, lib/offline-cache.ts, lib/data.ts,
 * lib/fila-pendente.ts e lib/voice-operations.ts. As entradas:
 *   - janela manual e Colar sem voz: `salvarOuGuardarNoAparelho`;
 *   - compra parcelada: `salvarOuGuardarParceladaNoAparelho`;
 *   - voz no app, voz no widget e Colar com voz: `registrarOperacaoVoz`
 *     (o widget chega lá por `executarTarefa`, ver voz-revisao-sem-duplicata).
 * Afirma que o assinante foi chamado, que o dado atrasado foi descartado (a
 * busca seguinte vai à rede) e que o caminho sem rede continua igual.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let passou = 0;
const ok = (nome) => { passou++; console.log('  ok  ' + nome); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Ambiente simulado ─────────────────────────────────────────────────── */
const estado = { rede: true };
const disco = new Map();
const AsyncStorage = {
  getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
  setItem: async (k, v) => { disco.set(k, v); },
  removeItem: async (k) => { disco.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  getAllKeys: async () => [...disco.keys()],
  multiGet: async (ks) => ks.map((k) => [k, disco.has(k) ? disco.get(k) : null]),
};
const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
const gravacoes = [];
function consulta() {
  const q = { insercao: null };
  for (const m of ['select', 'order', 'gte', 'lte', 'range', 'eq', 'in', 'is', 'not', 'or', 'limit']) q[m] = () => q;
  q.insert = (linha) => { q.insercao = linha; return q; };
  q.upsert = (linha) => { q.insercao = linha; return q; };
  q.single = () => q;
  q.maybeSingle = () => q;
  q.abortSignal = () => q;
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (!estado.rede) return semRede();
    if (q.insercao) {
      const linhas = (Array.isArray(q.insercao) ? q.insercao : [q.insercao]).map((l, i) => ({ id: `db-${gravacoes.length + i}`, ...l }));
      gravacoes.push(...linhas);
      return { data: Array.isArray(q.insercao) ? linhas : linhas[0], error: null };
    }
    return { data: [], error: null };
  }).then(res, rej);
  return q;
}
function rpc(nome, args) {
  const executar = async () => {
    if (!estado.rede) return semRede();
    if (nome === 'registrar_operacao_voz') {
      gravacoes.push({ id: 'tx-' + args.p_request_id, ...args.p_payload });
      return { data: { status: 'committed', operation_id: args.p_request_id, ids: ['tx-' + args.p_request_id], replayed: false }, error: null };
    }
    const n = Number(args?.p_installments ?? args?.installments ?? 2);
    const linhas = Array.from({ length: n }, (_, i) => ({ id: `parc-${gravacoes.length}-${i}` }));
    gravacoes.push(...linhas);
    return { data: linhas, error: null };
  };
  const p = executar();
  return { abortSignal: () => p, then: (a, b) => p.then(a, b) };
}
const supabase = { from: () => consulta(), rpc, auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } };

/* Prazos encurtados: o corte de 4 s do cache e o agrupamento de 250 ms do
   aviso rodam em milissegundos; a nova tentativa da fila (30 s ou mais) fica
   parada, para não correr por fora das asserções. */
const setTimeoutControlado = (fn, ms, ...a) => (ms >= 30_000 ? { parado: true } : setTimeout(fn, Math.min(ms, 5), ...a));
const clearTimeoutControlado = (t) => { if (!t?.parado) clearTimeout(t); };

const dubles = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
  './supabase': { supabase },
  './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
  './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './goals': { createGoal: async () => {} },
  './recorrencia': {},
  './notifications': { getNotifications: () => ({ scheduleNotificationAsync: async () => {} }) },
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
    exports, console: { ...console, log() {}, warn() {}, error: (...a) => process.env.DEBUG && console.error(...a) },
    JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl, AbortController, Uint8Array,
    crypto: globalThis.crypto,
    setTimeout: setTimeoutControlado, clearTimeout: clearTimeoutControlado, __DEV__: false,
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

const tela = carregar('lib/cache-de-tela.ts');
const fila = carregar('lib/offline-cache.ts');
const { registrarOperacaoVoz } = carregar('lib/voice-operations.ts');

let avisos = 0;
tela.assinarDadoNovo(() => { avisos++; });

/* Um buscador de tela com dado atrasado guardado: a primeira busca grava o
   disco, a segunda perde o prazo, devolve o disco e deixa o dado atrasado em
   memória. Enquanto ele vale, a busca não vai à rede (`idasARede` não sobe). */
let idasARede = 0;
let proximaLenta = false;
const buscarLista = tela.comCacheOffline('teste-lista', async () => {
  idasARede++;
  if (proximaLenta) { proximaLenta = false; await esperar(30); }
  return ['lista-' + idasARede];
});
async function prepararDadoAtrasado() {
  await buscarLista();
  proximaLenta = true;
  await buscarLista();
  await esperar(60);
  avisos = 0;
  const idas = idasARede;
  await buscarLista();
  assert.equal(idasARede, idas, 'preparo: o dado atrasado é servido sem ir à rede');
  return idasARede;
}
async function confirmarAvisoELimpeza(nome, idasAntes) {
  await esperar(30);
  assert.ok(avisos >= 1, `${nome}: as telas que assinam assinarDadoNovo foram avisadas`);
  await buscarLista();
  assert.equal(idasARede, idasAntes + 1, `${nome}: o dado atrasado foi descartado; a busca seguinte foi à rede`);
}

const entrada = (d, extra = {}) => ({ type: 'out', description: d, amount: 10, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-27', wallet_id: 'pessoal', ...extra });
const payloadVoz = (d) => ({ kind: 'transaction', ...entrada(d), payment_method: 'pix' });

(async () => {
  /* ── 1. Com rede: cada entrada avisa e descarta o dado atrasado ──────── */
  const entradas = [
    ['janela manual', () => fila.salvarOuGuardarNoAparelho(entrada('AUDIT janela'))],
    ['Colar sem voz', () => fila.salvarOuGuardarNoAparelho(entrada('AUDIT colar'))],
    ['compra parcelada', () => fila.salvarOuGuardarParceladaNoAparelho(entrada('AUDIT parcelada', { amount: 300, installments: 3, payment_method: 'credit', card_id: 'c-1' }))],
    ['voz no app', () => registrarOperacaoVoz(crypto.randomUUID(), 'app', payloadVoz('AUDIT voz app'))],
    ['voz no widget', () => registrarOperacaoVoz(crypto.randomUUID(), 'widget', payloadVoz('AUDIT voz widget'))],
    ['Colar com voz', () => registrarOperacaoVoz(crypto.randomUUID(), 'app', payloadVoz('AUDIT colar voz'))],
  ];
  for (const [nome, gravar] of entradas) {
    const idas = await prepararDadoAtrasado();
    const antes = gravacoes.length;
    const r = await gravar();
    assert.ok(gravacoes.length > antes, `${nome}: gravou no banco`);
    assert.ok(r.guardado === false || r.status === 'committed', `${nome}: com rede, não ficou guardado no aparelho`);
    await confirmarAvisoELimpeza(nome, idas);
  }
  ok('com rede: janela, Colar (com e sem voz), parcelada e voz (app e widget) avisam as telas e descartam o dado atrasado');

  /* ── 2. Sem rede: o caminho de antes, e o aviso também ──────────────── */
  // A lista do mês já foi aberta com rede antes, como no aparelho.
  const data = carregar('lib/data.ts');
  await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-09-30');
  estado.rede = false;
  {
    const idas = await prepararDadoAtrasado();
    const antes = gravacoes.length;
    const r = await fila.salvarOuGuardarNoAparelho(entrada('AUDIT offline'));
    assert.equal(r.guardado, true, 'sem rede: guardado no aparelho, como antes');
    assert.equal(gravacoes.length, antes, 'sem rede: nada foi ao banco');
    assert.equal(await fila.getPendingCount(), 1, 'sem rede: um item na fila');
    await confirmarAvisoELimpeza('janela sem rede', idas);
  }
  {
    const idas = await prepararDadoAtrasado();
    const id = crypto.randomUUID();
    const r = await registrarOperacaoVoz(id, 'widget', payloadVoz('AUDIT voz offline'));
    assert.equal(r.status, 'pending', 'voz sem rede: pendente, como antes');
    assert.ok(disco.has(`grana:voz:operacao:u-1:${id}`), 'voz sem rede: guardada na fila de operações');
    await confirmarAvisoELimpeza('voz sem rede', idas);
  }
  const lista = await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-09-30');
  assert.ok(lista.some((t) => t.description === 'AUDIT offline'), 'o pendente da janela aparece na lista na hora');
  assert.ok(lista.some((t) => t.description === 'AUDIT voz offline'), 'o pendente da voz aparece na lista na hora');
  estado.rede = true;
  ok('sem rede: guardado na fila como antes, pendentes na lista na hora, e as telas avisadas');

  /* ── 3. Recusa não é gravação: não avisa ─────────────────────────────── */
  {
    const recusa = { data: null, error: { code: '23514', message: 'recusado (simulado)' } };
    const original = supabase.rpc;
    supabase.rpc = () => { const p = Promise.resolve(recusa); return { abortSignal: () => p, then: (a, b) => p.then(a, b) }; };
    await esperar(30);
    avisos = 0;
    await assert.rejects(registrarOperacaoVoz(crypto.randomUUID(), 'app', payloadVoz('AUDIT recusa')));
    await esperar(30);
    assert.equal(avisos, 0, 'recusa do banco não avisa as telas');
    supabase.rpc = original;
  }
  ok('recusa do banco não é gravação e não avisa');

  /* ── 4. As telas gravam por esses pontos ─────────────────────────────── */
  const ler = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  assert.match(ler('components/PasteReceiptModal.tsx'), /registrarOperacaoVoz\(/, 'Colar com voz passa por registrarOperacaoVoz');
  assert.match(ler('components/PasteReceiptModal.tsx'), /salvarOuGuardarNoAparelho\(/, 'Colar sem voz passa por salvarOuGuardarNoAparelho');
  assert.match(ler('lib/widget-voz-task.ts'), /voiceOperations\.registrarOperacaoVoz\(requestId, (payload\.source \?\? 'widget'|args\.source)/, 'voz (app e widget) passa por registrarOperacaoVoz');
  assert.match(ler('app/(app)/lancamentos.tsx'), /salvarOuGuardarNoAparelho\(input\)/, 'janela de Lançamentos passa por salvarOuGuardarNoAparelho');
  assert.match(ler('app/(app)/lancamentos.tsx'), /useRecarregarAoChegarDadoNovo\(/, 'a aba Lançamentos assina o aviso');
  ok('as entradas gravam pelos pontos que avisam, e a aba Lançamentos assina o aviso');

  console.log(`\n${passou} checagens de "gravar avisa as telas" passaram — 0 falhas`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
