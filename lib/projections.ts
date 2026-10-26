import { ARQUETIPOS, type ArquetipoId } from './diagnostico';
import type { Bill, Budget, CreditCard, CreditCardInvoicePayment, Transaction } from './types';
import { creditoSemCartao, isCreditTx } from './transaction-rules';
import { isoLocal } from './format';
import { cicloDoLancamento, lancamentosDaCarteira } from './creditoFaturas';
import { dataVencimentoFatura } from './faturaCiclo';

export { calcularSafeToSpend, calcularSaldoAtual } from './safe-to-spend';
export type { SafeToSpend } from './safe-to-spend';

/**
 * Inteligência e Projeções Preditivas — Épico 2 do PLANO_DE_EVOLUCAO.md.
 */

/* ── Projeção de comprometimento futuro (linha do tempo de 6 meses) ───────── */

export type MesProjetado = {
  ano: number;
  mes: number; // 0-11
  label: string;
  contasRecorrentes: number;
  parcelasFuturas: number;
  total: number;
  /** Parcela cuja compra original não foi carregada e impede confirmar o ciclo. */
  incompleto?: boolean;
};

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type ContextoComprometimento = {
  cards?: CreditCard[];
  payments?: CreditCardInvoicePayment[];
  walletId?: string;
};

const centavos = (valor: number) => Math.round(Number(valor) * 100);

/** Uma ocorrência por série/competência; a última define valor, carteira e continuidade. */
function recorrentesPorMes(bills: Bill[], competencias: string[], walletId: string): number[] {
  const series = new Map<string, Bill[]>();
  for (const b of new Map(bills.map(b => [b.id, b])).values()) {
    if (!b.due_date) continue;
    const chave = `${b.user_id ?? ''}:${b.parent_id ?? b.id}`;
    const serie = series.get(chave) ?? [];
    serie.push(b);
    series.set(chave, serie);
  }
  const totais = competencias.map(() => 0);
  for (const serie of series.values()) {
    if (!serie.some(b => b.recurring)) continue;
    serie.sort((a, b) => b.due_date.localeCompare(a.due_date) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || b.id.localeCompare(a.id));
    competencias.forEach((mes, i) => {
      const existente = serie.find(b => b.due_date.slice(0, 7) === mes);
      const anterior = existente ?? serie.find(b => b.due_date.slice(0, 7) < mes);
      if (!anterior || (walletId !== 'total' && anterior.wallet_id !== walletId)) return;
      // Paga não é compromisso pendente; desmarcar a última ocorrência encerra a previsão.
      if (existente ? existente.status === 'paid' : !anterior.recurring) return;
      totais[i] += centavos(anterior.amount);
    });
  }
  return totais;
}

/** Seis competências incluindo a atual, por vencimento, sem gerar dados financeiros.
 * Passe as listas completas e o contexto do cartão para resolver faturas e carteira.
 * Sem cartões no contexto, chamadas antigas mantêm o mês civil das parcelas.
 */
export function projetarComprometimentoFuturo(
  transactions: Transaction[],
  bills: Bill[],
  meses: number = 6,
  hoje: Date = new Date(),
  contexto: ContextoComprometimento = {}
): MesProjetado[] {
  const resultado: MesProjetado[] = [];
  for (let i = 0; i < meses; i++) {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    resultado.push({ ano: ref.getFullYear(), mes: ref.getMonth(), label: MESES_ABREV[ref.getMonth()], contasRecorrentes: 0, parcelasFuturas: 0, total: 0 });
  }
  const walletId = contexto.walletId ?? 'total';
  const recorrentes = recorrentesPorMes(bills, resultado.map(m => `${m.ano}-${String(m.mes + 1).padStart(2, '0')}`), walletId);
  const transacoes = [...new Map(transactions.map(t => [t.id, t])).values()];
  const cards = contexto.cards ?? [];
  const daCarteira = new Set(lancamentosDaCarteira(transacoes, cards, walletId).map(t => t.id));
  const datas = new Map(transacoes.filter(t => (t.installment_current ?? 1) === 1).map(t => [t.id, t.occurred_on]));
  const pagamentos = contexto.payments ?? [];
  const saidasDePagamento = new Set([
    ...bills.map(b => b.paid_transaction_id),
    ...pagamentos.flatMap(p => [p.paid_transaction_id, ...(p.extra_transaction_ids ?? [])]),
  ].filter(Boolean));
  const indice = (data: Date) => (data.getFullYear() - hoje.getFullYear()) * 12 + data.getMonth() - hoje.getMonth();
  const faturas = new Map<string, { indice: number; total: number; parcelas: number; pago: number; incerto: boolean }>();
  for (const t of transacoes) {
    if (t.type !== 'out' || creditoSemCartao(t) || saidasDePagamento.has(t.id)) continue;
    const parcelada = (t.installment_total ?? 1) > 1;
    if (isCreditTx(t) && contexto.cards !== undefined) {
      const card = cards.find(c => c.id === t.card_id);
      if (!card) continue; // Cartão excluído preserva histórico, não projeta vencimento.
      const { ciclo, incerto } = cicloDoLancamento(t, card, datas);
      const i = indice(dataVencimentoFatura(ciclo.year, ciclo.month, card.due_day, card.closing_day));
      if (!resultado[i]) continue;
      const chave = `${card.id}:${ciclo.year}:${ciclo.month}`;
      let fatura = faturas.get(chave);
      if (!fatura) {
        const pago = pagamentos.filter(p => p.card_id === card.id && p.year === ciclo.year && p.month === ciclo.month && p.paid_on <= isoLocal(hoje))
          .reduce((s, p) => s + centavos(p.amount), 0);
        fatura = { indice: i, total: 0, parcelas: 0, pago, incerto: false };
        faturas.set(chave, fatura);
      }
      fatura.total += centavos(t.amount);
      if (parcelada && daCarteira.has(t.id)) {
        fatura.parcelas += centavos(t.amount);
        fatura.incerto ||= incerto;
      }
    } else if (parcelada && daCarteira.has(t.id)) {
      const i = indice(new Date(t.occurred_on + 'T00:00:00'));
      if (resultado[i]) resultado[i].parcelasFuturas += centavos(t.amount);
    }
  }
  for (const fatura of faturas.values()) {
    // Pagamento é da fatura inteira; parcelas não podem exceder o saldo ainda devido.
    resultado[fatura.indice].parcelasFuturas += Math.max(0, Math.min(fatura.parcelas, fatura.total - fatura.pago));
    if (fatura.incerto) resultado[fatura.indice].incompleto = true;
  }
  resultado.forEach((m, i) => {
    m.contasRecorrentes = recorrentes[i] / 100;
    m.total = (recorrentes[i] + m.parcelasFuturas) / 100;
    m.parcelasFuturas /= 100;
  });
  return resultado;
}

