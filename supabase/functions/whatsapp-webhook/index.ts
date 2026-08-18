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
//   WHATSAPP_APP_SECRET       — "Chave secreta do aplicativo" (App Secret) em
//                                Configurações do app -> Básico, no painel da
//                                Meta. Usada só para conferir a assinatura
//                                (X-Hub-Signature-256) de cada mensagem
//                                recebida — sem isso, qualquer pessoa que
//                                descobrisse esta URL poderia forjar POSTs se
//                                passando por um número já vinculado. Enquanto
//                                este secret não estiver configurado, a
//                                verificação fica desligada (com aviso no
//                                log) em vez de derrubar o webhook inteiro.
//   GROQ_API_KEY              — chave da Groq, provedor preferido para
//                                transcrever áudio (whisper-large-v3). Ordem
//                                de grandeza mais rápido e mais barato que a
//                                OpenAI para o mesmo modelo.
//   OPENAI_API_KEY            — opcional: fallback de transcrição (whisper-1)
//                                usado só quando a Groq falha ou não está
//                                configurada.
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
const WHATSAPP_APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
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
  'Alimentação': ['ifood', 'restaurante', 'mercado', 'supermercado', 'padaria', 'lanchonete', 'pizza', 'burguer', 'hamburguer', 'açai', 'acai', 'mcdonalds', 'burger king', 'pao de acucar', 'carrefour', 'feira', 'merenda', 'lanche', 'almoço', 'almoco', 'jantar'],
  'Transporte': ['uber', '99', 'taxi', 'táxi', 'posto', 'combustível', 'combustivel', 'estacionamento', 'pedágio', 'pedagio', 'gasolina', 'etanol', 'ipiranga', 'shell'],
  'Moradia': ['aluguel', 'condominio', 'condomínio', 'energia', 'enel', 'luz', 'agua', 'água', 'sabesp', 'internet', 'fibra', 'vivo', 'claro', 'tim', 'gas', 'gás', 'iptu'],
  'Lazer': ['cinema', 'cinemark', 'ingresso', 'show', 'bar', 'balada', 'viagem', 'hotel', 'airbnb', 'teatro'],
  'Saúde': ['farmacia', 'farmácia', 'drogaria', 'drogasil', 'pacheco', 'clinica', 'clínica', 'consulta', 'medico', 'médico', 'dentista', 'academia', 'smart fit', 'laboratorio'],
  'Assinaturas': ['netflix', 'spotify', 'amazon prime', 'prime video', 'hbo', 'max', 'disney', 'youtube', 'apple', 'assinatura', 'mensalidade', 'icloud', 'openai', 'chatgpt'],
  'Salário': ['salario', 'salário', 'folha', 'pagamento de salario', 'pro-labore', 'holerite', 'rendimento'],
};

const NOMES_CATEGORIAS = CATEGORIES.map((c) => c.name).join(', ');

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

/** Casa por palavra-chave, sem cair pra "Outros" — quem chama decide o que fazer com a incerteza. */
function matchCategoryByKeyword(text: string): { name: string; color: string } | null {
  const lower = text.toLowerCase();
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return CATEGORIES.find((c) => c.name === catName) ?? null;
    }
  }
  return null;
}

/** Casa a resposta de uma pergunta de esclarecimento: nome exato da categoria, ou uma palavra-chave conhecida. */
function matchCategoryByReply(text: string): { name: string; color: string } | null {
  const lower = text.trim().toLowerCase();
  const exact = CATEGORIES.find((c) => c.name.toLowerCase() === lower);
  if (exact) return exact;
  return matchCategoryByKeyword(text);
}

function guessTypeFromText(text: string): 'in' | 'out' {
  const lower = text.toLowerCase();
  const inHints = ['recebeu', 'recebido', 'você recebeu', 'voce recebeu', 'crédito de', 'credito de', 'depósito', 'deposito', 'transferência recebida', 'pix recebido', 'estorno', 'salário', 'salario'];
  return inHints.some((h) => lower.includes(h)) ? 'in' : 'out';
}

