/*
 * Paridade da "entrada citando cartão" entre a voz (app e widget, núcleo
 * `lib/widget-voz-task.ts`) e o Granabô (`assistente-financeiro`).
 *
 *   node __tests__/paridade-entrada-cartao-granabo-voz.cjs
 *
 * Mesma frase, mesmos cartões e carteira: as três entradas decidem igual
 * (grava ou não, e com que tipo, valor, cartão e forma de pagamento). Os dois
 * módulos são os reais, com as heurísticas reais; só banco, rede e
 * notificação são dublês. Afirma QUAIS escritas aconteceram.
 *
 * Nasceu em 26/09/2026. O Granabô detectava uma palavra específica na guarda
 * e a voz não; e, com UM cartão, a voz gravava "X de 40 da farmácia no
 * crédito" como COMPRA no cartão, porque a guarda exigia citar o cartão.
 * Regra única, aprovada pelo maestro: entrada (tipo lido sem o nome do
 * cartão) com intenção de crédito não grava, em nenhuma entrada. Roda com um
 * e com dois cartões.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const root = path.join(__dirname, '..');

const DOIS_CARTOES = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'w' }, { id: 'nu', name: 'Nubank', bank: 'nubank', wallet_id: 'w' }];
let CARTOES = DOIS_CARTOES;
const CARTEIRAS = [{ id: 'w', name: 'Pessoal', is_default: true }];
/* Frase -> o que as três entradas fazem; `null` = não grava. */
const ENTRADA = (amount) => ({ grava: true, type: 'in', amount, card_id: null, payment_method: null });
const FRASES = {
  'estorno de 50 no crédito do C6': null,
  'estorno de 50 do mercado no crédito': null,
  'estorno de 40 da farmácia no crédito': null,
  'devolução de 80 no cartão C6': null,
  'devolução de 80 no cartão de crédito': null,
  'reembolso de 40 da farmácia no crédito': ENTRADA(40),
  'recebi um crédito de 500 do salário': ENTRADA(500),
  'mercado 32 no crédito do C6': { grava: true, type: 'out', amount: 32, card_id: 'c6', payment_method: 'credit' },
};
/* Para onde a fala leva DENTRO do app quando vai para a revisão: botão de voz
   da Início (`onTranscribed`) e toque na notificação do widget. As duas usam
   `destinoDaFala`; entrada com intenção de crédito nunca abre a folha de
   compra do cartão. */
const DESTINOS = {
  'estorno de 50 no crédito do C6': 'revisao',
  'estorno de 50 do mercado no crédito': 'revisao',
  'estorno de 40 da farmácia no crédito': 'revisao',
  'devolução de 80 no cartão C6': 'revisao',
  'devolução de 80 no cartão de crédito': 'revisao',
  'devolução de 80 cartão C6': 'revisao',
  'reembolso de 40 da farmácia no crédito': 'revisao',
  'recebi um crédito de 500 do salário': 'revisao',
  'mercado 32 no crédito do C6': 'credito',
  'mercado 32 cartão C6': 'credito',
  'mercado 32 no crédito': 'credito',
  'conta de luz 120 vence dia 10': 'contas',
  'almoço 38,50': 'revisao',
};

const resumo = (p) => p ? { grava: true, type: p.type, amount: Number(p.amount), card_id: p.card_id ?? null, payment_method: p.payment_method ?? null } : { grava: false };

/* ── Voz: núcleo real, com as heurísticas reais ─────────────────────────── */
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
  './data': { fetchCreditCards: async () => CARTOES, fetchCategories: async () => [] },
  './wallets': { fetchWallets: async () => CARTEIRAS },
  './voice-operations': {
    ehRecusaCartaoObrigatorio: () => false,
    registrarOperacaoVoz: async (_id, _fonte, entrada) => { gravadosVoz.push(entrada); return { status: 'committed', ids: ['tx'], operationId: 'op' }; },
  },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } } },
  './sessao-offline': { idDoUsuarioLocal: async () => 'u-1', lerSessaoDoDisco: async () => null },
  './widget-voz-pendentes': { adicionarVozPendente: async () => {}, listarVozesPendentes: async () => [], removerVozPendente: async () => {} },
  './widgets-home-sync': { sincronizarResumoDosWidgets: async () => {} },
  '@react-native-async-storage/async-storage': {},
  'expo-file-system/legacy': { deleteAsync: async () => {} },
});

async function pelaVoz(frase, fonte) {
  transcricao = frase;
  const antes = gravadosVoz.length;
  await tarefa({ caminho: '/v.m4a', requestId: fonte + '-' + frase, source: fonte });
  assert.ok(gravadosVoz.length - antes <= 1, 'no máximo uma escrita por fala');
  return resumo(gravadosVoz[antes]);
}