/* ── Evolução contínua de arquétipo ────────────────────────────────────────
 *
 * O diagnóstico inicial (lib/diagnostico.ts) classifica por autorrelato, uma
 * vez só. Aqui a leitura é pelo comportamento real dos últimos meses — e só
 * SUGERE uma mudança, nunca troca o arquétipo salvo sozinha: reatribuir a
 * identidade financeira da pessoa sem ela perceber seria mais estranho do
 * que útil, e o orçamento sugerido (calcularOrcamento) depende do arquétipo
 * guardado permanecer estável até a pessoa decidir refazer o diagnóstico.
 *
 * "Estrategista" no diagnóstico original é uma condição estrutural (renda
 * variável), não um degrau de maturidade — por isso ele só é sugerido aqui
 * quando a renda mensal realmente varia muito mês a mês, nunca como
 * "prêmio" por bom comportamento.
 */

export type SugestaoArquetipo = {
  sugeridoId: ArquetipoId;
  mudou: boolean;
};

function coeficienteDeVariacao(valores: number[]): number {
  if (valores.length < 2) return 0;
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  if (media <= 0) return 0;
  const variancia = valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length;
  return Math.sqrt(variancia) / media;
}

/** Início (inclusive) e fim (exclusivo) dos últimos `n` meses completos, sem contar o mês atual. */
function ultimosMesesCompletos(n: number, hoje: Date): { ano: number; mes: number }[] {
  const lista: { ano: number; mes: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    lista.push({ ano: ref.getFullYear(), mes: ref.getMonth() });
  }
  return lista;
}

export function sugerirEvolucaoArquetipo(
  transactions: Transaction[],
  bills: Bill[],
  budgets: Budget[],
  arquetipoAtualId: ArquetipoId,
  hoje: Date = new Date()
): SugestaoArquetipo | null {
  const meses = ultimosMesesCompletos(3, hoje);
  if (meses.length < 2) return null;

  const porMes = meses.map(({ ano, mes }) => {
    const doMes = transactions.filter((t) => {
      const d = new Date(t.occurred_on + 'T00:00:00');
      return d.getFullYear() === ano && d.getMonth() === mes;
    });
    const totalIn = doMes.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
    const totalOut = doMes.filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);
    return { totalIn, totalOut };
  });

  const rendasMensais = porMes.map((m) => m.totalIn).filter((v) => v > 0);
  if (rendasMensais.length < 2) return null; // sem renda registrada o suficiente, não há base pra sugerir nada

  const variacaoRenda = coeficienteDeVariacao(rendasMensais);

  const somaIn = porMes.reduce((s, m) => s + m.totalIn, 0);
  const somaOut = porMes.reduce((s, m) => s + m.totalOut, 0);
  const taxaPoupanca = somaIn > 0 ? (somaIn - somaOut) / somaIn : 0;

  const hojeStr = isoLocal(hoje);
  const contasAtrasadas = bills.filter((b) => b.status === 'due' && b.due_date < hojeStr).length;
  const parcelasAtivas = transactions.some((t) => t.type === 'out' && (t.installment_total ?? 1) > 1);
  const creditoEmRisco = contasAtrasadas > 0 || parcelasAtivas;

  let orcamentoOk = true;
  if (budgets.length > 0) {
    const gastoPorCategoria: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'out')
      .forEach((t) => {
        gastoPorCategoria[t.category] = (gastoPorCategoria[t.category] || 0) + Number(t.amount);
      });
    const dentroDoLimite = budgets.filter((b) => (gastoPorCategoria[b.category] || 0) <= Number(b.amount) * 3).length;
    orcamentoOk = dentroDoLimite / budgets.length >= 0.7;
  }

  let sugeridoId: ArquetipoId;
  if (variacaoRenda > 0.3) {
    sugeridoId = 'estrategista';
  } else if (creditoEmRisco) {
    sugeridoId = 'resgate';
  } else if (taxaPoupanca >= 0.15 && orcamentoOk) {
    sugeridoId = 'otimizador';
  } else {
    sugeridoId = 'construtor';
  }

  return { sugeridoId, mudou: sugeridoId !== arquetipoAtualId };
}

export { ARQUETIPOS };