function guessAmountFromText(text: string): number {
  const match = text.match(/r\$\s*([\d.,]+)/i);
  if (match) return parseAmount(match[1]);
  // "38 reais", "120 conto", "1.250,90 pila" — em áudio transcrito o "R$"
  // quase nunca aparece; a moeda vem falada depois do número.
  const porExtenso = text.match(/([\d.,]+)\s*(?:reais|real|conto|contos|pila|pau)\b/i);
  if (porExtenso) return parseAmount(porExtenso[1]);
  const fallback = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
  if (fallback) return parseAmount(fallback[1]);
  return 0;
}

/* ---- normalização de texto transcrito de áudio ---- */

const NUMERO_POR_EXTENSO: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cinqüenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100,
  duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000,
};

/** Soma um trecho já validado de palavras numéricas ("mil duzentos e cinquenta" → 1250). */
function somarExtenso(palavras: string[]): number {
  let total = 0;
  let atual = 0;
  for (const p of palavras) {
    const v = NUMERO_POR_EXTENSO[p];
    if (v === undefined) continue; // "e"
    if (v === 1000) {
      atual = (atual === 0 ? 1 : atual) * 1000;
      total += atual;
      atual = 0;
    } else {
      atual += v;
    }
  }
  return total + atual;
}

/**
 * Whisper transcreve valores falados por extenso ("trinta e oito reais") com
 * a mesma frequência que em dígitos, e o parser de valor só entende dígitos.
 * Esta normalização converte trechos numéricos por extenso em números e junta
 * "X reais e Y centavos" num decimal único, antes do texto seguir pro mesmo
 * fluxo de heurística usado nas mensagens escritas.
 */
