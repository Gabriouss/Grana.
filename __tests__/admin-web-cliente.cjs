const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const js = ts.transpileModule(fs.readFileSync('lib/admin-web.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function ambiente({ session, response, body, status = 200 } = {}) {
  const exports = {}, timers = new Map(), calls = [];
  let serial = 0;
  vm.runInNewContext(js, {
    exports, AbortController, Date, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-fixture' } },
    crypto: { randomUUID: () => 'ref' },
    setTimeout: (f) => { const id = ++serial; timers.set(id, f); return id; }, clearTimeout: (id) => timers.delete(id),
    require: () => ({ supabase: { auth: { getSession: session || (async () => ({ data: { session: { access_token: 'fixture-token' } } })) } } }),
    fetch: async (...args) => { calls.push(args); return response ? response() : { ok: status === 200, status, json: async () => body }; },
  });
  return { ...exports, calls, expirar: () => [...timers.values()].forEach((f) => f()), timers };
}
const acesso = { ok: true, contrato: 1, geradoEm: '2026-10-08T12:00:00Z', dados: { admin: false } };
(async () => {
  for (const fase of ['sessao', 'cabecalho', 'corpo']) {
    const nunca = () => new Promise(() => {});
    const a = ambiente(fase === 'sessao' ? { session: nunca } : fase === 'cabecalho' ? { response: nunca } : { response: async () => ({ ok: true, status: 200, json: nunca }) });
    const p = a.consultarAdmin('acesso'); await tick(); a.expirar();
    await assert.rejects(p, (e) => e.codigo === 'prazo' && e.ocorrencia === 'web-ref');
    assert.equal(a.timers.size, 0);
    if (a.calls.length) assert.equal(a.calls[0][1].signal.aborted, true);
  }
  for (const status of [401, 403, 429, 500]) {
    const a = ambiente({ status, body: { erro: { codigo: 'SEGREDO-NAO-ECOAR', mensagem: 'SEGREDO-NAO-ECOAR' }, ocorrencia: '<script>' } });
    await assert.rejects(a.consultarAdmin('acesso'), (e) => !JSON.stringify(e).includes('SEGREDO') && e.ocorrencia === 'web-ref');
  }
  {
    const a = ambiente({ body: acesso }); const r = await a.consultarAdmin('acesso'); assert.equal(r.dados.admin, false);
    const init = a.calls[0][1]; assert.equal(init.cache, 'no-store'); assert.equal(init.method, 'POST');
    assert.equal(init.body, '{"recurso":"acesso"}'); assert.equal(a.calls.length, 1);
  }
  for (const dados of [{ admin: false, email: 'pessoa@example.invalid' }, { admin: true, aal: 'aal2', totp: 'verificado', id: 'pessoa' }]) {
    const a = ambiente({ body: { ...acesso, dados } }); await assert.rejects(a.consultarAdmin('acesso'), (e) => e.codigo === 'resposta-invalida');
  }
  {
    const dados = { contas: { indisponivel: true, total: 99 }, assinaturas: { indisponivel: true }, receita: { indisponivel: true }, app: { indisponivel: true }, uso: { indisponivel: true } };
    const a = ambiente({ body: { ...acesso, dados, segredoExtra: 'NAO-RETORNAR' } }); const r = await a.consultarAdmin('visao-geral');
    assert.equal(r.dados.contas.total, undefined); assert.equal(r.segredoExtra, undefined);
  }
  console.log('admin-web-cliente: prazo sessão/cabeçalho/corpo, no-store, DTO fechado e erros sanitizados OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
