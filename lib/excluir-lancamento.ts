import { Alert } from './alert';
import type { Transaction } from './types';

/**
 * A pergunta que vem antes de apagar um lançamento, a MESMA em todas as telas.
 *
 * Até 19/09/2026 a tela de Crédito perguntava ("Remover ...?") e a de
 * Lançamentos apagava no primeiro toque, sem confirmação e sem desfazer. Era o
 * mesmo objeto, com duas regras diferentes. E numa compra parcelada as duas só
 * sabiam apagar a parcela tocada, deixando as outras cobrando.
 *
 * Quem chama decide COMO apagar (conta real, modo de exemplo); aqui só se
 * decide o que perguntar e qual ação cada resposta dispara.
 */
export function confirmarExclusaoDeLancamento(
  tx: Pick<Transaction, 'description' | 'installment_total'>,
  acoes: {
    apagarEste: () => void;
    /** Só oferecida quando o lançamento é parcela de uma compra parcelada. */
    apagarCompraInteira?: () => void;
  }
): void {
  const parcelas = tx.installment_total ?? 1;
  if (parcelas > 1 && acoes.apagarCompraInteira) {
    Alert.alert(
      'Excluir compra parcelada',
      `"${tx.description}" faz parte de uma compra em ${parcelas}x. Apagar só esta parcela mantém as outras.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Só esta parcela', onPress: acoes.apagarEste },
        { text: 'A compra inteira', style: 'destructive', onPress: acoes.apagarCompraInteira },
      ]
    );
    return;
  }
  Alert.alert('Excluir lançamento', `Remover "${tx.description}"?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: acoes.apagarEste },
  ]);
}
