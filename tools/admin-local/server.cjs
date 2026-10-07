'use strict';
// Painel administrativo local do Grana. (dono: Keel)
//
//   node tools/admin-local/server.cjs        -> http://localhost:4317/
//
// Escuta SÓ em 127.0.0.1. Sem dependência externa: Node puro.
// GRANA_ADMIN_PORTA=43xx troca a porta (teste em paralelo).
// GRANA_ADMIN_SIMULAR=1 faz toda ação (redeploy, preparar build) só simular.

const http = require('http');
const fs = require('fs');
const { PORTA, SIMULAR } = require('./config.cjs');
const seg = require('./seguranca.cjs');
const { tratarApi, responderErro } = require('./rotas.cjs');

function servirEstatico(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Método não permitido.');
  }
  const alvo = seg.resolverEstatico(pathname);
  if (!alvo) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('Não encontrado.');
  }
  // A página do painel emite a sessão (cookie HttpOnly SameSite=Strict).
  if (alvo.mime.startsWith('text/html')) seg.garantirSessao(req, res);

  const tamanho = fs.statSync(alvo.arquivo).size;
  const cab = { 'Content-Type': alvo.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && (range[1] || range[2])) {
    let ini = range[1] ? Number(range[1]) : tamanho - Number(range[2]);
    let fim = range[1] && range[2] ? Number(range[2]) : tamanho - 1;
    if (ini < 0) ini = 0;
    if (fim >= tamanho) fim = tamanho - 1;
    if (ini > fim || ini >= tamanho) {
      res.writeHead(416, { 'Content-Range': `bytes */${tamanho}` });
      return res.end();
    }
    res.writeHead(206, { ...cab, 'Content-Range': `bytes ${ini}-${fim}/${tamanho}`, 'Content-Length': fim - ini + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(alvo.arquivo, { start: ini, end: fim }).on('error', () => res.destroy()).pipe(res);
  }
  res.writeHead(200, { ...cab, 'Content-Length': tamanho });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(alvo.arquivo).on('error', () => res.destroy()).pipe(res);
}

const servidor = http.createServer((req, res) => {
  // Defesa extra: o bind já é 127.0.0.1, mas se algo mudar, ninguém de fora entra.
  if (!seg.enderecoLocal(req)) { req.socket.destroy(); return; }
  if (!seg.hostValido(req)) {
    res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
    return res.end('Host não permitido. Abra http://localhost:' + PORTA + '/');
  }
  seg.cabecalhosBase(res);
  let url;
  try { url = new URL(req.url, `http://localhost:${PORTA}`); } catch {
    res.writeHead(400); return res.end();
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    tratarApi(req, res, url).catch((e) => responderErro(res, 500, 'erro-interno', 'Falha inesperada no servidor do painel.', e));
    return;
  }
  if (!seg.origemValida(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Origem não permitida.');
  }
  servirEstatico(req, res, url.pathname);
});

servidor.headersTimeout = 20_000;
servidor.requestTimeout = 120_000;

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`A porta ${PORTA} já está em uso. Se for o painel, ele já está aberto em http://localhost:${PORTA}/`);
    console.error('Se for outro programa, feche-o ou rode com GRANA_ADMIN_PORTA=43xx.');
  } else {
    console.error('O painel não conseguiu subir: ' + e.code);
  }
  process.exit(1);
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Grana. Admin no ar: http://localhost:${PORTA}/  (só neste computador${SIMULAR ? ', modo SIMULADO' : ''})`);
  console.log('Para encerrar, feche esta janela ou aperte Ctrl+C.');
});
