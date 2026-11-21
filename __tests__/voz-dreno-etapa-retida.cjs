/*
 * Dreno de voz não fica preso numa etapa ANTES do item (item 30, achado S5
 * do Sentinel, 10/11/2026).
 *
 *   node __tests__/voz-dreno-etapa-retida.cjs
 *
 * `tentarVozesPendentes` (falas guardadas) e `sincronizarOperacoesVoz`
 * (operações guardadas) entregam a MESMA passada a quem chama enquanto uma
 * está em curso. O item tem prazo próprio, mas as etapas anteriores a ele
 * não tinham: uma consulta de permissão, a adoção de falas do widget ou uma
 * leitura do AsyncStorage que nunca respondesse prendia a passada, e todo
 * disparo seguinte (abertura, os 30 s, "Tentar sincronizar") recebia a mesma
 * promessa pendurada, sem recibo, para sempre.
 *
 * Para cada etapa: segura a etapa, dispara de novo durante a passada, e
 * afirma (regra 9) que (a) os dois disparos recebem a mesma passada, sem
 * passe concorrente; (b) a passada termina com desfecho; (c) cada fala chega
 * ao banco UMA vez, inclusive depois que a etapa segurada responde tarde.
 * Falas do botão do app e do widget na mesma fila (regra 13).
 *
 * Módulos REAIS: `lib/widget-voz-task.ts`, `lib/widget-voz-pendentes.ts`,
 * `lib/voice-operations.ts`, `lib/voz-recibos-da-fila.ts` e o que eles
 * importam. Dublês: disco, AsyncStorage, transcrição, sessão, notificação e
 * a RPC `registrar_operacao_voz`. O relógio do sandbox é encurtado (ms/200):
 * os prazos de produção não mudam.
 */
require('./helpers/falha-com-duble-incompleto.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/* RAIZ_DO_MODULO: só para o RED de base, apontando para um `git archive` do HEAD anterior. */
const root = process.env.RAIZ_DO_MODULO || path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };

/* ── Etapas que o teste segura ──────────────────────────────────────────── */
/** nome -> { pendentes: [resolver], armada: boolean } */
const retidas = new Map();
function armar(nome) { retidas.set(nome, { armada: true, pendentes: [] }); }
/** Se a etapa está armada, a PRIMEIRA chamada fica pendurada até `soltar`. */
function talvezReter(nome, executar) {
  const r = retidas.get(nome);
  if (!r || !r.armada) return executar();
  r.armada = false;
  return new Promise((resolver) => r.pendentes.push(() => resolver(executar())));
}
function soltar(nome) {
  const r = retidas.get(nome);
  if (!r) return;
  r.armada = false;
  for (const p of r.pendentes.splice(0)) p();
}
const soltarTudo = () => { for (const nome of retidas.keys()) soltar(nome); };

/* ── Dublês ─────────────────────────────────────────────────────────────── */
const CHAVE_FILA = 'grana:queue:widget-voz-pendente-v1';
const armazem = new Map();
const AsyncStorage = {
  getItem: (k) => talvezReter(k === CHAVE_FILA ? 'leitura-fila' : (k.startsWith('grana:voz:operacao:') ? 'leitura-operacao' : '-'),
    async () => (armazem.has(k) ? armazem.get(k) : null)),
  setItem: async (k, v) => { armazem.set(k, v); },
  removeItem: async (k) => { armazem.delete(k); },
  getAllKeys: () => talvezReter('chaves', async () => [...armazem.keys()]),
  multiGet: async (ks) => ks.map((k) => [k, armazem.get(k) ?? null]),
};
const disco = new Map();
let orfasExistem = false;
/** Arquivos que o widget guardou em voz-orfa/ (só o caso da órfã os usa). */
const arquivosOrfas = new Set();
const PASTA_ORFA = 'file:///files/voz-orfa/';
const fsDuble = {
  documentDirectory: 'file:///files/',
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }) => { disco.set(to, disco.get(from)); },
  deleteAsync: async (uri) => { disco.delete(uri); arquivosOrfas.delete(uri); },
  getInfoAsync: async (uri) => ({ exists: (orfasExistem && /voz-orfa\/$/.test(uri)) || arquivosOrfas.has(uri) }),
  readAsStringAsync: async (uri) => {
    assert.ok(disco.has(uri), 'leitura de arquivo inexistente: ' + uri);
    return disco.get(uri);
  },
  readDirectoryAsync: () => talvezReter('adocao', async () => [...arquivosOrfas]
    .filter((uri) => uri.startsWith(PASTA_ORFA)).map((uri) => uri.slice(PASTA_ORFA.length))),
};

