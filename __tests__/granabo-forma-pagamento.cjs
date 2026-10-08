// Granabô: "Não informado / Outros" na pergunta de crédito e débito (Meridian,
// 07/10/2026). O app não pede forma de pagamento no formulário manual, e a fala
// só a grava quando diz "débito", "pix" ou "dinheiro". A consulta agrupava pelo
// valor cru do campo, e o modelo inventava que a pessoa "não preencheu".
//
// Handler REAL da Edge Function, mesmo andaime de granabo-caixa-sem-credito.cjs.
// Os grupos são os do app: `ehCompraNoCredito`, cuja paridade com `isCreditTx`
// aquele teste já trava.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const casa = (texto, re, nome) => { assert.match(texto, re, nome); passou++; };
const transpilar = (arquivo) => ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let handler, completions = [], prompts = [];
const userId = 'usuario-a';
const hoje = new Date();
const dia = [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()]
  .map((p, i) => (i === 0 ? String(p) : String(p).padStart(2, '0'))).join('-');
// Os valores do print: 816,51 no crédito, 10,98 dito "débito", 381,91 sem forma.
const TX = [
  { amount: 816.51, payment_method: 'credit', card_id: 'c6' },
  { amount: 10.98, payment_method: 'debit', card_id: null },
  { amount: 300, payment_method: null, card_id: null },
  { amount: 81.91, payment_method: null, card_id: null },
].map((t) => ({ user_id: userId, occurred_on: dia, description: 'AUDIT', category: 'Alimentação', type: 'out', ...t }));

class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; } order() { return this; } limit() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
  is(k, v) { this.filters.push((r) => (r[k] ?? null) === v); return this; }
  /* Só as duas expressões que a consulta usa; qualquer outra falha alto. */
  or(expr) {
    if (expr === 'payment_method.eq.credit,card_id.not.is.null') this.filters.push((r) => r.payment_method === 'credit' || r.card_id != null);
    else if (expr === 'payment_method.is.null,payment_method.neq.credit') this.filters.push((r) => r.payment_method == null || r.payment_method !== 'credit');
    else throw new Error('or() nao simulado: ' + expr);
    return this;
  }
  gte() { return this; } lte() { return this; } in() { return this; } ilike() { return this; } gt() { return this; }
  maybeSingle() { this.single = true; return this; }
  insert() { return Promise.resolve({ error: null }); }
  then(resolve, reject) {
    let rows = this.table === 'categories' ? [{ user_id: userId, name: 'Alimentação' }]
      : this.table === 'credit_cards' ? [{ user_id: userId, id: 'c6', name: 'C6', closing_day: 15, due_day: 22, limit_amount: 1000 }]
      : this.table === 'transactions' ? TX
      : [];
    rows = rows.filter((r) => this.filters.every((f) => f(r)));
    return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
  }
}
const client = {
  auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  from: (table) => new Query(table),
  rpc: async (name) => {
    if (name === 'tem_direito_acesso') return { data: true, error: null };
    if (name === 'consumir_cota_ia') return { data: [{ permitido: true, motivo: null, minuto_restante: 9, dia_restante: 119 }], error: null };
    if (name === 'buscar_exemplos_similares') return { data: [], error: null };
    return { data: null, error: null };
  },
};
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
  m._compile(transpilar(file), file);
  return m.exports;
}
global.Deno = { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } };
load(path.resolve(__dirname, '../supabase/functions/assistente-financeiro/index.ts'));
const tool = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: '1', function: { name, arguments: JSON.stringify(args) } }] });
async function perguntar(mensagem, chamada) {
  completions = [chamada, { content: 'ok' }];
  const res = await handler(new Request('http://local', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagem, historico: [] }) }));
  assert.equal(res.status, 200);
  return prompts.at(-1).messages.filter((m) => m.role === 'tool').at(-1).content;
}

(async () => {
  const proibido = /n[ãa]o informado|outros|n[ãa]o preench|n[ãa]o cadastr/i;

  /* 1. A pergunta do print: agrupado, dois grupos, os do app. */
  const agrupado = await perguntar('quanto gastei em alimentação nos últimos 30 dias no crédito e no débito',
    tool('consultarLancamentos', { operacao: 'somar', categoria: 'alimentação', ultimos_dias: 30, agrupar_por: 'forma_pagamento' }));
  casa(agrupado, /- Crédito: R\$ 816,51 \(1 lançamento/, 'grupo Crédito com o valor do print');
  casa(agrupado, /- Débito, Pix e dinheiro: R\$ 392,89 \(3 lançamento/, 'débito e sem forma no mesmo grupo (10,98 + 381,91)');
  casa(agrupado, /R\$ 10,98 marcados como débito/, 'o que teve a forma dita vira detalhe');
  ok(!proibido.test(agrupado), 'nenhum grupo "não informado" nem "outros"');
  ok((agrupado.match(/^- /gm) || []).length === 2, 'só dois grupos');

  /* 2. Filtro "débito": soma o grupo inteiro, com a ressalva. */
  const debito = await perguntar('quanto gastei no débito em alimentação',
    tool('consultarLancamentos', { operacao: 'somar', categoria: 'alimentação', forma_pagamento: 'debit' }));
  casa(debito, /Total: R\$ 392,89 em 3 lançamento/, '"débito" soma débito, Pix, dinheiro e sem forma');
  casa(debito, /não separa débito, Pix e dinheiro/, 'com a ressalva de que o Grana. não separa');
  ok(!proibido.test(debito), 'filtro débito sem culpar a pessoa');

  /* 3. "fora_do_credito" contém a palavra "credito": tem de cair fora. */
  const fora = await perguntar('quanto gastei fora do crédito em alimentação',
    tool('consultarLancamentos', { operacao: 'somar', categoria: 'alimentação', forma_pagamento: 'fora_do_credito' }));
  casa(fora, /Total: R\$ 392,89/, 'fora_do_credito não cai no crédito');
  ok(!/não separa/.test(fora), 'pedido explícito do grupo não leva ressalva');

  /* 4. "credito": a regra do app. */
  const credito = await perguntar('quanto gastei no crédito em alimentação',
    tool('consultarLancamentos', { operacao: 'somar', categoria: 'alimentação', forma_pagamento: 'credito' }));
  casa(credito, /Total: R\$ 816,51 em 1 lançamento/, 'crédito soma só o cartão');
  casa(credito, /pagos no crédito/, 'filtro citado com nome de gente');

  /* 5. O parâmetro e as regras do prompt, como o modelo os recebe. */
  const req = prompts.at(-1);
  const param = req.tools.find((t) => t.function.name === 'consultarLancamentos').function.parameters.properties.forma_pagamento;
  ok(/"credito"/.test(param.description) && /"fora_do_credito"/.test(param.description), 'parâmetro descreve os dois grupos do app');
  ok(!param.enum, 'sem enum: o validador recusaria "debit" em vez de normalizar');
  ok(!/"debit"|"dinheiro"\./.test(param.description), 'a descrição não sugere valores crus');
  const sistema = req.messages.find((m) => m.role === 'system').content;
  casa(sistema, /NUNCA crie um grupo "Não informado" ou "Outros"/, 'regra: sem grupo não informado');
  casa(sistema, /NUNCA diga que o usuário deixou de preencher/, 'regra: não culpa o usuário');
  casa(sistema, /sem negrito, sem asteriscos.*sem travessão/, 'regra: texto sem markdown e sem travessão');

  console.log(`granabo-forma-pagamento: ${passou} checagens OK`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
