/*
 * O widget de voz em segundo plano, com o app FECHADO (07/10/2026).
 *
 *   node __tests__/widget-voz-segundo-plano.cjs
 *
 * Pedido do autor: "Verifica a parte que roda em segundo plano. Não quero que
 * o app abra no lançamento por widget." e "Eu preciso que a voz esteja 100%".
 *
 * O que este arquivo prova, com os módulos REAIS (`lib/widget-voz-task.ts`,
 * `widget-voz-pendentes`, `voz-recibos-da-fila`, `voz-recibos`, heurísticas,
 * `data-da-fala`, `voz-confiabilidade`, e, nas seções 8 e 9,
 * `voice-operations` e `sessao-offline`):
 *
 *  1. Tarefa morta no meio (o Android mata a tarefa headless aos 120 s, ou
 *     mata o processo): a fala JÁ está reservada na fila, com o áudio copiado,
 *     e a próxima abertura do app a lança com o MESMO requestId e a data em
 *     que foi dita. Antes, o áudio ficava no cache sem ninguém apontando para
 *     ele e a fala se perdia em silêncio.
 *  2. Enquanto a tarefa roda, a retomada do app aberto não processa a mesma
 *     fala de novo (reserva com prazo).
 *  3. Saída normal não deixa resto: fila vazia e nenhum áudio no aparelho.
 *  4. Todo caminho de falha deixa recibo, e nenhum `await` do caminho de
 *     falha derruba a tarefa nem apaga o áudio.
 *  5. Prazo total da tarefa menor que o teto do Android, com folga.
 *  6. A gravação e a consulta de sessão têm prazo de verdade, mesmo com a
 *     renovação do token pendurada.
 *  7. Fila ilegível deixa log e cópia, em vez de virar fila vazia calada.
 *
 * Dublês: disco, AsyncStorage, transcrição, banco, notificação e o módulo
 * nativo do widget. Relógio falso e `setTimeout` encurtado: os prazos de
 * produção não mudam. Afirma QUAIS escritas aconteceram (regra 9), nas duas
 * entradas, botão do app e widget (regra 13).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };
const CHAVE_FILA = 'grana:queue:widget-voz-pendente-v1';
/* SECAO=6 roda só a seção 6 (para ver cada defeito falhar sozinho). */
const rodar = (n) => !process.env.SECAO || Number(process.env.SECAO) === n;

/* ── Estado compartilhado entre "processos" (o aparelho) ─────────────────── */
const armazem = new Map();
const disco = new Map();
let avancoDoRelogio = 0;
let escala = 1; // divisor do setTimeout: 1000 faz 100 s virarem 100 ms
const ctl = {};
function zerarControles() {
  Object.assign(ctl, {
    transcrever: async () => ({ ok: true, transcript: 'Mercado R$ 120 no débito.' }),
    podeNotificar: true,
    usuario: 'u-1',
    sessaoNoDisco: true,
    falharNotificacao: new Set(),
    pendurarNotificacao: new Set(), // recibos que nunca respondem
    falharEscritaDaFilaApos: Infinity, // nº de escritas da fila que dão certo antes de falhar
    registrar: null, // (requestId, source, payload) => resultado; null = committed
    cartoes: [],
  });
}
zerarControles();
let escritasDaFila = 0;

const AsyncStorage = {
  getItem: async (k) => (armazem.has(k) ? armazem.get(k) : null),
  setItem: async (k, v) => {
    if (k === CHAVE_FILA && ++escritasDaFila > ctl.falharEscritaDaFilaApos) throw new Error('disco cheio (simulado)');
    armazem.set(k, v);
  },
  removeItem: async (k) => { armazem.delete(k); },
  getAllKeys: async () => [...armazem.keys()],
  multiGet: async (ks) => ks.map((k) => [k, armazem.get(k) ?? null]),
};
const fsDuble = {
  documentDirectory: 'file:///files/',
  makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }) => {
    if (!disco.has(from)) throw new Error('arquivo de origem não existe: ' + from);
    disco.set(to, disco.get(from));
  },
  deleteAsync: async (uri) => { disco.delete(uri); },
  getInfoAsync: async (uri) => ({ exists: disco.has(uri) || [...disco.keys()].some((k) => k.startsWith(uri)) }),
  readDirectoryAsync: async (pasta) => [...disco.keys()].filter((k) => k.startsWith(pasta)).map((k) => k.slice(pasta.length)),
  writeAsStringAsync: async (uri, texto) => { disco.set(uri, texto); },
  readAsStringAsync: async (uri) => { if (!disco.has(uri)) throw new Error('arquivo não existe: ' + uri); return disco.get(uri); },
};

class DataFalsa extends Date {
  constructor(...args) { if (args.length) super(...args); else super(Date.now() + avancoDoRelogio); }
  static now() { return Date.now() + avancoDoRelogio; }
}

