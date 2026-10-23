'use strict';
// Recibo de conclusão separado da evidência imutável do aceite do autor.
const c = require('./catalogo.cjs');
const ETAPAS = ['aceite', 'ajuste', 'promocao', 'plano'];
const filas = new Map();
function executar(raiz, fn) {
  const chave = require('node:path').resolve(raiz);
  const r = (filas.get(chave) || Promise.resolve()).then(fn);
  const fim = r.catch(() => {});
  filas.set(chave, fim);
  fim.then(() => { if (filas.get(chave) === fim) filas.delete(chave); });
  return r;
}
function buscar(raiz, id, versao) {
  return c.lerJson(c.caminhoPainel(raiz, 'aprovacoes.json'), {}).conclusoes
    ?.find(r => r.versao === versao && (r.id === id || r.destinoId === id)) || null;
}
function nova(id, versao) {
  return { id, versao, destinoId: id, estado: 'incompleta', etapas: Object.fromEntries(ETAPAS.map(k => [k, { estado: 'pendente' }])) };
}
async function salvar(raiz, recibo) {
  recibo.estado = ETAPAS.every(k => ['concluido', 'nao-necessario'].includes(recibo.etapas[k]?.estado)) ? 'concluida' : 'incompleta';
  recibo.atualizadoEm = c.agoraLocalIso();
  await c.serializar(raiz, () => {
    const arq = c.caminhoPainel(raiz, 'aprovacoes.json');
    const db = c.lerJson(arq, { formato: 1, aprovacoes: [], ajustes: [] });
    db.conclusoes = (db.conclusoes || []).filter(r => !(r.id === recibo.id && r.versao === recibo.versao));
    db.conclusoes.push(structuredClone(recibo));
    c.gravarJsonAtomico(arq, db);
  });
  return recibo;
}
module.exports = { buscar, nova, salvar, executar, ETAPAS };
