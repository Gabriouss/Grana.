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

function diasNoMes(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/* Fechamento ou vencimento no dia 29-31 cai no último dia do mês curto, como
 * nos bancos. Mesma regra de `lib/faturaCiclo.ts`; a paridade das duas é
 * travada por `__tests__/paridade-fatura-ciclo.ts`. */
function diaEfetivo(year: number, month: number, dia: number): number {
  return Math.min(dia, diasNoMes(year, month));
}

function dataDeFechamento(year: number, month: number, closingDay: number): Date {
  const ref = new Date(year, month, 1);
  return new Date(ref.getFullYear(), ref.getMonth(), diaEfetivo(ref.getFullYear(), ref.getMonth(), closingDay));
}

export function mesFaturaDoLancamento(occurredOn: string, closingDay: number): CicloFatura {
  const [year, month, day] = occurredOn.split('-').map(Number);
  const month0 = month - 1;
  const fechamento = new Date(year, day < diaEfetivo(year, month0, closingDay) ? month0 : month0 + 1, 1);
  return { year: fechamento.getFullYear(), month: fechamento.getMonth() };
}

/** Retorna fim inclusivo, pronto para `.gte(...).lte(...)` no Supabase. */
export function janelaFatura(year: number, month: number, closingDay: number): JanelaFatura {
  const inicioDate = dataDeFechamento(year, month - 1, closingDay);
  const fimDate = dataDeFechamento(year, month, closingDay);
  fimDate.setDate(fimDate.getDate() - 1);

  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const inicio = iso(inicioDate);
  const fim = iso(fimDate);
  const anoDiferente = inicioDate.getFullYear() !== fimDate.getFullYear();
  const inicioLabel = `${inicioDate.getDate()} ${meses[inicioDate.getMonth()]}${anoDiferente ? ` ${inicioDate.getFullYear()}` : ''}`;
  const fimLabel = `${fimDate.getDate()} ${meses[fimDate.getMonth()]}${anoDiferente ? ` ${fimDate.getFullYear()}` : ''}`;

  return { inicio, fim, rotulo: `${inicioLabel} a ${fimLabel}` };
}

/** Linha de lançamento com o que decide a fatura de uma parcela. */
export type LinhaDeFatura = {
  occurred_on: string;
  installment_current?: number | null;
  installment_total?: number | null;
  parent_id?: string | null;
};

/* Fechamento 29-31: a data gravada da parcela pode cair no dia do fechamento
 * limitado e pular ou repetir fatura. Só a data da COMPRA decide. Mesma regra
 * de `cicloDoLancamento` em `lib/creditoFaturas.ts`, travada pela paridade. */
export function precisaDaCompraOriginal(closingDay: number): boolean {
  return closingDay >= 29;
}

export function ehParcelaSeguinte(linha: LinhaDeFatura): boolean {
  return (linha.installment_total ?? 1) > 1 && (linha.installment_current ?? 1) > 1;
}

/** Fatura de uma linha; `incerto` quando a compra original era necessária e faltou. */
export function cicloDaLinha(
  linha: LinhaDeFatura,
  closingDay: number,
  datasDasCompras: ReadonlyMap<string, string>,
): { ciclo: CicloFatura; incerto: boolean } {
  const pelaData = mesFaturaDoLancamento(linha.occurred_on, closingDay);
  if (!ehParcelaSeguinte(linha) || !precisaDaCompraOriginal(closingDay)) return { ciclo: pelaData, incerto: false };
  const compra = linha.parent_id ? datasDasCompras.get(linha.parent_id) : undefined;
  if (!compra) return { ciclo: pelaData, incerto: true };
  const daCompra = mesFaturaDoLancamento(compra, closingDay);
  const alvo = new Date(daCompra.year, daCompra.month + (linha.installment_current ?? 1) - 1, 1);
  return { ciclo: { year: alvo.getFullYear(), month: alvo.getMonth() }, incerto: false };
}

/** Estorno no cartão (`type: 'in'`) abate a fatura. Mesma regra de
 * `valorNaFatura` em `lib/creditoFaturas.ts`, travada pela paridade. */
export function valorNaFatura(linha: { amount: number | string; type?: string | null }): number {
  const valor = Number(linha.amount);
  return linha.type === 'in' ? -valor : valor;
}

/** Vencimento da fatura que fecha em (`year`, `month`). Mesma regra do app. */
export function dataVencimentoFatura(year: number, month: number, dueDay: number, closingDay: number): Date {
  const ref = new Date(year, dueDay >= closingDay ? month : month + 1, 1);
  return new Date(ref.getFullYear(), ref.getMonth(), diaEfetivo(ref.getFullYear(), ref.getMonth(), dueDay));
}
