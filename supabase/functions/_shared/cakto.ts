import {
  dataIso,
  texto,
  type EventoAssinatura,
  type TipoEventoAssinatura,
} from './normalizar-webhook.ts';

/* Tradução do webhook da Cakto para a forma neutra que
 * `processar_evento_assinatura` consome — a mesma que `kiwify.ts` produz.
 *
 * O formato da Cakto é `{ secret, event, data: { ... } }`, com o pedido em
 * `data` e a assinatura aninhada em `data.subscription`. Escrito contra o
 * exemplo literal da documentação oficial de "Pagamento Recorrente".
 *
 * DUAS DIFERENÇAS IMPORTANTES em relação à Kiwify, que moldam este arquivo:
 *
 * 1. A Cakto não manda id de evento. O id é montado aqui como
 *    `<evento>:<id do pedido>`, que é estável e único por ocorrência: cada
 *    cobrança de uma assinatura gera um `data.id` próprio, e `data.parent_order`
 *    é quem aponta para o pedido original. Sem um id estável, a deduplicação
 *    cairia no hash do payload, que muda a cada campo novo que o provedor
 *    resolva incluir.
 *
 * 2. A Cakto NÃO REENVIA evento. A documentação diz que ela trata qualquer
 *    resposta como entrega bem-sucedida. Então tudo que dá para decidir aqui,
 *    sem depender de uma segunda chance, é decidido aqui.
 */

/** Eventos que a Cakto dispara e que NÃO mudam acesso — ignorados de propósito. */
const SEM_EFEITO_NO_ACESSO = new Set([
  'pix_gerado',
  'boleto_gerado',
  'picpay_gerado',
  'checkout_abandonment',
]);

export function normalizarEventoCakto(
  body: Record<string, unknown>,
  agora = new Date(),
): EventoAssinatura | null {
  const evento = texto(body, ['event', 'data.event'])?.toLowerCase();
  if (!evento || SEM_EFEITO_NO_ACESSO.has(evento)) return null;

  const subscriptionId = texto(body, ['data.subscription.id', 'subscription.id']);

  let type: TipoEventoAssinatura | null = null;
  if (evento === 'purchase_approved') type = 'approved';
  else if (evento === 'subscription_renewed') type = 'renewed';
  else if (evento === 'subscription_canceled') type = 'canceled';
  else if (evento === 'refund') type = 'refunded';
  else if (evento === 'chargeback') type = 'chargeback';
  else if (evento === 'purchase_refused') {
    /* Recusa só vira 'past_due' quando é uma RENOVAÇÃO que falhou. Recusa de
       primeira compra não tem assinatura para marcar como atrasada, e tratá-la
       como atraso criaria uma assinatura fantasma para quem nunca pagou. */
    type = subscriptionId ? 'late' : null;
  }
  if (!type) return null;

  const orderId = texto(body, ['data.id', 'data.refId']);

  /* A data DO EVENTO, não a do pagamento — e cada tipo guarda a dele num campo
     próprio. Isto não é preciosismo: `processar_evento_assinatura` compara
     `p_event_at` com o último evento da assinatura e DESCARTA o que for mais
     antigo, como desatualizado. Num reembolso o `paidAt` continua sendo a data
     do pagamento original, então ler `paidAt` primeiro faria todo reembolso e
     todo chargeback chegarem com data velha e serem silenciosamente
     ignorados — o dinheiro voltava e o acesso continuava de pé.
     Descoberto conferindo o modelo do painel da Cakto antes da primeira venda. */
  const CAMINHOS_DATA: Record<TipoEventoAssinatura, string[]> = {
    approved: ['data.paidAt', 'data.createdAt'],
    renewed: ['data.paidAt', 'data.createdAt'],
    refunded: ['data.refundedAt', 'data.createdAt', 'data.paidAt'],
    chargeback: ['data.chargedbackAt', 'data.createdAt', 'data.paidAt'],
    canceled: ['data.canceledAt', 'data.subscription.canceledAt', 'data.createdAt'],
    late: ['data.createdAt', 'data.due_date'],
  };
  /* O recuo para agora existe porque `p_event_at` é obrigatório do lado do
     banco: um evento com data aproximada ainda é melhor que um evento perdido,
     e a Cakto não reenvia nada. */
  const eventAt = dataIso(texto(body, CAMINHOS_DATA[type]), agora.toISOString())!;

  return {
    type,
    eventId: orderId ? `${evento}:${orderId}` : null,
    eventAt,
    orderId,
    subscriptionId,
    email: texto(body, ['data.customer.email'], 320)?.toLowerCase() ?? null,
    plan: texto(body, ['data.product.name', 'data.offer.name'], 200),
    /* Até quando o acesso vale. Numa renovação bem-sucedida é a próxima
       cobrança; no cancelamento a Cakto zera este campo, e aí quem decide o
       fim do acesso é a função do banco. */
    accessUntil: dataIso(texto(body, ['data.subscription.next_payment_date'])),
  };
}

/* Validação de autenticidade.
 *
 * A Cakto manda o segredo DENTRO do corpo, em `secret`. É mais fraco que a
 * assinatura HMAC da Kiwify, e contraria a regra que o próprio
 * `kiwify-webhook` documenta: segredo não deve viajar no JSON, porque JSON
 * acaba em log, proxy e ferramenta de observabilidade. Quem capturar UM
 * payload consegue forjar eventos.
 *
 * Não dá para consertar do nosso lado — é o protocolo deles. O que dá para
 * fazer, e está feito: comparar em tempo constante, nunca registrar o corpo
 * em log, e manter a deduplicação por id de evento, que limita o estrago de
 * um replay do mesmo payload.
 */
export function segredoCaktoValido(
  body: Record<string, unknown>,
  esperado: string,
  comparar: (a: string, b: string) => boolean,
): boolean {
  if (!esperado) return false;
  const recebido = texto(body, ['secret'], 500);
  return !!recebido && comparar(recebido, esperado);
}
