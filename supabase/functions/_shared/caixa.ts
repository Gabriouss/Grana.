/**
 * Regra de caixa do Grana., do lado do servidor.
 *
 * Compra no crédito não sai do caixa quando acontece: sai quando a fatura é
 * paga, e o pagamento da fatura é um lançamento `out` SEM cartão
 * (`pagar_fatura_cartao`). Somar a compra E o pagamento contaria o mesmo
 * dinheiro duas vezes, que é o que o Granabô fazia no "quanto gastei em
 * alimentação" (S43/A46, 23/09/2026) enquanto Início e Gráficos excluíam.
 *
 * Cópia exata de `isCreditTx` em `lib/transaction-rules.ts` (o Deno não
 * importa de `lib/`); `__tests__/granabo-caixa-sem-credito.cjs` trava a
 * paridade. `card_id` sozinho basta: lançamento antigo pode ter cartão com
 * `payment_method` nulo, e estorno no cartão (`in` com `card_id`) também
 * fica fora do caixa.
 */
export function ehCompraNoCredito(t: { payment_method?: string | null; card_id?: string | null }): boolean {
  return t.payment_method === 'credit' || !!t.card_id;
}

export type LivreParaGastar = {
  saldoAtual: number;
  reservadoEmMetas: number;
  diasRestantes: number;
  livreTotal: number;
  livrePorDia: number;
};

/**
 * "Saldo" e "Livre para gastar" SÓ do mês vigente (regra 20 do AGENTS.md,
 * decisão do autor em 24/09/2026: "não quero saldo acumulado, quero saldo
 * apenas do mês vigente"). Nunca `initial_balance`, nunca meses anteriores.
 *
 * - saldo = entradas − saídas de CAIXA com `occurred_on` no mês de `hojeISO`
 *   (compra e estorno no cartão fora; o pagamento da fatura, saída sem
 *   cartão, dentro, no mês em que foi pago);
 * - metas = soma de `current_amount`;
 * - livre = max(0, saldo − metas); por dia = livre / dias restantes,
 *   contando hoje.
 *
 * Boleto pendente ou atrasado NÃO entra (decisão do autor em 25/09/2026: os
 * boletos "entrarão no cálculo apenas após a saída do dinheiro registrado no
 * pix/débito, após a classificação deles como pagos"). Marcar como pago cria
 * a saída de caixa, e é ela que pesa no saldo.
 *
 * É o espelho de `calcularSafeToSpend` em `lib/safe-to-spend.ts` (o Deno não
 * importa de `lib/`); o teste de paridade roda os dois módulos reais. A mesma
 * palavra mostra o mesmo número em todo lugar (A12): corrigir um lado e não
 * o outro é a regressão de volta.
 *
 * `hojeISO` é o dia de quem pergunta (America/Sao_Paulo): o servidor roda em
 * UTC, e depois das 21h de Brasília o UTC já é o dia seguinte.
 */
export function calcularLivreParaGastar(
  transacoes: Array<{ type: string; amount: number | string; occurred_on: string; payment_method?: string | null; card_id?: string | null }>,
  metas: Array<{ current_amount: number | string }>,
  hojeISO: string,
): LivreParaGastar {
  const mes = hojeISO.slice(0, 7);
  const [ano, mesNumero, dia] = hojeISO.split('-').map(Number);
  const saldoAtual = transacoes
    .filter((t) => !ehCompraNoCredito(t) && t.occurred_on.slice(0, 7) === mes)
    .reduce((soma, t) => soma + (t.type === 'in' ? Number(t.amount) : -Number(t.amount)), 0);
  const reservadoEmMetas = metas.reduce((soma, g) => soma + Number(g.current_amount), 0);
  const ultimoDia = new Date(Date.UTC(ano, mesNumero, 0)).getUTCDate();
  const diasRestantes = Math.max(1, ultimoDia - dia + 1);
  const livreTotal = Math.max(0, saldoAtual - reservadoEmMetas);
  return { saldoAtual, reservadoEmMetas, diasRestantes, livreTotal, livrePorDia: livreTotal / diasRestantes };
}
