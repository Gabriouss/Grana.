import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EAS_WEBHOOK_SECRET = Deno.env.get('EAS_WEBHOOK_SECRET') ?? '';
const MAX_BODY_BYTES = 64 * 1024;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function hmacSha1Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!EAS_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[eas-build-webhook] configuração obrigatória ausente');
    return new Response('Not configured', { status: 500 });
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return new Response('Payload too large', { status: 413 });
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  const signature = req.headers.get('expo-signature') ?? '';
  const expected = `sha1=${await hmacSha1Hex(EAS_WEBHOOK_SECRET, rawBody)}`;
  if (!timingSafeEqual(signature, expected)) return new Response('Invalid signature', { status: 401 });

  let payload: {
    id?: string;
    status?: string;
    platform?: string;
    expirationDate?: string;
    artifacts?: { buildUrl?: string };
    metadata?: { appVersion?: string; buildProfile?: string };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const version = payload.metadata?.appVersion;
  const apkUrl = payload.artifacts?.buildUrl;
  const relevante =
    payload.status === 'finished'
    && payload.platform === 'android'
    && payload.metadata?.buildProfile !== 'development'
    && !!version
    && !!apkUrl
    && /^https:\/\/expo\.dev\//.test(apkUrl);
  if (!relevante) return new Response('ignored', { status: 200 });

  const payloadHash = await sha256Hex(rawBody);
  const eventId = (payload.id ?? payloadHash).slice(0, 255);
  const { data: claim, error: claimError } = await supabase.rpc('reivindicar_webhook_evento', {
    p_provider: 'eas',
    p_event_id: eventId,
    p_event_type: 'build_finished',
    p_payload_hash: payloadHash,
  });
  if (claimError) return new Response('Inbox error', { status: 500 });
  if (claim === 'done') return new Response('ok', { status: 200 });
  if (claim === 'busy') return new Response('busy', { status: 503 });

  const { data: result, error } = await supabase.rpc('publicar_app_release', {
    p_version: version,
    p_apk_url: apkUrl,
    p_expires_at: payload.expirationDate ?? null,
  });
  if (error) {
    await supabase.rpc('falhar_webhook_evento', {
      p_provider: 'eas', p_event_id: eventId, p_error_code: error.code ?? 'db_error',
    });
    console.error('[eas-build-webhook] falha transacional', { code: error.code });
    return new Response('db error', { status: 500 });
  }

  await supabase.rpc('finalizar_webhook_evento', { p_provider: 'eas', p_event_id: eventId });
  return new Response(result === 'older' ? 'older version ignored' : 'ok', { status: 200 });
});
