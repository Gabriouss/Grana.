import type { CreditCard, PaymentMethod, Wallet } from './types';
import type { PendingInput } from './fila-pendente';

/**
 * O lançamento que a foto da nota grava, a partir do que está na tela de
 * confirmação. Pura, para os testes conferirem a decisão sem câmera.
 *
 * Crédito segue a regra do app inteiro: compra no cartão fica fora do caixa e
 * entra na fatura (regra 20), então grava `payment_method: 'credit'` com
 * `card_id` e o `bank` do cartão, igual à compra lançada na tela Crédito, e
 * vai pelo mesmo `salvarOuGuardarNoAparelho` (fila offline e idempotência).
 * Crédito sem cartão é recusado aqui, antes de chegar a `exigirCartaoNoCredito`.
 * Débito, Pix e dinheiro são saída de caixa da carteira escolhida.
 *
 * Até 26/09/2026 a foto gravava sempre saída de caixa na carteira ativa, sem
 * forma de pagamento: uma compra no crédito fotografada descontava do "Livre
 * para gastar" na hora e de novo quando a fatura era paga.
 */
export type CamposDaConfirmacao = {
  valor: number;
  descricao: string;
  categoria: { name: string; color: string };
  data: string;
  pagamento: PaymentMethod | null;
  cartao: CreditCard | null;
  carteiraAtiva: string | 'total' | null;
  carteiras: Pick<Wallet, 'id' | 'is_default'>[];
};

export type LancamentoDaFoto =
  | { ok: true; input: PendingInput }
  | { ok: false; motivo: 'sem_pagamento' | 'sem_cartao' };

function carteiraDoCaixa(c: CamposDaConfirmacao): string | null {
  if (c.carteiraAtiva && c.carteiraAtiva !== 'total') return c.carteiraAtiva;
  return c.carteiras.find((w) => w.is_default)?.id ?? c.carteiras[0]?.id ?? null;
}

export function montarLancamentoDaFoto(c: CamposDaConfirmacao): LancamentoDaFoto {
  if (!c.pagamento) return { ok: false, motivo: 'sem_pagamento' };
  const base = {
    type: 'out' as const,
    description: c.descricao.trim() || 'Compra',
    amount: c.valor,
    category: c.categoria.name,
    color: c.categoria.color,
    occurred_on: c.data,
  };
  if (c.pagamento === 'credit') {
    if (!c.cartao) return { ok: false, motivo: 'sem_cartao' };
    return {
      ok: true,
      input: {
        ...base,
        payment_method: 'credit',
        bank: c.cartao.bank || 'outro',
        card_id: c.cartao.id,
        wallet_id: c.cartao.wallet_id ?? carteiraDoCaixa(c),
      },
    };
  }
  return { ok: true, input: { ...base, payment_method: c.pagamento, wallet_id: carteiraDoCaixa(c) } };
}

/** O cartão que já vem escolhido: com um cartão só, ele; com vários ou nenhum, a pessoa decide. */
export function cartaoPadrao(cartoes: CreditCard[]): CreditCard | null {
  return cartoes.length === 1 ? cartoes[0] : null;
}
