/* Regras puras do ciclo de fatura usadas pelo Granabô (Edge Functions).
 *
 * `month` é o mês de fechamento, 0-indexado. A data do fechamento pertence
 * ao ciclo seguinte: uma compra no dia 20 de um cartão que fecha dia 20 entra
 * na fatura que fecha no mês seguinte.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type CicloFatura = { year: number; month: number };
export type JanelaFatura = { inicio: string; fim: string; rotulo: string };

/** Resolve referências relativas pelo fechamento de cada cartão. */
export function cicloRelativo(hoje: string, closingDay: number, deslocamento: number): CicloFatura {
  const atual = mesFaturaDoLancamento(hoje, closingDay);
  const data = new Date(atual.year, atual.month + deslocamento, 1);
  return { year: data.getFullYear(), month: data.getMonth() };
}

export function deslocamentoPedido(mensagem: string): number | undefined {
  const texto = mensagem.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const anterior = /\b(?:fatura|ciclo)\s+(?:passad[ao]|anterior|ultim[ao])\b/.test(texto);
  const atual = /\b(?:fatura|ciclo)\s+atual\b/.test(texto) || (anterior && /\batual\b/.test(texto));
  // Comparações precisam de duas consultas; não sobrescrever ambas com o mesmo ciclo.
  return anterior === atual ? undefined : anterior ? -1 : 0;
}

export function mesFaturaDoLancamento(occurredOn: string, closingDay: number): CicloFatura {
  const [year, month, day] = occurredOn.split('-').map(Number);
  const month0 = day < closingDay ? month - 1 : month;
  const fechamento = new Date(year, month0, 1);
  return { year: fechamento.getFullYear(), month: fechamento.getMonth() };
}

/** Retorna fim inclusivo, pronto para `.gte(...).lte(...)` no Supabase. */
export function janelaFatura(year: number, month: number, closingDay: number): JanelaFatura {
  const inicioDate = new Date(year, month - 1, closingDay);
  const fimDate = new Date(year, month, closingDay);
  fimDate.setDate(fimDate.getDate() - 1);

  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const inicio = iso(inicioDate);
  const fim = iso(fimDate);
  const anoDiferente = inicioDate.getFullYear() !== fimDate.getFullYear();
  const inicioLabel = `${inicioDate.getDate()} ${meses[inicioDate.getMonth()]}${anoDiferente ? ` ${inicioDate.getFullYear()}` : ''}`;
  const fimLabel = `${fimDate.getDate()} ${meses[fimDate.getMonth()]}${anoDiferente ? ` ${fimDate.getFullYear()}` : ''}`;

  return { inicio, fim, rotulo: `${inicioLabel} – ${fimLabel}` };
}
