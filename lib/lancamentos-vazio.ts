/**
 * Texto da lista de Lançamentos quando não há linha para mostrar.
 *
 * `temHistorico` vem de uma consulta de existência independente do mês
 * (`fetchTemLancamento`): a tela só carrega o mês visível, então olhar a lista
 * carregada diria "ainda" para todo mês vazio, mesmo com anos de lançamentos.
 */
export function textoDaListaVazia(filtrando: boolean, temHistorico: boolean): string {
  if (filtrando) return 'Nenhum lançamento encontrado com esse filtro.';
  if (temHistorico) return 'Nenhum lançamento neste mês. Toque no "+" para registrar.';
  return 'Nenhum lançamento ainda. Toque no "+" para registrar o primeiro.';
}
