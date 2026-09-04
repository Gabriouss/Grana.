import type { Transaction } from './types';

/** Crédito só afeta o caixa quando a fatura é paga. */
export function isCreditTx(t: Pick<Transaction, 'payment_method' | 'card_id'>): boolean {
  return t.payment_method === 'credit' || !!t.card_id;
}
