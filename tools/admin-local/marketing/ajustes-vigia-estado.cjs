'use strict';
// Batimento do vigia de entrega: o vigia (vigia-ajustes.cjs, num terminal do Maestri) grava
// aqui a hora e o pid a cada poucos segundos; o servidor do atalho só LÊ, para a tela dizer
// quando ninguém está entregando. Arquivo pequeno, sem texto de autor.
const fs = require('fs');
const path = require('path');

const VALIDADE_MS = 20_000;
const arquivoDe = (pasta) => path.join(pasta, 'ajustes-vigia.json');

function escrever(pasta, agora = Date.now(), pid = process.pid) {
  fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
  const arquivo = arquivoDe(pasta); const tmp = `${arquivo}.${pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ pid, em: new Date(agora).toISOString() }), { mode: 0o600 });
  fs.renameSync(tmp, arquivo);
}

function ler(pasta, agora = Date.now(), vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }) {
  let b;
  try { b = JSON.parse(fs.readFileSync(arquivoDe(pasta), 'utf8')); } catch { return { ativo: false, ultimoBatimento: null }; }
  const em = Date.parse(b?.em);
  if (!Number.isFinite(em) || !Number.isInteger(b.pid)) return { ativo: false, ultimoBatimento: null };
  const recente = agora - em >= 0 ? agora - em <= VALIDADE_MS : false;
  return { ativo: recente && vivo(b.pid), ultimoBatimento: new Date(em).toISOString() };
}

module.exports = { escrever, ler, VALIDADE_MS };
