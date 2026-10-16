const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { lerCorpoLimitado } = require('./helpers/request-body-real.cjs')();
const encoder = new TextEncoder();
let checks = 0;
const ok = (actual, expected, name) => { assert.equal(actual, expected, name); checks++; };

function streamRequest(chunks, headers = {}, stalled = false) {
  let canceled = false;
  const body = new ReadableStream({
    pull(c) { if (chunks.length) c.enqueue(chunks.shift()); else if (!stalled) c.close(); },
    cancel() { canceled = true; },
  });
  const req = new Request('https://fake.invalid', { method: 'POST', body, duplex: 'half', headers });
  return { req, canceled: () => canceled };
}

function carregar(name) {
  const cache = new Map();
  const calls = [];
  let handler;
  const client = {
    auth: { getUser: async () => { calls.push('auth'); return { data: { user: { id: 'fake-user' } } }; } },
    rpc: async n => { calls.push('rpc:' + n); assert.equal(n, 'tem_direito_acesso'); return { data: true }; },
    from: () => { calls.push('database'); throw new Error('unexpected database'); },
  };
  function real(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const api = {}; cache.set(file, api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports: api, Request, Response, Headers, Blob, File, FormData, URL, TextEncoder, TextDecoder,
      Uint8Array, ArrayBuffer, AbortController, atob, btoa, crypto: globalThis.crypto,
      setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 25)), clearTimeout,
      console: { log() {}, warn() {}, error() {} },
      Deno: { env: { get: k => k === 'RESEND_WEBHOOK_SECRET' ? 'whsec_' + Buffer.from('fake-secret').toString('base64') : 'fake-secret' }, serve: fn => { handler = fn; } },
      fetch: async () => { calls.push('fetch'); throw new Error('unexpected network'); },
      require: id => {
        if (id.endsWith('/cors')) return { corsHeaders: { 'Access-Control-Allow-Origin': '*' } };
        if (id.startsWith('npm:@supabase/supabase-js')) return { createClient: () => client };
        assert.ok(id.startsWith('.'), 'unexpected dependency: ' + id);
        return real(path.resolve(path.dirname(file), id));
      },
    }, { filename: file });
    return api;
  }
  real(`supabase/functions/${name}/index.ts`);
  return { call: req => handler(req), calls };
}

