// Pedidos de ajuste. O pedido mora COM a peça dele (secaoAjustesDaPeca, no detalhe da Aprovação).
// No topo da tela fica uma linha só, de altura fixa, que não cresce com a quantidade de pedidos:
// o resumo e, recolhida, a lista completa. Ações (aceitar, tentar de novo) ficam no detalhe da peça.

// Identificadores são para conferência, não para leitura: oito caracteres bastam e ficam em segundo plano.
const curto = (v) => (typeof v === 'string' && v ? v.slice(0, 8) : 'não informado');
// A lista recolhe e abre por escolha da pessoa; recarregar a tela não muda isso nem faz a tela pular.
const estadoLista = { aberta: false };

// Mais recente primeiro, com desempate pelo id: a ordem não muda quando a lista atualiza.
export function ordenarPedidos(lista) {
  return [...lista].sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')) || String(b.id || '').localeCompare(String(a.id || '')));
}

const GRUPOS = [['novo', 'aguardando entrega'], ['em-correcao', 'em correção'], ['corrigido-aguardando-aceite', 'corrigido, aguardando seu aceite'],
  ['falha-de-envio', 'com falha na entrega'], ['aguardando-aprovacao-de-custo', 'pausado para custo'], ['precisa-de-atencao', 'precisando de atenção'],
  ['aceito', 'aceito'], ['desatualizado', 'desatualizado']];
export function resumoPedidos(pedidos) {
  const n = pedidos.length;
  const partes = GRUPOS.map(([estado, rotulo]) => [pedidos.filter((p) => p.estado === estado).length, rotulo]).filter(([c]) => c > 0).map(([c, r]) => `${c} ${r}`);
  return `${n} ${n === 1 ? 'pedido' : 'pedidos'} de ajuste${partes.length ? `: ${partes.join(', ')}` : ''}`;
}

// Estado da entrega em poucas palavras, para o selo da peça na lista.
const CURTO = { novo: ['alerta', 'aguardando entrega'], 'em-correcao': ['neutro', 'entregue'], 'corrigido-aguardando-aceite': ['ok', 'corrigido'],
  'falha-de-envio': ['erro', 'falha na entrega'], 'aguardando-aprovacao-de-custo': ['alerta', 'pausado'], 'precisa-de-atencao': ['erro', 'precisa de atenção'],
  aceito: ['ok', 'aceito'], desatualizado: ['neutro', 'desatualizado'] };
export function seloDoAjuste(pedidos, pecaId) {
  const p = ordenarPedidos((pedidos || []).filter((x) => x.pecaId === pecaId))[0];
  const [nivel, texto] = (p && CURTO[p.estado]) || ['alerta', 'pedido feito'];
  return { nivel, texto: `Ajuste: ${texto}` };
}

function situacaoEntrega(d) {
  const aguardando = d.pedidos.some((p) => ['novo', 'falha-de-envio'].includes(p.estado));
  if (d.servidor?.desatualizado) return 'Reabra o painel';
  if (d.vigia && !d.vigia.ativo && aguardando) return 'Entrega parada';
  return null;
}

export async function montarFila(raiz, ctx) {
  const { h } = ctx;
  const secao = h('section', { class: 'pedidos-resumo', 'aria-label': 'Pedidos de ajuste' });
  raiz.appendChild(secao);
  try {
    const r = await ctx.api('/api/marketing/ajustes');
    if (ctx.obsoleta()) return;
    const d = r.dados;
    if (!d || !Array.isArray(d.pedidos)) throw Object.assign(new Error('A fila não devolveu uma lista válida.'), { codigo: 'fila-invalida' });
    const pedidos = ordenarPedidos(d.pedidos);
    if (!pedidos.length) { secao.appendChild(h('p', { class: 'pedidos-vazio', texto: 'Nenhum pedido de ajuste.' })); return pedidos; }
    const parada = situacaoEntrega(d);
    const resumo = resumoPedidos(pedidos);
    const detalhes = h('details', { class: 'pedidos-lista', open: estadoLista.aberta ? true : undefined, ontoggle: (e) => { estadoLista.aberta = !!e.target.open; } },
      h('summary', { class: 'pedidos-linha', title: resumo },
        h('span', { class: 'pedidos-texto', texto: resumo }),
        parada ? ctx.selo('alerta', parada) : null,
        h('span', { class: 'pedidos-ver', texto: 'Ver todos' })),
      h('div', { class: 'secao-corpo quebra' },
        parada ? h('p', { texto: d.servidor?.desatualizado ? 'O painel foi atualizado depois que esta janela abriu.' : 'A entrega dos pedidos está parada.' }) : null,
        parada || d.remoto?.status !== 'ativo' ? tecnico(ctx, d) : null,
        h('ul', { class: 'pedidos-itens' }, pedidos.map((p) => linhaPedido(ctx, p, { acoes: false })))));
    secao.appendChild(detalhes);
    return pedidos;
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(secao, err, () => ctx.recarregar());
    return null;
  }
}

