'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const marcador = 'DADO_INDIVIDUAL_PROIBIDO';
const chamados = [], agora = Date.parse('2026-10-08T18:00:00Z');
class Relogio extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return agora; } }
class ErroIntegracao extends Error { constructor(codigo, mensagem, status = 503) { super(mensagem); this.codigo = codigo; this.status = status; } }
let fonteCakto;
function load(nome, http) {
  const m = { exports: {} };
  const fonte = process.argv.includes('--antes') ? execFileSync('git', ['show', 'fcd2792:tools/admin-local/adaptadores/' + nome], { cwd: repo, encoding: 'utf8' }) : fs.readFileSync(path.join(repo, 'tools/admin-local/adaptadores', nome), 'utf8');
  vm.runInNewContext(fonte, {
    module: m, exports: m.exports, Date: Relogio, console, Buffer,
    process: { env: new Proxy({}, { get() { throw new Error('ENV REAL PROIBIDO'); } }) },
    fetch() { throw new Error('REDE REAL PROIBIDA'); },
    require: (id) => {
      if (id === '../config.cjs') return { RAIZ: repo, ler: () => 'TOKEN_FICTICIO', tem: () => true, refSupabase: () => 'ref-ficticia', registrarSegredo() {} };
      if (id === './_http.cjs') return { pedirJson: async (...a) => { chamados.push(a); return http(...a); }, ErroIntegracao };
      if (id === './git-local.cjs' || id === './recibos-funcoes.cjs') return {};
      if (id === './supabase.cjs') return fonteCakto;
      if (id === 'fs') return fs;
      if (id === 'path') return path;
      throw new Error('IMPORT PROIBIDO ' + id);
    },
  }, { filename: nome });
  return m.exports;
}
function semIndividual(dados) {
  const texto = JSON.stringify(dados); assert(!texto.includes(marcador)); assert(!texto.includes('TOKEN_FICTICIO'));
  assert(!/"(?:email|ultimosCadastros|cadastros|recentes|refId|customer|paymentMethod|amount|user_id)"/.test(texto));
}
let n = 0;
async function test(nome, fn) { chamados.length = 0; await fn(); n++; console.log('OK ' + nome); }
(async () => {
  await test('Supabase real: SQL só agregado e DTO fechado não propaga colunas individuais', async () => {
    const sb = load('supabase.cjs', (_, url, op) => {
      if (!op?.corpo) return { status: 200, dados: { id: 'ref-ficticia', name: 'Fixture', region: 'fixture', status: 'ACTIVE' } };
      const query = op.corpo.query;
      if (query.includes('json_build_object')) return { status: 200, dados: [{ r: {
        usuarios: { total: 10, hoje: 2, ultimos7: 4, ultimos30: 8, confirmados: 9, email: marcador, id: marcador },
        cadastros: [{ email: marcador, created_at: marcador }], temAssinaturas: true, temPush: true,
      } }] };
      if (query.includes('subscriptions')) return { status: 200, dados: [{ status: 'active', total: 3, email: marcador, user_id: marcador }, { status: marcador, total: 2 }] };
      if (query.includes('push_tokens')) return { status: 200, dados: [{ total: 4, usuarios: 3, email: marcador }] };
      throw new Error('SQL INESPERADO');
    });
    fonteCakto = sb; const r = await sb.resumo(); semIndividual(r);
    assert.equal(r.usuarios.total, 10); assert.equal(r.usuarios.hoje, 2); assert.equal(r.assinaturas.ativas, 3);
    assert.equal(r.pushTokens.total, 4); assert.equal(chamados.length, 4);
    const queries = chamados.filter((a) => a[2]?.corpo?.query).map((a) => a[2].corpo.query);
    assert(!queries.some((q) => /json_agg|select\s+created_at\s*,\s*email|limit\s+10/i.test(q)));
    assert(queries.some((q) => /count\(\*\).*filter/s.test(q))); assert.equal(sb.mascararEmail, undefined);
  });
  await test('Cakto real: só contagens e somas; períodos corretos e sem lista individual', async () => {
    const dados = [
      { status: 'paid', amount: '10.50', paidAt: '2026-10-08T10:00:00-03:00' },
      { status: 'paid', amount: 20, paidAt: '2026-10-04T12:00:00-03:00' },
      { status: 'paid', amount: 30, paidAt: '2026-09-20T12:00:00-03:00' },
      { status: 'paid', amount: 99, paidAt: '2026-08-01T12:00:00-03:00' },
      { status: 'paid', amount: 99, paidAt: '2099-01-01T12:00:00Z' },
      { status: 'paid', amount: 99, paidAt: 'data inválida' },
      { status: marcador, amount: 99, paidAt: null },
    ].map((p) => ({ ...p, refId: marcador, customer: { email: marcador }, paymentMethod: marcador, product: { name: marcador } }));
    const ca = load('cakto.cjs', (_, url) => url.endsWith('/token/') ? { status: 200, dados: { access_token: 'TOKEN_FICTICIO', expires_in: 3600 } } : { status: 200, dados: { count: 150, results: dados } });
    const r = await ca.resumo(); semIndividual(r);
    assert.equal(r.pagos.hoje.pedidos, 1); assert.equal(r.pagos.hoje.valor, 10.5);
    assert.equal(r.pagos.ultimos7.valor, 30.5); assert.equal(r.pagos.ultimos30.valor, 60.5);
    assert.equal(r.pagos.ultimos30.pedidos, 3); assert.equal(r.porStatus.outros, 1);
    assert.equal(chamados.length, 2); assert(chamados[1][1].includes('limit=100')); assert.equal(chamados[1][2].cabecalhos.Authorization, 'Bearer TOKEN_FICTICIO');
  });
  await test('Supabase ausência/contagens inválidas não vira linha ou segredo no DTO', async () => {
    const sb = load('supabase.cjs', (_, url, op) => !op?.corpo ? { status: 200, dados: {} } : { status: 200, dados: [{ r: { usuarios: { total: marcador }, temAssinaturas: false, temPush: false } }] });
    const r = await sb.resumo(); semIndividual(r); assert.equal(r.usuarios, null); assert.equal(r.assinaturas.status, 'ausente');
  });
  console.log(`admin-local-agregados: ${n} grupos verdes, módulos reais e chamadas asseridas, zero rede/env real`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
