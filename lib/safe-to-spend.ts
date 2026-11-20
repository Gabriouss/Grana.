import { calcularLivre, entraNoCaixaDoMes, type ContextoLivre } from '../supabase/functions/_shared/livre-para-gastar';
import type { Goal, Transaction } from './types';

export type SafeToSpend = {
  saldoAtual: number;
  /** Sobra do mês anterior confirmada pela pessoa (zero sem confirmação). Já
   *  está somada em `saldoAtual` (rodada 2, 07/11/2026). */
  sobraConfirmada: number;
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

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Inclui sobra de outubro" (autor, 20/11/2026) para a sobra confirmada em
 *  `mes` ("AAAA-MM"): o nome é o do mês anterior, de onde o dinheiro sobrou.
 *  Mesmo texto no Livre da Início e no resumo de Lançamentos. */
export function rotuloDaSobraIncluida(mes: string = chaveDoMes(new Date())): string {
  return `Inclui sobra de ${mesDaSobra(mes)}`;
}

/** Sobra sem valor conhecido no aparelho (Supremo, 20/11/2026). */
export function rotuloDaSobraIndisponivel(mes: string, semConexao: boolean): string {
  return `Sobra de ${mesDaSobra(mes)} indisponível ${semConexao ? 'sem conexão' : 'agora'}`;
}

function mesDaSobra(mes: string): string {
  return MESES[(Number(mes.slice(5, 7)) + 10) % 12];
}

export function calcularSafeToSpend(
  transactions: Transaction[], goals: Goal[], hoje: Date = new Date(), contexto: ContextoLivre = {},
): SafeToSpend {
  return calcularLivre(transactions, goals, isoDeHoje(hoje), contexto);
}
export { mesAnterior, sugerirSobraDoMesAnterior } from '../supabase/functions/_shared/livre-para-gastar';
