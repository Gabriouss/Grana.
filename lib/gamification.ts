import { formatMoney, isoLocal, isSameMonth, todayISO } from './format';
import type { Bill, Budget, Transaction } from './types';
import type { GamificationHistoricalSummary } from './data';

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
  /** Nome de um Ionicons. Era emoji, e emoji como sistema de ícones muda de
   *  desenho conforme o sistema operacional de quem olha, além de ser o que o
   *  DESIGN.md pede para evitar. */
  icone: string;
  category: BadgeCategory;
  unlocked: boolean;
  progress: number; // 0 to 1
  progressLabel: string;
};

/**
 * Retrato do mês que NÃO vira nota.
 *
 * Superávit, tetos e vencimentos moravam dentro do Score e o transformavam num
 * julgamento sobre a vida financeira da pessoa. Continuam visíveis, porque são
 * informação útil, e saem da pontuação, porque um mês apertado não é falha de
 * hábito e não deveria custar pontos a ninguém.
 */
export type Indicador = {
  label: string;
  valor: string;
  descricao: string;
  /** Só para a cor do valor. `neutro` é o padrão: nada aqui é elogio nem bronca. */
  tom: 'alta' | 'baixa' | 'neutro';
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
  indicadores: Indicador[];
  weekActivity: WeekDayActivity[];
  badges: Badge[];
  unlockedBadgesCount: number;
  totalBadgesCount: number;
};

/**
 * Sequência de dias em que a pessoa REGISTROU, e o ritmo dos 7 dias da semana.
 *
 * ── Duas correções que mudam o significado do número ───────────────────────
 *
 * 1. O dia contado é o do REGISTRO (`created_at`), não o do gasto
 *    (`occurred_on`). A sequência premia o hábito de anotar, e antes ela
 *    media outra coisa: quem passava o domingo sem gastar perdia a sequência
 *    mesmo tendo aberto o app e registrado, o que num app de finanças pune
 *    exatamente o comportamento desejado. Na outra ponta, importar um extrato
 *    OFX com dois meses de compras inflava a sequência para sessenta dias sem
 *    nenhum hábito criado; agora as duzentas linhas importadas contam como o
 *    único dia em que foram importadas, que é a verdade.
 *
 * 2. Todas as datas passam por `isoLocal`. O laço usava
 *    `toISOString().slice(0, 10)`, que devolve a data em UTC: no Brasil, das
 *    21h à meia-noite, ele procurava o dia seguinte, não achava e desistia na
 *    primeira volta. Quem tinha 30 dias seguidos via ZERO todas as noites, o
 *    Score caía 200 pontos, o elo descia um degrau e as quatro medalhas de
 *    sequência travavam juntas. Dois dos três horários de lembrete oferecidos
 *    caem dentro dessa janela.
 */
