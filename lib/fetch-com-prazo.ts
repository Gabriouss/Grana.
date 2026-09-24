/**
 * Prazo para todo pedido do cliente Supabase (achados T10 e T11 do Sentinel,
 * 23/09/2026).
 *
 * O sintoma: com a sessão aberta havia uns 40 minutos, a pessoa desligou a
 * rede e tocou em salvar. O botão girou mais de quatro minutos e não saiu
 * nunca; com a rede de volta continuou girando, e a faixa "Atualização
 * pendente" não apagava em tela nenhuma. Aberto do zero sem rede, o mesmo
 * salvar falhava em segundos e caía na fila.
 *
 * O mecanismo, reproduzido com o supabase-js real contra um servidor que
 * aceita a conexão e nunca responde: o `fetch` não tinha prazo nenhum. Um
 * pedido que sai por uma conexão já aberta, e que morreu quando a rede caiu,
 * espera para sempre (o cliente HTTP do React Native não põe limite de
 * leitura). Pior: se esse pedido é a RENOVAÇÃO do token, o auth do supabase-js
 * segura a trava da sessão enquanto ela não termina, e TODO pedido seguinte do
 * app espera atrás dela, inclusive depois de a rede voltar. Um cliente novo,
 * no mesmo instante, funcionava. Daí o "só volta ao reabrir o app".
 *
 * Com prazo, o pedido preso vira erro de rede, a trava é solta e o próximo
 * pedido sai por uma conexão nova.
 *
 * O prazo cobre o CORPO, não só os cabeçalhos: o corpo é lido aqui dentro,
 * antes de o prazo ser desarmado. Proteger só a chegada dos cabeçalhos deixava
 * sem proteção justamente o corpo pendurado (regra 9 do AGENTS.md).
 *
 * Quem chama e já tem prazo próprio (um `signal`) continua mandando: o pedido
 * é abortado pelo que vencer primeiro, e o aborto de quem chama continua
 * aparecendo como aborto, não como falta de rede.
 */

/** Pedido comum ao banco e ao auth: resposta sadia chega em bem menos que isso. */
export const PRAZO_PEDIDO_MS = 20_000;
/** Arquivo (foto de perfil) e Edge Function (exclusão de conta) podem demorar mais. */
export const PRAZO_TRANSFERENCIA_MS = 60_000;

export function prazoDoPedido(url: string): number {
  return /\/(storage|functions)\/v1\//.test(url) ? PRAZO_TRANSFERENCIA_MS : PRAZO_PEDIDO_MS;
}

function urlDe(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

/** Status que não podem carregar corpo: recriar a resposta com corpo lança erro. */
const SEM_CORPO = new Set([101, 204, 205, 304]);

export function comPrazo(
  fetchBase: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  prazo: (url: string) => number = prazoDoPedido,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const ms = prazo(urlDe(input));
    const controle = new AbortController();
    const externo = init?.signal ?? undefined;
    const repassar = () => controle.abort((externo as AbortSignal & { reason?: unknown })?.reason);
    if (externo?.aborted) repassar();
    else externo?.addEventListener('abort', repassar);

    let estourou = false;
    const corte = setTimeout(() => {
      estourou = true;
      controle.abort();
    }, ms);

    try {
      const resposta = await fetchBase(input, { ...init, signal: controle.signal });
      /* O corpo pode pendurar depois de cabeçalhos 200. Lido aqui, ele fica
         debaixo do mesmo prazo; o aborto rejeita a leitura. */
      const abortado = new Promise<never>((_, rejeitar) => {
        if (controle.signal.aborted) rejeitar(new Error('abortado'));
        controle.signal.addEventListener('abort', () => rejeitar(new Error('abortado')));
      });
      abortado.catch(() => {});
      const corpo = await Promise.race([resposta.arrayBuffer(), abortado]);
      const vazio = SEM_CORPO.has(resposta.status) || corpo.byteLength === 0;
      return new Response(vazio ? null : corpo, {
        status: resposta.status,
        statusText: resposta.statusText,
        headers: resposta.headers,
      });
    } catch (erro) {
      /* Mensagem com "Network request failed", a mesma do fetch do React
         Native sem rede: é o que `isLikelyNetworkError`, o auth do supabase-js
         e a fila offline já reconhecem como falha TEMPORÁRIA. */
      if (estourou) throw new TypeError(`Network request failed: sem resposta em ${Math.round(ms / 1000)} s`);
      throw erro;
    } finally {
      clearTimeout(corte);
      externo?.removeEventListener('abort', repassar);
    }
  };
}
