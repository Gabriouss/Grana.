'use strict';
// Barreiras do painel local (dono: Keel).
//
// 1. Host: só 127.0.0.1:PORTA (canônica) e localhost:PORTA (que redireciona
//    para a canônica). O resto é 421, o que fecha DNS rebinding.
// 2. Origin, quando presente, tem de ser a própria origem local (o resto é 403).
// 3. PAREAMENTO: abrir a página não cria sessão. O servidor gera um código de
//    uso único, gravado só num arquivo do usuário fora do repositório; o
//    lançador lê o código e abre /parear?c=<código>. Só então nasce a sessão
//    (cookie HttpOnly SameSite=Strict). Sem sessão, toda /api/* menos
//    /api/saude devolve 401. Sessão expira com 8h sem uso e morre com o servidor.
// 4. Toda mutação é POST + application/json + X-Grana-Admin: 1 + sessão +
//    X-CSRF-Token ligado a ela. Ações destrutivas exigem sessão pareada há
//    menos de 15 minutos.
// 5. Estáticos só de pastas enumeradas, com realpath contra junção; nome com
//    `:` (ADS), controle, `\`, `//`, nome reservado do Windows, ponto ou espaço
//    no fim e segmento oculto são recusados. O que vem do repositório (SVG,
//    HTML, texto) é servido em sandbox: nenhum script roda.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { RAIZ, RAIZ_DADOS, PORTA } = require('./config.cjs');
const { registrar } = require('./auditoria.cjs');

const ORIGEM_CANONICA = `http://127.0.0.1:${PORTA}`;
const HOST_CANONICO = `127.0.0.1:${PORTA}`;
const HOSTS = new Set([`localhost:${PORTA}`, HOST_CANONICO]);
const ORIGENS = new Set([`http://localhost:${PORTA}`, ORIGEM_CANONICA]);

const CSP = "default-src 'self'; script-src 'self'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'";

// Documentos vindos do repositório: nenhum script, nunca.
const CSP_SVG = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'";
// Sem allow-same-origin (achado R2): a página vira origem opaca, sem acesso à
// sessão. Efeito colateral aceito: a fonte do Grana. não carrega ali dentro.
const CSP_HTML_REPO = "sandbox allow-popups; default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
const CSP_TEXTO = "sandbox; default-src 'none'; frame-ancestors 'none'";

function cabecalhosBase(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(), clipboard-read=()');
}

function enderecoLocal(req) {
  const a = req.socket && req.socket.remoteAddress;
  return a === '127.0.0.1' || a === '::ffff:127.0.0.1';
}

function hostDe(req) {
  return String(req.headers.host || '').toLowerCase();
}

function hostValido(req) {
  return HOSTS.has(hostDe(req));
}

function hostCanonico(req) {
  return hostDe(req) === HOST_CANONICO;
}

function origemValida(req) {
  const o = req.headers.origin;
  if (o === undefined) return true;
  return ORIGENS.has(String(o).toLowerCase());
}

// ---------- pareamento ----------

const PASTA_DADOS = process.env.GRANA_ADMIN_PASTA_CONTA || path.join(process.env.APPDATA || os.homedir(), 'grana-admin');
const ARQUIVO_PAREAMENTO = path.join(PASTA_DADOS, `pareamento-${PORTA}.txt`);
const VIDA_CODIGO_MS = 10 * 60 * 1000;
const FALHAS_PAREAR_MAX = 5;
const JANELA_FALHAS_MS = 10 * 60 * 1000;

let codigo = null; // { valor, criadoEm }
let falhasPareamento = [];

function novoCodigo() {
  codigo = { valor: crypto.randomBytes(24).toString('base64url'), criadoEm: Date.now() };
  try {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
    fs.writeFileSync(ARQUIVO_PAREAMENTO, codigo.valor, { encoding: 'utf8', mode: 0o600 });
  } catch (e) {
    console.error('[painel] não consegui gravar o código de pareamento: ' + e.code);
  }
}

function apagarCodigo() {
  try { fs.unlinkSync(ARQUIVO_PAREAMENTO); } catch { /* já não existe */ }
}

function girarSeVencido() {
  if (!codigo || Date.now() - codigo.criadoEm > VIDA_CODIGO_MS) novoCodigo();
}

