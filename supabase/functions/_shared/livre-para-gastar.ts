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

/**
 * Entra no CAIXA do mês de `hojeISO`? Fonte única do "Saldo atual" (Início,
 * widgets e Granabô; `lib/safe-to-spend.ts` importa daqui). Desde 07/11/2026
 * o Livre usa `entraNoLivreDoMes`, abaixo, e não mais este predicado.
 *
 * Pedido expresso do autor em 01/11/2026 (regra 20): "Lançamento com data
 * futura precisa descontar do livre para gastar, mas apenas lançamentos dentro
 * do mesmo mês" e "Salário futuro no livre para gastar só entra após a data da
 * entrada". Então, dentro do mês e fora do crédito: SAÍDA com data futura
 * desconta desde já; ENTRADA só conta a partir do dia da data dela
 * (`occurred_on <= hojeISO`, dia local da pessoa, o dia inteiro).
 */
export function entraNoCaixaDoMes(
  t: { type: string; occurred_on: string; payment_method?: string | null; card_id?: string | null },
  hojeISO: string,
): boolean {
  if (t.payment_method === 'credit' || !!t.card_id) return false;
  if (typeof t.occurred_on !== 'string' || t.occurred_on.slice(0, 7) !== hojeISO.slice(0, 7)) return false;
  return t.type !== 'in' || t.occurred_on <= hojeISO;
}

/**
 * Entra no LIVRE do mês de `hojeISO`? Pedido expresso do autor em 07/11/2026
 * (regra 20, ordem do orquestrador de 07/11):
 * "estou com dinheiro em conta, utilizando o dinheiro e ele está como (zero
 * reais disponíveis para gastar)". Escolhas dele: "Salário futuro conta desde
 * o dia 1" e "Fatura só desconta ao pagar". Então, para o Livre, toda entrada
 * e toda saída de caixa do mês contam desde o dia 1, mesmo com data futura.
 * O "Saldo atual" NÃO muda: continua em `entraNoCaixaDoMes`.
 */
export function entraNoLivreDoMes(
  t: { occurred_on: string; payment_method?: string | null; card_id?: string | null },
  hojeISO: string,
): boolean {
  if (t.payment_method === 'credit' || !!t.card_id) return false;
  return typeof t.occurred_on === 'string' && t.occurred_on.slice(0, 7) === hojeISO.slice(0, 7);
}

/** Regra 20, núcleo executável único: Início, widget e Granabô.
 *
 * Alteração expressa do autor em 07/11/2026, que substitui a de 17/10 no que
 * toca a crédito e a de 01/11 no que toca a entradas:
 * - entradas de caixa do mês contam desde o dia 1, inclusive as de data
 *   futura (`entradasPrevistas` mostra a parte que ainda não chegou);
 * - saídas de caixa do mês continuam contando desde já, inclusive futuras;
 * - compra no crédito e fatura aberta ou fechada NÃO reduzem o Livre: a
 *   fatura desconta quando é paga, porque `pagar_fatura_cartao` grava o
 *   pagamento como saída de caixa sem `card_id`, e só ali (conta uma vez);
 * - cofrinho: só o guardado do dinheiro deste mês reduz; o anterior fica fora.
 * Livre = max(0, entradas do mês − saídas do mês − guardado do mês) ÷ dias
 * restantes (incluindo hoje). Sem `initial_balance` e sem meses anteriores.
 *
 * `contexto` (cartões e pagamentos) ficou sem uso no cálculo desde 07/11;
 * continua aceito para não quebrar quem chama.
 */
export function calcularLivre(
  transacoes: Tx[], metas: Meta[], hojeISO: string, _contexto: ContextoLivre = {},
) {
  const centavos = (v: number | string) => Math.round(Number(v) * 100);
  const mes = hojeISO.slice(0, 7);
  const [ano, mesNumero, dia] = hojeISO.split('-').map(Number);
  const saldo = transacoes.filter(t => entraNoCaixaDoMes(t, hojeISO))
    .reduce((s, t) => s + (t.type === 'in' ? 1 : -1) * centavos(t.amount), 0);
  const entradasPrevistas = transacoes
    .filter(t => t.type === 'in' && entraNoLivreDoMes(t, hojeISO) && !entraNoCaixaDoMes(t, hojeISO))
    .reduce((s, t) => s + centavos(t.amount), 0);
  const reservado = metas.reduce((s, g) => s + centavos(g.month_reserves?.[mes] ?? 0), 0);
  const caixaDoLivre = saldo + entradasPrevistas;
  const diasRestantes = Math.max(1, new Date(Date.UTC(ano, mesNumero, 0)).getUTCDate() - dia + 1);
  const livreTotal = Math.max(0, caixaDoLivre - reservado) / 100;
  return {
    saldoAtual: saldo / 100, entradasPrevistas: entradasPrevistas / 100, reservadoEmMetas: reservado / 100,
    // Crédito não reduz mais o Livre (07/11/2026). Zero só até o card deixar de exibir a linha.
    creditoNaoPago: 0,
    semSaldo: caixaDoLivre <= 0, diasRestantes, livreTotal, livrePorDia: livreTotal / diasRestantes,
  };
}
