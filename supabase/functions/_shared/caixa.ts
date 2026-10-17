/**
 * Regra de caixa do Grana., do lado do servidor.
 *
 * Compra no crédito não sai do caixa quando acontece: sai quando a fatura é
 * paga, e o pagamento da fatura é um lançamento `out` SEM cartão
 * (`pagar_fatura_cartao`). Somar a compra E o pagamento contaria o mesmo
 * dinheiro duas vezes, que é o que o Granabô fazia no "quanto gastei em
 * alimentação" (S43/A46, 23/09/2026) enquanto Início e Gráficos excluíam.
 *
 * Cópia exata de `isCreditTx` em `lib/transaction-rules.ts` (o Deno não
 * importa de `lib/`); `__tests__/granabo-caixa-sem-credito.cjs` trava a
 * paridade. `card_id` sozinho basta: lançamento antigo pode ter cartão com
 * `payment_method` nulo. Entrada no cartão não existe no Grana. (decisão do
 * autor, 26/09/2026; o banco recusa pela migration 20260926130000).
 */
export function ehCompraNoCredito(t: { payment_method?: string | null; card_id?: string | null }): boolean {
  return t.payment_method === 'credit' || !!t.card_id;
}

export { calcularLivre as calcularLivreParaGastar } from './livre-para-gastar.ts';
export type LivreParaGastar = ReturnType<typeof import('./livre-para-gastar.ts').calcularLivre>;

export function rotuloDiasRestantes(dias: number): string {
  return dias === 1 ? '1 dia restante' : `${dias} dias restantes`;
}
