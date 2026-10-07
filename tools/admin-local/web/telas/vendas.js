// Vendas (Cakto): números agregados e pedidos recentes sem dado pessoal de comprador.
// O servidor manda o e-mail já mascarado; mesmo assim esta tela não o mostra.

const STATUS = { paid: ['ok', 'Pago'], refunded: ['alerta', 'Reembolsado'], chargedback: ['erro', 'Chargeback'], waiting_payment: ['neutro', 'Aguardando pagamento'], canceled: ['neutro', 'Cancelado'], refused: ['erro', 'Recusado'] };

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Vendas (Cakto)', 'Totais em reais. Sem nome, e-mail ou CPF de comprador.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);

  raiz.appendChild(ctx.bloco('Vendas pagas', '/api/cakto/resumo', (d) => {
    const pagos = d.pagos || {};
    const periodos = [['hoje', 'Hoje'], ['ultimos7', 'Últimos 7 dias'], ['ultimos30', 'Últimos 30 dias']].filter(([k]) => pagos[k]);
    const recentes = d.recentes || [];
    const porStatus = Object.entries(d.porStatus || {});
    if (!periodos.length && !recentes.length) return null;
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
      recentes.length ? ctx.tabela([
        { titulo: 'Quando', valor: (x) => ctx.formatar.dataHora(x.pagoEm || x.criadoEm) },
        { titulo: 'Situação', valor: (x) => { const [c, t] = STATUS[x.status] || ['neutro', x.status]; return ctx.selo(c, t); } },
        { titulo: 'Valor', valor: (x) => ctx.formatar.reais(x.valor), classe: 'num' },
        { titulo: 'Forma', valor: (x) => (x.metodo === 'pix' ? 'Pix' : x.metodo === 'credit_card' ? 'Cartão' : x.metodo === 'boleto' ? 'Boleto' : x.metodo) },
        { titulo: 'Pedido', valor: (x) => x.ref, classe: 'mono' },
      ], recentes, { legenda: 'Pedidos recentes' }) : null,
    ];
  }, { integracao: 'cakto', textoVazio: 'Nenhuma venda no período.' }));
}
