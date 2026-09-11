import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { tokenDeAcessoLocal } from './sessao-offline';

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
// Deixa 30s para interpretação, gravação e recibo antes do headless (120s).
const TIMEOUT_TOTAL_MS = 60_000;

/* Orçamento de quem tem uma PESSOA esperando na tela.
   O widget roda com o app fechado e pode gastar o minuto inteiro; o botão de
   voz, não. Quando a rede aceita a conexão e não responde, o caminho completo
   (reconhecimento local + upload) consumia os 60 segundos antes de o botão
   poder salvar o áudio na fila — um minuto de "Transcrevendo…" para terminar
   em "guardei no aparelho". Quinze segundos cobrem folgado uma transcrição
   sadia, e o que passa disso vira fila, que preserva a fala e retoma sozinha
   na próxima abertura com conexão. */
export const ORCAMENTO_COM_PESSOA_ESPERANDO_MS = 15_000;

function urlDaFuncao(): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/functions/v1/processar-lancamento-voz`;
}

type ResultadoTentativa = ResultadoVoz | { ok: false; codigo: 'erro_interno'; ambiguo: true };

/**
 * Uma rodada de upload + transcrição. Isolado do `transcreverAudio` porque
 * o caso "resposta 200 mas corpo ilegível" (ver `ambiguo` abaixo) merece uma
 * segunda tentativa antes de incomodar quem usa o app — mobile picando no
 * meio da resposta corta o corpo sem derrubar o status HTTP, e os logs de
 * produção já confirmaram a função respondendo certo nesses casos.
 */
async function tentarUmaVez(
  url: string,
  token: string,
  uri: string,
  opts: { mimeType?: string; nomeArquivo?: string },
  deadline: number,
): Promise<ResultadoTentativa> {
  if (Date.now() >= deadline) return { ok: false, codigo: 'demorou' };
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
    /* Expo serializes name/type/bytes, not the RN {uri} upload shape.
       Keep explicit metadata: Android's MIME lookup is device-dependent,
       and the widget's supplied name/type must not be discarded. */
    try {
      const arquivo = new File(uri);
      if (__DEV__) console.warn('[voz:diag] arquivo', JSON.stringify({ uri, exists: arquivo.exists, size: arquivo.size, type: (arquivo as any).type }));
      if (!arquivo.exists || arquivo.size === 0) return { ok: false, codigo: 'audio_ausente' };
      if (arquivo.size > MAX_AUDIO_BYTES) return { ok: false, codigo: 'audio_grande' };
      form.append('audio', {
        name: nomeArquivo,
        type: opts.mimeType ?? 'audio/mp4',
        bytes: () => arquivo.bytes(),
      } as unknown as Blob);
    } catch (e: any) {
      if (__DEV__) console.warn('[voz:diag] falha ao ler arquivo', String(e?.message ?? e));
      return { ok: false, codigo: 'audio_ausente' };
    }
  }

  const controle = new AbortController();
  const corte = setTimeout(() => controle.abort(), Math.max(1, Math.min(TIMEOUT_MS, deadline - Date.now())));
  let resposta: Response;
  let corpo: any = null;
  try {
    resposta = await expoFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controle.signal,
    });
    if (controle.signal.aborted) return { ok: false, codigo: 'demorou' };
    // O prazo cobre também corpo pendurado depois dos cabeçalhos HTTP 200.
    corpo = await Promise.race([
      resposta.json().catch(() => null),
      new Promise<never>((_, reject) => controle.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('Timeout ao ler áudio'), { name: 'AbortError' })), { once: true })),
    ]);
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

  if (!resposta.ok || corpo?.status !== 'ready') {
    if (__DEV__) console.warn('[voz:diag] resposta', resposta.status, JSON.stringify(corpo));
    const codigo = corpo?.code;
    if (typeof codigo === 'string' && (CODIGOS_CONHECIDOS as string[]).includes(codigo)) {
      return { ok: false, codigo: codigo as CodigoErroVoz };
    }
    /* 401 sem corpo reconhecível ainda é sessão: o gateway do Supabase recusa
       antes da função rodar quando o JWT expirou. */
    if (resposta.status === 401) return { ok: false, codigo: 'nao_autenticado' };
    /* Resposta 200 (a função rodou e respondeu certo) mas corpo ilegível ou
       sem o campo esperado — nem `code` reconhecível, nem 401. Nenhum dos
       dois provou que o pedido em si era ruim (audio_ausente/audio_grande/
       formato_invalido teriam vindo com `code`), então vale tentar de novo
       em vez de já desistir. */
    if (resposta.ok) return { ok: false, codigo: 'erro_interno', ambiguo: true };
    return { ok: false, codigo: 'erro_interno' };
  }

  const transcript = typeof corpo.transcript === 'string' ? corpo.transcript.trim() : '';
  if (!transcript) return { ok: false, codigo: 'nao_entendi' };
  return { ok: true, transcript };
}

/**
 * Sobe o arquivo gravado e devolve a transcrição.
 *
 * `tamanhoBytes` é opcional porque nem todo chamador sabe o tamanho de graça;
 * quando vem, a checagem acontece antes do upload.
 */
export async function transcreverAudio(
  uri: string,
  opts: { mimeType?: string; nomeArquivo?: string; tamanhoBytes?: number; orcamentoMs?: number } = {}
): Promise<ResultadoVoz> {
  // O reconhecimento local também consome o prazo de quem chamou.
  const deadline = Date.now() + (opts.orcamentoMs ?? TIMEOUT_TOTAL_MS);
  const { transcreverNoAparelho } = await import('./voz-local');
  /* Passa o que RESTA do orçamento, e quem limita ao próprio teto é o módulo
     local. Ler a constante dele aqui criava um acoplamento silencioso: com um
     orçamento de 15s, um teto local de 30s estouraria o prazo inteiro antes de
     a rede ser tentada, e um valor ausente pulava o reconhecimento no aparelho
     sem dizer nada, trocando trabalho de graça por chamada paga. */
  const local = await transcreverNoAparelho(uri, Math.max(0, deadline - Date.now()));
  if (local) return { ok: true, transcript: local };
  const url = urlDaFuncao();
  if (!url) return { ok: false, codigo: 'erro_interno' };

  if (opts.tamanhoBytes !== undefined && opts.tamanhoBytes > MAX_AUDIO_BYTES) {
    return { ok: false, codigo: 'audio_grande' };
  }
  if (opts.tamanhoBytes === 0) return { ok: false, codigo: 'audio_ausente' };

  /* O token pode vir do disco, vencido, de propósito. Não é para ser aceito
     pelo servidor — é para a TENTATIVA acontecer. Sem token, a resposta aqui
     é `sem_sessao`, que o widget trata como falha definitiva e usa para apagar
     o áudio já gravado, avisando a pessoa para entrar na conta de novo:
     impossível justamente para quem está sem internet. Com o token em mãos, o
     `fetch` falha por rede, o código vira `sem_rede`, e a fala espera na fila
     até a conexão voltar. `sem_sessao` volta a significar o que diz: não há
     conta nenhuma neste aparelho. */
  const token = await tokenDeAcessoLocal();
  if (!token) return { ok: false, codigo: 'sem_sessao' };

  const primeira = await tentarUmaVez(url, token, uri, opts, deadline);
  if (!('ambiguo' in primeira)) return primeira;

  if (__DEV__) console.warn('[voz:diag] resposta ambigua, tentando de novo');
  const segunda = await tentarUmaVez(url, token, uri, opts, deadline);
  if ('ambiguo' in segunda) return { ok: false, codigo: 'erro_interno' };
  return segunda;
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
        texto: 'Sua sessão expirou. Nada foi lançado e esta gravação não foi guardada sem uma conta identificada. Entre na conta e grave novamente.',
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