const chamadasRpc = [];
const operacoes = new Map();
function rpc(nome, args) {
  const executar = async () => {
    assert.equal(nome, 'registrar_operacao_voz');
    chamadasRpc.push({ requestId: args.p_request_id, source: args.p_source });
    if (!operacoes.has(args.p_request_id)) operacoes.set(args.p_request_id, ['tx-' + args.p_request_id]);
    return { data: { status: 'committed', operation_id: args.p_request_id, ids: operacoes.get(args.p_request_id), replayed: chamadasRpc.filter((c) => c.requestId === args.p_request_id).length > 1 }, error: null };
  };
  return { setHeader() { return this; }, abortSignal: () => executar() };
}

const transcricoes = {};
const erros = [];
const proibido = (nome) => async () => assert.fail('sem permissão (ou consulta pendurada), nada de notificação: ' + nome);
const notificacao = {
  podeNotificar: () => talvezReter('permissao', async () => false),
  notificarRevisao: proibido('notificarRevisao'),
  notificarSucesso: proibido('notificarSucesso'),
  notificarFalha: proibido('notificarFalha'),
  notificarSalvoLocal: proibido('notificarSalvoLocal'),
  notificarPendenteOffline: proibido('notificarPendenteOffline'),
  notificarProblemaServico: proibido('notificarProblemaServico'),
};

/* Relógio encurtado: 10 s de produção viram 50 ms aqui. */
const setTimeoutCurto = (fn, ms, ...a) => setTimeout(fn, Math.max(0, Math.ceil((ms ?? 0) / 200)), ...a);

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
    './offline-cache': { isLikelyNetworkError: (e) => /network/i.test(String(e?.message ?? e)) },
    './widget-voz-notificacoes': notificacao,
    './sessao-offline': { sessaoEstaTravada: () => false, idDoUsuarioLocal: async () => 'u-1', lerSessaoDoDisco: async () => ({}) },
    './voz': {
      transcreverAudio: async (uri) => {
        const r = transcricoes[uri];
        assert.ok(r, 'transcrição não preparada para ' + uri);
        return r;
      },
      mensagemDeErroVoz: (codigo) => ({ titulo: 'Erro ' + codigo, texto: 'Texto ' + codigo }),
    },
    './data': { fetchApelidosCategoria: async () => [], fetchCategories: async () => [], fetchCreditCards: async () => [] },
    './wallets': { fetchWallets: async () => [{ id: 'pessoal', name: 'Pessoal', is_default: true }] },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './supabase': { supabase: { rpc, auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: { user: { id: 'u-1' }, access_token: 't' } } }) } } },
    './widgets-home-sync': { sincronizarWidgetsHome: async () => {} },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './voz-retomada': { agendarVoz: async () => {}, reconciliarVozConcluida: async () => {} },
  };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    console: { ...console, log() {}, warn: (...a) => process.env.DEBUG && console.warn(...a), error: (...a) => { erros.push(a.map(String).join(' ')); if (process.env.DEBUG) console.error(...a); } },
    Promise, JSON, Object, Array, String, Number, Error, TypeError, RegExp, Set, Map, Math, Date,
    setTimeout: setTimeoutCurto, clearTimeout, AbortController,
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
const operacoesVoz = carregar('lib/voice-operations.ts');

/** Uma passada que não termina em 1,5 s REAIS (prazos de produção valem ~0,5 s aqui) ficou presa. */
function comLimite(promessa, oQue) {
  let corte;
  return Promise.race([
    promessa,
    new Promise((_, rejeitar) => { corte = setTimeout(() => rejeitar(new assert.AssertionError({ message: `${oQue}: a passada ficou presa na etapa segurada, sem desfecho` })), 1_500); }),
  ]).finally(() => clearTimeout(corte));
}
const tique = () => new Promise((r) => setTimeout(r, 120));
const rpcsDe = (requestId) => chamadasRpc.filter((c) => c.requestId === requestId).length;

