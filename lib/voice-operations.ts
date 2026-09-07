import { supabase } from './supabase';
import { notificarDadosDosWidgetsAlterados } from './widgets-home-events';
import AsyncStorage from '@react-native-async-storage/async-storage';

type BaseFinanceira = {
  description: string;
  amount: number;
  category: string;
  color: string;
  recurring?: boolean;
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

export async function listarOperacoesVozLocais(): Promise<{ requestId: string; payload: PayloadOperacaoVoz }[]> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return [];
  const prefixo = `grana:voz:operacao:${data.session.user.id}:`;
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
  payload: PayloadOperacaoVoz
): Promise<ResultadoOperacaoVoz> {
  const { data: sessao } = await supabase.auth.getSession();
  const userId = sessao.session?.user.id;
  if (!userId) throw new Error('Entre na conta para salvar o lançamento.');
  const chave = `grana:voz:operacao:${userId}:${requestId}`;
  const existente = await AsyncStorage.getItem(chave);
  const operacao = existente ? JSON.parse(existente) : { requestId, source, payload };
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
    if (/^(22|23|42501)/.test(codigo)) {
      await AsyncStorage.removeItem(chave);
      throw erro;
    }
    return { status: 'pending', operationId: requestId, kind: payload.kind, ids: [], replayed: false };
  }
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
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return { sincronizadas, falhas: 1 };
    const chaves = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(`grana:voz:operacao:${userId}:`));
    for (const chave of chaves) {
      const raw = await AsyncStorage.getItem(chave);
      if (!raw) continue;
      try {
        const item = JSON.parse(raw);
        const atual = await supabase.auth.getSession();
        if (atual.data.session?.user.id !== userId) break;
        await enviarOperacaoVoz(item.requestId, item.source, item.payload);
        await AsyncStorage.removeItem(chave);
        notificarDadosDosWidgetsAlterados();
        sincronizadas++;
      } catch (erro) {
        // Uma operação inválida não pode impedir as demais de serem tentadas.
        falhas++;
        const codigo = String((erro as { code?: string })?.code ?? '');
        const texto = String((erro as { message?: string })?.message ?? erro);
        mensagem = /^(42501|PGRST30)/.test(codigo)
          ? 'Não foi possível autorizar o envio. Confira sua sessão e o acesso à conta.'
          : /network|failed to fetch|fetch failed|socket|dns/i.test(texto)
            ? 'Sem conexão com o serviço. O lançamento continua salvo no aparelho.'
            : 'O serviço não confirmou o lançamento. Ele continua salvo no aparelho.';
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
