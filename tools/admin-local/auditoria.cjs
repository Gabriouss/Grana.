'use strict';
// Auditoria local do painel (dono: Keel). Uma linha JSON por evento em
// %APPDATA%\grana-admin\auditoria.log, pasta com permissão só do usuário
// (fora do git, do EAS e do Google Drive). Nunca grava senha, código, token,
// cookie, corpo de pedido nem valor do .env: só o evento, o resultado e um
// apelido curto da sessão (hash), que não serve para entrar.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ocultar } = require('./config.cjs');
const { PASTA_DADOS } = require('./seguranca.cjs');

const ARQUIVO = path.join(PASTA_DADOS, 'auditoria.log');
const LIMITE_BYTES = 5 * 1024 * 1024;

function agoraLocal() {
  const d = new Date();
  const p = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(off / 60)}:${p(off % 60)}`;
}

function apelido(idSessao) {
  return idSessao ? crypto.createHash('sha256').update(idSessao).digest('hex').slice(0, 10) : null;
}

/** evento: 'login' | 'pareamento' | 'acao' | 'logout' | 'recusa'... ; campos sem segredo. */
function registrar(evento, campos = {}) {
  const linha = { em: agoraLocal(), evento };
  for (const [k, v] of Object.entries(campos)) {
    if (k === 'sessao') linha.sessao = apelido(v);
    else if (v !== undefined) linha[k] = typeof v === 'string' ? v.slice(0, 200) : v;
  }
  try {
    fs.mkdirSync(PASTA_DADOS, { recursive: true });
    try {
      if (fs.statSync(ARQUIVO).size > LIMITE_BYTES) fs.renameSync(ARQUIVO, ARQUIVO + '.1'); // gira um arquivo
    } catch { /* ainda não existe */ }
    fs.appendFileSync(ARQUIVO, ocultar(JSON.stringify(linha)) + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch (e) {
    // Falha de auditoria não derruba o painel, mas deixa recibo no console.
    console.error('[painel] auditoria não gravou: ' + (e && e.code));
  }
}

module.exports = { registrar, ARQUIVO };
