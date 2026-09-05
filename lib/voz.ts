import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { supabase } from './supabase';

/**
 * Cliente da Edge Function `processar-lancamento-voz`.
 *
 * O aparelho grava, manda o arquivo pra cá, recebe o TEXTO. A chave do Whisper
 * mora só nos secrets da função — nunca no APK —, e é por isso que a
 * transcrição não acontece no aparelho.
 *
 * O que volta daqui é a mesma transcrição que o bot do WhatsApp obteria do
 * mesmo áudio (mesma ordem Groq → OpenAI, mesmo prompt, mesma normalização de
 * número por extenso: `supabase/functions/_shared/voice-transcription.ts`).
 * Interpretar o texto continua sendo trabalho de `lib/heuristics.ts`, aqui no
 * aparelho — o mesmo parser que o webhook usa, vigiado por
 * `__tests__/sync-parser.js`.
 *
 * Serve tanto o botão de voz das telas quanto a tarefa headless do widget
 * Android, que não tem React nenhum por perto.
 */

/* Espelha os códigos que a Edge Function devolve, mais os dois que só existem
   no aparelho (`sem_rede`, `sem_sessao`). São eles que escolhem a mensagem —
   nunca o texto cru de um provedor, que não é escrito pra ser lido por quem
   usa o app. */
export type CodigoErroVoz =
  | 'nao_autenticado'
  | 'sem_sessao'
  | 'audio_ausente'
  | 'audio_grande'
  | 'formato_invalido'
  | 'muitas_tentativas'
  | 'sem_provedor'
  | 'nao_entendi'
  | 'erro_interno'
  | 'sem_rede'
  | 'demorou';

export type ResultadoVoz = { ok: true; transcript: string } | { ok: false; codigo: CodigoErroVoz };

const CODIGOS_CONHECIDOS: CodigoErroVoz[] = [
  'nao_autenticado', 'audio_ausente', 'audio_grande', 'formato_invalido',
  'muitas_tentativas', 'sem_provedor', 'nao_entendi', 'erro_interno',
];

/** Teto local, espelhando o da função. Cortar aqui evita subir 2 MB pra receber 413. */
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/** Duração máxima da gravação. Vale pro botão do app e pro widget. */
export const MAX_SEGUNDOS_GRAVACAO = 20;

/* Rede móvel ruim não devolve erro: ela pendura. Sem este teto o botão de voz
   ficava em "Transcrevendo…" pra sempre, sem cancelar e sem explicar, e a
   tarefa do widget segurava o widget em "Lançando…" até o Android matá-la aos
   dois minutos. São dois provedores sequenciais de até 30s cada, mais upload. */
const TIMEOUT_MS = 75_000;

