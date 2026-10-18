'use strict';
// Rotas, sessão, senha, TOTP e CSRF reais; somente a fronteira remota é dublada.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const ROOT = path.resolve(__dirname, '..');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-real-http-'));
process.env.GRANA_ADMIN_PASTA_CONTA = pasta;
const UUID = '11111111-1111-4111-8111-111111111111';
const chamadas = [];
let tratar, fonteErro = null;
const fonte = {
  executar: async p => { chamadas.push(p); if (fonteErro) throw fonteErro; return { contractVersion: 'e5.real.v1', modo: 'real', jobs: [], proximoCursor: null }; },
  prever: async (_, p) => { chamadas.push(p); return { modo: 'real', podeConfirmar: false, previaId: UUID }; },
  midia: async (...p) => { chamadas.push(p); return { conteudo: Buffer.from([137,80,78,71,13,10,26,10]), mime: 'image/png' }; },
};
const server = http.createServer((req, res) => tratar(req, res, new URL(req.url, 'http://localhost')).catch(() => { res.statusCode = 500; res.end(); }));
const realNow = Date.now;
let tempo = realNow(), cookie = '', csrf = '';
Date.now = () => tempo;
(async () => {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const porta = server.address().port, origem = `http://127.0.0.1:${porta}`;
  const configPath = require.resolve('../tools/admin-local/config.cjs');
  require.cache[configPath] = { id: configPath, filename: configPath, loaded: true,
    exports: { RAIZ: ROOT, RAIZ_DADOS: pasta, PORTA: porta, SIMULAR: false, ocultar: String, ler: () => null } };
  const backendPath = require.resolve('../tools/admin-local/adaptadores/marketing-backend.cjs');
  require.cache[backendPath] = { id: backendPath, filename: backendPath, loaded: true, exports: { backend: () => ({ publicacoes: fonte }) } };
  const auth = require('../tools/admin-local/autenticacao.cjs');
  const seg = require('../tools/admin-local/seguranca.cjs');
  tratar = require('../tools/admin-local/rotas.cjs').tratarApi;
  const segredo = auth.novoSegredoTotp();
  await auth.salvarConta({ usuario: 'qa-local', senha: 'senha-local-de-fixture', segredoTotp: segredo });
  const codigo = () => auth.hotp(auth.deBase32(segredo), Math.floor(tempo / 30000));
  async function pedir(rota, corpo, extras = {}) {
    const r = await fetch(origem + rota, { method: corpo === undefined ? 'GET' : 'POST',
      headers: { 'X-Grana-Admin': '1', Origin: origem, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...extras },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });
    const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
    if ((r.headers.get('content-type') || '').startsWith('image/')) return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()), headers: r.headers };
    const body = await r.json(); if (body.dados?.csrfToken) csrf = body.dados.csrfToken;
    return { status: r.status, body };
  }
  const base = '/api/marketing/publicacoes';
  const confirmar = { acao: 'confirmar', previaId: UUID, previaHash: 'a'.repeat(64), revisaoEsperada: 1, idempotencia: UUID, confirmacao: true };
  assert.equal((await pedir(base)).status, 401); assert.equal(chamadas.length, 0);
  seg.novoCodigo();
  assert.equal((await pedir('/api/parear', { codigo: fs.readFileSync(seg.ARQUIVO_PAREAMENTO, 'utf8') })).status, 200);
  assert.equal((await pedir(base)).status, 401);
  assert.equal((await pedir('/api/login', { senha: 'senha-local-de-fixture' })).body.dados.etapa, 'totp');
  assert.equal((await pedir(base, confirmar)).body.erro.codigo, 'totp-pendente'); assert.equal(chamadas.length, 0);
  assert.equal((await pedir('/api/login/totp', { codigo: codigo() })).body.dados.etapa, 'ok');
  assert.equal((await pedir(base, confirmar, { 'X-CSRF-Token': '' })).body.erro.codigo, 'csrf-invalido');
  assert.equal((await pedir(base, confirmar, { Origin: 'http://outro.invalid' })).body.erro.codigo, 'origem-recusada');
  assert.equal((await pedir(base, { ...confirmar, confirmacao: false })).status, 400);
  assert.equal((await pedir(base, { ...confirmar, token: 'arbitrario' })).status, 400);
  assert.equal(chamadas.length, 0, 'negativas não chamam RPC, Storage nem Meta');
  tempo += 6 * 60000;
  assert.equal((await pedir(base, confirmar)).body.erro.codigo, 'reautenticar'); assert.equal(chamadas.length, 0);
  assert.equal((await pedir('/api/login/totp', { codigo: codigo() })).status, 200);
  assert.equal((await pedir(base, confirmar)).status, 200);
  assert.equal(chamadas[0].idempotencia, UUID); assert.equal(chamadas[0].confirmado, true);
  assert.equal(chamadas[0].confirmacao, undefined); assert.equal(chamadas[0].modo, 'real');
  const quantidade = chamadas.length;
  assert.equal((await pedir(base + '?limite=51')).status, 400);
  assert.equal((await pedir(base + '?url=https://outro.invalid')).status, 400);
  assert.equal((await pedir(base + '/detalhe?jobId=' + UUID + '&loteId=' + UUID)).status, 400);
  assert.equal(chamadas.length, quantidade);
  assert.equal((await pedir(base + '?limite=2')).status, 200);
  assert.equal(chamadas.at(-1).limite, 2);
  assert.equal((await pedir(base + '/capacidades')).status, 200); assert.equal(chamadas.at(-1).acao, 'contas');
  const b = await pedir(base + '/midia?previaId=' + UUID + '&indice=0');
  assert.equal(b.status, 200); assert.equal(b.bytes.length, 8); assert.equal(b.headers.get('cache-control'), 'private, no-store');
  assert.equal((await pedir(base + '/midia?previaId=' + UUID + '&indice=../secreto')).status, 400);
  const { ErroMarketing } = require('../tools/admin-local/marketing/catalogo.cjs');
  fonteErro = new ErroMarketing('revisao-divergente', 'Recarregue a revisão.', 409);
  assert.equal((await pedir(base, confirmar)).body.erro.codigo, 'revisao-divergente');
  console.log('admin-publicacoes-reais-http: HTTP/senha/TOTP/CSRF/mídia/contrato/zero efeitos nas negativas OK');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  Date.now = realNow; server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  const alvo = path.resolve(pasta);
  assert.equal(path.dirname(alvo), path.resolve(os.tmpdir())); assert.ok(path.basename(alvo).startsWith('grana-real-http-'));
  fs.rmSync(alvo, { recursive: true, force: true });
});
