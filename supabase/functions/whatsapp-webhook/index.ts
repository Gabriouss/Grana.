// Grana. — webhook do WhatsApp (Meta Cloud API)
//
// Roda como Supabase Edge Function (Deno), fora do bundle do app — por isso
// não importa nada de lib/ do projeto Expo: as heurísticas de categoria/valor
// abaixo são uma cópia mínima de lib/heuristics.ts, mantidas em sincronia à
// mão. Duplicar aqui é mais simples do que criar um pacote compartilhado só
// para esta função.
//
// Configuração necessária (supabase secrets set, uma vez por projeto):
//   WHATSAPP_VERIFY_TOKEN     — string arbitrária escolhida por você, usada
//                                só no handshake de verificação do webhook.
//   WHATSAPP_ACCESS_TOKEN     — token permanente do app da Meta (System User).
//   WHATSAPP_PHONE_NUMBER_ID  — id do número de telefone no Meta Cloud API.
//   OPENAI_API_KEY            — chave da OpenAI, usada só para transcrever
//                                áudio (Whisper) recebido por WhatsApp.
//   SUPABASE_SERVICE_ROLE_KEY — já disponível por padrão no ambiente da função.
//
// Depois de configurar os secrets, publique com:
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
// e registre a URL pública como webhook do produto WhatsApp no Meta App
// Dashboard, usando o mesmo WHATSAPP_VERIFY_TOKEN no campo "Verify Token".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// service_role: ignora RLS de propósito — a função precisa achar o dono de um
// número de telefone sem ter uma sessão de usuário autenticada.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/* ---- heurísticas (cópia mínima de lib/heuristics.ts e lib/types.ts) ---- */

const CATEGORIES: { name: string; color: string }[] = [
  { name: 'Alimentação', color: '#bb6b60' },
  { name: 'Moradia', color: '#93739e' },
  { name: 'Transporte', color: '#6b9dc2' },
  { name: 'Lazer', color: '#c66f8e' },
  { name: 'Saúde', color: '#74a17c' },
  { name: 'Assinaturas', color: '#d3b869' },
  { name: 'Salário', color: '#4f9483' },
  { name: 'Outros', color: '#8b9198' },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação': ['ifood', 'restaurante', 'mercado', 'supermercado', 'padaria', 'lanchonete', 'pizza', 'burguer', 'hamburguer', 'açai', 'acai', 'mcdonalds', 'burger king', 'pao de acucar', 'carrefour', 'feira'],
  'Transporte': ['uber', '99', 'taxi', 'táxi', 'posto', 'combustível', 'combustivel', 'estacionamento', 'pedágio', 'pedagio', 'gasolina', 'etanol', 'ipiranga', 'shell'],
  'Moradia': ['aluguel', 'condominio', 'condomínio', 'energia', 'enel', 'luz', 'agua', 'água', 'sabesp', 'internet', 'fibra', 'vivo', 'claro', 'tim', 'gas', 'gás', 'iptu'],
  'Lazer': ['cinema', 'cinemark', 'ingresso', 'show', 'bar', 'balada', 'viagem', 'hotel', 'airbnb', 'teatro'],
  'Saúde': ['farmacia', 'farmácia', 'drogaria', 'drogasil', 'pacheco', 'clinica', 'clínica', 'consulta', 'medico', 'médico', 'dentista', 'academia', 'smart fit', 'laboratorio'],
  'Assinaturas': ['netflix', 'spotify', 'amazon prime', 'prime video', 'hbo', 'max', 'disney', 'youtube', 'apple', 'assinatura', 'mensalidade', 'icloud', 'openai', 'chatgpt'],
  'Salário': ['salario', 'salário', 'folha', 'pagamento de salario', 'pro-labore', 'holerite', 'rendimento'],
};

function parseAmount(raw: string): number {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 0;
  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  const decimalPos = Math.max(lastComma, lastDot);
  if (decimalPos === -1) return parseFloat(trimmed.replace(/[^0-9-]/g, '')) || 0;
  const intPart = trimmed.slice(0, decimalPos).replace(/[^0-9-]/g, '');
  const decPart = trimmed.slice(decimalPos + 1).replace(/[^0-9]/g, '');
  return parseFloat(intPart + '.' + decPart) || 0;
}

function guessCategoryFromText(text: string): { name: string; color: string } {
  const lower = text.toLowerCase();
  let bestName: string | null = null;
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      bestName = catName;
      break;
    }
  }
  return CATEGORIES.find((c) => c.name === bestName) ?? CATEGORIES.find((c) => c.name === 'Outros')!;
}

function guessTypeFromText(text: string): 'in' | 'out' {
  const lower = text.toLowerCase();
  const inHints = ['recebeu', 'recebido', 'você recebeu', 'voce recebeu', 'crédito de', 'credito de', 'depósito', 'deposito', 'transferência recebida', 'pix recebido', 'estorno', 'salário', 'salario'];
  return inHints.some((h) => lower.includes(h)) ? 'in' : 'out';
}

function guessAmountFromText(text: string): number {
  const match = text.match(/r\$?\s*([\d.,]+)/i);
  if (match) return parseAmount(match[1]);
  const fallback = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
  if (fallback) return parseAmount(fallback[1]);
  return 0;
}

