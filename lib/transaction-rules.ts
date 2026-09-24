import type { Transaction } from './types';

/**
 * Lançamento no crédito nunca grava sem cartão (decisão do autor,
 * 23/09/2026: "o lançamento não é feito até que isso ocorra"). Vale para toda
 * entrada. A tela pede o cartão antes; esta é a guarda da camada de dados,
 * porque o gatilho do banco (Harbor, 230400) só olha INSERT e uma edição que
 * tirasse o cartão passaria por lá.
 */
export const MENSAGEM_CREDITO_SEM_CARTAO = 'Lançamento no crédito precisa de um cartão. Escolha o cartão e tente de novo.';

export function creditoSemCartao(t: { payment_method?: string | null; card_id?: string | null }): boolean {
  return t.payment_method === 'credit' && !t.card_id;
}

/** Edição que apagaria o cartão de um lançamento que continua (ou passa a ser) crédito. */
export function edicaoTiraCartaoDoCredito(changes: { payment_method?: string | null; card_id?: string | null }): boolean {
  if (creditoSemCartao(changes)) return true;
  return 'card_id' in changes && !changes.card_id && (changes.payment_method === undefined || changes.payment_method === 'credit');
}

export function exigirCartaoNoCredito(t: { payment_method?: string | null; card_id?: string | null }): void {
  if (creditoSemCartao(t)) throw new Error(MENSAGEM_CREDITO_SEM_CARTAO);
}

/** Crédito só afeta o caixa quando a fatura é paga. */
export function isCreditTx(t: Pick<Transaction, 'payment_method' | 'card_id'>): boolean {
  return t.payment_method === 'credit' || !!t.card_id;
}
