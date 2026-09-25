import { isCreditTx } from './transaction-rules';
import type { Goal, Transaction } from './types';

export type SafeToSpend = {
  saldoAtual: number;
  reservadoEmMetas: number;
  diasRestantes: number;
  livreTotal: number;
  livrePorDia: number;
};

/* ── Regra 20 do AGENTS.md ────────────────────────────────────────────────
   "Saldo atual" e "Livre para gastar" usam SÓ o mês vigente: nunca saldo
   de meses anteriores, nunca `initial_balance` (decisão do autor em
   24/09/2026: "não quero saldo acumulado, quero saldo apenas do mês
   vigente"). O `867e1b5` (19/09, achado A12) tinha feito o contrário, e com
   histórico importado incompleto o "saldo" ficou sem relação com o dinheiro
   da pessoa. A lição do A12 continua: a palavra "saldo" tem um número só, e
   ele sai daqui para a Início e para os widgets.

   Compra no crédito fica fora do caixa; a fatura entra como saída no mês em
   que é paga (a saída do pagamento não é crédito). Boleto pendente ou
   atrasado também fica fora (autor, 25/09/2026): ele pesa quando é marcado
   pago, porque `pagar_conta` grava a saída de caixa e `reabrir_conta` a
   apaga, então o valor nunca conta duas vezes nem nenhuma. Qualquer mudança nesta
   conta exige pedido explícito do autor, e a trava
   `__tests__/regra-20-saldo-do-mes.cjs` não se afrouxa para passar. */

function chaveDoMes(hoje: Date): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

/** Lançamentos de CAIXA (sem crédito) com data dentro do mês de `hoje`. */
export function transacoesDeCaixaDoMes(transactions: Transaction[], hoje: Date = new Date()): Transaction[] {
  const mes = chaveDoMes(hoje);
  return transactions.filter(
    (t) => !isCreditTx(t) && typeof t.occurred_on === 'string' && t.occurred_on.slice(0, 7) === mes
  );
}

/** Entradas menos saídas de caixa do mês vigente. */
export function calcularSaldoAtual(transactions: Transaction[], hoje: Date = new Date()): number {
  return transacoesDeCaixaDoMes(transactions, hoje).reduce(
    (soma, t) => soma + (t.type === 'in' ? Number(t.amount) : -Number(t.amount)),
    0
  );
}

function diasRestantesNoMes(hoje: Date): number {
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  return Math.max(1, ultimoDia - hoje.getDate() + 1);
}

/**
 * Livre/dia = (saldo do mês − total guardado em cofrinhos) / dias restantes.
 * Sem boletos (ver acima). Fonte única para a Início e os widgets.
 */
export function calcularSafeToSpend(
  transactions: Transaction[],
  goals: Goal[],
  hoje: Date = new Date()
): SafeToSpend {
  const saldoAtual = calcularSaldoAtual(transactions, hoje);
  const reservadoEmMetas = goals.reduce((soma, goal) => soma + Number(goal.current_amount), 0);
  const diasRestantes = diasRestantesNoMes(hoje);
  const livreTotal = Math.max(0, saldoAtual - reservadoEmMetas);

  return {
    saldoAtual,
    reservadoEmMetas,
    diasRestantes,
    livreTotal,
    livrePorDia: livreTotal / diasRestantes,
  };
}
