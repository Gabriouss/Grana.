'use strict';
// delete-account chamada do site (24/10/2026): o navegador manda um preflight OPTIONS antes
// do POST. A função respondia 405 sem CORS, o navegador barrava e a tela mostrava "Failed to
// send a request to the Edge Function". Roda o index.ts real (transpilado) com dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/delete-account/index.ts'), 'utf8');
const js = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const { corsHeaders } = require('@supabase/supabase-js/cors');

let handler = null;
const chamadas = { getUser: 0, rpc: 0 };
let reautenticou = false;
const admin = {
  auth: { getUser: async () => { chamadas.getUser++; return { data: { user: { id: '00000000-0000-0000-0000-000000000001' } }, error: null }; } },
  rpc: async () => { chamadas.rpc++; return { error: null }; },
};
const m = { exports: {} };
vm.runInNewContext(js, {
  module: m, exports: m.exports, console, Response, Request, Headers, URL,
  Deno: { env: { get: (k) => ({ SUPABASE_URL: 'https://ficticio.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'CHAVE_FICTICIA' })[k] }, serve: (fn) => { handler = fn; } },
  require: (id) => {
    if (id === 'npm:@supabase/supabase-js@2.112.3') return { createClient: () => admin };
    if (id === 'npm:@supabase/supabase-js@2.112.3/cors') return { corsHeaders };
    if (id === '../_shared/reautenticacao.ts') return { sessaoReautenticouRecentemente: () => reautenticou };
    throw new Error('IMPORT INESPERADO ' + id);
  },
}, { filename: 'delete-account/index.ts' });
assert.equal(typeof handler, 'function', 'Deno.serve recebeu o handler');

const URL_FN = 'https://ficticio.supabase.co/functions/v1/delete-account';
const pedir = (metodo, cabecalhos = {}) => handler(new Request(URL_FN, { method: metodo, headers: { Origin: 'https://granaponto.com.br', ...cabecalhos }, body: metodo === 'POST' ? '{}' : undefined }));

(async () => {
  const pre = await pedir('OPTIONS', { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,apikey,content-type,x-client-info' });
  assert.equal(pre.status, 204, 'preflight liberado');
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  const permitidos = pre.headers.get('access-control-allow-headers').split(',').map((s) => s.trim());
  for (const c of ['authorization', 'apikey', 'content-type', 'x-client-info']) assert.ok(permitidos.includes(c), `cabeçalho ${c} liberado`);
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(chamadas.getUser, 0, 'preflight não toca na autenticação');

  const semToken = await pedir('POST');
  assert.equal(semToken.status, 401);
  assert.equal(semToken.headers.get('access-control-allow-origin'), '*', 'erro também legível pelo navegador');

  const semReauth = await pedir('POST', { Authorization: 'Bearer token.ficticio.x' });
  assert.equal(semReauth.status, 428, 'janela de reautenticação continua valendo');
  assert.equal(semReauth.headers.get('access-control-allow-origin'), '*', 'o site precisa ler o 428 para pedir a senha');
  assert.equal(semReauth.headers.get('cache-control'), 'no-store');
  assert.equal(chamadas.rpc, 0, 'sem reautenticação nada é apagado');

  assert.equal((await pedir('GET')).status, 405, 'outros métodos continuam recusados');
  console.log('delete-account-cors: preflight 204, CORS nas respostas, 401/428/405 preservados; sem rede');
})().catch((e) => { console.error(e); process.exitCode = 1; });
