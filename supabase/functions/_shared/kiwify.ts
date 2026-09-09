import {
  dataIso,
  texto,
  type EventoAssinatura,
  type TipoEventoAssinatura,
} from './normalizar-webhook.ts';

/* `pegar`/`texto`/`dataIso` moraram aqui até a Cakto entrar. Saíram para
   `normalizar-webhook.ts` porque os dois provedores precisam da mesma leitura
   defensiva de payload, e cópia entre webhooks já quebrou este projeto antes. */

export type TipoEventoKiwify = TipoEventoAssinatura;
export type EventoKiwify = EventoAssinatura;

export function normalizarEventoKiwify(body: Record<string, unknown>, agora = new Date()): EventoKiwify | null {
  const trigger = texto(body, [
    'webhook_event_type',
    'event_type',
    'event',
    'type',
    'data.webhook_event_type',
    'data.event',
  ])?.toLowerCase();
  const orderStatus = texto(body, ['order_status', 'data.order_status', 'status'])?.toLowerCase();

  let type: TipoEventoKiwify | null = null;
  if (trigger === 'subscription_renewed') type = 'renewed';
  else if (trigger === 'subscription_late') type = 'late';
  else if (trigger === 'subscription_canceled' || trigger === 'subscription_cancelled') type = 'canceled';
  else if (trigger === 'chargeback' || trigger === 'order_chargeback') type = 'chargeback';
  else if (trigger === 'compra_reembolsada' || trigger === 'order_refunded' || orderStatus === 'refunded') type = 'refunded';
  else if (
    trigger === 'compra_aprovada'
    || trigger === 'order_approved'
    || trigger === 'purchase_approved'
    || orderStatus === 'paid'
  ) type = 'approved';
  if (!type) return null;

  const eventAt = dataIso(texto(body, [
    'event_created_at',
    'event_at',
    'updated_at',
    'approved_date',
    'created_at',
    'data.updated_at',
  ]), agora.toISOString())!;

  return {
    type,
    eventId: texto(body, ['webhook_event_id', 'event_id', 'data.event_id']),
    eventAt,
    orderId: texto(body, ['order_id', 'order_ref', 'data.order_id', 'data.id']),
    subscriptionId: texto(body, [
      'Subscription.subscription_id',
      'subscription.subscription_id',
      'subscription_id',
      'data.Subscription.subscription_id',
      'data.subscription.id',
    ]),
    email: texto(body, [
      'Customer.email',
      'customer.email',
      'data.Customer.email',
      'data.customer.email',
      'data.buyer.email',
    ], 320)?.toLowerCase() ?? null,
    plan: texto(body, [
      'Product.product_name',
      'product.product_name',
      'product.name',
      'data.Product.product_name',
      'data.product.name',
    ], 200),
    accessUntil: dataIso(texto(body, [
      'Subscription.customer_access.access_until',
      'subscription.customer_access.access_until',
      'Subscription.next_payment',
      'subscription.next_payment',
      'data.Subscription.customer_access.access_until',
      'data.subscription.next_payment',
    ])),
  };
}
