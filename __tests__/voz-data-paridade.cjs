/*
 * Data do gasto na fala, pela TAREFA REAL, nas duas entradas (regra 13;
 * spec "data na voz", 30/09/2026).
 *
 *   node __tests__/voz-data-paridade.cjs
 *
 * `executarTarefa` (lib/widget-voz-task.ts) roda com `source: 'app'` e com
 * `source: 'widget'` para cada fala, com os módulos REAIS da decisão:
 * heurísticas, `data-da-fala`, `faturaCiclo`, confiabilidade da voz, fila de
 * falas guardadas e as funções de desfecho do núcleo. Dublês só para disco,
 * AsyncStorage, notificação e a gravação no servidor (espiada: o teste afirma
 * QUAIS chamadas aconteceram, com que `occurred_on`). O relógio é falso e o
 * fuso é America/Sao_Paulo; um caso troca o fuso no meio.
 *
 * Cada caso afirma, nas duas entradas e iguais entre si: a data gravada ou
 * nenhuma gravação; o recibo ou o título da revisão (com a referência que a
 * revisão recebe); a descrição sem a expressão de data; o valor.
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const desfechoReal = require('./desfecho-voz-real.cjs');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };
const ler = (arquivo) => fs.readFileSync(path.join(root, arquivo), 'utf8');

/* ── Relógio falso ──────────────────────────────────────────────────────── */
let AGORA = new Date(2026, 8, 30, 12, 0).getTime();
const RealDate = Date;
class DataFalsa extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(AGORA); }
  static now() { return AGORA; }
}

/* ── Dublês ─────────────────────────────────────────────────────────────── */
const armazem = new Map();
const AsyncStorage = {
  getItem: async (k) => (armazem.has(k) ? armazem.get(k) : null),
  setItem: async (k, v) => { armazem.set(k, v); },
  removeItem: async (k) => { armazem.delete(k); },
  getAllKeys: async () => [...armazem.keys()],
  multiGet: async (ks) => ks.map((k) => [k, armazem.get(k) ?? null]),
};
const fsDuble = {
  documentDirectory: 'file:///files/',
  makeDirectoryAsync: async () => {},
  copyAsync: async () => {},
  deleteAsync: async () => {},
  getInfoAsync: async () => ({ exists: false }),
  readDirectoryAsync: async () => [],
};
let cartoes = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'pessoal', closing_day: 10 }];
const gravacoes = [];
let falharNaRede = false;
const voiceOperations = {
  desfechoDaOperacaoVoz: desfechoReal,
  desfechoDoErroVoz: desfechoReal.desfechoDoErroVoz,
  registrarOperacaoVoz: async (requestId, source, payload) => {
    gravacoes.push({ requestId, source, payload });
    if (falharNaRede) throw Object.assign(new Error('Network request failed'), { rede: true });
    return { status: 'committed', operationId: requestId, kind: payload.kind, ids: ['tx-' + requestId], replayed: false };
  },
  ehOperacaoJaRegistrada: () => false,
  ehRecusaCartaoObrigatorio: () => false,
};

