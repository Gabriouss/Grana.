/*
 * Granachat: a resposta à pergunta de categoria conclui o lançamento, e o nome
 * gravado não repete a categoria. Módulos reais, banco e provedor simulados.
 *
 *   node __tests__/granachat-pendente-categoria.cjs
 *
 * Nasceu dos prints do autor de 13/10/2026, no aparelho:
 *
 * - "Meli+ 113 reais" fazia o Granabô perguntar a categoria. A resposta
 *   "Assinaturas", uma das opções listadas, voltava como "Não identifiquei o
 *   valor", em laço. A busca do pedido anterior exigia verbo de lançamento
 *   ("lança", "gastei") na frase original, e "Meli+ 113 reais" não tem verbo.
 * - "113 reais Meli+ assinatura" gravava em Assinaturas com o nome
 *   "Meli+ assinatura": a palavra da categoria ficava no nome.
 *
 * O nome sem a categoria vale também para a voz (regra 13): as mesmas frases
 * passam pelo núcleo `lib/widget-voz-task.ts`, nas entradas app e widget.
 */
require('./helpers/falha-com-duble-incompleto.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const root = path.join(__dirname, '..');

const CARTEIRAS = [{ id: 'w', name: 'Pessoal', is_default: true }];
let CARTOES = [];
let passou = 0;
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); passou++; };
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };

/* ── Granabô: handler real da Edge Function ─────────────────────────────── */
let handler;
let completions = [];
const gravados = [];
class Query {
  constructor(table) { this.table = table; }
  select() { return this; } order() { return this; } limit() { return this; } eq() { return this; }
  neq() { return this; } gte() { return this; } lte() { return this; } in() { return this; } delete() { return this; }
  maybeSingle() { this.single = true; return this; }
  insert() { return Promise.resolve({ error: null }); }
  then(resolve, reject) {
    const rows = this.table === 'credit_cards' ? CARTOES : this.table === 'wallets' ? CARTEIRAS : [];
    return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
  }
}
const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
  from: (table) => new Query(table),
  rpc: async (name, args) => {
    if (name === 'tem_direito_acesso') return { data: true, error: null };
    if (name === 'consumir_cota_ia') return { data: [{ permitido: true, motivo: null, minuto_restante: 9, dia_restante: 119 }], error: null };
    if (name === 'registrar_operacao_voz') { gravados.push(args.p_payload); return { data: { status: 'committed', ids: ['tx'] }, error: null }; }
    return { data: [], error: null };
  },
};
const modulos = new Map();
function carregarDeno(file) {
  if (modulos.has(file)) return modulos.get(file).exports;
  const m = new Module(file, module); modulos.set(file, m);
  m.require = (name) => {
    if (name.startsWith('npm:') && name.endsWith('/cors')) return { corsHeaders: {} };
    if (name.startsWith('npm:')) return { createClient: () => client };
    if (name.endsWith('/seguranca.ts')) return {
      criarRateLimiter: () => () => false,
      fetchComTimeout: async () => Response.json({ choices: [{ message: completions.shift() ?? { content: 'Pronto.' } }] }),
    };
    return carregarDeno(path.resolve(path.dirname(file), name));
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}
global.Deno = { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } };
carregarDeno(path.join(root, 'supabase/functions/assistente-financeiro/index.ts'));
const interp = carregarDeno(path.join(root, 'supabase/functions/_shared/interpretar-lancamento.ts'));

const LANCAR = { role: 'assistant', content: null, tool_calls: [{ id: '1', function: { name: 'criarLancamento', arguments: JSON.stringify({ texto: 'lançamento de 999 reais' }) } }] };

/**
 * Manda as falas em sequência, com o histórico real. Cada fala diz se o modelo
 * (simulado) chama `criarLancamento` ou responde sem ferramenta: o servidor
 * não decide isso, e os dois caminhos precisam ser seguros.
 */
async function conversa(falas) {
  const historico = [];
  const respostas = [];
  for (const item of falas) {
    const [fala, lanca] = Array.isArray(item) ? item : [item, true];
    completions = lanca ? [LANCAR, { content: 'Prontinho!' }] : [{ content: 'Neste mês você gastou o que aparece na tela de Lançamentos.' }];
    const res = await handler(new Request('http://local', {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: fala, historico }),
    }));
    assert.equal(res.status, 200);
    const { resposta } = await res.json();
    respostas.push(resposta);
    historico.push({ papel: 'usuario', texto: fala }, { papel: 'assistente', texto: resposta });
  }
  return respostas;
}

