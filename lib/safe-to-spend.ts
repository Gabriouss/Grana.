import { calcularLivre, entraNoCaixaDoMes, type ContextoLivre } from '../supabase/functions/_shared/livre-para-gastar';
import type { Goal, Transaction } from './types';

export type SafeToSpend = {
  saldoAtual: number;
  /** Entradas de caixa do mês com data depois de hoje (07/11/2026). */
  entradasPrevistas: number;
  reservadoEmMetas: number;
  /** Entradas do mês (inclusive previstas) menos saídas do mês, sem nada positivo. */
  semSaldo: boolean;
  diasRestantes: number;
  livreTotal: number;
  livrePorDia: number;
};

/* Regra 20: pedido expresso de 07/11/2026; entradas do mes contam desde o dia 1,
   guardado do mes abate, credito so desconta quando a fatura e paga. Cofrinho
   anterior, initial_balance e boleto pendente ficam fora. */

function chaveDoMes(hoje: Date): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function isoDeHoje(hoje: Date): string {
  return `${chaveDoMes(hoje)}-${String(hoje.getDate()).padStart(2, '0')}`;
}

/** Lançamentos de CAIXA do mês de `hoje`, os do "Saldo atual": sem crédito;
 *  entrada só a partir da sua data, saída futura do mesmo mês já conta (regra
 *  20, 01/11/2026). Mesmo predicado do núcleo (`entraNoCaixaDoMes`). O Livre
 *  conta também as entradas futuras do mês (07/11/2026). */
export function transacoesDeCaixaDoMes(transactions: Transaction[], hoje: Date = new Date()): Transaction[] {
  const hojeISO = isoDeHoje(hoje);
  return transactions.filter((t) => entraNoCaixaDoMes(t, hojeISO));
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
  return calcularLivre(transactions, goals, isoDeHoje(hoje), contexto);
}
