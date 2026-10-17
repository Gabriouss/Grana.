import { calcularLivre, type ContextoLivre } from '../supabase/functions/_shared/livre-para-gastar';
import { isCreditTx } from './transaction-rules';
import type { Goal, Transaction } from './types';

export type SafeToSpend = {
  saldoAtual: number;
  creditoNaoPago: number;
  reservadoEmMetas: number;
  diasRestantes: number;
  livreTotal: number;
  livrePorDia: number;
};

/* Regra 20: pedido expresso de 17/10/2026; reserva do mes e credito nao pago
   abatem Livre. Cofrinho anterior, initial_balance e boleto pendente ficam fora. */

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

/** "1 dia restante" / "N dias restantes". Mesmo texto no Granabô
    (`supabase/functions/_shared/caixa.ts`) e no widget
    (`WidgetText.diasRestantes`), conferido em __tests__/dias-restantes-singular.cjs. */
export function rotuloDiasRestantes(dias: number): string {
  return dias === 1 ? '1 dia restante' : `${dias} dias restantes`;
}

export function calcularSafeToSpend(
  transactions: Transaction[], goals: Goal[], hoje: Date = new Date(), contexto: ContextoLivre = {},
): SafeToSpend {
  const hojeISO = `${chaveDoMes(hoje)}-${String(hoje.getDate()).padStart(2, '0')}`;
  return calcularLivre(transactions, goals, hojeISO, contexto);
}
