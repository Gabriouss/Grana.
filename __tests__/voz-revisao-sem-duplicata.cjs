/*
 * Fala guardada salva pela revisão não grava de novo no "Tentar de novo"
 * (achado ALTO do Watchtower, 27/09/2026, confirmado pelo maestro).
 *
 *   node __tests__/voz-revisao-sem-duplicata.cjs
 *
 * O aviso de fala guardada que o reconhecimento não entendeu oferece
 * "Revisar", "Tentar de novo" e "Descartar". O "Revisar" abria a revisão só
 * com a transcrição, sem dizer de qual fala ela vinha, e a fala continuava na
 * fila com `revisao: true`. Salvar pela revisão e depois tocar em "Tentar de
 * novo" (o aviso volta pela faixa do topo) gravava o mesmo gasto duas vezes.
 *
 * Correção no núcleo: `registrarOperacaoVoz(..., falaGuardada)` tira a fala
 * da fila, com o áudio e o aviso, só DEPOIS de o lançamento estar gravado ou
 * guardado na fila de operações. As três revisões (Início, Contas, Crédito)
 * passam por ali, e a fila é a mesma para a fala do botão do app e do widget.
 *
 * Módulos REAIS: `lib/voice-operations.ts`, `lib/widget-voz-pendentes.ts`,
 * `lib/voz-recibos-da-fila.ts`, `lib/widget-voz-task.ts`, o catálogo de
 * recibos, as heurísticas e a trava de valor. Dublês: disco, AsyncStorage,
 * transcrição e o banco, que aqui é a RPC `registrar_operacao_voz` com a
 * idempotência por `request_id` do servidor. Afirma QUANTAS linhas o banco
 * recebeu (regra 9), nas duas entradas (regra 13).
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
const AsyncStorage = {
  getItem: async (k) => (armazem.has(k) ? armazem.get(k) : null),
  setItem: async (k, v) => { armazem.set(k, v); },
  removeItem: async (k) => { armazem.delete(k); },
  getAllKeys: async () => [...armazem.keys()],
  multiGet: async (ks) => ks.map((k) => [k, armazem.get(k) ?? null]),
};
const disco = new Map();
const fsDuble = {
  documentDirectory: 'file:///files/',
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }) => { disco.set(to, disco.get(from)); },
  deleteAsync: async (uri) => { disco.delete(uri); },
  getInfoAsync: async () => ({ exists: false }),
  readDirectoryAsync: async () => [],
};

/* O banco: uma operação por request_id (idempotência do servidor) e as
   linhas de lançamento que cada operação nova cria. */
const operacoes = new Map();
const linhas = [];
let modoBanco = 'online';
function rpc(nome, args) {
  const executar = async () => {
    assert.equal(nome, 'registrar_operacao_voz');
    if (modoBanco === 'offline') throw Object.assign(new TypeError('Network request failed'), { code: '' });
    if (modoBanco === 'recusa') return { data: null, error: { code: '23514', message: 'recusado (simulado)' } };
    if (!operacoes.has(args.p_request_id)) {
      const id = 'tx-' + args.p_request_id;
      linhas.push({ id, request_id: args.p_request_id, source: args.p_source, ...args.p_payload });
      operacoes.set(args.p_request_id, { ids: [id] });
      return { data: { status: 'committed', operation_id: args.p_request_id, ids: [id], replayed: false }, error: null };
    }
    return { data: { status: 'committed', operation_id: args.p_request_id, ids: operacoes.get(args.p_request_id).ids, replayed: true }, error: null };
  };
  return { abortSignal: () => executar() };
}

