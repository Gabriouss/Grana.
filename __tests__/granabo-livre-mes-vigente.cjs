// Regra 20 no Granabô: "saldo" e "livre para gastar" só do mês vigente.
//
// Decisões do autor: 24/09/2026, "não quero saldo acumulado, quero saldo
// apenas do mês vigente"; 25/09/2026, boleto pendente ou atrasado não entra no
// livre para gastar, só pesa depois de pago (vira saída de caixa). Livre =
// max(0, saldo do mês − cofrinhos) / dias restantes.
//
// Handler REAL da Edge Function, relógio fixo, banco e provedor simulados. Casos:
// o de referência do autor (setembro/2026: saldo 142,67, livre 142,67, 20,38/dia
// com 7 dias), a virada UTC do último dia do mês (o servidor roda em UTC; das
// 21h às 24h de Brasília o UTC já é o dia seguinte), boleto pendente e atrasado
// sem efeito, e a retrospectiva sem crédito no "saldo".
/* O Deno da Edge Function roda em UTC. Sem isto o teste herdaria o fuso da
   máquina (Brasília) e nunca veria o erro das 21h às 24h. */
process.env.TZ = 'UTC';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const casa = (texto, re, nome) => { assert.match(texto, re, nome); passou++; };

/* ── Relógio fixo ───────────────────────────────────────────────────────── */
const DataReal = Date;
let agoraFixo = DataReal.parse('2026-09-24T15:00:00-03:00');
class DataFixa extends DataReal {
  constructor(...a) { super(...(a.length ? a : [agoraFixo])); }
  static now() { return agoraFixo; }
}
global.Date = DataFixa;

/* ── Banco simulado ─────────────────────────────────────────────────────── */
const userId = 'usuario-a';
let TX = [];
let BILLS = [];
let GOALS = [];
const tabelasLidas = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; } order() { return this; } limit() { return this; } in() { return this; } is() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
  gte(k, v) { this.filters.push((r) => String(r[k]) >= v); return this; }
  lte(k, v) { this.filters.push((r) => String(r[k]) <= v); return this; }
  maybeSingle() { this.single = true; return this; }
  insert() { return Promise.resolve({ error: null }); }
  then(resolve, reject) {
    tabelasLidas.push(this.table);
    let rows = this.table === 'transactions' ? TX : this.table === 'bills' ? BILLS : this.table === 'goals' ? GOALS
      : this.table === 'budgets' ? [] : this.table === 'categories' ? [] : [];
    rows = rows.map((r) => ({ user_id: userId, ...r })).filter((r) => this.filters.every((f) => f(r)));
    return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
  }
}
let completions = [];
const prompts = [];
const client = {
  auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  from: (table) => new Query(table),
  rpc: async (name) => {
    if (name === 'tem_direito_acesso') return { data: true, error: null };
    if (name === 'consumir_cota_ia') return { data: [{ permitido: true, motivo: null, minuto_restante: 9, dia_restante: 119 }], error: null };
    return { data: [], error: null };
  },
};
let handler;
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const m = new Module(file, module); modules.set(file, m);
  m.require = (name) => {
    if (name.startsWith('npm:') && name.endsWith('/cors')) return { corsHeaders: {} };
    if (name.startsWith('npm:')) return { createClient: () => client };
    if (name.endsWith('/seguranca.ts')) return { criarRateLimiter: () => () => false,
      fetchComTimeout: async (_, init) => { prompts.push(JSON.parse(init.body)); return Response.json({ choices: [{ message: completions.shift() }] }); } };
    return load(path.resolve(path.dirname(file), name));
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}
global.Deno = { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } };
load(path.resolve(__dirname, '../supabase/functions/assistente-financeiro/index.ts'));
const tool = (name, args = {}) => ({ role: 'assistant', content: null, tool_calls: [{ id: '1', function: { name, arguments: JSON.stringify(args) } }] });
async function perguntar(chamada) {
  completions = [chamada, { content: 'ok' }];
  tabelasLidas.length = 0;
  const res = await handler(new Request('http://local', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagem: 'pergunta', historico: [] }) }));
  assert.equal(res.status, 200);
  return prompts.at(-1).messages.filter((m) => m.role === 'tool').at(-1).content;
}
const caixa = (type, amount, occurred_on, extra = {}) => ({ type, amount, occurred_on, category: 'X', color: '#000', recurring: false, payment_method: null, card_id: null, ...extra });

