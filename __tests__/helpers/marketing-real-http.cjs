'use strict';
// Rotas e autenticação reais; só configura o domínio injetado e os diretórios sintéticos.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

async function criarHttpPublicacoes(api, raiz) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-cadeia-http-'));
  const anteriores = new Map(['GRANA_ADMIN_PASTA_CONTA', 'GRANA_ADMIN_RAIZ_DADOS'].map(k => [k, process.env[k]]));
  process.env.GRANA_ADMIN_PASTA_CONTA = pasta;
  process.env.GRANA_ADMIN_RAIZ_DADOS = pasta;
  const cache = new Map(Object.entries(require.cache));
  let tratar, cookie = '', csrf = '';
  const server = http.createServer((req, res) => {
    tratar(req, res, new URL(req.url, 'http://localhost')).catch(() => {
      res.statusCode = 500; res.end('{}');
    });
  });
  async function fechar() {
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    for (const id of Object.keys(require.cache)) if (!cache.has(id)) delete require.cache[id];
    for (const [id, m] of cache) require.cache[id] = m;
    for (const [k, v] of anteriores) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    assert.equal(path.dirname(path.resolve(pasta)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(pasta).startsWith('grana-cadeia-http-'));
    fs.rmSync(pasta, { recursive: true, force: true });
  }
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const porta = server.address().port, origem = `http://127.0.0.1:${porta}`;
    function injetar(rel, exports) {
      const id = require.resolve(rel);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    injetar('../../tools/admin-local/config.cjs', {
      RAIZ: path.resolve(__dirname, '../..'), RAIZ_DADOS: raiz, PORTA: porta,
      SIMULAR: false, ocultar: String, ler: () => null,
    });
    injetar('../../tools/admin-local/marketing/publicacoes.cjs', api);
    const auth = require('../../tools/admin-local/autenticacao.cjs');
    const seg = require('../../tools/admin-local/seguranca.cjs');
    tratar = require('../../tools/admin-local/rotas.cjs').tratarApi;
    const segredo = auth.novoSegredoTotp(), senha = 'senha-sintetica-so-do-teste';
    await auth.salvarConta({ usuario: 'cadeia-fixture', senha, segredoTotp: segredo });
    const respostas = [];
    async function pedir(rota, corpo, extras = {}) {
      // Esta é a única rede de verdade do teste: loopback efêmero.
      const alvo = new URL(rota, origem); assert.equal(alvo.origin, origem);
      const r = await fetch(alvo, { method: corpo === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { 'X-Grana-Admin': '1', Origin: origem, Cookie: cookie,
          'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...extras },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });
      const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
      const body = await r.json(); if (body.dados?.csrfToken) csrf = body.dados.csrfToken;
      respostas.push({ rota: alvo.pathname, status: r.status, codigo: body.erro?.codigo });
      return { status: r.status, body };
    }
    async function transportar(rota, corpo) {
      const { status, body } = await pedir(rota, corpo);
      if (status >= 400) throw Object.assign(new Error('HTTP recusado'), { status, codigo: body.erro?.codigo });
      return body;
    }
    const base = '/api/marketing/publicacoes';
    assert.equal((await pedir(base)).status, 401);
    seg.novoCodigo();
    assert.equal((await pedir('/api/parear', { codigo: fs.readFileSync(seg.ARQUIVO_PAREAMENTO, 'utf8') })).status, 200);
    assert.equal((await pedir('/api/login', { senha })).body.dados.etapa, 'totp');
    assert.equal((await pedir(base)).body.erro.codigo, 'totp-pendente');
    const codigo = auth.hotp(auth.deBase32(segredo), Math.floor(Date.now() / 30000));
    assert.equal((await pedir('/api/login/totp', { codigo })).body.dados.etapa, 'ok');
    const comando = { acao: 'reconciliar', jobId: '11111111-1111-4111-8111-111111111111',
      revisaoEsperada: 1, idempotencia: '22222222-2222-4222-8222-222222222222', confirmacao: true };
    assert.equal((await pedir(base, comando, { 'X-CSRF-Token': '' })).body.erro.codigo, 'csrf-invalido');
    assert.equal((await pedir(base, comando, { Origin: 'http://outro.invalid' })).body.erro.codigo, 'origem-recusada');
    return { ctx: { api: rota => transportar(rota), acao: transportar }, pedir, respostas, fechar };
  } catch (e) { await fechar(); throw e; }
}
module.exports = { criarHttpPublicacoes };
