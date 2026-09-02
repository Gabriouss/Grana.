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

/* ── Guarda ortográfica das notas ──────────────────────────────────────────
 *
 * CÓPIA de `lib/notas-release.ts`. Esta função roda em Deno e não importa do
 * app, então o código vive duas vezes — `__tests__/sync-parser.js` falha se
 * as duas divergirem. Toda a explicação de por que a guarda existe (e por que
 * ela reprova em vez de tentar consertar acento sozinha) está no original.
 *
 * Aqui é a rede de segurança, não a checagem principal: quem escreve a nota
 * roda `npm run notas:check` antes do build. Este bloco existe porque isso
 * depende de alguém lembrar, e o pop-up abre pra todo mundo que atualiza. */

type ProblemaNota = {
  tipo: 'acento' | 'commit-tecnico' | 'vazia';
  trecho: string;
  sugestao: string | null;
  explicacao: string;
};

const ACENTUADAS_OBRIGATORIAS: Record<string, string> = {
  apos: 'após', ate: 'até', ja: 'já', alem: 'além', tambem: 'também',
  voce: 'você', mes: 'mês', atras: 'atrás', tras: 'trás', sera: 'será',
  historico: 'histórico', grafico: 'gráfico', credito: 'crédito',
  debito: 'débito', codigo: 'código', inicio: 'início', ultimo: 'último',
  unico: 'único', proximo: 'próximo', numero: 'número', rapido: 'rápido',
  automatico: 'automático', invalido: 'inválido', area: 'área',
  saude: 'saúde', pagina: 'página', media: 'média', minimo: 'mínimo',
  maximo: 'máximo', otimo: 'ótimo', proprio: 'próprio', memoria: 'memória',
};

const REGRAS_DE_SUFIXO: { fim: string; minimo: number; troca: [string, string] }[] = [
  { fim: 'ao', minimo: 3, troca: ['ao', 'ão'] },
  { fim: 'oes', minimo: 4, troca: ['oes', 'ões'] },
  { fim: 'aos', minimo: 4, troca: ['aos', 'ãos'] },
  { fim: 'encia', minimo: 6, troca: ['encia', 'ência'] },
  { fim: 'encias', minimo: 7, troca: ['encias', 'ências'] },
  { fim: 'ancia', minimo: 6, troca: ['ancia', 'ância'] },
  { fim: 'ancias', minimo: 7, troca: ['ancias', 'âncias'] },
  { fim: 'ario', minimo: 5, troca: ['ario', 'ário'] },
  { fim: 'arios', minimo: 6, troca: ['arios', 'ários'] },
  { fim: 'orio', minimo: 5, troca: ['orio', 'ório'] },
  { fim: 'orios', minimo: 6, troca: ['orios', 'órios'] },
  { fim: 'avel', minimo: 5, troca: ['avel', 'ável'] },
  { fim: 'aveis', minimo: 6, troca: ['aveis', 'áveis'] },
  { fim: 'ivel', minimo: 5, troca: ['ivel', 'ível'] },
  { fim: 'iveis', minimo: 6, troca: ['iveis', 'íveis'] },
  { fim: 'ovel', minimo: 5, troca: ['ovel', 'óvel'] },
  { fim: 'oveis', minimo: 6, troca: ['oveis', 'óveis'] },
];

const PREFIXO_COMMIT = /^\s*(fix|feat|chore|docs|refactor|test|build|ci|perf|style|merge|revert)(\([^)]*\))?!?:/i;

function palavrasDe(texto: string): string[] {
  return texto.split(/[^\p{L}]+/u).filter(Boolean);
}

