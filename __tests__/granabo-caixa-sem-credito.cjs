// Granabô não soma compra no crédito no caixa (S43/A46, 23/09/2026).
//
// Sentinel: "quanto gastei em alimentação este mês" respondia R$ 486,41
// enquanto Gráficos mostrava R$ 141,41; a diferença eram 300 + 45 de compras
// no crédito. O `5d72611` só acrescentou um aviso ao texto. A mesma soma
// acontecia em resumoMes e livreParaGastar.
//
// Handler REAL da Edge Function; banco e provedor simulados, mesmo andaime de
// granabo-estorno-credito.cjs. A regra do servidor (`_shared/caixa.ts`) é
// comparada com `isCreditTx` do app (`lib/transaction-rules.ts`), os dois
// módulos reais.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const casa = (texto, re, nome) => { assert.match(texto, re, nome); passou++; };

const transpilar = (arquivo) => ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function modulo(arquivo) {
  const exports = {};
  vm.runInNewContext(transpilar(path.join(__dirname, '..', arquivo)), { exports, require: () => ({}) });
  return exports;
}

/* ── Paridade da regra: servidor x app ─────────────────────────────────── */
const { ehCompraNoCredito } = modulo('supabase/functions/_shared/caixa.ts');
const { isCreditTx } = modulo('lib/transaction-rules.ts');
for (const payment_method of ['credit', 'debit', 'pix', 'cash', null, undefined, '']) {
  for (const card_id of ['c6', null, undefined, '']) {
    ok(ehCompraNoCredito({ payment_method, card_id }) === isCreditTx({ payment_method, card_id }),
      `paridade: payment_method=${payment_method} card_id=${card_id}`);
  }
}
ok(ehCompraNoCredito({ payment_method: null, card_id: 'c6' }), 'card_id com payment_method nulo conta como crédito');

/* ── Handler real ──────────────────────────────────────────────────────── */
let handler, completions = [], prompts = [];
const userId = 'usuario-a';
const hoje = new Date();
const dia = [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()]
  .map((p, i) => (i === 0 ? String(p) : String(p).padStart(2, '0'))).join('-');
const TX = [
  { amount: 100, category: 'Alimentação', type: 'out', payment_method: 'pix', card_id: null },
  { amount: 41.41, category: 'Alimentação', type: 'out', payment_method: 'debit', card_id: null },
  { amount: 300, category: 'Alimentação', type: 'out', payment_method: 'credit', card_id: 'c6' },
  // Lançamento antigo: cartão sem payment_method.
  { amount: 45, category: 'Alimentação', type: 'out', payment_method: null, card_id: 'c6' },
  // Estorno no cartão: não é receita de caixa.
  { amount: 30, category: 'Alimentação', type: 'in', payment_method: 'credit', card_id: 'c6' },
  // Pagamento da fatura (pagar_fatura_cartao): sai do caixa, sem cartão.
  { amount: 200, category: 'Cartão de crédito', type: 'out', payment_method: null, card_id: null },
  { amount: 1000, category: 'Salário', type: 'in', payment_method: 'pix', card_id: null },
].map((t) => ({ user_id: userId, occurred_on: dia, description: 'AUDIT', ...t }));

const consultasTx = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; this.colunas = null; }
  select(c) { this.colunas = c; return this; } order() { return this; } limit() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
  gte() { return this; } lte() { return this; } is() { return this; } in() { return this; }
  maybeSingle() { this.single = true; return this; }
  insert() { return Promise.resolve({ error: null }); }
  then(resolve, reject) {
    let rows = this.table === 'categories' ? [{ user_id: userId, name: 'Alimentação' }, { user_id: userId, name: 'Salário' }]
      : this.table === 'credit_cards' ? [{ user_id: userId, id: 'c6', name: 'C6', closing_day: 15, due_day: 22, limit_amount: 1000 }]
      : this.table === 'transactions' ? TX
      : [];
    if (this.table === 'transactions') consultasTx.push(this.colunas);
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
  /* O caso do Sentinel: 141,41 no caixa, 345 no crédito. */
  const categoria = await perguntar('quanto gastei em alimentação este mês',
    tool('gastoPorCategoria', { categoria: 'alimentação' }));
  casa(categoria, /gastou R\$ 141,41 em Alimentação/, 'gastoPorCategoria: total de caixa igual a Gráficos (141,41)');
  ok(!/486,41/.test(categoria), 'gastoPorCategoria: não soma o crédito (486,41 era o erro)');
  casa(categoria, /R\$ 345,00 em compras no crédito/, 'gastoPorCategoria: crédito informado à parte, incluindo o cartão sem payment_method');

  /* Modo fatura continua somando o crédito (não muda com esta correção). */
  const fatura = await perguntar('quanto gastei em alimentação no C6',
    tool('gastoPorCategoria', { categoria: 'alimentação', cartao: 'C6' }));
  ok(!/141,41/.test(fatura), 'modo fatura não usa o total de caixa');

  const resumo = await perguntar('como foi meu mês', tool('resumoMes', {}));
  casa(resumo, /Receitas: R\$ 1\.000,00/, 'resumoMes: estorno no cartão não vira receita');
  casa(resumo, /Gastos: R\$ 341,41/, 'resumoMes: gastos de caixa, com o pagamento da fatura e sem as compras no crédito');
  casa(resumo, /Saldo: R\$ 658,59/, 'resumoMes: saldo de caixa');
  casa(resumo, /Compras no crédito no período, fora dos gastos acima: R\$ 345,00/, 'resumoMes: crédito à parte');

  const livre = await perguntar('quanto posso gastar', tool('livreParaGastar', {}));
  casa(livre, /saldo R\$ 658,59/, 'livreParaGastar: saldo de caixa, sem compra nem estorno no cartão');

  ok(consultasTx.some((c) => /payment_method/.test(c) && /card_id/.test(c)), 'as consultas trazem payment_method e card_id para a regra');

  console.log(`granabo-caixa-sem-credito: ${passou} checagens OK`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