const resumo = (p) => [p.description, Number(p.amount), p.category];
const PERGUNTA_MELI = 'Não identifiquei a categoria de "Meli+" (R$ 113,00). Qual destas é a certa: ' +
  interp.CATEGORIES.map((c) => c.name).join(', ') + '? Ainda não registrei nada.';
const RECIBO_MELI = 'Deixei de lado o lançamento de "Meli+" (R$ 113,00): ele ficou sem registro. ';

/* ── Voz: núcleo real (app e widget) ────────────────────────────────────── */
function carregarVm(arquivo, dubles = {}, cache = new Map()) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map,
    setTimeout, clearTimeout, AbortController,
    require: (id) => {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) {
        const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregarVm(alvo, dubles, cache);
      }
      throw new Error('import nao simulado em ' + arquivo + ': ' + id);
    },
  }, { filename: arquivo });
  return exports;
}
let transcricao = '';
let tarefa;
const gravadosVoz = [];
const reservas = [];
carregarVm('lib/widget-voz-task.ts', {
  './voz-confiabilidade': { precisaRevisarValorVoz: () => false, transcricaoPareceLancamentoVoz: () => true },
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { tarefa = factory(); } } },
  './offline-cache': { isLikelyNetworkError: () => false },
  '@/modules/grana-voice-widget': { definirEstado: () => {} },
  './voz': { transcreverAudio: async () => ({ ok: true, transcript: transcricao }) },
  './widget-voz-notificacoes': {
    podeNotificar: async () => true, notificarRevisao: async () => {}, notificarFalha: async () => {},
    notificarPendenteOffline: async () => {}, notificarSucesso: async () => {}, notificarSalvoLocal: async () => {},
  },
  './data': { fetchCreditCards: async () => CARTOES, fetchApelidosCategoria: async () => [], fetchCategories: async () => [] },
  './wallets': { fetchWallets: async () => CARTEIRAS },
  './voice-operations': { desfechoDaOperacaoVoz: require('./desfecho-voz-real.cjs'),
    ehRecusaCartaoObrigatorio: () => false,
    registrarOperacaoVoz: async (_id, _fonte, entrada) => { gravadosVoz.push(entrada); return { status: 'committed', ids: ['tx'], operationId: 'op' }; },
  },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } } },
  './sessao-offline': { idDoUsuarioLocal: async () => 'u-1', lerSessaoDoDisco: async () => null },
  './widget-voz-pendentes': {
    adicionarVozPendente: async () => {}, listarVozesPendentes: async () => [], removerVozPendente: async () => {},
    reservarFalaEmAndamento: async (fala) => { reservas.push(fala.requestId); return true; },
    liberarFalaEmAndamento: async () => {},
  },
  './widgets-home-sync': { sincronizarResumoDosWidgets: async () => {} },
  '@react-native-async-storage/async-storage': {},
  'expo-file-system/legacy': { deleteAsync: async () => {} },
});
async function pelaVoz(frase, fonte) {
  transcricao = frase;
  const antes = gravadosVoz.length;
  await tarefa({ caminho: '/v.m4a', requestId: fonte + '-' + frase, source: fonte });
  assert.ok(gravadosVoz.length - antes <= 1, 'no máximo uma escrita por fala');
  const p = gravadosVoz[antes];
  return p ? resumo(p.payload ?? p) : null;
}