// Detalhe para quem opera: comando do vigia e ponte remota ficam recolhidos, fora da leitura do autor.
function tecnico(ctx, d) {
  const { h } = ctx;
  return h('details', { class: 'pedidos-tecnico' }, h('summary', { texto: 'Detalhes' }),
    h('div', { class: 'secao-corpo quebra' },
      d.servidor?.desatualizado ? h('p', { texto: 'O servidor ainda roda o código antigo. Feche a janela "Grana. Admin" e abra de novo pelo atalho; ações podem ser recusadas até lá.' }) : null,
      d.vigia && !d.vigia.ativo ? h('p', { texto: 'O vigia de entrega não está ativo. Os pedidos ficam recebidos e só chegam ao agente quando ele rodar. Num terminal do Maestri: node tools/admin-local/vigia-ajustes.cjs' }) : null,
      d.remoto?.status !== 'ativo' ? h('p', { texto: 'A ponte remota não está confirmada como ativa. Esta lista não comprova entrega de pedidos feitos no painel web.' }) : null));
}

// Seção do detalhe da peça: só os pedidos DELA, com as ações quando cabem.
export function secaoAjustesDaPeca(ctx, pedidos, pecaId) {
  const { h } = ctx;
  const meus = ordenarPedidos((pedidos || []).filter((p) => p.pecaId === pecaId));
  if (!meus.length) return null;
  return h('section', { class: 'peca-ajustes', 'aria-label': 'Ajustes pedidos' },
    h('h3', { texto: 'Ajustes pedidos' }),
    h('ul', { class: 'pedidos-itens' }, meus.map((p) => linhaPedido(ctx, p, { acoes: true }))));
}

function linhaPedido(ctx, p, { acoes }) {
  const { h } = ctx;
  const quando = (v) => v ? ctx.formatar.dataHora(v) : 'não informado';
  const aceitar = p.estado === 'corrigido-aguardando-aceite' && /^[a-f0-9]{40}$/.test(p.versaoCorrigida || '') && /^[a-f0-9]{40}$/.test(p.commit || '');
  const retry = p.estado === 'falha-de-envio' && Number.isInteger(p.tentativas) && p.tentativas < 3;
  const bloco = h('div', { class: 'bloco-acao' });
  if (acoes) {
    for (const [permitida, tipo, rotulo] of [[aceitar, 'aceitar', 'Aceitar versão corrigida'], [retry, 'retry', 'Tentar entrega novamente']]) {
      if (!permitida) continue;
      const botao = h('button', { class: 'botao', type: 'button', texto: rotulo, onclick: () => agir(ctx, p, tipo, botao) });
      bloco.appendChild(botao);
    }
  } else {
    bloco.appendChild(h('a', { class: 'botao botao-fantasma', href: `#/marketing/aprovacao?peca=${encodeURIComponent(p.pecaId)}`, texto: 'Abrir a peça' }));
  }
  const ids = [`Pedido ${curto(p.id)}`, `Versão alvo ${curto(p.versaoAlvo)}`, p.versaoCorrigida ? `Versão corrigida ${curto(p.versaoCorrigida)}` : null, p.commit ? `Commit ${curto(p.commit)}` : null, p.aceite ? `Aceite ${curto(p.aceite.versao)}` : null].filter(Boolean).join(' · ');
  const estado = ESTADOS[p.estado] || `Estado não reconhecido: ${p.estado || 'ausente'}. Atualize antes de agir.`;
  const nomeDaPeca = acoes ? '' : `${p.pecaTitulo || 'Peça sem nome'} · `;
  return h('li', { class: 'pedido-linha' },
    h('p', { class: 'pedido-titulo quebra', role: 'status', texto: `${nomeDaPeca}${quando(p.criadoEm)} · ${estado}` }),
    p.estado === 'falha-de-envio' ? h('p', { class: 'campo-ajuda quebra', texto: MOTIVOS[p.motivo] || 'Confira o agente antes de repetir: uma falha pode deixar a entrega incerta. O servidor limita as tentativas.' }) : null,
    p.estado === 'aguardando-aprovacao-de-custo' ? h('p', { class: 'campo-ajuda', texto: 'A ferramenta paga permanece pausada. Nenhum custo é autorizado por esta tela.' }) : null,
    p.estado === 'corrigido-aguardando-aceite' ? h('p', { class: 'campo-ajuda', texto: 'Revise a peça e a versão corrigida antes de aceitar. Correção pronta não é aceite nem publicação.' }) : null,
    p.aceite ? h('p', { class: 'campo-ajuda', texto: `Aceito em ${quando(p.aceite.em)}. O aceite não comprova publicação.` }) : null,
    bloco,
    h('p', { class: 'campo-ajuda mono quebra', texto: `${ids} · tentativas ${p.tentativas ?? 'não informadas'}` }));
}

