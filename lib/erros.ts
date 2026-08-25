import { isLikelyNetworkError } from './offline-cache';

/**
 * Traduz falha de rede pra uma mensagem que a pessoa entende, em vez do
 * "TypeError: Failed to fetch" / "Network request failed" que o fetch
 * devolve cru quando o aparelho está offline ou a conexão cai no meio da
 * requisição pro Supabase — o caso mais comum e menos "culpa do usuário"
 * de erro que este app enfrenta, e o que menos faz sentido mostrar cru.
 *
 * A detecção reaproveita `isLikelyNetworkError` (já usada em
 * `lib/offline-cache.ts`) em vez de reimplementar um terceiro critério —
 * `lib/auth-errors.ts` já tinha o seu próprio, um pouco mais estreito. Três
 * heurísticas diferentes pro mesmo tipo de erro classificavam a mesma falha
 * de jeitos diferentes dependendo de qual delas era chamada.
 *
 * Erros que não são de rede passam batidos: a mensagem do Supabase, mesmo
 * técnica, ainda diz mais que trocar por um genérico "algo deu errado" sem
 * ter evidência de que o texto trocado seria melhor.
 */
export function mensagemErro(e: unknown, apoio = 'Tente novamente.'): string {
  if (isLikelyNetworkError(e)) {
    return 'Sem conexão com a internet. Verifique e tente de novo.';
  }
  const bruta = e instanceof Error ? e.message : String(e ?? '');
  return bruta || apoio;
}
