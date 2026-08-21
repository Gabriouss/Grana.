import { addMonthsToISO } from '@/lib/format';
import type { Transaction } from '@/lib/types';

/* Recorrência de lançamentos ("repete a cada mês").
 *
 * Antes disto, `transactions.recurring` era decorativo: marcava a linha com
 * um "· recorrente" na lista e nada mais. Ninguém gerava o lançamento do mês
 * seguinte, então o toggle prometia uma coisa e não fazia — Contas tinha
 * recorrência de verdade, Lançamentos e Crédito não.
 *
 * O modelo é o mesmo já usado por compra parcelada: uma série é uma transação
 * "cabeça" (recurring, sem parent_id) e as ocorrências seguintes apontam pra
 * ela via parent_id. A diferença é que parcelamento nasce inteiro e fechado
 * (3x vira 3 linhas na hora), enquanto recorrência é aberta — não se sabe
 * quantos meses vão existir, então as ocorrências aparecem conforme o tempo
 * passa.
 *
 * Geração é "catch-up" e idempotente: a cada carregamento pergunta-se quais
 * meses entre a cabeça e hoje estão sem ocorrência, e só esses são criados.
 * Quem ficou três meses sem abrir o app recebe os três de uma vez; quem abre
 * a tela cinco vezes no mesmo dia não gera nada nas quatro últimas. Por isso
 * a decisão de quais criar é esta função pura, separada da escrita no banco:
 * dá pra testar a regra sem tocar em Supabase.
 */

export type OcorrenciaFaltante = {
  /** Transação-cabeça que originou a série. */
  cabeca: Transaction;
  /** Data da ocorrência que falta, já com o dia ajustado ao mês. */
  occurred_on: string;
};

/** Teto de meses gerados de uma vez, por série.
 *
 * Sem isto, uma assinatura criada em 2024 e reaberta hoje despejaria dezenas
 * de lançamentos retroativos de uma vez, bagunçando faturas antigas já
 * fechadas. Dois anos cobre qualquer ausência plausível do app. */
const MAX_MESES_RETROATIVOS = 24;

function chaveMes(iso: string): string {
  return iso.slice(0, 7); // 'YYYY-MM'
}

/** Quantos meses de `de` até `ate`, contando só ano/mês. */
function mesesEntre(de: string, ate: string): number {
  const [ay, am] = de.split('-').map(Number);
  const [by, bm] = ate.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Lista as ocorrências que precisam existir e ainda não existem.
 *
 * Uma série é considerada ativa enquanto a cabeça continuar com `recurring`
 * verdadeiro — desmarcar a recorrência (ou apagar a cabeça) simplesmente para
 * de gerar, sem mexer no que já foi lançado.
 */
export function ocorrenciasFaltantes(transactions: Transaction[], hojeISO: string): OcorrenciaFaltante[] {
  /* Cabeças de série. Parcelamento também usa parent_id, então
     `installment_total > 1` é o que separa os dois: uma compra em 3x não é
     uma assinatura, mesmo que alguém marque o campo por engano. */
  const cabecas = transactions.filter(
    (t) => t.recurring && !t.parent_id && !(t.installment_total && t.installment_total > 1)
  );
  if (cabecas.length === 0) return [];

  /* Meses já ocupados por série, incluindo a própria cabeça — é o que torna a
     geração idempotente. */
  const mesesPorSerie = new Map<string, Set<string>>();
  for (const t of transactions) {
    const serie = t.parent_id ?? t.id;
    let meses = mesesPorSerie.get(serie);
    if (!meses) {
      meses = new Set();
      mesesPorSerie.set(serie, meses);
    }
    meses.add(chaveMes(t.occurred_on));
  }

  const faltantes: OcorrenciaFaltante[] = [];
  for (const cabeca of cabecas) {
    const ocupados = mesesPorSerie.get(cabeca.id) ?? new Set<string>();
    const total = mesesEntre(cabeca.occurred_on, hojeISO);
    if (total <= 0) continue; // série começa no mês corrente ou no futuro

    const primeiro = Math.max(1, total - MAX_MESES_RETROATIVOS + 1);
    for (let i = primeiro; i <= total; i++) {
      const data = addMonthsToISO(cabeca.occurred_on, i);
      if (ocupados.has(chaveMes(data))) continue;
      faltantes.push({ cabeca, occurred_on: data });
    }
  }

  return faltantes;
}
