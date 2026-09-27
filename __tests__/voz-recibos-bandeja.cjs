/*
 * B5 (27/09/2026, achado do Harbor na etapa B da voz): os recibos de voz
 * nunca saíam da bandeja. Uma fala gravada sem rede gerou dois "Áudio
 * guardado", que continuaram lá depois do "Salvo", e o "Salvo" continuou lá
 * depois do Desfazer.
 *
 *   node __tests__/voz-recibos-bandeja.cjs
 *
 * Causas: a retomada da fila roda a cada 30 s e, sem rede, cada passada
 * publicava outro "Áudio guardado"; e cada recibo era uma notificação nova,
 * sem identidade, então nada substituía nada, e o botão Desfazer não fecha a
 * notificação sozinho.
 *
 * Módulos REAIS: o núcleo (`lib/widget-voz-task.ts`), as notificações
 * (`lib/widget-voz-notificacoes.ts`), a fila, o catálogo de recibos, as
 * heurísticas e a trava de valor. Dublês: disco, AsyncStorage, transcrição,
 * banco e o `expo-notifications`, que aqui é uma BANDEJA: publicar com um
 * identificador que já está lá substitui, como no Android.
 *
 * Nas duas entradas (regra 13): a fala do botão do app (primeiro recibo na
 * tela, como faz `VoiceEntryButton`) e a do widget (primeiro recibo na
 * bandeja), com a mesma frase, precisam terminar com a mesma decisão, o
 * mesmo lançamento e um recibo só na bandeja.
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

/* A bandeja do Android: identificador -> título. Sem identificador, cada
   publicação é uma entrada nova (o expo gera um id). */
const bandeja = new Map();
const publicacoes = [];
let semId = 0;
const Notifications = {
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: async () => ({ status: 'granted' }),
  setNotificationChannelAsync: async () => {},
  setNotificationCategoryAsync: async () => {},
  scheduleNotificationAsync: async ({ identifier, content }) => {
    const id = identifier ?? `anonima-${++semId}`;
    publicacoes.push({ id, titulo: content.title });
    bandeja.set(id, content.title);
    return id;
  },
  dismissNotificationAsync: async (id) => { bandeja.delete(id); },
};