function normalizarTextoTranscrito(texto: string): string {
  const tokens = texto.split(/(\s+)/); // mantém os espaços para remontar o texto
  const saida: string[] = [];
  let bloco: string[] = [];

  const fecharBloco = () => {
    if (bloco.length === 0) return;
    // Um "e" solto no fim do bloco pertence à frase, não ao número.
    while (bloco.length > 0 && NUMERO_POR_EXTENSO[bloco[bloco.length - 1]] === undefined) {
      bloco.pop();
    }
    if (bloco.length > 0) saida.push(String(somarExtenso(bloco)));
    bloco = [];
  };

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (bloco.length === 0) saida.push(token);
      continue;
    }
    const limpo = token.toLowerCase().replace(/[.,!?;:]+$/, '');
    const pontuacao = token.slice(limpo.length);
    const ehNumero = NUMERO_POR_EXTENSO[limpo] !== undefined;
    // "e" só continua um bloco que já começou (evita capturar o "e" de ligação da frase).
    const ehLigacao = limpo === 'e' && bloco.length > 0;

    if (ehNumero || ehLigacao) {
      bloco.push(limpo);
      if (pontuacao) {
        fecharBloco();
        saida.push(pontuacao, ' ');
      }
      continue;
    }
    fecharBloco();
    if (saida.length > 0 && !/\s$/.test(saida[saida.length - 1])) saida.push(' ');
    saida.push(token);
  }
  fecharBloco();

  return saida
    .join('')
    // "38 reais e 50 centavos" → "38,50 reais"
    .replace(/(\d+)\s*(?:reais|real)\s*e\s*(\d+)\s*centavos?/gi, (_m, r, c) => `${r},${String(c).padStart(2, '0')} reais`)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function guessDescFromText(text: string, type: 'in' | 'out'): string {
  // "Pizza para Maria" / "Presente de Maria" — o nome vem DEPOIS de "de"/"para".
  const depois = text.match(/(?:de|para)\s+([A-ZÀ-Úa-zà-ú0-9 .]{3,40})/);
  if (depois) {
    const name = depois[1].replace(/\s+em\s+.*$/i, '').trim();
    if (name) return name;
  }
  // "Merenda de R$ 38,00" / "Mercado de 120 reais" — o item vem ANTES de "de <valor>".
  const antes = text.match(/^([A-ZÀ-Úa-zà-ú0-9 .]{3,40}?)\s+de\s+(?:r\$|\d)/i);
  if (antes) {
    const name = antes[1].trim();
    if (name) return name;
  }
  return type === 'in' ? 'Pix recebido' : 'Pagamento';
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---- assinatura da Meta (X-Hub-Signature-256) ---- */

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** true = pode processar. Sem WHATSAPP_APP_SECRET configurado, deixa passar (com aviso) em vez de derrubar o webhook. */
async function assinaturaValida(rawBody: string, header: string | null): Promise<boolean> {
  if (!WHATSAPP_APP_SECRET) {
    console.warn('[whatsapp-webhook] WHATSAPP_APP_SECRET não configurado — pulando verificação de assinatura.');
    return true;
  }
  if (!header || !header.startsWith('sha256=')) return false;
  const esperado = `sha256=${await hmacSha256Hex(WHATSAPP_APP_SECRET, rawBody)}`;
  return timingSafeEqual(header, esperado);
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
 * Provedores de transcrição, em ordem de preferência. Ambos falam o mesmo
 * dialeto de API (a Groq expõe endpoints compatíveis com a OpenAI), então o
 * corpo da requisição é idêntico — só mudam URL, modelo e chave. A Groq vem
 * primeiro por ser ordens de grandeza mais rápida e barata no mesmo Whisper;
 * a OpenAI fica como rede de segurança para quando a Groq estiver fora do ar
 * ou com rate limit, situação em que perder o lançamento seria pior do que
 * pagar alguns centavos.
 */
const PROVEDORES_TRANSCRICAO = [
  { nome: 'groq', url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3', key: () => GROQ_API_KEY },
  { nome: 'openai', url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1', key: () => OPENAI_API_KEY },
];

/** Baixa o .ogg/Opus da Meta. Devolve null se a mídia expirou ou o token não autoriza. */
async function baixarAudioDaMeta(mediaId: string): Promise<ArrayBuffer | null> {
  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!metaRes.ok) {
    console.error('[transcribeAudio] Meta recusou a consulta da mídia:', metaRes.status);
    return null;
  }
  const { url } = await metaRes.json();
  if (!url) return null;

  const mediaRes = await fetch(url, { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } });
  if (!mediaRes.ok) {
    console.error('[transcribeAudio] falha ao baixar bytes do áudio:', mediaRes.status);
    return null;
  }
  return await mediaRes.arrayBuffer();
}

/**
 * Transcreve um áudio recebido por WhatsApp. Tenta cada provedor configurado
 * na ordem e devolve a primeira transcrição não vazia, já normalizada (ver
 * normalizarTextoTranscrito). Devolve null quando nenhum provedor está
 * configurado, todos falharam, ou o áudio saiu inaudível — quem chama decide
 * a mensagem de fallback.
 */
async function transcribeAudio(mediaId: string): Promise<string | null> {
  try {
    const audioBytes = await baixarAudioDaMeta(mediaId);
    if (!audioBytes) return null;

    for (const provedor of PROVEDORES_TRANSCRICAO) {
      const chave = provedor.key();
      if (!chave) continue;

      try {
        const formData = new FormData();
        formData.append('file', new Blob([audioBytes], { type: 'audio/ogg' }), 'audio.ogg');
        formData.append('model', provedor.model);
        formData.append('language', 'pt');
        formData.append('response_format', 'json');

        const res = await fetch(provedor.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${chave}` },
          body: formData,
        });
        if (!res.ok) {
          console.error(`[transcribeAudio] ${provedor.nome} respondeu ${res.status}:`, await res.text());
          continue;
        }
        const bruto = (await res.json())?.text;
        if (typeof bruto !== 'string' || !bruto.trim()) continue;

        const normalizado = normalizarTextoTranscrito(bruto);
        console.log(`[transcribeAudio] ${provedor.nome} transcreveu: "${normalizado}"`);
        return normalizado || null;
      } catch (err) {
        console.error(`[transcribeAudio] ${provedor.nome} lançou exceção:`, err);
      }
    }

    if (!GROQ_API_KEY && !OPENAI_API_KEY) {
      console.warn('[transcribeAudio] nenhuma chave de transcrição configurada (GROQ_API_KEY / OPENAI_API_KEY).');
    }
    return null;
  } catch (err) {
    console.error('[transcribeAudio] erro:', err);
    return null;
  }
}

/* ---- fluxo principal ---- */

/* Janela de validade do código de pareamento — sem isso, um código de 6
   dígitos gerado uma vez e nunca usado fica adivinhável para sempre (o app
   sempre apaga o vínculo anterior ao gerar um novo, então `created_at`
   reflete a geração mais recente). 15 minutos é folga suficiente para copiar
   e colar no WhatsApp, e reduz a janela de tentativa de força bruta de
   "indefinida" para alguns minutos. */
const VALIDADE_PAREAMENTO_MS = 15 * 60 * 1000;

async function handlePairing(phone: string, text: string): Promise<boolean> {
  const codigo = text.trim().replace(/\D/g, '');
  if (codigo.length !== 6) return false;

  const cutoff = new Date(Date.now() - VALIDADE_PAREAMENTO_MS).toISOString();

  const { data: link } = await supabase
    .from('whatsapp_links')
    .select('*')
    .eq('pairing_code', codigo)
    .eq('verified', false)
    .gt('created_at', cutoff)
    .maybeSingle();

  if (!link) return false;

  await supabase
    .from('whatsapp_links')
    .update({ phone, verified: true, verified_at: new Date().toISOString() })
    .eq('id', link.id);

  await sendWhatsappMessage(phone, '✅ WhatsApp vinculado ao Grana. Agora é só me contar seus lançamentos por aqui.');
  return true;
}

type Rascunho = {
  phone: string;
  user_id: string;
  description: string;
  amount: number;
  type: 'in' | 'out';
  occurred_on: string;
  attempts: number;
};

async function buscarPendente(phone: string): Promise<Rascunho | null> {
  const { data } = await supabase.from('whatsapp_pending').select('*').eq('phone', phone).maybeSingle();
  return data as Rascunho | null;
}

async function limparPendente(phone: string): Promise<void> {
  await supabase.from('whatsapp_pending').delete().eq('phone', phone);
}

/** Grava o lançamento de verdade e limpa qualquer rascunho pendente daquele número. */
async function finalizarLancamento(
  rascunho: Pick<Rascunho, 'user_id' | 'phone' | 'description' | 'amount' | 'type' | 'occurred_on'>,
  categoria: { name: string; color: string }
): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    user_id: rascunho.user_id,
    type: rascunho.type,
    description: rascunho.description,
    amount: rascunho.amount,
    category: categoria.name,
    color: categoria.color,
    occurred_on: rascunho.occurred_on,
    recurring: false,
  });

  await limparPendente(rascunho.phone);

  if (error) {
    await sendWhatsappMessage(rascunho.phone, 'Deu erro ao salvar o lançamento. Tente de novo em instantes.');
    return;
  }

  const valorFmt = rascunho.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await sendWhatsappMessage(
    rascunho.phone,
    `✅ Lançamento registrado: R$ ${valorFmt} em ${categoria.name} (${rascunho.description})`
  );
}

/**
 * Ponto de entrada de um texto que pode virar lançamento. Quando o valor não
 * é identificado, pede pra reformular — não tem rascunho possível sem valor.
 * Quando o valor é identificado mas a categoria não bate com nenhuma palavra-
 * chave conhecida, guarda um rascunho pendente e PERGUNTA em vez de arquivar
 * tudo em "Outros" sem avisar — essa era a reclamação original: falta de
 * assertividade quando a mensagem é ambígua.
 */
async function registrarLancamento(userId: string, phone: string, text: string): Promise<void> {
  const amount = guessAmountFromText(text);
  if (!amount || amount <= 0) {
    await sendWhatsappMessage(phone, 'Não consegui identificar o valor. Tente algo como: "Almoço de 38 reais" ou "R$ 38 em Alimentação".');
    return;
  }

  const type = guessTypeFromText(text);
  const description = guessDescFromText(text, type);
  const occurred_on = todayISO();
  const categoria = matchCategoryByKeyword(text);

  if (categoria) {
    await finalizarLancamento({ user_id: userId, phone, description, amount, type, occurred_on }, categoria);
    return;
  }

  await supabase
    .from('whatsapp_pending')
    .upsert({ phone, user_id: userId, description, amount, type, occurred_on, attempts: 0 });

  const valorFmt = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await sendWhatsappMessage(
    phone,
    `Não identifiquei a categoria de "${description}" (R$ ${valorFmt}). Qual dessas se encaixa melhor?\n${NOMES_CATEGORIAS}`
  );
}

/** Trata a resposta a uma pergunta de esclarecimento pendente. Devolve true se tratou (a mensagem não deve seguir o fluxo normal). */
async function tratarRespostaPendente(phone: string, text: string): Promise<boolean> {
  const pendente = await buscarPendente(phone);
  if (!pendente) return false;

  const categoria = matchCategoryByReply(text);
  if (categoria) {
    await finalizarLancamento(pendente, categoria);
    return true;
  }

  const tentativas = pendente.attempts + 1;
  if (tentativas >= 2) {
    // Duas tentativas sem reconhecer — registra em "Outros" pra não travar o lançamento pra sempre, mas avisa que foi um chute.
    const outros = CATEGORIES.find((c) => c.name === 'Outros')!;
    await finalizarLancamento(pendente, outros);
    await sendWhatsappMessage(phone, 'Não reconheci a categoria — registrei em "Outros" mesmo assim. Você pode trocar depois no app.');
    return true;
  }

  await supabase.from('whatsapp_pending').update({ attempts: tentativas }).eq('phone', phone);
  await sendWhatsappMessage(phone, `Não entendi. Responda só com o nome de uma destas categorias:\n${NOMES_CATEGORIAS}`);
  return true;
}

async function handleTextMessage(phone: string, text: string): Promise<void> {
  const { data: link } = await supabase.from('whatsapp_links').select('*').eq('phone', phone).eq('verified', true).maybeSingle();

  if (link) {
    const tratou = await tratarRespostaPendente(phone, text);
    if (tratou) return;
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

async function handleAudioMessage(phone: string, mediaId: string): Promise<void> {
  const { data: link } = await supabase.from('whatsapp_links').select('*').eq('phone', phone).eq('verified', true).maybeSingle();
  if (!link) {
    await sendWhatsappMessage(phone, 'Este número ainda não está vinculado. Gere um código de pareamento em Perfil → WhatsApp no app.');
    return;
  }

  const texto = await transcribeAudio(mediaId);
  if (!texto) {
    await sendWhatsappMessage(phone, '🎙️ Não consegui entender esse áudio. Tente gravar de novo mais perto do microfone, ou me conte em texto (ex: "Mercado de 120 reais").');
    return;
  }

  const tratou = await tratarRespostaPendente(phone, texto);
  if (tratou) return;

  // Sem valor identificado o áudio vira um beco sem saída silencioso: a pessoa
  // não sabe se o problema foi a transcrição ou a frase. Ecoar o que foi
  // entendido deixa o erro óbvio ("ouvi 'mercado' mas não ouvi o valor").
  if (guessAmountFromText(texto) <= 0) {
    await sendWhatsappMessage(
      phone,
      `🎙️ Entendi: "${texto}"\n\nMas não identifiquei o valor. Tente incluir o valor no áudio, tipo: "Mercado, cento e vinte reais".`
    );
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
    const rawBody = await req.text();

    if (!(await assinaturaValida(rawBody, req.headers.get('x-hub-signature-256')))) {
      return new Response('Invalid signature', { status: 401 });
    }

    try {
      const payload = JSON.parse(rawBody);
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
