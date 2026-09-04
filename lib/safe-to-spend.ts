import type { Bill, Goal, Transaction } from './types';

export type SafeToSpend = {
  saldoAtual: number;
  contasFixasPendentes: number;
  reservadoEmMetas: number;
  diasRestantes: number;
  livreTotal: number;
  livrePorDia: number;
};

/** Saldo de caixa do mês informado, sem carregar meses anteriores. */
export function calcularSaldoAtual(transactions: Transaction[], ano: number, mes: number): number {
  return transactions
    .filter((t) => {
      const d = new Date(t.occurred_on + 'T00:00:00');
      return d.getFullYear() === ano && d.getMonth() === mes;
    })
    .reduce((soma, t) => soma + (t.type === 'in' ? Number(t.amount) : -Number(t.amount)), 0);
}
function diasRestantesNoMes(hoje: Date): number {
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  return Math.max(1, ultimoDia - hoje.getDate() + 1);
}

/**
 * Livre/dia = (saldo do mês − contas pendentes do mês − total guardado em
 * cofrinhos) / dias restantes. É a fonte única para a Home e os widgets.
 */
export function calcularSafeToSpend(
  transactions: Transaction[],
  bills: Bill[],
  goals: Goal[],
  hoje: Date = new Date()
): SafeToSpend {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const saldoAtual = calcularSaldoAtual(transactions, ano, mes);
  const contasFixasPendentes = bills
    .filter((b) => b.status === 'due')
    .filter((b) => {
      const d = new Date(b.due_date + 'T00:00:00');
      return d.getFullYear() === ano && d.getMonth() === mes;
    })
    .reduce((soma, b) => soma + Number(b.amount), 0);
  const reservadoEmMetas = goals.reduce((soma, goal) => soma + Number(goal.current_amount), 0);
  const diasRestantes = diasRestantesNoMes(hoje);
  const livreTotal = Math.max(0, saldoAtual - contasFixasPendentes - reservadoEmMetas);

  return {
    saldoAtual,
    contasFixasPendentes,
    reservadoEmMetas,
    diasRestantes,
    livreTotal,
    livrePorDia: livreTotal / diasRestantes,
  };
}
