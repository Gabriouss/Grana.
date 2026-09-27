// Entrada no cartão não existe no Grana. (decisão do autor, 26/09/2026) e
// nenhum caminho grava mais uma. A linha `in` ANTIGA no cartão (ou a que uma
// build antiga ainda grava ao importar fatura, antes da migration
// 20260926130000) abate a fatura no app (`somaDaFatura`, lib/creditoFaturas.ts),
// e o Granabô soma EXATAMENTE igual: fatura, fatura por categoria, crédito do
// mês e uso do limite batem com o app (revisão do Watchtower, 26/09/2026).
// Handler real da Edge Function e `somaDaFatura` real do app; banco e provedor
// simulados, mesmo andaime de assistant-memory-integration.cjs. Sem rede/contas.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
let handler, completions = [], prompts = [], userId = 'usuario-a', rpcFails = false;
const memories = [];
const history = [];
const rpcs = [];
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
      ? [{ user_id: userId, id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'w', closing_day: 15, limit_amount: 1000 }]
      : this.table === 'categories' ? [{ user_id: userId, name: 'Alimentação' }]
      : this.table === 'wallets' ? [{ user_id: userId, id: 'w', name: 'Pessoal', is_default: true }]
      : this.table === 'transactions' ? [{ user_id: userId, amount: 130, category: 'Alimentação', card_id: 'c6', occurred_on: transacaoNaFaturaAtual, type: 'out', payment_method: 'credit' }, { user_id: userId, amount: 30, category: 'Alimentação', card_id: 'c6', occurred_on: transacaoNaFaturaAtual, type: 'in', payment_method: 'credit' }] : [];
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
/* Soma do app, módulo real. Os imports dele não entram nesta conta. */
const faturasApp = new Module('creditoFaturas', module);
faturasApp.require = () => ({});
faturasApp._compile(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../lib/creditoFaturas.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, 'creditoFaturas.ts');
const { somaDaFatura } = faturasApp.exports;
const tool = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: '1', function: { name, arguments: JSON.stringify(args) } }] });
async function ask(mensagem, historico = []) {
  const res = await handler(new Request('http://local', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagem, historico }) }));
  assert.equal(res.status, 200); return (await res.json()).resposta;
}
(async () => {
  const resultadoDaFerramenta = () => prompts.at(-1).messages.filter((m) => m.role === 'tool').at(-1).content;

  /* A fatura do app para as mesmas linhas: 130 de compra, 30 de entrada antiga. */
  const doApp = somaDaFatura([{ amount: 130, type: 'out' }, { amount: 30, type: 'in' }]);
  assert.equal(doApp, 100, 'app: a entrada antiga abate');
  const totalDoApp = 'R$ ' + doApp.toFixed(2).replace('.', ',');
  const igualAoApp = (onde) => {
    const r = resultadoDaFerramenta();
    assert.ok(r.includes(totalDoApp), onde + ': mesma soma do app (' + totalDoApp + '), veio: ' + r);
    assert.doesNotMatch(r, /R\$ 130,00|R\$ 160,00/, onde + ': nem ignora nem soma a entrada');
  };

  completions = [tool('resumoCredito', { cartao: 'C6' }), { content: 'ok' }];
  await ask('Quanto está a fatura do C6?');
  igualAoApp('resumoCredito do C6');

  completions = [tool('resumoCredito', { cartao: 'C6', categoria: 'Alimentação' }), { content: 'ok' }];
  await ask('Quanto gastei em Alimentação no C6?');
  igualAoApp('resumoCredito por categoria');

  completions = [tool('resumoCredito', {}), { content: 'ok' }];
  await ask('Quanto gastei no crédito este mês?');
  igualAoApp('resumoCredito sem cartão');

  completions = [tool('alertaDeLimiteCartao', {}), { content: 'ok' }];
  await ask('Como está o limite do meu cartão?');
  igualAoApp('uso do limite');
  assert.match(resultadoDaFerramenta(), /de R\$ 1\.000,00 \(10% do limite\)/, 'uso do limite: 100 de 1.000');

  /* Lançar estorno pelo chat não grava (23/09/2026): antes virava entrada na
     carteira, sem cartão. O Grana. não tem estorno (autor, 26/09/2026): a
     resposta não nomeia estorno e não pede para repetir a frase recusada;
     aponta os caminhos que gravam (compra no cartão ou dinheiro recebido). */
  const rpcsAntes = rpcs.length;
  completions = [tool('criarLancamento', { texto: 'estorno de 50 do mercado no crédito do C6' }), { content: 'ok' }];
  await ask('estorno de 50 do mercado no crédito do C6');
  assert.match(resultadoDaFerramenta(), /^No cartão do Grana\. só entram compras/);
  assert.doesNotMatch(resultadoDaFerramenta(), /não entendi/i, 'não convida a repetir a mesma frase');
  assert.doesNotMatch(resultadoDaFerramenta(), /estorn/i, 'a resposta não fala de estorno');
  assert.match(resultadoDaFerramenta(), /Ainda não registrei nada/);
  assert.equal(rpcs.slice(rpcsAntes).includes('registrar_operacao_voz'), false, 'nenhuma escrita');
  assert.equal(history.filter((r) => r.tabela === 'transactions').length, 0, 'nenhum lançamento inserido');

  console.log('OK Granabô: fatura, fatura por categoria, crédito do mês e uso do limite iguais a somaDaFatura do app com 1 entrada antiga no cartão; entrada citando cartão não é lançada pelo chat.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
