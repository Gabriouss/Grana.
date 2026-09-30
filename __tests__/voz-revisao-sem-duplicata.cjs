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
    assert.equal(novas[0].request_id, requestId, `${source}: a revisão grava com o id da própria fala`);
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
    assert.ok(armazem.has('grana:voz:operacao:u-1:req-offline'), 'o lançamento está guardado na fila de operações, com o id da fala');
    assert.deepEqual(await naFila(), [], 'a fala saiu: o lançamento já está seguro no aparelho');
    assert.equal(disco.has(audio), false);
    modoBanco = 'online';
    await tentarDeNovo('req-offline');
    await tarefa.tentarVozesPendentes();
    const { sincronizarOperacoesVoz } = carregar('lib/voice-operations.ts');
    await sincronizarOperacoesVoz();
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

  /* ── 6. Limpeza falha DEPOIS de gravar: nenhuma segunda gravação ─────
     Achado do Watchtower de 27/09/2026: o lançamento já está no banco e a
     limpeza local falha; a fala não pode voltar a ser retomada com o
     request_id original, que a idempotência do servidor não une à revisão. */
  const CHAVE_FILA = 'grana:queue:widget-voz-pendente-v1';
  const CHAVE_APAGAR = 'grana:queue:widget-voz-apagar-v1';
  const CHAVE_RECIBOS = 'grana:voz:recibos-da-fila-v1';
  const desfechoFalha = { audio: {}, fila: {} };
  for (const source of ['app', 'widget']) {
    /* 6a. O áudio não apaga: a fala sai da fila mesmo assim, e o áudio fica
       marcado para a próxima retomada. */
    {
      const requestId = `req-disco-${source}`;
      const audio = await falaEmRevisao(requestId, source);
      const antes = linhas.length;
      exclusaoFalha = true;
      const r = await registrarOperacaoVoz(`rev-disco-${source}`, 'app', payloadDaRevisao, undefined, requestId);
      exclusaoFalha = false;
      assert.equal(r.status, 'committed');
      assert.deepEqual(await naFila(), [], `${source}: a fala saiu da fila mesmo com o áudio preso`);
      assert.ok(!JSON.parse(armazem.get(CHAVE_FILA)).some((i) => i.requestId === requestId), `${source}: fora da fila persistida`);
      assert.equal(disco.has(audio), true, `${source}: o áudio ainda está no disco`);
      assert.deepEqual(JSON.parse(armazem.get(CHAVE_APAGAR)), [audio], `${source}: o áudio ficou marcado para apagar`);
      assert.equal((await recibos.listarRecibosDaFila('u-1')).some((x) => x.id === requestId), false, `${source}: o aviso da fala saiu`);
      await tentarDeNovo(requestId);
      await tentarDeNovo(requestId);
      assert.equal(disco.has(audio), false, `${source}: a retomada seguinte apagou o áudio`);
      assert.deepEqual(JSON.parse(armazem.get(CHAVE_APAGAR)), [], `${source}: nada mais a apagar`);
      const novas = linhas.slice(antes);
      assert.equal(novas.length, 1, `${source}: áudio preso + dois "Tentar de novo" gravam UMA linha`);
      desfechoFalha.audio[source] = novas.map(({ id, request_id, ...resto }) => resto);
    }
    /* 6b. A fila persistida não grava: a trava da execução impede a
       retomada, e um aviso visível explica o que fazer se a fala voltar. */
    {
      const requestId = `req-fila-${source}`;
      const audio = await falaEmRevisao(requestId, source);
      const antes = linhas.length;
      escritaFalha.add(CHAVE_FILA);
      const r = await registrarOperacaoVoz(`rev-fila-${source}`, 'app', payloadDaRevisao, undefined, requestId);
      assert.equal(r.status, 'committed', `${source}: o lançamento salvo não vira erro por causa da limpeza`);
      assert.ok(JSON.parse(armazem.get(CHAVE_FILA)).some((i) => i.requestId === requestId), `${source}: a fila no disco não mudou (a falha simulada)`);
      assert.deepEqual(await naFila(), [], `${source}: mas a fala não é mais listada nesta execução`);
      assert.equal(disco.has(audio), true, `${source}: o áudio não é apagado antes de a fala sair da fila`);
      const aviso = (await recibos.listarRecibosDaFila('u-1')).find((x) => x.id === requestId);
      assert.equal(aviso?.tipo, 'aviso', `${source}: o recibo com "Tentar de novo" virou aviso visível`);
      assert.match(aviso.texto, /Descartar/);
      escritaFalha.delete(CHAVE_FILA);
      await fila.adicionarVozPendente({ caminho: audio, requestId, userId: 'u-1', source });
      await tentarDeNovo(requestId);
      await tentarDeNovo(requestId);
      const novas = linhas.slice(antes);
      assert.equal(novas.length, 1, `${source}: fila sem gravar + dois "Tentar de novo" gravam UMA linha`);
      assert.equal(novas[0].request_id, requestId);
      desfechoFalha.fila[source] = novas.map(({ id, request_id, ...resto }) => resto);
      await fila.descartarVozPendente(requestId);
    }
  }
  assert.deepEqual(desfechoFalha.audio.app, desfechoFalha.audio.widget, 'áudio preso: mesmo desfecho no app e no widget (regra 13)');
  assert.deepEqual(desfechoFalha.fila.app, desfechoFalha.fila.widget, 'fila sem gravar: mesmo desfecho no app e no widget (regra 13)');
  ok('limpeza que falha depois de gravar: uma linha só, recibo visível, nas duas entradas');

  /* ── 7. Nem a fila nem o aviso gravam: o salvamento continua valendo ── */
  {
    const requestId = 'req-tudo-falha';
    await falaEmRevisao(requestId, 'widget');
    const antes = linhas.length;
    escritaFalha.add(CHAVE_FILA);
    escritaFalha.add(CHAVE_RECIBOS);
    const r = await registrarOperacaoVoz('rev-tudo-falha', 'app', payloadDaRevisao, undefined, requestId);
    escritaFalha.clear();
    assert.equal(r.status, 'committed', 'o aviso que falha também não derruba o salvamento');
    assert.deepEqual(await naFila(), [], 'e a trava da execução continua valendo');
    await tentarDeNovo(requestId);
    assert.equal(linhas.length - antes, 1, 'uma linha só');
    await fila.descartarVozPendente(requestId);
  }
  ok('aviso que também falha: salvamento mantido, retomada travada, falha no log');

  /* ── 8. ENTRE EXECUÇÕES: a trava da memória some, o servidor segura ────
     Sequência do Watchtower (27/09/2026): a revisão grava, a fila no disco
     não grava, o app fecha. Ao reabrir, a fala volta com `revisao: true`; a
     faixa "Revisar" (`reabrirRevisoesDeFala`) troca o aviso de "Descartar"
     pelo recibo de áudio; o "Tentar de novo" tira a marca e reenvia a fala. */
  const entreExecucoes = {};
  for (const source of ['app', 'widget']) {
    const requestId = `req-reinicio-${source}`;
    const audio = await falaEmRevisao(requestId, source);
    const antes = linhas.length;
    escritaFalha.add(CHAVE_FILA);
    const r = await registrarOperacaoVoz(`rev-reinicio-${source}`, 'app', payloadDaRevisao, undefined, requestId);
    escritaFalha.delete(CHAVE_FILA);
    assert.equal(r.status, 'committed');
    assert.equal(linhas.length - antes, 1, `${source}: a revisão gravou`);

    abrirApp();
    const voltou = (await fila.listarVozesPendentes()).find((i) => i.requestId === requestId);
    assert.equal(voltou?.revisao, true, `${source}: depois de reabrir, a fala voltou em revisão (a trava da memória sumiu)`);
    assert.equal((await recibos.listarRecibosDaFila('u-1')).find((x) => x.id === requestId)?.tipo, 'aviso', `${source}: o aviso de "Descartar" sobreviveu ao reinício`);
    await fila.reabrirRevisoesDeFala('u-1');
    assert.equal((await recibos.listarRecibosDaFila('u-1')).find((x) => x.id === requestId)?.tipo, 'audio', `${source}: "Revisar" trocou o aviso pelo recibo de áudio`);
    await tentarDeNovo(requestId);

    const novas = linhas.slice(antes);
    assert.equal(novas.length, 1, `${source}: revisão + reinício + "Revisar" + "Tentar de novo" gravam UMA linha`);
    assert.equal(novas[0].request_id, requestId);
    assert.deepEqual(await naFila(), [], `${source}: a fala já lançada saiu da fila`);
    assert.ok(!JSON.parse(armazem.get(CHAVE_FILA)).some((i) => i.requestId === requestId), `${source}: e da fila persistida`);
    assert.equal(disco.has(audio), false, `${source}: o áudio foi apagado`);
    const recibo = (await recibos.listarRecibosDaFila('u-1')).find((x) => x.id === requestId);
    assert.equal(recibo?.tipo, 'aviso', `${source}: recibo visível`);
    /* 22023: o servidor não diz se a operação existente está ativa ou foi
       desfeita, então o recibo é "Fala já usada" (C3, 30/09/2026). */
    assert.equal(recibo.titulo, 'Erro ja_usada', `${source}: o recibo diz "Fala já usada", e não "Não consegui salvar" nem "já lançada"`);
    await tentarDeNovo(requestId);
    assert.equal(linhas.length - antes, 1, `${source}: outro "Tentar de novo" também não grava`);
    entreExecucoes[source] = novas.map(({ id, request_id, ...resto }) => resto);

    /* Mesmo conteúdo com o mesmo id (a outra resposta possível do servidor):
       replay, sem linha nova. */
    const replay = await registrarOperacaoVoz(`outra-tela-${source}`, 'app', payloadDaRevisao, undefined, requestId);
    assert.equal(replay.replayed, true, `${source}: mesma revisão salva de novo é replay`);
    assert.equal(linhas.length - antes, 1);
  }
  assert.deepEqual(entreExecucoes.app, entreExecucoes.widget, 'entre execuções: mesmo desfecho no app e no widget (regra 13)');
  ok('entre execuções (reabrir, Revisar, Tentar de novo): uma linha só, fala sai da fila, recibo "já usada", nas duas entradas');

  /* ── 9. Fala gravada pela tarefa avisa as telas montadas ─────────────
     Achado do Harbor de 27/09/2026 (aba Lançamentos atrasada): o aviso sai
     do núcleo `registrarOperacaoVoz`, então vale igual para a fala do app e
     a do widget, pelo `executarTarefa` real. */
  {
    const tela = carregar('lib/cache-de-tela.ts');
    let avisos = 0;
    const parar = tela.assinarDadoNovo(() => { avisos++; });
    for (const source of ['app', 'widget']) {
      const requestId = `req-aviso-${source}`;
      const origem = `file:///cache/${requestId}.m4a`;
      disco.set(origem, 'AUDIO');
      await fila.adicionarVozPendente({ caminho: origem, requestId, userId: 'u-1', source });
      transcricoes[`file:///files/voz-pendente/${requestId}.m4a`] = { ok: true, transcript: FALA };
      const antes = linhas.length;
      avisos = 0;
      await tarefa.tentarVozesPendentes();
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(linhas.length - antes, 1, `${source}: a fala gravou`);
      assert.ok(avisos >= 1, `${source}: as telas que assinam assinarDadoNovo foram avisadas`);
    }
    parar();
  }
  ok('fala gravada pela tarefa (app e widget) avisa as telas montadas');

  /* ── 10. A1 do Lynx (29/09/2026): 22023 na REVISÃO vira "Fala já lançada" ──
     A revisão grava, a fila no disco não grava, o app reabre, a pessoa toca
     em "Revisar" e salva com OUTRO valor. O servidor recusa com 22023. Antes
     disso caía no `catch` das telas ("Erro ao salvar") com a fala na fila. */
  const a1 = {};
  for (const source of ['app', 'widget']) {
    const requestId = `req-a1-${source}`;
    const audio = await falaEmRevisao(requestId, source);
    const antes = linhas.length;
    escritaFalha.add(CHAVE_FILA);
    await registrarOperacaoVoz(`rev-a1-${source}`, 'app', payloadDaRevisao, undefined, requestId);
    escritaFalha.delete(CHAVE_FILA);
    abrirApp();
    await fila.reabrirRevisoesDeFala('u-1');
    assert.equal((await fila.listarVozesPendentes()).find((i) => i.requestId === requestId)?.revisao, true, `${source}: a fala voltou em revisão`);

    const chamadasAntes = chamadasRpc.length;
    const r = await registrarOperacaoVoz(`rev-a1-bis-${source}`, 'app', { ...payloadDaRevisao, amount: 130 }, undefined, requestId);
    assert.deepEqual(chamadasRpc.slice(chamadasAntes).map((c) => [c.requestId, c.amount]), [[requestId, 130]], `${source}: uma chamada só, com o id da fala`);
    assert.equal(r.status, 'committed', `${source}: 22023 na revisão não vira erro`);
    assert.ok(avisosNoLog.some((l) => l.includes('22023 na revisão') && l.includes(requestId) && l.endsWith(' 22023')), `${source}: a conversão do 22023 deixou log com a fala e o código (B2)`);
    assert.equal(r.replayed, true, `${source}: nada gravado agora (replayed)`);
    assert.equal(carregar('lib/voice-operations.ts').desfechoDaOperacaoVoz(r), 'ja_usada', `${source}: o desfecho é "já usada" (C3), que as telas mostram como "Fala já usada"`);
    assert.equal(r.ids.length, 0, `${source}: nenhum id novo`);
    assert.equal(linhas.length - antes, 1, `${source}: nenhuma linha nova`);
    assert.deepEqual(await naFila(), [], `${source}: a fala saiu da fila`);
    assert.ok(!JSON.parse(armazem.get(CHAVE_FILA)).some((i) => i.requestId === requestId), `${source}: e da fila persistida`);
    assert.equal(disco.has(audio), false, `${source}: o áudio foi apagado`);
    assert.equal(armazem.has(`grana:voz:operacao:u-1:${requestId}`), false, `${source}: nada ficou na fila de operações para subir depois`);
    assert.equal((await recibos.listarRecibosDaFila('u-1')).some((x) => x.id === requestId), false, `${source}: o recibo "Revisar" saiu`);
    await tentarDeNovo(requestId);
    assert.equal(chamadasRpc.length - chamadasAntes, 1, `${source}: "Tentar de novo" depois não chama o banco`);
    a1[source] = { status: r.status, replayed: r.replayed, ids: r.ids.length };
  }
  assert.deepEqual(a1.app, a1.widget, 'A1: mesma decisão no app e no widget (regra 13)');
  /* Controle: 22023 fora de uma revisão de fala guardada continua erro. */
  await assert.rejects(registrarOperacaoVoz('req-a1-app', 'app', { ...payloadDaRevisao, amount: 140 }), (e) => e.code === '22023');
  for (const tela of ['components/PasteReceiptModal.tsx', 'app/(app)/contas.tsx', 'app/(app)/credito.tsx']) {
    const codigo = ler(tela);
    assert.match(codigo, /const desfecho = desfechoDaOperacaoVoz\(resultado\);/, `${tela}: a decisão vem do núcleo`);
    /* Todo desfecho sem lançamento novo (já lançada, desfeita) mostra o recibo
       do catálogo, pelo nome do próprio desfecho (C2, 30/09/2026). */
    assert.match(codigo, /const m = mensagemDeErroVoz\(desfecho\); Alert\.alert\(m\.titulo, m\.texto\);/, `${tela}: mostra o recibo do desfecho`);
    assert.doesNotMatch(codigo, /resultado\.replayed/, `${tela}: não decide por conta própria (B1)`);
  }
  ok('A1: 22023 na revisão de fala guardada vira "Fala já usada", fala sai da fila, nas duas entradas e nas três telas');

  /* ── 11. A2 do Lynx (29/09/2026): replay na tarefa não se anuncia como novo ──
     A tarefa gravou a fala, a limpeza falhou e a fala voltou à fila. O
     "Tentar de novo" manda o mesmo conteúdo com o mesmo id: o servidor
     devolve replayed=true, e o recibo antes dizia "salvo" como se fosse
     lançamento novo. */
  /* B3 (Lynx, 29/09/2026): os quatro pontos de gravação da tarefa, e não só
     a transação comum. */
  const FALAS_POR_TIPO = {
    transacao: { fala: FALA, kind: 'transaction', cartao: undefined },
    conta: { fala: 'Conta de luz R$ 120 vence dia 10', kind: 'bill', cartao: undefined },
    credito: { fala: 'Mercado R$ 120 no crédito', kind: 'transaction', cartao: 'c6' },
    parcelado: { fala: 'Mercado R$ 120 em 3x no crédito', kind: 'installment', cartao: 'c6' },
  };
  /** A fala da fila roda uma vez (lançamento novo) e volta à fila, como se a
      limpeza tivesse falhado. Devolve o recibo publicado na primeira vez. */
  async function falaGravadaQueVolta(requestId, source, fala) {
    const colocarNaFila = async (n) => {
      const origem = `file:///cache/${requestId}-${n}.m4a`;
      disco.set(origem, 'AUDIO');
      await fila.adicionarVozPendente({ caminho: origem, requestId, userId: 'u-1', source });
    };
    transcricoes[`file:///files/voz-pendente/${requestId}.m4a`] = { ok: true, transcript: fala };
    await colocarNaFila(1);
    await tarefa.tentarVozesPendentes();
    const primeiro = (await recibos.listarRecibosDaFila('u-1')).find((x) => x.id === requestId);
    await colocarNaFila(2);
    return primeiro;
  }
  const a2 = {};
  for (const [tipo, { fala, kind, cartao }] of Object.entries(FALAS_POR_TIPO)) {
    for (const source of ['app', 'widget']) {
      const requestId = `req-a2-${tipo}-${source}`;
      const antes = linhas.length;
      const chamadasAntes = chamadasRpc.length;
      const primeiro = await falaGravadaQueVolta(requestId, source, fala);
      assert.equal(primeiro?.tipo, 'sucesso', `${tipo}/${source}: a primeira vez é lançamento novo`);
      assert.equal(linhas.length - antes, 1, `${tipo}/${source}: a primeira vez gravou`);
      assert.equal(linhas.at(-1).kind, kind, `${tipo}/${source}: passou pelo ponto de gravação de ${kind}`);
      assert.equal(linhas.at(-1).card_id, cartao, `${tipo}/${source}: gravou no cartão certo`);
      await tentarDeNovo(requestId);
      assert.deepEqual(chamadasRpc.slice(chamadasAntes).map((c) => c.requestId), [requestId, requestId], `${tipo}/${source}: duas chamadas, o mesmo id`);
      assert.equal(linhas.length - antes, 1, `${tipo}/${source}: uma linha só`);
      const recibo = (await recibos.listarRecibosDaFila('u-1')).find((x) => x.id === requestId);
      assert.equal(recibo?.tipo, 'aviso', `${tipo}/${source}: o replay não publica recibo de sucesso`);
      assert.equal(recibo.titulo, 'Erro ja_lancada', `${tipo}/${source}: o replay diz "Fala já lançada"`);
      assert.deepEqual(await naFila(), [], `${tipo}/${source}: a fala saiu da fila`);
      a2[`${tipo}/${source}`] = { tipo: recibo.tipo, titulo: recibo.titulo };
    }
    assert.deepEqual(a2[`${tipo}/app`], a2[`${tipo}/widget`], `A2 ${tipo}: mesmo recibo no app e no widget (regra 13)`);
  }
  ok('A2: replay do "Tentar de novo" mostra "Fala já lançada" em transação, conta, crédito à vista e parcelado, nas duas entradas');

  /* ── 12. B1 do Lynx (29/09/2026): operação DESFEITA não é "já lançada" ──
     Quem tocou em "Desfazer" e depois reenvia a mesma fala recebe do
     servidor status 'undone' com replayed=true. O lançamento não existe mais:
     a tarefa sempre ficou em silêncio, e as telas diziam "Fala já lançada".
     A decisão agora é uma só, `desfechoDaOperacaoVoz`. */
  const { desfechoDaOperacaoVoz } = carregar('lib/voice-operations.ts');
  assert.equal(desfechoDaOperacaoVoz({ status: 'pending', replayed: false }), 'pendente');
  assert.equal(desfechoDaOperacaoVoz({ status: 'undone', replayed: true }), 'desfeita');
  assert.equal(desfechoDaOperacaoVoz({ status: 'committed', replayed: true }), 'ja_lancada');
  assert.equal(desfechoDaOperacaoVoz({ status: 'committed', replayed: false }), 'nova');
  assert.equal(desfechoDaOperacaoVoz({ status: 'committed', replayed: true, conflito: true }), 'ja_usada');
  const b1 = {};
  for (const source of ['app', 'widget']) {
    /* Tarefa: a fala volta e é reenviada depois do "Desfazer". */
    {
      const requestId = `req-b1-tarefa-${source}`;
      const antes = linhas.length;
      await falaGravadaQueVolta(requestId, source, FALA);
      desfeitas.add(requestId);
      await recibos.removerReciboDaFila(requestId);
      const chamadasAntes = chamadasRpc.length;
      await tentarDeNovo(requestId);
      assert.deepEqual(chamadasRpc.slice(chamadasAntes).map((c) => c.requestId), [requestId], `${source}: a tarefa chamou o banco uma vez`);
      assert.equal(linhas.length - antes, 1, `${source}: nada gravado de novo`);
      const recibo = (await recibos.listarRecibosDaFila('u-1')).find((x) => x.id === requestId);
      assert.equal(recibo?.titulo, 'Erro desfeita', `${source}: a tarefa diz "Fala já desfeita" (C2), nem silêncio nem "Fala já lançada"`);
      assert.deepEqual(await naFila(), [], `${source}: a fala saiu da fila`);
      b1[`tarefa/${source}`] = 'desfeita';
    }
    /* Revisão: a fala revisada foi lançada, desfeita, e volta a ser salva. */
    {
      const requestId = `req-b1-revisao-${source}`;
      await falaEmRevisao(requestId, source);
      escritaFalha.add(CHAVE_FILA);
      await registrarOperacaoVoz(`rev-b1-${source}`, 'app', payloadDaRevisao, undefined, requestId);
      escritaFalha.delete(CHAVE_FILA);
      desfeitas.add(requestId);
      abrirApp();
      const antes = linhas.length;
      const r = await registrarOperacaoVoz(`rev-b1-bis-${source}`, 'app', payloadDaRevisao, undefined, requestId);
      assert.equal(r.status, 'undone');
      assert.equal(linhas.length - antes, 0, `${source}: nada gravado de novo`);
      assert.deepEqual(await naFila(), [], `${source}: a fala saiu da fila, respeitando o "Desfazer"`);
      b1[`revisao/${source}`] = carregar('lib/voice-operations.ts').desfechoDaOperacaoVoz(r);
    }
  }
  assert.deepEqual(new Set(Object.values(b1)), new Set(['desfeita']), 'B1: tarefa e revisão, app e widget, a mesma decisão (regra 13)');
  /* Contas é a única tela que dá recibo de sucesso sem ser Alert: só a
     conta nova ou pendente diz "Conta salva"; a desfeita dá o recibo dela. */
  assert.match(ler('app/(app)/contas.tsx'), /if \(desfecho === 'nova' \|\| desfecho === 'pendente'\) triggerToast\(/, 'Contas: "Conta salva" só para conta nova ou pendente');
  ok('B1: operação desfeita não vira "Fala já lançada" nem "salva", na tarefa e na revisão, nas duas entradas');

  /* ── 13. C3 do Lynx (30/09/2026): 22023 DEPOIS de desfazer ──────────────
     A fala foi lançada pela revisão, desfeita, e volta com OUTRO conteúdo.
     O servidor responde 22023 sem dizer que ela foi desfeita. Antes, a tela
     e a tarefa diziam "Fala já lançada", falso aqui. Agora "Fala já usada",
     que vale para os dois estados, e a fala sai da fila com o recibo. */
  const c3 = {};
  for (const source of ['app', 'widget']) {
    /* Revisão: salva com outro valor depois do "Desfazer". */
    {
      const requestId = `req-c3-revisao-${source}`;
      await falaEmRevisao(requestId, source);
      escritaFalha.add(CHAVE_FILA);
      await registrarOperacaoVoz(`rev-c3-${source}`, 'app', payloadDaRevisao, undefined, requestId);
      escritaFalha.delete(CHAVE_FILA);
      desfeitas.add(requestId);
      abrirApp();
      const antes = linhas.length;
      const r = await registrarOperacaoVoz(`rev-c3-bis-${source}`, 'app', { ...payloadDaRevisao, amount: 150 }, undefined, requestId);
      assert.equal(linhas.length - antes, 0, `${source}: nada gravado de novo`);
      assert.deepEqual(await naFila(), [], `${source}: a fala saiu da fila`);
      c3[`revisao/${source}`] = desfechoDaOperacaoVoz(r);
    }
    /* Tarefa: a fala revisada e desfeita volta pelo "Tentar de novo" com a
       transcrição original, que difere do que a revisão gravou. */
    {
      const requestId = `req-c3-tarefa-${source}`;
      await falaEmRevisao(requestId, source);
      escritaFalha.add(CHAVE_FILA);
      await registrarOperacaoVoz(`rev-c3t-${source}`, 'app', payloadDaRevisao, undefined, requestId);
      escritaFalha.delete(CHAVE_FILA);
      desfeitas.add(requestId);
      abrirApp();
      await fila.reabrirRevisoesDeFala('u-1');
      const antes = linhas.length;
      const chamadasAntes = chamadasRpc.length;
      await tentarDeNovo(requestId);
      assert.deepEqual(chamadasRpc.slice(chamadasAntes).map((c) => c.requestId), [requestId], `${source}: a tarefa chamou o banco uma vez`);
      assert.equal(linhas.length - antes, 0, `${source}: nada gravado de novo`);
      const recibo = (await recibos.listarRecibosDaFila('u-1')).find((x) => x.id === requestId);
      assert.equal(recibo?.titulo, 'Erro ja_usada', `${source}: a tarefa diz "Fala já usada", nem "já lançada" nem silêncio`);
      assert.deepEqual(await naFila(), [], `${source}: a fala saiu da fila, agora com recibo`);
      c3[`tarefa/${source}`] = 'ja_usada';
    }
  }
  assert.deepEqual(new Set(Object.values(c3)), new Set(['ja_usada']), 'C3: tarefa e revisão, app e widget, a mesma decisão (regra 13)');
  ok('C3: 22023 depois de desfazer vira "Fala já usada", fala sai da fila com recibo, na tarefa e na revisão, nas duas entradas');

  console.log(`\n${checagens} checagens de revisão sem duplicata passaram — 0 falhas`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