const transcricoes = {};
const cache = new Map();
function carregar(arquivo) {
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
    './data': { fetchCategories: async () => [], fetchCreditCards: async () => [] },
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
    console: { ...console, log() {}, warn: (...a) => process.env.DEBUG && console.warn(...a), error: (...a) => process.env.DEBUG && console.error(...a) },
    Promise, JSON, Object, Array, String, Number, Error, TypeError, RegExp, Set, Map, Math, Date, setTimeout, clearTimeout, AbortController,
    require(id) {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) return carregar(path.join(path.dirname(arquivo), id.slice(2) + '.ts'));
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

const tarefa = carregar('lib/widget-voz-task.ts');
const fila = carregar('lib/widget-voz-pendentes.ts');
const recibos = carregar('lib/voz-recibos-da-fila.ts');
const { registrarOperacaoVoz } = carregar('lib/voice-operations.ts');

const FALA = 'Mercado R$ 120 no débito.';
const payloadDaRevisao = {
  kind: 'transaction', type: 'out', description: 'Mercado', amount: 120, category: 'Alimentação',
  color: '#fff', occurred_on: '2026-09-27', payment_method: 'debit', wallet_id: 'pessoal',
};

/** Uma fala guardada que o reconhecimento não entendeu: na fila, em revisão,
    com o áudio no disco e o aviso "audio" na tela. */
async function falaEmRevisao(requestId, source) {
  const origem = `file:///cache/${requestId}.m4a`;
  disco.set(origem, 'AUDIO');
  await fila.adicionarVozPendente({ caminho: origem, requestId, userId: 'u-1', source });
  await fila.marcarVozEmRevisao(requestId, FALA);
  await recibos.guardarReciboDaFila({ id: requestId, dono: 'u-1', tipo: 'audio', titulo: 'Não entendi a fala guardada', texto: 'x', transcricao: FALA });
  const audio = `file:///files/voz-pendente/${requestId}.m4a`;
  transcricoes[audio] = { ok: true, transcript: FALA };
  return audio;
}
const naFila = async () => (await fila.listarVozesPendentes()).map((i) => i.requestId);
/** O "Tentar de novo" do aviso, como em components/RespostaVozWidget.tsx. */
async function tentarDeNovo(requestId) {
  await fila.tirarVozDaRevisao(requestId);
  await tarefa.tentarVozesPendentes();
}

(async () => {
  /* ── 0. Controle: o defeito, como era (revisão sem dizer a fala) ─────── */
  {
    await falaEmRevisao('req-controle', 'widget');
    await registrarOperacaoVoz('rev-controle', 'app', payloadDaRevisao);
    await tentarDeNovo('req-controle');
    assert.equal(linhas.filter((l) => l.request_id === 'rev-controle' || l.request_id === 'req-controle').length, 2,
      'controle: sem a fala guardada, revisão + "Tentar de novo" gravam duas vezes (o achado)');
    ok('controle: sem ligar a revisão à fala, o gasto é gravado duas vezes');
  }

  /* ── 1. Revisão salva e "Tentar de novo": uma linha só, nas duas entradas ── */
  const porEntrada = {};
  for (const source of ['app', 'widget']) {
    const requestId = `req-${source}`;
    const audio = await falaEmRevisao(requestId, source);
    const antes = linhas.length;
    const r = await registrarOperacaoVoz(`rev-${source}`, 'app', payloadDaRevisao, undefined, requestId);
    assert.equal(r.status, 'committed');
    assert.deepEqual(await naFila(), [], `${source}: depois de salvar, a fala saiu da fila`);
    assert.equal(disco.has(audio), false, `${source}: o áudio foi apagado depois de salvar`);
    assert.equal((await recibos.listarRecibosDaFila('u-1')).some((x) => x.id === requestId), false, `${source}: o aviso saiu`);
    await tentarDeNovo(requestId);
    await tentarDeNovo(requestId);
    const novas = linhas.slice(antes);
    assert.equal(novas.length, 1, `${source}: revisão + dois "Tentar de novo" gravam UMA linha`);
    assert.equal(novas[0].request_id, `rev-${source}`);
    porEntrada[source] = novas.map(({ id, request_id, ...resto }) => resto);
  }
  assert.deepEqual(porEntrada.app, porEntrada.widget, 'app e widget: mesma gravação (regra 13)');
  ok('revisão salva e "Tentar de novo" depois: uma linha só no banco, nas duas entradas');

  /* ── 2. Salvar de novo com a mesma fala: nada quebra (idempotente) ───── */
  await fila.concluirVozRevisada('req-app');
  await fila.concluirVozRevisada('inexistente');
  ok('concluir a mesma fala de novo não faz nada');

  /* ── 3. Salvamento recusado: a fala e o áudio continuam ────────────── */
  {
    const audio = await falaEmRevisao('req-recusa', 'widget');
    const antes = linhas.length;
    modoBanco = 'recusa';
    await assert.rejects(registrarOperacaoVoz('rev-recusa', 'app', payloadDaRevisao, undefined, 'req-recusa'));
    modoBanco = 'online';
    assert.equal(linhas.length, antes, 'nada gravado');
    assert.deepEqual(await naFila(), ['req-recusa'], 'a fala continua na fila');
    assert.equal((await fila.listarVozesPendentes())[0].revisao, true, 'e continua em revisão');
    assert.equal(disco.has(audio), true, 'o áudio NÃO foi apagado antes de o salvamento confirmar');
    await fila.descartarVozPendente('req-recusa');
  }
  ok('salvamento recusado não apaga a fala nem o áudio');

  /* ── 4. Sem rede: guardada na fila de operações, a fala sai; sobe uma vez ── */
  {
    const audio = await falaEmRevisao('req-offline', 'app');
    const antes = linhas.length;
    modoBanco = 'offline';
    const r = await registrarOperacaoVoz('rev-offline', 'app', payloadDaRevisao, undefined, 'req-offline');
    assert.equal(r.status, 'pending');
    assert.ok(armazem.has('grana:voz:operacao:u-1:rev-offline'), 'o lançamento está guardado na fila de operações');
    assert.deepEqual(await naFila(), [], 'a fala saiu: o lançamento já está seguro no aparelho');
    assert.equal(disco.has(audio), false);
    modoBanco = 'online';
    await tentarDeNovo('req-offline');
    await registrarOperacaoVoz('rev-offline', 'app', payloadDaRevisao);
    assert.equal(linhas.length - antes, 1, 'quando a rede volta, uma linha só');
  }
  ok('sem rede: a revisão fica na fila de operações, a fala sai, e sobe uma vez só');

  /* ── 5. As três revisões passam a fala adiante ─────────────────────── */
  const ler = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const resposta = ler('components/RespostaVozWidget.tsx');
  assert.match(resposta, /abrirFala\(recibo\.transcricao!, recibo\.id\)/, 'o "Revisar" da fala guardada diz qual fala é');
  assert.match(ler('components/PasteReceiptModal.tsx'), /registrarOperacaoVoz\([^;]*falaGuardada\)/, 'Início: a revisão passa a fala');
  assert.match(ler('app/(app)/contas.tsx'), /registrarOperacaoVoz\([\s\S]{0,400}?falaGuardadaDaRevisao\.current\)/, 'Contas: a revisão passa a fala');
  assert.match(ler('app/(app)/credito.tsx'), /registrarOperacaoVoz\([\s\S]{0,400}?falaGuardadaDaRevisao\.current\)/, 'Crédito: a revisão passa a fala');
  ok('Início, Contas e Crédito ligam a revisão à fala guardada');

  console.log(`\n${checagens} checagens de revisão sem duplicata passaram — 0 falhas`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
