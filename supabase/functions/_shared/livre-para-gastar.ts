import { mesFaturaDoLancamento } from './fatura-ciclo.ts';

type Tx = {
  id?: string; type: string; amount: number | string; occurred_on: string;
  card_id?: string | null; payment_method?: string | null;
  parent_id?: string | null; installment_current?: number; installment_total?: number;
};
type Meta = { current_amount: number | string; month_reserves?: Record<string, number | string> };
export type ContextoLivre = {
  cards?: Array<{ id: string; closing_day: number }>;
  payments?: Array<{ card_id: string; year: number; month: number; amount: number | string; paid_on?: string }>;
};

/** Regra 20, alteração expressa do autor em 17/10/2026.
 * Núcleo executável único: Início, widget e Granabô. Caixa é só do mês;
 * cofrinho antigo fica fora; reserva apenas do mês; crédito reserva a aberta
 * atual e todas as fechadas ainda não pagas. Parcelas de ciclos futuros não
 * entram. Pagamento parcial abate só o pago (já lançado no caixa).
 */
export function calcularLivre(
  transacoes: Tx[], metas: Meta[], hojeISO: string, contexto: ContextoLivre = {},
) {
  const credito = (t: Tx) => t.payment_method === 'credit' || !!t.card_id;
  const centavos = (v: number | string) => Math.round(Number(v) * 100);
  const mes = hojeISO.slice(0, 7);
  const [ano, mesNumero, dia] = hojeISO.split('-').map(Number);
  const saldo = transacoes.filter(t => !credito(t) && t.occurred_on.slice(0, 7) === mes)
    .reduce((s, t) => s + (t.type === 'in' ? 1 : -1) * centavos(t.amount), 0);
  const reservado = metas.reduce((s, g) => s + centavos(g.month_reserves?.[mes] ?? 0), 0);
  const cards = contexto.cards ?? [];
  const grupos = new Map<string, number>();
  const datas = new Map(transacoes.filter(t => t.id).map(t => [t.id, t.occurred_on]));
  for (const t of transacoes) {
    if (!credito(t) || t.type === 'in') continue;
    const card = cards.find(c => c.id === t.card_id) ?? (!t.card_id && cards.length === 1 ? cards[0] : undefined);
    const parcela = t.installment_current ?? 1;
    const original = parcela > 1 && t.parent_id ? datas.get(t.parent_id) : undefined;
    const ciclo = card ? mesFaturaDoLancamento(original ?? t.occurred_on, card.closing_day)
      : { year: Number(t.occurred_on.slice(0, 4)), month: Number(t.occurred_on.slice(5, 7)) - 1 };
    if (original && card) {
      const ref = new Date(ciclo.year, ciclo.month + parcela - 1, 1);
      ciclo.year = ref.getFullYear(); ciclo.month = ref.getMonth();
    }
    const atual = card ? mesFaturaDoLancamento(hojeISO, card.closing_day) : { year: ano, month: mesNumero - 1 };
    if (ciclo.year * 12 + ciclo.month > atual.year * 12 + atual.month) continue;
    const chave = `${card?.id ?? t.card_id ?? ''}:${ciclo.year}:${ciclo.month}`;
    grupos.set(chave, (grupos.get(chave) ?? 0) + centavos(t.amount));
  }
  const pagos = new Map<string, number>();
  for (const p of contexto.payments ?? []) {
    if (p.paid_on && p.paid_on > hojeISO) continue;
    const chave = `${p.card_id}:${p.year}:${p.month}`;
    pagos.set(chave, (pagos.get(chave) ?? 0) + centavos(p.amount));
  }
  let creditoNaoPago = 0;
  for (const [chave, valor] of grupos) creditoNaoPago += Math.max(0, valor - (pagos.get(chave) ?? 0));
  const diasRestantes = Math.max(1, new Date(Date.UTC(ano, mesNumero, 0)).getUTCDate() - dia + 1);
  const livreTotal = Math.max(0, saldo - reservado - creditoNaoPago) / 100;
  return {
    saldoAtual: saldo / 100, reservadoEmMetas: reservado / 100, creditoNaoPago: creditoNaoPago / 100,
    diasRestantes, livreTotal, livrePorDia: livreTotal / diasRestantes,
  };
}
