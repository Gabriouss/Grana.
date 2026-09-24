/**
 * Ciclo de fatura do cartão de crédito — a que fatura um lançamento
 * pertence, e quando ela fecha/vence, a partir de `closing_day`/`due_day`
 * do cartão (`credit_cards`, já existem desde que a aba Crédito existe).
 *
 * Design aprovado em `docs/superpowers/specs/2026-09-03-ciclo-fatura-cartao-design.md`.
 * Antes desta função, `app/(app)/credito.tsx` decidia a fatura de um
 * lançamento só por `isSameMonth(occurred_on, ano, mes)` — mês civil, não
 * ciclo de fechamento. Um cartão que fecha dia 19 (ex.: C6) via a fatura
 * "trocar" no dia 1 do calendário, não no dia 19 real.
 *
 * `month` é sempre 0-indexado (0 = janeiro), igual ao resto do app
 * (`Date.getMonth()`, `isSameMonth` em `lib/format.ts`) — nunca 1-indexado.
 * Puro, sem I/O — mesmo padrão de módulo que `lib/recorrencia.ts`.
 *
 * O Granabô tem uma cópia desta aritmética em
 * `supabase/functions/_shared/fatura-ciclo.ts`, porque a Edge Function não
 * importa de fora de `supabase/functions/`. As duas são travadas pelo
 * `__tests__/paridade-fatura-ciclo.ts`: mudou aqui, muda lá.
 */

export type CicloFatura = { year: number; month: number };

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function diasNoMes(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Dia do mês em que um dia configurado (fechamento ou vencimento) cai de
 * fato. "Fecha dia 31" em fevereiro fecha no último dia de fevereiro, como
 * nos bancos. Sem este limite, `new Date(2027, 1, 31)` virava 3 de março e a
 * fatura de fevereiro aparecia como "31 jan a 2 mar" (achado de 23/09/2026).
 */
function diaEfetivo(year: number, month: number, dia: number): number {
  return Math.min(dia, diasNoMes(year, month));
}

/** Data em que a fatura de (`year`, `month`) fecha. `month` pode sair de 0-11: o `Date` rola o ano. */
export function dataDeFechamento(year: number, month: number, closingDay: number): Date {
  const ref = new Date(year, month, 1);
  return new Date(ref.getFullYear(), ref.getMonth(), diaEfetivo(ref.getFullYear(), ref.getMonth(), closingDay));
}

/**
 * A que fatura (ano/mês de FECHAMENTO) um lançamento pertence.
 *
 * Regra de corte: um lançamento no PRÓPRIO dia do fechamento já entra na
 * PRÓXIMA fatura — quem fecha dia 19 e compra dia 19 só vê essa compra na
 * fatura que fecha no mês seguinte, não na que fecha hoje. O dia de
 * fechamento é o efetivo daquele mês (ver `diaEfetivo`).
 */
export function mesFaturaDoLancamento(occurredOn: string, closingDay: number): CicloFatura {
  const [y, m, d] = occurredOn.split('-').map(Number); // m sai do ISO 1-indexado
  const mes0 = m - 1;
  // `mes0 + 1` = 12 em dezembro: `new Date(y, 12, 1)` rola o ano sozinho.
  const fechamento = new Date(y, d < diaEfetivo(y, mes0, closingDay) ? mes0 : mes0 + 1, 1);
  return { year: fechamento.getFullYear(), month: fechamento.getMonth() };
}

/**
 * Janela de datas (ISO, meio-aberta: inclui `inicio`, exclui `fim`) que
 * cobre os lançamentos de uma fatura — do fechamento do mês anterior até a
 * véspera do fechamento do mês da fatura.
 */
export function janelaFatura(year: number, month: number, closingDay: number): { inicio: string; fim: string } {
  return {
    inicio: iso(dataDeFechamento(year, month - 1, closingDay)),
    fim: iso(dataDeFechamento(year, month, closingDay)),
  };
}

/** Rótulo compacto do intervalo real da fatura, com o fim exclusivo ajustado. */
export function rotuloPeriodoFatura(year: number, month: number, closingDay: number): string {
  const { inicio, fim } = janelaFatura(year, month, closingDay);
  const [anoInicio, mesInicio, diaInicio] = inicio.split('-').map(Number);
  const [anoFim, mesFim, diaFim] = fim.split('-').map(Number);
  const fimInclusivo = new Date(anoFim, mesFim - 1, diaFim - 1);
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const anoNecessario = anoInicio !== fimInclusivo.getFullYear();
  const inicioLabel = `${diaInicio} ${meses[mesInicio - 1]}${anoNecessario ? ` ${anoInicio}` : ''}`;
  const fimLabel = `${fimInclusivo.getDate()} ${meses[fimInclusivo.getMonth()]}${
    anoNecessario ? ` ${fimInclusivo.getFullYear()}` : ''
  }`;
  return `${inicioLabel} a ${fimLabel}`;
}

/**
 * Vencimento de uma fatura, relativo ao mês de FECHAMENTO dela (`year`,
 * `month` = quando ela fecha, não quando vence). Vencimento dia 31 em mês
 * curto cai no último dia desse mês.
 */
export function dataVencimentoFatura(year: number, month: number, dueDay: number, closingDay: number): Date {
  const ref = new Date(year, dueDay >= closingDay ? month : month + 1, 1);
  return new Date(ref.getFullYear(), ref.getMonth(), diaEfetivo(ref.getFullYear(), ref.getMonth(), dueDay));
}

/**
 * A fatura `deslocamento` posições à frente (positivo) ou atrás (negativo)
 * da que está aberta em `hoje`. 0 = a fatura que recebe compras hoje. Mesma
 * função do Granabô (`_shared/fatura-ciclo.ts`).
 */
export function cicloRelativo(hoje: string, closingDay: number, deslocamento: number): CicloFatura {
  const atual = mesFaturaDoLancamento(hoje, closingDay);
  const data = new Date(atual.year, atual.month + deslocamento, 1);
  return { year: data.getFullYear(), month: data.getMonth() };
}

/** Quantas faturas separam `de` de `ate` (inverso de `cicloRelativo`). */
export function deslocamentoEntre(de: CicloFatura, ate: CicloFatura): number {
  return (ate.year - de.year) * 12 + (ate.month - de.month);
}