const cache = new Map();
function carregar(arquivo) {
  arquivo = path.normalize(arquivo);
  if (cache.has(arquivo)) return cache.get(arquivo);
  const exports = {};
  cache.set(arquivo, exports);
  const dubles = {
    'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask() {} } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    'expo-file-system/legacy': fsDuble,
    '@/modules/grana-voice-widget': { definirEstado() {} },
    './offline-cache': { isLikelyNetworkError: (e) => e?.rede === true },
    './widget-voz-notificacoes': {},
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1', lerSessaoDoDisco: async () => ({}) },
    './voz': {
      transcreverAudio: async () => assert.fail('a transcrição vem pronta no payload'),
      mensagemDeErroVoz: (codigo) => ({ titulo: 'Erro ' + codigo, texto: 'Texto ' + codigo }),
    },
    './data': { fetchCategories: async () => [], fetchCreditCards: async () => cartoes },
    './wallets': { fetchWallets: async () => [{ id: 'pessoal', name: 'Pessoal', is_default: true }] },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './voice-operations': voiceOperations,
    './supabase': { supabase: {} },
    './widgets-home-sync': { sincronizarWidgetsHome: async () => {} },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  };
  const js = ts.transpileModule(ler(arquivo), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    console: { ...console, log() {}, warn() {}, error: (...a) => process.env.DEBUG && console.error(...a) },
    Promise, JSON, Object, Array, String, Number, Error, TypeError, RegExp, Set, Map, Math, Date: DataFalsa, Intl,
    setTimeout, clearTimeout, AbortController,
    require(id) {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) return carregar(path.join(path.dirname(arquivo), id.slice(2) + '.ts'));
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}
/* Prova vermelha: `PROVA_TAREFA=<arquivo em lib/>` roda os mesmos casos
   contra outra versão da tarefa (a do HEAD anterior), e as falhas são
   listadas no fim em vez de parar no primeiro caso. */
const PROVA_VERMELHA = !!process.env.PROVA_TAREFA;
const falhasDaProva = [];
const tarefa = carregar(process.env.PROVA_TAREFA || 'lib/widget-voz-task.ts');
const fila = carregar('lib/widget-voz-pendentes.ts');
const { dataLocal } = require('./data-da-fala-real.cjs');

function novoRecibo() {
  const publicados = [];
  return {
    publicados,
    recibo: {
      podeNotificar: async () => true,
      notificarRevisao: async (titulo, _t, ref) => { publicados.push({ revisao: titulo, ref }); },
      notificarSucesso: async (dados) => { publicados.push({ sucesso: dados.texto, titulo: dados.titulo }); },
      notificarFalha: async (codigo) => { publicados.push({ falha: codigo }); },
      notificarSalvoLocal: async () => { publicados.push({ salvoLocal: true }); },
      notificarPendenteOffline: async () => { publicados.push({ pendente: true }); },
    },
  };
}

let seq = 0;
/** A mesma fala, com a mesma captura, nas duas entradas. */
async function falar(fala, { captura = AGORA, extra = {} } = {}) {
  const r = {};
  for (const source of ['app', 'widget']) {
    const requestId = `req-${++seq}`;
    const antes = gravacoes.length;
    const { publicados, recibo } = novoRecibo();
    await tarefa.executarTarefa({
      caminho: `file:///cache/${requestId}.m4a`, requestId, source, transcricao: fala,
      capturadoEm: captura, dataCaptura: dataLocal(captura), ...extra,
    }, recibo);
    r[source] = { gravacoes: gravacoes.slice(antes).map((g) => g.payload), publicados };
  }
  assert.deepEqual(JSON.parse(JSON.stringify(r.app.gravacoes)), JSON.parse(JSON.stringify(r.widget.gravacoes)), `"${fala}": app e widget gravam o mesmo`);
  assert.deepEqual(JSON.parse(JSON.stringify(r.app.publicados)), JSON.parse(JSON.stringify(r.widget.publicados)), `"${fala}": app e widget dão o mesmo recibo`);
  return r.app;
}
function suave(fn, nome) {
  if (!PROVA_VERMELHA) return fn();
  try { fn(); } catch (e) { falhasDaProva.push(`${nome}: ${e.message.split('\n')[0]}`); }
}
function gravou(r, esperado, nome) { suave(() => gravouEstrito(r, esperado, nome), nome); }
function gravouEstrito(r, { data, descricao, valor, recibo }, nome) {
  assert.equal(r.gravacoes.length, 1, `${nome}: uma gravação`);
  const p = r.gravacoes[0];
  assert.equal(p.occurred_on, data, `${nome}: occurred_on`);
  if (descricao) assert.equal(p.description, descricao, `${nome}: descrição sem a data`);
  if (valor !== undefined) assert.equal(p.amount, valor, `${nome}: valor não contaminado`);
  if (recibo !== undefined) assert.equal(r.publicados[0]?.sucesso, recibo, `${nome}: recibo`);
}
function revisou(r, titulo, nome, ref) { suave(() => revisouEstrito(r, titulo, nome, ref), nome); }
function revisouEstrito(r, titulo, nome, ref) {
  assert.equal(r.gravacoes.length, 0, `${nome}: nada gravado`);
  assert.equal(r.publicados[0]?.revisao, titulo, `${nome}: revisão "${titulo}"`);
  if (ref) assert.deepEqual(JSON.parse(JSON.stringify(r.publicados[0]?.ref ?? null)), ref, `${nome}: a revisão recebe a referência da captura`);
}
/** Nos casos, a mesma asserção; na prova vermelha, anota e segue. */
const checar = {
  equal: (...a) => suave(() => assert.equal(...a), String(a[2] ?? 'equal')),
  deepEqual: (...a) => suave(() => assert.deepEqual(...a), String(a[2] ?? 'deepEqual')),
};
const em = (d, h = 12, m = 0) => new Date(2026, 8, d, h, m).getTime(); // setembro

(async () => {
  /* ── Casos da spec, pela tarefa, app = widget ──────────────────────────── */
  AGORA = em(30);
  gravou(await falar('mercado 30 reais'), { data: '2026-09-30', descricao: 'Mercado', valor: 30, recibo: 'Alimentação' }, '1');
  ok('1: sem data, hoje, recibo sem data');
  gravou(await falar('mercado 30 reais hoje'), { data: '2026-09-30', descricao: 'Mercado', valor: 30 }, '2');
  ok('2: "hoje" sai do nome');
  gravou(await falar('almoço ontem 25 reais no pix'), { data: '2026-09-29', descricao: 'Almoço', valor: 25, recibo: 'Alimentação · Pix · em 29/09' }, '3');
  ok('3: "ontem" é 29/09, recibo "em 29/09"');
  gravou(await falar('uber anteontem 18 reais'), { data: '2026-09-28', valor: 18 }, '4');
  ok('4: "anteontem" é 28/09');

  /* 5: dito em 01/10, "ontem" é 30/09: fica em setembro, e o Saldo atual de
     outubro não muda (calcularSaldoAtual REAL, regra 20). */
  AGORA = new Date(2026, 9, 1, 12).getTime();
  const r5 = await falar('almoço ontem 25 reais no pix');
  gravou(r5, { data: '2026-09-30', valor: 25, recibo: 'Alimentação · Pix · fica em setembro'.replace('fica', 'em 30/09, fica') }, '5');
  {
    const saldo = {};
    vm.runInNewContext(ts.transpileModule(ler('lib/safe-to-spend.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports: saldo, Date: RealDate, Math, Number, String, Object, Array, require: (id) => (id === './transaction-rules' ? carregar('lib/transaction-rules.ts') : {}) });
    const base = [{ id: 'e', type: 'in', amount: 1000, occurred_on: '2026-10-01', payment_method: 'pix', category: 'Salário' }];
    const hoje = new RealDate(2026, 9, 1, 12);
    const comAFala = [...base, { id: 'v', type: 'out', ...r5.gravacoes[0] }];
    checar.equal(saldo.calcularSaldoAtual(comAFala, hoje), saldo.calcularSaldoAtual(base, hoje), 'o saldo de outubro não muda');
  }
  ok('5: dito em 01/10, "ontem" é 30/09, "fica em setembro", e o Saldo atual de outubro não muda');

  AGORA = em(30);
  gravou(await falar('padaria na sexta 12 reais'), { data: '2026-09-25', valor: 12 }, '6');
  gravou(await falar('padaria sexta 12 reais'), { data: '2026-09-30', valor: 12 }, '6b');
  AGORA = em(25);
  gravou(await falar('padaria na sexta 12 reais'), { data: '2026-09-25', valor: 12, recibo: 'Alimentação' }, '7');
  gravou(await falar('padaria sexta passada 12 reais'), { data: '2026-09-18', valor: 12 }, '8');
  gravou(await falar('padaria na última sexta 12 reais'), { data: '2026-09-18', valor: 12 }, '32');
  ok('6, 6b, 7, 8 e 32: dia da semana (com preposição, sem, passada, última)');

  AGORA = em(30);
  gravou(await falar('farmácia dia 12 40 reais'), { data: '2026-09-12', descricao: 'Farmácia', valor: 40 }, '9');
  AGORA = new Date(2026, 9, 5, 12).getTime();
  revisou(await falar('farmácia dia 12 40 reais'), 'Confirme a data', '10', { referencia: '2026-10-05', aproximada: false });
  AGORA = em(30);
  gravou(await falar('mercado 12/09 50 reais'), { data: '2026-09-12', valor: 50 }, '11');
  gravou(await falar('mercado 12 de setembro 50 reais'), { data: '2026-09-12', valor: 50 }, '12');
  gravou(await falar('mercado dia 12 50 reais'), { data: '2026-09-12', valor: 50 }, '13a');
  gravou(await falar('mercado dia doze 50 reais'), { data: '2026-09-12', valor: 50 }, '13b');
  revisou(await falar('mercado dia 12,50 reais'), 'Qual foi a data?', '13c (a normalização do servidor junta "dia doze cinquenta" em "dia 12,50")');
  ok('9 a 13c: "dia N", "12/09", "12 de setembro", extenso; mês anterior e número colado revisam');

  revisou(await falar('cinema amanhã 40 reais'), 'Confirme a data', '14');
  revisou(await falar('mercado 15/10 30 reais'), 'Confirme a data', '15');
  revisou(await falar('mercado dia 30 de fevereiro 20 reais'), 'Qual foi a data?', '16');
  revisou(await falar('mercado 10/07 20 reais'), 'Qual foi a data?', '17');
  revisou(await falar('mercado semana passada 20 reais'), 'Qual foi a data?', '18');
  revisou(await falar('ontem, dia 12, mercado 20 reais'), 'Qual foi a data?', '19');
  ok('14 a 19: futura, impossível, fora da janela, vaga e em conflito revisam, sem gravar');

  const r20 = await falar('netflix 40 reais todo mês dia 10');
  gravou(r20, { data: '2026-09-30', valor: 40 }, '20');
  checar.equal(r20.gravacoes[0]?.recurring, true, '20: recorrente, e "dia 10" não é a data do gasto');
  /* "todo dia 10" sozinho: a data também não é lida. Que isso não vire
     recorrência é o `parseRecorrencia` de sempre (função espelhada no
     servidor, fora desta feature). */
  gravou(await falar('netflix 40 reais todo dia 10'), { data: '2026-09-30', valor: 40 }, '20c');
  revisou(await falar('netflix 40 reais todo mês ontem'), 'Confirme a data', '20b: recorrente com data diferente da fala');
  const r21 = await falar('boleto de luz 120 reais vence dia 10');
  checar.equal(r21.gravacoes[0]?.kind, 'bill', '21: conta');
  checar.equal(r21.gravacoes[0]?.due_date, '2026-10-10', '21: vencimento pelo caminho de sempre');
  checar.equal(r21.gravacoes[0]?.occurred_on, undefined, '21: sem data do gasto');
  ok('20, 20b e 21: recorrência não é data; recorrente com data revisa; conta segue o vencimento');

  revisou(await falar('mercado 300 reais em 12x no crédito C6 ontem'), 'Confirme a data', '22');
  cartoes = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'pessoal', closing_day: 30 }];
  revisou(await falar('almoço 30 reais no crédito ontem'), 'Confirme a data da compra', '23 (fechamento no dia 30: ontem caiu em outra fatura)');
  cartoes = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'pessoal', closing_day: 10 }];
  const r24 = await falar('almoço 30 reais no crédito ontem');
  gravou(r24, { data: '2026-09-29', valor: 30, recibo: 'Crédito · C6 · Alimentação · em 29/09, fatura de outubro' }, '24');
  checar.equal(r24.gravacoes[0]?.payment_method, 'credit');
  ok('22, 23 e 24: parcelado com data diferente revisa; outra fatura revisa; mesma fatura grava, e o recibo fala da fatura, nunca de saldo');

  gravou(await falar('Sexta Feira Bar 50 reais'), { data: '2026-09-30', valor: 50 }, '25');
  ok('25: nome de loja com dia da semana não é data');

  /* Crédito e Pix na MESMA data do mês anterior: recibos diferentes (F2). */
  AGORA = new Date(2026, 9, 1, 12).getTime();
  const pix = await falar('almoço ontem 30 reais no pix');
  const credito = await falar('almoço ontem 30 reais no crédito');
  checar.equal(pix.publicados[0]?.sucesso, 'Alimentação · Pix · em 30/09, fica em setembro');
  checar.equal(credito.publicados[0]?.sucesso, 'Crédito · C6 · Alimentação · em 30/09, fatura de outubro');
  ok('F2: Pix e crédito na mesma data do mês anterior: "fica em setembro" só no caixa; o crédito diz a fatura');

  /* ── 26: captura às 23h50 de 30/09, sem rede; processada em 01/10 ────── */
  for (const source of ['app', 'widget']) {
    armazem.clear();
    AGORA = em(30, 23, 50);
    const captura = AGORA;
    const requestId = `req-26-${source}`;
    falharNaRede = true;
    const antes = gravacoes.length;
    const { recibo } = novoRecibo();
    await tarefa.executarTarefa({ caminho: `file:///cache/${requestId}.m4a`, requestId, source, transcricao: 'almoço ontem 30 reais',
      capturadoEm: captura, dataCaptura: dataLocal(captura) }, recibo);
    const primeira = gravacoes[antes]?.payload;
    falharNaRede = false;
    const guardada = (await fila.listarVozesPendentes()).find((i) => i.requestId === requestId);
    checar.equal(guardada?.dataCaptura, '2026-09-30', `${source}: a fila guarda a data da captura`);
    checar.equal(guardada?.criadoEm, captura, `${source}: e o instante da captura, não o da falha`);

    /* 27: a nova tentativa, depois da meia-noite, manda o MESMO payload. */
    AGORA = new Date(2026, 9, 1, 8).getTime();
    const depois = gravacoes.length;
    await tarefa.executarTarefa(guardada, novoRecibo().recibo);
    const segunda = gravacoes[depois]?.payload;
    checar.equal(segunda?.occurred_on, '2026-09-29', `${source}: "ontem" é 29/09, contado da captura`);
    checar.deepEqual(JSON.parse(JSON.stringify(segunda)), JSON.parse(JSON.stringify(primeira)), `${source}: payload idêntico nas duas tentativas (sem 22023)`);
    checar.equal(gravacoes[depois]?.requestId, requestId, `${source}: mesmo requestId`);
  }
  ok('26 e 27: fala guardada às 23h50 e processada no dia seguinte grava 29/09, com o mesmo payload, nas duas entradas');

  /* "Tentar de novo" (tirarVozDaRevisao) preserva a captura. */
  armazem.clear();
  await fila.adicionarVozPendente({ caminho: 'file:///cache/x.m4a', requestId: 'req-rev', userId: 'u-1', source: 'widget', criadoEm: em(27), dataCaptura: '2026-09-27' });
  await fila.marcarVozEmRevisao('req-rev', 'almoço ontem 30');
  await fila.tirarVozDaRevisao('req-rev');
  const devolvida = (await fila.listarVozesPendentes()).find((i) => i.requestId === 'req-rev');
  checar.equal(devolvida?.dataCaptura, '2026-09-27');
  checar.equal(devolvida?.criadoEm, em(27));
  ok('"Tentar de novo" preserva a data e o instante da captura');

  /* Fala antiga na fila, sem dataCaptura: referência aproximada. Relativa
     revisa (com a referência marcada), absoluta e sem data seguem. */
  AGORA = em(30);
  const antiga = { criadoEm: em(28, 23, 59) };
  revisou(await falar('almoço ontem 30 reais', { extra: { capturadoEm: undefined, dataCaptura: undefined, ...antiga } }),
    'Confirme a data', 'fila antiga: "ontem"', { referencia: '2026-09-28', aproximada: true });
  gravou(await falar('mercado 12/09 50 reais', { extra: { capturadoEm: undefined, dataCaptura: undefined, ...antiga } }), { data: '2026-09-12', valor: 50 }, 'fila antiga: 12/09');
  /* r2 do Forge: "hoje" também depende da referência. Aproximada: revisa,
     sem gravar; exata (caso 2): grava. */
  revisou(await falar('mercado 50 reais hoje', { extra: { capturadoEm: undefined, dataCaptura: undefined, ...antiga } }),
    'Confirme a data', 'fila antiga: "hoje"', { referencia: '2026-09-28', aproximada: true });
  gravou(await falar('mercado 50 reais', { extra: { capturadoEm: undefined, dataCaptura: undefined, ...antiga } }), { data: '2026-09-28', valor: 50 }, 'fila antiga: sem data dita');
  ok('fila antiga (sem data da captura): relativa, inclusive "hoje", revisa com a referência aproximada; absoluta e sem data gravam');

  /* Fuso trocado entre a captura e o processamento: a data civil da captura
     vale como está, sem reconverter o instante. */
  AGORA = em(30, 22, 0); // 22h em São Paulo = 01/10 no fuso de Tóquio
  const captura = AGORA;
  process.env.TZ = 'Asia/Tokyo';
  const trocado = await falar('almoço ontem 30 reais', { extra: { capturadoEm: captura, dataCaptura: '2026-09-30' } });
  process.env.TZ = 'America/Sao_Paulo';
  gravou(trocado, { data: '2026-09-29', valor: 30 }, 'fuso trocado');
  ok('fuso trocado entre a captura e o processamento: "ontem" continua 29/09');

  /* ── Fonte: nenhum hojeISO() nos payloads ──────────────────────────────── */
  {
    const fonte = ler('lib/widget-voz-task.ts');
    assert.equal((fonte.match(/occurred_on: hojeISO\(\)/g) ?? []).length, 0, 'nenhum occurred_on com hojeISO()');
    assert.equal((fonte.match(/occurred_on: dataDoGasto/g) ?? []).length, 3, 'os 3 payloads usam a data resolvida');
  }
  ok('fonte: os 3 payloads da tarefa usam a data resolvida, nenhum hojeISO()');

  if (PROVA_VERMELHA && falhasDaProva.length) throw new Error('prova vermelha');
  console.log(`\n${checagens} checagens de data na voz (tarefa real, app e widget) passaram — 0 falhas`);
})().catch((e) => {
  if (PROVA_VERMELHA) {
    console.log(`PROVA VERMELHA (${process.env.PROVA_TAREFA}): ${falhasDaProva.length} casos falharam antes de parar`);
    for (const f of falhasDaProva) console.log('  FALHA  ' + f);
    if (e.message !== 'prova vermelha') console.log('  PAROU  ' + e.message.split('\n')[0]);
  } else console.error(e);
  process.exit(1);
});