/* Um "processo" do app: módulos carregados do zero, mesmo aparelho. */
function novoProcesso({ operacoesReais = false, sessaoReal = false, supabase: supabaseDuble } = {}) {
  const p = { chamadasTranscricao: [], escritas: [], recibos: [], estados: [], erros: [], avisos: [] };
  const notificar = (nome) => async (...args) => {
    if (ctl.falharNotificacao.has(nome)) throw new Error('notificação falhou (simulado): ' + nome);
    if (ctl.pendurarNotificacao.has(nome)) return new Promise(() => {});
    p.recibos.push({ nome, args });
  };
  const cache = new Map();
  const dubles = {
    'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask() {} } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    'expo-file-system/legacy': fsDuble,
    '@/modules/grana-voice-widget': { definirEstado: (e) => { p.estados.push(e); } },
    './offline-cache': { isLikelyNetworkError: (e) => /network request failed|failed to fetch/i.test(String(e?.message ?? e)) },
    './widget-voz-notificacoes': {
      podeNotificar: async () => ctl.podeNotificar,
      notificarRevisao: notificar('notificarRevisao'),
      notificarSucesso: notificar('notificarSucesso'),
      notificarFalha: notificar('notificarFalha'),
      notificarSalvoLocal: notificar('notificarSalvoLocal'),
      notificarPendenteOffline: notificar('notificarPendenteOffline'),
    },
    './voz': {
      transcreverAudio: async (uri) => { p.chamadasTranscricao.push(uri); return ctl.transcrever(uri); },
      mensagemDeErroVoz: (codigo) => ({ titulo: 'Erro ' + codigo, texto: 'Texto ' + codigo }),
    },
    './data': { fetchCategories: async () => [], fetchCreditCards: async () => ctl.cartoes },
    './wallets': { fetchWallets: async () => [{ id: 'pessoal', name: 'Pessoal', is_default: true }] },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './supabase': supabaseDuble ?? { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } },
    './widgets-home-sync': { sincronizarWidgetsHome: async () => {} },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './cache-de-tela': { lancamentoGravado() {} },
    './fila-pendente': { ITENS_POR_RODADA: 20, ehErroPermanente: (e) => /^(22|23|42501)/.test(String(e?.code ?? '')) },
  };
  if (!sessaoReal) {
    dubles['./sessao-offline'] = {
      idDoUsuarioLocal: async () => ctl.usuario,
      lerSessaoDoDisco: async () => (ctl.sessaoNoDisco ? { user: { id: ctl.usuario } } : null),
    };
  }
  if (!operacoesReais) {
    dubles['./voice-operations'] = {
      desfechoDaOperacaoVoz: require('./desfecho-voz-real.cjs'),
      desfechoDoErroVoz: () => null,
      registrarOperacaoVoz: async (requestId, source, payload) => {
        if (ctl.registrar) return ctl.registrar(requestId, source, payload);
        p.escritas.push({ requestId, source, payload: JSON.parse(JSON.stringify(payload)) });
        return { status: 'committed', ids: ['tx-' + requestId], operationId: 'op-' + requestId, kind: payload.kind };
      },
      ehRecusaCartaoObrigatorio: () => false,
    };
  }
  function carregar(arquivo) {
    /* Uma instância por módulo, seja qual for a barra do caminho. No Windows
       `path.join` devolve "lib\x.ts" e a chamada direta usa "lib/x.ts": eram
       duas cópias do mesmo módulo, e a fila que o teste lia não era a mesma
       instância (nem a mesma vez de mutação) que a tarefa usava. */
    arquivo = arquivo.split(path.sep).join('/');
    if (cache.has(arquivo)) return cache.get(arquivo);
    const exports = {};
    cache.set(arquivo, exports);
    const js = ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(js, {
      exports,
      console: { ...console, log() {},
        warn: (...a) => { p.avisos.push(a); if (process.env.DEBUG) console.warn(...a); },
        error: (...a) => { p.erros.push(a); if (process.env.DEBUG) console.error(...a); } },
      Promise, JSON, Object, Array, String, Number, Error, TypeError, RegExp, Set, Map, Math, AbortController,
      Date: DataFalsa,
      setTimeout: (fn, ms, ...r) => setTimeout(fn, Math.max(0, ms / escala), ...r),
      clearTimeout,
      require(id) {
        if (id in dubles) return dubles[id];
        if (id.startsWith('./')) return carregar(path.join(path.dirname(arquivo), id.slice(2) + '.ts'));
        throw new Error(`import não simulado em ${arquivo}: ${id}`);
      },
    }, { filename: arquivo });
    return exports;
  }
  p.carregar = carregar;
  p.tarefa = carregar('lib/widget-voz-task.ts');
  p.fila = carregar('lib/widget-voz-pendentes.ts');
  /* Os módulos que a tarefa importa no meio do caminho são carregados JÁ.
     Transpilar leva dezenas de milissegundos de relógio real, que o
     `setTimeout` encurtado não encolhe: sem isto, com 100 s virando 100 ms,
     a ordem entre o prazo total e o teto de ponta a ponta dependeria da
     velocidade do disco de quem roda o teste. */
  for (const modulo of ['heuristics', 'voz-confiabilidade', 'voz-recibos', 'voz-recibos-da-fila']) carregar(`lib/${modulo}.ts`);
  p.recibosDe = (nome) => p.recibos.filter((r) => r.nome === nome);
  return p;
}

const filaBruta = () => JSON.parse(armazem.get(CHAVE_FILA) ?? '[]');
const audios = () => [...disco.keys()].sort();
const tique = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const comLimite = (promessa, ms, nome) => Promise.race([
  promessa,
  new Promise((_, rej) => setTimeout(() => rej(new Error('PENDUROU: ' + nome)), ms)),
]);
function limparAparelho() {
  armazem.clear(); disco.clear(); avancoDoRelogio = 0; escala = 1; escritasDaFila = 0; zerarControles();
}
/** Como o Kotlin entrega a fala: caminho absoluto do cache, sem `file://`. */
function falaNova(id, source, extras = {}) {
  const caminho = `/cache/voz-${id}.m4a`;
  disco.set('file://' + caminho, 'AUDIO-' + id);
  return { caminho, requestId: id, source, capturadoEm: Date.parse('2026-10-06T23:50:00-03:00'), dataCaptura: '2026-10-06', ...extras };
}

