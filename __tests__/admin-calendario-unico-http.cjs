'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { Readable } = require('node:stream');
const { criarCalendarioUnico } = require('../tools/admin-local/marketing/calendario-unico.cjs');
let sessao = null, calls = 0;
const calendario = criarCalendarioUnico({ editorial: (_, mes) => ({ mes, itens: [], avisos: [] }),
  catalogo: () => ({ pecas: [] }), listar: async () => { calls++; return { jobs: [], limitado: false, proximoCursor: null }; } });
const m = { exports: {} };
vm.runInNewContext(fs.readFileSync('tools/admin-local/rotas.cjs', 'utf8'), { module: m, exports: m.exports, Buffer, console, Date, URL, Set, Map,
  __dirname: path.resolve('tools/admin-local'), require: id => {
    if (id === 'path') return path;
    if (id === './config.cjs') return { RAIZ_DADOS: '.', SIMULAR: false, ocultar: String };
    if (id === './seguranca.cjs') return { checarApi: () => null, sessaoDe: () => sessao, dentroDoLimite: () => true };
    if (id === './autenticacao.cjs') return { situacaoConta: () => ({ estado: 'ok', geracao: 1 }) };
    if (id === './auditoria.cjs') return { registrar() {} };
    if (id.replace(/\\/g, '/').endsWith('/marketing/calendario-unico.cjs')) return { calendario };
    throw Error('IMPORT PROIBIDO ' + id);
  } });
async function get(query) {
  const req = Readable.from([]); req.headers = { 'x-grana-admin': '1' }; req.method = 'GET';
  const res = { headersSent: false, statusCode: 200, setHeader() {}, writeHead(status) { this.statusCode = status; this.headersSent = true; }, end(s) { this.body = JSON.parse(s); } };
  await m.exports.tratarApi(req, res, new URL('http://127.0.0.1:4317/api/marketing/calendario' + query)); return res;
}
(async () => {
  assert.equal((await get('?mes=2026-10')).statusCode, 401); assert.equal(calls, 0);
  sessao = { id: 'fixture', s: { etapa: 'totp', geracao: 1 } };
  assert.equal((await get('?mes=2026-10')).statusCode, 401); assert.equal(calls, 0);
  sessao.s.etapa = 'ok';
  const r = await get('?mes=2026-10'); assert.equal(r.statusCode, 200); assert.equal(r.body.dados.reais.completo, true); assert.equal(r.body.dados.mes, '2026-10');
  assert.equal((await get('?mes=2026-10&camada=planejado')).body.dados.reais.status, 'nao-consultado'); assert.equal(calls, 1);
  for (const q of ['?mes=2026-13', '?mes=2026-10&mes=2026-11', '?mes=2026-10&admin=qualquer', '?mes=2026-10&cursorReal=xyz', '?mes=2026-10&camada=x']) assert.equal((await get(q)).statusCode, 400);
  assert.equal(calls, 1); console.log('admin-calendario-unico-http: sessão, TOTP, filtros fechados, compatibilidade e zero mutação OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
