import { calcularSafeToSpend } from './safe-to-spend';
import { isCreditTx } from './transaction-rules';
import type { Bill, Goal, Transaction } from './types';

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
  nextCommitment: null | {
    id: string;
    description: string;
    amount: number;
    dueDate: string;
    overdue: boolean;
    recurring: boolean;
  };
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

/** Primeiro vencimento pendente. Atrasado continua vindo antes do futuro. */
export function selecionarProximoCompromisso(bills: Bill[], hoje: Date = new Date()): SnapshotWidgetsV1['nextCommitment'] {
  const proximo = bills
    .filter((bill) => bill.status === 'due')
    .slice()
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))[0];
  if (!proximo) return null;

  return {
    id: proximo.id,
    description: proximo.description.trim() || 'Conta',
    amount: Number(proximo.amount),
    dueDate: proximo.due_date,
    overdue: proximo.due_date < dataLocalISO(hoje),
    recurring: !!proximo.recurring,
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
    goal: selecionarCofrinho(input.goals),
  };
}
