// Integração offline: handler real, banco e provedor simulados. Sem rede/contas.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
let handler, completions = [], prompts = [], userId = 'usuario-a', rpcFails = false;
const memories = [];
const history = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; this.remover = false; }
  select() { return this; } order() { return this; } limit() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq(k, v) { this.filters.push((r) => r[k] !== v); return this; }
  gte() { return this; } lte() { return this; }
  delete() { this.remover = true; return this; }
  maybeSingle() { this.single = true; return this; }
  insert(rows) { history.push(...rows); return Promise.resolve({ error: null }); }
  then(resolve, reject) {
    let rows = this.table === 'assistant_memory' ? memories : this.table === 'credit_cards'
      ? [{ user_id: userId, id: 'c6', name: 'C6', closing_day: 15, limit_amount: 1000 }]
      : this.table === 'categories' ? [{ user_id: userId, name: 'Alimentação' }]
      : this.table === 'transactions' ? [{ user_id: userId, amount: 130, category: 'Alimentação', card_id: 'c6', occurred_on: '2026-09-06', type: 'out', payment_method: 'credit' }] : [];
    rows = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.remover) rows.forEach((r) => memories.splice(memories.indexOf(r), 1));
    return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
  }
}
const client = {
  auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
  from: (table) => new Query(table),
  rpc: async (name, args) => {
    if (name === 'buscar_exemplos_similares') return { data: memories.filter((m) => m.user_id === args.p_user_id && m.tipo === 'exemplo'), error: null };
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
  const pergunta = 'Quanto gastei em Alimentação no cartão C6?';
  completions = [tool('resumoCredito', { cartao: 'C6', categoria: 'Alimentação' }), { content: 'Você gastou R$ 130,00 em Alimentação no cartão C6.' }];
  const resposta = await ask(pergunta);
  const exemplo = () => memories.find((m) => m.user_id === userId && m.tipo === 'exemplo');
  assert.equal(JSON.parse(exemplo().valor).validacao, 'execucao_verificada');
  const h = [{ papel: 'usuario', texto: pergunta }, { papel: 'assistente', texto: resposta }];
  completions = [{ content: 'Entendido!' }]; await ask('Agora sim!', h);
  assert.equal(JSON.parse(exemplo().valor).validacao, 'confirmado_usuario');
  assert.ok(prompts.at(-1).messages[0].content.includes('"cartao":"C6"'));
  completions = [{ content: 'Vou considerar sua correção.' }]; await ask('Não foi isso que eu pedi', h);
  assert.equal(exemplo(), undefined);
  assert.ok(prompts.at(-1).messages[0].content.includes('Plano rejeitado'));
  completions = [{ content: 'Pode indicar o cartão?' }]; await ask('E agora?', [{ papel: 'assistente', texto: 'Outra conversa' }]);
  assert.equal(prompts.at(-1).messages[0].content.includes('Última consulta executada'), false);
  const estado = memories.find((m) => m.chave === '__conversa');
  estado.valor = JSON.stringify({ ...JSON.parse(estado.valor), atualizado: Date.now() - 31 * 60_000 });
  completions = [{ content: 'Pode indicar o período?' }]; await ask('E agora?', h);
  assert.equal(prompts.at(-1).messages[0].content.includes('Última consulta executada'), false);
  userId = 'usuario-b'; completions = [{ content: 'Olá!' }]; await ask('Oi');
  assert.equal(prompts.at(-1).messages[0].content.includes('"cartao":"C6"'), false);
  rpcFails = true;
  completions = [tool('lembrarPreferencia', { chave: 'formato', preferencia: 'Respostas curtas' }), { content: 'Não consegui guardar a preferência agora.' }];
  await ask('Prefiro respostas curtas');
  const result = prompts.at(-1).messages.find((m) => m.role === 'tool');
  assert.match(result.content, /Não consegui guardar/);
  assert.equal(memories.some((m) => m.user_id === 'usuario-b'), false);
  rpcFails = false;
  for (const preferencia of ['Respostas curtas', 'Respostas detalhadas']) {
    completions = [tool('lembrarPreferencia', { chave: 'formato', preferencia }), { content: 'Preferência guardada.' }];
    await ask('Prefiro ' + preferencia);
  }
  const preferencias = memories.filter((m) => m.user_id === 'usuario-b' && m.chave === 'preferencia:formato');
  assert.equal(preferencias.length, 1); assert.equal(preferencias[0].valor, 'Respostas detalhadas');
  console.log('OK integração: consulta → memória → confirmação → rejeição; isolamento por usuário; erro de persistência.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
