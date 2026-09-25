/* Fila offline endurecida (parecer do Harbor, 24/09/2026).
 *
 *   node __tests__/fila-endurecida.cjs
 *
 * Decisão do autor: todo lançamento guardado sem rede sobe ao reconectar, "a
 * não ser que isso gere um perigo de segurança ao nosso sistema em caso de
 * ataque DDOS". O parecer achou o risco no próprio app: nova tentativa FIXA de
 * 30 s (manada sincronizada depois de uma queda do servidor), a fila inteira
 * de uma vez, erro permanente retentado para sempre sem recibo, nenhum teto, e
 * a voz percorrendo todos os itens mesmo sem rede.
 *
 * Módulos REAIS: lib/fila-pendente.ts, lib/offline-cache.ts, lib/data.ts e
 * lib/cache-de-tela.ts (fila de lançamentos) e lib/voice-operations.ts (voz,
 * núcleo único do app e do widget). As asserções contam QUAIS pedidos saíram.
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

/* ── Ambiente simulado ─────────────────────────────────────────────────── */
const estado = { rede: true, usuario: 'u-1', recusar: new Map(), falharRevisao: false, sorteio: 0.5, notificacoes: [] };
const gravacoes = [];
const disco = new Map();
const AsyncStorage = {
  getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
  setItem: async (k, v) => {
    if (estado.falharRevisao && k === 'grana:queue:precisa-de-revisao') throw new Error('disco cheio');
    disco.set(k, v);
  },
  removeItem: async (k) => { disco.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  getAllKeys: async () => [...disco.keys()],
};
function consulta() {
  const q = { insercao: null };
  for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'range']) q[m] = () => q;
  q.insert = (linha) => { q.insercao = linha; return q; };
  q.single = () => q;
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (!estado.rede) return { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
    if (q.insercao) {
      const recusa = estado.recusar.get(q.insercao.description);
      gravacoes.push({ description: q.insercao.description, recusado: !!recusa });
      if (recusa) return { data: null, error: recusa };
      return { data: { id: `db-${gravacoes.length}`, ...q.insercao }, error: null };
    }
    return { data: [], error: null };
  }).then(res, rej);
  return q;
}
const supabase = { from: () => consulta(), rpc: async () => ({ data: [], error: null }) };

const agendados = [];
const setTimeoutControlado = (fn, ms, ...a) => {
  if (ms >= 30_000) { const t = { fn, ms }; agendados.push(t); return t; }
  return setTimeout(fn, ms, ...a);
};
const MathControlado = Object.create(Math);
MathControlado.random = () => estado.sorteio;

const dubles = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
  './supabase': { supabase },
  './sessao-offline': { idDoUsuarioLocal: async () => estado.usuario },
  './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './goals': { createGoal: async () => {} },
  './recorrencia': {},
  './notifications': { getNotifications: () => ({ scheduleNotificationAsync: async (n) => { estado.notificacoes.push(n); } }) },
};
const cache = new Map();
function carregar(arquivo, extras = {}) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console: { ...console, error() {} }, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number,
    Math: MathControlado, Set, Map, Intl, AbortController,
    setTimeout: setTimeoutControlado, clearTimeout, __DEV__: false,
    require: (id) => {
      if (id in extras) return extras[id];
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) {
        const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregar(alvo, extras);
      }
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

const pendente = carregar('lib/fila-pendente.ts');
const fila = carregar('lib/offline-cache.ts');