async function main() {
  for (const headers of [{}, { 'content-length': '1' }]) {
    const r = streamRequest([new Uint8Array(4), new Uint8Array(5)], headers, true);
    ok((await lerCorpoLimitado(r.req, 8)).status, 413);
    ok(r.canceled(), true);
  }
  const lying = streamRequest([], { 'content-length': '99' }, true);
  ok((await lerCorpoLimitado(lying.req, 8)).status, 413);
  ok(lying.canceled(), true);
  const slow = streamRequest([new Uint8Array(1)], {}, true);
  ok((await lerCorpoLimitado(slow.req, 8, 5)).status, 408);
  ok(slow.canceled(), true);
  // Prazo total: cada chunk chega antes do timeout individual, mas o total excede.
  let canceled = false;
  const trickle = new Request('https://fake.invalid', { method: 'POST', duplex: 'half', body: new ReadableStream({
    async pull(c) { await new Promise(r => setTimeout(r, 4)); if (!canceled) c.enqueue(new Uint8Array(1)); },
    cancel() { canceled = true; },
  }) });
  ok((await lerCorpoLimitado(trickle, 100, 10)).status, 408);
  ok(canceled, true);
  const broken = new Request('https://fake.invalid', { method: 'POST', duplex: 'half', body: new ReadableStream({
    start(c) { c.error(new Error('private sentinel')); },
  }) });
  ok((await lerCorpoLimitado(broken, 8)).status, 400);
  let released = false;
  const stuckCancel = {
    headers: new Headers(),
    body: { getReader: () => ({ read: () => new Promise(() => {}),
      cancel: () => new Promise(() => {}), releaseLock: () => { released = true; } }) },
  };
  ok((await lerCorpoLimitado(stuckCancel, 8, 5)).status, 408);
  ok(released, true, 'cancel pending does not block response');
  const exact = streamRequest([new Uint8Array([0, 255]), new Uint8Array([195, 169])]);
  const exactResult = await lerCorpoLimitado(exact.req, 4);
  assert.deepEqual([...exactResult.bytes], [0, 255, 195, 169]); checks++;

  const names = ['cakto-webhook', 'kiwify-webhook', 'eas-build-webhook', 'email-recebido',
    'whatsapp-webhook', 'assistente-financeiro', 'processar-lancamento-voz'];
  for (const name of names) {
    const f = carregar(name);
    const max = name === 'processar-lancamento-voz' ? 2 * 1024 * 1024 + 64 * 1024 :
      name === 'assistente-financeiro' ? 1536 * 1024 :
      name === 'email-recebido' ? 256 * 1024 : name === 'whatsapp-webhook' ? 512 * 1024 : 64 * 1024;
    for (const headers of [{}, { 'content-length': '1' }, { 'content-length': String(max + 1) }]) {
      const r = streamRequest([new Uint8Array(max), new Uint8Array(1)], {
        ...headers, 'content-type': 'application/json', authorization: 'Bearer fake',
      }, true);
      ok((await f.call(r.req)).status, 413, name);
      ok(r.canceled(), true, name + ': cancel');
    }
    const r = streamRequest([encoder.encode('{')], { 'content-type': 'application/json', authorization: 'Bearer fake' }, true);
    const response = await f.call(r.req);
    ok(response.status, 408, name + ': slow');
    ok(r.canceled(), true);
    if (['assistente-financeiro', 'processar-lancamento-voz'].includes(name)) {
      ok(response.headers.get('access-control-allow-origin'), '*');
    }
    ok(f.calls.some(x => !['auth', 'rpc:tem_direito_acesso'].includes(x)), false, name + ': no quota/RPC/write/AI/send');
  }
  {
    const f = carregar('processar-lancamento-voz');
    for (const oversizedAudio of [false, true]) {
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array(oversizedAudio ? 2 * 1024 * 1024 + 1 : 4)], { type: 'audio/m4a' }), 'voz.m4a');
      if (!oversizedAudio) form.append('extra', 'x'.repeat(2 * 1024 * 1024 + 64 * 1024));
      const r = await f.call(new Request('https://fake.invalid', { method: 'POST',
        headers: { authorization: 'Bearer fake' }, body: form }));
      ok(r.status, 413, 'multipart: envelope e tamanho do audio limitados');
    }
    ok(f.calls.every(x => x === 'auth'), true, 'multipart recusado antes da cota e do provedor');
  }

  // HMAC de bytes originais: BOM, unicode e espacamento sobrevivem ao stream.
  // O BOM seria eliminado por TextDecoder antes de uma assinatura sobre texto.
  const body = Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(' { "type": "ignored", "texto": "a\u00e7\u00e3o" } ')]);
  for (const name of ['eas-build-webhook', 'whatsapp-webhook', 'email-recebido']) {
    const f = carregar(name);
    const headers = { 'content-type': 'application/json' };
    if (name === 'eas-build-webhook') headers['expo-signature'] = 'sha1=' + crypto.createHmac('sha1', 'fake-secret').update(body).digest('hex');
    if (name === 'whatsapp-webhook') headers['x-hub-signature-256'] = 'sha256=' + crypto.createHmac('sha256', 'fake-secret').update(body).digest('hex');
    if (name === 'email-recebido') {
      headers['svix-id'] = 'fake-id'; headers['svix-timestamp'] = String(Math.floor(Date.now() / 1000));
      headers['svix-signature'] = 'v1,' + crypto.createHmac('sha256', Buffer.from('fake-secret'))
        .update(Buffer.concat([Buffer.from(`${headers['svix-id']}.${headers['svix-timestamp']}.`), body])).digest('base64');
    }
    const r = streamRequest([body.subarray(0, 5), body.subarray(5)], headers);
    ok((await f.call(r.req)).status, 200, name + ': exact HMAC');
    ok(f.calls.length, 0);
    const altered = Buffer.from(body); altered[altered.length - 1] = 10;
    ok((await f.call(streamRequest([altered], headers).req)).status, 401, name + ': changed bytes refused');
  }
  console.log(`request-body-limitado: ${checks} checagens, 7 handlers reais, sem rede/banco real`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
