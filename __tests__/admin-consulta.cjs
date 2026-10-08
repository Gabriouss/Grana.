'use strict';
// Executa os três módulos de produção e o rate limiter real; só rede/Auth/DB são dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const COMMON = '99999999-9999-4999-8999-999999999999';
const ORIGIN = 'https://www.granaponto.com.br';
const token = (id = ADMIN, aal = 'aal2', extra = {}) => 'valid.' + Buffer.from(JSON.stringify({ sub: id, aal, ...extra })).toString('base64url') + '.signature';

function harness(opts = {}) {
  const calls = [], authCalls = [], logs = [], signals = [], clients = [];
  const cache = new Map();
  let handler;
  let clock = Date.parse('2026-10-08T12:00:00Z'), nextTimer = 0;
  const pendingTimers = new Map(), durations = [];
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const advance = async (ms) => {
    clock += ms;
    for (const [id, t] of [...pendingTimers]) if (t.at <= clock) { pendingTimers.delete(id); t.f(); }
    for (let i = 0; i < 40; i++) await Promise.resolve();
  };
  const virtualTimer = (f, ms) => { durations.push(ms); const id = ++nextTimer; pendingTimers.set(id, { at: clock + ms, f }); return id; };
  const timer = (f, ms) => setTimeout(f, opts.rapido ? Math.max(1, ms / 1000) : ms);
  function load(rel) {
    const abs = path.resolve(ROOT, rel);
    if (cache.has(abs)) return cache.get(abs);
    const exports = {}; cache.set(abs, exports);
    const code = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, Request, Response, Headers, AbortController, TextDecoder, TextEncoder,
      Date: opts.virtual ? ClockDate : Date,
      setTimeout: opts.virtual ? virtualTimer : timer, clearTimeout: opts.virtual ? (id) => pendingTimers.delete(id) : clearTimeout, atob, crypto: webcrypto, Error,
      console: { log: (s) => logs.push(s) },
      Deno: { serve: (h) => { handler = h; }, env: { get: () => undefined } },
      require: (id) => {
        if (id.startsWith('npm:')) return { createClient: () => { throw new Error('use injected client'); } };
        if (id.startsWith('.')) return load(path.relative(ROOT, path.resolve(path.dirname(abs), id)));
        throw new Error('unexpected import ' + id);
      },
    }, { filename: abs });
    return exports;
  }
  const query = (table, rpc = false) => {
    const call = { table, rpc, filters: [] }; calls.push(call);
    const q = {
      select: (fields, options) => { call.fields = fields; call.options = options; return q; },
      or: (v) => { call.filters.push(['or', v]); return q; },
      eq: (k, v) => { call.filters.push(['eq', k, v]); return q; },
      gt: (k, v) => { call.filters.push(['gt', k, v]); return q; },
      gte: (k, v) => { call.filters.push(['gte', k, v]); return q; },
      ilike: (k, v) => { call.filters.push(['ilike', k, v]); return q; },
      in: (k, v) => { call.filters.push(['in', k, v]); return q; },
      maybeSingle: () => q,
      abortSignal: (signal) => { signals.push(signal); return q; },
      then: (resolve, reject) => {
        if (opts.pendurar === table) return new Promise(() => {}).then(resolve, reject);
        if (opts.rejeitar === table) return Promise.reject(new Error('postgres secret@example.com ' + ADMIN)).then(resolve, reject);
        let r = { error: null, count: 12, data: null };
        if (opts.falhar === table) r = { error: { message: 'postgres secret@example.com ' + ADMIN }, count: null, data: null };
        else if (rpc) r.data = { total: 15, novas7d: 10, novas30d: 11, email: 'private@example.com', id: COMMON, amount: 77.71 };
        else if (table === 'app_release') r.data = { version: opts.versao || '1.10.5', updated_at: '2026-10-08T12:00:00Z', apk_url: 'secret', notes: 'private@example.com' };
        if (opts.count !== undefined) r.count = opts.count;
        return Promise.resolve(r).then(resolve, reject);
      },
    };
    return q;
  };
  const client = {
    auth: { getUser: async (jwt) => {
      authCalls.push(jwt);
      if (opts.authDelay) await new Promise((resolve) => virtualTimer(resolve, opts.authDelay));
      if (opts.authPendurada) return new Promise(() => {});
      if (opts.authThrow) throw new Error('secret@example.com ' + ADMIN);
      if (opts.invalido || !jwt.startsWith('valid.')) return { data: { user: null }, error: new Error('invalid') };
      const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
      return { error: null, data: { user: { id: opts.userId || claims.sub, email: 'private@example.com',
        user_metadata: { admin: true }, factors: opts.factors || [{ factor_type: 'totp', status: 'verified', id: COMMON }] } } };
    } },
    from: (table) => query(table),
    rpc: (name, args) => { assert.equal(args, undefined); return query(name, true); },
  };
  load('supabase/functions/admin-consulta/index.ts');
  const mod = load('supabase/functions/_shared/admin-autorizacao.ts');
  handler = mod.criarHandlerAdmin({
    env: (k) => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service', ADMIN_USER_IDS: opts.ids === undefined ? ADMIN : opts.ids })[k],
    cliente: (url, key, signal) => { clients.push(key); signals.push(signal); return client; },
    log: (line) => logs.push(JSON.parse(line)),
  });
  const request = async (changes = {}) => {
    const headers = { Origin: ORIGIN, Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...changes.headers };
    for (const k of Object.keys(headers)) if (headers[k] === undefined) delete headers[k];
    const method = changes.method || 'POST';
    const r = await handler(new Request('https://project.supabase.co/functions/v1/admin-consulta', {
      method, headers, ...(method === 'GET' || method === 'OPTIONS' ? {} : {
        ...(changes.body instanceof ReadableStream ? { duplex: 'half' } : {}),
        body: changes.body === undefined ? JSON.stringify({ recurso: 'visao-geral' }) : changes.body,
      }),
    }));
    return { r, json: r.status === 204 ? null : await r.json() };
  };
  return { request, calls, authCalls, logs, signals, clients, load, advance, durations };
}

