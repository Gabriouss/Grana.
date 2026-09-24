import { supabase } from './supabase';
import { idDoUsuarioLocal } from './sessao-offline';
import { notificarDadosDosWidgetsAlterados } from './widgets-home-events';
import AsyncStorage from '@react-native-async-storage/async-storage';

type BaseFinanceira = {
  description: string;
  amount: number;
  category: string;
  color: string;
  recurring?: boolean;
  wallet_id: string;
};

export type PayloadOperacaoVoz =
  | (BaseFinanceira & {
      kind: 'bill';
      due_date: string;
    })
  | (BaseFinanceira & {
      kind: 'transaction';
      type: 'in' | 'out';
      occurred_on: string;
      payment_method?: string | null;
      card_id?: string | null;
    })
  | (BaseFinanceira & {
      kind: 'installment';
      type: 'out';
      occurred_on: string;
      installments: number;
      payment_method: 'credit';
      card_id: string;
    });

export type ResultadoOperacaoVoz = {
  status: 'committed' | 'undone' | 'pending';
  operationId: string;
  kind: PayloadOperacaoVoz['kind'];
  ids: string[];
  replayed: boolean;
};

/**
 * Recusa do servidor para crédito sem cartão (contrato do Harbor, 23/09/2026:
 * `registrar_operacao_voz` levanta 23514 com hint `cartao_obrigatorio`).
 * O cliente já não manda crédito sem cartão; isto é a rede de proteção. A
 * fala vai para REVISÃO, onde a pessoa escolhe o cartão e o reenvio sai com
 * outro request_id (o payload muda, e o id antigo seria um replay).
 */
export function ehRecusaCartaoObrigatorio(erro: unknown): boolean {
  const e = erro as { code?: unknown; hint?: unknown } | null;
  return String(e?.code ?? '') === '23514' && e?.hint === 'cartao_obrigatorio';
}

/** Texto para a revisão quando a fila local não guardou a transcrição. */
function textoParaRevisao(item: { transcricao?: string; payload: PayloadOperacaoVoz }): string {
  if (item.transcricao) return item.transcricao;
  const valor = String(item.payload.amount).replace('.', ',');
  return `${item.payload.description} ${valor} reais no crédito`;
}

export async function listarOperacoesVozLocais(): Promise<{ requestId: string; payload: PayloadOperacaoVoz }[]> {
  const userId = await idDoUsuarioLocal();
  if (!userId) return [];
  const prefixo = `grana:voz:operacao:${userId}:`;
  const chaves = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefixo));
  const itens = await AsyncStorage.multiGet(chaves);
  return itens.filter(([, raw]) => !!raw).map(([, raw]) => JSON.parse(raw!));
}

function textoObrigatorio(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor) throw new Error(`Resposta invalida: ${campo}`);
  return valor;
}

/**
 * Persiste a fala e o recibo na mesma transacao do banco. Repetir requestId
 * devolve o primeiro resultado; inclusive depois de desfazer, quando o
 * tombstone `undone` impede a fala antiga de reaparecer.
 */
export async function registrarOperacaoVoz(
  requestId: string,
  source: 'app' | 'widget',
  payload: PayloadOperacaoVoz,
  transcricao?: string
): Promise<ResultadoOperacaoVoz> {
  /* Pelo aparelho, e não pela rede. Este id só nomeia a chave local em que a
     fala fica guardada até o envio — e era aqui que a fila offline morria: com
     o token vencido, `getSession()` devolvia vazio e esta linha recusava
     GRAVAR o lançamento, exatamente na situação em que a fila existe para
     servir. O envio logo abaixo continua exigindo credencial válida. */
  const userId = await idDoUsuarioLocal();
  if (!userId) throw new Error('Entre na conta para salvar o lançamento.');
  const chave = `grana:voz:operacao:${userId}:${requestId}`;
  const existente = await AsyncStorage.getItem(chave);
  const operacao = existente ? JSON.parse(existente) : { requestId, source, payload, ...(transcricao ? { transcricao } : null) };
  // Persiste ANTES da rede. O payload original permanece igual em toda retomada.
  await AsyncStorage.setItem(chave, JSON.stringify(operacao));
  notificarDadosDosWidgetsAlterados();
  try {
    const resultado = await enviarOperacaoVoz(operacao.requestId, operacao.source, operacao.payload);
    await AsyncStorage.removeItem(chave);
    notificarDadosDosWidgetsAlterados();
    return resultado;
  } catch (erro) {
    const codigo = String((erro as { code?: string })?.code ?? '');
    // Recusa definitiva não pode reaparecer silenciosamente numa sincronização.
    /* Objeto ausente no servidor — PGRST202, PGRST205, 42883, 42P01 — NAO
       entra aqui, e a tentativa de incluí-lo em 11/09/2026 foi revertida.
       Esses códigos dizem que a migration não foi aplicada: problema de
       deploy, não recusa do lançamento. Descartar ali apagaria a fala da
       pessoa por um erro nosso, e contradiz o que `explicarFalhaDeEnvio`
       promete na tela: "Nada foi perdido". Eles seguem pendentes, com a
       mensagem dizendo que não se resolve sozinho. */
    if (/^(22|23|42501)/.test(codigo)) {
      await AsyncStorage.removeItem(chave);
      throw erro;
    }
    return { status: 'pending', operationId: requestId, kind: payload.kind, ids: [], replayed: false };
  }
}