async function guardarFala(requestId, source) {
  const origem = `file:///cache/${requestId}.m4a`;
  disco.set(origem, 'AUDIO');
  await fila.adicionarVozPendente({ caminho: origem, requestId, userId: 'u-1', source });
  transcricoes[`file:///files/voz-pendente/${requestId}.m4a`] = { ok: true, transcript: 'Mercado R$ 120 no débito.' };
}

const falhas = [];
async function caso(nome, corpo) {
  try { await corpo(); }
  catch (erro) { falhas.push(`${nome}: ${erro.message}`); console.log('  FALHOU  ' + nome + '\n          ' + erro.message); }
  finally {
    soltarTudo();
    orfasExistem = false;
    // Passada antiga (RED) termina antes do próximo caso, que precisa do trinco livre.
    await Promise.race([Promise.all([tarefa.tentarVozesPendentes(), operacoesVoz.sincronizarOperacoesVoz()]).catch(() => {}), tique().then(tique)]);
  }
}

/** Fala guardada: segura `etapa`, dispara duas vezes, exige desfecho e envio único. */
async function casoFalas(etapa, preparar) {
  const ids = [`${etapa}-app`, `${etapa}-widget`];
  await guardarFala(ids[0], 'app');
  await guardarFala(ids[1], 'widget');
  preparar?.();
  armar(etapa);
  const p1 = tarefa.tentarVozesPendentes();
  const p2 = tarefa.tentarVozesPendentes();
  assert.equal(p1, p2, 'segundo disparo durante a passada recebe a MESMA passada (sem passe concorrente)');
  const resumo = await comLimite(p1, etapa);
  assert.equal(typeof resumo.restantes, 'number', 'a passada devolve um resumo (recibo para a faixa)');
  assert.deepEqual({ ...tarefa.ultimoResumoDaFilaDeFalas() }, { ...resumo }, 'a faixa lê o desfecho desta passada');
  // Etapa responde tarde: a passada abandonada não pode enviar nada.
  const antesDeSoltar = chamadasRpc.length;
  soltar(etapa);
  await tique();
  assert.equal(chamadasRpc.length, antesDeSoltar, 'resposta tardia da etapa não dispara envio da passada abandonada');
  // Novo disparo: é uma passada nova e termina tudo, cada fala UMA vez.
  const p3 = tarefa.tentarVozesPendentes();
  assert.notEqual(p3, p1, 'depois do desfecho, o trinco foi liberado');
  assert.deepEqual({ ...(await comLimite(p3, etapa + ' (segundo passe)')) }, { restantes: 0 });
  for (const id of ids) assert.equal(rpcsDe(id), 1, `${id}: chegou ao banco exatamente uma vez`);
  assert.deepEqual((await fila.listarVozesPendentes()).map((i) => i.requestId).filter((id) => ids.includes(id)), []);
  return resumo;
}