(async () => {
  /* ── Caso de referência do autor (setembro/2026) ─────────────────────── */
  TX = [
    // Meses anteriores com sobra grande: NÃO podem entrar (era o saldo acumulado de 9.668,07).
    caixa('in', 9000, '2026-08-10'), caixa('out', 400, '2026-07-01'),
    // Setembro, caixa: 2.948,00 − 2.805,33 = 142,67.
    caixa('in', 2948, '2026-09-05'), caixa('out', 2805.33, '2026-09-10'),
    // Compra no crédito no mês: fora do caixa.
    caixa('out', 500, '2026-09-12', { payment_method: 'credit', card_id: 'c6' }),
  ];
  BILLS = [
    { amount: 53.59, due_date: '2026-09-21', status: 'due' },  // atrasado
    { amount: 150, due_date: '2026-09-28', status: 'due' },    // pendente no mês
    { amount: 69.9, due_date: '2026-08-10', status: 'due' },   // atrasado de mês anterior
  ];
  GOALS = [];
  agoraFixo = DataReal.parse('2026-09-24T15:00:00-03:00');
  const livre = await perguntar(tool('livreParaGastar'));
  casa(livre, /saldo do mês R\$ 142,67/, 'referência do autor: saldo do mês 142,67 (sem os meses anteriores)');
  casa(livre, /Livre para gastar no mês vigente \(01\/09\/2026 a 30\/09\/2026\): R\$ 142,67/, 'referência: livre 142,67 no total');
  casa(livre, /R\$ 20,38 por dia \(7 dias restantes\)/, 'referência: 20,38 por dia com 7 dias');
  ok(!/9\.\d{3},\d{2}/.test(livre), 'nenhum número de saldo acumulado aparece');
  ok(!tabelasLidas.includes('bills'), 'boleto nem é consultado para o livre para gastar');

  /* Boleto pago vira saída de caixa e aí, sim, pesa. */
  TX.push(caixa('out', 42.67, '2026-09-20', { description: 'Pagamento Enel' }));
  const comPago = await perguntar(tool('livreParaGastar'));
  casa(comPago, /saldo do mês R\$ 100,00/, 'boleto pago (saída de caixa) desconta do saldo do mês');
  TX.pop();

  /* Cofrinho desconta do livre, não do saldo. */
  GOALS = [{ current_amount: 42.67 }];
  const comMeta = await perguntar(tool('livreParaGastar'));
  casa(comMeta, /: R\$ 100,00\n/, 'cofrinho desconta do livre');
  casa(comMeta, /saldo do mês R\$ 142,67/, 'e não muda o saldo do mês');
  GOALS = [];

  /* Saldo negativo: livre fica em zero. */
  TX.push(caixa('out', 1000, '2026-09-15'));
  const negativo = await perguntar(tool('livreParaGastar'));
  casa(negativo, /: R\$ 0,00\n/, 'saldo negativo: livre em zero');
  casa(negativo, /saldo do mês R\$ -857,33/, 'e o saldo negativo é informado');
  TX.pop();

  /* ── Virada UTC: 30/09 às 23h30 em Brasília já é 01/10 em UTC ──────── */
  agoraFixo = DataReal.parse('2026-09-30T23:30:00-03:00');
  TX.push(caixa('in', 1000, '2026-10-01'));
  const virada = await perguntar(tool('livreParaGastar'));
  casa(virada, /mês vigente \(01\/09\/2026 a 30\/09\/2026\)/, 'às 23h30 de 30/09 em Brasília, o mês ainda é setembro');
  casa(virada, /\(1 dias restantes\)/, 'e resta 1 dia (hoje), não o mês de outubro inteiro');
  casa(virada, /saldo do mês R\$ 142,67/, 'lançamento de outubro não entra no saldo de setembro');
  TX.pop();

  /* O prompt diz ao modelo a data de Brasília, não a de UTC. */
  const promptSistema = prompts.at(-1).messages.find((m) => m.role === 'system').content;
  ok(/30 de setembro de 2026/.test(promptSistema), 'o prompt informa 30/09 às 23h30 de Brasília, não 01/10');

  /* ── Retrospectiva: o "saldo" do mês fechado é de caixa ─────────────── */
  agoraFixo = DataReal.parse('2026-10-05T10:00:00-03:00');
  TX = [
    caixa('in', 1000, '2026-09-05'), caixa('out', 300, '2026-09-10'),
    caixa('out', 500, '2026-09-12', { payment_method: 'credit', card_id: 'c6' }),
    caixa('out', 200, '2026-09-14', { payment_method: null, card_id: 'c6' }),
  ];
  BILLS = [];
  const retro = await perguntar(tool('retrospectivaDoMes'));
  casa(retro, /Saldo: R\$ 700,00/, 'retrospectiva: saldo de caixa (1.000 − 300), sem as compras no crédito');

  /* ── A função pura, direto: o handler já recorta o mês na consulta, então
     só aqui aparece um recorte de mês que falhe. ─────────────────────────── */
  const { calcularLivreParaGastar } = load(path.resolve(__dirname, '../supabase/functions/_shared/caixa.ts'));
  const r = calcularLivreParaGastar(
    [caixa('in', 9000, '2026-08-10'), caixa('in', 2948, '2026-09-05'), caixa('out', 2805.33, '2026-09-10'),
      caixa('out', 500, '2026-09-12', { payment_method: 'credit' }), caixa('in', 30, '2026-09-13', { card_id: 'c6' }),
      caixa('in', 1000, '2026-10-01')],
    [{ current_amount: 0 }],
    '2026-09-24',
  );
  ok(Math.abs(r.saldoAtual - 142.67) < 1e-9, 'função pura: só setembro, só caixa (sem agosto, outubro, compra nem estorno no cartão)');
  ok(r.diasRestantes === 7 && Math.abs(r.livrePorDia - 142.67 / 7) < 1e-9, 'função pura: 7 dias e livre por dia');
  ok(!('contasFixasPendentes' in r), 'função pura: boleto não faz parte do contrato');
  ok(calcularLivreParaGastar([], [], '2026-02-28').diasRestantes === 1 && calcularLivreParaGastar([], [], '2028-02-28').diasRestantes === 2,
    'dias restantes no fim de fevereiro, com e sem ano bissexto');

  global.Date = DataReal;
  console.log(`granabo-livre-mes-vigente: ${passou} checagens OK`);
})().catch((e) => { global.Date = DataReal; console.error(e); process.exitCode = 1; });
