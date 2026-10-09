// Vendas (Cakto): somente contagens e somas por período e situação.

const STATUS = { paid: ['ok', 'Pago'], refunded: ['alerta', 'Reembolsado'], chargedback: ['erro', 'Chargeback'], waiting_payment: ['neutro', 'Aguardando pagamento'], canceled: ['neutro', 'Cancelado'], refused: ['erro', 'Recusado'] };

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Vendas (Cakto)', 'Totais em reais. Sem nome, e-mail ou CPF de comprador.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);

  raiz.appendChild(ctx.bloco('Vendas pagas', '/api/cakto/resumo', (d) => {
    const pagos = d.pagos || {};
    const periodos = [['hoje', 'Hoje'], ['ultimos7', 'Últimos 7 dias'], ['ultimos30', 'Últimos 30 dias']].filter(([k]) => pagos[k]);
    const porStatus = Object.entries(d.porStatus || {});
    if (!periodos.length && !porStatus.length) return null;
    return [
      periodos.length ? h('div', { class: 'grade-cartoes' }, periodos.map(([k, t]) => ctx.cartao({
        titulo: t,
        valor: ctx.formatar.reais(pagos[k].valor),
        detalhe: `${pagos[k].pedidos} ${pagos[k].pedidos === 1 ? 'pedido pago' : 'pedidos pagos'}`,
      }))) : null,
      porStatus.length ? ctx.tabela([
        { titulo: 'Situação', valor: ([s]) => { const [c, t] = STATUS[s] || ['neutro', s]; return ctx.selo(c, t); } },
        { titulo: 'Pedidos', valor: ([, n]) => ctx.formatar.numero(n), classe: 'num' },
      ], porStatus, { legenda: `Pedidos por situação${d.periodo ? `, ${d.periodo}` : ''}` }) : null,
    ];
  }, { integracao: 'cakto', textoVazio: 'Nenhuma venda no período.' }));
}
