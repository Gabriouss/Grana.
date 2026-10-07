'use strict';
// Login da conta admin do painel local (dono: Keel). Camada A MAIS sobre o
// pareamento, Host/Origin e CSRF de seguranca.cjs, nunca no lugar deles.
//
// - Senha: scrypt assíncrono (N=2^17, r=8, p=1, maxmem 256 MiB, sal de 32
//   bytes), comparação em tempo constante, um hash por vez no processo, e o
//   bloqueio é checado ANTES de gastar o hash.
// - Segundo fator obrigatório: TOTP (RFC 6238, HMAC-SHA1, 30s, 6 dígitos,
//   janela ±1). O passo aceito é gravado em disco ANTES de a sessão nascer,
//   e nenhum passo igual ou anterior é aceito de novo (anti-replay).
// - O veredito só sai no fim (senha + código), com erro genérico.
// - Bloqueio progressivo com contadores separados para senha e código,
//   gravado em disco (reiniciar não zera).
// - Recuperação: só recadastrando o TOTP no terminal desta máquina, com a
//   senha atual (configurar-login.cjs --refazer-totp). O navegador nunca recupera conta.
// - Tudo fica FORA do repositório, em %APPDATA%\grana-admin\, com permissão
//   só para o usuário do Windows (regra 15: o repo é público).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PASTA = process.env.GRANA_ADMIN_PASTA_CONTA || path.join(process.env.APPDATA || os.homedir(), 'grana-admin');
const ARQUIVO_CONTA = path.join(PASTA, 'conta.json');
const ARQUIVO_BLOQUEIO = path.join(PASTA, 'bloqueio.json');

const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024, tamanho: 64 };

// ---------- pasta protegida ----------

