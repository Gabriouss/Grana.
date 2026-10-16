import {
  dataIso,
  pegar,
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
    accessUntil: acessoAte(body, type, eventAt),
  };
}

/* Até quando o acesso vale, com rede de segurança para o plano ANUAL.
 *
 * O caminho normal é `next_payment_date`. O problema é o que acontece quando
 * ele não vem: `processar_evento_assinatura` cai num padrão de 92 dias, que
 * foi escolhido quando só existia plano mensal. Numa assinatura anual isso
 * significa receber doze meses e cortar o acesso em três — o cliente pagou e
 * fica sem, sem erro em lugar nenhum.
 *
 * Por isso, na ausência da data, o período é derivado de `recurrence_period`,
 * que a Cakto documenta como o intervalo em DIAS entre cobranças. O teto de
 * 400 dias existe para um valor absurdo do provedor não virar acesso perpétuo;
 * abaixo de 1 não há o que derivar e a decisão volta para o banco.
 *
 * Só vale para eventos que ESTENDEM acesso. Cancelamento e reembolso não
 * ganham data futura por dedução. */
function acessoAte(
  body: Record<string, unknown>,
  type: TipoEventoAssinatura,
  eventAt: string,
): string | null {
  const explicita = dataIso(texto(body, ['data.subscription.next_payment_date']));
  if (explicita) return explicita;
  if (type !== 'approved' && type !== 'renewed') return null;

  const dias = Number(texto(body, ['data.subscription.recurrence_period']));
  if (!Number.isFinite(dias) || dias < 1 || dias > 400) return null;

  const base = new Date(eventAt);
  if (!Number.isFinite(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + Math.round(dias));
  return base.toISOString();
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

/* Linha do livro-razão de cobrança (`cobranca_eventos`), B2 de 15/10/2026.
 *
 * `subscriptions` guarda só o estado atual e `webhook_events` some em 30 dias:
 * sem isto não há como contar receita nem origem de venda por período. Aqui
 * entra o que é dinheiro e origem, e NADA que identifique a pessoa (sem nome,
 * e-mail, telefone, documento ou endereço): quem precisar ligar a venda à
 * conta usa `subscription_id`, que já liga em `subscriptions`.
 *
 * Os nomes de valor e de UTM (`baseAmount`, `discount`, `fees`, `amount`,
 * `utm_*`, `sck`) são os do pedido na API pública da Cakto
 * (docs.cakto.com.br/api-reference/orders/list); o webhook manda o pedido em
 * `data`. Ainda não foram vistos num webhook real: campo ausente vira nulo,
 * nunca erro, porque a Cakto não reenvia. */
export type LinhaCobranca = {
  provider: 'cakto';
  event_id: string;
  event_type: TipoEventoAssinatura;
  event_at: string;
  order_id: string | null;
  parent_order_id: string | null;
  subscription_id: string | null;
  primeira_compra: boolean;
  valor_bruto: number | null;
  desconto: number | null;
  taxas: number | null;
  valor: number | null;
  moeda: string;
  metodo_pagamento: string | null;
  parcelas: number | null;
  oferta_id: string | null;
  produto_id: string | null;
  cupom: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  sck: string | null;
};

/** Valor em reais com 2 casas, ou nulo. Aceita número ou texto "5.00". */
function dinheiro(body: Record<string, unknown>, caminhos: string[]): number | null {
  const bruto = pegar(body, caminhos);
  if (bruto === undefined || typeof bruto === 'boolean' || typeof bruto === 'object') return null;
  const n = Number(String(bruto).trim());
  if (!Number.isFinite(n) || Math.abs(n) >= 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

export function linhaCobrancaCakto(
  body: Record<string, unknown>,
  evento: EventoAssinatura,
  eventId: string,
): LinhaCobranca {
  const parcelas = Number(texto(body, ['data.installments'], 4));
  return {
    provider: 'cakto',
    event_id: eventId.slice(0, 255),
    event_type: evento.type,
    event_at: evento.eventAt,
    order_id: evento.orderId,
    parent_order_id: texto(body, ['data.parent_order'], 100),
    subscription_id: evento.subscriptionId,
    /* Renovação chega como `subscription_renewed`; `purchase_approved` é a
       primeira compra. Hipótese pela documentação, não conferida em venda real. */
    primeira_compra: evento.type === 'approved',
    valor_bruto: dinheiro(body, ['data.baseAmount']),
    desconto: dinheiro(body, ['data.discount']),
    taxas: dinheiro(body, ['data.fees']),
    valor: dinheiro(body, ['data.amount', 'data.subscription.amount']),
    moeda: 'BRL',
    metodo_pagamento: texto(body, ['data.paymentMethod', 'data.subscription.paymentMethod'], 40),
    parcelas: Number.isInteger(parcelas) && parcelas > 0 && parcelas <= 24 ? parcelas : null,
    oferta_id: texto(body, ['data.offer.id'], 100),
    produto_id: texto(body, ['data.product.id'], 100),
    cupom: texto(body, ['data.couponCode'], 100),
    utm_source: texto(body, ['data.utm_source'], 200),
    utm_medium: texto(body, ['data.utm_medium'], 200),
    utm_campaign: texto(body, ['data.utm_campaign'], 200),
    utm_term: texto(body, ['data.utm_term'], 200),
    utm_content: texto(body, ['data.utm_content'], 200),
    sck: texto(body, ['data.sck'], 200),
  };
}
