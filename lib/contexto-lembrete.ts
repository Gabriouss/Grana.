import { calculateStreakAndWeek } from './gamification';
import { isoLocal } from './format';
import type { Transaction } from './types';

export type ContextoLembrete = {
  jaLancouHoje: boolean;
  streak: number;
  diasInativo: number;
};

/**
 * Estado da pessoa que escolhe o lembrete de hábito local: se já lançou hoje,
 * a sequência e há quantos dias não lança.
 *
 * Até 24/09/2026 a Início, o Perfil e o `_layout` calculavam isso cada um por
 * conta própria, pela DATA DO LANÇAMENTO (`occurred_on`). Só que a sequência
 * já contava pelo dia em que a pessoa registrou (`created_at`), e a data do
 * lançamento não diz quando ela usou o app:
 *
 *  - parcela e compra com data futura ficavam no topo da lista, então
 *    `diasInativo` saía negativo e o lembrete de "uns dias sem registrar"
 *    nunca mais chegava para quem tem compra parcelada;
 *  - uma parcela ou ocorrência que cai hoje contava como "já lançou hoje" e
 *    silenciava o lembrete de um dia em que nada foi registrado;
 *  - registrar hoje um gasto de ontem não silenciava o lembrete de hoje.
 *
 * Agora as três rotas usam esta função, com o mesmo dia de atividade da
 * sequência (`created_at` no horário local; `occurred_on` só para linha sem
 * `created_at`). Data de atividade no futuro é ignorada.
 */
export function contextoDoLembrete(transacoes: Transaction[], agora: Date = new Date()): ContextoLembrete {
  const hoje = isoLocal(agora);
  let ultima: string | null = null;
  for (const t of transacoes) {
    const dia = t.created_at ? isoLocal(new Date(t.created_at)) : t.occurred_on;
    if (!dia || dia > hoje) continue;
    if (!ultima || dia > ultima) ultima = dia;
  }
  return {
    jaLancouHoje: ultima === hoje,
    streak: calculateStreakAndWeek(transacoes, agora).streak,
    diasInativo: ultima ? diasEntre(ultima, hoje) : 99,
  };
}

/* Dias de calendário, não 24h corridas: meia-noite local nos dois lados. */
function diasEntre(deISO: string, ateISO: string): number {
  const [a, b, c] = deISO.split('-').map(Number);
  const [x, y, z] = ateISO.split('-').map(Number);
  return Math.round((new Date(x, y - 1, z).getTime() - new Date(a, b - 1, c).getTime()) / 86400000);
}
