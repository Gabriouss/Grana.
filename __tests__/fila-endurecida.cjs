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
/* Linhas gravadas com chave: o índice único (user_id, client_request_id). */
const gravadasPorChave = new Map();
function consulta() {
  const q = { insercao: null, upsert: false, unico: false, chaveLida: null };
  for (const m of ['select', 'order', 'gte', 'lte', 'range']) q[m] = () => q;
  q.eq = (c, v) => { if (c === 'client_request_id') q.chaveLida = v; return q; };
  q.insert = (linha) => { q.insercao = linha; return q; };
  q.upsert = (linha) => { q.insercao = linha; q.upsert = true; return q; };
  q.single = () => { q.unico = true; return q; };
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (!estado.rede) return { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
    if (q.insercao) {
      const k = q.insercao.client_request_id;
      if (q.upsert && k && gravadasPorChave.has(k)) return { data: [], error: null };
      const recusa = estado.recusar.get(q.insercao.description);
      gravacoes.push({ description: q.insercao.description, recusado: !!recusa });
      if (recusa) return { data: null, error: recusa };
      const linha = { id: `db-${gravacoes.length}`, ...q.insercao };
      if (k) gravadasPorChave.set(k, linha);
      return { data: q.upsert ? [linha] : linha, error: null };
    }
    if (q.unico && q.chaveLida) return { data: gravadasPorChave.get(q.chaveLida) ?? null, error: null };
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
    Math: MathControlado, Set, Map, Intl, AbortController, Uint8Array,
    /* Como no aparelho (react-native-get-random-values): a chave de
       idempotência sai do crypto, não do Math.random fixo deste teste. */
    crypto: globalThis.crypto,
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
  /* Uma rodada por vez (T22): espera a que estiver em voo terminar, para a
     próxima seção começar com a fila parada. */
  await fila.flushPendingQueue();
  while (agendados.length) { agendados.shift().fn(); await esperar(20); }
  await fila.flushPendingQueue();
  gravacoes.length = 0; estado.notificacoes.length = 0; estado.recusar.clear(); gravadasPorChave.clear();
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

  /* ── 4b. "Tentar de novo" da tela de revisão (26/09/2026) ─────────────── */
  const revisar = async (desc, code) => {
    encherFila(1, 'u-1', desc);
    estado.recusar.set(`${desc} 0`, { code, message: 'recusado' });
    await fila.flushPendingQueue();
    return `local-${desc}-0`;
  };
  await limpar();
  const idR = await revisar('R', '23514');
  estado.notificacoes.length = 0;
  gravacoes.length = 0;
  igual(await fila.devolverDaRevisaoParaFila(idR), 'recusado', 'recusado de novo: a tela diz isso');
  igual([gravacoes.length, (await pendente.listarEmRevisao()).map((i) => i.localId), await naFila()], [1, [idR], 0],
    'uma tentativa só, e o item volta para a revisão, fora da fila');
  igual(estado.notificacoes.length, 1, 'com recibo, como qualquer recusa');
  const chaveAntes = (await pendente.listarEmRevisao())[0].clientRequestId;
  estado.recusar.clear();
  gravacoes.length = 0;
  igual(await fila.devolverDaRevisaoParaFila(idR), 'salvo', 'o banco aceitou: salvo');
  igual([gravacoes.map((g) => g.description), (await pendente.listarEmRevisao()).length, await naFila()], [['R 0'], 0, 0],
    'gravado uma vez, some da revisão e da fila');
  ok(chaveAntes && gravadasPorChave.has(chaveAntes), 'a chave de idempotência original foi mantida no reenvio');
  igual(await fila.devolverDaRevisaoParaFila(idR), null, 'item que já saiu da revisão: null, sem gravar nada');
  igual(gravacoes.length, 1, 'nenhum envio extra');

  await limpar();
  const idS = await revisar('W', '23503');
  estado.recusar.clear();
  estado.rede = false;
  gravacoes.length = 0;
  igual(await fila.devolverDaRevisaoParaFila(idS), 'aguardando', 'sem rede: aguardando');
  igual([(await pendente.listarEmRevisao()).length, await naFila()], [0, 1], 'o item está na fila e fora da revisão');
  estado.rede = true;

  await limpar();
  const idC = await revisar('C', '22023');
  estado.recusar.clear();
  estado.rede = false;
  encherFila(500);
  await assert.rejects(fila.devolverDaRevisaoParaFila(idC), (e) => e.name === 'FilaCheiaError');
  passou++;
  igual((await pendente.listarEmRevisao()).map((i) => [i.localId, i.motivo.code]), [[idC, '22023']],
    'fila cheia: o item volta para a revisão com o mesmo motivo');
  igual(await naFila(), 500, 'e a fila não passou do teto');
  estado.rede = true;

  /* O que a tela mostra de cada item. */
  const base = { localId: 'x', motivo: { code: '23503', message: 'fk' }, revisaoDesde: '2026-09-26T00:00:00Z' };
  igual(pendente.resumoDaRevisao({ ...base, input: entrada('Café') }),
    { titulo: 'Café', tipo: 'Saída', valor: 10, data: '2026-09-24', motivo: 'Um cartão, carteira ou categoria usado nele não existe mais.' },
    'transação: descrição, saída, valor e data');
  igual(pendente.resumoDaRevisao({ ...base, tipo: 'parcela', input: { ...entrada('TV'), amount: 900, installments: 3 } }).tipo,
    'Compra parcelada em 3x', 'parcela diz em quantas vezes');
  igual(pendente.resumoDaRevisao({ ...base, tipo: 'boleto', input: { description: 'Luz', amount: 80, due_date: '2026-10-05' } }),
    { titulo: 'Luz', tipo: 'Conta', valor: 80, data: '2026-10-05', motivo: 'Um cartão, carteira ou categoria usado nele não existe mais.' },
    'boleto usa o vencimento');
  igual(pendente.resumoDaRevisao({ ...base, tipo: 'meta', input: { title: 'Viagem', target_amount: 3000 } }),
    { titulo: 'Viagem', tipo: 'Meta', valor: 3000, data: null, motivo: 'Um cartão, carteira ou categoria usado nele não existe mais.' },
    'meta usa título e alvo');
  igual(['23505', '23514', '22P02', ''].map((code) => pendente.motivoDaRecusa({ code, message: '' })), [
    'Ele parece já ter sido salvo antes. Confira seus lançamentos antes de tentar de novo.',
    'Faltou um dado obrigatório, ou algum valor ficou fora do permitido.',
    'Algum valor ficou num formato que o Grana. não aceita.',
    'O Grana. recusou este lançamento.',
  ], 'motivo em frase de gente, por classe');
  const textos = [...['23505', '23503', '23514', '22P02', ''].map((code) => pendente.motivoDaRecusa({ code, message: '' }))];
  ok(textos.every((t) => !/[—–]/.test(t)), 'copy sem travessão');

  /* A mensagem da fila cheia chega inteira a toda tela que usa `mensagemErro`
     (Início, QR, foto da nota, colar comprovante): o teto de 180 caracteres
     de `lib/erros.ts` a trocaria pela frase genérica em silêncio. */
  const erros = carregar('lib/erros.ts');
  const cheia = new pendente.FilaCheiaError();
  igual(erros.mensagemErro(cheia), cheia.message, 'mensagemErro mostra a mensagem da fila cheia sem cortar');

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

  /* 42501 é temporário (25/09/2026): corrida de renovação do token ou
     assinatura vencida. O lançamento é legítimo: fica na fila, sem revisão
     nem recibo, espera mais a cada falha e sobe sozinho quando o acesso volta. */
  await limpar();
  estado.rede = true;
  estado.sorteio = 1;
  encherFila(2, 'u-1', 'S');
  estado.recusar.set('S 0', { code: '42501', message: 'permission denied for function' });
  const r5 = await fila.flushPendingQueue();
  igual([gravacoes.length, r5.remaining, r5.emRevisao], [1, 2, 0], '42501: para a rodada e mantém os itens na fila');
  igual((await pendente.listarEmRevisao()).length, 0, '42501: nada vai para revisão');
  igual(estado.notificacoes.length, 0, '42501: nenhum recibo de "não foi salvo"');
  igual(agendados.map((a) => a.ms), [30000], '42501: nova tentativa com espera (1ª falha: 30 s)');
  agendados.shift().fn();
  await esperar(40);
  igual(agendados.map((a) => a.ms), [60000], '42501 de novo: a espera cresce');
  estado.recusar.delete('S 0');
  agendados.shift().fn();
  await esperar(40);
  igual([await naFila(), gravacoes.filter((g) => !g.recusado).map((g) => g.description)], [0, ['S 0', 'S 1']],
    'com o acesso de volta, os dois sobem sozinhos');

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

  /* 42501 na fila da voz: temporário, a fala fica e ninguém recebe "revisar". */
  vozEstado.rede = false;
  await falar(2, 'S');
  vozEstado.rede = true;
  vozEstado.recusa = { alvo: 'S 0', erro: { code: '42501', message: 'permission denied' } };
  revisoes.length = 0;
  rpcs.length = 0;
  await voz.sincronizarOperacoesVoz();
  igual([rpcs.length, vozDisco.size, revisoes.length], [1, 2, 0], 'voz com 42501: para no primeiro, mantém as duas falas, sem revisão');
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