/**
 * Traduz a falha de envio na frase que a pessoa lê.
 *
 * A distinção que importa é entre "espere" e "isto não vai se resolver
 * sozinho". Em 07/09/2026 a migration das operações de voz não estava
 * aplicada em produção: a RPC não existia, o PostgREST devolvia `PGRST202` a
 * cada tentativa, e como esse caso caía no texto genérico de "continua salvo
 * no aparelho", uma feature inteira fora do ar ficou dois dias parecendo
 * instabilidade de rede. Objeto ausente no servidor não é fila de espera — é
 * chamado para o suporte.
 */
function explicarFalhaDeEnvio(erro: unknown): string {
  if (ehRecusaCartaoObrigatorio(erro)) {
    return 'Um lançamento no crédito ficou sem cartão e não foi salvo. Abra a revisão para escolher o cartão.';
  }
  const codigo = String((erro as { code?: string })?.code ?? '');
  const texto = String((erro as { message?: string })?.message ?? erro);
  // PGRST202/PGRST205: função ou tabela fora do cache de esquema.
  // 42883/42P01: os equivalentes do próprio Postgres.
  if (/^(PGRST202|PGRST205|42883|42P01)/.test(codigo)) {
    return 'O serviço não reconhece o lançamento por voz. Nada foi perdido, mas isso não se resolve sozinho: avise o suporte.';
  }
  if (/^(42501|PGRST30)/.test(codigo)) {
    return 'Não foi possível autorizar o envio. Confira sua sessão e o acesso à conta.';
  }
  if (/network|failed to fetch|fetch failed|socket|dns/i.test(texto)) {
    return 'Sem conexão com o serviço. O lançamento continua salvo no aparelho.';
  }
  return 'O serviço não confirmou o lançamento. Ele continua salvo no aparelho.';
}

type ResumoSync = { sincronizadas: number; falhas: number; mensagem?: string };
let sincronizacao: Promise<ResumoSync> | null = null;
export function sincronizarOperacoesVoz(): Promise<ResumoSync> {
  if (!sincronizacao) sincronizacao = executarSincronizacao().finally(() => { sincronizacao = null; });
  return sincronizacao;
}
async function executarSincronizacao(): Promise<ResumoSync> {
  let sincronizadas = 0;
  let falhas = 0;
  let mensagem: string | undefined;
    const userId = await idDoUsuarioLocal();
    if (!userId) return { sincronizadas, falhas: 1 };
    const chaves = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(`grana:voz:operacao:${userId}:`));
    for (const chave of chaves) {
      const raw = await AsyncStorage.getItem(chave);
      if (!raw) continue;
      try {
        const item = JSON.parse(raw);
        /* Guarda de troca de conta no meio da fila: se o dono mudou, para. Lê
           pelo aparelho para não confundir "trocou de conta" com "o token
           venceu e não há rede" — o segundo caso deve seguir tentando. */
        if ((await idDoUsuarioLocal()) !== userId) break;
        try {
          await enviarOperacaoVoz(item.requestId, item.source, item.payload);
        } catch (erro) {
          if (!ehRecusaCartaoObrigatorio(erro)) throw erro;
          /* Crédito sem cartão nunca grava. A fala vira revisão, e só sai da
             fila depois que a notificação de revisão foi publicada: se ela
             falhar, o item fica e a próxima sincronização tenta de novo. */
          const { notificarRevisao } = await import('./widget-voz-notificacoes');
          await notificarRevisao('Qual cartão?', textoParaRevisao(item));
          await AsyncStorage.removeItem(chave);
          notificarDadosDosWidgetsAlterados();
          falhas++;
          mensagem = explicarFalhaDeEnvio(erro);
          continue;
        }
        await AsyncStorage.removeItem(chave);
        notificarDadosDosWidgetsAlterados();
        sincronizadas++;
      } catch (erro) {
        // Uma operação inválida não pode impedir as demais de serem tentadas.
        falhas++;
        mensagem = explicarFalhaDeEnvio(erro);
      }
    }
  return { sincronizadas, falhas, mensagem };
}

async function enviarOperacaoVoz(requestId: string, source: 'app' | 'widget', payload: PayloadOperacaoVoz): Promise<ResultadoOperacaoVoz> {
  const { kind, ...dados } = payload;
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 15_000);
  try {
  const { data, error } = await supabase.rpc('registrar_operacao_voz', {
    p_request_id: requestId,
    p_source: source,
    p_kind: kind,
    p_payload: dados,
  }).abortSignal(controle.signal);
  if (controle.signal.aborted) throw new Error('timeout ao sincronizar lançamento');
  if (error) throw error;

  const resposta = data as Record<string, unknown> | null;
  const status = resposta?.status;
  if (status !== 'committed' && status !== 'undone') {
    throw new Error('Resposta invalida ao registrar operacao de voz');
  }
  const ids = resposta?.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new Error('Resposta invalida: ids');
  }

  const resultado: ResultadoOperacaoVoz = {
    status,
    operationId: textoObrigatorio(resposta?.operation_id, 'operation_id'),
    kind,
    ids,
    replayed: resposta?.replayed === true,
  };
  if (status === 'committed' && !resultado.replayed) notificarDadosDosWidgetsAlterados();
  return resultado;
  } finally { clearTimeout(prazo); }
}

/** Desfaz conta, compra ou todas as parcelas de uma vez, de forma idempotente. */
export async function desfazerOperacaoVoz(operationId: string): Promise<void> {
  const { data, error } = await supabase.rpc('desfazer_operacao_voz', {
    p_operation_id: operationId,
  });
  if (error) throw error;
  if ((data as { status?: unknown } | null)?.status !== 'undone') {
    throw new Error('Resposta invalida ao desfazer operacao de voz');
  }
  notificarDadosDosWidgetsAlterados();
}
