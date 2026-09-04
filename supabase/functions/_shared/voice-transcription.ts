// Transcrição de áudio compartilhada entre os três canais de lançamento por
// voz (WhatsApp, app, widget Android) — mesma ordem de provedores, mesmo
// prompt, mesma normalização de número por extenso, pra nenhum canal ler
// valor/forma de pagamento de um jeito diferente por causa de divergência na
// transcrição em si (ver docs/superpowers/specs/2026-09-04-voz-unificada-
// widget-android-design.md).
//
// Nunca loga bytes de áudio nem o texto transcrito — só provedor e tamanho.
// Quem baixa o áudio (Meta, upload multipart) é responsabilidade de quem
// chama; este módulo só recebe bytes já em mãos.

import { normalizarTextoTranscrito } from './finance-command.ts';

export type ProvedorTranscricao = {
  nome: string;
  url: string;
  model: string;
  key: () => string;
};

/**
 * Provedores de transcrição, em ordem de preferência. Ambos falam o mesmo
 * dialeto de API (a Groq expõe endpoints compatíveis com a OpenAI), então o
 * corpo da requisição é idêntico — só mudam URL, modelo e chave. A Groq vem
 * primeiro por ser ordens de grandeza mais rápida e barata no mesmo Whisper;
 * a OpenAI fica como rede de segurança para quando a Groq estiver fora do ar
 * ou com rate limit, situação em que perder o lançamento seria pior do que
 * pagar alguns centavos.
 */
export function provedoresPadrao(groqKey: string, openaiKey: string): ProvedorTranscricao[] {
  return [
    { nome: 'groq', url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3', key: () => groqKey },
    { nome: 'openai', url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1', key: () => openaiKey },
  ];
}

/* Prompt único, sem mencionar canal ("mensagem de WhatsApp") — o mesmo texto
   vale pra um áudio gravado no app ou no widget, que nunca passaram pelo
   WhatsApp. O prompt não garante nada (Whisper não segue instrução à risca),
   mas empurra o estilo de saída: sem isso, "onze e setenta e nove" (forma
   comum de falar um preço, reais e centavos, sem dizer "reais"/"centavos")
   às vezes sai transcrito como "1179", os dois números colados sem vírgula
   nem "e" — formato que normalizarTextoTranscrito não tem como recuperar
   depois, porque "1179" sozinho é ambíguo (pode ser R$1.179 de verdade). */
const PROMPT_TRANSCRICAO =
  'Transcrição de um comando de voz em português do Brasil sobre um lançamento financeiro pessoal ' +
  '(gasto, receita, boleto ou compra). Valores em reais usam vírgula como separador decimal, nunca ponto: ' +
  '11,79 (não 11.79, não 1179).';

export type ResultadoTranscricao = { texto: string; provedor: string };

/**
 * Tenta cada provedor na ordem e devolve a primeira transcrição não vazia, já
 * normalizada (ver normalizarTextoTranscrito). Devolve null quando nenhum
 * provedor está configurado, todos falharam, ou o áudio saiu inaudível — quem
 * chama decide a mensagem de fallback.
 *
 * `fetchComTimeout` é injetado (não importado direto) pra este módulo não
 * decidir timeout nem depender de um helper específico de uma função —
 * whatsapp-webhook e processar-lancamento-voz já têm o próprio.
 */
export async function transcrever(
  audioBytes: ArrayBuffer,
  opts: {
    mimeType: string;
    nomeArquivo: string;
    provedores: ProvedorTranscricao[];
    fetchComTimeout: (url: string, init?: RequestInit) => Promise<Response>;
  }
): Promise<ResultadoTranscricao | null> {
  for (const provedor of opts.provedores) {
    const chave = provedor.key();
    if (!chave) continue;

    try {
      const formData = new FormData();
      formData.append('file', new Blob([audioBytes], { type: opts.mimeType }), opts.nomeArquivo);
      formData.append('model', provedor.model);
      formData.append('language', 'pt');
      formData.append('response_format', 'json');
      formData.append('prompt', PROMPT_TRANSCRICAO);

      const res = await opts.fetchComTimeout(provedor.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}` },
        body: formData,
      });
      if (!res.ok) {
        console.error(`[transcrever] ${provedor.nome} respondeu ${res.status}:`, await res.text());
        continue;
      }
      const bruto = (await res.json())?.text;
      if (typeof bruto !== 'string' || !bruto.trim()) continue;

      const normalizado = normalizarTextoTranscrito(bruto);
      if (!normalizado) continue;
      // Só o provedor e o tamanho. A transcrição em si é o extrato da
      // pessoa ("mercado, 120 reais") e os logs da Edge Function ficam
      // retidos e legíveis por qualquer um com acesso ao painel — não é
      // lugar para dado financeiro. Para depurar, o que importa é saber se
      // veio texto e de qual provedor.
      console.log(`[transcrever] ${provedor.nome} devolveu ${normalizado.length} caracteres`);
      return { texto: normalizado, provedor: provedor.nome };
    } catch (err) {
      console.error(`[transcrever] ${provedor.nome} lançou exceção:`, err);
    }
  }
  return null;
}
