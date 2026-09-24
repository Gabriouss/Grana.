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
 * O prazo cobre o CORPO, não só os cabeçalhos: a leitura do corpo corre contra
 * o mesmo prazo, que só é desarmado quando ela termina. Proteger só a chegada
 * dos cabeçalhos deixava sem proteção justamente o corpo pendurado (regra 9 do
 * AGENTS.md).
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

/* Os métodos que leem o corpo. Embrulhados na própria resposta, e NÃO lidos
   aqui para recriar outra: até o T20 (24/09/2026) este módulo lia
   `arrayBuffer()` e devolvia `new Response(corpo)`. No React Native o
   `Response` é o polyfill `whatwg-fetch`, que decodifica um ArrayBuffer byte a
   byte com `String.fromCharCode`, isto é, como Latin-1: todo texto do banco
   com acento chegava à tela como "AlimentaÃ§Ã£o". Deixar a resposta original
   intacta mantém a decodificação do próprio fetch (UTF-8) e o corpo binário
   como binário. */
const LEITURAS_DO_CORPO = ['text', 'json', 'arrayBuffer', 'blob', 'formData'] as const;

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
    const desarmar = () => {
      clearTimeout(corte);
      externo?.removeEventListener('abort', repassar);
    };
    /* Mensagem com "Network request failed", a mesma do fetch do React Native
       sem rede: é o que `isLikelyNetworkError`, o auth do supabase-js e a fila
       offline já reconhecem como falha TEMPORÁRIA. */
    const traduzir = (erro: unknown) =>
      estourou ? new TypeError(`Network request failed: sem resposta em ${Math.round(ms / 1000)} s`) : erro;

    let resposta: Response;
    try {
      resposta = await fetchBase(input, { ...init, signal: controle.signal });
    } catch (erro) {
      desarmar();
      throw traduzir(erro);
    }

    /* O corpo pode pendurar depois de cabeçalhos 200: a leitura corre contra
       o mesmo prazo, e o prazo só é desarmado quando ela termina. Corpo que
       ninguém lê deixa o prazo vencer à toa, e abortar um pedido já
       respondido não faz nada. */
    const abortado = new Promise<never>((_, rejeitar) => {
      if (controle.signal.aborted) rejeitar(new Error('abortado'));
      controle.signal.addEventListener('abort', () => rejeitar(new Error('abortado')));
    });
    abortado.catch(() => {});
    for (const metodo of LEITURAS_DO_CORPO) {
      const original = (resposta as unknown as Record<string, unknown>)[metodo];
      if (typeof original !== 'function') continue;
      Object.defineProperty(resposta, metodo, {
        configurable: true,
        value: () =>
          Promise.race([(original as () => Promise<unknown>).call(resposta), abortado])
            .catch((erro) => { throw traduzir(erro); })
            .finally(desarmar),
      });
    }
    return resposta;
  };
}
