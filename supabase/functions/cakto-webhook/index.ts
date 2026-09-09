import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { normalizarEventoCakto, segredoCaktoValido } from '../_shared/cakto.ts';
import { timingSafeEqual } from '../_shared/seguranca.ts';

/* Webhook de assinatura da Cakto.
 *
 * Gêmeo do `kiwify-webhook`: os dois traduzem o payload do provedor para a
 * mesma forma neutra e chamam a MESMA função do banco, com o provedor como
 * parâmetro. Toda a regra de assinatura — ordem de eventos, idempotência,
 * janela de carência — mora lá e não é reimplementada aqui.
 *
 * Duas diferenças da Cakto obrigam cuidados que o gêmeo não precisa ter:
 *
 * SEGREDO NO CORPO. A Cakto manda a chave em `secret`, dentro do JSON, em vez
 * de assinatura HMAC em header. O corpo, portanto, é material sensível: NADA
 * dele pode ir para log, nem em caso de erro. Comparação em tempo constante.
 *
 * SEM REENVIO. A documentação diz que a Cakto trata qualquer resposta como
 * entrega bem-sucedida — não existe retry. Um erro nosso perde o evento para
 * sempre, e um `purchase_approved` perdido é alguém que pagou e ficou sem
 * acesso. Por isso todo caminho de falha grita no log com o que basta para
 * reconciliar à mão (tipo e id do pedido), e nunca em silêncio.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CAKTO_WEBHOOK_SECRET = Deno.env.get('CAKTO_WEBHOOK_SECRET') ?? '';
const MAX_BODY_BYTES = 64 * 1024;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function resposta(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Falha que a Cakto NÃO vai reenviar: precisa ser achável no log depois. */
function perdaIrrecuperavel(motivo: string, detalhe: Record<string, unknown>): void {
  console.error('[cakto-webhook] EVENTO PERDIDO, sem reenvio pelo provedor', { motivo, ...detalhe });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return resposta({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CAKTO_WEBHOOK_SECRET) {
    console.error('[cakto-webhook] configuração obrigatória ausente');
    return resposta({ error: 'not_configured' }, 500);
  }
  if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return resposta({ error: 'unsupported_media_type' }, 415);
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return resposta({ error: 'payload_too_large' }, 413);

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return resposta({ error: 'payload_too_large' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch {
    return resposta({ error: 'invalid_json' }, 400);
  }

  /* Depois do parse porque o segredo vem DENTRO do JSON — não há como conferir
     antes de ler o corpo. O teto de tamanho acima é o que limita a exposição
     de fazer parse em conteúdo ainda não autenticado. */
  if (!segredoCaktoValido(body, CAKTO_WEBHOOK_SECRET, timingSafeEqual)) {
    return resposta({ error: 'unauthorized' }, 401);
  }

  const evento = normalizarEventoCakto(body);
  if (!evento) {
    /* Pode ser evento que não mexe em acesso (pix gerado, abandono) — normal e
       esperado, responde 200 sem processar. */
    return resposta({ received: true, result: 'ignored' }, 200);
  }
  if (!evento.orderId && !evento.subscriptionId) {
    perdaIrrecuperavel('evento sem id de pedido nem de assinatura', { eventType: evento.type });
    return resposta({ error: 'unsupported_event' }, 422);
  }

  const payloadHash = await sha256Hex(rawBody);
  const eventId = (evento.eventId ?? payloadHash).slice(0, 255);
  const { data, error } = await supabase.rpc('processar_evento_assinatura', {
    p_provider: 'cakto',
    p_event_id: eventId,
    p_event_type: evento.type,
    p_payload_hash: payloadHash,
    p_event_at: evento.eventAt,
    p_order_id: evento.orderId,
    p_subscription_id: evento.subscriptionId,
    p_email: evento.email,
    p_plan: evento.plan,
    p_access_until: evento.accessUntil,
  });

  if (error) {
    /* `P0002` é "assinatura ainda não existe". Na Kiwify isso conta com o
       retry do provedor; aqui não há retry, então o evento morre e alguém
       precisa saber — é o caso clássico de cancelamento que chega antes da
       aprovação. */
    perdaIrrecuperavel('falha ao processar', {
      code: error.code,
      eventType: evento.type,
      orderId: evento.orderId,
      subscriptionId: evento.subscriptionId,
    });
    return resposta({ error: 'database_failure' }, 500);
  }

  if (data === 'subscription_not_found') {
    perdaIrrecuperavel('assinatura não encontrada', {
      eventType: evento.type,
      orderId: evento.orderId,
      subscriptionId: evento.subscriptionId,
    });
    return resposta({ error: 'subscription_not_found' }, 409);
  }

  void supabase.rpc('expurgar_eventos_webhook');
  return resposta({ received: true, result: data }, 200);
});
