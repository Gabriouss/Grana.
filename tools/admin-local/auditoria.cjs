'use strict';
// Auditoria local do painel (dono: Keel). Uma linha JSON por evento em
// %APPDATA%\grana-admin\auditoria.log (ou GRANA_ADMIN_PASTA_CONTA), pasta com
// permissão só do usuário (fora do git, do EAS e do Google Drive).
//
// Módulo sem dependência do servidor: o terminal (configurar-login.cjs) usa o
// mesmo registro sem carregar o .env nem as integrações (F6). O servidor liga
// o filtro de segredos com `definirFiltro(ocultar)`.
//
// Só entram campos da lista abaixo. Nunca: senha, segredo/URI do TOTP, código,
// cookie, CSRF, hash, corpo de pedido ou valor do .env. A sessão vira um
// apelido (hash curto), que não serve para entrar.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PASTA = process.env.GRANA_ADMIN_PASTA_CONTA || path.join(process.env.APPDATA || os.homedir(), 'grana-admin');
const ARQUIVO = path.join(PASTA, 'auditoria.log');
const LIMITE_BYTES = 5 * 1024 * 1024;
const CAMPOS = new Set(['passo', 'resultado', 'codigo', 'fator', 'motivo', 'rota', 'acao', 'origem', 'simulado', 'quantas', 'pid', 'codigoSaida', 'ultimoSinalDeVida']);

let filtro = (t) => t;
function definirFiltro(fn) { if (typeof fn === 'function') filtro = fn; }

function agoraLocal() {
  const d = new Date();
  const p = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(off / 60)}:${p(off % 60)}`;
}

function apelido(idSessao) {
  return idSessao ? crypto.createHash('sha256').update(String(idSessao)).digest('hex').slice(0, 10) : null;
}

/**
 * evento: 'servidor' | 'pareamento' | 'login' | 'logout' | 'sessao-encerrada' |
 * 'revogacao' | 'conta' | 'acao' | 'recusa'. Campos fora da lista são ignorados.
 */
function registrar(evento, campos = {}) {
  const linha = { em: agoraLocal(), evento };
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined || v === null) continue;
    if (k === 'sessao') linha.sessao = apelido(v);
    else if (CAMPOS.has(k)) linha[k] = typeof v === 'string' ? v.slice(0, 120) : v;
  }
  try {
    fs.mkdirSync(PASTA, { recursive: true });
    try {
      if (fs.statSync(ARQUIVO).size > LIMITE_BYTES) fs.renameSync(ARQUIVO, ARQUIVO + '.1'); // gira um arquivo
    } catch { /* ainda não existe */ }
    fs.appendFileSync(ARQUIVO, filtro(JSON.stringify(linha)) + '\n', { encoding: 'utf8', mode: 0o600 });
    return true;
  } catch (e) {
    // Falha de auditoria não derruba o painel, mas deixa recibo visível.
    console.error('[painel] AUDITORIA NÃO GRAVOU (' + (e && e.code) + '): evento ' + evento);
    return false;
  }
}

module.exports = { registrar, definirFiltro, ARQUIVO };
