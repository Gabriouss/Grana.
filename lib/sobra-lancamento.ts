/* Marca do lançamento de sobra (decisão P1 e P4 do autor, 21/11/2026).

   A sobra confirmada vira entrada na categoria "Sobra do mês" (RPC
   `confirmar_sobra_do_mes`, migration 20261121120000). Ela conta no Livre, no
   Saldo, na lista, nos gráficos, no CSV e no PDF, como qualquer entrada, mas
   fica FORA da média de receitas das projeções e das conquistas: é dinheiro
   que veio do mês anterior, não renda nova.

   A marca é a mesma no servidor (`get_gamification_summary`): entrada nessa
   categoria. Recategorizar faz dela uma entrada comum, por escolha da pessoa. */

export const CATEGORIA_SOBRA = 'Sobra do mês';
/* Cor que `corDaCategoria('Sobra do mês')` dá nos gráficos, da paleta existente. */
export const COR_SOBRA = '#74a17c';

export function ehLancamentoDeSobra(t: { type: string; category?: string | null }): boolean {
  return t.type === 'in' && t.category === CATEGORIA_SOBRA;
}