const transcricoes = {};
const escritas = [];
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
    './notifications': { getNotifications: () => Notifications },
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
    './voice-operations': {
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
    console: { ...console, log() {}, warn: (...a) => process.env.DEBUG && console.warn(...a), error: (...a) => process.env.DEBUG && console.error(...a) },
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
const notif = carregar('lib/widget-voz-notificacoes.ts');
const { RECIBOS_VOZ } = carregar('lib/voz-recibos.ts');

/* O adaptador do botão do app (`VoiceEntryButton`): o primeiro recibo é um
   alerta na tela, não notificação. */
const alertas = [];
const reciboNaTela = {
  podeNotificar: async () => true,
  notificarRevisao: async (t) => { alertas.push(t); },
  notificarSucesso: async (d) => { alertas.push(d.titulo); },
  notificarFalha: async (c) => { alertas.push('falha ' + c); },
  notificarSalvoLocal: async () => { alertas.push(RECIBOS_VOZ.salvoLocal.titulo); },
  notificarPendenteOffline: async () => { alertas.push(RECIBOS_VOZ.pendenteOffline.titulo); },
};

const FALA = 'Mercado R$ 120 no débito.';
const guardadoTitulo = RECIBOS_VOZ.pendenteOffline.titulo;

async function gravarSemRede(requestId, source) {
  const origem = `file:///cache/${requestId}.m4a`;
  disco.set(origem, 'AUDIO');
  transcricoes[origem] = { ok: false, codigo: 'sem_rede' };
  transcricoes[`file:///files/voz-pendente/${requestId}.m4a`] = { ok: false, codigo: 'sem_rede' };
  const desfecho = await tarefa.executarTarefa(
    { caminho: origem, requestId, source },
    source === 'app' ? reciboNaTela : undefined
  );
  assert.equal(desfecho.guardada, true, `${source}: sem rede a fala fica guardada`);
}
const daFala = (requestId) => publicacoes.filter((p) => p.id === `voz-${requestId}`);

(async () => {
  /* ── 1. Gravada sem rede: um recibo de "guardado" só ────────────────── */
  await gravarSemRede('req-widget', 'widget');
  await gravarSemRede('req-app', 'app');
  assert.deepEqual(daFala('req-widget').map((p) => p.titulo), [guardadoTitulo], 'widget: um "Áudio guardado", com a identidade da fala');
  assert.deepEqual(alertas, [guardadoTitulo], 'app: o "Áudio guardado" é o alerta da tela, como sempre');
  assert.equal(publicacoes.some((p) => p.id.startsWith('anonima-')), false, 'nenhum recibo de voz sai sem identidade');
  ok('gravada sem rede: um recibo de "guardado" por fala, com a identidade dela');

  /* ── 2. Retomadas sem rede não publicam de novo (a causa dos dois) ──── */
  const antes = publicacoes.length;
  await tarefa.tentarVozesPendentes();
  await tarefa.tentarVozesPendentes();
  await tarefa.tentarVozesPendentes();
  assert.equal(publicacoes.length, antes, 'três retomadas sem rede não publicam nada');
  assert.deepEqual([...bandeja.values()], [guardadoTitulo], 'na bandeja, continua um "Áudio guardado" só');
  ok('retomadas sem rede não empilham "Áudio guardado"');

  /* ── 3. A rede volta: o "Salvo" SUBSTITUI o "guardado" ──────────────── */
  transcricoes['file:///files/voz-pendente/req-widget.m4a'] = { ok: true, transcript: FALA };
  transcricoes['file:///files/voz-pendente/req-app.m4a'] = { ok: true, transcript: FALA };
  const resumo = await tarefa.tentarVozesPendentes();
  assert.deepEqual({ ...resumo }, { restantes: 0 });
  assert.equal(escritas.length, 2, 'as duas falas foram gravadas, uma vez cada');
  assert.deepEqual(escritas.map((e) => [e.requestId, e.source]).sort(), [['req-app', 'app'], ['req-widget', 'widget']]);
  assert.deepEqual(escritas[0].payload, escritas[1].payload, 'app e widget gravam o mesmo lançamento (regra 13)');
  assert.equal(escritas[0].payload.amount, 120);
  const salvo = daFala('req-widget').at(-1).titulo;
  assert.equal(daFala('req-app').at(-1).titulo, salvo, 'o mesmo recibo de sucesso nas duas entradas');
  assert.equal(bandeja.size, 2, 'na bandeja, um recibo por fala');
  assert.equal(bandeja.get('voz-req-widget'), salvo, 'widget: o "Salvo" ficou no lugar do "Áudio guardado"');
  assert.equal(bandeja.get('voz-req-app'), salvo, 'app: o "Salvo" da retomada tem a identidade da fala');
  assert.equal([...bandeja.values()].includes(guardadoTitulo), false, 'nenhum "Áudio guardado" sobrou');
  ok('com a rede de volta, o "Salvo" substitui o "Áudio guardado", nas duas entradas');

  /* ── 4. Desfazer tira o "Salvo" da bandeja ─────────────────────────── */
  await notif.tirarDaBandeja('voz-req-widget');
  await notif.tirarDaBandeja('voz-req-app');
  assert.equal(bandeja.size, 0, 'depois do Desfazer, nada fica na bandeja');
  const resposta = fs.readFileSync(path.join(root, 'components/RespostaVozWidget.tsx'), 'utf8');
  const tratar = resposta.slice(resposta.indexOf("if (!dados || dados.origem !== 'voz') return;"), resposta.indexOf("if (dados.resultado === 'salvo')"));
  assert.match(tratar, /tirarDaBandeja\(resposta\.notification\.request\.identifier\)/,
    'o toque num recibo de voz (inclusive o Desfazer) tira ele da bandeja antes de tratar');
  ok('Desfazer (e qualquer toque num recibo de voz) tira o recibo da bandeja');

  /* ── 5. Falha ao tirar da bandeja não derruba nada ─────────────────── */
  Notifications.dismissNotificationAsync = async () => { throw new Error('sem serviço'); };
  await notif.tirarDaBandeja('voz-inexistente');
  ok('falha ao tirar da bandeja só deixa log');

  console.log(`\n${checagens} checagens da bandeja dos recibos de voz passaram — 0 falhas`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