const entrada = (d) => ({ type: 'out', description: d, amount: 10, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-24' });
const QUEUE = 'grana:queue:transactions-pendentes';
const encherFila = (n, dono = 'u-1', prefixo = 'AUDIT') => {
  const itens = Array.from({ length: n }, (_, i) => ({ localId: `local-${prefixo}-${i}`, tipo: 'transacao', input: entrada(`${prefixo} ${i}`), userId: dono }));
  disco.set(QUEUE, JSON.stringify([...(JSON.parse(disco.get(QUEUE) ?? '[]')), ...itens]));
};
const naFila = async () => fila.getPendingCount();
/* Zera o disco e dispara o agendamento que sobrou com a fila vazia: o módulo
   mantém um agendamento por vez, e ele só se encerra rodando. */
const limpar = async () => {
  disco.clear();
  while (agendados.length) { agendados.shift().fn(); await esperar(20); }
  gravacoes.length = 0; estado.notificacoes.length = 0; estado.recusar.clear();
};

(async () => {
  /* ── 1. Espera crescente com sorteio ─────────────────────────────────── */
  const esperas = (s) => Array.from({ length: 8 }, (_, n) => pendente.proximaEspera(n, () => s));
  igual(esperas(1), [30000, 30000, 60000, 120000, 240000, 480000, 900000, 900000], 'sorteio máximo: 30 s, dobra a cada falha, teto de 15 min');
  ok(esperas(0).every((ms) => ms >= 30000), 'sorteio mínimo nunca desce de 30 s');
  igual(esperas(0).slice(2, 7), [30000, 60000, 120000, 240000, 450000], 'sorteio mínimo: metade do teto de cada degrau (equal jitter)');
  const faixa = new Set(Array.from({ length: 50 }, (_, i) => pendente.proximaEspera(5, () => i / 50)));
  ok(faixa.size > 40, 'aparelhos com a mesma falha sorteiam esperas diferentes (desfaz a manada)');

  /* ── 2. Na fila de lançamentos, a espera cresce a cada falha de rede ──── */
  await limpar();
  estado.rede = false;
  estado.sorteio = 1;
  await fila.queuePendingTransaction(entrada('AUDIT rede'));
  igual(agendados.map((a) => a.ms), [30000], 'guardar agenda a primeira tentativa em 30 s');
  const vistas = [];
  for (let i = 0; i < 5; i++) {
    agendados.shift().fn();
    await esperar(40);
    vistas.push(agendados[0]?.ms);
  }
  igual(vistas, [30000, 60000, 120000, 240000, 480000], 'cada falha de rede seguida espera mais');
  igual(gravacoes.length, 0, 'sem rede nada chegou ao banco');
  estado.rede = true;
  agendados.shift().fn();
  await esperar(40);
  igual(gravacoes.map((g) => g.description), ['AUDIT rede'], 'com a rede de volta, grava uma vez');
  igual(agendados.length, 0, 'fila vazia: nada mais agendado');
  estado.rede = false;
  await fila.queuePendingTransaction(entrada('AUDIT depois'));
  igual(agendados.map((a) => a.ms), [30000], 'depois de um sucesso, a espera volta à base');

  /* ── 3. No máximo 50 itens por rodada ────────────────────────────────── */
  await limpar();
  estado.rede = true;
  encherFila(120);
  const r1 = await fila.flushPendingQueue();
  igual(gravacoes.length, 50, 'uma rodada envia no máximo 50 itens');
  igual([r1.synced, r1.remaining], [50, 70], 'e deixa o resto para a próxima');
  igual(agendados.map((a) => a.ms), [30000], 'a próxima rodada vem na espera base');
  agendados.shift().fn();
  await esperar(40);
  igual(gravacoes.length, 100, 'segunda rodada: mais 50');

  /* ── 4. Erro permanente vai para revisão, com recibo, e não trava a fila ─ */
  await limpar();
  estado.rede = true;
  encherFila(3, 'u-1', 'P');
  estado.recusar.set('P 0', { code: '23514', message: 'new row violates check constraint' });
  const r2 = await fila.flushPendingQueue();
  igual(gravacoes.map((g) => g.description), ['P 0', 'P 1', 'P 2'], 'o recusado não trava os de trás');
  igual([r2.synced, r2.remaining, r2.emRevisao], [2, 0, 1], 'dois gravados, um em revisão, fila vazia');
  const revisao = await pendente.listarEmRevisao();
  igual(revisao.map((i) => [i.localId, i.motivo.code]), [['local-P-0', '23514']], 'o recusado está em "precisa de revisão", com o motivo');
  igual(estado.notificacoes.length, 1, 'recibo visível publicado');
  ok(/não foi salvo/.test(estado.notificacoes[0].content.title) && /P 0/.test(estado.notificacoes[0].content.body), 'o recibo diz o que não foi salvo');
  await fila.flushPendingQueue();
  igual(gravacoes.length, 3, 'o recusado não é retentado sozinho');
  estado.usuario = 'u-2';
  igual((await pendente.listarEmRevisao()).length, 0, 'outra conta não vê a revisão de u-1');
  estado.usuario = 'u-1';
  const devolvido = await pendente.tirarDaRevisao('local-P-0');
  ok(devolvido && (await pendente.listarEmRevisao()).length === 0, 'a tela pode tirar da revisão (devolver ou descartar por escolha)');

  /* Se nem a revisão couber, o item fica na fila (perder é pior que retentar). */
  await limpar();
  encherFila(1, 'u-1', 'Q');
  estado.recusar.set('Q 0', { code: '22023', message: 'Parcelamento inválido' });
  estado.falharRevisao = true;
  const r3 = await fila.flushPendingQueue();
  estado.falharRevisao = false;
  igual([r3.synced, r3.remaining, r3.emRevisao], [0, 1, 0], 'revisão indisponível: o item fica na fila');
  igual(estado.notificacoes.length, 0, 'e não publica recibo de algo que não foi movido');

  /* Temporário do servidor (sem código de classe 22/23): fica e espera. */
  await limpar();
  encherFila(2, 'u-1', 'T');
  estado.recusar.set('T 0', { code: 'PGRST202', message: 'Could not find the function' });
  const r4 = await fila.flushPendingQueue();
  igual([gravacoes.length, r4.remaining, r4.emRevisao], [1, 2, 0], 'erro temporário do servidor para a rodada e mantém tudo');

  /* ── 5. Teto de 500 por conta, com aviso e sem descarte ──────────────── */
  await limpar();
  estado.rede = false;
  encherFila(500);
  await assert.rejects(fila.queuePendingTransaction(entrada('AUDIT 501')), (e) => e.name === 'FilaCheiaError' && /500 lançamentos/.test(e.message));
  passou++;
  igual(await naFila(), 500, 'nada foi descartado para abrir espaço');
  await assert.rejects(fila.enfileirarPendente('boleto', { description: 'x' }, { id: 'local-b' }), (e) => e.name === 'FilaCheiaError');
  passou++;
  estado.usuario = 'u-2';
  await fila.queuePendingTransaction(entrada('AUDIT outra conta'));
  igual(await naFila(), 1, 'o teto é por conta: outra conta ainda guarda');
  estado.usuario = 'u-1';

  /* ── 6. Voz: para no primeiro erro de rede, limita a rodada, revisa o recusado ─ */
  const vozDisco = new Map();
  const rpcs = [];
  const revisoes = [];
  const vozEstado = { rede: false, recusa: null, falharRecibo: false };
  const vozAsync = {
    getItem: async (k) => (vozDisco.has(k) ? vozDisco.get(k) : null),
    setItem: async (k, v) => { vozDisco.set(k, v); },
    removeItem: async (k) => { vozDisco.delete(k); },
    getAllKeys: async () => [...vozDisco.keys()],
  };
  cache.clear();
  const voz = carregar('lib/voice-operations.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: vozAsync },
    './supabase': { supabase: { rpc: (_n, args) => ({ abortSignal: async () => {
      rpcs.push(args.p_payload.description);
      if (!vozEstado.rede) return { error: { message: 'Network request failed' } };
      if (vozEstado.recusa && args.p_payload.description === vozEstado.recusa.alvo) return { error: vozEstado.recusa.erro };
      return { data: { status: 'committed', operation_id: args.p_request_id, ids: ['tx'], replayed: false } };
    } }) } },
    './widget-voz-notificacoes': { notificarRevisao: async (titulo, texto) => {
      if (vozEstado.falharRecibo) throw new Error('sem permissão de notificação');
      revisoes.push([titulo, texto]);
    } },
  });
  const falar = async (n, prefixo) => {
    for (let i = 0; i < n; i++) {
      await voz.registrarOperacaoVoz(`req-${prefixo}-${i}`, 'widget', { kind: 'transaction', type: 'out', amount: 5, description: `${prefixo} ${i}`, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-24', wallet_id: 'w' });
    }
  };
  await falar(3, 'V');
  rpcs.length = 0;
  const s1 = await voz.sincronizarOperacoesVoz();
  igual(rpcs.length, 1, 'voz sem rede: um pedido só, para no primeiro erro (antes: um por item)');
  igual([s1.sincronizadas, vozDisco.size], [0, 3], 'e nada sai da fila');

  vozEstado.rede = true;
  vozEstado.recusa = { alvo: 'V 0', erro: { code: '22023', message: 'Operacao de voz invalida' } };
  rpcs.length = 0;
  const s2 = await voz.sincronizarOperacoesVoz();
  igual(rpcs.length, 3, 'com rede, a recusa não trava os outros');
  igual(s2.sincronizadas, 2, 'dois gravados');
  igual(revisoes, [['Não consegui salvar', 'V 0 5']], 'o recusado vira revisão com recibo');
  igual(vozDisco.size, 0, 'e só sai da fila depois do recibo publicado');

  vozEstado.falharRecibo = true;
  vozEstado.rede = false; // registrada sem rede: vai para a fila
  await falar(1, 'W');
  vozEstado.rede = true;
  vozEstado.recusa = { alvo: 'W 0', erro: { code: '23503', message: 'Carteira nao pertence ao usuario' } };
  await voz.sincronizarOperacoesVoz();
  igual(vozDisco.size, 1, 'sem recibo publicado, a fala fica na fila');
  vozEstado.falharRecibo = false;
  vozEstado.recusa = null;
  vozDisco.clear();

  vozEstado.rede = false;
  await falar(60, 'L');
  vozEstado.rede = true;
  rpcs.length = 0;
  const s3 = await voz.sincronizarOperacoesVoz();
  igual([rpcs.length, s3.sincronizadas, vozDisco.size], [50, 50, 10], 'voz: no máximo 50 por sincronização');

  console.log(`fila-endurecida: ${passou} checagens OK`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