function urlDaFuncao(): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/functions/v1/processar-lancamento-voz`;
}

/**
 * Sobe o arquivo gravado e devolve a transcrição.
 *
 * `tamanhoBytes` é opcional porque nem todo chamador sabe o tamanho de graça;
 * quando vem, a checagem acontece antes do upload.
 */
export async function transcreverAudio(
  uri: string,
  opts: { mimeType?: string; nomeArquivo?: string; tamanhoBytes?: number } = {}
): Promise<ResultadoVoz> {
  const url = urlDaFuncao();
  if (!url) return { ok: false, codigo: 'erro_interno' };

  if (opts.tamanhoBytes !== undefined && opts.tamanhoBytes > MAX_AUDIO_BYTES) {
    return { ok: false, codigo: 'audio_grande' };
  }
  if (opts.tamanhoBytes === 0) return { ok: false, codigo: 'audio_ausente' };

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, codigo: 'sem_sessao' };

  const nomeArquivo = opts.nomeArquivo ?? (Platform.OS === 'web' ? 'lancamento.webm' : 'lancamento.m4a');

  const form = new FormData();
  if (Platform.OS === 'web') {
    /* Na web o gravador devolve uma `blob:` URL, e o FormData do navegador
       precisa do Blob de verdade — a forma `{ uri, name, type }` do React
       Native não existe aqui e subiria como texto "[object Object]". */
    try {
      const blob = await (await fetch(uri)).blob();
      if (blob.size === 0) return { ok: false, codigo: 'audio_ausente' };
      if (blob.size > MAX_AUDIO_BYTES) return { ok: false, codigo: 'audio_grande' };
      form.append('audio', blob, nomeArquivo);
    } catch {
      return { ok: false, codigo: 'audio_ausente' };
    }
  } else {
    /* Expo 57 usa expo/fetch: o objeto antigo { uri, name, type } é rejeitado
       antes de enviar a requisição. File oferece bytes() ao serializador. */
    try {
      const arquivo = new File(uri);
      if (__DEV__) console.warn('[voz:diag] arquivo', JSON.stringify({ uri, exists: arquivo.exists, size: arquivo.size, type: (arquivo as any).type }));
      if (!arquivo.exists || arquivo.size === 0) return { ok: false, codigo: 'audio_ausente' };
      if (arquivo.size > MAX_AUDIO_BYTES) return { ok: false, codigo: 'audio_grande' };
      form.append('audio', arquivo);
    } catch (e: any) {
      if (__DEV__) console.warn('[voz:diag] falha ao ler arquivo', String(e?.message ?? e));
      return { ok: false, codigo: 'audio_ausente' };
    }
  }

  const controle = new AbortController();
  const corte = setTimeout(() => controle.abort(), TIMEOUT_MS);
  let resposta: Response;
  try {
    resposta = await expoFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controle.signal,
    });
  } catch (e: any) {
    if (__DEV__) console.warn('[voz:diag] expoFetch lancou', e?.name, String(e?.message ?? e));
    /* Estourou o tempo é diferente de não ter rede: a fala pode ter sido
       perfeita e o áudio pode até ter chegado — dizer "sem conexão" seria
       mentir sobre o que aconteceu. */
    if (e?.name === 'AbortError') return { ok: false, codigo: 'demorou' };
    /* Erro de serialização/leitura local não prova falta de internet. */
    const mensagem = String(e?.message ?? '');
    const falhaDeRede = /network|failed to fetch|fetch failed|unable to resolve host|connection|connect to|socket|dns/i.test(mensagem);
    return { ok: false, codigo: falhaDeRede ? 'sem_rede' : 'erro_interno' };
  } finally {
    clearTimeout(corte);
  }

  let corpo: any = null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }

  if (!resposta.ok || corpo?.status !== 'ready') {
    if (__DEV__) console.warn('[voz:diag] resposta', resposta.status, JSON.stringify(corpo));
    const codigo = corpo?.code;
    if (typeof codigo === 'string' && (CODIGOS_CONHECIDOS as string[]).includes(codigo)) {
      return { ok: false, codigo: codigo as CodigoErroVoz };
    }
    /* 401 sem corpo reconhecível ainda é sessão: o gateway do Supabase recusa
       antes da função rodar quando o JWT expirou. */
    if (resposta.status === 401) return { ok: false, codigo: 'nao_autenticado' };
    return { ok: false, codigo: 'erro_interno' };
  }

  const transcript = typeof corpo.transcript === 'string' ? corpo.transcript.trim() : '';
  if (!transcript) return { ok: false, codigo: 'nao_entendi' };
  return { ok: true, transcript };
}

/** Título e texto prontos pra um Alert ou pra uma notificação do widget. */
export function mensagemDeErroVoz(codigo: CodigoErroVoz): { titulo: string; texto: string } {
  switch (codigo) {
    case 'nao_entendi':
      return {
        titulo: 'Não entendi',
        texto: 'Não deu pra reconhecer o que foi falado. Tente de novo, um pouco mais perto do microfone.',
      };
    case 'sem_rede':
      return {
        titulo: 'Sem conexão',
        texto: 'Não foi possível enviar o áudio. Verifique a internet e tente de novo.',
      };
    case 'demorou':
      return {
        titulo: 'Demorou demais',
        texto: 'A conexão está lenta e o áudio não foi transcrito a tempo. Nada foi lançado — tente de novo.',
      };
    case 'nao_autenticado':
    case 'sem_sessao':
      return {
        titulo: 'Entre de novo',
        texto: 'Sua sessão expirou. Abra o Grana. e entre na conta para lançar por voz.',
      };
    case 'muitas_tentativas':
      return {
        titulo: 'Muitas tentativas',
        texto: 'Você fez vários lançamentos por voz seguidos. Aguarde um minuto e tente de novo.',
      };
    case 'audio_grande':
      return {
        titulo: 'Áudio muito longo',
        texto: `Fale o lançamento em até ${MAX_SEGUNDOS_GRAVACAO} segundos, tipo "mercado 120 no Pix".`,
      };
    case 'audio_ausente':
      return {
        titulo: 'Nada foi gravado',
        texto: 'Não chegou nenhum áudio. Toque, fale o lançamento e toque de novo pra encerrar.',
      };
    case 'sem_provedor':
      return {
        titulo: 'Voz indisponível agora',
        texto: 'O serviço de transcrição está fora do ar no momento. Tente de novo mais tarde.',
      };
    case 'formato_invalido':
    case 'erro_interno':
    default:
      return {
        titulo: 'Não deu para transcrever',
        texto: 'Algo falhou ao processar o áudio. Tente de novo ou digite o lançamento.',
      };
  }
}