/**
 * Troca o código de uso único por uma sessão nova (etapa "senha").
 * Devolve { ok:true, id } ou { ok:false, status, codigo, mensagem, tentarEmSeg? }.
 */
function parear(valor) {
  const agora = Date.now();
  falhasPareamento = falhasPareamento.filter((t) => agora - t < JANELA_FALHAS_MS);
  if (falhasPareamento.length >= FALHAS_PAREAR_MAX) {
    const espera = JANELA_FALHAS_MS - (agora - falhasPareamento[0]);
    return { ok: false, status: 429, codigo: 'bloqueado', mensagem: 'Muitas tentativas de pareamento erradas. Espere e abra pelo atalho.', tentarEmSeg: Math.ceil(espera / 1000) };
  }
  girarSeVencido();
  if (typeof valor !== 'string' || valor.length > 64 || !codigo || !iguais(valor, codigo.valor)) {
    falhasPareamento.push(agora);
    return { ok: false, status: 403, codigo: 'pareamento-invalido', mensagem: 'Código de pareamento inválido ou vencido. Abra o painel pelo atalho Grana. Admin.' };
  }
  novoCodigo(); // uso único
  return { ok: true, id: criarSessao({ pareadaEm: agora }) };
}

// ---------- sessão, etapas do login e CSRF ----------
//
// Sessão opaca (32 bytes aleatórios) em memória: morre com o servidor.
//   etapa "senha": pareada, sem login.  etapa "totp": senha recebida (certa ou não).
//   etapa "ok": login completo.
// O id é trocado no pareamento e no login completo (contra fixação de sessão).

const SEGREDO_PROCESSO = crypto.randomBytes(32);
const sessoes = new Map();
const COOKIE = 'grana_admin';
const PAREAMENTO_INATIVO_MS = 8 * 60 * 60 * 1000;
// Duração do login (único lugar). Decisão do autor em 09/10/2026: "logado o dia todo", então 12 h de
// inatividade e 12 h de teto absoluto. Não é "sem limite": a sessão continua morrendo com o servidor,
// com Sair e com a troca do autenticador. Valores anteriores, para voltar fácil: inatividade 30 min
// (antes 10 min, Watchtower) e teto absoluto 1 h (Watchtower). Step-up (5 min) não muda.
const LOGIN_ABSOLUTO_MS = 12 * 60 * 60 * 1000;
const LOGIN_INATIVO_MS = 12 * 60 * 60 * 1000;
const PASSO_SENHA_MS = 5 * 60 * 1000; // a senha recebida vale 5 min para o código chegar
const STEP_UP_MS = 5 * 60 * 1000; // ação destrutiva: TOTP dos últimos 5 min
const MAX_SESSOES = 20;

function criarSessao(base) {
  const agora = Date.now();
  for (const [k, s] of sessoes) {
    if (agora - s.ultimoUso > PAREAMENTO_INATIVO_MS) { sessoes.delete(k); registrar('sessao-encerrada', { motivo: 'pareamento-inativo', sessao: k }); }
  }
  // Só quem tem o código de pareamento cria sessão, então o teto não vira
  // arma de quem está de fora (achado R1 do Lynx).
  while (sessoes.size >= MAX_SESSOES) {
    const velha = sessoes.keys().next().value;
    sessoes.delete(velha);
    registrar('sessao-encerrada', { motivo: 'teto-de-sessoes', sessao: velha });
  }
  const id = crypto.randomBytes(32).toString('base64url');
  sessoes.set(id, { pareadaEm: agora, ultimoUso: agora, etapa: 'senha', senhaOk: false, senhaEm: 0, loginEm: 0, atividadeEm: 0, totpEm: 0, geracao: null, ...base });
  return id;
}

/** Troca o id mantendo o estado. Devolve o id novo. */
function rotacionar(id) {
  const s = sessoes.get(id);
  if (!s) return null; // destruída no meio do caminho (revogação, sair): não promove
  sessoes.delete(id);
  const novo = crypto.randomBytes(32).toString('base64url');
  sessoes.set(novo, s);
  return novo;
}

/** Destrói o contexto (e com ele o CSRF, que deriva do id). Devolve se existia. */
function encerrarSessao(id) {
  return sessoes.delete(id);
}

/** Destrói todas as sessões (revogação geral). Devolve quantas. */
function encerrarTodas() {
  const n = sessoes.size;
  sessoes.clear();
  return n;
}