(async () => {
  /* ── 1. A resposta à pergunta conclui o lançamento ─────────────────────── */
  for (const pedido of ['Meli+ 113 reais', 'Meli+ 113']) {
    for (const resposta of ['Assinaturas', 'assinatura', 'Assinatura', 'ASSINATURAS', 'a sexta', 'sexta', '6', 'opção 6', 'Coloca em assinaturas']) {
      gravados.length = 0;
      const [pergunta, confirmacao] = await conversa([pedido, resposta]);
      igual(pergunta, PERGUNTA_MELI, `"${pedido}" pergunta a categoria`);
      igual(gravados.map(resumo), [['Meli+', 113, 'Assinaturas']], `"${pedido}" + "${resposta}" grava Meli+ R$ 113 em Assinaturas`);
      ok(confirmacao.endsWith('Se quiser desfazer, é só dizer "desfaz".'), `"${resposta}" confirma com o recibo de gravação`);
    }
  }

  /* ── 2. Resposta que não é categoria: não grava e não perde o pendente ─── */
  {
    gravados.length = 0;
    const [, deNovo, confirmacao] = await conversa(['Meli+ 113 reais', 'hmm não sei', 'Assinaturas']);
    igual(deNovo, PERGUNTA_MELI, 'a resposta vaga repete a mesma pergunta, com o mesmo nome e valor');
    igual(gravados.map(resumo), [['Meli+', 113, 'Assinaturas']], 'e a resposta seguinte ainda conclui o Meli+');
    ok(confirmacao.includes('Assinaturas'), 'confirmação cita a categoria');

    gravados.length = 0;
    await conversa(['Meli+ 113 reais', 'Viagens']);
    igual(gravados.length, 0, 'opção fora da lista não grava');

    gravados.length = 0;
    await conversa(['Meli+ 113 reais', '15']);
    igual(gravados.length, 0, 'número fora da lista não grava nem vira valor');
  }

  /* ── 3. Mudar de assunto descarta com recibo ───────────────────────────── */
  {
    gravados.length = 0;
    const [, consulta, depois] = await conversa(['Meli+ 113 reais', ['quanto gastei esse mês?', false], 'Assinaturas']);
    ok(consulta.startsWith(RECIBO_MELI), 'a consulta avisa que o Meli+ ficou sem registro');
    igual(gravados.length, 0, 'e o Meli+ não é gravado depois, nem com a categoria certa');
    ok(!depois.startsWith('Deixei de lado'), 'sem pedido pendente, não há recibo de descarte');

    gravados.length = 0;
    const [, outro] = await conversa(['Meli+ 113 reais', 'uber 20']);
    igual(gravados.map(resumo), [['Uber', 20, 'Transporte']], 'outro lançamento no lugar da resposta grava só ele');
    ok(outro.startsWith(RECIBO_MELI), 'e avisa que o Meli+ ficou sem registro');

    gravados.length = 0;
    const [, novaPergunta, final] = await conversa(['Meli+ 113 reais', 'lança uber 40 reais', 'Assinaturas']);
    ok(novaPergunta.startsWith(RECIBO_MELI), 'pedido com verbo também descarta o Meli+ com recibo');
    igual(gravados.map(resumo)[0], ['Uber', 40, 'Transporte'], 'e grava só o pedido novo');
    igual(gravados.length, 1, 'o "Assinaturas" de depois não ressuscita o Meli+');
    ok(!/Meli/.test(final), 'nem cita o Meli+');
  }

  /* ── 4. O nome não repete a categoria (Granabô e voz) ──────────────────── */
  const NOMES = [
    ['Meli+ 113 assinatura', ['Meli+', 113, 'Assinaturas']],
    ['113 reais Meli+ assinatura', ['Meli+', 113, 'Assinaturas']],
    ['assinatura Meli+ 113', ['Meli+', 113, 'Assinaturas']],
    ['Meli+ 113 reais Assinaturas', ['Meli+', 113, 'Assinaturas']],
    // Controles: palavra do nome que não é a categoria fica.
    ['netflix 55 reais', ['Netflix', 55, 'Assinaturas']],
    ['plano de saúde 300 reais', null],
    ['Spotify família 34,90', null],
  ];
  for (const [frase, esperado] of NOMES) {
    gravados.length = 0;
    await conversa([frase]);
    const granabo = gravados.map(resumo)[0] ?? null;
    if (esperado) igual(granabo, esperado, `Granabô, "${frase}"`);
    else ok(granabo && !/^(?:Plano|Spotify)$/.test(granabo[0]) && granabo[0].length > 0, `Granabô, "${frase}" mantém o nome inteiro: ${JSON.stringify(granabo)}`);
    for (const fonte of ['app', 'widget']) {
      igual(await pelaVoz(frase, fonte), granabo, `voz ${fonte} = Granabô, "${frase}"`);
    }
  }
  ok(reservas.length > 0, 'a voz passou pela reserva da fala (dublê com a função)');

  /* ── 5. A função de nome, direto ───────────────────────────────────────── */
  const { semNomeDaCategoria } = interp;
  for (const [nome, categoria, esperado] of [
    ['Meli+ assinatura', 'Assinaturas', 'Meli+'],
    ['Assinatura Meli+', 'Assinaturas', 'Meli+'],
    ['Assinaturas', 'Assinaturas', 'Assinaturas'],
    ['Plano de saúde', 'Saúde', 'Plano de saúde'],
    ['Remédio saude', 'Saúde', 'Remédio'],
    ['Cinema', 'Lazer', 'Cinema'],
    ['Ração pets', 'Pets', 'Ração'],
    ['Assinatura', 'Outros', 'Assinatura'],
  ]) {
    igual(semNomeDaCategoria(nome, categoria), esperado, `semNomeDaCategoria("${nome}", "${categoria}")`);
  }

  console.log(`granachat-pendente-categoria: ${passou} verificacoes OK`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
