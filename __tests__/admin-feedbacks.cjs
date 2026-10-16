'use strict';
/*
 * B3 (15/10/2026): o painel admin lê os feedbacks do app pela Edge Function admin-feedbacks.
 *
 *   node __tests__/admin-feedbacks.cjs
 *
 * Executa o index.ts real e os módulos _shared reais; só createClient (rede/Auth/DB) e
 * Deno.env são dublês. Asserta QUAIS consultas aconteceram (só SELECT em feedbacks, nunca
 * escrita), quem passa pelo portão e o que o DTO deixa sair (nada de user_id, aparelho ou
 * print; nada do texto no log).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const ADMIN = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const DONO = '44444444-4444-4444-8444-444444444444';
const ORIGIN = 'https://www.granaponto.com.br';
const TEXTO = 'O app travou quando colei o pix';
const token = (id = ADMIN, aal = 'aal2') => 'valid.' + Buffer.from(JSON.stringify({ sub: id, aal })).toString('base64url') + '.sig';
const linha = (i, extra = {}) => ({
  id: `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`, type: 'bug', rating: 4, message: TEXTO, status: 'pending',
  app_version: '1.10.5', platform: 'android', public_use_consent: false, user_id: DONO,
  device_info: 'Pixel 8, Android 16', screenshot_url: 'https://exemplo/print.png',
  created_at: new Date(Date.UTC(2026, 9, 15, 12, 0, 0) - i * 60_000).toISOString(), ...extra,
});

function harness(opts = {}) {
  const calls = [], logs = [], chaves = [];
  const cache = new Map();
  let handler;
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ADMIN_USER_IDS: ADMIN };
  const builder = (call) => {
    call.eq = []; call.metodos = [];
    const q = {
      select: (f) => { call.select = f; return q; },
      eq: (k, v) => { call.eq.push([k, v]); return q; },
      lt: (k, v) => { call.lt = [k, v]; return q; },
      gte: (k, v) => { call.gte = [k, v]; return q; },
      lte: (k, v) => { call.lte = [k, v]; return q; },
      order: (k, o) => { call.order = [k, o]; return q; },
      limit: (n) => { call.limit = n; return q; },
      abortSignal: () => q,
      then: (ok, ko) => {
        if (opts.erro) return Promise.resolve({ data: null, error: { message: 'postgres ' + TEXTO } }).then(ok, ko);
        return Promise.resolve({ data: opts.linhas ?? [linha(1)], error: null }).then(ok, ko);
      },
    };
    for (const m of ['insert', 'update', 'delete', 'upsert']) q[m] = () => { call.metodos.push(m); return q; };
    return q;
  };
  const client = {
    auth: { getUser: async (jwt) => {
      if (!jwt.startsWith('valid.')) return { data: { user: null }, error: new Error('x') };
      const c = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
      return { error: null, data: { user: { id: c.sub, factors: opts.semTotp ? [] : [{ factor_type: 'totp', status: 'verified' }] } } };
    } },
    from: (t) => { const call = { from: t }; calls.push(call); return builder(call); },
    rpc: (n) => { const call = { rpc: n }; calls.push(call); return builder(call); },
  };
  function load(rel) {
    const abs = path.resolve(ROOT, rel);
    if (cache.has(abs)) return cache.get(abs);
    const exports = {}; cache.set(abs, exports);
    const code = ts.transpileModule(fs.readFileSync(abs, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
      exports, Request, Response, Headers, URL, AbortController, TextDecoder, TextEncoder, Date, Error, atob, crypto: webcrypto,
      setTimeout, clearTimeout,
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
  load('supabase/functions/admin-feedbacks/index.ts');
  const request = async (body, headers = {}) => {
    const h = { Origin: ORIGIN, Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...headers };
    for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
    const r = await handler(new Request('https://p.supabase.co/functions/v1/admin-feedbacks', { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) }));
    return { r, json: await r.json() };
  };
  return { request, calls, logs, chaves };
}
const plano = (v) => JSON.parse(JSON.stringify(v));
let ok = 0;
const igual = (a, b, nome) => { assert.deepEqual(plano(a), plano(b), nome); ok++; };

(async () => {
  /* Admin com aal2 e TOTP: lê, e só lê. */
  {
    const h = harness();
    const { r, json } = await h.request({ recurso: 'feedbacks-listar' });
    igual(r.status, 200, 'admin lê');
    igual(h.calls.map((c) => c.from ?? c.rpc), ['feedbacks'], 'uma consulta só, em feedbacks');
    igual(h.calls[0].metodos, [], 'nenhuma escrita');
    igual(h.calls[0].order, ['created_at', { ascending: false }], 'mais novos primeiro');
    igual(h.calls[0].limit, 51, 'uma página de 50, mais uma linha para saber se há próxima');
    igual(h.chaves, ['anon', 'service'], 'service_role só depois do portão');
    igual(json.dados.feedbacks, [{ id: linha(1).id, tipo: 'bug', nota: 4, mensagem: TEXTO, status: 'pending', versaoApp: '1.10.5',
      plataforma: 'android', usoPublicoAutorizado: false, temConta: true, criadoEm: linha(1).created_at }], 'DTO fechado');
    const corpo = JSON.stringify(json);
    igual([DONO, 'Pixel 8', 'print.png'].filter((s) => corpo.includes(s)), [], 'sem user_id, aparelho nem print na resposta');
    igual(h.logs.some((l) => l.includes(TEXTO)), false, 'texto do feedback nunca vai ao log');
    igual(json.dados.haMais, false, 'sem próxima página');
  }

  /* Filtros e paginação viram exatamente estas cláusulas. */
  {
    const h = harness({ linhas: Array.from({ length: 51 }, (_, i) => linha(i + 1)) });
    const { json } = await h.request({ recurso: 'feedbacks-listar', status: 'pending', tipo: 'bug', antesDe: '2026-10-15T12:00:00.000Z' });
    igual(h.calls[0].eq, [['status', 'pending'], ['type', 'bug']], 'filtros de status e tipo');
    igual(h.calls[0].lt, ['created_at', '2026-10-15T12:00:00.000Z'], 'cursor por data');
    igual([json.dados.feedbacks.length, json.dados.haMais], [50, true], 'página cheia avisa que há mais');
  }

  /* B3b: nota, versão e intervalo de data também viram cláusulas, e só elas. */
  {
    const h = harness();
    await h.request({ recurso: 'feedbacks-listar', nota: 2, versao: '1.10.5', desde: '2026-10-01T03:00:00.000Z', ate: '2026-10-16T02:59:59.999Z' });
    igual(h.calls[0].eq, [['rating', 2], ['app_version', '1.10.5']], 'filtros de nota e versão');
    igual([h.calls[0].gte, h.calls[0].lte], [['created_at', '2026-10-01T03:00:00.000Z'], ['created_at', '2026-10-16T02:59:59.999Z']], 'intervalo de data');
    igual('lt' in h.calls[0], false, 'sem cursor, sem lt');
  }
  {
    const h = harness();
    await h.request({ recurso: 'feedbacks-listar' });
    igual([h.calls[0].eq, 'gte' in h.calls[0], 'lte' in h.calls[0]], [[], false, false], 'sem filtro, sem cláusula');
  }

  /* Portão: quem não é admin, sem TOTP, sem login ou com pedido estranho não chega ao banco. */
  for (const [nome, opts, body, headers, status] of [
    ['outro usuário', {}, { recurso: 'feedbacks-listar' }, { Authorization: 'Bearer ' + token(OUTRO) }, 403],
    ['admin sem aal2', {}, { recurso: 'feedbacks-listar' }, { Authorization: 'Bearer ' + token(ADMIN, 'aal1') }, 403],
    ['admin sem TOTP', { semTotp: true }, { recurso: 'feedbacks-listar' }, {}, 403],
    ['sem login', {}, { recurso: 'feedbacks-listar' }, { Authorization: undefined }, 401],
    ['origem de fora', {}, { recurso: 'feedbacks-listar' }, { Origin: 'https://malicioso.example' }, 403],
    ['recurso de outra função', {}, { recurso: 'visao-geral' }, {}, 400],
    ['campo a mais', {}, { recurso: 'feedbacks-listar', user_id: DONO }, {}, 400],
    ['status inventado', {}, { recurso: 'feedbacks-listar', status: 'apagado' }, {}, 400],
    ['cursor que não é data', {}, { recurso: 'feedbacks-listar', antesDe: "2026'; drop table feedbacks;--" }, {}, 400],
    ['nota zero', {}, { recurso: 'feedbacks-listar', nota: 0 }, {}, 400],
    ['nota seis', {}, { recurso: 'feedbacks-listar', nota: 6 }, {}, 400],
    ['nota quebrada', {}, { recurso: 'feedbacks-listar', nota: 3.5 }, {}, 400],
    ['nota em texto', {}, { recurso: 'feedbacks-listar', nota: '5' }, {}, 400],
    ['versão com curinga', {}, { recurso: 'feedbacks-listar', versao: '1.%' }, {}, 400],
    ['versão longa demais', {}, { recurso: 'feedbacks-listar', versao: '1'.repeat(41) }, {}, 400],
    ['desde que não é data', {}, { recurso: 'feedbacks-listar', desde: 'ontem' }, {}, 400],
    ['intervalo invertido', {}, { recurso: 'feedbacks-listar', desde: '2026-10-16T00:00:00.000Z', ate: '2026-10-01T00:00:00.000Z' }, {}, 400],
  ]) {
    const h = harness(opts);
    const { r } = await h.request(body, headers);
    igual(r.status, status, `${nome}: ${status}`);
    igual(h.calls.length, 0, `${nome}: nenhuma consulta ao banco`);
  }

  /* Falha do banco vira 503 genérico, sem o erro bruto nem o texto. */
  {
    const h = harness({ erro: true });
    const { r, json } = await h.request({ recurso: 'feedbacks-listar' });
    igual([r.status, json.erro.codigo], [503, 'indisponivel'], 'erro do banco: 503 indisponível');
    igual(JSON.stringify(json).includes('postgres'), false, 'sem o erro bruto na resposta');
  }

  /* Linha fora do formato derruba a resposta inteira, em vez de passar adiante. */
  {
    const h = harness({ linhas: [linha(1, { type: 'xss<script>' })] });
    const { r } = await h.request({ recurso: 'feedbacks-listar' });
    igual(r.status, 503, 'tipo desconhecido no banco: 503');
  }

  console.log(`admin-feedbacks: ${ok} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
