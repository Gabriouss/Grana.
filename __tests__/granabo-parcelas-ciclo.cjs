// Parcela pelo ciclo da compra original no Granabô (23/09/2026). Handler real
// da Edge Function; banco e provedor simulados, com gte/lte/in de verdade para
// a compra original poder ficar FORA da janela consultada. Sem rede/contas.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
let handler, completions = [], prompts = [], userId = 'usuario-a', rpcFails = false;
const memories = [];
const history = [];
const rpcs = [];
const consultasPorId = [];
let linhas = [];
const agora = new Date();
const transacaoNaFaturaAtual = [agora.getFullYear(), agora.getMonth() + 1, agora.getDate()]
  .map((parte, indice) => indice === 0 ? String(parte) : String(parte).padStart(2, '0'))
  .join('-');
class Query {
  constructor(table) { this.table = table; this.filters = []; this.remover = false; }
  select() { return this; } order() { return this; } limit() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
  gte(k, v) { this.filters.push((r) => r[k] >= v); return this; }
  lte(k, v) { this.filters.push((r) => r[k] <= v); return this; }
  in(k, vs) { this.filters.push((r) => vs.includes(r[k])); consultasPorId.push(vs); return this; }
  delete() { this.remover = true; return this; }
  maybeSingle() { this.single = true; return this; }
  insert(rows) { history.push(...[].concat(rows).map((r) => ({ tabela: this.table, ...r }))); return Promise.resolve({ error: null }); }
  then(resolve, reject) {
    let rows = this.table === 'assistant_memory' ? memories : this.table === 'credit_cards'
      ? [{ user_id: userId, id: 'c29', name: 'C29', bank: 'c6', wallet_id: 'w', closing_day: 29, limit_amount: 1000 }]
      : this.table === 'categories' ? [{ user_id: userId, name: 'Alimentação' }]
      : this.table === 'wallets' ? [{ user_id: userId, id: 'w', name: 'Pessoal', is_default: true }]
      : this.table === 'transactions' ? linhas : [];
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
(async () => {
  const resultadoDaFerramenta = () => prompts.at(-1).messages.filter((m) => m.role === 'tool').at(-1).content;
  /* Compra em 28/01/2026 em 14x num cartão que fecha dia 29. A parcela 14 é
     gravada em 28/02/2027. Pela DATA ela cairia na fatura de março de 2027
     (fevereiro fecha dia 28); pela COMPRA ela é a fatura de fevereiro de
     2027 (janeiro/2026 + 13). A compra original está fora da janela
     consultada e precisa ser buscada por id. */
  const base = { user_id: userId, category: 'Alimentação', card_id: 'c29', type: 'out', payment_method: 'credit', amount: 10, installment_total: 14 };
  const pai = { ...base, id: 'p1', occurred_on: '2026-01-28', installment_current: 1, parent_id: null };
  const p14 = { ...base, id: 'p14', occurred_on: '2027-02-28', installment_current: 14, parent_id: 'p1' };

  linhas = [pai, p14];
  completions = [tool('resumoCredito', { cartao: 'C29', mes: 2, ano: 2027 }), { content: 'ok' }];
  await ask('quanto está a fatura de fevereiro de 2027 do C29?');
  assert.match(resultadoDaFerramenta(), /R\$ 10,00/, 'a parcela 14 entra na fatura de fevereiro pela compra');
  assert.ok(consultasPorId.some((ids) => ids.includes('p1')), 'a compra original foi buscada por id');
  assert.doesNotMatch(resultadoDaFerramenta(), /não achei a compra original/);

  completions = [tool('resumoCredito', { cartao: 'C29', mes: 3, ano: 2027 }), { content: 'ok' }];
  await ask('e a de março?');
  assert.match(resultadoDaFerramenta(), /R\$ 0,00/, 'e não aparece em março, onde a data a colocaria');

  linhas = [p14]; // compra original apagada
  completions = [tool('resumoCredito', { cartao: 'C29', mes: 2, ano: 2027 }), { content: 'ok' }];
  await ask('e a de fevereiro, sem a compra original?');
  assert.match(resultadoDaFerramenta(), /não achei a compra original/, 'a fatura que pode ter perdido a parcela também avisa');

  completions = [tool('resumoCredito', { cartao: 'C29', mes: 3, ano: 2027 }), { content: 'ok' }];
  await ask('e a de março, sem a compra original?');
  assert.match(resultadoDaFerramenta(), /não achei a compra original/, 'sem a compra, avisa que o total pode estar incompleto');

  linhas = [pai, p14];
  completions = [tool('gastoPorCategoria', { categoria: 'Alimentação', fatura: true, cartao: 'C29', mes: 2, ano: 2027 }), { content: 'ok' }];
  await ask('quanto de alimentação na fatura de fevereiro de 2027 do C29?');
  assert.match(resultadoDaFerramenta(), /R\$ 10,00/, 'gasto por categoria na fatura segue a mesma regra');

  linhas = [p14];
  completions = [tool('gastoPorCategoria', { categoria: 'Alimentação', fatura: true, cartao: 'C29', mes: 2, ano: 2027 }), { content: 'ok' }];
  await ask('quanto de alimentação em fevereiro, sem a compra original?');
  assert.match(resultadoDaFerramenta(), /não achei a compra original/, 'categoria também avisa sobre parcela possivelmente ausente');

  console.log('OK Granabô: parcela de cartão 29-31 pela fatura da compra original (resumo e categoria), com aviso quando a compra falta.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