/** Cria a pasta e tira a herança de permissão: só o usuário atual lê e escreve. */
function protegerPasta() {
  fs.mkdirSync(PASTA, { recursive: true });
  if (process.platform !== 'win32') { try { fs.chmodSync(PASTA, 0o700); } catch {} return true; }
  try {
    const usuario = `${process.env.USERDOMAIN || os.hostname()}\\${process.env.USERNAME || os.userInfo().username}`;
    execFileSync('icacls', [PASTA, '/inheritance:r', '/grant:r', `${usuario}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

// ---------- utilidades ----------

function gravarAtomico(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, arquivo);
}

function lerJson(arquivo) {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return null; }
}

function iguais(a, b) {
  const x = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const y = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function scrypt(texto, sal, params = SCRYPT) {
  return new Promise((ok, falha) => crypto.scrypt(String(texto).normalize('NFKC'), sal, params.tamanho,
    { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem || SCRYPT.maxmem }, (e, chave) => (e ? falha(e) : ok(chave))));
}

async function hashSenha(senha) {
  const sal = crypto.randomBytes(32);
  const hash = await scrypt(senha, sal);
  return { alg: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, tamanho: SCRYPT.tamanho, sal: sal.toString('base64'), hash: hash.toString('base64') };
}

async function conferirHash(texto, registro) {
  if (!registro || registro.alg !== 'scrypt') return false;
  const calc = await scrypt(texto, Buffer.from(registro.sal, 'base64'), registro);
  return iguais(calc, Buffer.from(registro.hash, 'base64'));
}

// ---------- TOTP (RFC 6238 / RFC 4226) ----------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf) {
  let bits = 0, valor = 0, saida = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte; bits += 8;
    while (bits >= 5) { saida += BASE32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

function deBase32(texto) {
  const limpo = String(texto).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, valor = 0;
  const bytes = [];
  for (const c of limpo) {
    valor = (valor << 5) | BASE32.indexOf(c); bits += 5;
    if (bits >= 8) { bytes.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

function hotp(segredo, contador) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = crypto.createHmac('sha1', segredo).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

const PASSO_S = 30;

/** Passo aceito (número) ou null. Janela ±1, nunca um passo <= ultimoPasso (reuso). */
function conferirTotp(segredoBase32, codigo, ultimoPasso, agoraMs = Date.now()) {
  if (!/^\d{6}$/.test(String(codigo || ''))) return null;
  const segredo = deBase32(segredoBase32);
  const atual = Math.floor(agoraMs / 1000 / PASSO_S);
  let aceito = null;
  for (const d of [-1, 0, 1]) {
    // Compara todos os candidatos, sem sair no primeiro acerto.
    if (iguais(hotp(segredo, atual + d), String(codigo)) && aceito === null) aceito = atual + d;
  }
  if (aceito === null) return null;
  if (typeof ultimoPasso === 'number' && aceito <= ultimoPasso) return null;
  return aceito;
}

function novoSegredoTotp() {
  return base32(crypto.randomBytes(20)); // 160 bits, o recomendado pela RFC 4226
}

function uriOtpauth(segredoBase32, usuario) {
  const rotulo = encodeURIComponent(`Grana. Admin:${usuario}`);
  return `otpauth://totp/${rotulo}?secret=${segredoBase32}&issuer=${encodeURIComponent('Grana. Admin')}&algorithm=SHA1&digits=6&period=${PASSO_S}`;
}

// ---------- conta ----------

function conta() {
  const c = lerJson(ARQUIVO_CONTA);
  if (!c || !c.usuario || !c.senha || !c.totp || !c.totp.segredo) return null;
  return c;
}

function configurado() {
  return !!conta();
}

async function salvarConta({ usuario, senha, segredoTotp }) {
  protegerPasta();
  gravarAtomico(ARQUIVO_CONTA, {
    formato: 1,
    usuario,
    senha: await hashSenha(senha),
    totp: { segredo: segredoTotp, ultimoPasso: null },
    criadoEm: new Date().toISOString(),
  });
  zerarBloqueio();
}

async function trocarTotp(segredoTotp) {
  const c = conta();
  c.totp = { segredo: segredoTotp, ultimoPasso: null };
  c.totpTrocadoEm = new Date().toISOString();
  gravarAtomico(ARQUIVO_CONTA, c);
  zerarBloqueio();
}

// ---------- bloqueio progressivo ----------

const VAZIO = () => ({ senha: { falhas: 0, ultima: 0 }, codigo: { falhas: 0, ultima: 0 }, bloqueadoAte: 0 });

function estadoBloqueio() {
  const e = lerJson(ARQUIVO_BLOQUEIO);
  return e && e.senha && e.codigo ? e : VAZIO();
}

function zerarBloqueio() {
  gravarAtomico(ARQUIVO_BLOQUEIO, VAZIO());
}

/**
 * Soma uma falha no contador do fator. 3 falhas de um fator dão 30s de
 * bloqueio, e o tempo dobra a cada falha seguinte, até 24h. Contador esquecido
 * após 24h sem falha. O bloqueio vale para qualquer tentativa.
 */
function registrarFalha(fator) {
  const e = estadoBloqueio();
  const agora = Date.now();
  const c = e[fator];
  if (agora - c.ultima > 24 * 3600_000) c.falhas = 0;
  c.falhas += 1;
  c.ultima = agora;
  const pior = Math.max(e.senha.falhas, e.codigo.falhas);
  if (pior >= 3) e.bloqueadoAte = Math.max(e.bloqueadoAte, agora + Math.min(30_000 * 2 ** (pior - 3), 24 * 3600_000));
  gravarAtomico(ARQUIVO_BLOQUEIO, e);
}

function bloqueadoPor() {
  const resta = estadoBloqueio().bloqueadoAte - Date.now();
  return resta > 0 ? resta : 0;
}

function recusaBloqueio(espera) {
  return { ok: false, status: 429, codigo: 'bloqueado', mensagem: `Muitas tentativas erradas. Tente de novo em ${Math.ceil(espera / 60000)} min.`, tentarEmSeg: Math.ceil(espera / 1000) };
}

const NAO_CONFIGURADO = { ok: false, status: 503, codigo: 'login-nao-configurado', mensagem: 'A conta admin ainda não foi criada. Feche o painel e abra pelo atalho Grana. Admin: ele pede para criar senha e autenticador no terminal.' };
const RECUSADO = { ok: false, status: 401, codigo: 'credencial-invalida', mensagem: 'Senha ou código incorreto.' };

// ---------- passos do login ----------

let ocupado = false; // um hash/login por vez no processo

async function exclusivo(fn) {
  if (ocupado) return { ok: false, status: 429, codigo: 'login-em-andamento', mensagem: 'Já há uma tentativa de login em andamento.' };
  ocupado = true;
  try { return await fn(); } finally { ocupado = false; }
}

/**
 * Passo 1: confere a senha e devolve o resultado SÓ para o servidor guardar na
 * sessão. A resposta HTTP é a mesma, certa ou errada.
 */
function conferirSenha(senha) {
  const c = conta();
  if (!c) return Promise.resolve(NAO_CONFIGURADO);
  const espera = bloqueadoPor();
  if (espera) return Promise.resolve(recusaBloqueio(espera));
  if (typeof senha !== 'string' || !senha || senha.length > 256) return Promise.resolve({ ok: true, senhaOk: false });
  return exclusivo(async () => ({ ok: true, senhaOk: await conferirHash(senha, c.senha) }));
}

/** Grava o passo aceito antes de qualquer sessão nascer. */
function consumirPasso(passo) {
  const atual = conta();
  if (typeof atual.totp.ultimoPasso === 'number' && passo <= atual.totp.ultimoPasso) return false; // corrida
  atual.totp.ultimoPasso = passo;
  gravarAtomico(ARQUIVO_CONTA, atual);
  return true;
}

/**
 * Passo 2: veredito. `senhaOk` vem da sessão (passo 1). Qualquer falha devolve
 * o mesmo erro; o fator que falhou vai só para a auditoria (`fatorFalho`).
 */
function concluirLogin({ senhaOk, codigo }) {
  const c = conta();
  if (!c) return Promise.resolve(NAO_CONFIGURADO);
  const espera = bloqueadoPor();
  if (espera) return Promise.resolve(recusaBloqueio(espera));
  return exclusivo(async () => {
    const passo = conferirTotp(c.totp.segredo, String(codigo || '').replace(/\s/g, ''), c.totp.ultimoPasso);
    if (!senhaOk || passo === null) {
      registrarFalha(!senhaOk ? 'senha' : 'codigo');
      return { ...RECUSADO, fatorFalho: !senhaOk ? 'senha' : 'codigo' };
    }
    if (!consumirPasso(passo)) { registrarFalha('codigo'); return { ...RECUSADO, fatorFalho: 'codigo-reusado' }; }
    zerarBloqueio();
    return { ok: true };
  });
}

/** Reconfirmação (step-up) para ação destrutiva: só o código, com a sessão já aberta. */
function reconfirmar(codigo) {
  return concluirLogin({ senhaOk: true, codigo });
}

module.exports = {
  PASTA, ARQUIVO_CONTA, protegerPasta, configurado, conta, conferirSenha, concluirLogin, reconfirmar,
  salvarConta, trocarTotp, novoSegredoTotp, uriOtpauth, conferirTotp, hotp, base32, deBase32,
  conferirHash, bloqueadoPor, zerarBloqueio,
};