(async () => {
  /* ── 1. Tarefa morta no meio: a fala sobrevive e sobe depois ─────────────── */
  if (rodar(1)) for (const source of ['widget', 'app']) {
    limparAparelho();
    const morto = novoProcesso();
    ctl.transcrever = () => new Promise(() => {}); // a transcrição nunca volta: o processo vai morrer
    morto.tarefa.executarTarefa(falaNova('morta-' + source, source)).catch(() => {});
    await tique();

    const reservada = filaBruta();
    assert.equal(reservada.length, 1, `[${source}] a fala entrou na fila ANTES da transcrição`);
    assert.equal(reservada[0].requestId, 'morta-' + source);
    assert.equal(reservada[0].caminho, `file:///files/voz-pendente/morta-${source}.m4a`);
    assert.equal(reservada[0].userId, 'u-1');
    assert.equal(reservada[0].source, source);
    assert.equal(reservada[0].dataCaptura, '2026-10-06', 'a data da captura vai junto');
    assert.equal(disco.get(reservada[0].caminho), 'AUDIO-morta-' + source, 'o áudio foi copiado para a pasta da fila');
    ok(`[${source}] fala reservada na fila, com áudio e data, antes de qualquer rede`);

    /* App aberto retomando a fila enquanto a tarefa ainda roda: não mexe nela. */
    assert.deepEqual((await morto.fila.listarVozesPendentes()).map((i) => i.requestId), [], 'reserva em andamento não é listada');
    const antes = morto.chamadasTranscricao.length;
    const resumoDurante = await morto.tarefa.tentarVozesPendentes();
    assert.equal(morto.chamadasTranscricao.length, antes, 'a retomada não transcreveu a fala em andamento');
    assert.equal(resumoDurante.restantes, 0, 'a faixa não acusa fala guardada enquanto a tarefa roda');
    ok(`[${source}] a retomada do app aberto não processa a fala em andamento`);

    /* O Android matou o processo. Dia seguinte, a pessoa abre o app. */
    avancoDoRelogio = 10 * 60 * 60 * 1000; // 23h50 + 10h = 09h50 do dia 07
    const novo = novoProcesso();
    ctl.transcrever = async () => ({ ok: true, transcript: 'Mercado R$ 120 no débito.' });
    const resumo = await novo.tarefa.tentarVozesPendentes();
    assert.equal(novo.escritas.length, 1, 'a fala abandonada foi lançada na abertura seguinte');
    assert.equal(novo.escritas[0].requestId, 'morta-' + source, 'com o MESMO requestId (idempotência do servidor)');
    assert.equal(novo.escritas[0].source, source);
    assert.equal(novo.escritas[0].payload.amount, 120);
    assert.equal(novo.escritas[0].payload.occurred_on, '2026-10-06', 'com a data em que foi dita, não a do dia seguinte');
    assert.deepEqual(filaBruta(), [], 'saiu da fila');
    assert.deepEqual(audios(), [], 'nenhum áudio sobrou: nem a cópia da fila, nem o original do cache');
    assert.equal(resumo.restantes, 0);
    assert.equal(novo.recibosDe('notificarSucesso').length, 1, 'com recibo de sucesso');
    ok(`[${source}] fala de tarefa morta é lançada na abertura seguinte, uma vez, com a data da fala`);
  }

  /* ── 2. A reserva vence: só depois do teto do Android a fala fica retomável ─ */
  if (rodar(2)) {
    limparAparelho();
    const p = novoProcesso();
    ctl.transcrever = () => new Promise(() => {});
    p.tarefa.executarTarefa(falaNova('prazo', 'widget')).catch(() => {});
    await tique();
    assert.ok(p.fila.PRAZO_RESERVA_MS > 120_000, 'a reserva dura mais que os 120 s do Android');
    avancoDoRelogio = p.fila.PRAZO_RESERVA_MS - 1_000;
    assert.equal((await p.fila.listarVozesPendentes()).length, 0, 'um segundo antes de vencer, ainda reservada');
    avancoDoRelogio = p.fila.PRAZO_RESERVA_MS + 1_000;
    assert.equal((await p.fila.listarVozesPendentes()).length, 1, 'vencida a reserva, a fala é retomável');
    ok('a reserva dura mais que o teto do Android e vence sozinha');
  }

  /* ── 3. Saída normal não deixa resto, nas duas entradas ──────────────────── */
  if (rodar(3)) for (const source of ['widget', 'app']) {
    limparAparelho();
    const p = novoProcesso();
    const desfecho = await p.tarefa.executarTarefa(falaNova('ok-' + source, source));
    assert.deepEqual({ ...desfecho }, { guardada: false });
    assert.equal(p.escritas.length, 1);
    assert.equal(p.escritas[0].requestId, 'ok-' + source);
    assert.deepEqual(filaBruta(), [], 'a reserva foi desfeita');
    assert.deepEqual(audios(), [], 'nenhum áudio financeiro ficou no aparelho');
    assert.equal(p.recibosDe('notificarSucesso').length, 1);
    if (source === 'widget') assert.equal(p.estados.at(-1), 'ocioso');
    ok(`[${source}] sucesso: lança uma vez, fila vazia, nenhum áudio guardado`);
  }

  /* ── 4. Recibo em cada saída ─────────────────────────────────────────────── */
  if (rodar(4)) for (const source of ['widget', 'app']) {
    // 4a. Não entendi, fala nova: descartada com aviso (a pessoa está ali e repete).
    limparAparelho();
    let p = novoProcesso();
    ctl.transcrever = async () => ({ ok: false, codigo: 'nao_entendi' });
    await p.tarefa.executarTarefa(falaNova('ne-' + source, source));
    assert.deepEqual(p.recibosDe('notificarFalha').map((r) => r.args[0]), ['nao_entendi']);
    assert.deepEqual(filaBruta(), []);
    assert.deepEqual(audios(), []);
    assert.equal(p.escritas.length, 0);
    if (source === 'widget') assert.equal(p.estados.at(-1), 'atencao');
    ok(`[${source}] "não entendi": recibo, nada lançado, nada guardado`);

    // 4b. Sem rede: guardada, visível na fila na hora, um recibo.
    limparAparelho();
    p = novoProcesso();
    ctl.transcrever = async () => ({ ok: false, codigo: 'sem_rede' });
    let d = await p.tarefa.executarTarefa(falaNova('sr-' + source, source));
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'sem_rede' });
    assert.deepEqual((await p.fila.listarVozesPendentes()).map((i) => i.requestId), ['sr-' + source], 'visível na fila na hora, sem esperar a reserva vencer');
    assert.deepEqual(audios(), [`file:///files/voz-pendente/sr-${source}.m4a`], 'só a cópia da fila; o original do cache saiu');
    assert.equal(p.recibosDe('notificarPendenteOffline').length, 1);
    assert.equal(p.escritas.length, 0);
    if (source === 'widget') assert.equal(p.estados.at(-1), 'atencao');
    // A rede volta: sobe com o mesmo id e a data da fala.
    ctl.transcrever = async () => ({ ok: true, transcript: 'Mercado R$ 120 no débito.' });
    await p.tarefa.tentarVozesPendentes();
    assert.equal(p.escritas.length, 1);
    assert.equal(p.escritas[0].requestId, 'sr-' + source);
    assert.equal(p.escritas[0].payload.occurred_on, '2026-10-06');
    assert.deepEqual(filaBruta(), []);
    assert.deepEqual(audios(), []);
    ok(`[${source}] sem rede: guardada com recibo, sobe depois com o mesmo id e a data da fala`);

    // 4c. Token vencido com sessão no aparelho: espera na fila; sem sessão nenhuma: aviso.
    limparAparelho();
    p = novoProcesso();
    ctl.transcrever = async () => ({ ok: false, codigo: 'nao_autenticado' });
    d = await p.tarefa.executarTarefa(falaNova('tk-' + source, source));
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'sessao' }, 'token vencido com sessão no disco é espera, não descarte');
    assert.equal(audios().length, 1);
    limparAparelho();
    p = novoProcesso();
    ctl.sessaoNoDisco = false; ctl.usuario = null;
    ctl.transcrever = async () => ({ ok: false, codigo: 'sem_sessao' });
    d = await p.tarefa.executarTarefa(falaNova('ss-' + source, source));
    assert.deepEqual({ ...d }, { guardada: false });
    assert.deepEqual(p.recibosDe('notificarFalha').map((r) => r.args[0]), ['sem_sessao']);
    assert.deepEqual(audios(), [], 'sem conta no aparelho a gravação não é guardada');
    ok(`[${source}] sessão: token vencido espera na fila; sem conta, recibo "entre de novo"`);

    // 4d. Recusa permanente do servidor: revisão com a fala, nada gravado.
    limparAparelho();
    p = novoProcesso();
    ctl.registrar = async () => { throw Object.assign(new Error('violates check'), { code: '23514' }); };
    await p.tarefa.executarTarefa(falaNova('rp-' + source, source));
    assert.deepEqual(p.recibosDe('notificarRevisao').map((r) => r.args[0]), ['Não consegui salvar']);
    assert.match(p.recibosDe('notificarRevisao')[0].args[1], /Mercado/);
    if (source === 'widget') assert.equal(p.estados.at(-1), 'atencao');
    ok(`[${source}] recusa do servidor: revisão com o que foi ouvido`);

    // 4e. Confirmação necessária: revisão, com a data da captura, sem gravar.
    limparAparelho();
    p = novoProcesso();
    ctl.cartoes = [{ id: 'c1', name: 'Nubank', bank: 'Nubank', closing_day: 5 }, { id: 'c2', name: 'C6', bank: 'C6 Bank', closing_day: 10 }];
    ctl.transcrever = async () => ({ ok: true, transcript: 'Uber 30 reais no crédito.' });
    d = await p.tarefa.executarTarefa(falaNova('cf-' + source, source));
    assert.deepEqual({ ...d }, { guardada: false });
    assert.equal(p.escritas.length, 0, 'nada gravado por conta própria');
    const revisao = p.recibosDe('notificarRevisao');
    assert.equal(revisao.length, 1);
    assert.equal(revisao[0].args[0], 'Qual cartão?');
    assert.equal(revisao[0].args[2], 'cf-' + source, 'o recibo é o desta fala');
    assert.equal(revisao[0].args[3]?.referencia, '2026-10-06', 'a revisão leva a data em que a fala foi dita');
    if (source === 'widget') assert.equal(p.estados.at(-1), 'atencao');
    ok(`[${source}] confirmação: pergunta "Qual cartão?", com a data da fala, sem gravar`);
  }
  {
    // 4f. Sem permissão de notificação (só o widget depende dela): não lança, guarda, acende atenção.
    limparAparelho();
    const p = novoProcesso();
    ctl.podeNotificar = false;
    const d = await p.tarefa.executarTarefa(falaNova('sn', 'widget'));
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'sem_notificacao' });
    assert.equal(p.chamadasTranscricao.length, 0, 'não gasta transcrição');
    assert.equal(p.escritas.length, 0);
    assert.deepEqual((await p.fila.listarVozesPendentes()).map((i) => i.requestId), ['sn']);
    assert.equal(p.estados.at(-1), 'atencao');
    ok('[widget] sem permissão de notificação: não lança, guarda a fala e acende atenção');
  }
  {
    // 4g. A tarefa nunca abre o app à força: o módulo não conhece navegação.
    const fonte = fs.readFileSync(path.join(root, 'lib/widget-voz-task.ts'), 'utf8');
    assert.doesNotMatch(fonte, /\bLinking\b|expo-linking|expo-router|startActivity|openURL/);
    ok('a tarefa não importa navegação nem abre o app');
  }

  /* ── 5. Nenhum await do caminho de falha derruba a tarefa nem apaga o áudio ─ */
  if (rodar(5)) {
    // 5a. A fila não pôde ser regravada no caminho "sem rede": a fala continua reservada.
    limparAparelho();
    const p = novoProcesso();
    ctl.transcrever = async () => ({ ok: false, codigo: 'sem_rede' });
    ctl.falharEscritaDaFilaApos = 1; // a reserva grava; a regravação falha
    const d = await p.tarefa.executarTarefa(falaNova('disco', 'widget'));
    assert.equal(d.guardada, true, 'a fala continua guardada');
    assert.equal(filaBruta().length, 1, 'o item da reserva continua na fila');
    assert.equal(disco.get('file:///files/voz-pendente/disco.m4a'), 'AUDIO-disco', 'o áudio não foi apagado');
    assert.equal(p.estados.at(-1), 'atencao');
    assert.ok(p.erros.length > 0, 'a falha deixou log');
    ok('falha ao regravar a fila no caminho de falha não apaga o áudio nem derruba a tarefa');

    // 5b. O recibo "entre de novo" falha: a tarefa termina, em atenção.
    limparAparelho();
    const q = novoProcesso();
    ctl.usuario = null; ctl.sessaoNoDisco = false;
    ctl.transcrever = async () => { throw new TypeError('Network request failed'); };
    ctl.falharNotificacao = new Set(['notificarFalha']);
    await q.tarefa.executarTarefa(falaNova('sem-dono', 'widget'));
    assert.equal(q.estados.at(-1), 'atencao', 'o estado de atenção é o recibo mínimo');
    ok('recibo que falha no caminho "sem conta" não derruba a tarefa');

    // 5c. A limpeza do fim falha: o widget não fica preso em "Lançando…".
    limparAparelho();
    const r = novoProcesso();
    ctl.falharEscritaDaFilaApos = 1; // a reserva grava; desfazer a reserva falha
    await r.tarefa.executarTarefa(falaNova('limpeza', 'widget'));
    assert.equal(r.escritas.length, 1, 'o lançamento foi gravado');
    assert.equal(r.estados.at(-1), 'ocioso', 'o estado final é definido mesmo com a limpeza falhando');
    assert.ok(r.erros.length > 0, 'a falha da limpeza deixou log');
    ok('falha na limpeza final não prende o widget em "Lançando…"');
  }

  /* ── 6. Prazo total da tarefa cabe no teto do Android ────────────────────── */
  if (rodar(6)) {
    limparAparelho();
    const p = novoProcesso();
    const kotlin = fs.readFileSync(path.join(root, 'modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget/GranaVoiceHeadlessService.kt'), 'utf8');
    const tetoAndroid = Number(/"GranaVoiceTask",[\s\S]*?(\d[\d_]*),/.exec(kotlin)[1].replace(/_/g, ''));
    assert.equal(tetoAndroid, 120_000, 'o teto da tarefa headless continua 120 s');
    assert.ok(Number.isFinite(p.tarefa.PRAZO_TOTAL_TAREFA_MS), 'existe um prazo total da tarefa');
    assert.ok(tetoAndroid - p.tarefa.PRAZO_TOTAL_TAREFA_MS >= 15_000, 'sobram pelo menos 15 s para guardar, notificar e limpar');

    /* 200, e não 1000: entre o prazo total (100 s) e o teto de ponta a ponta
       (112 s) sobram 60 ms de relógio real, folga para máquina lenta. */
    escala = 200; // 100 s viram 500 ms
    ctl.transcrever = () => new Promise(() => {}); // rede pendurada para sempre
    const d = await comLimite(p.tarefa.executarTarefa(falaNova('lenta', 'widget')), 4000, 'tarefa sem prazo total');
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'demorou' });
    assert.deepEqual((await p.fila.listarVozesPendentes()).map((i) => i.requestId), ['lenta'], 'a fala ficou na fila, retomável');
    assert.equal(p.recibosDe('notificarPendenteOffline').length, 1, 'com recibo de fala guardada');
    assert.equal(p.estados.at(-1), 'atencao');
    assert.equal(audios().length, 1);
    ok('a tarefa tem prazo total menor que o teto do Android: estourou, guarda e avisa');
  }

  /* ── 7. Fila ilegível: log e cópia, nunca fila vazia calada ──────────────── */
  if (rodar(7)) {
    limparAparelho();
    const p = novoProcesso();
    armazem.set(CHAVE_FILA, '[{"requestId":"x","caminho":"file:///files/voz-pendente/x.m4a"');
    assert.equal((await p.fila.listarVozesPendentes()).length, 0);
    assert.ok(p.erros.some((e) => /ileg[ií]vel/i.test(String(e[0]))), 'fila ilegível deixa log de erro');
    const copia = [...armazem.keys()].find((k) => k.startsWith(CHAVE_FILA + ':ilegivel'));
    assert.ok(copia, 'o conteúdo ilegível foi preservado em outra chave');
    assert.match(armazem.get(copia), /"requestId":"x"/);
    disco.set('file:///cache/voz-nova.m4a', 'AUDIO');
    await p.fila.adicionarVozPendente({ caminho: '/cache/voz-nova.m4a', requestId: 'nova', userId: 'u-1', source: 'widget' });
    assert.match(armazem.get(copia), /"requestId":"x"/, 'gravar por cima não destrói a cópia');
    ok('fila ilegível deixa log e é preservada antes de ser sobrescrita');
  }

  /* ── 8. Troca de conta: a fala de uma conta não sobe na outra ────────────── */
  if (rodar(8)) {
    limparAparelho();
    const a = novoProcesso();
    ctl.transcrever = async () => ({ ok: false, codigo: 'sem_rede' });
    await a.tarefa.executarTarefa(falaNova('conta-a', 'widget'));
    ctl.usuario = 'u-2';
    ctl.transcrever = async () => ({ ok: true, transcript: 'Mercado R$ 120 no débito.' });
    const b = novoProcesso();
    await b.tarefa.tentarVozesPendentes();
    assert.equal(b.escritas.length, 0, 'a outra conta não lança a fala');
    assert.deepEqual(filaBruta().map((i) => [i.requestId, i.userId]), [['conta-a', 'u-1']], 'a fala continua com o dono');
    ok('troca de conta: a fala guardada não é lançada na conta seguinte');
  }

  /* ── 9. A gravação tem prazo de verdade, mesmo com o token pendurado ─────── */
  if (rodar(9)) {
    limparAparelho();
    escala = 1000; // 15 s viram 15 ms
    let chamadasRpc = 0;
    const penduradoParaSempre = { abortSignal() { return new Promise(() => {}); } };
    const p = novoProcesso({ operacoesReais: true, supabase: { supabase: {
      auth: { getUser: async () => ({ data: { user: null } }) },
      // O cliente espera a renovação do token ANTES de chamar o fetch: o abort não o alcança.
      rpc: () => { chamadasRpc++; return penduradoParaSempre; },
    } } });
    const vo = p.carregar('lib/voice-operations.ts');
    const r = await comLimite(
      vo.registrarOperacaoVoz('grav-1', 'widget', { kind: 'transaction', type: 'out', description: 'Mercado', amount: 120, category: 'Mercado', color: '#fff', occurred_on: '2026-10-06', wallet_id: 'pessoal' }),
      3000, 'gravação sem prazo real');
    assert.equal(chamadasRpc, 1);
    assert.equal(r.status, 'pending', 'estourado o prazo, a operação fica pendente');
    assert.ok(armazem.has('grana:voz:operacao:u-1:grav-1'), 'e continua salva no aparelho para a próxima sincronização');
    ok('gravação: 15 s de prazo real mesmo com a renovação do token pendurada; fica pendente, salva no aparelho');
  }

  /* ── 10. Quem é o dono e qual o token: com prazo, caem para o disco ──────── */
  if (rodar(10)) {
    limparAparelho();
    escala = 1000;
    const sessao = { access_token: 'tok-disco', refresh_token: 'r', user: { id: 'u-disco' } };
    let consultas = 0;
    const p = novoProcesso({ sessaoReal: true, supabase: {
      CHAVE_SESSAO: 'k', armazenamentoSessao: { getItem: async () => JSON.stringify(sessao) },
      supabase: { auth: { getSession: () => { consultas++; return new Promise(() => {}); }, getUser: async () => ({ data: { user: null } }) } },
    } });
    const so = p.carregar('lib/sessao-offline.ts');
    assert.equal(await comLimite(so.idDoUsuarioLocal(3000), 2000, 'idDoUsuarioLocal sem prazo'), 'u-disco');
    assert.equal(await comLimite(so.tokenDeAcessoLocal(3000), 2000, 'tokenDeAcessoLocal sem prazo'), 'tok-disco');
    assert.equal(consultas, 2, 'o cliente foi consultado primeiro nas duas vezes');
    ok('dono e token com prazo: a renovação pendurada não segura a tarefa; vale o registro do aparelho');

    // A tarefa e a gravação pedem o dono COM prazo; a transcrição pede o token COM prazo.
    const tarefaFonte = fs.readFileSync(path.join(root, 'lib/widget-voz-task.ts'), 'utf8');
    assert.doesNotMatch(tarefaFonte, /idDoUsuarioLocal\(\)/, 'a tarefa nunca pergunta o dono sem prazo');
    const operacoesFonte = fs.readFileSync(path.join(root, 'lib/voice-operations.ts'), 'utf8').split('\r\n').join('\n');
    const gravar = operacoesFonte.slice(operacoesFonte.indexOf('async function gravarOperacaoVoz'));
    assert.doesNotMatch(gravar.slice(0, gravar.indexOf('\n}\n')), /idDoUsuarioLocal\(\)/, 'a gravação nunca pergunta o dono sem prazo');
    ok('a tarefa e a gravação consultam o dono sempre com prazo');
  }

  /* ── 11. Recibo que falha não custa a fala nova (Watchtower, 08/10/2026) ──── */
  if (rodar(11)) for (const source of ['widget', 'app']) {
    // 11a. Pede revisão ("Qual cartão?") e a notificação de revisão falha.
    limparAparelho();
    let p = novoProcesso();
    ctl.cartoes = [{ id: 'c1', name: 'Nubank', bank: 'Nubank', closing_day: 5 }, { id: 'c2', name: 'C6', bank: 'C6 Bank', closing_day: 10 }];
    ctl.transcrever = async () => ({ ok: true, transcript: 'Uber 30 reais no crédito.' });
    ctl.falharNotificacao = new Set(['notificarRevisao']);
    let d = await p.tarefa.executarTarefa(falaNova('rf-' + source, source));
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'sem_notificacao' }, 'sem recibo entregue, a fala fica guardada');
    assert.equal(p.escritas.length, 0, 'nada gravado por conta própria');
    assert.deepEqual((await p.fila.listarVozesPendentes()).map((i) => [i.requestId, i.transcricao]), [['rf-' + source, 'Uber 30 reais no crédito.']], 'na fila, visível, com o que foi ouvido');
    assert.deepEqual(audios(), [`file:///files/voz-pendente/rf-${source}.m4a`], 'o áudio continua no aparelho');
    if (source === 'widget') assert.equal(p.estados.at(-1), 'atencao');
    // A notificação volta a funcionar: a retomada entrega a MESMA pergunta, sem transcrever de novo e sem gravar.
    ctl.falharNotificacao = new Set();
    const transcricoesAntes = p.chamadasTranscricao.length;
    await p.tarefa.tentarVozesPendentes();
    assert.equal(p.chamadasTranscricao.length, transcricoesAntes, 'a retomada usa a transcrição guardada');
    assert.deepEqual(p.recibosDe('notificarRevisao').map((r) => r.args[0]), ['Qual cartão?'], 'a revisão chega quando o recibo volta a funcionar');
    assert.equal(p.escritas.length, 0);
    ok(`[${source}] revisão cujo recibo falha: fala guardada com o texto, revisão entregue depois, nada gravado`);

    // 11b. "Não entendi" cujo recibo falha: a fala não some calada.
    limparAparelho();
    p = novoProcesso();
    ctl.transcrever = async () => ({ ok: false, codigo: 'nao_entendi' });
    ctl.falharNotificacao = new Set(['notificarFalha']);
    d = await p.tarefa.executarTarefa(falaNova('nf-' + source, source));
    assert.equal(d.guardada, true, 'sem recibo, "não entendi" não apaga a fala');
    assert.equal(audios().length, 1);
    assert.equal(filaBruta().length, 1);
    ok(`[${source}] "não entendi" cujo recibo falha: a fala fica guardada`);
  }

  /* ── 12. Mutações concorrentes da fila não se atropelam ───────────────────── */
  if (rodar(12)) {
    limparAparelho();
    const p = novoProcesso();
    const a = falaNova('a', 'widget'); const b = falaNova('b', 'app'); const c = falaNova('c', 'widget');
    await Promise.all([
      p.fila.reservarFalaEmAndamento({ ...a, userId: 'u-1' }),
      p.fila.reservarFalaEmAndamento({ ...b, userId: 'u-1' }),
    ]);
    assert.deepEqual(filaBruta().map((i) => i.requestId).sort(), ['a', 'b'], 'duas reservas ao mesmo tempo: as duas ficam');
    await Promise.all([
      p.fila.reservarFalaEmAndamento({ ...c, userId: 'u-1' }),
      p.fila.liberarFalaEmAndamento('a'),
      p.fila.adicionarVozPendente({ caminho: b.caminho, requestId: 'b', userId: 'u-1', source: 'app', transcricao: 'ouvi' }),
    ]);
    const depois = filaBruta();
    assert.deepEqual(depois.map((i) => i.requestId).sort(), ['b', 'c'], 'reserva, liberação e regravação intercaladas: nenhuma se perde');
    assert.equal(depois.find((i) => i.requestId === 'b').emAndamentoDesde, undefined, 'b virou fala guardada');
    assert.equal(depois.find((i) => i.requestId === 'b').transcricao, 'ouvi');
    await Promise.all([p.fila.removerVozPendente('b'), p.fila.marcarVozEmRevisao('c', 'texto')]);
    assert.deepEqual(filaBruta().map((i) => [i.requestId, i.revisao]), [['c', true]], 'remover e marcar ao mesmo tempo');
    // Uma mutação que falha não trava as seguintes.
    ctl.falharEscritaDaFilaApos = escritasDaFila;
    await assert.rejects(p.fila.removerVozPendente('c'));
    ctl.falharEscritaDaFilaApos = Infinity;
    await p.fila.removerVozPendente('c');
    assert.deepEqual(filaBruta(), [], 'a fila segue andando depois de uma falha');
    // As duas entradas ao mesmo tempo, pela tarefa real.
    limparAparelho();
    const q = novoProcesso();
    await Promise.all([q.tarefa.executarTarefa(falaNova('sim-w', 'widget')), q.tarefa.executarTarefa(falaNova('sim-a', 'app'))]);
    assert.deepEqual(q.escritas.map((e) => e.requestId).sort(), ['sim-a', 'sim-w']);
    assert.deepEqual(filaBruta(), [], 'nenhuma reserva sobrou');
    assert.deepEqual(audios(), [], 'nenhum áudio sobrou');
    ok('mutações concorrentes da fila são serializadas: nenhuma fala some, nenhuma sobra');
  }

  /* ── 13. Depois do prazo total, o trabalho abandonado não tem efeito ─────── */
  if (rodar(13)) for (const source of ['widget', 'app']) {
    // 13a. A transcrição volta DEPOIS do prazo: nenhuma gravação, nenhum recibo novo.
    limparAparelho();
    let p = novoProcesso(); escala = 200; // folga real entre o prazo total e o teto, como na seção 6
    let soltar; ctl.transcrever = () => new Promise((r) => { soltar = r; });
    let d = await comLimite(p.tarefa.executarTarefa(falaNova('tarde-' + source, source)), 4000, 'tarefa sem prazo total');
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'demorou' });
    soltar({ ok: true, transcript: 'Mercado R$ 120 no débito.' });
    await tique(60);
    assert.equal(p.escritas.length, 0, 'transcrição tardia não inicia gravação');
    assert.deepEqual(p.recibos.map((r) => r.nome), ['notificarPendenteOffline'], 'nem recibo novo depois do desfecho');
    assert.deepEqual(filaBruta().map((i) => i.requestId), ['tarde-' + source], 'a fala segue na fila');
    // A retomada é quem lança, uma vez.
    escala = 1; ctl.transcrever = async () => ({ ok: true, transcript: 'Mercado R$ 120 no débito.' });
    await p.tarefa.tentarVozesPendentes();
    assert.equal(p.escritas.length, 1);
    assert.equal(p.escritas[0].requestId, 'tarde-' + source);
    assert.deepEqual(filaBruta(), []);
    ok(`[${source}] transcrição que volta depois do prazo não grava nem avisa; a retomada lança uma vez`);

    // 13b. A gravação JÁ tinha saído quando o prazo estourou: conclui, sem deixar a fala na fila.
    limparAparelho();
    p = novoProcesso(); escala = 200; // folga real entre o prazo total e o teto, como na seção 6
    let confirmar; let pedidos = 0;
    ctl.registrar = (requestId, _s, payload) => new Promise((r) => { pedidos++; confirmar = () => r({ status: 'committed', ids: ['tx'], operationId: 'op-' + requestId, kind: payload.kind }); });
    d = await comLimite(p.tarefa.executarTarefa(falaNova('voo-' + source, source)), 4000, 'tarefa sem prazo total');
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'demorou' });
    assert.equal(pedidos, 1, 'a gravação estava em voo');
    confirmar();
    await tique(60);
    assert.deepEqual(filaBruta(), [], 'gravação confirmada depois do prazo: a fala sai da fila');
    assert.deepEqual(audios(), [], 'e o áudio é apagado');
    assert.equal(p.recibosDe('notificarSucesso').length, 1, 'com o recibo de sucesso (e o Desfazer)');
    escala = 1;
    await p.tarefa.tentarVozesPendentes();
    assert.equal(pedidos, 1, 'a retomada não envia a mesma fala de novo');
    ok(`[${source}] gravação em voo no estouro do prazo: confirma, limpa a fila e não reenvia`);
  }

  /* ── 14. Fila que não grava: nenhuma cópia sem índice, e a fala fica adotável ─ */
  if (rodar(14)) for (const source of ['widget', 'app']) {
    limparAparelho();
    const p = novoProcesso();
    ctl.falharEscritaDaFilaApos = 0; // nenhuma escrita da fila dá certo
    ctl.transcrever = async () => ({ ok: false, codigo: 'sem_rede' });
    const d = await p.tarefa.executarTarefa(falaNova('sd-' + source, source));
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'sem_rede' });
    assert.deepEqual(audios(), [`file:///files/voz-orfa/sd-${source}.json`, `file:///files/voz-orfa/sd-${source}.m4a`], 'nenhuma cópia sem índice em voz-pendente/; a fala fica na pasta adotável, com metadados');
    assert.equal(p.recibosDe('notificarPendenteOffline').length, 1);
    assert.ok(p.erros.length > 0, 'a falha da fila deixou log');
    // O disco volta. Outra conta não adota; a dona adota e lança com o mesmo id, origem e data.
    ctl.falharEscritaDaFilaApos = Infinity;
    ctl.transcrever = async () => ({ ok: true, transcript: 'Mercado R$ 120 no débito.' });
    ctl.usuario = 'u-2';
    const outra = novoProcesso();
    await outra.tarefa.tentarVozesPendentes();
    assert.equal(outra.escritas.length, 0, 'outra conta não adota a fala');
    assert.equal(audios().length, 2, 'e ela continua guardada para a dona');
    ctl.usuario = 'u-1';
    const dona = novoProcesso();
    await dona.tarefa.tentarVozesPendentes();
    assert.equal(dona.escritas.length, 1);
    assert.equal(dona.escritas[0].requestId, 'sd-' + source);
    assert.equal(dona.escritas[0].source, source);
    assert.equal(dona.escritas[0].payload.occurred_on, '2026-10-06');
    assert.deepEqual(audios(), []);
    assert.deepEqual(filaBruta(), []);
    ok(`[${source}] fila sem gravar: fala adotável com dono e data, lançada depois pela dona`);
  }

  /* ── 15. Confiabilidade real e botão REAL ligado ao núcleo REAL ──────────── */
  if (rodar(15)) {
    const { montarBotao } = require('./voz-captura-paridade.cjs');
    for (const texto of ['Mercado R$ 120 no débito.', 'Refri 829 no crédito']) {
      limparAparelho();
      const p = novoProcesso();
      ctl.cartoes = [{ id: 'c1', name: 'Nubank', bank: 'Nubank', closing_day: 5 }];
      ctl.transcrever = async () => ({ ok: true, transcript: texto });
      const revisoes = [];
      const b = montarBotao({ tarefaReal: p.tarefa.executarTarefa,
        aoCapturar: (payload) => disco.set(payload.caminho, 'AUDIO-BOTAO'),
        aoRevisar: (ouvido, ref) => revisoes.push({ ouvido, ref }),
      });
      await b.tocar(); await b.tocar();
      assert.equal(b.reg.tarefas.length, 1, 'o botão real entregou uma fala ao núcleo real');
      const capturaReal = b.reg.tarefas[0];
      const payloadApp = p.escritas[0]?.payload;
      const alertasApp = b.reg.alertasCompletos;
      // Mesma captura/texto/contexto, agora pela entrada do widget.
      await p.tarefa.executarTarefa(falaNova('mesma-widget', 'widget', {
        capturadoEm: capturaReal.capturadoEm, dataCaptura: capturaReal.dataCaptura,
      }));
      if (texto.includes('829')) {
        assert.equal(p.escritas.length, 0, 'confiabilidade real recusa valor ambíguo nas duas entradas');
        assert.equal(revisoes.length, 1); assert.equal(revisoes[0].ouvido, texto);
        assert.equal(alertasApp[0].titulo, 'Confirme o valor que ouvi');
        assert.equal(p.recibosDe('notificarRevisao')[0].args[0], alertasApp[0].titulo);
        assert.equal(p.recibosDe('notificarRevisao')[0].args[3].referencia, revisoes[0].ref.referencia);
      } else {
        assert.equal(p.escritas.length, 2); assert.equal(p.escritas[0].source, 'app');
        assert.equal(p.escritas[1].source, 'widget');
        assert.deepEqual(p.escritas[1].payload, payloadApp, 'payload financeiro igual');
        assert.equal(p.recibosDe('notificarSucesso').length, 1);
        assert.equal(alertasApp.length, 1);
      }
      assert.deepEqual(filaBruta(), []); assert.deepEqual(audios(), []);
      ok(`botão real + tarefa real, paridade com widget: ${texto}`);
    }
  }

  if (rodar(16)) for (const source of ['widget', 'app']) {
    limparAparelho();
    const p = novoProcesso();
    ctl.falharEscritaDaFilaApos = 0;
    ctl.cartoes = [{ id: 'c1', name: 'Nubank', bank: 'Nubank', closing_day: 5 }, { id: 'c2', name: 'C6', bank: 'C6 Bank', closing_day: 10 }];
    ctl.transcrever = async () => ({ ok: true, transcript: 'Uber 30 reais no crédito.' });
    ctl.falharNotificacao = new Set(['notificarRevisao']);
    const d = await p.tarefa.executarTarefa(falaNova('dupla-' + source, source));
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'sem_notificacao' });
    assert.equal(p.escritas.length, 0);
    assert.deepEqual(audios(), [`file:///files/voz-orfa/dupla-${source}.json`, `file:///files/voz-orfa/dupla-${source}.m4a`]);
    ctl.falharEscritaDaFilaApos = Infinity; ctl.falharNotificacao = new Set();
    await p.tarefa.tentarVozesPendentes();
    assert.equal(p.escritas.length, 0); assert.equal(p.recibosDe('notificarRevisao').length, 1);
    assert.equal(p.recibosDe('notificarRevisao')[0].args[0], 'Qual cartão?');
    ok(`[${source}] reserva e recibo falham juntos: fallback conserva dono, data e transcrição`);
  }

  /* ── 17. Disco pendurado numa mutação não trava a fila (R5, Lynx, 08/10/2026) ─ */
  if (rodar(17)) {
    const copiaReal = fsDuble.copyAsync;
    try {
      // 17a. A cópia da reserva da fala A nunca volta: A e B terminam, e as duas lançam.
      limparAparelho();
      let p = novoProcesso(); escala = 1000;
      let primeira = true;
      fsDuble.copyAsync = (a) => { if (primeira) { primeira = false; return new Promise(() => {}); } return copiaReal(a); };
      const esperaA = comLimite(p.tarefa.executarTarefa(falaNova('copia-a', 'widget')), 4000, 'A presa na cópia da reserva');
      await tique(3);
      const dB = await comLimite(p.tarefa.executarTarefa(falaNova('copia-b', 'app')), 4000, 'B presa atrás da mutação de A');
      const dA = await esperaA;
      assert.deepEqual({ ...dB }, { guardada: false });
      assert.deepEqual({ ...dA }, { guardada: false }, 'A segue sem a reserva e lança');
      assert.deepEqual(p.escritas.map((e) => e.requestId).sort(), ['copia-a', 'copia-b']);
      assert.equal(p.estados.at(-1), 'ocioso');
      assert.ok(p.erros.length > 0, 'a mutação que estourou deixou log');
      assert.ok(Number.isFinite(p.fila.PRAZO_MUTACAO_FILA_MS) && p.fila.PRAZO_MUTACAO_FILA_MS <= 15_000, 'cada mutação da fila tem prazo próprio');
      ok('cópia pendurada na reserva de uma fala não trava a outra: as duas terminam e lançam');

      // 17b. A mutação vencida que termina DEPOIS não grava por cima nem deixa cópia sem índice.
      limparAparelho();
      p = novoProcesso(); escala = 1000;
      let soltar;
      const x = falaNova('vencida', 'widget'); const y = falaNova('nova', 'app');
      fsDuble.copyAsync = (a) => (a.to.endsWith('/vencida.m4a') ? new Promise((r) => { soltar = () => r(copiaReal(a)); }) : copiaReal(a));
      await assert.rejects(comLimite(p.fila.reservarFalaEmAndamento({ ...x, userId: 'u-1' }), 2000, 'reserva sem prazo'));
      assert.equal(await p.fila.reservarFalaEmAndamento({ ...y, userId: 'u-1' }), true);
      soltar();
      await tique(40);
      assert.deepEqual(filaBruta().map((i) => i.requestId), ['nova'], 'a mutação vencida não regrava a fila com um retrato velho');
      assert.equal(disco.has('file:///files/voz-pendente/vencida.m4a'), false, 'nem deixa a cópia dela sem índice');
      assert.equal(disco.has('file://' + x.caminho), true, 'o original da captura fica com quem chamou');
      ok('mutação vencida que termina depois não escreve na fila nem deixa cópia órfã');
    } finally { fsDuble.copyAsync = copiaReal; }
  }

  /* ── 18. O prazo cobre a preparação e o desfecho, não só o processamento (R2) ─ */
  if (rodar(18)) {
    // 18a. A consulta de permissão de notificação nunca responde.
    limparAparelho();
    let p = novoProcesso(); escala = 1000;
    ctl.podeNotificar = new Promise(() => {});
    let d = await comLimite(p.tarefa.executarTarefa(falaNova('perm', 'widget')), 3000, 'tarefa presa na permissão de notificação');
    assert.deepEqual({ ...d }, { guardada: true, motivo: 'sem_notificacao' }, 'sem saber se pode avisar, não lança: guarda');
    assert.equal(p.chamadasTranscricao.length, 0);
    assert.equal(p.escritas.length, 0);
    assert.deepEqual((await p.fila.listarVozesPendentes()).map((i) => i.requestId), ['perm']);
    assert.equal(p.estados.at(-1), 'atencao');
    ok('permissão de notificação pendurada: a tarefa termina, guarda a fala e acende atenção');

    // 18b. O recibo do caminho de falha nunca responde: a tarefa termina antes do teto do Android.
    limparAparelho();
    p = novoProcesso(); escala = 1000;
    ctl.transcrever = async () => ({ ok: false, codigo: 'sem_rede' });
    ctl.pendurarNotificacao = new Set(['notificarPendenteOffline']);
    d = await comLimite(p.tarefa.executarTarefa(falaNova('recibo-preso', 'widget')), 3000, 'tarefa presa no recibo');
    assert.equal(d.guardada, true);
    assert.deepEqual((await p.fila.listarVozesPendentes()).map((i) => i.requestId), ['recibo-preso'], 'a fala já estava guardada');
    assert.equal(p.estados.at(-1), 'atencao', 'o widget não fica em "Lançando…"');
    assert.ok(p.tarefa.PRAZO_FIM_DA_TAREFA_MS > p.tarefa.PRAZO_TOTAL_TAREFA_MS && p.tarefa.PRAZO_FIM_DA_TAREFA_MS <= 115_000, 'o teto de ponta a ponta fica abaixo dos 120 s do Android');
    ok('recibo pendurado no caminho de falha: a tarefa termina sozinha, em atenção, antes do teto do Android');
  }

  /* ── 19. Fila E pasta de recuperação falham: não anuncia "guardado" (R3) ──── */
  if (rodar(19)) {
    const escritaReal = fsDuble.writeAsStringAsync;
    try {
      fsDuble.writeAsStringAsync = async () => { throw new Error('IO indisponível (simulado)'); };
      for (const source of ['widget', 'app']) {
        // 19a. Sem rede, e nada grava.
        limparAparelho();
        let p = novoProcesso();
        ctl.falharEscritaDaFilaApos = 0;
        ctl.transcrever = async () => ({ ok: false, codigo: 'sem_rede' });
        let d = await p.tarefa.executarTarefa(falaNova('nada-' + source, source));
        assert.deepEqual({ ...d }, { guardada: false }, 'sem índice de recuperação, a fala NÃO está guardada');
        assert.deepEqual(p.recibos.map((r) => [r.nome, r.args[0]]), [['notificarFalha', 'erro_interno']], 'o recibo diz que falhou, e nunca "Áudio guardado"');
        assert.deepEqual(audios(), [], 'nenhum áudio fica no aparelho sem ninguém para retomá-lo');
        assert.ok(p.erros.length > 0);
        if (source === 'widget') assert.equal(p.estados.at(-1), 'atencao');
        ok(`[${source}] fila e pasta de recuperação falham: recibo de falha, nada anunciado como guardado`);

        // 19b. Pede revisão, o recibo falha, e nada grava.
        limparAparelho();
        p = novoProcesso();
        ctl.falharEscritaDaFilaApos = 0;
        ctl.cartoes = [{ id: 'c1', name: 'Nubank', bank: 'Nubank', closing_day: 5 }, { id: 'c2', name: 'C6', bank: 'C6 Bank', closing_day: 10 }];
        ctl.transcrever = async () => ({ ok: true, transcript: 'Uber 30 reais no crédito.' });
        ctl.falharNotificacao = new Set(['notificarRevisao']);
        d = await p.tarefa.executarTarefa(falaNova('nada2-' + source, source));
        assert.deepEqual({ ...d }, { guardada: false });
        assert.equal(p.escritas.length, 0);
        assert.deepEqual(audios(), []);
        if (source === 'widget') assert.equal(p.estados.at(-1), 'atencao', 'o estado de atenção é o recibo que resta');
        ok(`[${source}] revisão, recibo, fila e recuperação falham: nada anunciado como guardado`);
      }
    } finally { fsDuble.writeAsStringAsync = escritaReal; }
  }

  console.log(`\n${checagens} checagens do widget de voz em segundo plano passaram — 0 falhas`);
  process.exit(0);
})().catch((erro) => {
  console.error('\nFALHOU:', erro && erro.message ? erro.message : erro);
  if (process.env.DEBUG) console.error(erro);
  process.exit(1);
});
