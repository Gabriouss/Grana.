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
    /** Só oferecida quando o lançamento é a ocorrência de uma série mensal:
        apaga este e os dos meses seguintes e encerra a repetição. */
    encerrarSerie?: () => void;
  },
  /** `mesesDaSerie`: quantos lançamentos de outros meses saem junto com este
      (`contarMesesDaSerie`, lib/data.ts). Sem ele a origem ENCERRADA parece
      um lançamento avulso. */
  opcoes?: { mesesDaSerie?: number }
): void {
  const parcelas = tx.installment_total ?? 1;
  const mesesDaSerie = opcoes?.mesesDaSerie ?? 0;
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
      `"${tx.description}" faz parte de uma série mensal. Apague só o deste mês, ou este e os próximos: aí a repetição é encerrada e os meses anteriores ficam como estão.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Só este mês', onPress: acoes.apagarEste },
        { text: 'Este e os próximos', style: 'destructive', onPress: acoes.encerrarSerie },
      ]
    );
    return;
  }
  /* Origem que parou de repetir (`recurring = false`) mas ainda tem meses
     ligados a ela. Apagar leva todos eles, inclusive os que "Este e os
     próximos" tinha mantido de propósito, e a pergunta simples não dizia nada.
     O texto descreve o `on delete cascade` de hoje: se o banco passar a
     soltar as filhas ao apagar a origem (migration
     20261001140000_origem_encerrada_solta_filhas), este aviso fica falso e
     deve sair junto. */
  if (!tx.parent_id && !tx.recurring && parcelas <= 1 && mesesDaSerie > 0) {
    Alert.alert(
      'Excluir a série inteira',
      `"${tx.description}" é o primeiro lançamento de uma série que já parou de repetir, e ${
        mesesDaSerie === 1 ? 'há 1 lançamento' : `há ${mesesDaSerie} lançamentos`
      } de outros meses ligados a ele. Apagar este remove também ${
        mesesDaSerie === 1 ? 'esse lançamento' : 'todos eles'
      }, inclusive os de meses que já passaram.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir a série', style: 'destructive', onPress: acoes.apagarEste },
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
        ? `"${tx.description}" é o primeiro lançamento de uma série que se repete todo mês. Apagar este remove também os dos meses seguintes. Para só parar de repetir, sem apagar nada, edite este lançamento e desligue a repetição.`
        : `"${tx.description}" faz parte de uma série mensal. Apagar remove só o lançamento deste mês; os dos outros meses continuam.`,
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
