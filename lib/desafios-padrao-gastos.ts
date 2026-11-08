/**
 * "Padrão de gastos" dos Desafios (fase 2): função pura, sem tela.
 *
 * DEFINIÇÃO DE GASTO (decisão de 01/11/2026, spec da fase 2): consumo no dia
 * em que ocorreu. É `type = 'out'` na data `occurred_on`, com `occurred_on <=
 * hoje`, INCLUINDO a compra no crédito (conta no dia da compra) e EXCLUINDO o
 * pagamento da fatura, senão a compra contaria em dobro.
 *
 * Diferença deliberada para o "Gastos por categoria" da Início: aquele usa o
 * caixa (`isCreditTx` fora até a fatura ser paga). Aqui o dia da compra é o
 * que a pessoa reconhece. Fora isso a definição é a mesma: toda saída conta,
 * inclusive a categoria Investimentos (o app a trata como saída), e entrada
 * nunca abate gasto. Este bloco não toca em "Saldo" nem "Livre" (regra 20).
 *
 * Aporte em cofrinho/meta não é lançamento (`goals.current_amount`), então não
 * chega aqui. O app não tem tipo "transferência".
 *
 * Mês é 0-indexado. Valores em reais; as contas são feitas em centavos.
 */
import { formatBRL, isoLocal } from './format';
import { diasNoMes } from './desafios-calendario';
import {
  CATEGORIA_PAGAMENTO_FATURA,
  apurarGastosCategoria,
  ehPagamentoDeFatura,
  type LinhaDeGasto,
  type PagamentosConhecidos,
  type SaidaDeConsumo,
} from './gastos-categoria';

export { CATEGORIA_PAGAMENTO_FATURA, ehPagamentoDeFatura };
export type { PagamentosConhecidos, SaidaDeConsumo };

/** Mínimos para o bloco existir. */
export const MIN_SAIDAS = 8;
export const MIN_DIAS_DISTINTOS = 5;
export const MIN_DIAS_VIVIDOS = 8;
/** Diferença menor que isto entre médias = "parecidas". */
export const LIMIAR_EMPATE = 0.05;

/** Saídas de consumo do mês, até hoje (a classificação mora em `gastos-categoria`). */
export function saidasDeConsumo(
  transacoes: ReadonlyArray<LinhaDeGasto>,
  ano: number,
  mes: number,
  hoje: Date = new Date(),
  conhecidos: PagamentosConhecidos = {}
): SaidaDeConsumo[] {
  const inicio = isoLocal(new Date(ano, mes, 1));
  const ultimo = isoLocal(new Date(ano, mes + 1, 0));
  const hojeISO = isoLocal(hoje);
  return apurarGastosCategoria(transacoes, {
    inicio,
    fim: hojeISO < ultimo ? hojeISO : ultimo,
    idsPagamentos: conhecidos.idsDePagamento,
  }).saidas;
}

/**
 * Gasto do mês por categoria, débito e crédito JUNTOS (crédito no dia da
 * compra, fatura paga fora). Reaproveitável por quem precisar da mesma soma;
 * é a mesma lista de `saidasDeConsumo` que alimenta o padrão, então os dois
 * nunca divergem. Valores em reais, maior primeiro.
 */
export function gastosPorCategoria(
  transacoes: ReadonlyArray<LinhaDeGasto>,
  ano: number,
  mes: number,
  hoje: Date = new Date(),
  conhecidos: PagamentosConhecidos = {}
): { category: string; color?: string; amount: number }[] {
  const acc = new Map<string, { category: string; color?: string; centavos: number }>();
  for (const s of saidasDeConsumo(transacoes, ano, mes, hoje, conhecidos)) {
    const a = acc.get(s.category) ?? { category: s.category, color: s.color, centavos: 0 };
    a.centavos += s.centavos;
    acc.set(s.category, a);
  }
  return [...acc.values()]
    .sort((a, b) => b.centavos - a.centavos)
    .map((a) => ({ category: a.category, color: a.color, amount: a.centavos / 100 }));
}

export type Periodo = {
  /** "quinzena" tem `rotulo` "primeira" ou "segunda". */
  rotulo: string;
  inicio: string;
  fim: string;
  /** Dias do período já vividos dentro do mês. */
  dias: number;
  total: number;
  mediaPorDia: number;
};

export type Veredito<P> = { tipo: 'maior'; periodo: P; outro: P } | { tipo: 'parecidas'; periodos: P[] };

export type PadraoDeGastos = {
  ano: number;
  mes: number;
  totalDoMes: number;
  quinzena: Veredito<Periodo> | null;
  semana: Veredito<Periodo> | null;
  dia: { iso: string; total: number } | null;
  /** Frases prontas (sem adjetivo e sem conselho); a tela só pinta. */
  frases: { quinzena?: string; semana?: string; dia?: string };
};

const dd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** R$ colado ao número (espaço inquebrável), em centavos. */
const brl = (c: number) => formatBRL(c / 100);

function isoDoDia(ano: number, mes: number, dia: number): string {
  return isoLocal(new Date(ano, mes, dia));
}

function somar(saidas: SaidaDeConsumo[], inicio: string, fim: string): number {
  let t = 0;
  for (const s of saidas) if (s.iso >= inicio && s.iso <= fim) t += s.centavos;
  return t;
}

function periodo(saidas: SaidaDeConsumo[], rotulo: string, inicio: string, fim: string, dias: number): Periodo {
  const total = somar(saidas, inicio, fim);
  return { rotulo, inicio, fim, dias, total, mediaPorDia: dias > 0 ? total / dias : 0 };
}

