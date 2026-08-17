import { isSameMonth, todayISO } from './format';
import type { Bill, Budget, Transaction } from './types';

export type MasteryLevel = {
  level: number;
  title: string;
  minScore: number;
  maxScore: number;
  description: string;
};

export const MASTERY_LEVELS: MasteryLevel[] = [
  { level: 1, title: 'Aprendiz Financeiro', minScore: 0, maxScore: 250, description: 'Dando os primeiros passos na clareza financeira.' },
  { level: 2, title: 'Construtor de Hábitos', minScore: 251, maxScore: 500, description: 'Criando consistência de registro e controle diário.' },
  { level: 3, title: 'Gestor Eficiente', minScore: 501, maxScore: 750, description: 'Mantendo o orçamento equilibrado e contas em dia.' },
  { level: 4, title: 'Estrategista', minScore: 751, maxScore: 900, description: 'Construindo superávit previsível e domínio de gastos.' },
  { level: 5, title: 'Mestre do Patrimônio', minScore: 901, maxScore: 1000, description: 'Excelência financeira contínua e disciplina impecável.' },
];

export type BadgeCategory = 'consistency' | 'budget' | 'saving' | 'speed';

export type Badge = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: BadgeCategory;
  unlocked: boolean;
  progress: number; // 0 to 1
  progressLabel: string;
};

export type ScoreFactor = {
  label: string;
  points: number;
  maxPoints: number;
  description: string;
  status: 'positive' | 'neutral' | 'attention';
};

export type WeekDayActivity = {
  dayName: string; // 'Seg', 'Ter', etc.
  dateISO: string;
  active: boolean;
  isToday: boolean;
};

export type GamificationState = {
  streak: number;
  score: number;
  mastery: MasteryLevel;
  nextMastery: MasteryLevel | null;
  masteryProgress: number; // 0 to 1
  factors: ScoreFactor[];
  weekActivity: WeekDayActivity[];
  badges: Badge[];
  unlockedBadgesCount: number;
  totalBadgesCount: number;
};

/**
 * Calcula a sequência atual de dias consecutivos com registros (streak)
 * e o status de atividade dos 7 dias da semana atual (Segunda a Domingo).
 */
