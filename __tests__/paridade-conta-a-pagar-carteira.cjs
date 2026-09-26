/*
 * "Conta de luz" é conta a pagar, não carteira (achado B2, 26/09/2026).
 *
 *   node __tests__/paridade-conta-a-pagar-carteira.cjs
 *
 * Antes, `/\b(?:carteira|conta)\s+[\p{L}\d]/` casava "Conta de luz" como se a
 * pessoa citasse uma carteira chamada "de luz": a voz (app e widget) respondia
 * "Qual carteira?" e o Granabô "Não existe carteira com esse nome", para toda
 * conta dita como "conta de X". Agora as três entradas usam `citaCarteira` e
 * `matchWalletByText` (lib/heuristics.ts, espelhados no Deno).
 *
 * Módulos reais: núcleo da voz (`lib/widget-voz-task.ts`, com heurísticas e
 * trava de valor reais) com `source` app e widget, e o handler da Edge
 * Function `assistente-financeiro`. Só banco, rede e notificação são dublês.
 * Afirma QUAL escrita aconteceu (tipo de operação, valor, carteira, vencimento).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const root = path.join(__dirname, '..');

const CARTEIRAS = [
  { id: 'p', name: 'Pessoal', is_default: true },
  { id: 'casa', name: 'Casa', is_default: false },
  { id: 'cc', name: 'Crédito Casa', is_default: false },
  { id: 'nu', name: 'Nubank', is_default: false },
];
const CARTOES = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'p' }];
const CONTA = (amount, wallet_id) => ({ grava: true, kind: 'bill', amount, wallet_id });
const GASTO = (amount, wallet_id) => ({ grava: true, kind: 'transaction', amount, wallet_id });
/* Frase -> o que as três entradas fazem; `null` = não grava (revisão). */
const FRASES = {
  'conta de luz 180 reais vence dia 10': CONTA(180, 'p'),
  'conta de água 90 reais vence dia 5': CONTA(90, 'p'),
  'conta de internet 100 reais vence dia 15': CONTA(100, 'p'),
  'conta de luz 180 reais vence dia 10 na carteira Casa': CONTA(180, 'casa'),
  'mercado 34 reais na conta pessoal': GASTO(34, 'p'),
  'mercado 50 reais na conta Nubank': GASTO(50, 'nu'),
  'almoço 40 reais conta corrente Casa': GASTO(40, 'casa'),
  'almoço 40 reais na carteira Crédito Casa': GASTO(40, 'cc'),
  'hotel 500 reais carteira Viagem': null,
  'almoço 40 reais na conta do Inter': null,
};

const resumo = (kind, p) => p
  ? { grava: true, kind, amount: Number(p.amount), wallet_id: p.wallet_id }
  : { grava: false };

/* ── Voz: núcleo real ───────────────────────────────────────────────────── */
function carregarVm(arquivo, dubles = {}, cache = new Map()) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
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
const revisoesVoz = [];
carregarVm('lib/widget-voz-task.ts', {
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { tarefa = factory(); } } },
  './offline-cache': { isLikelyNetworkError: () => false },
  '@/modules/grana-voice-widget': { definirEstado: () => {} },
  './voz': { transcreverAudio: async () => ({ ok: true, transcript: transcricao }) },
  './widget-voz-notificacoes': {
    podeNotificar: async () => true, notificarRevisao: async (titulo) => { revisoesVoz.push(titulo); }, notificarFalha: async () => {},
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
  const e = gravadosVoz[antes];
  return e ? resumo(e.kind, e) : { grava: false };
}

/* ── Granabô: handler real da Edge Function ─────────────────────────────── */
let handler, completions = [], respostas = [];
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
    if (name === 'registrar_operacao_voz') { escritasGranabo.push({ kind: args.p_kind, ...args.p_payload }); return { data: { status: 'committed', ids: ['tx'] }, error: null }; }
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
        const ferramenta = JSON.parse(init.body).messages.filter((x) => x.role === 'tool').at(-1);
        if (ferramenta) respostas.push(ferramenta.content);
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
  const e = escritasGranabo[antes];
  return e ? resumo(e.kind, e) : { grava: false };
}

(async () => {
  let checagens = 0;
  for (const [frase, esperado] of Object.entries(FRASES)) {
    const granabo = await peloGranabo(frase);
    assert.deepEqual(granabo, esperado ?? { grava: false }, `Granabô, "${frase}": ${JSON.stringify(granabo)} | resposta: ${respostas.at(-1)}`);
    for (const fonte of ['app', 'widget']) {
      const antes = revisoesVoz.length;
      const voz = await pelaVoz(frase, fonte);
      assert.deepEqual(voz, granabo, `"${frase}": Granabô ${JSON.stringify(granabo)} x ${fonte} ${JSON.stringify(voz)} (revisão: ${revisoesVoz.slice(antes).join(', ')})`);
      if (!esperado) assert.deepEqual(revisoesVoz.slice(antes), ['Qual carteira?'], `${fonte}, "${frase}": carteira citada e inexistente pergunta a carteira`);
      checagens++;
    }
    if (!esperado) assert.match(respostas.at(-1) ?? '', /Não existe carteira com esse nome/, `Granabô, "${frase}"`);
    console.log(`  ok  ${JSON.stringify(frase)} -> ${granabo.grava ? `${granabo.kind} ${granabo.amount} na carteira ${granabo.wallet_id}` : 'pergunta a carteira'} (Granabô, app e widget)`);
  }
  console.log(`OK conta a pagar x carteira: ${checagens} comparações Granabô x voz (app e widget).`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
