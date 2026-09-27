// Fatura e uso do limite do Granabô somam em CENTAVOS inteiros, como
// `somaDaFatura` no app (achado do Watchtower, 26/09/2026): em ponto flutuante,
// R$ 0,10 + R$ 0,70 dava 0,7999..., e com limite de R$ 1,60 o uso ficava
// abaixo do degrau de 50%. E a entrada no cartão (type 'in') continua
// IGNORADA, não abate (decisão do autor, 26/09/2026). Handler real da Edge
// Function; banco e provedor simulados, andaime de granabo-estorno-credito.cjs.
//   node __tests__/granabo-fatura-centavos.cjs
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
let handler, completions = [], prompts = [], userId = 'usuario-a', rpcFails = false;
const memories = [];
const history = [];
const rpcs = [];
let linhasCredito = [];
let limite = 1000;
const agora = new Date();
const transacaoNaFaturaAtual = [agora.getFullYear(), agora.getMonth() + 1, agora.getDate()]
  .map((parte, indice) => indice === 0 ? String(parte) : String(parte).padStart(2, '0'))
  .join('-');
class Query {
  constructor(table) { this.table = table; this.filters = []; this.remover = false; }
  select() { return this; } order() { return this; } limit() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
  gte() { return this; } lte() { return this; }
  delete() { this.remover = true; return this; }
  maybeSingle() { this.single = true; return this; }
  insert(rows) { history.push(...[].concat(rows).map((r) => ({ tabela: this.table, ...r }))); return Promise.resolve({ error: null }); }
  then(resolve, reject) {
    let rows = this.table === 'assistant_memory' ? memories : this.table === 'credit_cards'
      ? [{ user_id: userId, id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'w', closing_day: 15, limit_amount: limite }]
      : this.table === 'categories' ? [{ user_id: userId, name: 'Alimentação' }]
      : this.table === 'wallets' ? [{ user_id: userId, id: 'w', name: 'Pessoal', is_default: true }]
      : this.table === 'transactions' ? linhasCredito : [];
    rows = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.remover) rows.forEach((r) => memories.splice(memories.indexOf(r), 1));
    return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
  }
}
const client = {
  auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  from: (table) => new Query(table),
  rpc: async (name, args) => {
    rpcs.push(name);
    /* Desde 23/09/2026 o handler pergunta primeiro se a conta tem direito de
       acesso, e recusa sem isso. Aqui a conta é boa: a recusa em si tem teste
       próprio em __tests__/granabo-recusa-conta-bloqueada.cjs. */
    if (name === 'tem_direito_acesso') return { data: true, error: null };
    if (name === 'buscar_exemplos_similares') return { data: memories.filter((m) => m.user_id === args.p_user_id && m.tipo === 'exemplo'), error: null };
    if (name === 'consumir_cota_ia') return { data: [{ permitido: true, motivo: null, minuto_restante: 9, dia_restante: 119 }], error: null };
    if (rpcFails) return { error: { code: 'unavailable' } };
    const key = { user_id: args.p_user_id, tipo: args.p_tipo, chave: args.p_chave };
    const row = memories.find((m) => m.user_id === key.user_id && m.tipo === key.tipo && m.chave === key.chave);
    if (row) row.valor = args.p_valor;
    else memories.push({ ...key, valor: args.p_valor });
    return { error: null };
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
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}
global.Deno = { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } };
load(path.resolve(__dirname, '../supabase/functions/assistente-financeiro/index.ts'));
const tool = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: '1', function: { name, arguments: JSON.stringify(args) } }] });
async function ask(mensagem, historico = []) {
  const res = await handler(new Request('http://local', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagem, historico }) }));
  assert.equal(res.status, 200); return (await res.json()).resposta;
}
const linha = (amount, type = 'out') => ({ user_id: userId, amount, category: 'Alimentação', card_id: 'c6', occurred_on: transacaoNaFaturaAtual, type, payment_method: 'credit' });
(async () => {
  const resultadoDaFerramenta = () => prompts.at(-1).messages.filter((m) => m.role === 'tool').at(-1).content;

  /* Borda do Watchtower: 0,10 + 0,70 + 0,10 de compra, e 0,10 de entrada no
     cartão, que agora fica de fora. */
  linhasCredito = [linha(0.10), linha(0.70), linha(0.10), linha(0.10, 'in')];
  for (const [args, onde] of [[{ cartao: 'C6' }, 'fatura do C6'], [{ cartao: 'C6', categoria: 'Alimentação' }, 'fatura por categoria'], [{}, 'crédito do mês']]) {
    completions = [tool('resumoCredito', args), { content: 'ok' }];
    await ask('Quanto está a fatura?');
    assert.ok(resultadoDaFerramenta().includes('R$ 0,90 '), onde + ': 0,10 + 0,70 + 0,10, sem a entrada, veio: ' + resultadoDaFerramenta());
    assert.ok(!/R\$ (0,80|1,00) /.test(resultadoDaFerramenta()), onde + ': a entrada no cartão não abate nem soma');
  }

  /* Uso do limite: 0,10 + 0,70 de 1,60 é exatamente 50%, e passa o degrau. */
  limite = 1.60;
  linhasCredito = [linha(0.10), linha(0.70), linha(0.10, 'in')];
  completions = [tool('alertaDeLimiteCartao', {}), { content: 'ok' }];
  await ask('Como está o limite do meu cartão?');
  assert.ok(resultadoDaFerramenta().includes('C6: R$ 0,80 de R$ 1,60 (50% do limite) — atenção: já passou de 50% do limite'),
    'uso do limite em centavos: 0,80 de 1,60 é 50% e avisa o degrau, veio: ' + resultadoDaFerramenta());

  console.log('OK Granabô em centavos: fatura 0,10 + 0,70 + 0,10 = 0,90 sem a entrada no cartão, nas três consultas; 0,80 de 1,60 = 50% do limite, com o aviso.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
