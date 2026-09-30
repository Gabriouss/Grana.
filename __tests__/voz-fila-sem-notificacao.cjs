/*
 * Fala guardada sobe mesmo sem permissão de notificação (26/09/2026).
 *
 *   node __tests__/voz-fila-sem-notificacao.cjs
 *
 * O autor viu no celular (Expo Go, internet ligada) a faixa "1 lançamento
 * aguardando conexão" que não saía. `tentarVozesPendentes` começava por
 * `if (!(await podeNotificar())) return;`, e no Expo Go (ou com a permissão
 * negada) a fila de áudios nunca era processada, em silêncio. "Tentar
 * sincronizar" nem olhava essa fila.
 *
 * Módulos REAIS: o núcleo (`lib/widget-voz-task.ts`), a fila
 * (`widget-voz-pendentes`), o recibo na tela (`voz-recibos-da-fila`), o
 * catálogo de recibos, as heurísticas e a trava de valor. Dublês: disco,
 * AsyncStorage, transcrição, banco e o módulo de notificação, que diz "não
 * posso notificar" e falha o teste se alguém tentar usá-lo.
 *
 * Afirma QUAIS escritas aconteceram (regra 9), nas duas entradas (regra 13):
 * uma fala do botão do app e uma do widget na mesma fila.
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
const falharGravacao = new Set();
const AsyncStorage = {
  getItem: async (k) => (armazem.has(k) ? armazem.get(k) : null),
  setItem: async (k, v) => {
    if (falharGravacao.has(k)) throw new Error('disco cheio (simulado)');
    armazem.set(k, v);
  },
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

let transcricoes = {};
let chamadasTranscricao = [];
const escritas = [];
const erros = [];
const proibido = (nome) => async () => assert.fail('o módulo de notificação não pode ser usado sem permissão: ' + nome);
const notificacaoDoSistema = {
  podeNotificar: async () => false,
  notificarRevisao: proibido('notificarRevisao'),
  notificarSucesso: proibido('notificarSucesso'),
  notificarFalha: proibido('notificarFalha'),
  notificarSalvoLocal: proibido('notificarSalvoLocal'),
  notificarPendenteOffline: proibido('notificarPendenteOffline'),
};

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
    './offline-cache': { isLikelyNetworkError: () => false },
    './widget-voz-notificacoes': notificacaoDoSistema,
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1', lerSessaoDoDisco: async () => ({}) },
    './voz': {
      transcreverAudio: async (uri) => {
        chamadasTranscricao.push(uri);
        const r = transcricoes[uri];
        assert.ok(r, 'transcrição não preparada para ' + uri);
        return r;
      },
      mensagemDeErroVoz: (codigo) => ({ titulo: 'Erro ' + codigo, texto: 'Texto ' + codigo }),
    },
    './data': { fetchCategories: async () => [], fetchCreditCards: async () => [] },
    './wallets': { fetchWallets: async () => [{ id: 'pessoal', name: 'Pessoal', is_default: true }] },
    './voice-operations': { desfechoDaOperacaoVoz: require('./desfecho-voz-real.cjs'),
      registrarOperacaoVoz: async (requestId, source, payload) => {
        escritas.push({ requestId, source, payload: JSON.parse(JSON.stringify(payload)) });
        return { status: 'committed', ids: ['tx-' + requestId], operationId: 'op-' + requestId, kind: payload.kind };
      },
      ehRecusaCartaoObrigatorio: () => false,
    },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } },
    './widgets-home-sync': { sincronizarWidgetsHome: async () => {} },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    console: { ...console, log() {}, warn: (...a) => process.env.DEBUG && console.warn(...a), error: (...a) => { erros.push(a); if (process.env.DEBUG) console.error(...a); } },
    Promise, JSON, Object, Array, String, Number, Error, RegExp, Set, Map, Math, Date, setTimeout, clearTimeout,
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

async function guardarFala(requestId, source, texto) {
  const origem = `file:///cache/${requestId}.m4a`;
  disco.set(origem, 'AUDIO');
  await fila.adicionarVozPendente({ caminho: origem, requestId, userId: 'u-1', source });
  const destino = `file:///files/voz-pendente/${requestId}.m4a`;
  transcricoes[destino] = texto;
  return destino;
}
const naFila = async () => (await fila.listarVozesPendentes()).map((i) => i.requestId);

(async () => {
  /* ── 1. Sem notificação e com rede: sobe, nas duas entradas ──────────── */
  const arqApp = await guardarFala('req-app', 'app', { ok: true, transcript: 'Mercado R$ 120 no débito.' });
  const arqWidget = await guardarFala('req-widget', 'widget', { ok: true, transcript: 'Mercado R$ 120 no débito.' });
  const resumo = await tarefa.tentarVozesPendentes();
  assert.deepEqual(await naFila(), [], 'as duas falas saíram da fila');
  assert.deepEqual({ ...resumo }, { restantes: 0 });
  assert.equal(escritas.length, 2, 'e as duas foram gravadas');
  assert.deepEqual(escritas.map((e) => [e.requestId, e.source]), [['req-app', 'app'], ['req-widget', 'widget']],
    'com o requestId e a origem de cada uma (idempotência do servidor preservada)');
  assert.deepEqual(escritas[0].payload, escritas[1].payload, 'app e widget gravam o mesmo lançamento (regra 13)');
  assert.equal(escritas[0].payload.amount, 120);
  assert.equal(escritas[0].payload.payment_method, 'debit');
  assert.ok(!disco.has(arqApp) && !disco.has(arqWidget), 'o áudio sai do aparelho depois de usado');
  ok('sem permissão de notificação e com rede, a fila é processada e grava, nas duas entradas');

  const guardados = await recibos.listarRecibosDaFila('u-1');
  assert.deepEqual(guardados.map((r) => [r.id, r.tipo]), [['req-app', 'sucesso'], ['req-widget', 'sucesso']]);
  assert.equal(guardados[0].texto, guardados[1].texto, 'mesmo recibo nas duas entradas');
  assert.match(guardados[0].texto, /Salvo no Grana\.$/, 'texto do catálogo único');
  assert.equal(guardados[0].operationId, 'op-req-app', 'com o que o Desfazer precisa');
  ok('o recibo vai para a tela (guardado até ser visto), com o texto do catálogo e o Desfazer');

  /* ── 2. Sem rede: fica, e o motivo é "sem_rede" ──────────────────────── */
  await guardarFala('req-offline', 'app', { ok: false, codigo: 'sem_rede' });
  const semRede = await tarefa.tentarVozesPendentes();
  assert.deepEqual(await naFila(), ['req-offline'], 'sem rede a fala continua guardada');
  assert.deepEqual({ ...semRede }, { restantes: 1, motivo: 'sem_rede' });
  assert.deepEqual({ ...tarefa.ultimoResumoDaFilaDeFalas() }, { restantes: 1, motivo: 'sem_rede' }, 'a faixa lê o mesmo resumo');
  assert.equal((await recibos.listarRecibosDaFila('u-1')).some((r) => r.id === 'req-offline'), false,
    'e não vira alerta a cada 30 s: a faixa já diz o motivo');
  ok('sem rede a fala fica, e o motivo é "sem_rede"');

  /* ── 3. Serviço lento: fica, com o motivo certo, não "sem conexão" ────── */
  transcricoes['file:///files/voz-pendente/req-offline.m4a'] = { ok: false, codigo: 'demorou' };
  const lento = await tarefa.tentarVozesPendentes();
  assert.deepEqual({ ...lento }, { restantes: 1, motivo: 'demorou' });
  ok('com rede e serviço lento o motivo é "demorou", nunca "aguardando conexão"');

  /* ── 4. A rede volta: sobe ──────────────────────────────────────────── */
  transcricoes['file:///files/voz-pendente/req-offline.m4a'] = { ok: true, transcript: 'Café R$ 7,00' };
  assert.deepEqual({ ...(await tarefa.tentarVozesPendentes()) }, { restantes: 0 });
  assert.equal(escritas.at(-1).requestId, 'req-offline');
  assert.equal(escritas.at(-1).payload.amount, 7);
  ok('quando a rede volta a mesma fala sobe, sem perder nada');

  /* ── 5. Revisão: não grava, e a fala fica no recibo para revisar ──────── */
  const antes = escritas.length;
  await guardarFala('req-1899', 'widget', { ok: true, transcript: 'Mercado R$ 1899' });
  await tarefa.tentarVozesPendentes();
  assert.equal(escritas.length, antes, '"R$ 1899" não é gravado');
  const revisao = (await recibos.listarRecibosDaFila('u-1')).find((r) => r.id === 'req-1899');
  assert.equal(revisao?.tipo, 'revisao');
  assert.equal(revisao.titulo, 'Confirme o valor que ouvi');
  assert.equal(revisao.transcricao, 'Mercado R$ 1899', 'a transcrição vai junto, para a revisão abrir preenchida');
  assert.deepEqual(await naFila(), [], 'a fala sai da fila só depois de o recibo estar guardado');
  ok('fala que precisa de revisão não grava e fica no recibo, com a transcrição');

  /* ── 6. Recibo que não pôde ser guardado: a fala NÃO se perde ────────── */
  falharGravacao.add('grana:voz:recibos-da-fila-v1');
  const errosAntes = erros.length;
  await guardarFala('req-disco', 'app', { ok: true, transcript: 'Mercado R$ 1899' });
  const semDisco = await tarefa.tentarVozesPendentes();
  assert.deepEqual(await naFila(), ['req-disco'], 'sem recibo entregue, a fala continua na fila');
  assert.equal(semDisco.restantes, 1);
  assert.ok(erros.slice(errosAntes).some((a) => /recibo da falha não foi entregue/.test(String(a[0]))), 'e deixa log');
  falharGravacao.clear();
  await tarefa.tentarVozesPendentes();
  assert.deepEqual(await naFila(), [], 'e na próxima retomada o recibo é entregue e a fala sai');
  ok('recibo que falha mantém a fala na fila, com log, até ser entregue');

  /* ── 7. Duas chamadas ao mesmo tempo: uma passada só ─────────────────── */
  await guardarFala('req-duplo', 'app', { ok: true, transcript: 'Uber R$ 25 no crédito.' });
  chamadasTranscricao = [];
  const [a, b] = await Promise.all([tarefa.tentarVozesPendentes(), tarefa.tentarVozesPendentes()]);
  assert.equal(a, b, 'o "Tentar sincronizar" recebe a passada que já estava rodando');
  assert.equal(chamadasTranscricao.length, 1, 'a fala é transcrita uma vez só');
  ok('"Tentar sincronizar" durante a retomada automática não processa a fala duas vezes');

  /* ── 9. "Não entendi" numa fala GUARDADA não a apaga (26/09/2026) ────── */
  /* A fala presa do autor voltou do Whisper como "Não entendi" e o áudio foi
     apagado: não havia outra cópia. Fala da fila vira revisão, nas duas
     entradas, com o áudio mantido. */
  const lista = carregar('lib/voz-pendente-na-lista.ts');
  const escritasAntes = escritas.length;
  const audioApp = await guardarFala('req-nao-app', 'app', { ok: false, codigo: 'nao_entendi' });
  const audioWidget = await guardarFala('req-nao-widget', 'widget', { ok: false, codigo: 'nao_entendi' });
  const comRevisao = await tarefa.tentarVozesPendentes();
  assert.equal(escritas.length, escritasAntes, 'nada é gravado');
  assert.deepEqual(await naFila(), ['req-nao-app', 'req-nao-widget'], 'as duas falas continuam na fila');
  assert.ok(disco.has(audioApp) && disco.has(audioWidget), 'e o áudio das duas continua no aparelho');
  assert.ok((await fila.listarVozesPendentes()).every((i) => i.revisao === true), 'marcadas como "precisa de revisão"');
  assert.deepEqual({ ...comRevisao }, { restantes: 0 }, 'revisão não é "aguardando conexão"');
  assert.equal(await lista.contarFalasEmRevisao(), 2, 'a faixa conta as duas como revisão');
  assert.equal(await lista.contarFalasAguardandoConexao(), 0, 'e nenhuma como aguardando conexão');
  const recibosAudio = (await recibos.listarRecibosDaFila('u-1')).filter((r) => r.tipo === 'audio');
  assert.deepEqual(recibosAudio.map((r) => r.id), ['req-nao-app', 'req-nao-widget']);
  assert.equal(recibosAudio[0].titulo, 'Não entendi a fala guardada');
  assert.equal(recibosAudio[0].texto, recibosAudio[1].texto, 'mesmo recibo no app e no widget (regra 13)');
  ok('"Não entendi" numa fala guardada: nada gravado, áudio mantido, revisão, igual no app e no widget');

  chamadasTranscricao = [];
  await tarefa.tentarVozesPendentes();
  assert.equal(chamadasTranscricao.length, 0, 'fala em revisão não volta ao servidor a cada 30 s');
  ok('fala em revisão sai das retomadas automáticas');

  /* Texto sem valor ("Obrigado por assistir"): a transcrição vai junto, para
     "Revisar" abrir preenchido. */
  await guardarFala('req-sem-valor', 'widget', { ok: true, transcript: 'Obrigado por assistir.' });
  await tarefa.tentarVozesPendentes();
  const semValor = (await fila.listarVozesPendentes()).find((i) => i.requestId === 'req-sem-valor');
  assert.equal(semValor?.revisao, true);
  assert.equal(semValor.transcricao, 'Obrigado por assistir.');
  const reciboSemValor = (await recibos.listarRecibosDaFila('u-1')).find((r) => r.id === 'req-sem-valor');
  assert.equal(reciboSemValor.transcricao, 'Obrigado por assistir.');
  assert.match(reciboSemValor.texto, /^Ouvi: "Obrigado por assistir"\. Nada foi lançado/);
  ok('texto sem valor também vira revisão, com o que foi ouvido');

  /* "Tentar de novo": volta à fila e, gravando, o áudio sai. */
  await fila.tirarVozDaRevisao('req-nao-app');
  transcricoes[audioApp] = { ok: true, transcript: 'Mercado R$ 120 no débito.' };
  await tarefa.tentarVozesPendentes();
  assert.equal(escritas.at(-1).requestId, 'req-nao-app', 'a nova tentativa grava');
  assert.ok(!disco.has(audioApp), 'e só então o áudio é apagado');
  assert.ok(!(await naFila()).includes('req-nao-app'));
  ok('"Tentar de novo" grava e só então apaga o áudio');

  /* "Descartar": a única saída que apaga sem gravar. */
  await fila.descartarVozPendente('req-nao-widget');
  assert.ok(!disco.has(audioWidget), 'Descartar apaga o áudio');
  assert.ok(!(await naFila()).includes('req-nao-widget'));
  ok('"Descartar" apaga o áudio e tira da fila');

  /* O botão "Revisar" da faixa republica o recibo de quem está em revisão. */
  await recibos.removerReciboDaFila('req-sem-valor');
  assert.equal(await fila.reabrirRevisoesDeFala('u-1'), 1);
  assert.ok((await recibos.listarRecibosDaFila('u-1')).some((r) => r.id === 'req-sem-valor' && r.tipo === 'audio'));
  ok('o botão da faixa reabre o recibo da fala em revisão');

  /* Fala NOVA (a pessoa está ali): "Não entendi" continua como antes. */
  const falhas = [];
  disco.set('file:///cache/req-nova.m4a', 'AUDIO');
  transcricoes['file:///cache/req-nova.m4a'] = { ok: false, codigo: 'nao_entendi' };
  await tarefa.executarTarefa({ caminho: 'file:///cache/req-nova.m4a', requestId: 'req-nova', source: 'app' }, {
    podeNotificar: async () => true,
    notificarFalha: async (codigo) => { falhas.push(codigo); },
    notificarRevisao: async () => assert.fail('revisão inesperada'),
    notificarSucesso: async () => assert.fail('sucesso inesperado'),
    notificarSalvoLocal: async () => assert.fail('salvo local inesperado'),
    notificarPendenteOffline: async () => assert.fail('pendente inesperado'),
  });
  assert.deepEqual(falhas, ['nao_entendi'], 'fala nova recebe "Não entendi" na hora');
  assert.ok(!disco.has('file:///cache/req-nova.m4a'), 'e o áudio dela sai: a pessoa repete');
  ok('fala nova com "Não entendi" segue como antes: recibo na hora, áudio apagado');

  /* ── 8. O retorno antigo não volta ──────────────────────────────────── */
  const fonte = fs.readFileSync(path.join(root, 'lib/widget-voz-task.ts'), 'utf8');
  const retomada = fonte.slice(fonte.indexOf('async function retomarFilaDeFalas'), fonte.indexOf('/* O recibo (Alert de sucesso'));
  assert.doesNotMatch(retomada, /if \(!\(await podeNotificar\(\)\)\) return/, 'a retomada não sai por falta de notificação');
  const faixa = fs.readFileSync(path.join(root, 'components/VozesSalvasLocalmente.tsx'), 'utf8');
  assert.match(faixa, /Promise\.all\(\[sincronizarOperacoesVoz\(\), tentarVozesPendentes\(\)\]\)/, '"Tentar sincronizar" retoma também os áudios');
  ok('a retomada não depende de notificação, e o botão da faixa retoma os áudios');

  console.log(`\n${checagens}/${checagens} checagens da fila de falas sem notificação passaram`);
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
