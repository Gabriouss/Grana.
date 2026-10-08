'use strict';
// Edge Function admin-ajustes: executa o index.ts real e os modulos _shared reais;
// so createClient (rede/Auth/DB) e Deno.env sao dubles. Asserta QUAIS chamadas ao banco
// aconteceram, porque esta funcao escreve.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const PEDIDO = '33333333-3333-4333-8333-333333333333';
const ORIGIN = 'https://www.granaponto.com.br';
const SEGREDO = 'TEXTO PRIVADO DO AUTOR';
const token = (id = ADMIN, aal = 'aal2') => 'valid.' + Buffer.from(JSON.stringify({ sub: id, aal })).toString('base64url') + '.sig';
const PECA = 'ab12cd34ef56ab78';
const SHA = 'a'.repeat(40);
const CRIAR = { recurso: 'ajustes-criar', pecaId: PECA, caminho: 'docs/marketing/2026-10/semana-41/para-aprovacao/E01.png', versaoAlvo: SHA, texto: '  ' + SEGREDO + '  ' };

function harness(opts = {}) {
  const calls = [], logs = [], chaves = [];
  const cache = new Map();
  let handler;
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ADMIN_USER_IDS: ADMIN };
  const builder = (call) => {
    const q = {
      select: (f) => { call.select = f; return q; }, eq: (k, v) => { call.eq = [k, v]; return q; },
      order: (k, o) => { call.order = [k, o]; return q; }, limit: (n) => { call.limit = n; return q; },
      abortSignal: () => q,
      then: (ok, ko) => {
        if (opts.pendurar) return new Promise(() => {}).then(ok, ko);
        if (opts.erro) return Promise.resolve({ data: null, error: { message: 'postgres ' + SEGREDO } }).then(ok, ko);
        if (call.rpc) return Promise.resolve({ data: opts.rpcData ?? [{ id: PEDIDO, estado: 'novo', criado_em: '2026-10-08T21:00:00Z', texto_original: SEGREDO }], error: null }).then(ok, ko);
        return Promise.resolve({ data: opts.lista ?? [{ id: PEDIDO, peca_id: PECA, caminho: CRIAR.caminho, versao_alvo: SHA, estado: 'em-correcao',
          tentativas: 1, versao_corrigida: null, aceite_em: null, criado_em: '2026-10-08T21:00:00Z', atualizado_em: '2026-10-08T21:01:00Z',
          importado_em: null, texto_original: SEGREDO, criado_por: ADMIN }], error: null }).then(ok, ko);
      },
    };
    return q;
  };
  const client = {
    auth: { getUser: async (jwt) => {
      if (!jwt.startsWith('valid.')) return { data: { user: null }, error: new Error('x') };
      const c = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
      return { error: null, data: { user: { id: c.sub, factors: [{ factor_type: 'totp', status: 'verified' }] } } };
    } },
    from: (t) => { const call = { from: t }; calls.push(call); return builder(call); },
    rpc: (n, args) => { const call = { rpc: n, args }; calls.push(call); return builder(call); },
  };
  function load(rel) {
    const abs = path.resolve(ROOT, rel);
    if (cache.has(abs)) return cache.get(abs);
    const exports = {}; cache.set(abs, exports);
    const code = ts.transpileModule(fs.readFileSync(abs, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
      exports, Request, Response, Headers, URL, AbortController, TextDecoder, TextEncoder, Date, Error, atob, crypto: webcrypto,
      setTimeout: (f, ms) => setTimeout(f, opts.rapido ? Math.max(1, ms / 1000) : ms), clearTimeout,
      fetch: () => { throw new Error('REDE REAL PROIBIDA'); },
      console: { log: (s) => logs.push(s) },
      Deno: { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } },
      require: (id) => {
        if (id.startsWith('npm:')) return { createClient: (url, chave) => { chaves.push(chave); return client; } };
        if (id.startsWith('.')) return load(path.relative(ROOT, path.resolve(path.dirname(abs), id)));
        throw new Error('import inesperado ' + id);
      },
    }, { filename: abs });
    return exports;
  }
  load('supabase/functions/admin-ajustes/index.ts');
  const request = async (body, headers = {}) => {
    const h = { Origin: ORIGIN, Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...headers };
    for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
    const r = await handler(new Request('https://p.supabase.co/functions/v1/admin-ajustes', { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) }));
    return { r, json: await r.json() };
  };
  return { request, calls, logs, chaves };
}
// Objetos criados dentro do vm tem prototipo de outro realm; comparar o valor, nao a origem.
const plain = (v) => JSON.parse(JSON.stringify(v));
const semSegredo = (v) => { const s = JSON.stringify(v); assert.equal(s.includes('PRIVADO'), false); assert.equal(s.includes('postgres'), false); };

