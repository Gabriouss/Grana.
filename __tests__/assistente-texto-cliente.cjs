const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const fonte = fs.readFileSync('lib/assistente.ts', 'utf8');
const codigo = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const original = 'Seu saldo: **R$ 500,00**.\n**Disponivel**: R$ 20,00 * 2.\nSem par **fica.';
const esperado = 'Seu saldo: R$ 500,00.\nDisponivel: R$ 20,00 * 2.\nSem par **fica.';
const entrada = { id: 'u', papel: 'usuario', texto: '**minha mensagem**', ferramenta_usada: null, criado_em: '2026-10-02' };
const resposta = { ...entrada, id: 'a', papel: 'assistente', texto: original };
const dados = [resposta, entrada];
let enviado;
const query = { select() { return this; }, order() { return this; }, async limit() { return { data: dados, error: null }; } };
const mod = { exports: {} };
vm.runInNewContext(codigo, {
  exports: mod.exports, module: mod, console, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://teste.invalid' } },
  require: (id) => { assert.equal(id, './supabase'); return { supabase: { from: () => query, auth: { getSession: async () => ({ data: { session: { access_token: 'token-ficticio-teste' } } }) } } }; },
  fetch: async (_url, opts) => { enviado = JSON.parse(opts.body); return { ok: true, json: async () => ({ resposta: original, ferramenta: 'consultar_saldo' }) }; },
});
(async () => {
  const historico = await mod.exports.fetchMensagens();
  assert.equal(historico[0].texto, entrada.texto, 'texto do usuario preservado');
  assert.equal(historico[1].texto, esperado, 'respostas antigas sem marcadores literais');
  assert.equal(resposta.texto, original, 'nao altera objeto recebido do banco');
  const nova = await mod.exports.enviarPergunta(entrada.texto, [entrada]);
  assert.equal(nova.resposta, esperado, 'resposta nova sem marcadores literais');
  assert.equal(nova.ferramenta, 'consultar_saldo');
  assert.equal(enviado.mensagem, entrada.texto);
  assert.deepEqual(enviado.historico, [entrada]);
  console.log('7/7 checagens do cliente real do assistente passaram');
})().catch((e) => { console.error(e); process.exitCode = 1; });
