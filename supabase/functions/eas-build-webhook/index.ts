// Grana. — recebe o webhook de build da EAS e publica a versão nova sozinho.
//
// Isto é o que elimina o passo manual de "depois de cada build, atualizar a
// linha app_release à mão": a própria Expo chama esta função sempre que um
// build termina (sucesso, erro ou cancelamento), e aqui a gente decide o que
// fazer com isso.
//
// Configuração (uma vez só, por projeto):
//
//   1. Gere um segredo aleatório (qualquer string com 16+ caracteres) e
//      configure em dois lugares com o MESMO valor:
//
//        supabase secrets set EAS_WEBHOOK_SECRET="<segredo>"
//
//        eas webhook:create --event BUILD \
//          --url https://<seu-projeto-id>.supabase.co/functions/v1/eas-build-webhook \
//          --secret "<segredo>"
//
//   2. Publique esta função:
//
//        supabase functions deploy eas-build-webhook --no-verify-jwt
//
// Depois disso, publicar uma versão nova do app volta a ser só:
//   1. Suba a versão em app.json ("version").
//   2. Rode `eas build --profile preview --platform android`.
// Quando o build terminar, esta função atualiza `app_release` sozinha — quem
// já tem o app instalado passa a ver o aviso de atualização automaticamente,
// sem precisar reenviar o APK manualmente pra ninguém.
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontos no ambiente da
// função — não precisam ser configurados à mão.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EAS_WEBHOOK_SECRET = Deno.env.get('EAS_WEBHOOK_SECRET') ?? '';

// service_role: só assim a função escreve em app_release, que não tem
// política de insert/update para ninguém além dela (ver supabase/schema.sql).
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** Compara "1.2.3" com "1.10.0" numericamente (cópia mínima de lib/atualizacao.ts — Deno não importa do app Expo). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function hmacSha1Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* Comparação em tempo constante — sem isso, um `!==` normal vaza (por
   timing) quantos caracteres do hash já acertaram, o que é exatamente o tipo
   de brecha que um endpoint público e não autenticado não pode ter. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (!EAS_WEBHOOK_SECRET) {
    console.error('[eas-build-webhook] EAS_WEBHOOK_SECRET não configurado — recusando tudo.');
    return new Response('Not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get('expo-signature') ?? '';
  const expected = `sha1=${await hmacSha1Hex(EAS_WEBHOOK_SECRET, rawBody)}`;

  if (!timingSafeEqual(signatureHeader, expected)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: {
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

  const status = payload.status;
  const platform = payload.platform;
  const profile = payload.metadata?.buildProfile;
  const version = payload.metadata?.appVersion;
  const apkUrl = payload.artifacts?.buildUrl;
  const expiresAt = payload.expirationDate ?? null;

  /* O app só é distribuído como APK Android fora da Play Store (ver
     lib/atualizacao.ts) — builds de iOS, "development" (client de dev, não
     pra usuário final) ou sem sucesso não devem virar um anúncio de
     atualização pra ninguém. */
  const relevante =
    status === 'finished' &&
    platform === 'android' &&
    profile !== 'development' &&
    !!version &&
    !!apkUrl &&
    /^https:\/\/expo\.dev\//.test(apkUrl);

  if (!relevante) {
    return new Response('ignored', { status: 200 });
  }

  const { data: atual } = await supabase.from('app_release').select('version').eq('id', 1).maybeSingle();
  if (atual && compareVersions(version!, atual.version) <= 0) {
    // Builds em paralelo podem terminar fora de ordem — nunca regredir a versão anunciada.
    return new Response('older version ignored', { status: 200 });
  }

  const { error } = await supabase
    .from('app_release')
    .update({ version, apk_url: apkUrl, apk_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    console.error('[eas-build-webhook] erro ao atualizar app_release:', error);
    return new Response('db error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
