/*
 * A tarefa da voz lê o desfecho no núcleo, nos quatro pontos de gravação e
 * nas duas entradas (achado C1 do Lynx, 30/09/2026; regra 13).
 *
 *   node __tests__/voz-desfecho-paridade.cjs
 *
 * Até o C1, `lib/widget-voz-task.ts` repetia à mão, em quatro lugares (conta,
 * transação, crédito parcelado e crédito à vista), a ordem pending → undone →
 * replayed que `desfechoDaOperacaoVoz` (lib/voice-operations.ts) decide para
 * as telas de revisão. A mesma decisão escrita duas vezes é a que diverge
 * primeiro. Agora a tarefa chama a função do núcleo, e este teste prova:
 *
 *  1. Efeito por resposta do servidor, 4 tipos × 2 entradas (app e widget):
 *     nova → um recibo de sucesso; replay → "Fala já lançada" e nenhum
 *     sucesso; pending (com ou sem replayed) → "salvo no aparelho"; undone
 *     (com ou sem replayed) → nada. Uma gravação por fala, nunca outra.
 *  2. Obediência: um espião envolve a função REAL e conta uma chamada por
 *     gravação, com o objeto devolvido pelo servidor. Forçado a responder
 *     'ja_lancada' ou 'desfeita' para uma gravação nova, a tarefa segue o
 *     núcleo nos quatro pontos. Uma tarefa com decisão própria falha aqui.
 *  3. O recibo que falha não provoca nova gravação.
 *  4. Fonte: a tarefa não lê `resultado.status` nem `.replayed`.
 *  5. Todo dublê de `./voice-operations` em __tests__/ traz a função real.
 *
 * Módulos REAIS: a tarefa, as heurísticas, a fila de falas e a
 * `desfechoDaOperacaoVoz` (por __tests__/desfecho-voz-real.cjs). Dublês:
 * disco, AsyncStorage, notificações e a gravação no servidor.
 */
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
const cartoes = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'pessoal' }];