export function calculateStreakAndWeek(
  transactions: Transaction[],
  /** Injetável só para teste: é o que permite fixar um horário e provar que a
   *  sequência não muda de valor às 21h. */
  agora: Date = new Date()
): {
  streak: number;
  weekActivity: WeekDayActivity[];
} {
  const datesWithTx = new Set(
    transactions
      .map((t) => (t.created_at ? isoLocal(new Date(t.created_at)) : t.occurred_on))
      .filter(Boolean)
  );
  const now = agora;

  // 1. Sequência consecutiva (Streak)
  let currentStreak = 0;
  let checkDate = new Date(now);
  const todayStr = isoLocal(now);
  
  // Se não registrou hoje ainda, checa se registrou ontem antes de zerar
  const hasToday = datesWithTx.has(todayStr);
  if (!hasToday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  while (true) {
    const iso = isoLocal(checkDate);
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
    const dISO = isoLocal(d);
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
 * O Score Grana (0 a 1000) e os quatro fatores.
 *
 * ── O que ele mede, e por que mudou ───────────────────────────────────────
 *
 * Ele media metade em RESULTADO financeiro: superávit do mês e categorias
 * dentro do teto. Três consequências, todas contra o produto:
 *
 *  - um mês apertado derrubava a nota de quem mais precisa do app, e a pessoa
 *    não tinha como recuperá-la usando o app melhor;
 *  - definir um orçamento e estourá-lo dava 0 pontos, contra 120 de não
 *    definir nenhum: engajar com a funcionalidade custava caro;
 *  - e o DESIGN.md diz, na estrela guia, que "o Grana. escuta sem julgar" e
 *    que "gastar não é um erro a ser sinalizado". O Score fazia o oposto.
 *
 * Agora ele mede só o que a pessoa CONTROLA: o hábito de registrar e a
 * completude do retrato que ela está construindo. Superávit, orçamento e
 * vencimentos continuam na tela, como indicadores: informação sobre o mês,
 * sem virar nota sobre a pessoa.
 */
export function calculateScoreBreakdown(
  transactions: Transaction[],
  bills: Bill[],
  budgets: Budget[],
  streak: number,
  agora: Date = new Date()
): { score: number; factors: ScoreFactor[]; indicadores: Indicador[] } {
  const currentYear = agora.getFullYear();
  const currentMonth = agora.getMonth();

  const monthTx = transactions.filter((t) => isSameMonth(t.occurred_on, currentYear, currentMonth));
  const totalIn = monthTx.filter((t) => t.type === "in").reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = monthTx.filter((t) => t.type === "out").reduce((s, t) => s + Number(t.amount), 0);

  /* Dias do mês já decorridos: num mês em andamento a régua é "até hoje", não
     "até o dia 31". Sem isso, todo dia 2 a constância nasceria perto de zero e
     a nota puniria a pessoa por o mês ainda não ter acontecido. */
  const diasNoMes = new Date(currentYear, currentMonth + 1, 0).getDate();
  const diasDecorridos = Math.max(1, Math.min(diasNoMes, agora.getDate()));

  /* Dias em que houve REGISTRO, pela mesma régua da sequência: o dia em que a
     pessoa anotou, não o dia em que o dinheiro saiu. */
  const prefixoDoMes = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
  const diasComRegistro = new Set(
    transactions
      .map((t) => (t.created_at ? isoLocal(new Date(t.created_at)) : t.occurred_on))
      .filter((d) => d.startsWith(prefixoDoMes))
  ).size;

  // Fator 1: sequência viva (até 300 pts), 20 por dia, teto só aos 15 dias.
  const consistencyPts = Math.min(300, streak * 20);
  const factorConsistency: ScoreFactor = {
    label: "Sequência de registros",
    points: consistencyPts,
    maxPoints: 300,
    description:
      streak === 0
        ? "Um lançamento hoje começa uma sequência nova."
        : `${streak} ${streak === 1 ? "dia seguido" : "dias seguidos"} registrando.`,
    status: consistencyPts >= 200 ? "positive" : consistencyPts >= 100 ? "neutral" : "attention",
  };

  // Fator 2: constância no mês (até 300 pts) — dos dias já vividos, quantos tiveram registro.
  const fatiaDeDias = Math.min(1, diasComRegistro / diasDecorridos);
  const constanciaPts = Math.round(fatiaDeDias * 300);
  const factorConstancia: ScoreFactor = {
    label: "Constância no mês",
    points: constanciaPts,
    maxPoints: 300,
    description: `${diasComRegistro} de ${diasDecorridos} ${diasDecorridos === 1 ? "dia" : "dias"} do mês com algum registro.`,
    status: fatiaDeDias >= 0.6 ? "positive" : fatiaDeDias >= 0.3 ? "neutral" : "attention",
  };

  /* Fator 3: retrato completo (até 200 pts). Mede se o registro conta a
     história inteira: entrada e saída, e categoria escolhida em vez de deixar
     tudo cair no genérico. É comportamento, não resultado. */
  const temEntrada = monthTx.some((t) => t.type === "in");
  const temSaida = monthTx.some((t) => t.type === "out");
  const comCategoria = monthTx.filter((t) => t.category && t.category !== "Outros").length;
  const fatiaCategorizada = monthTx.length > 0 ? comCategoria / monthTx.length : 0;
  const retratoPts = Math.round((temEntrada ? 70 : 0) + (temSaida ? 70 : 0) + fatiaCategorizada * 60);
  const factorRetrato: ScoreFactor = {
    label: "Retrato completo",
    points: retratoPts,
    maxPoints: 200,
    description:
      !temEntrada && temSaida
        ? "Registrar também o que entra fecha o retrato do mês."
        : `${Math.round(fatiaCategorizada * 100)}% dos lançamentos com categoria escolhida.`,
    status: retratoPts >= 160 ? "positive" : retratoPts >= 100 ? "neutral" : "attention",
  };

  /* Fator 4: contas acompanhadas (até 200 pts). O que conta é MANTER o estado
     em dia no app, não pagar em dia: atraso de pagamento é vida, e vida não
     entra na nota. Sem conta cadastrada o fator entrega pontuação cheia, porque
     não usar boleto não é falha de hábito. */
  const contasResolvidas = bills.filter((b) => b.status === "paid").length;
  const contasPts = bills.length === 0 ? 200 : Math.round((contasResolvidas / bills.length) * 200);
  const factorContas: ScoreFactor = {
    label: "Contas acompanhadas",
    points: contasPts,
    maxPoints: 200,
    description:
      bills.length === 0
        ? "Nenhuma conta cadastrada por enquanto."
        : `${contasResolvidas} de ${bills.length} ${bills.length === 1 ? "conta atualizada" : "contas atualizadas"} no app.`,
    status: contasPts >= 160 ? "positive" : contasPts >= 100 ? "neutral" : "attention",
  };

  const totalScore = Math.min(1000, Math.max(0, consistencyPts + constanciaPts + retratoPts + contasPts));

  /* ── Indicadores: informação, não nota ───────────────────────────────────
     Superávit, orçamento e vencimentos saíram da pontuação e continuam aqui.
     São o retrato do mês, e o retrato pode estar apertado sem que ninguém
     tenha feito nada errado. */
  const indicadores: Indicador[] = [];

  const saldo = totalIn - totalOut;
  indicadores.push({
    label: "Resultado do mês",
    valor: `${saldo >= 0 ? "+" : "−"} R$ ${formatMoney(Math.abs(saldo))}`,
    descricao:
      totalIn > 0
        ? `${Math.round((saldo / totalIn) * 100)}% do que entrou ainda está com você.`
        : "Nenhuma entrada registrada neste mês.",
    tom: saldo >= 0 ? "alta" : "baixa",
  });

  if (budgets.length > 0) {
    const outByCat: Record<string, number> = {};
    monthTx.filter((t) => t.type === "out").forEach((t) => {
      outByCat[t.category] = (outByCat[t.category] || 0) + Number(t.amount);
    });
    const dentro = budgets.filter((b) => (outByCat[b.category] || 0) <= Number(b.amount)).length;
    indicadores.push({
      label: "Tetos definidos",
      valor: `${dentro} de ${budgets.length}`,
      descricao:
        dentro === budgets.length
          ? "Todas as categorias dentro do teto."
          : "Algumas categorias passaram do teto que você definiu.",
      tom: "neutro",
    });
  }

  if (bills.length > 0) {
    const todayStr = todayISO();
    const vencidas = bills.filter((b) => b.status === "due" && b.due_date < todayStr).length;
    indicadores.push({
      label: "Contas vencidas",
      valor: String(vencidas),
      descricao: vencidas === 0 ? "Nenhuma conta passou do vencimento." : "Vale conferir os vencimentos.",
      tom: vencidas === 0 ? "alta" : "neutro",
    });
  }

  return {
    score: totalScore,
    factors: [factorConsistency, factorConstancia, factorRetrato, factorContas],
    indicadores,
  };
}

/**
 * Avalia o catálogo completo de medalhas e conquistas.
 */
export function evaluateBadges(
  transactions: Transaction[],
  bills: Bill[],
  budgets: Budget[],
  streak: number,
  historical?: GamificationHistoricalSummary,
  /** Ids já gravados em `user_achievements`. Ver `aplicarPermanencia`. */
  jaConquistadas?: readonly string[]
): Badge[] {
  const totalTxCount = historical?.transaction_count ?? transactions.length;
  const inTxCount = historical?.income_count ?? transactions.filter((t) => t.type === 'in').length;
  const outTxCount = historical?.expense_count ?? transactions.filter((t) => t.type === 'out').length;
  const paidBillsCount = historical?.paid_bill_count ?? bills.filter((b) => b.status === 'paid').length;
  const incomeTotal = historical?.income_total ?? transactions.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const expenseCategoryCount = historical?.expense_category_count
    ?? new Set(transactions.filter((t) => t.type === 'out').map((t) => t.category)).size;
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
      icone: 'leaf-outline',
      category: 'consistency',
      unlocked: totalTxCount >= 1,
      progress: Math.min(1, totalTxCount / 1),
      progressLabel: `${Math.min(1, totalTxCount)}/1`,
    },
    {
      id: 'streak_3',
      title: 'Ritmo Inicial',
      description: 'Registrou movimentações por 3 dias consecutivos.',
      icone: 'flame-outline',
      category: 'consistency',
      unlocked: streak >= 3,
      progress: Math.min(1, streak / 3),
      progressLabel: `${Math.min(3, streak)}/3 dias`,
    },
    {
      id: 'streak_7',
      title: 'Semana Blindada',
      description: 'Alcançou uma sequência de 7 dias de consistência.',
      icone: 'flash-outline',
      category: 'consistency',
      unlocked: streak >= 7,
      progress: Math.min(1, streak / 7),
      progressLabel: `${Math.min(7, streak)}/7 dias`,
    },
    {
      id: 'streak_30',
      title: 'Hábito Inquebrável',
      description: 'Registrou por 30 dias seguidos, sem quebrar a sequência.',
      icone: 'ribbon-outline',
      category: 'consistency',
      unlocked: streak >= 30,
      progress: Math.min(1, streak / 30),
      progressLabel: `${Math.min(30, streak)}/30 dias`,
    },
    {
      id: 'centurion',
      title: 'Centurião Financeiro',
      description: 'Acumulou 100 lançamentos registrados no histórico.',
      icone: 'library-outline',
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
      icone: 'grid-outline',
      category: 'budget',
      unlocked: hasBudgets,
      progress: Math.min(1, budgets.length / 3),
      progressLabel: `${Math.min(3, budgets.length)}/3 categorias`,
    },
    {
      id: 'bill_payer',
      title: 'Pontualidade Britânica',
      description: 'Pagou e deu baixa em pelo menos 5 contas ou boletos.',
      icone: 'time-outline',
      category: 'budget',
      unlocked: paidBillsCount >= 5,
      progress: Math.min(1, paidBillsCount / 5),
      progressLabel: `${Math.min(5, paidBillsCount)}/5 contas`,
    },
    {
      id: 'master_bills',
      title: 'Guardião dos Vencimentos',
      description: 'Pagou 20 contas com sucesso no aplicativo.',
      icone: 'shield-checkmark-outline',
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
      icone: 'trending-up-outline',
      category: 'saving',
      unlocked: hasPositiveMonth,
      progress: hasPositiveMonth ? 1 : 0,
      progressLabel: hasPositiveMonth ? 'Concluído' : 'Em andamento',
    },
    {
      id: 'savings_5k',
      title: 'Primeira Fortaleza',
      description: 'Acumulou mais de R$ 5.000,00 em receitas registradas.',
      icone: 'business-outline',
      category: 'saving',
      unlocked: incomeTotal >= 5000,
      progress: Math.min(1, incomeTotal / 5000),
      progressLabel: 'R$ 5.000',
    },

    // Agilidade & Domínio
    {
      id: 'income_and_expense',
      title: 'Visão Completa',
      description: 'Registrou tanto entradas de renda quanto saídas de despesa.',
      icone: 'swap-horizontal-outline',
      category: 'speed',
      unlocked: inTxCount >= 1 && outTxCount >= 1,
      progress: (inTxCount >= 1 ? 0.5 : 0) + (outTxCount >= 1 ? 0.5 : 0),
      progressLabel: inTxCount >= 1 && outTxCount >= 1 ? 'Concluído' : 'Pendente',
    },
    {
      id: 'category_explorer',
      title: 'Mapeador 360°',
      description: 'Registrou despesas em pelo menos 5 categorias diferentes.',
      icone: 'compass-outline',
      category: 'speed',
      unlocked: expenseCategoryCount >= 5,
      progress: Math.min(1, expenseCategoryCount / 5),
      progressLabel: `${Math.min(5, expenseCategoryCount)}/5 categorias`,
    },
  ];
}

/**
 * Retorna o estado consolidado da gamificação.
 */
/**
 * Uma conquista desbloqueada não volta a trancar.
 *
 * Cinco das doze medalhas dependiam do estado ATUAL e podiam ser retiradas:
 * as três de sequência, "Arquiteto de Gastos" (some ao apagar um orçamento) e
 * "Mês Verde" (some quando um gasto vira o mês). Aqui a condição de agora é
 * unida ao que já foi conquistado algum dia. A barra de progresso continua
 * mostrando a situação atual, que é informação legítima; o que não volta atrás
 * é o desbloqueio.
 */
function aplicarPermanencia(badges: Badge[], jaConquistadas: readonly string[]): Badge[] {
  if (jaConquistadas.length === 0) return badges;
  const guardadas = new Set(jaConquistadas);
  return badges.map((b) =>
    b.unlocked || !guardadas.has(b.id) ? b : { ...b, unlocked: true, progress: 1 }
  );
}

/** Medalhas que a condição acabou de satisfazer e que ainda não foram gravadas. */
export function conquistasNovas(badges: Badge[], jaConquistadas: readonly string[]): Badge[] {
  const guardadas = new Set(jaConquistadas);
  return badges.filter((b) => b.unlocked && !guardadas.has(b.id));
}

export function getGamificationState(
  transactions: Transaction[],
  bills: Bill[],
  budgets: Budget[],
  historical?: GamificationHistoricalSummary,
  jaConquistadas: readonly string[] = []
): GamificationState {
  const { streak, weekActivity } = calculateStreakAndWeek(transactions);
  const { score, factors, indicadores } = calculateScoreBreakdown(transactions, bills, budgets, streak);
  const badges = aplicarPermanencia(
    evaluateBadges(transactions, bills, budgets, streak, historical, jaConquistadas),
    jaConquistadas
  );

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
    indicadores,
    weekActivity,
    badges,
    unlockedBadgesCount,
    totalBadgesCount: badges.length,
  };
}
