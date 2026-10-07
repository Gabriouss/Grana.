'use strict';
// Painel administrativo local do Grana. (dono: Keel)
//
//   scripts\abrir-painel.cmd  (o jeito certo: pareia e abre o navegador)
//   node tools/admin-local/server.cjs   -> http://127.0.0.1:4317/
//
// Escuta SÓ em 127.0.0.1. Sem dependência externa: Node puro.
// GRANA_ADMIN_PORTA=43xx troca a porta (teste em paralelo).
// GRANA_ADMIN_SIMULAR=1 faz toda ação (redeploy, preparar build) só simular.
// GRANA_ADMIN_RAIZ_DADOS=<pasta> grava o marketing numa cópia (teste).
// GRANA_ADMIN_PASTA_CONTA=<pasta> usa outra conta admin (teste).

const http = require('http');
const fs = require('fs');
const { PORTA, SIMULAR, ocultar } = require('./config.cjs');
const seg = require('./seguranca.cjs');
const auth = require('./autenticacao.cjs');
const { registrar } = require('./auditoria.cjs');
const { tratarApi, responderErro, sessaoCompleta } = require('./rotas.cjs');

// O servidor nunca cai por exceção esquecida; o log sai sem segredo e sem pilha.
process.on('uncaughtException', (e) => console.error('[painel] exceção não tratada: ' + ocultar(e && e.message).slice(0, 200)));
process.on('unhandledRejection', (e) => console.error('[painel] promessa rejeitada: ' + ocultar(e && e.message).slice(0, 200)));

function texto(res, status, msg, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(msg);
}

function servirEstatico(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return texto(res, 405, 'Método não permitido.', { Allow: 'GET, HEAD' });
  const alvo = seg.resolverEstatico(pathname);
  if (!alvo) return texto(res, 404, 'Não encontrado.');
  // Acervo e design system exigem login completo; a casca, a marca e a fonte não,
  // porque a tela de login precisa delas (e já são públicas no repositório).
  if (!alvo.publico && !sessaoCompleta(req)) return texto(res, 401, 'Entre no painel para ver este arquivo.');

  let tamanho;
  try { tamanho = fs.statSync(alvo.arquivo).size; } catch { return texto(res, 404, 'Não encontrado.'); }
  const cab = { 'Content-Type': alvo.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': alvo.publico ? 'no-cache' : 'private, no-store', ...alvo.extras };
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
  try {
    // Defesa extra: o bind já é 127.0.0.1, mas se algo mudar, ninguém de fora entra.
    if (!seg.enderecoLocal(req)) { req.socket.destroy(); return; }
    seg.cabecalhosBase(res);
    if (seg.hostDuplicado(req)) return texto(res, 400, 'Requisição inválida.', { Connection: 'close' });
    if (!seg.hostValido(req)) return texto(res, 421, `Host não permitido. Abra ${seg.ORIGEM_CANONICA}/`, { Connection: 'close' });

    let url;
    try { url = new URL(req.url, seg.ORIGEM_CANONICA); } catch { return texto(res, 400, 'Endereço inválido.'); }

    // Origem canônica única (A7): localhost:4317 vira 127.0.0.1:4317 nas páginas.
    if (!seg.hostCanonico(req) && !url.pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(308, { Location: seg.ORIGEM_CANONICA + url.pathname, 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      tratarApi(req, res, url).catch((e) => responderErro(res, 500, 'erro-interno', 'Falha inesperada no servidor do painel.', e));
      return;
    }
    // Pedido de outro site nunca recebe arquivo (achado R1), nem página.
    if (!seg.origemValida(req) || seg.deOutroSite(req)) return texto(res, 403, 'Origem não permitida.');
    servirEstatico(req, res, url.pathname);
  } catch (e) {
    console.error('[painel] falha ao tratar pedido: ' + ocultar(e && e.message).slice(0, 200));
    try { texto(res, 500, 'Falha no servidor do painel.'); } catch { /* conexão já fechada */ }
  }
});

servidor.headersTimeout = 20_000;
servidor.requestTimeout = 150_000; // cobre o preparar-build (até 120s) com folga
servidor.maxHeadersCount = 64;

servidor.on('clientError', (e, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); } catch {} });

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`A porta ${PORTA} já está em uso. Se for o painel, ele já está aberto em ${seg.ORIGEM_CANONICA}/`);
    console.error('Se for outro programa, feche-o ou rode com GRANA_ADMIN_PORTA=43xx.');
  } else {
    console.error('O painel não conseguiu subir: ' + e.code);
  }
  process.exit(1);
});

function encerrar() {
  seg.apagarCodigo();
  registrar('servidor', { resultado: 'encerrado' });
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
process.on('SIGBREAK', encerrar); // fechar a janela do console no Windows
process.on('exit', () => seg.apagarCodigo());

const pastaOk = auth.protegerPasta();
seg.novoCodigo();
setInterval(() => seg.girarSeVencido(), 60_000).unref();

servidor.listen(PORTA, '127.0.0.1', () => {
  registrar('servidor', { resultado: 'no-ar', simulado: SIMULAR });
  console.log(`Grana. Admin no ar: ${seg.ORIGEM_CANONICA}/  (só neste computador${SIMULAR ? ', modo SIMULADO' : ''})`);
  if (!pastaOk) console.log('AVISO: não consegui restringir a permissão da pasta de dados do painel.');
  if (!auth.configurado()) console.log('A conta admin ainda não existe. Rode: node tools/admin-local/configurar-login.cjs');
  console.log('Abra pelo atalho "Grana. Admin" (ele pareia o navegador). Para encerrar, feche esta janela ou aperte Ctrl+C.');
});
