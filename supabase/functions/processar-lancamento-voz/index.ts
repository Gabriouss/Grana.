// Grana. — transcrição de lançamento por voz (app e widget Android)
//
// Existe por um motivo só: a chave do Whisper não pode morar no APK. O
// aparelho grava o áudio, manda pra cá autenticado, e recebe de volta o TEXTO
// já normalizado — o mesmo texto que o bot do WhatsApp obteria do mesmo áudio,
// porque os dois passam pelo mesmo `_shared/voice-transcription.ts` (mesma
// ordem Groq → OpenAI, mesmo prompt, mesma normalização de número por
// extenso).
//
// A INTERPRETAÇÃO do texto (valor, categoria, forma de pagamento, parcelas,
// boleto) fica no aparelho, em `lib/heuristics.ts` — que é a mesma lógica do
// webhook, vigiada arquivo a arquivo por `__tests__/sync-parser.js` e coberta
// pelos 34.093 casos do corpus. Trazer o parser pra cá também obrigaria o
// widget a ir à rede pra decidir coisas que ele já sabe decidir offline, e
// duplicaria em Deno um código que já é verificado onde está.
//
// Configuração (supabase secrets set):
//   GROQ_API_KEY    — provedor preferido (whisper-large-v3).
//   OPENAI_API_KEY  — opcional, fallback (whisper-1).
//
// Publicar COM verificação de JWT (o padrão — não passe --no-verify-jwt):
//   supabase functions deploy processar-lancamento-voz

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { provedoresPadrao, transcrever } from '../_shared/voice-transcription.ts';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/* 20 segundos de fala em AAC/Opus de voz não passam de algumas centenas de
   KB. O teto existe pra limitar custo e tempo de upload, não pra recusar
   gravação legítima — quem estourar isso mandou outra coisa. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/* Só o que o app e o widget realmente gravam. Allowlist explícita, e não
   "qualquer audio/*": o que sobe daqui vai direto pro provedor de
   transcrição, e formato inesperado é custo gasto pra receber erro. */
const MIMES_ACEITOS = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
]);

/* Rate limit best-effort, na memória do isolate. Não é garantia — o Supabase
   recicla isolates e pode ter mais de um vivo ao mesmo tempo, então dois
   pedidos simultâneos podem cair em contadores diferentes. Serve pro caso que
   importa na prática (um aparelho em loop, um botão preso), sem exigir tabela
   nova; o teto de tamanho acima é o controle de custo que vale de verdade. */
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 12;
const usoRecente = new Map<string, number[]>();

function excedeuRateLimit(userId: string): boolean {
  const agora = Date.now();
  const anteriores = (usoRecente.get(userId) ?? []).filter((t) => agora - t < JANELA_MS);
  anteriores.push(agora);
  usoRecente.set(userId, anteriores);
  return anteriores.length > MAX_POR_JANELA;
}

async function fetchComTimeout(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/* Códigos estáveis: a UI do app e a notificação do widget escolhem a mensagem
   a partir daqui, então mudar um destes textos muda o que a pessoa lê. */
type CodigoErro =
  | 'nao_autenticado'
  | 'metodo_invalido'
  | 'audio_ausente'
  | 'audio_grande'
  | 'formato_invalido'
  | 'muitas_tentativas'
  | 'sem_provedor'
  | 'nao_entendi'
  | 'erro_interno';

function erro(codigo: CodigoErro, status: number) {
  return new Response(JSON.stringify({ status: 'error', code: codigo }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return erro('metodo_invalido', 405);

  try {
    /* A identidade vem SEMPRE do JWT validado pelo Supabase, nunca de um
       campo do corpo: o corpo é escrito pelo aparelho e um aparelho pode
       mentir. `getUser` com o token da sessão é quem decide de quem é o
       áudio. */
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return erro('nao_autenticado', 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (authError || !userId) return erro('nao_autenticado', 401);

    if (excedeuRateLimit(userId)) return erro('muitas_tentativas', 429);

    if (!GROQ_API_KEY && !OPENAI_API_KEY) {
      console.error('[processar-lancamento-voz] nenhuma chave de transcrição configurada.');
      return erro('sem_provedor', 503);
    }

    const form = await req.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File)) return erro('audio_ausente', 400);
    if (audio.size === 0) return erro('audio_ausente', 400);
    if (audio.size > MAX_AUDIO_BYTES) return erro('audio_grande', 413);

    /* O tipo declarado pode vir vazio em alguns clientes; nesse caso o nome do
       arquivo é a única pista, e o provedor aceita pela extensão. */
    const mime = (audio.type || '').split(';')[0].trim().toLowerCase();
    if (mime && !MIMES_ACEITOS.has(mime)) return erro('formato_invalido', 415);

    const bytes = await audio.arrayBuffer();
    const resultado = await transcrever(bytes, {
      mimeType: mime || 'audio/m4a',
      nomeArquivo: audio.name || 'audio.m4a',
      provedores: provedoresPadrao(GROQ_API_KEY, OPENAI_API_KEY),
      fetchComTimeout,
    });

    // Nunca o texto: transcrição é o extrato da pessoa, e log de Edge Function
    // fica retido e legível por quem tem acesso ao painel.
    console.log('[processar-lancamento-voz]', {
      ok: !!resultado,
      provedor: resultado?.provedor ?? null,
      bytes: audio.size,
    });

    if (!resultado) return erro('nao_entendi', 422);

    return new Response(
      JSON.stringify({ status: 'ready', transcript: resultado.texto, provedor: resultado.provedor }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[processar-lancamento-voz] erro:', err);
    return erro('erro_interno', 500);
  }
});
