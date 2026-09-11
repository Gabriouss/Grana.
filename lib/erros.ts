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
/* Teto de tamanho da mensagem que pode chegar à tela.
 *
 * Em 11/09/2026 a tela Início apareceu num aparelho despejando a LISTA
 * INTEIRA de lançamentos — ids, user_id, valores e datas — dentro da faixa
 * de erro, cobrindo o app. A causa foi uma biblioteca que devolveu o payload
 * dentro de `error.message`, e o nosso código repassou cru.
 *
 * Repassar mensagem técnica CURTA continua valendo: "duplicate key value
 * violates unique constraint" diz mais que um genérico. O que não pode é a
 * tela virar terminal. Acima deste teto, ou com cara de dado serializado, a
 * pessoa lê a frase de apoio e o detalhe vai para o log. */
const TETO_MENSAGEM = 180;

function pareceDespejoDeDados(texto: string): boolean {
  if (texto.length > TETO_MENSAGEM) return true;
  // JSON ou array de objetos: não é frase para alguém ler.
  return /[{}\[\]]/.test(texto) && /"[a-z_]+"\s*:/i.test(texto);
}

export function mensagemErro(e: unknown, apoio = 'Tente novamente.'): string {
  if (isLikelyNetworkError(e)) {
    return 'Sem conexão com a internet. Verifique e tente de novo.';
  }
  const bruta = e instanceof Error ? e.message : String(e ?? '');
  if (pareceDespejoDeDados(bruta)) {
    /* Recibo no log, nunca na tela: sem isto a falha vira silêncio, que a
       regra 9 do AGENTS.md trata como o pior desfecho. Truncado porque o
       objetivo é identificar a origem, não repetir o payload inteiro. */
    console.error('[erro] mensagem longa demais para a tela', {
      tamanho: bruta.length,
      inicio: bruta.slice(0, 300),
    });
    return apoio;
  }
  return bruta || apoio;
}
