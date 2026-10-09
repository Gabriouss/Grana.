// Fila privada: leitura de recibos e ações explícitas, sem aceite automático.
export async function montarFila(raiz, ctx) {
  const { h } = ctx;
  const corpo = h('div', { class: 'secao-corpo quebra' });
  raiz.appendChild(h('section', { class: 'secao' }, h('h2', { class: 'secao-titulo', texto: 'Pedidos de ajuste' }), corpo));
  ctx.estado.carregando(corpo, 'Lendo a fila privada…');
  try {
    const r = await ctx.api('/api/marketing/ajustes');
    if (ctx.obsoleta()) return;
    const d = r.dados;
    if (!d || !Array.isArray(d.pedidos)) throw Object.assign(new Error('A fila não devolveu uma lista válida.'), { codigo: 'fila-invalida' });
    corpo.replaceChildren();
    if (d.remoto?.status !== 'ativo') corpo.appendChild(ctx.alerta('atencao', 'A ponte remota não está confirmada como ativa. Esta lista não comprova entrega de pedidos feitos no painel web.'));
    if (!d.pedidos.length) corpo.appendChild(h('p', { texto: 'Nenhum pedido de ajuste nesta fila.' }));
    for (const pedido of d.pedidos) corpo.appendChild(cartaoPedido(ctx, pedido));
    return d.pedidos;
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return null;
  }
}

const ESTADOS = {
  novo: 'Recebido, aguardando entrega', 'em-correcao': 'Em correção',
  'corrigido-aguardando-aceite': 'Corrigido, aguardando seu aceite', aceito: 'Aceito nesta versão',
  'falha-de-envio': 'Falha na entrega', 'aguardando-aprovacao-de-custo': 'Pausado para aprovação de custo',
  desatualizado: 'Versão desatualizada', 'precisa-de-atencao': 'Precisa de atenção',
};

function cartaoPedido(ctx, p) {
  const { h } = ctx;
  const quando = (v) => v ? ctx.formatar.dataHora(v) : 'não informado';
  const link = h('a', { class: 'botao botao-fantasma', href: `#/marketing/aprovacao?peca=${encodeURIComponent(p.pecaId)}`, texto: 'Revisar a peça' });
  const aceitar = p.estado === 'corrigido-aguardando-aceite' && /^[a-f0-9]{40}$/.test(p.versaoCorrigida || '') && /^[a-f0-9]{40}$/.test(p.commit || '');
  const retry = p.estado === 'falha-de-envio' && Number.isInteger(p.tentativas) && p.tentativas < 3;
  const acoes = h('div', { class: 'bloco-acao' }, link);
  for (const [permitida, tipo, rotulo] of [[aceitar, 'aceitar', 'Aceitar versão corrigida'], [retry, 'retry', 'Tentar entrega novamente']]) {
    if (!permitida) continue;
    const botao = h('button', { class: 'botao', type: 'button', texto: rotulo, onclick: () => agir(ctx, p, tipo, botao) });
    acoes.appendChild(botao);
  }
  return h('article', { class: 'secao' },
    h('h3', { class: 'secao-titulo quebra', texto: `Pedido ${p.id}` }),
    h('div', { class: 'secao-corpo quebra' },
      h('p', { role: 'status', texto: ESTADOS[p.estado] || `Estado não reconhecido: ${p.estado || 'ausente'}. Atualize antes de agir.` }),
      h('p', { class: 'campo-ajuda', texto: `Recebido: ${quando(p.criadoEm)} · Atualizado: ${quando(p.atualizadoEm)} · Tentativas: ${p.tentativas ?? 'não informadas'}` }),
      p.lease ? h('p', { texto: `Agente: ${p.lease.agente || 'não informado'} · Reserva válida até ${quando(p.lease.expiraEm)}` }) : null,
      h('p', { class: 'mono quebra', texto: `Versão alvo: ${p.versaoAlvo || 'não informada'}` }),
      p.versaoCorrigida ? h('p', { class: 'mono quebra', texto: `Versão corrigida: ${p.versaoCorrigida}` }) : null,
      p.commit ? h('p', { class: 'mono quebra', texto: `Commit da correção: ${p.commit}` }) : null,
      p.aceite ? h('p', { texto: `Recibo do aceite: ${p.aceite.versao} · ${quando(p.aceite.em)}. Não comprova publicação.` }) : null,
      p.estado === 'falha-de-envio' ? ctx.alerta('atencao', 'Confira o agente antes de repetir: uma falha pode deixar a entrega incerta. O servidor limita as tentativas.') : null,
      p.estado === 'aguardando-aprovacao-de-custo' ? ctx.alerta('atencao', 'A ferramenta paga permanece pausada. Nenhum custo é autorizado por esta tela.') : null,
      p.estado === 'corrigido-aguardando-aceite' ? h('p', { texto: 'Revise a peça e o hash corrigido antes de aceitar. Correção pronta não é aceite nem publicação.' }) : null,
      acoes));
}

export async function agir(ctx, pedido, tipo, botao) {
  if (botao.disabled || ctx.obsoleta()) return;
  botao.disabled = true;
  try {
    if (!await ctx.confirmar({ titulo: tipo === 'aceitar' ? 'Aceitar esta correção' : 'Tentar entrega novamente',
      texto: tipo === 'aceitar' ? 'Confirme somente depois de revisar a versão corrigida. Nada será publicado ou enviado à Meta.' : 'Confira primeiro se o agente recebeu o pedido. Repetir uma entrega incerta pode duplicar trabalho.',
      detalhes: [pedido.id, pedido.versaoCorrigida || pedido.versaoAlvo], rotuloBotao: 'Confirmar' })) return;
    if (ctx.obsoleta()) return;
    const corpo = { pedidoId: pedido.id, confirmacao: true };
    if (tipo === 'aceitar') { corpo.pecaId = pedido.pecaId; corpo.versao = pedido.versaoCorrigida; }
    await ctx.acao(`/api/marketing/ajustes/${tipo}`, corpo);
    if (!ctx.obsoleta()) { ctx.aviso(tipo === 'aceitar' ? 'Aceite registrado para esta versão.' : 'Nova tentativa registrada. A entrega ainda precisa de confirmação.', 'ok'); ctx.recarregar(); }
  } catch (err) {
    if (!ctx.obsoleta()) ctx.aviso(`A ação não foi confirmada (${err.codigo || 'falha'}). Atualize os recibos antes de repetir.`, 'erro');
  } finally { if (!ctx.obsoleta()) botao.disabled = false; }
}
