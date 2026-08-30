export type TipoEventoKiwify =
  | 'approved'
  | 'renewed'
  | 'late'
  | 'canceled'
  | 'refunded'
  | 'chargeback';

export type EventoKiwify = {
  type: TipoEventoKiwify;
  eventId: string | null;
  eventAt: string;
  orderId: string | null;
  subscriptionId: string | null;
  email: string | null;
  plan: string | null;
  accessUntil: string | null;
};

function pegar(obj: unknown, caminhos: string[]): unknown {
  for (const caminho of caminhos) {
    let valor: unknown = obj;
    for (const chave of caminho.split('.')) {
      valor = valor && typeof valor === 'object'
        ? (valor as Record<string, unknown>)[chave]
        : undefined;
      if (valor === undefined) break;
    }
    if (valor !== undefined && valor !== null && valor !== '') return valor;
  }
  return undefined;
}

function texto(body: Record<string, unknown>, caminhos: string[], limite = 255): string | null {
  const valor = pegar(body, caminhos);
  if (valor === undefined) return null;
  const limpo = String(valor).trim();
  return limpo ? limpo.slice(0, limite) : null;
}

function dataIso(valor: string | null, fallback?: string): string | null {
  if (!valor) return fallback ?? null;
  const date = new Date(valor.includes('T') ? valor : valor.replace(' ', 'T') + 'Z');
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback ?? null;
}

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
