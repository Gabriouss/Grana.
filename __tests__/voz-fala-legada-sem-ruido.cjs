/*
 * V09 (auditoria de 03/10/2026): fala guardada com transcricao "." (ruido,
 * guardada antes do filtro de 07fb951) reabria "Nao entendi a fala guardada"
 * com um "Ouvi" sem sentido. O recibo agora sai de UM ponto do catalogo
 * (`reciboDaFalaGuardada`), usado pelo "Revisar" (reabrirRevisoesDeFala) e pelo
 * widget ao guardar a fala (regra 13). Modulos REAIS; duplês: disco, storage e rede.
 *
 *   node __tests__/voz-fala-legada-sem-ruido.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };

/* ── Dublês ─────────────────────────────────────────────────────────────── */
const armazem = new Map();
/** Chaves cuja escrita falha (disco cheio, simulado). */
const escritaFalha = new Set();
const AsyncStorage = {
  getItem: async (k) => (armazem.has(k) ? armazem.get(k) : null),
  setItem: async (k, v) => {
    if (escritaFalha.has(k)) throw new Error('disco cheio (simulado): ' + k);
    armazem.set(k, v);
  },
  removeItem: async (k) => { armazem.delete(k); },
  getAllKeys: async () => [...armazem.keys()],
  multiGet: async (ks) => ks.map((k) => [k, armazem.get(k) ?? null]),
};
const disco = new Map();
let exclusaoFalha = false;
const fsDuble = {
  documentDirectory: 'file:///files/',
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }) => { disco.set(to, disco.get(from)); },
  deleteAsync: async (uri) => {
    if (exclusaoFalha) throw new Error('exclusão falhou (simulado): ' + uri);
    disco.delete(uri);
  },
  getInfoAsync: async () => ({ exists: false }),
  readDirectoryAsync: async () => [],
};

/* O banco: uma operação por request_id (idempotência do servidor) e as
   linhas de lançamento que cada operação nova cria. */
const operacoes = new Map();
/** Operações desfeitas pelo "Desfazer" (tombstone `undone` do servidor). */
const desfeitas = new Set();
const linhas = [];
let modoBanco = 'online';
/** Toda chamada que chegou ao banco, para afirmar QUAIS aconteceram (regra 9). */
const chamadasRpc = [];
function rpc(nome, args) {
  const executar = async () => {
    assert.equal(nome, 'registrar_operacao_voz');
    chamadasRpc.push({ requestId: args.p_request_id, source: args.p_source, amount: args.p_payload?.amount });
    if (modoBanco === 'offline') throw Object.assign(new TypeError('Network request failed'), { code: '' });
    if (modoBanco === 'recusa') return { data: null, error: { code: '23514', message: 'recusado (simulado)' } };
    const hash = JSON.stringify([args.p_kind, args.p_payload]);
    if (!operacoes.has(args.p_request_id)) {
      const id = 'tx-' + args.p_request_id;
      linhas.push({ id, request_id: args.p_request_id, source: args.p_source, kind: args.p_kind, ...args.p_payload });
      operacoes.set(args.p_request_id, { ids: [id], hash });
      return { data: { status: 'committed', operation_id: args.p_request_id, ids: [id], replayed: false }, error: null };
    }
    /* Mesmo request_id com outro conteúdo: a RPC real levanta 22023
       (supabase/migrations/20260923230300_voz_credito_exige_cartao.sql). */
    if (operacoes.get(args.p_request_id).hash !== hash) {
      return { data: null, error: { code: '22023', message: 'request_id ja pertence a outra operacao' } };
    }
    if (desfeitas.has(args.p_request_id)) return { data: { status: 'undone', operation_id: args.p_request_id, ids: [], replayed: true }, error: null };
    return { data: { status: 'committed', operation_id: args.p_request_id, ids: operacoes.get(args.p_request_id).ids, replayed: true }, error: null };
  };
  return { abortSignal: () => executar() };
}

