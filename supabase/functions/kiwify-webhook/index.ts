import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { normalizarEventoKiwify } from '../_shared/kiwify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KIWIFY_WEBHOOK_TOKEN = Deno.env.get('KIWIFY_WEBHOOK_TOKEN') ?? '';
const MAX_BODY_BYTES = 64 * 1024;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function tokenValido(req: Request, url: URL, body: Record<string, unknown>): boolean {
  if (!KIWIFY_WEBHOOK_TOKEN) return false;
  const candidatos = [
    req.headers.get('x-kiwify-token'),
    typeof body.webhook_token === 'string' ? body.webhook_token : null,
    typeof body.token === 'string' ? body.token : null,
    typeof body.secret === 'string' ? body.secret : null,
    // Compatibilidade de transição com o endpoint já cadastrado. O segredo
    // nunca é persistido nem incluído em logs.
    url.searchParams.get('token'),
  ];
  return candidatos.some((valor) => !!valor && timingSafeEqual(valor, KIWIFY_WEBHOOK_TOKEN));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function resposta(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return resposta({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !KIWIFY_WEBHOOK_TOKEN) {
    console.error('[kiwify-webhook] configuração obrigatória ausente');
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

  const url = new URL(req.url);
  if (!tokenValido(req, url, body)) return resposta({ error: 'unauthorized' }, 401);

  const evento = normalizarEventoKiwify(body);
  if (!evento || (!evento.orderId && !evento.subscriptionId)) {
    // Não confirma um contrato desconhecido: a Kiwify fará retry e o alerta
    // operacional fica visível sem reter o payload pessoal.
    return resposta({ error: 'unsupported_event' }, 422);
  }

  const payloadHash = await sha256Hex(rawBody);
  const eventId = (evento.eventId ?? payloadHash).slice(0, 255);
  const { data, error } = await supabase.rpc('processar_evento_kiwify', {
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
    console.error('[kiwify-webhook] falha transacional', {
      code: error.code,
      eventType: evento.type,
    });
    return resposta({ error: 'database_failure' }, 500);
  }

  if (data === 'subscription_not_found') {
    return resposta({ error: 'subscription_not_found' }, 409);
  }

  // Retenção é aplicada oportunisticamente e não interfere na confirmação do
  // evento já processado.
  void supabase.rpc('expurgar_eventos_webhook');
  return resposta({ received: true, result: data }, 200);
});