function comparar(periodos: Periodo[]): Veredito<Periodo> | null {
  if (periodos.length < 2) return null;
  const ordenados = [...periodos].sort((a, b) => b.mediaPorDia - a.mediaPorDia);
  const [primeiro, segundo] = ordenados;
  const base = Math.max(primeiro.mediaPorDia, segundo.mediaPorDia);
  if (base === 0 || (primeiro.mediaPorDia - segundo.mediaPorDia) / base < LIMIAR_EMPATE) {
    return { tipo: 'parecidas', periodos };
  }
  return { tipo: 'maior', periodo: primeiro, outro: segundo };
}

/**
 * Padrão do mês, ou `null` quando o bloco não deve existir:
 * menos de 8 saídas de consumo, em menos de 5 dias diferentes, ou mês vivido
 * há menos de 8 dias.
 */
export function calcularPadraoDeGastos(
  transacoes: ReadonlyArray<LinhaDeGasto>,
  ano: number,
  mes: number,
  hoje: Date = new Date(),
  conhecidos: PagamentosConhecidos = {}
): PadraoDeGastos | null {
  const total = diasNoMes(ano, mes);
  const hojeISO = isoLocal(hoje);
  const ultimoISO = isoDoDia(ano, mes, total);
  const primeiroISO = isoDoDia(ano, mes, 1);
  if (hojeISO < primeiroISO) return null;
  const emAndamento = hojeISO < ultimoISO;
  const vividos = emAndamento ? hoje.getDate() : total;
  if (vividos < MIN_DIAS_VIVIDOS) return null;

  const saidas = saidasDeConsumo(transacoes, ano, mes, hoje, conhecidos);
  const diasDistintos = new Set(saidas.map((s) => s.iso)).size;
  if (saidas.length < MIN_SAIDAS || diasDistintos < MIN_DIAS_DISTINTOS) return null;

  // Quinzenas: 1 a 15 e 16 ao fim. A segunda só entra no mês em andamento do dia 21 em diante.
  const p1 = periodo(saidas, 'primeira', primeiroISO, isoDoDia(ano, mes, 15), Math.min(15, vividos));
  const diasP2 = Math.max(0, vividos - 15);
  const p2 = periodo(saidas, 'segunda', isoDoDia(ano, mes, 16), ultimoISO, diasP2);
  const mostraQuinzena = !emAndamento || (hoje.getDate() >= 21 && diasP2 >= 5);
  const quinzena = mostraQuinzena && diasP2 > 0 ? comparar([p1, p2]) : null;

  // Semanas (segunda a domingo): só com pelo menos 4 dias dentro do mês e já vividos.
  const semanas: Periodo[] = [];
  for (let dia = 1; dia <= total; ) {
    const d = new Date(ano, mes, dia);
    const doDomingo = (7 - ((d.getDay() + 6) % 7)) - 1; // dias até domingo
    const fimDia = Math.min(total, dia + doDomingo);
    const dentro = fimDia - dia + 1;
    const fimISO = isoDoDia(ano, mes, fimDia);
    const vividosNaSemana = Math.min(fimDia, vividos) - dia + 1;
    if (dentro >= 4 && vividosNaSemana >= 4 && isoDoDia(ano, mes, dia) <= hojeISO) {
      const completa = vividosNaSemana === dentro;
      if (completa || !emAndamento) {
        semanas.push(periodo(saidas, `${dd(isoDoDia(ano, mes, dia))} a ${dd(fimISO)}`, isoDoDia(ano, mes, dia), fimISO, dentro));
      }
    }
    dia = fimDia + 1;
  }
  const semana = !emAndamento || semanas.length >= 2 ? comparar(semanas) : null;

  // Dia de maior gasto; empate fica com o mais recente.
  const porDia = new Map<string, number>();
  for (const s of saidas) porDia.set(s.iso, (porDia.get(s.iso) ?? 0) + s.centavos);
  let dia: { iso: string; total: number } | null = null;
  for (const [iso, t] of porDia) {
    if (!dia || t > dia.total || (t === dia.total && iso > dia.iso)) dia = { iso, total: t };
  }

  const totalDoMes = saidas.reduce((s, x) => s + x.centavos, 0);
  const frases: PadraoDeGastos['frases'] = {};
  if (quinzena) {
    frases.quinzena =
      quinzena.tipo === 'parecidas'
        ? 'As duas quinzenas tiveram gastos parecidos por dia.'
        : `A ${quinzena.periodo.rotulo} quinzena teve a maior média diária: ${brl(quinzena.periodo.mediaPorDia)} por dia, contra ${brl(quinzena.outro.mediaPorDia)} na ${quinzena.outro.rotulo}.`;
  }
  if (semana) {
    frases.semana =
      semana.tipo === 'parecidas'
        ? 'As semanas tiveram gastos parecidos por dia.'
        : `A semana de ${semana.periodo.rotulo} teve a maior média diária: ${brl(semana.periodo.mediaPorDia)} por dia.`;
  }
  if (dia) frases.dia = `O dia de maior gasto foi ${dd(dia.iso)}, com ${brl(dia.total)}.`;

  return {
    ano,
    mes,
    totalDoMes: totalDoMes / 100,
    quinzena: quinzena && mapear(quinzena),
    semana: semana && mapear(semana),
    dia: dia && { iso: dia.iso, total: dia.total / 100 },
    frases,
  };
}

/** Totais dos períodos saem em reais para a tela; a decisão foi tomada em centavos. */
function mapear(v: Veredito<Periodo>): Veredito<Periodo> {
  const r = (p: Periodo): Periodo => ({ ...p, total: p.total / 100, mediaPorDia: p.mediaPorDia / 100 });
  return v.tipo === 'maior'
    ? { tipo: 'maior', periodo: r(v.periodo), outro: r(v.outro) }
    : { tipo: 'parecidas', periodos: v.periodos.map(r) };
}