let n = 0;
async function test(nome, fn) { await fn(); n++; console.log('OK ' + nome); }
(async () => {
  await test('criar: uma RPC, texto aparado, autor do JWT, resposta e log sem texto', async () => {
    const h = harness(); const { r, json } = await h.request(CRIAR);
    assert.equal(r.status, 200); assert.deepEqual(json.dados, { pedido: { id: PEDIDO, estado: 'novo', criadoEm: '2026-10-08T21:00:00.000Z' } });
    assert.deepEqual(plain(h.calls), [{ rpc: 'admin_ajuste_criar', args: { p_autor: ADMIN, p_peca: PECA, p_caminho: CRIAR.caminho, p_versao: SHA, p_texto: SEGREDO } }]);
    assert.deepEqual(h.chaves, ['anon', 'service']); semSegredo(json); semSegredo(h.logs);
    assert.equal(JSON.parse(h.logs[0]).recurso, 'ajustes-criar');
  });
  await test('listar: so os pedidos do proprio admin, sem texto nem autor, DTO fechado', async () => {
    const h = harness(); const { r, json } = await h.request({ recurso: 'ajustes-listar' });
    assert.equal(r.status, 200); assert.equal(h.calls.length, 1);
    assert.deepEqual(plain(h.calls[0].eq), ['criado_por', ADMIN]); assert.equal(h.calls[0].limit, 50);
    assert.equal(h.calls[0].select.includes('texto'), false); assert.equal(h.calls[0].select.includes('criado_por'), false);
    assert.equal(json.dados.pedidos[0].estado, 'em-correcao'); assert.equal('textoOriginal' in json.dados.pedidos[0], false); semSegredo(json);
  });
  await test('nao admin, sem aal2, sem token: zero chamada ao banco e cliente privilegiado nunca nasce', async () => {
    for (const hdr of [{ Authorization: 'Bearer ' + token(OUTRO) }, { Authorization: 'Bearer ' + token(ADMIN, 'aal1') }, { Authorization: undefined }]) {
      const h = harness(); const { r } = await h.request(CRIAR, hdr);
      assert.ok([401, 403].includes(r.status)); assert.equal(h.calls.length, 0); assert.equal(h.chaves.includes('service'), false);
    }
  });
  await test('formato recusado sem banco: campo extra, update/delete, caminho fora do acervo, texto vazio ou longo', async () => {
    const ruins = [
      { ...CRIAR, estado: 'aceito' }, { recurso: 'ajustes-atualizar', id: PEDIDO }, { recurso: 'ajustes-apagar', id: PEDIDO },
      { recurso: 'acesso' }, { recurso: 'visao-geral' }, { recurso: 'ajustes-listar', criado_por: OUTRO },
      { ...CRIAR, caminho: '../.env' }, { ...CRIAR, caminho: 'docs/marketing/../../.env' }, { ...CRIAR, caminho: '/etc/passwd' },
      { ...CRIAR, caminho: 'docs/marketing//x' }, { ...CRIAR, pecaId: 'x' }, { ...CRIAR, versaoAlvo: 'b'.repeat(39) },
      { ...CRIAR, texto: '   ' }, { ...CRIAR, texto: 'a'.repeat(2001) }, { ...CRIAR, texto: 7 },
    ];
    for (const b of ruins) { const h = harness(); const { r } = await h.request(b); assert.equal(r.status, 400, JSON.stringify(b).slice(0, 80)); assert.equal(h.calls.length, 0); }
    const ok = harness(); assert.equal((await ok.request({ ...CRIAR, texto: 'ç'.repeat(2000) })).r.status, 200, '2000 caracteres acentuados cabem');
    // Achado do Harbor (08/10): caminho de carrossel real do catalogo, e contagem por code point.
    const car = harness(); assert.equal((await car.request({ ...CRIAR, caminho: 'docs/marketing/2026-10/semana-40-2026-09-28-a-2026-10-04/para-aprovacao/pecas/lumen-v6/carrossel-*' })).r.status, 200, 'carrossel-* aceito');
    for (const caminho of ['docs/marketing/x/*', 'docs/marketing/carrossel-*/x', 'docs/marketing/x/carrossel-**']) {
      const h = harness(); assert.equal((await h.request({ ...CRIAR, caminho })).r.status, 400, caminho);
    }
    const emoji = harness(); assert.equal((await emoji.request({ ...CRIAR, texto: '😀'.repeat(2000) })).r.status, 200, '2000 emoji = 2000 caracteres');
    const emoji2 = harness(); assert.equal((await emoji2.request({ ...CRIAR, texto: '😀'.repeat(2001) })).r.status, 400, '2001 emoji recusados');
    const grande = harness(); assert.equal((await grande.request({ ...CRIAR, texto: 'ç'.repeat(6000) })).r.status, 413, '12 KB passa do limite de corpo');
  });
  await test('erro ou pendura do banco: 503/504 sem vazar texto nem erro bruto, e sem segunda tentativa', async () => {
    const e = harness({ erro: true }); const { r, json } = await e.request(CRIAR);
    assert.equal(r.status, 503); assert.equal(e.calls.length, 1); semSegredo(json); semSegredo(e.logs);
    const p = harness({ pendurar: true, rapido: true }); const x = await p.request(CRIAR);
    assert.equal(x.r.status, 504); assert.equal(p.calls.length, 1); semSegredo(x.json);
  });
  await test('resposta do banco fora do formato nao passa adiante', async () => {
    const h = harness({ lista: [{ id: PEDIDO, peca_id: PECA, caminho: CRIAR.caminho, versao_alvo: SHA, estado: 'inventado', tentativas: 0 }] });
    assert.equal((await h.request({ recurso: 'ajustes-listar' })).r.status, 503);
    const c = harness({ rpcData: [] }); assert.equal((await c.request(CRIAR)).r.status, 503);
  });
  console.log(`admin-ajustes-funcao: ${n} grupos verdes (modulos reais, zero rede)`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
