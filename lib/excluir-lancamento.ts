import { Alert } from './alerta';
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
  tx: Pick<Transaction, 'description' | 'installment_total'> & Partial<Pick<Transaction, 'recurring' | 'parent_id'>>,
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
  /* Lançamento que se repete todo mês: o que "excluir" faz depende de QUAL
     linha da série é esta, e a pergunta antiga ("Remover X?") era a mesma
     para as duas. A ocorrência de um mês sai sozinha. Já a ORIGEM da série
     leva junto todos os outros meses, porque `parent_id` é
     `on delete cascade` — e isso acontecia sem uma palavra de aviso. */
  /* A ocorrência se reconhece pelo `parent_id`, e não pelo `recurring` dela:
     quem desmarca "repetir" numa ocorrência não encerra a série (isso é da
     origem), e ela continua sendo recriada se for apagada sem o mês marcado.
     É a mesma condição do gatilho do banco. */
  const ehOcorrencia = !!tx.parent_id && parcelas <= 1;
  const ehOrigem = !tx.parent_id && !!tx.recurring && parcelas <= 1;
  if (ehOcorrencia || ehOrigem) {
    Alert.alert(
      ehOrigem ? 'Excluir a série inteira' : 'Excluir só este mês',
      ehOrigem
        ? `"${tx.description}" é o primeiro lançamento de uma série que se repete todo mês. Apagar este remove também os dos outros meses e encerra a repetição.`
        : `"${tx.description}" se repete todo mês. Apagar remove só o deste mês; os outros continuam e a repetição segue nos próximos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: ehOrigem ? 'Excluir a série' : 'Excluir este mês', style: 'destructive', onPress: acoes.apagarEste },
      ]
    );
    return;
  }
  Alert.alert('Excluir lançamento', `Remover "${tx.description}"?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: acoes.apagarEste },
  ]);
}