function validarNotaRelease(texto: string): ProblemaNota[] {
  const problemas: ProblemaNota[] = [];
  if (!texto || !texto.trim()) {
    return [{ tipo: 'vazia', trecho: '', sugestao: null, explicacao: 'A nota está vazia.' }];
  }

  if (PREFIXO_COMMIT.test(texto)) {
    problemas.push({
      tipo: 'commit-tecnico',
      trecho: texto.trim().split('\n')[0],
      sugestao: null,
      explicacao:
        'A nota começa com prefixo de commit, então o build rodou sem --message e o EAS copiou a mensagem do commit. Escreva a nota pensando em quem usa o app.',
    });
  }

  const vistas = new Set<string>();
  for (const palavra of palavrasDe(texto)) {
    const minuscula = palavra.toLowerCase();
    if (vistas.has(minuscula)) continue;

    let sugestao = ACENTUADAS_OBRIGATORIAS[minuscula] ?? null;

    if (!sugestao && minuscula.endsWith('s')) {
      const singular = ACENTUADAS_OBRIGATORIAS[minuscula.slice(0, -1)];
      if (singular) sugestao = singular + 's';
    }

    if (!sugestao) {
      for (const regra of REGRAS_DE_SUFIXO) {
        if (minuscula.length >= regra.minimo && minuscula.endsWith(regra.fim)) {
          sugestao = minuscula.slice(0, -regra.troca[0].length) + regra.troca[1];
          break;
        }
      }
    }

    if (sugestao && sugestao !== minuscula) {
      vistas.add(minuscula);
      problemas.push({
        tipo: 'acento',
        trecho: palavra,
        sugestao,
        explicacao: 'Falta acento: "' + palavra + '" deveria ser "' + sugestao + '".',
      });
    }
  }

  return problemas;
}

function notaEhPublicavel(texto: string): boolean {
  return validarNotaRelease(texto).length === 0;
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
    metadata?: { appVersion?: string; buildProfile?: string; message?: string };
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

  /* Mensagem do build vira o texto do pop-up de novidades
     (lib/atualizacao.ts) — copy de produto, lida por todo mundo que atualiza.
     Sem `--message` na hora do `eas build`, o EAS preenche sozinho com a
     mensagem do COMMIT, e os commits deste repositório são escritos sem
     acento por convenção. Foi assim que a 1.4.1 publicou "apos" no pop-up.

     Por isso a nota passa pela guarda antes de ser publicada. Reprovada, a
     versão é publicada MESMO ASSIM, só que sem notas: o aviso de atualização
     (o que faz quem já tem o app instalado descobrir que saiu versão nova)
     não pode depender de ortografia — perder o pop-up de novidades é um
     arranhão, perder o aviso de versão é a build inteira passar despercebida,
     que é exatamente o que a regra 5 do AGENTS.md manda evitar.

     A recusa é barulhenta de propósito: vai pro log da função e volta no
     corpo da resposta, que aparece na tela de webhooks do EAS. */
  const bruta = payload.metadata?.message?.trim().slice(0, 2000) || '';
  const problemas = bruta ? validarNotaRelease(bruta) : [];
  const notasReprovadas = !bruta || problemas.length > 0;
  if (notasReprovadas && bruta) {
    console.error('[eas-build-webhook] notas reprovadas pela guarda ortográfica', {
      version,
      problemas: problemas.map((p) => p.tipo + ':' + p.trecho + (p.sugestao ? '->' + p.sugestao : '')),
    });
  }
  const notes = notasReprovadas ? null : bruta;

  const { data: result, error } = await supabase.rpc('publicar_app_release', {
    p_version: version,
    p_apk_url: apkUrl,
    p_expires_at: payload.expirationDate ?? null,
    p_notes: notes,
  });
  if (error) {
    await supabase.rpc('falhar_webhook_evento', {
      p_provider: 'eas', p_event_id: eventId, p_error_code: error.code ?? 'db_error',
    });
    console.error('[eas-build-webhook] falha transacional', { code: error.code });
    return new Response('db error', { status: 500 });
  }

  await supabase.rpc('finalizar_webhook_evento', { p_provider: 'eas', p_event_id: eventId });
  if (result === 'older') return new Response('older version ignored', { status: 200 });
  return new Response(
    notasReprovadas ? 'ok (notas reprovadas: ' + problemas.map((p) => p.trecho || p.tipo).join(', ') + ')' : 'ok',
    { status: 200 }
  );
});
