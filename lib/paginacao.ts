/**
 * Paginação das consultas ao Supabase.
 *
 * Mora fora de `lib/data.ts` por dois motivos: a regra é independente do
 * cliente do banco, e assim ela pode ser testada em Node puro, sem subir o
 * cliente Supabase nem o React Native junto (ver `__tests__/corpus-paginacao.ts`).
 */

/**
 * Teto de linhas por requisição do PostgREST deste projeto.
 *
 * Não é escolha nossa: é o `max_rows` configurado no projeto, confirmado em
 * `GET /v1/projects/{ref}/postgrest`. Uma consulta sem `range` que ultrapasse
 * esse teto NÃO dá erro; ela devolve as primeiras 1000 linhas e cala.
 */
export const TAMANHO_DA_PAGINA = 1000;

export type RespostaDePagina<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Traz TODAS as linhas de uma consulta, em páginas.
 *
 * Por que existe: o app somava saldo percorrendo o histórico inteiro baixado
 * pelo cliente. Com o corte silencioso em 1000 linhas, e a ordenação por data
 * decrescente, sobrava só o histórico recente, e o saldo passava a ser
 * calculado sobre um recorte. O resultado não seria lentidão, seria um número
 * errado exibido com toda a confiança.
 *
 * A ordenação de quem chama precisa ser TOTAL para a paginação ser correta.
 * Duas linhas empatadas em todos os critérios teriam ordem indefinida entre
 * uma página e a seguinte, o que duplicaria uma e sumiria com outra; por isso
 * as consultas acrescentam `id` como último desempate.
 */
export async function buscarTodasAsPaginas<T>(
  consulta: (de: number, ate: number) => PromiseLike<RespostaDePagina<T>>
): Promise<T[]> {
  const todas: T[] = [];
  for (let pagina = 0; ; pagina += 1) {
    const de = pagina * TAMANHO_DA_PAGINA;
    const { data, error } = await consulta(de, de + TAMANHO_DA_PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    todas.push(...lote);
    /* Página incompleta significa fim. Quando o total é múltiplo exato do
       tamanho da página, a última volta vem vazia: é uma requisição a mais,
       e é o preço de não perder linha. */
    if (lote.length < TAMANHO_DA_PAGINA) return todas;
  }
}
