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

/**
 * O Grana. não registra entrada em cartão (decisão do autor, 26/09/2026:
 * "Não é para ter entrada de crédito no cartão"). Devolução inteira se
 * resolve excluindo a compra original. Vale para toda criação de lançamento;
 * linhas antigas desse tipo que já estão no banco não são tocadas aqui.
 *
 * O erro sai com `code: '23514'` (a classe de recusa por regra do Postgres)
 * para a fila offline tratá-lo como permanente: um item assim guardado antes
 * desta regra vai para "precisa de revisão" em vez de ser retentado para
 * sempre.
 */
export const MENSAGEM_ENTRADA_NO_CARTAO =
  'O Grana. não registra entrada em cartão. Se a compra foi devolvida inteira, exclua a compra original; se foi só uma parte, corrija o valor dela.';

export function entradaNoCartao(t: { type?: string | null; payment_method?: string | null; card_id?: string | null }): boolean {
  return t.type === 'in' && (t.payment_method === 'credit' || !!t.card_id);
}

export function recusarEntradaNoCartao(t: { type?: string | null; payment_method?: string | null; card_id?: string | null }): void {
  if (!entradaNoCartao(t)) return;
  const erro = new Error(MENSAGEM_ENTRADA_NO_CARTAO) as Error & { code: string };
  erro.code = '23514';
  throw erro;
}

/** Recibo da importação de fatura: quantas linhas de entrada ficaram de fora, e o que fazer. */
export function avisoEntradasNoCartaoRecusadas(quantas: number): string {
  if (quantas <= 0) return '';
  const linhas = quantas === 1
    ? '1 linha de entrada no cartão não foi importada'
    : `${quantas} linhas de entrada no cartão não foram importadas`;
  return `${linhas}, porque o Grana. não registra entrada em cartão. Se alguma for a devolução de uma compra inteira, exclua a compra original; se foi só uma parte, corrija o valor dela.`;
}

/** Crédito só afeta o caixa quando a fatura é paga. */
export function isCreditTx(t: Pick<Transaction, 'payment_method' | 'card_id'>): boolean {
  return t.payment_method === 'credit' || !!t.card_id;
}