let passed = 0;
async function test(name, run) { await run(); passed++; console.log('OK ' + name); }
function noQueries(h) { assert.equal(h.calls.length, 0); assert.equal(h.clients.includes('service'), false); }
function safe(json) {
  const value = JSON.stringify(json);
  assert.equal(value.includes('@'), false);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value), false);
  for (const s of [ADMIN, COMMON, 'secret', '77.71', 'postgres', 'activation_token', 'user_id', 'email']) assert.equal(value.includes(s), false, s);
}
(async () => {
  await test('W01 sem token, inválido, expirado: zero consulta', async () => {
    for (const headers of [{ Authorization: undefined }, { Authorization: 'Bearer broken' }, { Authorization: 'Bearer expired.token.sig' }]) {
      const h = harness(); const { r, json } = await h.request({ headers });
      assert.equal(r.status, 401); assert.equal(json.erro.codigo, 'nao-autenticado'); noQueries(h); safe(json);
    }
  });
  await test('W02 não admin: 403; acesso revela somente admin false', async () => {
    const h = harness(); const headers = { Authorization: 'Bearer ' + token(COMMON) };
    assert.equal((await h.request({ headers })).r.status, 403); noQueries(h);
    const { json } = await h.request({ headers, body: '{"recurso":"acesso"}' });
    assert.deepEqual(json.dados, { admin: false }); noQueries(h); safe(json);
  });
  await test('W03 admin aal1 só acesso e estado TOTP', async () => {
    const h = harness(); const headers = { Authorization: 'Bearer ' + token(ADMIN, 'aal1') };
    const { r, json } = await h.request({ headers }); assert.equal(r.status, 403); assert.equal(json.erro.codigo, 'mfa-necessario');
    const acesso = await h.request({ headers, body: '{"recurso":"acesso"}' });
    assert.deepEqual(acesso.json.dados, { admin: true, aal: 'aal1', totp: 'verificado' }); noQueries(h);
    const semTotp = harness({ factors: [{ factor_type: 'phone', status: 'verified' }, { factor_type: 'totp', status: 'unverified' }] });
    assert.equal((await semTotp.request({ body: '{"recurso":"acesso"}' })).json.dados.totp, 'ausente');
  });
  await test('W04 secret ausente/vazio falha fechada', async () => {
    for (const ids of ['', ' , ', 'lixo', ADMIN + ',lixo', ADMIN + ',']) { const h = harness({ ids }); const { r } = await h.request(); assert.equal(r.status, 503); noQueries(h); assert.equal(h.authCalls.length, 0); }
  });
  await test('JWT validado no servidor antes de ler claims; sub divergente recusado', async () => {
    const h = harness({ userId: COMMON }); assert.equal((await h.request()).r.status, 401); assert.equal(h.authCalls.length, 1); noQueries(h);
    const bad = harness(); assert.equal((await bad.request({ headers: { Authorization: 'Bearer ' + token(ADMIN, 'inventado') } })).r.status, 401); noQueries(bad);
  });
  await test('W05 DTO expresso ignora dados individuais do dublê', async () => {
    const h = harness(); const { r, json } = await h.request(); assert.equal(r.status, 200); safe(json);
    assert.equal(json.dados.contas.indisponivel, true); assert.equal(json.dados.receita.disponivel, false); assert.equal(json.dados.receita.soma30d, null);
    assert.equal(json.dados.app.versaoAnunciada, '1.10.5'); assert.equal(json.dados.uso.voz7d, 12);
    assert.equal(h.authCalls.length, 1); assert.deepEqual(h.clients, ['anon', 'service']);
    for (const q of h.calls.filter((q) => !q.rpc && q.table !== 'app_release')) {
      assert.equal(q.options.count, 'exact'); assert.equal(q.options.head, true);
    }
    const voz = h.calls.find((q) => q.table === 'voice_operations'); assert(voz.filters.some((f) => f[1] === 'status' && f[2] === 'committed'));
    const push = h.calls.find((q) => q.table === 'push_tokens'); assert(push.filters.some((f) => f[1] === 'ativo' && f[2] === true));
    assert.equal(h.calls.filter((q) => q.rpc).length, 0);
    for (const q of h.calls.filter((q) => q.table === 'subscriptions')) assert(q.filters.some((f) => f[0] === 'or' && f[1].includes('grace_until.gte.')));
  });
  await test('W06 CORS exato, preflight restrito, origem ausente não concede CORS', async () => {
    for (const method of ['POST', 'OPTIONS']) {
      const h = harness(); const { r } = await h.request({ method, headers: { Origin: 'https://evil.example' } });
      assert.equal(r.status, 403); assert.equal(r.headers.has('Access-Control-Allow-Origin'), false); assert.equal(h.authCalls.length, 0); noQueries(h);
    }
    for (const Origin of [ORIGIN, 'https://granaponto.com.br']) {
      const h = harness(); const { r } = await h.request({ method: 'OPTIONS', headers: { Origin } }); assert.equal(r.status, 204); assert.equal(r.headers.get('Access-Control-Allow-Origin'), Origin); noQueries(h);
    }
    const h = harness(); assert.equal((await h.request({ method: 'OPTIONS', headers: { Origin: undefined } })).r.status, 403);
    const { r } = await h.request({ headers: { Origin: undefined } }); assert.equal(r.status, 200); assert.equal(r.headers.has('Access-Control-Allow-Origin'), false);
  });
  await test('W07 métodos, JSON, recursos/campos extras e 1KB recusados', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) { const h = harness(); assert.equal((await h.request({ method })).r.status, 405); noQueries(h); }
    for (const body of ['{}', 'null', '[]', '{', '{"recurso":"ia"}', '{"recurso":"visao-geral","sql":"select"}']) {
      const h = harness(); assert.equal((await h.request({ body })).r.status, 400); noQueries(h); assert.equal(h.authCalls.length, 0);
    }
    for (const body of ['a'.repeat(1025), 'á'.repeat(600)]) { const h = harness(); assert.equal((await h.request({ body })).r.status, 413); noQueries(h); }
    const h = harness(); assert.equal((await h.request({ headers: { 'Content-Length': '1025' } })).r.status, 413); noQueries(h);
  });
  await test('tabela falha/rejeita: só seu bloco indisponível e log sanitizado', async () => {
    for (const opt of ['falhar', 'rejeitar']) {
      const h = harness({ [opt]: 'subscriptions' }); const { json } = await h.request();
      assert.equal(json.dados.assinaturas.indisponivel, true); assert.equal(json.dados.contas.indisponivel, true); assert.equal(json.dados.uso.voz7d, 12); safe(json);
      assert.equal(h.logs.length, 1); assert(h.logs[0].blocosIndisponiveis.includes('assinaturas')); safe(h.logs);
    }
    const h = harness(); const { json } = await h.request(); assert.equal(json.dados.contas.indisponivel, true); assert.equal(h.calls.some((q) => q.rpc), false);
  });
  await test('strings de sistema/contagens inválidas não vazam e não viram resultado real', async () => {
    const h = harness({ versao: 'user@example.com' }); const { json } = await h.request(); assert.equal(json.dados.app.indisponivel, true); safe(json);
    const n = harness({ count: -1 }); assert.equal((await n.request()).json.dados.uso.indisponivel, true);
  });
  await test('30/min por usuário inclui acesso; rejeição sem query e Retry-After', async () => {
    const h = harness(); for (let i = 0; i < 30; i++) assert.equal((await h.request({ body: '{"recurso":"acesso"}' })).r.status, 200);
    const { r } = await h.request(); assert.equal(r.status, 429); assert.equal(r.headers.get('Retry-After'), '60'); noQueries(h);
  });
  await test('limite por usuario tambem no acesso nao admin e reinicia em 60s', async () => {
    const h = harness({ virtual: true }); const req = { headers: { Authorization: 'Bearer ' + token(COMMON) }, body: '{"recurso":"acesso"}' };
    for (let i = 0; i < 30; i++) assert.equal((await h.request(req)).r.status, 200);
    assert.equal((await h.request(req)).r.status, 429); noQueries(h);
    await h.advance(60001); assert.equal((await h.request(req)).r.status, 200);
  });
  await test('120/min global independente do usuário', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`); const h = harness({ ids: ids.join(',') });
    for (let i = 0; i < 120; i++) assert.equal((await h.request({ headers: { Authorization: 'Bearer ' + token(ids[i % 5]) }, body: '{"recurso":"acesso"}' })).r.status, 200);
    assert.equal((await h.request({ headers: { Authorization: 'Bearer ' + token(ids[4]) } })).r.status, 429); noQueries(h);
  });
  await test('limite global protege Auth inclusive token invalido', async () => {
    const h = harness();
    for (let i = 0; i < 120; i++) assert.equal((await h.request({ headers: { Authorization: 'Bearer broken' } })).r.status, 401);
    assert.equal((await h.request()).r.status, 429);
    assert.equal(h.authCalls.length, 120); noQueries(h);
  });
  await test('query pendurada aborta prazo incluindo corpo; demais blocos respondem', async () => {
    const h = harness({ pendurar: 'subscriptions', rapido: true }); const { json } = await h.request(); assert.equal(json.dados.assinaturas.indisponivel, true); assert.equal(json.dados.uso.voz7d, 12); assert(h.signals.some((s) => s.aborted));
  });
  await test('Auth pendurada tem recibo de prazo e zero query', async () => {
    const h = harness({ authPendurada: true, rapido: true }); const { r, json } = await h.request(); assert.equal(r.status, 504); assert.equal(json.erro.codigo, 'prazo'); noQueries(h); safe(json);
    const erro = harness({ authThrow: true }); const response = await erro.request(); assert.equal(response.r.status, 503); safe(response.json); safe(erro.logs);
  });
  await test('relogio falso: prazo total 12s inclui Auth e consultas; upload tem 5s', async () => {
    const h = harness({ virtual: true, authDelay: 6000, pendurar: 'subscriptions' });
    let done = false; const response = h.request().then((r) => { done = true; return r; });
    await h.advance(0); await h.advance(6000); assert.equal(done, false);
    await h.advance(5999); assert.equal(done, false);
    await h.advance(1); const { json } = await response;
    assert.equal(json.dados.assinaturas.indisponivel, true);
    assert(h.durations.includes(12000)); assert(h.durations.includes(10000)); assert(h.signals.some((s) => s.aborted));
    assert.equal(h.logs[0].duracaoMs, 12000);
    const upload = harness({ virtual: true });
    const waiting = upload.request({ body: new ReadableStream({ start() {} }) });
    await upload.advance(0); await upload.advance(5000);
    assert.equal((await waiting).r.status, 504); assert.equal(upload.authCalls.length, 0); noQueries(upload);
    const auth = harness({ virtual: true, authPendurada: true });
    const waitingAuth = auth.request(); await auth.advance(0); await auth.advance(10000);
    assert.equal((await waitingAuth).r.status, 504); noQueries(auth);
  });
  await test('no-store/Vary/JSON e uma linha segura em sucesso/erro', async () => {
    const h = harness(); for (const req of [{}, { method: 'GET' }, { headers: { Authorization: undefined } }]) {
      const { r } = await h.request(req); assert.equal(r.headers.get('Cache-Control'), 'no-store'); assert.equal(r.headers.get('Vary'), 'Origin'); assert.equal(r.headers.get('Content-Type'), 'application/json');
    }
    assert.equal(h.logs.length, 3); safe(h.logs);
  });
  console.log(`admin-consulta: ${passed} grupos passaram (módulos reais)`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