const transcricoes = {};
/** Um cartão na carteira da fala: crédito à vista e parcelado gravam nele. */
const cartoes = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'pessoal' }];
const cache = new Map();
/** O que os módulos escreveram com `console.warn` (regra 9: erro virando desfecho deixa rastro). */
const avisosNoLog = [];
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
    './offline-cache': { isLikelyNetworkError: (e) => /network/i.test(String(e?.message ?? e)) },
    './widget-voz-notificacoes': {
      podeNotificar: async () => false,
      notificarRevisao: async () => assert.fail('sem permissão, nada de notificação'),
      notificarSucesso: async () => assert.fail('sem permissão, nada de notificação'),
      notificarFalha: async () => assert.fail('sem permissão, nada de notificação'),
      notificarSalvoLocal: async () => assert.fail('sem permissão, nada de notificação'),
      notificarPendenteOffline: async () => assert.fail('sem permissão, nada de notificação'),
    },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1', lerSessaoDoDisco: async () => ({}) },
    './voz': {
      transcreverAudio: async (uri) => {
        const r = transcricoes[uri];
        assert.ok(r, 'transcrição não preparada para ' + uri);
        return r;
      },
      mensagemDeErroVoz: (codigo) => ({ titulo: 'Erro ' + codigo, texto: 'Texto ' + codigo }),
    },
    './data': { fetchCategories: async () => [], fetchCreditCards: async () => cartoes },
    './wallets': { fetchWallets: async () => [{ id: 'pessoal', name: 'Pessoal', is_default: true }] },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './supabase': { supabase: { rpc, auth: { getUser: async () => ({ data: { user: null } }) } } },
    './widgets-home-sync': { sincronizarWidgetsHome: async () => {} },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    console: { ...console, log() {}, warn: (...a) => { avisosNoLog.push(a.map(String).join(' ')); if (process.env.DEBUG) console.warn(...a); }, error: (...a) => process.env.DEBUG && console.error(...a) },
    Promise, JSON, Object, Array, String, Number, Error, TypeError, RegExp, Set, Map, Math, Date, setTimeout, clearTimeout, AbortController,
    require(id) {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) return carregar(path.join(path.dirname(arquivo), id.slice(2) + '.ts'));
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

let tarefa, fila, recibos, registrarOperacaoVoz;
/** Abre o app de novo: módulos novos (memória zerada), mesmo disco e mesmo
    AsyncStorage. É o que separa "na mesma execução" de "entre execuções". */
function abrirApp() {
  cache.clear();
  tarefa = carregar('lib/widget-voz-task.ts');
  fila = carregar('lib/widget-voz-pendentes.ts');
  recibos = carregar('lib/voz-recibos-da-fila.ts');
  ({ registrarOperacaoVoz } = carregar('lib/voice-operations.ts'));
}
abrirApp();


const abrirRecibo = async (id) => (await recibos.listarRecibosDaFila('u-1')).find((r) => r.id === id);
async function guardarEmRevisao(requestId, transcricao) {
  const origem = `file:///cache/${requestId}.m4a`;
  disco.set(origem, 'AUDIO');
  await fila.adicionarVozPendente({ caminho: origem, requestId, userId: 'u-1', source: 'widget' });
  await fila.marcarVozEmRevisao(requestId, transcricao);
}

