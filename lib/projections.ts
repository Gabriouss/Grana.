import { ARQUETIPOS, type ArquetipoId } from './diagnostico';
import type { Bill, Budget, Goal, Transaction } from './types';

/**
 * Inteligência e Projeções Preditivas — Épico 2 do PLANO_DE_EVOLUCAO.md.
 */

/* ── Safe-to-Spend ("Livre para gastar por dia") ──────────────────────────── */

export type SafeToSpend = {
  saldoAtual: number;
  contasFixasPendentes: number;
  reservadoEmMetas: number;
  diasRestantes: number;
  livreTotal: number;
  livrePorDia: number;
};

/**
 * "Saldo atual" — como o Grana. não tem conta bancária vinculada, é a soma
 * de entradas menos saídas DO MÊS (o mesmo mês usado para contas pendentes e
 * dias restantes), não do histórico inteiro. A primeira versão somava todos
 * os lançamentos desde o primeiro registro, o que inflava o "livre para
 * gastar" com meses passados e não batia com o saldo do mês mostrado em
 * Lançamentos — corrigido a pedido do autor, que esperava ver o saldo do mês
 * atual aqui, não um acumulado histórico.
 */
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
 * Livre/dia = (Saldo Atual − Contas Fixas Pendentes no Mês − Aportes em
 * Metas) / Dias restantes até o fim do mês — fórmula do PLANO_DE_EVOLUCAO.md.
 *
 * "Aportes em Metas" aqui é o total já guardado em TODOS os cofrinhos (não
 * só depósitos deste mês): depósitos em metas não geram uma saída em
 * `transactions` (ver depositToGoal em lib/goals.ts), e não existe histórico
 * de QUANDO cada depósito aconteceu — só o saldo atual de cada cofrinho. Usar
 * o total é a leitura conservadora: nunca mostra como "livre" um dinheiro que
 * a pessoa já decidiu separar para outra coisa, mesmo que tenha sido guardado
 * mês passado.
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

  const reservadoEmMetas = goals.reduce((soma, g) => soma + Number(g.current_amount), 0);

  const diasRestantes = diasRestantesNoMes(hoje);
  const livreTotal = Math.max(0, saldoAtual - contasFixasPendentes - reservadoEmMetas);
  const livrePorDia = livreTotal / diasRestantes;

  return { saldoAtual, contasFixasPendentes, reservadoEmMetas, diasRestantes, livreTotal, livrePorDia };
}

/* ── Projeção de comprometimento futuro (linha do tempo de 6 meses) ───────── */

export type MesProjetado = {
  ano: number;
  mes: number; // 0-11
  label: string;
  contasRecorrentes: number;
  parcelasFuturas: number;
  total: number;
};

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Soma, para cada um dos próximos `meses` (padrão 6, incluindo o atual):
 *  - Contas marcadas como recorrentes: contam em TODO mês futuro pelo valor
 *    atual, já que só a próxima ocorrência existe como linha no banco (a
 *    seguinte só é criada quando esta for paga — ver payBill em lib/data.ts).
 *  - Parcelas futuras de compras parceladas: `addInstallmentPurchase`
 *    (lib/data.ts) já insere TODAS as parcelas como transações reais, cada
 *    uma na sua data futura — aqui é só somar por mês as que têm
 *    installment_total > 1.
 */
export function projetarComprometimentoFuturo(
  transactions: Transaction[],
  bills: Bill[],
  meses: number = 6,
  hoje: Date = new Date()
): MesProjetado[] {
  const contasRecorrentes = bills.filter((b) => b.recurring);
  const totalRecorrentes = contasRecorrentes.reduce((soma, b) => soma + Number(b.amount), 0);

  const parcelasFuturas = transactions.filter((t) => t.type === 'out' && (t.installment_total ?? 1) > 1);

  const resultado: MesProjetado[] = [];
  for (let i = 0; i < meses; i++) {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const ano = ref.getFullYear();
    const mes = ref.getMonth();

    const totalParcelas = parcelasFuturas
      .filter((t) => {
        const d = new Date(t.occurred_on + 'T00:00:00');
        return d.getFullYear() === ano && d.getMonth() === mes;
      })
      .reduce((soma, t) => soma + Number(t.amount), 0);

    resultado.push({
      ano,
      mes,
      label: MESES_ABREV[mes],
      contasRecorrentes: totalRecorrentes,
      parcelasFuturas: totalParcelas,
      total: totalRecorrentes + totalParcelas,
    });
  }
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

  const hojeStr = hoje.toISOString().slice(0, 10);
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
