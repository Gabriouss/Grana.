type CompraPesquisavel = { description?: string | null; category?: string | null; color?: string };

/** Mesma busca de Lançamentos: descrição ou categoria, sem distinguir maiúsculas. */
export function casaComBusca(compra: CompraPesquisavel, consulta: string): boolean {
  const termo = consulta.trim().toLowerCase();
  return !termo || (compra.description ?? '').toLowerCase().includes(termo) || (compra.category ?? '').toLowerCase().includes(termo);
}

export function opcoesDeCategoria(compras: ReadonlyArray<CompraPesquisavel>): [string, string][] {
  const opcoes = new Map<string, string>();
  for (const compra of compras) {
    if (compra.category && !opcoes.has(compra.category)) opcoes.set(compra.category, compra.color ?? '');
  }
  return [...opcoes.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

/** Categoria ausente nesta fatura equivale a Todas; a seleção guardada não é apagada. */
export function filtrarCompras<T extends CompraPesquisavel>(compras: ReadonlyArray<T>, consulta: string, categoria: string | null): T[] {
  const efetiva = categoria && compras.some(t => t.category === categoria) ? categoria : null;
  return compras.filter(t => (!efetiva || t.category === efetiva) && casaComBusca(t, consulta));
}