/* ── Granabô: handler real da Edge Function ─────────────────────────────── */
let handler, completions = [], respostasDaFerramenta = [];
const escritasGranabo = [];
class Query {
  constructor(table) { this.table = table; }
  select() { return this; } order() { return this; } limit() { return this; } eq() { return this; }
  neq() { return this; } gte() { return this; } lte() { return this; } delete() { return this; }
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
    if (name === 'registrar_operacao_voz') { escritasGranabo.push(args.p_payload); return { data: { status: 'committed', ids: ['tx'] }, error: null }; }
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
    if (name.endsWith('/seguranca.ts')) return { criarRateLimiter: () => () => false,
      fetchComTimeout: async (_, init) => {
        const corpo = JSON.parse(init.body);
        const ferramenta = corpo.messages.filter((m) => m.role === 'tool').at(-1);
        if (ferramenta) respostasDaFerramenta.push(ferramenta.content);
        return Response.json({ choices: [{ message: completions.shift() }] });
      } };
    return carregarDeno(path.resolve(path.dirname(file), name));
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}
global.Deno = { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } };
carregarDeno(path.join(root, 'supabase/functions/assistente-financeiro/index.ts'));

async function peloGranabo(frase) {
  const ferramenta = { role: 'assistant', content: null, tool_calls: [{ id: '1', function: { name: 'criarLancamento', arguments: JSON.stringify({ texto: frase }) } }] };
  completions = [ferramenta, { content: 'ok' }];
  const antes = escritasGranabo.length;
  const res = await handler(new Request('http://local', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagem: frase, historico: [] }) }));
  assert.equal(res.status, 200);
  assert.ok(escritasGranabo.length - antes <= 1, 'no máximo uma escrita por frase');
  return resumo(escritasGranabo[antes]);
}

(async () => {
  let checagens = 0;
  for (const [cenario, cartoes] of [['dois cartões', DOIS_CARTOES], ['um cartão', DOIS_CARTOES.slice(0, 1)]]) {
    CARTOES = cartoes;
    console.log('\n' + cenario);
    for (const [frase, esperado] of Object.entries(FRASES)) {
      const granabo = await peloGranabo(frase);
      assert.deepEqual(granabo, esperado ?? { grava: false }, `${cenario}, Granabô, "${frase}": ${JSON.stringify(granabo)}`);
      if (!esperado) {
        /* A resposta não convida a repetir a frase recusada, nem nomeia estorno. */
        const resposta = respostasDaFerramenta.at(-1) ?? '';
        assert.match(resposta, /^No cartão do Grana\. só entram compras/, frase);
        assert.doesNotMatch(resposta, /estorn|não entendi|repet|—/i, frase);
        assert.match(resposta, /Ainda não registrei nada/, frase);
      }
      for (const fonte of ['app', 'widget']) {
        const voz = await pelaVoz(frase, fonte);
        assert.deepEqual(voz, granabo, `${cenario}, "${frase}": Granabô ${JSON.stringify(granabo)} x ${fonte} ${JSON.stringify(voz)}`);
        checagens++;
      }
      console.log(`  ok  ${JSON.stringify(frase)} -> ${granabo.grava ? `grava ${granabo.type} ${granabo.amount}${granabo.card_id ? ' no ' + granabo.card_id : ''}` : 'não grava'} (Granabô, app e widget)`);
    }
  }
  /* Destino dentro do app: botão de voz da Início (com carteiras e cartões)
     e toque na notificação do widget (só o texto). Módulo real. */
  const { destinoDaFala } = carregarVm('lib/destino-da-fala.ts');
  for (const [frase, esperado] of Object.entries(DESTINOS)) {
    for (const cartoes of [DOIS_CARTOES, DOIS_CARTOES.slice(0, 1)]) {
      assert.equal(destinoDaFala(frase, CARTEIRAS, cartoes), esperado, 'app: ' + frase);
      checagens++;
    }
    assert.equal(destinoDaFala(frase), esperado, 'toque na notificação: ' + frase);
    checagens++;
    console.log(`  ok  destino ${JSON.stringify(frase)} -> ${esperado} (app e toque na notificação)`);
  }
  /* Toda fala que o núcleo recusa por entrada com intenção de crédito vai à
     revisão nos dois destinos, nunca à folha de compra. */
  for (const [frase, esperado] of Object.entries(FRASES)) {
    if (esperado) continue;
    assert.equal(destinoDaFala(frase, CARTEIRAS, DOIS_CARTOES), 'revisao', frase);
    assert.equal(destinoDaFala(frase), 'revisao', frase);
  }
  /* O toque na notificação decide pela função, não por regra própria. */
  const toque = fs.readFileSync(path.join(root, 'components/RespostaVozWidget.tsx'), 'utf8');
  assert.match(toque, /destinoDaFala\(texto\)/, 'RespostaVozWidget usa destinoDaFala');
  assert.doesNotMatch(toque, /ehIntencaoCredito|ehIntencaoBoleto/, 'RespostaVozWidget sem regra própria');

  /* Nenhuma guarda trata a palavra "estorno" (autor, 26/09/2026). */
  for (const arquivo of ['supabase/functions/assistente-financeiro/index.ts', 'lib/widget-voz-task.ts', 'lib/destino-da-fala.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, arquivo), 'utf8'), /estorn\\w/, arquivo);
  }
  console.log(`OK paridade entrada com intenção de crédito: ${checagens} comparações (gravação no Granabô, app e widget; destino no app e no toque da notificação), com um e dois cartões.`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
