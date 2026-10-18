'use strict';
// Estado privado do agendamento real no PC (fora do repositório público).
// Guarda só referências opacas: previaId → snapshotId (para servir mídia da prévia)
// e a intenção de cada confirmação (achado C3 do Watchtower, 17/10/2026): a chave de
// idempotência é gravada ANTES da chamada remota e reaproveitada depois de prazo
// esgotado ou reinício, para nunca nascer uma chave nova para a mesma prévia.
// Nenhum token, URL privada, legenda ou byte de mídia passa por aqui.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ErroMarketing } = require('./catalogo.cjs');

const FORMATO = 1;
const RETER_MS = 30 * 24 * 3600 * 1000;

function criarEstado({ pasta = process.env.GRANA_ADMIN_PASTA_CONTA || path.join(process.env.APPDATA || os.homedir(), 'grana-admin'),
  agora = () => Date.now() } = {}) {
  const arquivo = path.join(pasta, 'publicacoes-reais.json');
  let fila = Promise.resolve();
  const ler = () => {
    let db;
    try { db = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) {
      if (e.code === 'ENOENT') return { formato: FORMATO, previas: {}, intencoes: {} };
      throw new ErroMarketing('estado-local-ilegivel', 'Estado local das publicações ilegível. Preserve o arquivo e confira antes de continuar.', 503);
    }
    if (db?.formato !== FORMATO || typeof db.previas !== 'object' || typeof db.intencoes !== 'object') {
      throw new ErroMarketing('estado-local-ilegivel', 'Estado local das publicações com formato desconhecido.', 503);
    }
    return db;
  };
  const gravar = db => {
    fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
    const corte = agora() - RETER_MS;
    for (const grupo of [db.previas, db.intencoes]) {
      for (const [k, v] of Object.entries(grupo)) if (Date.parse(v.criadoEm) < corte) delete grupo[k];
    }
    const tmp = `${arquivo}.${process.pid}.${agora()}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeSync(fd, JSON.stringify(db, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, arquivo);
  };
  // Uma transação por vez no processo: dois cliques não gravam por cima um do outro.
  const transacao = fn => {
    const r = fila.then(() => { const db = ler(); const v = fn(db); gravar(db); return v; });
    fila = r.catch(() => {});
    return r;
  };
  return {
    registrarPrevia: ({ previaId, snapshotId, midias, capa, expiraEm }) => transacao(db => {
      db.previas[previaId] = { snapshotId, midias, capa: !!capa, expiraEm, criadoEm: new Date(agora()).toISOString() };
    }),
    previa(previaId) {
      const p = ler().previas[previaId];
      if (!p) throw new ErroMarketing('previa-inexistente', 'Prévia não encontrada neste painel. Gere a prévia de novo.', 404);
      return p;
    },
    // Primeira confirmação de uma prévia grava a chave. As seguintes (mesmo previaId+hash)
    // recebem a chave gravada, ainda que o browser tenha mandado outra.
    reservarConfirmacao: ({ previaId, previaHash, revisaoEsperada, idempotencia }) => transacao(db => {
      const chave = `${previaId}:${previaHash}`;
      const atual = db.intencoes[chave];
      if (atual) return { idempotencia: atual.idempotencia, repetida: true, revisaoEsperada: atual.revisaoEsperada };
      db.intencoes[chave] = { previaId, previaHash, revisaoEsperada, idempotencia, estado: 'enviada', criadoEm: new Date(agora()).toISOString() };
      return { idempotencia, repetida: false, revisaoEsperada };
    }),
    concluirConfirmacao: ({ previaId, previaHash, loteId }) => transacao(db => {
      const i = db.intencoes[`${previaId}:${previaHash}`];
      if (i) Object.assign(i, { estado: 'confirmada', loteId, confirmadaEm: new Date(agora()).toISOString() });
    }),
    arquivo,
  };
}

module.exports = { criarEstado };