function guessDescFromText(text: string, type: 'in' | 'out'): string {
  const m = text.match(/(?:de|para)\s+([A-ZÀ-Úa-zà-ú0-9 .]{3,40})/);
  if (m) {
    const name = m[1].replace(/\s+em\s+.*$/i, '').trim();
    if (name) return name;
  }
  return type === 'in' ? 'Pix recebido' : 'Pagamento';
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---- WhatsApp Cloud API ---- */

async function sendWhatsappMessage(to: string, body: string): Promise<void> {
  await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
}

/**
 * Transcrição de áudio via Whisper (OpenAI). Baixa o .ogg/Opus da Meta e
 * repassa os bytes pro endpoint de transcrição — sem isso, mensagens de
 * áudio recebiam sempre um aviso pedindo texto (ver handleAudioMessage).
 * Se OPENAI_API_KEY não estiver configurada, a chamada falha e cai no mesmo
 * aviso de antes, sem quebrar o restante do webhook.
 */
async function transcribeAudio(mediaId: string): Promise<string | null> {
  try {
    // 1. Pega a URL do áudio na Meta
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    });
    if (!metaRes.ok) return null;
    const { url } = await metaRes.json();

    // 2. Baixa os bytes do áudio
    const mediaRes = await fetch(url, { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } });
    if (!mediaRes.ok) return null;
    const audioBytes = await mediaRes.arrayBuffer();

    // 3. Envia para a API do Whisper (OpenAI)
    const formData = new FormData();
    formData.append('file', new Blob([audioBytes], { type: 'audio/ogg' }), 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
    if (!whisperRes.ok) return null;
    const whisperData = await whisperRes.json();
    return whisperData.text ?? null;
  } catch (err) {
    console.error('[transcribeAudio] erro:', err);
    return null;
  }
}

/* ---- fluxo principal ---- */

async function handlePairing(phone: string, text: string): Promise<boolean> {
  const codigo = text.trim().replace(/\D/g, '');
  if (codigo.length !== 6) return false;

  const { data: link } = await supabase
    .from('whatsapp_links')
    .select('*')
    .eq('pairing_code', codigo)
    .eq('verified', false)
    .maybeSingle();

  if (!link) return false;

  await supabase
    .from('whatsapp_links')
    .update({ phone, verified: true, verified_at: new Date().toISOString() })
    .eq('id', link.id);

  await sendWhatsappMessage(phone, '✅ WhatsApp vinculado ao Grana. Agora é só me contar seus lançamentos por aqui.');
  return true;
}

async function registrarLancamento(userId: string, phone: string, text: string) {
  const amount = guessAmountFromText(text);
  if (!amount || amount <= 0) {
    await sendWhatsappMessage(phone, 'Não consegui identificar o valor. Tente algo como: "Almoço de 38 reais no débito hoje".');
    return;
  }
  const type = guessTypeFromText(text);
  const category = guessCategoryFromText(text);
  const description = guessDescFromText(text, type);

  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    type,
    description,
    amount,
    category: category.name,
    color: category.color,
    occurred_on: todayISO(),
    recurring: false,
  });

  if (error) {
    await sendWhatsappMessage(phone, 'Deu erro ao salvar o lançamento. Tente de novo em instantes.');
    return;
  }

  const valorFmt = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await sendWhatsappMessage(phone, `✅ Lançamento registrado: R$ ${valorFmt} em ${category.name}`);
}

async function handleTextMessage(phone: string, text: string) {
  const { data: link } = await supabase.from('whatsapp_links').select('*').eq('phone', phone).eq('verified', true).maybeSingle();

  if (link) {
    await registrarLancamento(link.user_id, phone, text);
    return;
  }

  const pareado = await handlePairing(phone, text);
  if (!pareado) {
    await sendWhatsappMessage(
      phone,
      'Este número ainda não está vinculado a uma conta Grana. Gere um código de pareamento em Perfil → WhatsApp no app e envie o código de 6 dígitos aqui.'
    );
  }
}

async function handleAudioMessage(phone: string, mediaId: string) {
  const { data: link } = await supabase.from('whatsapp_links').select('*').eq('phone', phone).eq('verified', true).maybeSingle();
  if (!link) {
    await sendWhatsappMessage(phone, 'Este número ainda não está vinculado. Gere um código de pareamento em Perfil → WhatsApp no app.');
    return;
  }

  const texto = await transcribeAudio(mediaId);
  if (!texto) {
    await sendWhatsappMessage(phone, 'Ainda não consigo transcrever áudio — me conte o lançamento em texto, por favor (ex: "Mercado de 120 reais").');
    return;
  }
  await registrarLancamento(link.user_id, phone, texto);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Handshake de verificação do webhook (Meta exige isto uma vez, ao registrar a URL).
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const payload = await req.json();
      const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (message) {
        const phone = String(message.from);
        if (message.type === 'text') {
          await handleTextMessage(phone, message.text?.body ?? '');
        } else if (message.type === 'audio') {
          await handleAudioMessage(phone, message.audio?.id);
        } else {
          await sendWhatsappMessage(phone, 'Por enquanto só entendo mensagens de texto ou áudio.');
        }
      }
    } catch (err) {
      console.error('[whatsapp-webhook] erro ao processar mensagem:', err);
    }
    // A Meta reenvia o webhook em retry se não receber 200 — sempre respondemos
    // ok mesmo quando o processamento interno falhou (o erro já foi logado).
    return new Response('ok', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});
