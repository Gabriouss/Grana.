'use strict';

const CODIGO = 'legenda-obrigatoria';
const MENSAGEM = 'Falta a legenda para publicar';
// Sem dependência do catálogo: usado também pela fila e pelo próprio DTO.
function temLegenda(peca) {
  // A capa de um Reel usa a legenda do Reel; não exige a própria.
  if (peca?.capaDe) return true;
  return typeof peca?.legenda === 'string' && peca.legenda.trim().length > 0;
}
function bloqueiosAprovacao(peca) {
  return temLegenda(peca) ? [] : [{ codigo: CODIGO, mensagem: MENSAGEM }];
}
function exigirLegenda(peca) {
  if (!temLegenda(peca)) throw Object.assign(new Error(MENSAGEM), { codigo: CODIGO, status: 409 });
}
module.exports = { temLegenda, bloqueiosAprovacao, exigirLegenda, CODIGO, MENSAGEM };
