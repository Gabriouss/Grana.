/*
 * Apelidos ensinados no Granabô valem na voz (app e widget), com a mesma
 * decisão do chat. Módulos reais (handler da Edge Function e núcleo
 * `lib/widget-voz-task.ts`); banco, rede e notificação são dublês.
 *
 *   node __tests__/voz-apelidos-paridade.cjs
 *
 * Autor, 15/10/2026: "Sobre os apelidos: sim", à pergunta se os apelidos que a
 * pessoa ensina no chat (`assistant_memory`, tipo `vocabulario`) devem valer
 * também na voz. Até então a voz não os lia: "lança 30 de gororoba", com
 * "gororoba" ensinado como Alimentação, ia à revisão na voz.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const root = path.join(__dirname, '..');

const CARTEIRAS = [{ id: 'w', name: 'Pessoal', is_default: true }];
let CARTOES = [];
let APELIDOS = [];
let apelidosFalham = false;
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
    if (this.table === 'assistant_memory' && apelidosFalham) {
      return Promise.resolve({ data: null, error: { message: 'falha simulada' } }).then(resolve, reject);
    }
    const rows = this.table === 'credit_cards' ? CARTOES : this.table === 'wallets' ? CARTEIRAS
      : this.table === 'assistant_memory' ? APELIDOS : [];
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
  './data': { fetchCreditCards: async () => CARTOES, fetchApelidosCategoria: async () => { if (apelidosFalham) throw new Error('falha simulada'); return APELIDOS.filter((a) => a.chave.startsWith('categoria:')); }, fetchCategories: async () => [] },
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


const APELIDOS_DA_PESSOA = [
  { chave: 'categoria:gororoba', valor: 'Alimentação' },
  { chave: 'categoria:streaming', valor: 'assinaturas' },
  { chave: 'categoria:uber', valor: 'Lazer' },
  { chave: 'categoria:bicho', valor: 'Pets' },
  { chave: 'cartao:nu', valor: 'Nubank' },
];

async function nasTres(frase) {
  gravados.length = 0;
  await conversa([frase]);
  const granabo = gravados.map(resumo)[0] ?? null;
  const app = await pelaVoz(frase, 'app');
  const widget = await pelaVoz(frase, 'widget');
  return { granabo, app, widget };
}

(async () => {
  APELIDOS = APELIDOS_DA_PESSOA;
  const CASOS = [
    ['lança 30 de gororoba', ['Gororoba', 30, 'Alimentação']],
    ['gororoba 30 reais', ['Gororoba', 30, 'Alimentação']],
    ['streaming 40 reais', ['Streaming', 40, 'Assinaturas']],
    // O apelido vence a palavra-chave: foi a pessoa que ensinou.
    ['uber 20 reais', ['Uber', 20, 'Lazer']],
    // Palavra-chave sem apelido continua valendo.
    ['mercado 50 reais', ['Mercado', 50, 'Alimentação']],
    // Apelido para categoria que não existe é ignorado: pergunta / revisão.
    ['bicho 50 reais', null],
    // Só a palavra inteira: "gororobas" não é o apelido "gororoba".
    ['gororobas 30 reais', null],
    // Apelido de cartão não decide categoria.
    ['nu 30 reais', null],
  ];
  for (const [frase, esperado] of CASOS) {
    const { granabo, app, widget } = await nasTres(frase);
    igual(granabo, esperado, `Granabô, "${frase}"`);
    igual(app, granabo, `voz app = Granabô, "${frase}"`);
    igual(widget, granabo, `voz widget = Granabô, "${frase}"`);
  }

  /* Sem apelidos ensinados, "gororoba" não decide nada, nas três. */
  APELIDOS = [];
  {
    const { granabo, app, widget } = await nasTres('lança 30 de gororoba');
    igual([granabo, app, widget], [null, null, null], 'sem apelido, "gororoba" não grava em nenhuma entrada');
  }

  /* Falha ao ler os apelidos: nada grava errado e o motivo fica no log. */
  APELIDOS = APELIDOS_DA_PESSOA;
  apelidosFalham = true;
  const logs = [];
  const erroOriginal = console.error, avisoOriginal = console.warn;
  console.error = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  try {
    const { granabo, app, widget } = await nasTres('lança 30 de gororoba');
    igual([granabo, app, widget], [null, null, null], 'apelidos indisponíveis: nenhuma entrada grava "gororoba"');
    ok(logs.some((l) => /apelidos indispon/.test(l) && /assistente-financeiro/.test(l)), 'o Granabô registra a falha no log');
    ok(logs.some((l) => /\[voz\] apelidos do Granabô indispon/.test(l)), 'a voz registra a falha no log');
    const { granabo: g2, app: a2 } = await nasTres('mercado 50 reais');
    igual([g2, a2], [['Mercado', 50, 'Alimentação'], ['Mercado', 50, 'Alimentação']], 'e a palavra-chave continua funcionando');
  } finally {
    console.error = erroOriginal; console.warn = avisoOriginal; apelidosFalham = false;
  }

  /* A função, direto. */
  const { categoriaPorApelido } = interp;
  igual(categoriaPorApelido('Gororôba 30', APELIDOS_DA_PESSOA)?.name, 'Alimentação', 'caixa e acento não importam');
  igual(categoriaPorApelido('pagar a ração do bicho', APELIDOS_DA_PESSOA, [{ name: 'Pets', color: '#000' }])?.name, 'Pets',
    'apelido para categoria da pessoa resolve quando ela existe');
  igual(categoriaPorApelido('lanche', APELIDOS_DA_PESSOA), null, 'sem apelido, null');

  console.log(`voz-apelidos-paridade: ${passou} verificacoes OK`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
