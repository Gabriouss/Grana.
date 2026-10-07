'use strict';
// Barreiras do painel local (dono: Keel).
//
// 1. Host: só localhost:PORTA e 127.0.0.1:PORTA (o resto é 421). Fecha DNS
//    rebinding: um domínio externo que resolva para 127.0.0.1 chega com outro Host.
// 2. Origin, quando presente, tem de ser a própria origem local (o resto é 403).
// 3. Toda mutação é POST + application/json + X-Grana-Admin: 1 + cookie de
//    sessão HttpOnly SameSite=Strict + X-CSRF-Token ligado a essa sessão.
//    Formulário de outro site não consegue mandar cabeçalho próprio nem JSON
//    sem preflight, e não há CORS aqui, então o preflight falha.
// 4. Estáticos só de pastas enumeradas; `..`, caminho absoluto, `.env*`,
//    arquivo oculto e saída por junção/atalho (realpath) são recusados.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RAIZ, PORTA } = require('./config.cjs');

const HOSTS = new Set([`localhost:${PORTA}`, `127.0.0.1:${PORTA}`]);
const ORIGENS = new Set([`http://localhost:${PORTA}`, `http://127.0.0.1:${PORTA}`]);

const CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'";

function cabecalhosBase(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
}

function enderecoLocal(req) {
  const a = req.socket && req.socket.remoteAddress;
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function hostValido(req) {
  return HOSTS.has(String(req.headers.host || '').toLowerCase());
}

function origemValida(req) {
  const o = req.headers.origin;
  if (o === undefined) return true;
  return ORIGENS.has(String(o).toLowerCase());
}

// ---------- sessão e CSRF ----------

const SEGREDO_PROCESSO = crypto.randomBytes(32);
const sessoes = new Map(); // id -> criadaEm
const COOKIE = 'grana_admin';
const VIDA_SESSAO_MS = 12 * 60 * 60 * 1000;

function lerCookie(req) {
  const bruto = String(req.headers.cookie || '');
  for (const parte of bruto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

function sessaoValida(id) {
  if (!id || !/^[A-Za-z0-9_-]{43}$/.test(id)) return false;
  const criada = sessoes.get(id);
  if (!criada) return false;
  if (Date.now() - criada > VIDA_SESSAO_MS) { sessoes.delete(id); return false; }
  return true;
}

/** Garante uma sessão válida; emite cookie novo se faltar. Devolve o id. */
function garantirSessao(req, res) {
  const atual = lerCookie(req);
  if (sessaoValida(atual)) return atual;
  // Achado A6 do Lynx: poda as vencidas e mantém no máximo 200 sessões.
  const agora = Date.now();
  for (const [k, criada] of sessoes) if (agora - criada > VIDA_SESSAO_MS) sessoes.delete(k);
  while (sessoes.size >= 200) sessoes.delete(sessoes.keys().next().value);
  const id = crypto.randomBytes(32).toString('base64url');
  sessoes.set(id, agora);
  res.setHeader('Set-Cookie', `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${VIDA_SESSAO_MS / 1000}`);
  return id;
}

function csrfDe(idSessao) {
  return crypto.createHmac('sha256', SEGREDO_PROCESSO).update(idSessao).digest('base64url');
}

function iguais(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Checa uma requisição de API. Devolve null se pode seguir, ou
 * { status, codigo, mensagem } para recusar.
 */
function checarApi(req) {
  if (!origemValida(req)) return { status: 403, codigo: 'origem-recusada', mensagem: 'Origem não permitida.' };
  const mutacao = req.method !== 'GET' && req.method !== 'HEAD';
  if (!mutacao) return null;
  if (req.method !== 'POST') return { status: 405, codigo: 'metodo-recusado', mensagem: 'Método não permitido.' };
  if (req.headers['x-grana-admin'] !== '1') return { status: 403, codigo: 'cabecalho-ausente', mensagem: 'Falta o cabeçalho X-Grana-Admin.' };
  const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (tipo !== 'application/json') return { status: 403, codigo: 'tipo-recusado', mensagem: 'O corpo precisa ser JSON.' };
  const sessao = lerCookie(req);
  if (!sessaoValida(sessao)) return { status: 403, codigo: 'sessao-expirada', mensagem: 'Sessão do painel expirou. Recarregue a página.' };
  if (!iguais(req.headers['x-csrf-token'], csrfDe(sessao))) return { status: 403, codigo: 'csrf-invalido', mensagem: 'Token de proteção inválido. Recarregue a página.' };
  return null;
}

// ---------- estáticos ----------

const WEB = path.join(__dirname, 'web');
const EXT_MIDIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.mov', '.mp3', '.m4a', '.wav', '.pdf']);

// prefixo de URL -> { raiz física, extensões permitidas (null = qualquer não sensível) }
const MONTAGENS = [
  { prefixo: '/design-system/marca/', raiz: path.join(RAIZ, 'design-system', 'marca') },
  { prefixo: '/design-system/tokens/', raiz: path.join(RAIZ, 'design-system', 'tokens') },
  { prefixo: '/design-system/pagina/', raiz: path.join(RAIZ, 'design-system', 'pagina') },
  { prefixo: '/design-system/previews/', raiz: path.join(RAIZ, 'design-system', 'previews') },
  { prefixo: '/design-system/marketing-mockups/', raiz: path.join(RAIZ, 'design-system', 'marketing-mockups') },
  { prefixo: '/assets/fonts/', raiz: path.join(RAIZ, 'assets', 'fonts'), ext: new Set(['.otf', '.ttf', '.woff', '.woff2']) },
  { prefixo: '/docs/marketing/', raiz: path.join(RAIZ, 'docs', 'marketing'), ext: EXT_MIDIA },
  { prefixo: '/', raiz: WEB },
];

// Arquivos soltos liberados um a um (texto público de marca, pedido do Lumen).
const AVULSOS = {
  '/design-system/TOM_DE_VOZ.md': path.join(RAIZ, 'design-system', 'TOM_DE_VOZ.md'),
};

const EXT_BLOQUEADA =new Set(['.cjs', '.mjs', '.ts', '.env', '.key', '.pem', '.ps1', '.cmd', '.bat', '.sh']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function dentro(raiz, alvo) {
  const rel = path.relative(raiz, alvo);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve um caminho de URL para arquivo físico permitido, ou null.
 * Recusa qualquer coisa duvidosa em vez de tentar consertar.
 */
function resolverEstatico(pathname) {
  let decodificado;
  try { decodificado = decodeURIComponent(pathname); } catch { return null; }
  if (decodificado.includes('\0') || decodificado.includes('\\') || decodificado.includes(':')) return null;
  const partes = decodificado.split('/').filter(Boolean);
  for (const p of partes) {
    if (p === '..' || p === '.' || p.startsWith('.')) return null; // inclui .env*, .git
  }
  if (decodificado.endsWith('/') || partes.length === 0) decodificado = (decodificado.replace(/\/+$/, '') || '') + '/index.html';
  const avulso = AVULSOS[decodificado];
  if (avulso) {
    try { return { arquivo: fs.realpathSync(avulso), mime: MIME[path.extname(avulso).toLowerCase()] }; } catch { return null; }
  }
  const m = MONTAGENS.find((mm) => decodificado.startsWith(mm.prefixo));
  if (!m) return null;
  const resto = decodificado.slice(m.prefixo.length);
  const ext = path.extname(resto).toLowerCase();
  if (EXT_BLOQUEADA.has(ext)) return null;
  if (m.ext && !m.ext.has(ext)) return null;
  if (!MIME[ext]) return null;
  const alvo = path.resolve(m.raiz, resto);
  if (!dentro(m.raiz, alvo)) return null;
  let real;
  try {
    real = fs.realpathSync(alvo);
    const raizReal = fs.realpathSync(m.raiz);
    if (!dentro(raizReal, real)) return null; // junção ou atalho apontando para fora
    if (!fs.statSync(real).isFile()) return null;
  } catch { return null; }
  return { arquivo: real, mime: MIME[ext] };
}

module.exports = {
  HOSTS, ORIGENS, CSP, cabecalhosBase, enderecoLocal, hostValido, origemValida,
  garantirSessao, csrfDe, checarApi, resolverEstatico, lerCookie, sessaoValida,
};
