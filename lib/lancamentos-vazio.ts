/**
 * Texto da lista de Lançamentos quando não há linha para mostrar.
 *
 * `temHistorico` vem de uma consulta de existência independente do mês
 * (`fetchTemLancamento`): a tela só carrega o mês visível, então olhar a lista
 * carregada diria "ainda" para todo mês vazio, mesmo com anos de lançamentos.
 *
 * O `\u00a0` antes da última palavra evita viúva (regra 29; achado 51-B de
 * 21/11/2026: "registrar." ficava sozinha em fonte 1,0).
 */
export function textoDaListaVazia(filtrando: boolean, temHistorico: boolean): string {
  if (filtrando) return 'Nenhum lançamento encontrado com esse\u00a0filtro.';
  if (temHistorico) return 'Nenhum lançamento neste mês. Toque no "+" para\u00a0registrar.';
  return 'Nenhum lançamento ainda. Toque no "+" para registrar o\u00a0primeiro.';
}