/** O que o servidor devolve na próxima gravação, e o que a tarefa gravou. */
let respostaDoServidor = null;
const gravacoes = [];
/** O espião na decisão real: registra e, se pedido, força a resposta. */
let desfechoForcado = null;
const chamadasDoDesfecho = [];
const voiceOperations = {
  desfechoDaOperacaoVoz: (resultado) => {
    chamadasDoDesfecho.push(resultado);
    return desfechoForcado ?? desfechoReal(resultado);
  },
  registrarOperacaoVoz: async (requestId, source, payload) => {
    gravacoes.push({ requestId, source, kind: payload.kind });
    return respostaDoServidor;
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
    './offline-cache': { isLikelyNetworkError: () => false },
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

/** O recibo da tarefa: guarda o que foi publicado. */
function novoRecibo({ falhaAoAvisar = false } = {}) {
  const publicados = [];
  return {
    publicados,
    recibo: {
      podeNotificar: async () => true,
      notificarRevisao: async (titulo) => { publicados.push('revisao:' + titulo); },
      notificarSucesso: async () => { publicados.push('sucesso'); },
      notificarFalha: async (codigo) => {
        publicados.push('falha:' + codigo);
        if (falhaAoAvisar) throw new Error('canal indisponível (simulado)');
      },
      notificarSalvoLocal: async () => { publicados.push('salvo_local'); },
      notificarPendenteOffline: async () => { publicados.push('pendente_offline'); },
    },
  };
}

/* Os quatro pontos de gravação da tarefa. */
const FALAS = {
  conta: { fala: 'Conta de luz R$ 120 vence dia 10', kind: 'bill' },
  transacao: { fala: 'Mercado R$ 120 no débito.', kind: 'transaction' },
  parcelado: { fala: 'Mercado R$ 120 em 3x no crédito', kind: 'installment' },
  credito: { fala: 'Mercado R$ 120 no crédito', kind: 'transaction' },
};
const RESPOSTAS = {
  nova: { status: 'committed', replayed: false },
  replay: { status: 'committed', replayed: true },
  pendente: { status: 'pending', replayed: false },
  pendente_replayed: { status: 'pending', replayed: true },
  desfeita: { status: 'undone', replayed: false },
  desfeita_replayed: { status: 'undone', replayed: true },
};
const EFEITO_ESPERADO = {
  nova: ['sucesso'],
  replay: ['falha:ja_lancada'],
  pendente: ['salvo_local'],
  pendente_replayed: ['salvo_local'],
  desfeita: [],
  desfeita_replayed: [],
};

let seq = 0;
async function gravar(tipo, source, resposta, opcoes = {}) {
  const requestId = `req-${++seq}`;
  respostaDoServidor = { ...resposta, operationId: requestId, kind: FALAS[tipo].kind, ids: resposta.status === 'committed' && !resposta.replayed ? ['tx-' + requestId] : [] };
  const antesGravacoes = gravacoes.length;
  const antesDesfecho = chamadasDoDesfecho.length;
  const { publicados, recibo } = novoRecibo(opcoes);
  await tarefa.executarTarefa({ caminho: `file:///cache/${requestId}.m4a`, requestId, source, transcricao: FALAS[tipo].fala }, recibo);
  return {
    publicados,
    gravacoes: gravacoes.slice(antesGravacoes),
    desfechos: chamadasDoDesfecho.slice(antesDesfecho),
    resposta: respostaDoServidor,
  };
}

(async () => {
  /* ── 1. Efeito por resposta, 4 tipos × 2 entradas ──────────────────────── */
  const efeitos = {};
  for (const tipo of Object.keys(FALAS)) {
    for (const source of ['app', 'widget']) {
      for (const [nome, resposta] of Object.entries(RESPOSTAS)) {
        const r = await gravar(tipo, source, resposta);
        const rotulo = `${tipo}/${source}/${nome}`;
        assert.equal(r.gravacoes.length, 1, `${rotulo}: uma gravação`);
        assert.equal(r.gravacoes[0].kind, FALAS[tipo].kind, `${rotulo}: passou pelo ponto de ${FALAS[tipo].kind}`);
        assert.deepEqual(r.publicados, EFEITO_ESPERADO[nome], `${rotulo}: recibo`);
        /* A revisão (as três telas) lê a mesma função com a mesma resposta. */
        const daRevisao = desfechoReal(r.resposta);
        assert.equal(
          { nova: 'sucesso', ja_lancada: 'falha:ja_lancada', pendente: 'salvo_local', desfeita: undefined }[daRevisao],
          EFEITO_ESPERADO[nome][0],
          `${rotulo}: a revisão decide o mesmo (${daRevisao})`
        );
        efeitos[rotulo] = r.publicados;
      }
    }
  }
  for (const tipo of Object.keys(FALAS)) {
    for (const nome of Object.keys(RESPOSTAS)) {
      assert.deepEqual(efeitos[`${tipo}/app/${nome}`], efeitos[`${tipo}/widget/${nome}`], `${tipo}/${nome}: app e widget iguais`);
    }
  }
  ok('efeito por resposta do servidor: 4 tipos × 2 entradas × 6 respostas, uma gravação, app igual ao widget');

  /* ── 2. A tarefa obedece ao núcleo, nos quatro pontos ──────────────────── */
  for (const tipo of Object.keys(FALAS)) {
    for (const source of ['app', 'widget']) {
      const rotulo = `${tipo}/${source}`;
      const normal = await gravar(tipo, source, RESPOSTAS.nova);
      assert.equal(normal.desfechos.length, 1, `${rotulo}: o núcleo decide uma vez por gravação`);
      assert.equal(normal.desfechos[0], normal.resposta, `${rotulo}: com o objeto que o servidor devolveu`);

      desfechoForcado = 'ja_lancada';
      const forcadoJa = await gravar(tipo, source, RESPOSTAS.nova);
      desfechoForcado = 'desfeita';
      const forcadoDesfeita = await gravar(tipo, source, RESPOSTAS.nova);
      desfechoForcado = null;
      assert.deepEqual(forcadoJa.publicados, ['falha:ja_lancada'], `${rotulo}: o núcleo diz "já lançada" e a tarefa segue`);
      assert.deepEqual(forcadoDesfeita.publicados, [], `${rotulo}: o núcleo diz "desfeita" e a tarefa segue`);
    }
  }
  ok('obediência: nos 4 pontos e nas 2 entradas, a tarefa chama o núcleo uma vez e segue o que ele decide');

  /* ── 3. Recibo que falha não grava de novo ─────────────────────────────── */
  for (const tipo of Object.keys(FALAS)) {
    for (const source of ['app', 'widget']) {
      const r = await gravar(tipo, source, RESPOSTAS.replay, { falhaAoAvisar: true });
      assert.equal(r.gravacoes.length, 1, `${tipo}/${source}: nenhuma nova tentativa`);
      assert.ok(!r.publicados.includes('sucesso'), `${tipo}/${source}: nenhum recibo de sucesso`);
    }
  }
  ok('replay com recibo que falha: uma gravação só e nenhum sucesso, nos 4 pontos e nas 2 entradas');

  /* ── 4. Fonte: nenhuma decisão própria sobre o resultado ──────────────── */
  {
    const fonte = ler('lib/widget-voz-task.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(fonte, /\bresultado\s*\??\.\s*status\b/, 'a tarefa não lê resultado.status');
    assert.doesNotMatch(fonte, /\.\s*replayed\b/, 'a tarefa não lê .replayed');
    assert.equal((fonte.match(/desfechoDaOperacaoVoz\(resultado\)/g) ?? []).length, 4, 'os quatro pontos chamam o núcleo');
  }
  ok('fonte: a tarefa não lê resultado.status nem .replayed; os quatro pontos chamam desfechoDaOperacaoVoz');

  /* ── 5. Todo dublê de ./voice-operations traz a função real ────────────── */
  {
    const sem = [];
    for (const nome of fs.readdirSync(__dirname)) {
      if (!/\.(c?js|ts)$/.test(nome)) continue;
      const texto = fs.readFileSync(path.join(__dirname, nome), 'utf8');
      for (const m of texto.matchAll(/['"]\.\/voice-operations['"]\s*:\s*/g)) {
        const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 200);
        if (!/desfechoDaOperacaoVoz/.test(depois) && !/^voiceOperations\b/.test(depois)) sem.push(nome);
      }
    }
    assert.deepEqual(sem, [], 'dublês de ./voice-operations sem desfechoDaOperacaoVoz: ' + sem.join(', '));
  }
  ok('todo dublê de ./voice-operations em __tests__/ traz a desfechoDaOperacaoVoz real');

  console.log(`\n${checagens} checagens de desfecho da voz passaram — 0 falhas`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
