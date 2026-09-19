import type { Bill, Goal, Transaction } from './types';

export type SafeToSpend = {
  saldoAtual: number;
  contasFixasPendentes: number;
  reservadoEmMetas: number;
  diasRestantes: number;
  livreTotal: number;
  livrePorDia: number;
};

/**
 * Saldo acumulado de caixa: saldo inicial da(s) carteira(s) em escopo mais
 * todo o fluxo já lançado, sem recorte de mês — a MESMA conta que o seletor
 * de carteira mostra (`lib/wallets.ts::calcularSaldosWallets`).
 *
 * Até 19/09/2026 esta função somava só o mês corrente, sem saldo inicial.
 * Quem tinha dinheiro guardado de antes (ou uma carteira criada com saldo
 * inicial) via o seletor de carteira dizer um número e o "Livre para gastar"
 * dizer outro para a MESMA carteira, na mesma tela — duas contas diferentes
 * para a palavra "saldo" (achado A12 da auditoria no emulador). Quem chama
 * já filtra crédito antes (compra no crédito não é saída de caixa até a
 * fatura ser paga), então esta função só soma o que já é caixa de verdade.
 */
export function calcularSaldoAtual(transactions: Transaction[], saldoInicial: number): number {
  return (
    saldoInicial +
    transactions.reduce((soma, t) => soma + (t.type === 'in' ? Number(t.amount) : -Number(t.amount)), 0)
  );
}
function diasRestantesNoMes(hoje: Date): number {
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  return Math.max(1, ultimoDia - hoje.getDate() + 1);
}

/**
 * Livre/dia = (saldo acumulado − contas pendentes do mês − total guardado em
 * cofrinhos) / dias restantes. É a fonte única para a Home e os widgets.
 *
 * `saldoInicial` é a soma de `initial_balance` das carteiras em escopo (uma
 * carteira selecionada, ou todas quando a visão é "Total") — sem parâmetro
 * padrão de propósito: um valor esquecido vira 0 em silêncio, e silêncio
 * aqui é exatamente o defeito que gerou o achado A12.
 */
export function calcularSafeToSpend(
  transactions: Transaction[],
  bills: Bill[],
  goals: Goal[],
  saldoInicial: number,
  hoje: Date = new Date()
): SafeToSpend {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const saldoAtual = calcularSaldoAtual(transactions, saldoInicial);
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
