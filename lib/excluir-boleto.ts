import type { Bill } from './types';

/**
 * O texto da confirmação "Excluir boleto?".
 *
 * Apagar a primeira conta de uma série NÃO leva as outras: o banco promove a
 * conta seguinte a cabeça da série (gatilho `A0_promover_proxima_conta_da_serie`,
 * migration 20261002120000). Até 02/10/2026 `bills.parent_id` em cascata levava
 * a série inteira, e este texto avisava quantas sairiam; com o gatilho o aviso
 * ficou falso e saiu. Não traga o aviso de volta sem conferir o banco.
 */
export function mensagemExcluirBoleto(bill: Pick<Bill, 'description' | 'status'>): string {
  return `Remover “${bill.description}”? ${bill.status === 'paid'
    ? 'A saída já lançada quando ele foi pago continua em Lançamentos.'
    : 'Os lembretes de vencimento dele também saem.'}`;
}