export function calculateStreakAndWeek(transactions: Transaction[]): {
  streak: number;
  weekActivity: WeekDayActivity[];
} {
  const datesWithTx = new Set(transactions.map((t) => t.occurred_on));
  const now = new Date();
  
  // 1. Sequência consecutiva (Streak)
  let currentStreak = 0;
  let checkDate = new Date(now);
  const todayStr = todayISO();
  
  // Se não registrou hoje ainda, checa se registrou ontem antes de zerar
  const hasToday = datesWithTx.has(todayStr);
  if (!hasToday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  while (true) {
    const iso = checkDate.toISOString().slice(0, 10);
    if (datesWithTx.has(iso)) {
      currentStreak += 1;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // 2. Semana Atual (Segunda a Domingo)
  const currentDayOfWeek = now.getDay(); // 0 (Dom) a 6 (Sáb)
  // Ajusta para semana começando na Segunda (0 = Seg, ..., 6 = Dom)
  const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const weekActivity: WeekDayActivity[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dISO = d.toISOString().slice(0, 10);
    const isToday = dISO === todayStr;
    const active = datesWithTx.has(dISO);

    weekActivity.push({
      dayName: dayNames[i],
      dateISO: dISO,
      active,
      isToday,
    });
  }

  return { streak: currentStreak, weekActivity };
}

/**
 * Calcula o Score Grana (0 a 1000) e o detalhamento dos 4 fatores de saúde financeira.
 */
export function calculateScoreBreakdown(
  transactions: Transaction[],
  bills: Bill[],
  budgets: Budget[],
  streak: number
): { score: number; factors: ScoreFactor[] } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const monthTx = transactions.filter((t) => isSameMonth(t.occurred_on, currentYear, currentMonth));
  const totalIn = monthTx.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = monthTx.filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);

  // Fator 1: Consistência & Ritmo de Registros (Até 250 pts)
  // 50 pts base + 25 pts por dia de streak (cap 200 pts)
  let consistencyPts = 50;
  if (streak > 0) {
    consistencyPts += Math.min(200, streak * 25);
  }
  const factorConsistency: ScoreFactor = {
    label: 'Ritmo de registros',
    points: consistencyPts,
    maxPoints: 250,
    description: streak >= 5 ? 'Excelente ritmo diário de anotações!' : 'Mantenha lançamentos diários para pontuar mais.',
    status: consistencyPts >= 180 ? 'positive' : consistencyPts >= 100 ? 'neutral' : 'attention',
  };

  // Fator 2: Controle de Orçamento (Até 250 pts)
  // Avalia quantas categorias com teto definido não foram estouradas
  let budgetPts = 120; // Base se não houver orçamentos
  if (budgets.length > 0) {
    const outByCat: Record<string, number> = {};
    monthTx.filter((t) => t.type === 'out').forEach((t) => {
      outByCat[t.category] = (outByCat[t.category] || 0) + Number(t.amount);
    });

    let withinBudgetCount = 0;
    budgets.forEach((b) => {
      const spent = outByCat[b.category] || 0;
      if (spent <= b.amount) withinBudgetCount++;
    });

    const ratio = withinBudgetCount / budgets.length;
    budgetPts = Math.round(ratio * 250);
  }
  const factorBudget: ScoreFactor = {
    label: 'Orçamento sob controle',
    points: budgetPts,
    maxPoints: 250,
    description: budgetPts >= 200 ? 'Gastos dentro dos limites planejados.' : 'Algumas categorias ultrapassaram o teto.',
    status: budgetPts >= 200 ? 'positive' : budgetPts >= 130 ? 'neutral' : 'attention',
  };

  // Fator 3: Pontualidade de Contas (Até 250 pts)
  // Avalia se há contas com vencimento ultrapassado em aberto
  const todayStr = todayISO();
  const overdueBills = bills.filter((b) => b.status === 'due' && b.due_date < todayStr);
  let billsPts = 250;
  if (overdueBills.length > 0) {
    billsPts = Math.max(50, 250 - overdueBills.length * 60);
  } else if (bills.length === 0) {
    billsPts = 180; // Base neutra
  }
  const factorBills: ScoreFactor = {
    label: 'Contas e boletos em dia',
    points: billsPts,
    maxPoints: 250,
    description: overdueBills.length === 0 ? 'Nenhuma conta atrasada.' : `${overdueBills.length} conta(s) pendente(s) de pagamento.`,
    status: billsPts >= 220 ? 'positive' : billsPts >= 150 ? 'neutral' : 'attention',
  };

  // Fator 4: Superávit & Taxa de Poupança (Até 250 pts)
  let savingPts = 100;
  if (totalIn > 0) {
    const net = totalIn - totalOut;
    const savingRate = net / totalIn; // ex: 0.2 = 20% guardado
    if (savingRate >= 0.25) {
      savingPts = 250;
    } else if (savingRate >= 0.1) {
      savingPts = 200;
    } else if (savingRate > 0) {
      savingPts = 160;
    } else if (savingRate === 0) {
      savingPts = 100;
    } else {
      savingPts = Math.max(20, Math.round(100 + savingRate * 100));
    }
  }
  const factorSaving: ScoreFactor = {
    label: 'Superávit do mês',
    points: savingPts,
    maxPoints: 250,
    description: savingPts >= 200 ? 'Taxa de economia saudável no mês.' : 'Receitas e despesas próximas do limite.',
    status: savingPts >= 190 ? 'positive' : savingPts >= 120 ? 'neutral' : 'attention',
  };

  const totalScore = Math.min(1000, Math.max(0, consistencyPts + budgetPts + billsPts + savingPts));

  return {
    score: totalScore,
    factors: [factorConsistency, factorBudget, factorBills, factorSaving],
  };
}

/**
 * Avalia o catálogo completo de medalhas e conquistas.
 */
export function evaluateBadges(
  transactions: Transaction[],
  bills: Bill[],
  budgets: Budget[],
  streak: number
): Badge[] {
  const totalTxCount = transactions.length;
  const inTxCount = transactions.filter((t) => t.type === 'in').length;
  const outTxCount = transactions.filter((t) => t.type === 'out').length;
  const paidBillsCount = bills.filter((b) => b.status === 'paid').length;
  const hasBudgets = budgets.length >= 3;

  const now = new Date();
  const currentMonthTx = transactions.filter((t) => isSameMonth(t.occurred_on, now.getFullYear(), now.getMonth()));
  const currentMonthIn = currentMonthTx.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const currentMonthOut = currentMonthTx.filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);
  const hasPositiveMonth = currentMonthIn > currentMonthOut && currentMonthIn > 0;

  return [
    // Consistência
    {
      id: 'first_step',
      title: 'Primeiro Registro',
      description: 'Fez o primeiro lançamento financeiro no Grana.',
      emoji: '🌱',
      category: 'consistency',
      unlocked: totalTxCount >= 1,
      progress: Math.min(1, totalTxCount / 1),
      progressLabel: `${Math.min(1, totalTxCount)}/1`,
    },
    {
      id: 'streak_3',
      title: 'Ritmo Inicial',
      description: 'Registrou movimentações por 3 dias consecutivos.',
      emoji: '🔥',
      category: 'consistency',
      unlocked: streak >= 3,
      progress: Math.min(1, streak / 3),
      progressLabel: `${Math.min(3, streak)}/3 dias`,
    },
    {
      id: 'streak_7',
      title: 'Semana Blindada',
      description: 'Alcançou uma sequência de 7 dias de consistência.',
      emoji: '⚡',
      category: 'consistency',
      unlocked: streak >= 7,
      progress: Math.min(1, streak / 7),
      progressLabel: `${Math.min(7, streak)}/7 dias`,
    },
    {
      id: 'streak_30',
      title: 'Hábito Inquebrável',
      description: 'Manteve a ofensiva ativa por 30 dias seguidos.',
      emoji: '👑',
      category: 'consistency',
      unlocked: streak >= 30,
      progress: Math.min(1, streak / 30),
      progressLabel: `${Math.min(30, streak)}/30 dias`,
    },
    {
      id: 'centurion',
      title: 'Centurião Financeiro',
      description: 'Acumulou 100 lançamentos registrados no histórico.',
      emoji: '🏛️',
      category: 'consistency',
      unlocked: totalTxCount >= 100,
      progress: Math.min(1, totalTxCount / 100),
      progressLabel: `${Math.min(100, totalTxCount)}/100`,
    },

    // Orçamento & Disciplina
    {
      id: 'budget_planner',
      title: 'Arquiteto de Gastos',
      description: 'Definiu limites de orçamento para pelo menos 3 categorias.',
      emoji: '📐',
      category: 'budget',
      unlocked: hasBudgets,
      progress: Math.min(1, budgets.length / 3),
      progressLabel: `${Math.min(3, budgets.length)}/3 categorias`,
    },
    {
      id: 'bill_payer',
      title: 'Pontualidade Britânica',
      description: 'Pagou e deu baixa em pelo menos 5 contas ou boletos.',
      emoji: '⏱️',
      category: 'budget',
      unlocked: paidBillsCount >= 5,
      progress: Math.min(1, paidBillsCount / 5),
      progressLabel: `${Math.min(5, paidBillsCount)}/5 contas`,
    },
    {
      id: 'master_bills',
      title: 'Guardião dos Vencimentos',
      description: 'Pagou 20 contas com sucesso no aplicativo.',
      emoji: '🛡️',
      category: 'budget',
      unlocked: paidBillsCount >= 20,
      progress: Math.min(1, paidBillsCount / 20),
      progressLabel: `${Math.min(20, paidBillsCount)}/20 contas`,
    },

    // Economia & Superávit
    {
      id: 'superavit_month',
      title: 'Mês Verde',
      description: 'Fechou o mês com superávit (receitas maiores que saídas).',
      emoji: '💎',
      category: 'saving',
      unlocked: hasPositiveMonth,
      progress: hasPositiveMonth ? 1 : 0,
      progressLabel: hasPositiveMonth ? 'Concluído' : 'Em andamento',
    },
    {
      id: 'savings_5k',
      title: 'Primeira Fortaleza',
      description: 'Acumulou mais de R$ 5.000,00 em receitas registradas.',
      emoji: '🏦',
      category: 'saving',
      unlocked: transactions.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0) >= 5000,
      progress: Math.min(1, transactions.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0) / 5000),
      progressLabel: 'R$ 5.000',
    },

    // Agilidade & Domínio
    {
      id: 'income_and_expense',
      title: 'Visão Completa',
      description: 'Registrou tanto entradas de renda quanto saídas de despesa.',
      emoji: '⚖️',
      category: 'speed',
      unlocked: inTxCount >= 1 && outTxCount >= 1,
      progress: (inTxCount >= 1 ? 0.5 : 0) + (outTxCount >= 1 ? 0.5 : 0),
      progressLabel: inTxCount >= 1 && outTxCount >= 1 ? 'Concluído' : 'Pendente',
    },
    {
      id: 'category_explorer',
      title: 'Mapeador 360°',
      description: 'Registrou despesas em pelo menos 5 categorias diferentes.',
      emoji: '🧭',
      category: 'speed',
      unlocked: new Set(transactions.filter((t) => t.type === 'out').map((t) => t.category)).size >= 5,
      progress: Math.min(1, new Set(transactions.filter((t) => t.type === 'out').map((t) => t.category)).size / 5),
      progressLabel: `${Math.min(5, new Set(transactions.filter((t) => t.type === 'out').map((t) => t.category)).size)}/5 categorias`,
    },
  ];
}

/**
 * Retorna o estado consolidado da gamificação.
 */
export function getGamificationState(
  transactions: Transaction[],
  bills: Bill[],
  budgets: Budget[]
): GamificationState {
  const { streak, weekActivity } = calculateStreakAndWeek(transactions);
  const { score, factors } = calculateScoreBreakdown(transactions, bills, budgets, streak);
  const badges = evaluateBadges(transactions, bills, budgets, streak);

  const mastery = MASTERY_LEVELS.find((m) => score >= m.minScore && score <= m.maxScore) || MASTERY_LEVELS[0];
  const nextMastery = MASTERY_LEVELS.find((m) => m.level === mastery.level + 1) || null;

  let masteryProgress = 1;
  if (nextMastery) {
    const range = nextMastery.minScore - mastery.minScore;
    masteryProgress = Math.min(1, Math.max(0, (score - mastery.minScore) / range));
  }

  const unlockedBadgesCount = badges.filter((b) => b.unlocked).length;

  return {
    streak,
    score,
    mastery,
    nextMastery,
    masteryProgress,
    factors,
    weekActivity,
    badges,
    unlockedBadgesCount,
    totalBadgesCount: badges.length,
  };
}