(async () => {
  /* Revisar (app e widget usam a mesma faixa): ruido legado nao vira texto. */
  await guardarEmRevisao('req-ponto', '.');
  await guardarEmRevisao('req-frase', 'Acompanhe o processo de produção de um produto de qualidade');
  await guardarEmRevisao('req-roupa', 'roupa');
  await guardarEmRevisao('req-manicure', 'manicure');
  await guardarEmRevisao('req-reticencias', '...');
  await guardarEmRevisao('req-vazio', '');
  await guardarEmRevisao('req-util', 'mercado');
  await guardarEmRevisao('req-valor', 'Mercado R$ 120 no débito.');
  assert.equal(await fila.reabrirRevisoesDeFala('u-1'), 8, 'as oito falas reabrem (nada e descartado)');
  for (const id of ['req-ponto', 'req-reticencias', 'req-vazio']) {
    const r = await abrirRecibo(id);
    assert.ok(r, id + ' tem recibo (nada some em silencio)');
    assert.equal(r.transcricao, undefined, id + ' sem transcricao de ruido');
    assert.ok(!/Ouvi:/.test(r.texto), id + ' sem "Ouvi:"');
    assert.equal(r.titulo, 'Não entendi a fala guardada');
  }
  ok('Revisar: "." , "..." e vazio reabrem sem transcricao nem "Ouvi"');
  const util = await abrirRecibo('req-util');
  assert.equal(util.transcricao, 'mercado');
  assert.ok(/Ouvi: "mercado"/.test(util.texto), 'texto com cara de lancamento incompleto continua aparecendo');
  assert.equal((await abrirRecibo('req-valor')).transcricao, 'Mercado R$ 120 no débito.');
  for (const t of ['roupa', 'manicure']) {
    const r = await abrirRecibo('req-' + t);
    assert.equal(r.transcricao, t, t + ' (descricao legitima sem valor) segue aparecendo');
    assert.ok(r.texto.includes('Ouvi: "' + t + '"'));
  }
  assert.equal((await abrirRecibo('req-frase')).transcricao, 'Acompanhe o processo de produção de um produto de qualidade', 'texto legado com letras nao e apagado pelo Revisar');
  ok('Revisar: fala com sentido, inclusive "roupa" e "manicure", mantem a transcricao');

  /* Widget ao guardar: mesma saida para o mesmo texto. */
  const helper = carregar('lib/voz-recibos.ts').reciboDaFalaGuardada;
  const ids = { '.': 'req-ponto', '...': 'req-reticencias', '': 'req-vazio', mercado: 'req-util', roupa: 'req-roupa', manicure: 'req-manicure', 'Mercado R$ 120 no débito.': 'req-valor', 'Acompanhe o processo de produção de um produto de qualidade': 'req-frase' };
  for (const t of Object.keys(ids)) {
    const viaRevisar = await abrirRecibo(ids[t]);
    const viaWidget = helper(t);
    assert.equal(viaRevisar.texto, viaWidget.texto, 'texto igual nas duas entradas para: ' + JSON.stringify(t));
    assert.equal(viaRevisar.transcricao, viaWidget.transcricao, 'transcricao igual nas duas entradas');
  }
  ok('paridade: o recibo do widget e o do Revisar sao identicos para a mesma fala');

  /* Caminho real da tarefa: o MESMO "." e o MESMO "roupa", origem app e widget. */
  for (const source of ['app', 'widget']) {
    /* "roupa" sem valor ja era barrada na origem (`processar`) nas duas entradas: o recibo sai sem "Ouvi", igual para app e widget. */
    for (const fala of ['.', 'roupa']) {
      const requestId = `req-task-${source}-${fala === '.' ? 'ponto' : fala}`;
      const origem = 'file:///cache/' + requestId + '.m4a';
      disco.set(origem, 'AUDIO');
      await fila.adicionarVozPendente({ caminho: origem, requestId, userId: 'u-1', source });
      transcricoes['file:///files/voz-pendente/' + requestId + '.m4a'] = { ok: true, transcript: fala };
      await tarefa.tentarVozesPendentes();
      const r = await abrirRecibo(requestId);
      assert.ok(r, `${source}/${fala}: a tarefa deixa recibo`);
      assert.equal(r.transcricao, undefined, `${source}/${fala}: transcricao do recibo`);
      assert.ok((await fila.listarVozesPendentes()).some((i) => i.requestId === requestId && i.revisao), `${source}/${fala}: fica na fila, em revisao`);
    }
  }
  ok('tarefa (app e widget): "." e "roupa" dao o mesmo recibo e a mesma revisao guardada');

  console.log(`
${checagens} checagens, 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });
