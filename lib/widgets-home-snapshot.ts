import { calcularSafeToSpend } from './safe-to-spend';
import { isCreditTx } from './transaction-rules';
import type { Bill, Goal, Transaction } from './types';

export type CompromissoDoWidget = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  overdue: boolean;
  recurring: boolean;
};

/** O widget mostra poucas linhas; o resto vira "+N contas". O teto só evita
    mandar uma lista longa para o armazenamento cifrado do widget. */
export const LIMITE_COMPROMISSOS = 12;

export type SnapshotWidgetsV1 = {
  version: 1;
  userId: string;
  updatedAt: string;
  privacyHidden: boolean;
  safeToSpend: {
    livrePorDia: number;
    livreTotal: number;
    diasRestantes: number;
    semSaldo: boolean;
  };
  /** Mantido para o widget nativo de builds anteriores, que só lê este campo.
      É sempre o primeiro item de `commitments`. */
  nextCommitment: null | CompromissoDoWidget;
  /** Atrasados de qualquer mês e os pendentes do mês atual, por vencimento.
      Sem nenhum dos dois, o próximo vencimento sozinho. Limitado a
      LIMITE_COMPROMISSOS; `commitmentsCount` diz quantos são ao todo. */
  commitments: CompromissoDoWidget[];
  commitmentsCount: number;
  goal: null | {
    id: string;
    title: string;
    currentAmount: number;
    targetAmount: number;
    progress: number;
    color: string;
    completed: boolean;
  };
};

function dataLocalISO(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function pendentesPorVencimento(bills: Bill[]): Bill[] {
  return bills
    .filter((bill) => bill.status === 'due')
    .slice()
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
}

function paraWidget(bill: Bill, hojeISO: string): CompromissoDoWidget {
  return {
    id: bill.id,
    description: bill.description.trim() || 'Conta',
    amount: Number(bill.amount),
    dueDate: bill.due_date,
    overdue: bill.due_date < hojeISO,
    recurring: !!bill.recurring,
  };
}

/** Primeiro vencimento pendente. Atrasado continua vindo antes do futuro. */
export function selecionarProximoCompromisso(bills: Bill[], hoje: Date = new Date()): SnapshotWidgetsV1['nextCommitment'] {
  const proximo = pendentesPorVencimento(bills)[0];
  return proximo ? paraWidget(proximo, dataLocalISO(hoje)) : null;
}

/**
 * As contas que o widget lista: as ATRASADAS, de qualquer mês, e as
 * pendentes do mês atual, em ordem de vencimento.
 *
 * Pedido do autor em 19/09/2026: "se a gente tem um boleto de agosto atrasado,
 * esse boleto de agosto precisa aparecer junto com os boletos de setembro, e
 * vai aparecer como atrasado mesmo". Até então o widget mostrava UM
 * compromisso, o de vencimento mais antigo, e um único atrasado prendia o
 * widget nele: as contas do mês nunca apareciam.
 *
 * Mês sem atrasado nem pendente: o próximo vencimento sozinho, para o widget
 * não dizer "nada pendente" no dia 30 com uma conta vencendo no dia 2.
 */
export function selecionarCompromissosDoMes(
  bills: Bill[],
  hoje: Date = new Date()
): { itens: CompromissoDoWidget[]; total: number } {
  const hojeISO = dataLocalISO(hoje);
  const mesAtual = hojeISO.slice(0, 7);
  const pendentes = pendentesPorVencimento(bills);
  const doMes = pendentes.filter((bill) => bill.due_date < hojeISO || bill.due_date.slice(0, 7) === mesAtual);
  const escolhidas = doMes.length > 0 ? doMes : pendentes.slice(0, 1);
  return {
    itens: escolhidas.slice(0, LIMITE_COMPROMISSOS).map((bill) => paraWidget(bill, hojeISO)),
    total: escolhidas.length,
  };
}

/**
 * Prioriza o primeiro cofrinho ainda em andamento, na ordem estável recebida
 * de `fetchGoals`. Se todos terminaram, mantém o primeiro como conquista.
 */
export function selecionarCofrinho(goals: Goal[]): SnapshotWidgetsV1['goal'] {
  const escolhido = goals.find((goal) => Number(goal.current_amount) < Number(goal.target_amount)) ?? goals[0];
  if (!escolhido) return null;

  const atual = Math.max(0, Number(escolhido.current_amount));
  const alvo = Math.max(0, Number(escolhido.target_amount));
  const progresso = alvo > 0 ? Math.min(100, Math.max(0, Math.round((atual / alvo) * 100))) : 0;
  const cor = /^#[0-9a-f]{6}$/i.test(escolhido.color) ? escolhido.color : '#7BD8C0';

  return {
    id: escolhido.id,
    title: escolhido.title.trim() || 'Cofrinho',
    currentAmount: atual,
    targetAmount: alvo,
    progress: progresso,
    color: cor,
    completed: alvo > 0 && atual >= alvo,
  };
}

export function montarSnapshotWidgets(input: {
  userId: string;
  transactions: Transaction[];
  bills: Bill[];
  goals: Goal[];
  privacyHidden: boolean;
  hoje?: Date;
  updatedAt?: string;
}): SnapshotWidgetsV1 {
  const hoje = input.hoje ?? new Date();
  /* Crédito ainda está na fatura: só vira saída de caixa quando ela é paga.
     É a mesma regra da Home antes de chamar calcularSafeToSpend. */
  const transacoesDeCaixa = input.transactions.filter((tx) => !isCreditTx(tx));
  const livre = calcularSafeToSpend(transacoesDeCaixa, input.bills, input.goals, hoje);
  const compromissos = selecionarCompromissosDoMes(input.bills, hoje);

  return {
    version: 1,
    userId: input.userId,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    privacyHidden: input.privacyHidden,
    safeToSpend: {
      livrePorDia: livre.livrePorDia,
      livreTotal: livre.livreTotal,
      diasRestantes: livre.diasRestantes,
      semSaldo: livre.saldoAtual <= 0,
    },
    nextCommitment: selecionarProximoCompromisso(input.bills, hoje),
    commitments: compromissos.itens,
    commitmentsCount: compromissos.total,
    goal: selecionarCofrinho(input.goals),
  };
}
