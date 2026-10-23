'use strict';
// Independent rejection tests against real worker/operator modules. A configured
// fake Healthchecks URL makes an accidental heartbeat observable, with no HTTP.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file, module); cache.set(file, m);
  m.require = id => id.startsWith('npm:') ? {} : load(path.relative(root, path.resolve(path.dirname(file), id)));
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}
const { criarExecutorReal } = load('supabase/functions/_shared/marketing-real-executor.ts');
const { criarOperadorIncidentes } = load('supabase/functions/_shared/marketing-real-incidentes.ts');
const secret = 'qa-fictitious-ops-secret-'.repeat(3);
const environment = {
  MARKETING_REAL_EXECUTOR_ATIVO: 'true', MARKETING_REAL_EXECUTOR_SECRET: secret,
  META_GRAPH_API_VERSION: 'v25.0', MARKETING_MONITOR_SECRET: secret, MARKETING_EMAIL_SECRET: secret,
  MARKETING_HEALTHCHECKS_WORKER_URL: 'https://hc-ping.com/11111111-1111-4111-8111-111111111111',
  MARKETING_HEALTHCHECKS_MONITOR_URL: 'https://hc-ping.com/22222222-2222-4222-8222-222222222222',
  MARKETING_RESEND_API_KEY: 'qa-not-a-real-key', MARKETING_INCIDENTES_EMAIL_FROM: 'from@example.invalid',
  MARKETING_INCIDENTES_EMAIL_TO: 'to@example.invalid',
};
let checks = 0;
const cases = [
  { name: 'GET', method: 'GET', status: 405 },
  { name: 'PUT with valid secret', method: 'PUT', body: '{}', status: 405 },
  { name: 'missing secret', method: 'POST', body: '{}', missingSecret: true, status: 401 },
  { name: 'invalid secret', method: 'POST', body: '{}', secret: 'invalid', status: 401 },
  { name: 'malformed JSON', method: 'POST', body: '{', status: 400 },
  { name: 'array body', method: 'POST', body: '[]', status: 400 },
  { name: 'null body', method: 'POST', body: 'null', status: 400 },
  { name: 'extra fields', method: 'POST', body: '{"unexpected":true}', status: 400 },
  { name: 'oversized body', method: 'POST', body: 'x'.repeat(129), status: 413 },
];
(async () => {
  for (const kind of ['worker', 'monitor', 'email']) for (const test of cases) {
    const calls = { network: [], rpc: [], client: 0 };
    const deps = { env: name => environment[name], log: () => {},
      rede: async (input, init) => {
        calls.network.push({ host: new URL(String(input)).hostname, method: init?.method });
        return new Response(null, { status: 204 });
      },
      cliente: () => { calls.client++; return { rpc: (name, args) => ({ abortSignal: async () => {
        calls.rpc.push({ name, args }); return { data: [], error: null };
      } }) }; },
    };
    const handler = kind === 'worker' ? criarExecutorReal(deps) : criarOperadorIncidentes(kind, deps);
    const header = kind === 'worker' ? 'x-marketing-real-secret' : 'x-marketing-ops-secret';
    const headers = { 'content-type': 'application/json',
      ...(test.missingSecret ? {} : { [header]: test.secret || secret }) };
    const response = await handler(new Request('https://fixture.invalid', {
      method: test.method, headers, ...(test.body === undefined ? {} : { body: test.body }),
    }));
    const label = `${kind}: ${test.name}`;
    assert.equal(response.status, test.status, label + ' rejects'); checks++;
    assert.deepEqual(calls.network, [], label + ' emits ZERO Meta/Resend/Healthchecks effects'); checks++;
    assert.deepEqual(calls.rpc, [], label + ' executes ZERO business RPCs'); checks++;
    assert.equal(calls.client, 0, label + ' never initializes database client'); checks++;
  }
  console.log(`marketing-real-seguranca-efeitos: ${checks} assertions, ${cases.length * 3} rejected requests; real modules, ZERO network/RPC/client effects`);
})().catch(error => { console.error(error); process.exitCode = 1; });