function cookieDaSessao(id) {
  // Sem Max-Age nem Domain: cookie de sessão do navegador. A validade real é a do servidor.
  return `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/`;
}

/** Apaga o cookie no navegador: mesmo nome, Path e escopo host-only (F5). */
function cookieExpirado() {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function lerCookie(req) {
  const bruto = String(req.headers.cookie || '');
  for (const parte of bruto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

/**
 * Sessão da requisição, já com o vencimento do login aplicado:
 * { id, s, motivo } (motivo = 'inatividade' | 'sessao-expirada' quando o login
 * acabou de vencer neste pedido), ou null.
 * `humano`: o pedido veio de um gesto da pessoa (X-Grana-Atividade: 1) e renova a inatividade.
 */
function sessaoDe(req, humano) {
  const id = lerCookie(req);
  if (!id) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return { cookieMorto: true };
  const s = sessoes.get(id);
  if (!s) return { cookieMorto: true }; // cookie de contexto que não existe mais: o navegador deve apagá-lo
  const agora = Date.now();
  // Vencimento destrói o contexto inteiro, com o CSRF dele (F5). Voltar exige
  // novo pareamento pelo atalho. Uma linha de auditoria por transição (F6).
  let motivo = null;
  if (agora - s.ultimoUso > PAREAMENTO_INATIVO_MS) motivo = 'pareamento-inativo';
  else if (s.etapa === 'ok' && agora - s.loginEm > LOGIN_ABSOLUTO_MS) motivo = 'sessao-expirada';
  else if (s.etapa === 'ok' && agora - s.atividadeEm > LOGIN_INATIVO_MS) motivo = 'inatividade';
  if (motivo) {
    sessoes.delete(id);
    registrar('sessao-encerrada', { motivo, sessao: id });
    return { encerrada: motivo };
  }
  s.ultimoUso = agora;
  if (s.etapa === 'ok' && humano) s.atividadeEm = agora;
  if (s.etapa === 'totp' && agora - s.senhaEm > PASSO_SENHA_MS) Object.assign(s, { etapa: 'senha', senhaOk: false, geracao: null });
  return { id, s };
}

function resumoDaSessao(sessao) {
  if (!sessao) return { etapa: 'nao-pareado' };
  const { id, s } = sessao;
  const r = { etapa: s.etapa, csrfToken: csrfDe(id) };
  if (s.etapa === 'ok') {
    const agora = Date.now();
    r.expiraEm = new Date(s.loginEm + LOGIN_ABSOLUTO_MS).toISOString();
    r.inatividadeSeg = LOGIN_INATIVO_MS / 1000;
    r.restanteSeg = Math.max(0, Math.floor(Math.min(LOGIN_INATIVO_MS - (agora - s.atividadeEm), LOGIN_ABSOLUTO_MS - (agora - s.loginEm)) / 1000));
  }
  return r;
}

function stepUpValido(s) {
  return !!s && s.etapa === 'ok' && Date.now() - s.totpEm < STEP_UP_MS;
}

function csrfDe(idSessao) {
  return crypto.createHmac('sha256', SEGREDO_PROCESSO).update(idSessao).digest('base64url');
}

function iguais(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Pedido vindo de outro site (achado R1): o navegador marca com Sec-Fetch-Site. */
function deOutroSite(req) {
  const sfs = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  return sfs === 'cross-site' || sfs === 'same-site';
}

/** Mais de um Host na mesma requisição (achado R5). */
function hostDuplicado(req) {
  let n = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i].toLowerCase() === 'host') n++;
  return n !== 1;
}

/** Checagens comuns a toda /api/*. Devolve a recusa ou null. */
function checarApi(req) {
  if (!origemValida(req) || deOutroSite(req)) return { status: 403, codigo: 'origem-recusada', mensagem: 'Origem não permitida.' };
  const leitura = req.method === 'GET' || req.method === 'HEAD';
  if (!leitura && req.method !== 'POST') return { status: 405, codigo: 'metodo-recusado', mensagem: 'Método não permitido.' };
  return null;
}

/** Cabeçalhos exigidos de todo pedido de API fora de /api/saude. */
function checarCabecalhos(req, { exigeCsrf, sessao, exigeOrigem }) {
  if (req.headers['x-grana-admin'] !== '1') return { status: 403, codigo: 'cabecalho-ausente', mensagem: 'Falta o cabeçalho X-Grana-Admin.' };
  if (req.method !== 'POST') return null;
  const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (tipo !== 'application/json') return { status: 403, codigo: 'tipo-recusado', mensagem: 'O corpo precisa ser JSON.' };
  if (exigeOrigem && String(req.headers.origin || '').toLowerCase() !== ORIGEM_CANONICA) {
    return { status: 403, codigo: 'origem-recusada', mensagem: `Abra o painel por ${ORIGEM_CANONICA}.` };
  }
  if (exigeCsrf && (!sessao || !iguais(req.headers['x-csrf-token'], csrfDe(sessao.id)))) {
    return { status: 403, codigo: 'csrf-invalido', mensagem: 'Token de proteção inválido. Recarregue a página.' };
  }
  return null;
}

// ---------- limite de frequência ----------

const usos = new Map(); // chave -> [timestamps]

/** true se ainda cabe; registra o uso. */
function dentroDoLimite(chave, maximo, janelaMs) {
  const agora = Date.now();
  const lista = (usos.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= maximo) { usos.set(chave, lista); return false; }
  lista.push(agora);
  usos.set(chave, lista);
  return true;
}

// ---------- estáticos ----------

const WEB = path.join(__dirname, 'web');
const EXT_MIDIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.mov', '.mp3', '.m4a', '.wav', '.pdf']);

// prefixo de URL -> raiz física, extensões permitidas (sem `ext` = qualquer uma do MIME)
const MONTAGENS = [
  // publico: carrega sem login (a tela de login precisa da marca e da fonte,
  // que já são públicas no repositório). O resto exige sessão completa.
  { prefixo: '/design-system/marca/', raiz: path.join(RAIZ, 'design-system', 'marca'), ext: new Set(['.svg']), publico: true },
  { prefixo: '/design-system/tokens/', raiz: path.join(RAIZ, 'design-system', 'tokens'), ext: new Set(['.css', '.json']) },
  { prefixo: '/design-system/pagina/', raiz: path.join(RAIZ, 'design-system', 'pagina'), ext: new Set(['.html']) },
  { prefixo: '/design-system/previews/', raiz: path.join(RAIZ, 'design-system', 'previews'), ext: new Set(['.html']) },
  { prefixo: '/design-system/previews-img/', raiz: path.join(RAIZ, 'design-system', 'previews-img'), ext: new Set(['.webp']) },
  { prefixo: '/design-system/marketing-mockups/', raiz: path.join(RAIZ, 'design-system', 'marketing-mockups'), ext: new Set(['.png', '.jpg', '.jpeg', '.webp']) },
  { prefixo: '/assets/fonts/', raiz: path.join(RAIZ, 'assets', 'fonts'), ext: new Set(['.otf', '.ttf', '.woff', '.woff2']), publico: true },
  // .md e .txt para a prévia de peças de texto (F4 do Lumen): saem como text/plain em sandbox.
  // L03: o acervo sai da MESMA raiz de dados das APIs de marketing. Na instância
  // de QA (GRANA_ADMIN_RAIZ_DADOS), só a cópia é servida, sem cair no acervo real.
  { prefixo: '/docs/marketing/', raiz: path.join(RAIZ_DADOS, 'docs', 'marketing'), ext: new Set([...EXT_MIDIA, '.md', '.txt']) },
  { prefixo: '/', raiz: WEB, proprio: true, publico: true, ext: new Set(['.html', '.js', '.css', '.svg', '.png', '.ico', '.json', '.woff2', '.otf']) },
];

// Arquivos soltos liberados um a um (texto público de marca, pedido do Lumen).
const AVULSOS = {
  '/design-system/TOM_DE_VOZ.md': path.join(RAIZ, 'design-system', 'TOM_DE_VOZ.md'),
};

const EXT_BLOQUEADA = new Set(['.cjs', '.mjs', '.ts', '.env', '.key', '.pem', '.ps1', '.cmd', '.bat', '.sh', '.lnk', '.url']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const RESERVADOS = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\..*)?$/i;

function segmentoRuim(p) {
  return p === '..' || p === '.' || p.startsWith('.') // .env*, .git, ocultos
    || /[\u0000-\u001f\u007f<>"|?*]/.test(p) // controle e caracteres proibidos no Windows
    || /[. ]$/.test(p) // "index.html." e "x " viram outro arquivo no Windows
    || RESERVADOS.test(p)
    || /~\d/.test(p); // nome curto 8.3 (PROGRA~1) que contorna a lista
}

function dentro(raiz, alvo) {
  const rel = path.relative(raiz, alvo);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Cabeçalhos extras para o que vem do repositório (conteúdo não confiável). */
function cabecalhosDoArquivo(ext, proprio, nome) {
  if (proprio) return {};
  const nomeSeguro = nome.replace(/[^A-Za-z0-9._-]/g, '_');
  if (ext === '.svg') return { 'Content-Security-Policy': CSP_SVG, 'Content-Disposition': `inline; filename="${nomeSeguro}"` };
  if (ext === '.html') return { 'Content-Security-Policy': CSP_HTML_REPO, 'Content-Disposition': `inline; filename="${nomeSeguro}"` };
  if (ext === '.pdf') return { 'Content-Security-Policy': CSP_TEXTO, 'Content-Disposition': `attachment; filename="${nomeSeguro}"` };
  if (ext === '.md' || ext === '.txt' || ext === '.json' || ext === '.css') return { 'Content-Security-Policy': CSP_TEXTO, 'Content-Disposition': `inline; filename="${nomeSeguro}"` };
  return { 'Content-Disposition': `inline; filename="${nomeSeguro}"` }; // imagem, vídeo, áudio, fonte
}

/**
 * Resolve um caminho de URL para arquivo físico permitido, ou null.
 * Recusa qualquer coisa duvidosa em vez de tentar consertar.
 */
function resolverEstatico(pathname) {
  if (pathname.length > 512) return null;
  let decodificado;
  try { decodificado = decodeURIComponent(pathname); } catch { return null; }
  if (decodificado.includes('\\') || decodificado.includes(':') || decodificado.includes('//')) return null;
  if (/[\u0000-\u001f\u007f]/.test(decodificado)) return null;
  // Unicode que alguns sistemas normalizam para ponto ou barra
  if (decodificado.normalize('NFKC') !== decodificado) return null;
  const partes = decodificado.split('/').filter(Boolean);
  for (const p of partes) if (segmentoRuim(p)) return null;
  if (decodificado.endsWith('/') || partes.length === 0) decodificado = (decodificado.replace(/\/+$/, '') || '') + '/index.html';
  // Favicon canonico, arquivo exato; nao monta a pasta public.
  if (decodificado === '/favicon.svg') {
    try {
      const esperado = path.resolve(RAIZ, 'public', 'favicon.svg');
      const real = fs.realpathSync(esperado);
      if (path.relative(esperado, real) !== '' || !fs.statSync(real).isFile()) return null;
      return { arquivo: real, mime: MIME['.svg'], publico: true, extras: cabecalhosDoArquivo('.svg', false, 'favicon.svg') };
    } catch { return null; }
  }
  const avulso = AVULSOS[decodificado];
  if (avulso) {
    try {
      const ext = path.extname(avulso).toLowerCase();
      return { arquivo: fs.realpathSync(avulso), mime: MIME[ext], publico: false, extras: cabecalhosDoArquivo(ext, false, path.basename(avulso)) };
    } catch { return null; }
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
    const st = fs.lstatSync(real);
    if (!st.isFile()) return null;
  } catch { return null; }
  return { arquivo: real, mime: MIME[ext], publico: !!m.publico, proprio: !!m.proprio, extras: cabecalhosDoArquivo(ext, !!m.proprio, path.basename(real)) };
}

module.exports = {
  HOSTS, ORIGENS, ORIGEM_CANONICA, HOST_CANONICO, CSP, ARQUIVO_PAREAMENTO, PASTA_DADOS,
  cabecalhosBase, enderecoLocal, hostValido, hostCanonico, origemValida, deOutroSite, hostDuplicado,
  novoCodigo, apagarCodigo, girarSeVencido, parear, criarSessao, rotacionar, encerrarSessao, encerrarTodas, cookieDaSessao, cookieExpirado,
  sessaoDe, resumoDaSessao, stepUpValido, csrfDe, checarApi, checarCabecalhos, dentroDoLimite, resolverEstatico, lerCookie,
};
