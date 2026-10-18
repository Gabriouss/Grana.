// O texto da versão publicada é distinto da copy editorial de referência.
export function faltaLegenda(peca) {
  return typeof peca?.legenda !== 'string' || !peca.legenda.trim() ||
    !!peca.bloqueiosAprovacao?.some((b) => b.codigo === 'legenda-obrigatoria');
}
export function localLegenda(peca) {
  return peca?.fonteLegenda
    ? `A legenda é escrita no arquivo ${peca.fonteLegenda}, na seção desta peça.`
    : 'A legenda é escrita no COPYS-FINAIS.md da semana, na seção desta peça. Solicite o ajuste pelo fluxo existente.';
}