(async () => {
  await caso('permissão de notificação pendurada', async () => {
    const resumo = await casoFalas('permissao');
    assert.deepEqual({ ...resumo }, { restantes: 0 }, 'sem resposta da permissão vale "não pode": recibo na tela e as falas sobem');
    ok('permissão de notificação pendurada: mesma passada, desfecho, cada fala uma vez (app e widget)');
  });

  await caso('adoção das falas do widget pendurada', async () => {
    const resumo = await casoFalas('adocao', () => { orfasExistem = true; });
    assert.deepEqual({ ...resumo }, { restantes: -1, motivo: 'erro' }, 'passada incompleta deixa recibo de erro, mesmo tendo subido as que já estavam na fila');
    assert.ok(erros.some((e) => /ado[cç][aã]o|adotar|órf/i.test(e)), 'e deixa log da etapa que não respondeu');
    ok('adoção pendurada: as falas da fila sobem, a passada termina com recibo de erro e log');
  });

  await caso('leitura da fila pendurada', async () => {
    const resumo = await casoFalas('leitura-fila');
    assert.deepEqual({ ...resumo }, { restantes: -1, motivo: 'erro' }, 'sem ler a fila, a passada termina com recibo de erro');
    ok('leitura da fila pendurada: desfecho de erro, sem envio; o passe seguinte sobe cada fala uma vez');
  });

  /* Antes era conferido pelo TEXTO da tarefa, em voz-recibos-paridade.cjs.
     Executado: a fala que o widget guardou sem entregar (V4) entra na fila
     ANTES da leitura, então sobe nesta mesma passada, uma vez. Se a leitura
     viesse antes da adoção, a fala só entraria na leitura final: resumo com
     1 restante e nenhum envio. */
  await caso('órfã do widget sobe na MESMA passada', async () => {
    const id = 'orfa-mesma-passada';
    const audio = PASTA_ORFA + id + '.m4a';
    const metadados = PASTA_ORFA + id + '.json';
    const agora = new Date();
    const hoje = [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
    disco.set(audio, 'AUDIO');
    disco.set(metadados, JSON.stringify({ userId: 'u-1', source: 'widget', capturadoEm: agora.getTime(), dataCaptura: hoje }));
    arquivosOrfas.add(audio);
    arquivosOrfas.add(metadados);
    orfasExistem = true;
    transcricoes['file:///files/voz-pendente/' + id + '.m4a'] = { ok: true, transcript: 'Mercado R$ 120 no débito.' };
    const resumo = await comLimite(tarefa.tentarVozesPendentes(), 'órfã');
    assert.equal(rpcsDe(id), 1, 'a fala adotada chega ao banco nesta mesma passada (adoção antes da leitura)');
    assert.deepEqual({ ...resumo }, { restantes: 0 }, 'e a passada termina sem restante');
    assert.equal(arquivosOrfas.size, 0, 'o áudio e o .json saem de voz-orfa/ depois da adoção');
    assert.deepEqual((await fila.listarVozesPendentes()).filter((i) => i.requestId === id), [], 'e a fala não fica na fila');
    ok('órfã do widget: adotada antes da leitura, sobe na mesma passada, uma vez');
  });

  for (const etapa of ['chaves', 'leitura-operacao']) {
    await caso(`fila de operações: ${etapa} pendurada`, async () => {
      const requestId = `op-${etapa}`;
      armazem.set(`grana:voz:operacao:u-1:${requestId}`, JSON.stringify({
        requestId, source: 'widget', transcricao: 'Mercado R$ 120',
        payload: { kind: 'transaction', type: 'out', description: 'Mercado', amount: 120, category: 'Alimentação', color: '#fff', occurred_on: '2026-11-20', payment_method: 'debit', wallet_id: 'pessoal' },
      }));
      armar(etapa);
      const p1 = operacoesVoz.sincronizarOperacoesVoz();
      const p2 = operacoesVoz.sincronizarOperacoesVoz();
      assert.equal(p1, p2, 'segundo disparo recebe a mesma sincronização');
      const r1 = await comLimite(p1, etapa);
      assert.equal(r1.sincronizadas, 0);
      assert.ok(r1.falhas >= 1 && typeof r1.mensagem === 'string', 'sincronização incompleta devolve falha com mensagem');
      soltar(etapa);
      await tique();
      assert.equal(rpcsDe(requestId), 0, 'resposta tardia não envia pela sincronização abandonada');
      const p3 = operacoesVoz.sincronizarOperacoesVoz();
      assert.notEqual(p3, p1, 'trinco liberado');
      const r3 = await comLimite(p3, etapa + ' (segundo passe)');
      assert.equal(r3.sincronizadas, 1);
      assert.equal(rpcsDe(requestId), 1, 'a operação chegou ao banco exatamente uma vez');
      assert.equal(armazem.has(`grana:voz:operacao:u-1:${requestId}`), false);
      ok(`fila de operações com ${etapa} pendurada: mesma passada, falha com mensagem, envio único depois`);
    });
  }

  if (falhas.length) {
    console.log(`\n${falhas.length} caso(s) falharam:\n- ${falhas.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`\nvoz-dreno-etapa-retida: ${checagens} checagens ok`);
  process.exit(0);
})().catch((erro) => { console.error(erro); process.exit(1); });
