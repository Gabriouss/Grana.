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
 */

export type CicloFatura = { year: number; month: number };

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * A que fatura (ano/mês de FECHAMENTO) um lançamento pertence.
 *
 * Regra de corte: um lançamento no PRÓPRIO dia do fechamento já entra na
 * PRÓXIMA fatura — quem fecha dia 19 e compra dia 19 só vê essa compra na
 * fatura que fecha no mês seguinte, não na que fecha hoje.
 */
export function mesFaturaDoLancamento(occurredOn: string, closingDay: number): CicloFatura {
  const [y, m, d] = occurredOn.split('-').map(Number); // m sai do ISO 1-indexado
  // `m - 1` converte pra 0-indexado (mesmo mês do lançamento); `m` sozinho
  // "sobra" um mês à frente já em 0-indexado — é o mesmo número, só a
  // regra de corte decide qual dos dois usar. `new Date(y, mes0, 1)` no
  // final rola o ano sozinho quando `mes0` é 12 (dezembro que fecha em
  // janeiro do ano seguinte).
  const mes0 = d < closingDay ? m - 1 : m;
  const fechamento = new Date(y, mes0, 1);
  return { year: fechamento.getFullYear(), month: fechamento.getMonth() };
}

/**
 * Janela de datas (ISO, meio-aberta: inclui `inicio`, exclui `fim`) que
 * cobre os lançamentos de uma fatura — do dia `closingDay` do mês anterior
 * até a véspera do dia `closingDay` do mês de fechamento da fatura.
 */
export function janelaFatura(year: number, month: number, closingDay: number): { inicio: string; fim: string } {
  return {
    inicio: iso(new Date(year, month - 1, closingDay)),
    fim: iso(new Date(year, month, closingDay)),
  };
}

/**
 * Vencimento de uma fatura, relativo ao mês de FECHAMENTO dela (`year`,
 * `month` = quando ela fecha, não quando vence) — generaliza o cálculo que
 * já existia isolado em `credito.tsx` antes deste módulo.
 */
export function dataVencimentoFatura(year: number, month: number, dueDay: number, closingDay: number): Date {
  const mesVencimento = dueDay >= closingDay ? month : month + 1;
  return new Date(year, mesVencimento, dueDay);
}