const ESTADOS = {
  novo: 'Recebido, aguardando entrega', 'em-correcao': 'Em correção',
  'corrigido-aguardando-aceite': 'Corrigido, aguardando seu aceite', aceito: 'Aceito nesta versão',
  'falha-de-envio': 'Falha na entrega', 'aguardando-aprovacao-de-custo': 'Pausado para aprovação de custo',
  desatualizado: 'Versão desatualizada', 'precisa-de-atencao': 'Precisa de atenção',
};

// Motivo da falha de entrega. Os três primeiros provam que nada foi digitado: a tentativa não é gasta.
const MOTIVOS = {
  'terminal-inacessivel': 'O agente não estava acessível no Maestri. Nada foi enviado e esta tentativa não foi gasta. Ligue o vigia num terminal do Maestri e tente de novo.',
  'agente-fechado': 'O agente estava fechado. Nada foi enviado e esta tentativa não foi gasta. Abra o agente e tente de novo.',
  'caixa-ocupada': 'A caixa do agente estava ocupada. Nada foi digitado e esta tentativa não foi gasta. Tente de novo quando ela estiver vazia.',
  'entrega-incerta': 'Não foi possível confirmar se o agente recebeu o pedido. Confira o agente antes de repetir, ou o pedido pode rodar duas vezes.',
  'entrega-falhou': 'A entrega falhou por um motivo que não dá para classificar. Confira o agente antes de repetir.',
};

export async function agir(ctx, pedido, tipo, botao) {
  if (botao.disabled || ctx.obsoleta()) return;
  botao.disabled = true;
  try {
    if (!await ctx.confirmar({ titulo: tipo === 'aceitar' ? 'Aceitar esta correção' : 'Tentar entrega novamente',
      texto: tipo === 'aceitar' ? 'Confirme somente depois de revisar a versão corrigida. Nada será publicado ou enviado à Meta.' : 'Confira primeiro se o agente recebeu o pedido. Repetir uma entrega incerta pode duplicar trabalho.',
      detalhes: [pedido.pecaTitulo || 'Peça sem nome', `Pedido ${curto(pedido.id)} · versão ${curto(pedido.versaoCorrigida || pedido.versaoAlvo)}`], rotuloBotao: 'Confirmar' })) return;
    if (ctx.obsoleta()) return;
    const corpo = { pedidoId: pedido.id, confirmacao: true };
    if (tipo === 'aceitar') { corpo.pecaId = pedido.pecaId; corpo.versao = pedido.versaoCorrigida; }
    await ctx.acao(`/api/marketing/ajustes/${tipo}`, corpo);
    if (!ctx.obsoleta()) { ctx.aviso(tipo === 'aceitar' ? 'Aceite registrado para esta versão.' : 'Nova tentativa registrada. A entrega ainda precisa de confirmação.', 'ok'); ctx.recarregar(); }
  } catch (err) {
    console.warn('[ajustes]', err.codigo || 'falha');
    // O código interno fica no console; a pessoa lê o que fazer.
    if (!ctx.obsoleta()) ctx.aviso(err.codigo === 'confirmacao-invalida'
      ? 'O servidor recusou a confirmação: o painel pode estar rodando código antigo. Feche a janela "Grana. Admin" e abra pelo atalho.'
      : 'A ação não foi confirmada. Atualize os recibos antes de repetir.', 'erro');
  } finally { if (!ctx.obsoleta()) botao.disabled = false; }
}
