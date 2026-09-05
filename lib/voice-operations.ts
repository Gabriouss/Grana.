import { supabase } from './supabase';
import { notificarDadosDosWidgetsAlterados } from './widgets-home-events';

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
  status: 'committed' | 'undone';
  operationId: string;
  kind: PayloadOperacaoVoz['kind'];
  ids: string[];
  replayed: boolean;
};

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
  const { kind, ...dados } = payload;
  const { data, error } = await supabase.rpc('registrar_operacao_voz', {
    p_request_id: requestId,
    p_source: source,
    p_kind: kind,
    p_payload: dados,
  });
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
