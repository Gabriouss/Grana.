import { Alert } from './alerta';
import type { Bill, Transaction } from './types';

/**
 * O que se sabe, antes de perguntar, sobre a conta que este lançamento paga.
 *
 * Apagar a saída que pagou uma conta faz a conta voltar a ficar em aberto: é o
 * gatilho `A0_reabrir_conta_da_saida_apagada` do servidor (20261002160000), e
 * a pergunta antes de apagar não dizia isso (L1, 08/10/2026). A conta se acha
 * por `bills.paid_transaction_id`, nunca pela descrição, que a pessoa edita.
 */
export type ContaPagaPeloLancamento =
  | { estado: 'nenhuma' }
  | { estado: 'conta'; descricao: string }
  /** A consulta falhou ou não respondeu: a pergunta avisa da dúvida. */
  | { estado: 'nao_conferido' };

/** É o toque em "Excluir" que espera por esta consulta. */
export const PRAZO_CONFERIR_CONTA_MS = 5_000;

export async function conferirContaPaga(
  tx: Pick<Transaction, 'id' | 'type'> & Partial<Pick<Transaction, 'card_id'>>,
  buscarContasPagas: () => Promise<Pick<Bill, 'description' | 'paid_transaction_id'>[]>
): Promise<ContaPagaPeloLancamento> {
  /* pagar_conta grava uma saída sem cartão. Entrada e compra no cartão nunca
     pagam conta, e não vale gastar uma consulta com elas. */
  if (tx.type !== 'out' || tx.card_id) return { estado: 'nenhuma' };
  let corte: ReturnType<typeof setTimeout> | undefined;
  try {
    const pedido = buscarContasPagas();
    pedido.catch(() => {});
    const contas = await Promise.race([
      pedido,
      new Promise<never>((_, rejeitar) => {
        corte = setTimeout(() => rejeitar(new Error('a consulta de contas não respondeu no prazo')), PRAZO_CONFERIR_CONTA_MS);
      }),
    ]);
    const conta = contas.find((c) => c.paid_transaction_id === tx.id);
    return conta ? { estado: 'conta', descricao: conta.description } : { estado: 'nenhuma' };
  } catch (e) {
    /* Não vira "nenhuma" em silêncio: a conta reabriria sem a pessoa saber. */
    console.error('[excluir] não deu para conferir se o lançamento paga uma conta', e);
    return { estado: 'nao_conferido' };
  } finally {
    clearTimeout(corte);
  }
}

function avisoDaConta(conta?: ContaPagaPeloLancamento): string {
  if (conta?.estado === 'conta') return `\n\nEste lançamento é o pagamento da conta "${conta.descricao}". Apagar faz essa conta voltar a ficar em aberto em Contas.`;
  if (conta?.estado === 'nao_conferido') return '\n\nNão deu para conferir se este lançamento paga alguma conta. Se pagar, apagar faz a conta voltar a ficar em aberto em Contas.';
  return '';
}

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
    /** Só oferecida quando o lançamento é a ocorrência de uma série mensal:
        apaga este e os dos meses seguintes e encerra a repetição. */
    encerrarSerie?: () => void;
  },
  /* Conferida antes por `conferirContaPaga`. O aviso vai em TODOS os ramos:
     um pagamento que também é ocorrência de série não pode perdê-lo. */
  conta?: ContaPagaPeloLancamento
): void {
  const aviso = avisoDaConta(conta);
  const parcelas = tx.installment_total ?? 1;
  if (parcelas > 1 && acoes.apagarCompraInteira) {
    Alert.alert(
      'Excluir compra parcelada',
      `"${tx.description}" faz parte de uma compra em ${parcelas}x. Apagar só esta parcela mantém as outras.${aviso}`,
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

  /* Quem apaga o lançamento de uma assinatura quase sempre quer ENCERRAR a
     assinatura, e não pular um mês. O autor disse isso em 01/10/2026: "A
     intenção é encerrar de vez, os lançamentos passados permanecem". Com uma
     opção só ("apagar este mês"), o lançamento voltava no mês seguinte e a
     pessoa não tinha como saber que o interruptor da série mora na origem,
     lá no primeiro mês. As duas saídas ficam lado a lado, como já acontece
     com a compra parcelada.

     O texto não afirma que a série ainda está ativa: esta mesma pergunta
     aparece para os lançamentos antigos de uma série já encerrada, e para
     eles "a repetição continua" seria falso. */
  if (ehOcorrencia && acoes.encerrarSerie) {
    Alert.alert(
      'Excluir lançamento que se repete',
      `"${tx.description}" faz parte de uma série mensal. Apague só o deste mês, ou este e os próximos: aí a repetição é encerrada e os meses anteriores ficam como estão.${aviso}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Só este mês', onPress: acoes.apagarEste },
        { text: 'Este e os próximos', style: 'destructive', onPress: acoes.encerrarSerie },
      ]
    );
    return;
  }
  if (ehOcorrencia || ehOrigem) {
    Alert.alert(
      ehOrigem ? 'Excluir a série inteira' : 'Excluir só este mês',
      ehOrigem
        /* Para a origem, "este e os próximos" É a série inteira: não existe
           mês anterior a ela. O que a pessoa pode não saber é que dá para
           parar de repetir sem apagar nada, e a pergunta diz onde. */
        ? `"${tx.description}" é o primeiro lançamento de uma série que se repete todo mês. Apagar este remove também os dos meses seguintes. Para só parar de repetir, sem apagar nada, edite este lançamento e desligue a repetição.${aviso}`
        : `"${tx.description}" faz parte de uma série mensal. Apagar remove só o lançamento deste mês; os dos outros meses continuam.${aviso}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: ehOrigem ? 'Excluir a série' : 'Excluir este mês', style: 'destructive', onPress: acoes.apagarEste },
      ]
    );
    return;
  }
  Alert.alert(conta?.estado === 'conta' ? 'Excluir pagamento de conta' : 'Excluir lançamento', `Remover "${tx.description}"?${aviso}`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: acoes.apagarEste },
  ]);
}
