// Pedidos de ajuste. O pedido mora COM a peça dele (secaoAjustesDaPeca, no detalhe da Aprovação).
// No topo da tela fica uma linha só, de altura fixa, que não cresce com a quantidade de pedidos:
// o resumo e, recolhida, a lista completa. Ações (aceitar, tentar de novo) ficam no detalhe da peça.

// Identificadores são para conferência, não para leitura: oito caracteres bastam e ficam em segundo plano.
const curto = (v) => (typeof v === 'string' && v ? v.slice(0, 8) : 'não informado');
// A lista recolhe e abre por escolha da pessoa; recarregar a tela não muda isso nem faz a tela pular.
const estadoLista = { aberta: false };
const detalhesDasFilas = new WeakMap();
const saudeDasFilas = new WeakMap();
const entregasDasFilas = new WeakMap();
const POLLING_MS = 15000;
const SYNC_RECENTE_MS = 60000;

const PEDIDOS_TERMINAIS = new Set(['aceito', 'desatualizado', 'encerrado', 'recusado-pelo-autor']);
export function pedidoAberto(p) { return !PEDIDOS_TERMINAIS.has(p.estado); }
export function filaDisponivel(pedidos) { return Array.isArray(pedidos) && saudeDasFilas.get(pedidos) !== false; }

export function situacaoDaDemanda(peca, pedidos) {
  const meus = ordenarPedidos((pedidos || []).filter((p) => p.pecaId === peca.id));
  const pedido = meus.find(pedidoAberto) || meus[0];
  const estado = pedido?.estado;
  const entregaParada = ['novo', 'falha-de-envio'].includes(estado) && entregasDasFilas.get(pedidos);
  const proximos = {
    novo: 'Os agentes aguardam a entrega do pedido.',
    'em-correcao': 'Os agentes estão corrigindo a peça.',
    'falha-de-envio': 'Confira a entrega antes de tentar novamente.',
    'corrigido-aguardando-aceite': 'Revise a correção antes de dar seu aceite.',
    'aguardando-aprovacao-de-custo': 'Responda sobre o custo pela conversa.',
    'precisa-de-atencao': 'Confira o pedido que precisa de atenção.',
    desatualizado: 'Refaça o pedido na versão atual da peça.',
    encerrado: 'O pedido foi encerrado; confira a decisão da peça.',
    'recusado-pelo-autor': 'O pedido foi recusado; confira a decisão da peça.',
  };
  const comAgentes = ['novo', 'em-correcao', 'falha-de-envio'].includes(estado);
  const precisa = ['corrigido-aguardando-aceite', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao', 'desatualizado'].includes(estado);
  const resolvida = !comAgentes && !precisa && (peca.aprovada || peca.estado === 'historico');
  return {
    secao: comAgentes ? 'agentes' : resolvida ? 'resolvidas' : 'voce',
    rotulo: entregaParada || (pedido && (comAgentes || precisa || pedidoAberto(pedido)) ? ESTADOS[estado] || 'Estado não reconhecido' : peca.aprovada ? 'Aprovada nesta versão' : peca.estado === 'historico' ? 'Histórico' : 'Esperando o seu aceite'),
    proximo: entregaParada ? 'A entrega está parada. Confira os detalhes da fila antes de tentar novamente.' : pedido && !ESTADOS[estado] ? 'Atualize os recibos antes de agir sobre este pedido.' : proximos[estado] || (peca.aprovada ? 'Confira a data no calendário.' : peca.estado === 'historico' ? 'Esta peça está no histórico.' : 'Revise a peça e escolha aprovar, pedir ajuste ou recusar.'),
    em: peca.recusa?.recusadoEm || pedido?.atualizadoEm || pedido?.criadoEm || peca.aceite?.aprovadoEm || peca.modificadoEm || null,
    pedido,
  };
}

// Atualiza a mesa de demandas com o mesmo GET já usado pelos recibos.
export function observarPedidos(pedidos, redesenhar) {
  if (!Array.isArray(pedidos)) return;
  if (!detalhesDasFilas.has(pedidos)) detalhesDasFilas.set(pedidos, new Set());
  detalhesDasFilas.get(pedidos).add(redesenhar);
}

function momentoSeguro(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
}

function avisoEspelho(p) {
  const recibo = p.espelho;
  if (!recibo || ['local', 'sincronizado'].includes(recibo.estado)) return null;
  if (recibo.estado === 'falha') return recibo.codigo === 'remoto-estado-recusado'
    ? 'O espelho remoto não suporta este estado. A mudança local foi preservada e a fila local continua. Aguardando confirmação de sincronização.'
    : 'O espelho remoto não confirmou a mudança. O estado local foi preservado e a fila local continua. Aguardando confirmação de sincronização.';
  if (recibo.estado === 'indisponivel') return 'Ponte remota indisponível para este pedido. O estado local foi preservado e a fila local continua. Aguardando confirmação de sincronização.';
  if (recibo.estado === 'pendente') return 'Mudança gravada localmente; espelhamento pendente. A entrega remota ainda não foi confirmada.';
  return 'Sincronização deste pedido não confirmada. Confira novamente os recibos; o estado local foi preservado.';
}

function avisoPonte(d) {
  // O erro global de importação também é recibo: um sucesso recente ou a
  // ausência de pedidos pendentes não pode escondê-lo. Nunca mostra erro bruto.
  if (d.remoto?.ultimoErro !== null && d.remoto?.ultimoErro !== undefined) return 'Falha na importação remota. A fila local continua disponível; sincronização não confirmada.';
  if (d.remoto?.status === 'ausente') return 'Ponte remota ausente. A fila local continua disponível; sincronização remota indisponível.';
  if (d.remoto?.status !== 'ativo') return 'Ponte remota inativa ou não confirmada. A fila local continua disponível; confira a configuração da ponte.';
  const em = momentoSeguro(d.remoto.ultimaSync);
  const idade = em ? Date.now() - Date.parse(em) : null;
  // Um carimbo recente registra uma sincronização, nunca saúde permanente.
  if (idade === null || idade < 0 || idade > SYNC_RECENTE_MS) return 'Ponte configurada ativa; sincronização recente não confirmada.';
  return null;
}

// Mais recente primeiro, com desempate pelo id: a ordem não muda quando a lista atualiza.
export function ordenarPedidos(lista) {
  return [...lista].sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')) || String(b.id || '').localeCompare(String(a.id || '')));
}

const GRUPOS = [['novo', 'aguardando entrega'], ['em-correcao', 'em correção'], ['corrigido-aguardando-aceite', 'corrigido, aguardando seu aceite'],
  ['falha-de-envio', 'com falha na entrega'], ['aguardando-aprovacao-de-custo', 'pausado para custo'], ['precisa-de-atencao', 'precisando de atenção'],
  ['aceito', 'aceito'], ['desatualizado', 'desatualizado'], ['encerrado', 'encerrado'], ['recusado-pelo-autor', 'recusado pelo autor']];
export function resumoPedidos(pedidos) {
  const n = pedidos.length;
  const partes = GRUPOS.map(([estado, rotulo]) => [pedidos.filter((p) => p.estado === estado).length, rotulo]).filter(([c]) => c > 0).map(([c, r]) => `${c} ${r}`);
  return `${n} ${n === 1 ? 'pedido' : 'pedidos'} de ajuste${partes.length ? `: ${partes.join(', ')}` : ''}`;
}

// Estado da entrega em poucas palavras, para o selo da peça na lista.
const CURTO = { novo: ['alerta', 'aguardando entrega'], 'em-correcao': ['neutro', 'entregue'], 'corrigido-aguardando-aceite': ['ok', 'corrigido'],
  'falha-de-envio': ['erro', 'falha na entrega'], 'aguardando-aprovacao-de-custo': ['alerta', 'pausado'], 'precisa-de-atencao': ['erro', 'precisa de atenção'],
  aceito: ['ok', 'aceito'], desatualizado: ['neutro', 'desatualizado'], encerrado: ['neutro', 'encerrado'], 'recusado-pelo-autor': ['neutro', 'recusado pelo autor'] };
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
  const pedidos = [];
  const avisos = h('div', { 'aria-live': 'polite' });
  let avisoFalhaPolling = null;
  function desenhar(d) {
    avisos.replaceChildren();
    avisoFalhaPolling = null;
    const ponte = avisoPonte(d);
    if (ponte) avisos.appendChild(h('p', { class: 'campo-ajuda quebra', role: 'status', texto: ponte }));
    const naoConfirmados = pedidos.filter((p) => avisoEspelho(p));
    if (naoConfirmados.length) avisos.appendChild(h('p', {
      class: 'campo-ajuda quebra', role: 'status',
      texto: `${naoConfirmados.length} ${naoConfirmados.length === 1 ? 'pedido sem confirmação de sincronização' : 'pedidos sem confirmação de sincronização'}. O estado local foi preservado.`,
    }));
    // A recusa de estado precisa ser visível mesmo com a lista recolhida.
    if (naoConfirmados.some((p) => p.espelho.estado === 'falha' && p.espelho.codigo === 'remoto-estado-recusado')) {
      avisos.appendChild(h('p', { class: 'campo-ajuda quebra', role: 'status', texto: 'O espelho remoto não suporta o estado de um pedido. A fila local continua; aguardando confirmação de sincronização.' }));
    }
    secao.replaceChildren(avisos);
    if (!pedidos.length) { secao.appendChild(h('p', { class: 'pedidos-vazio', texto: 'Nenhum pedido de ajuste.' })); return; }
    const parada = situacaoEntrega(d);
    const resumo = resumoPedidos(pedidos);
    secao.appendChild(h('details', { class: 'pedidos-lista', open: estadoLista.aberta ? true : undefined, ontoggle: (e) => { estadoLista.aberta = !!e.target.open; } },
      h('summary', { class: 'pedidos-linha', title: resumo },
        h('span', { class: 'pedidos-texto', texto: resumo }),
        parada ? ctx.selo('alerta', parada) : null,
        h('span', { class: 'pedidos-ver', texto: 'Ver todos' })),
      h('div', { class: 'secao-corpo quebra' },
        parada ? h('p', { texto: d.servidor?.desatualizado ? 'O painel foi atualizado depois que esta janela abriu.' : 'A entrega dos pedidos está parada.' }) : null,
        parada || avisoPonte(d) ? tecnico(ctx, d) : null,
        h('ul', { class: 'pedidos-itens' }, pedidos.map((p) => linhaPedido(ctx, p, { acoes: false }))))));
  }
  async function atualizar() {
    const r = await ctx.api('/api/marketing/ajustes');
    if (ctx.obsoleta()) return;
    const d = r.dados;
    if (!d || !Array.isArray(d.pedidos)) throw new Error('fila-invalida');
    pedidos.splice(0, pedidos.length, ...ordenarPedidos(d.pedidos));
    saudeDasFilas.set(pedidos, true);
    entregasDasFilas.set(pedidos, situacaoEntrega(d));
    desenhar(d);
    const observadores = detalhesDasFilas.get(pedidos);
    for (const redesenhar of [...(observadores || [])]) {
      if (redesenhar.alvo?.isConnected === false) observadores.delete(redesenhar);
      else redesenhar();
    }
  }
  function agendar() {
    if (ctx.obsoleta() || typeof setTimeout !== 'function') return;
    setTimeout(async () => {
      if (ctx.obsoleta()) return;
      try { await atualizar(); }
      catch (err) {
        console.warn('[ajustes-polling]', err.codigo || 'falha');
        if (!ctx.obsoleta()) {
          saudeDasFilas.set(pedidos, false);
          // Não apaga o último recibo por falha no GET, nem mostra erro bruto.
          const texto = 'Não foi possível atualizar a sincronização. Os últimos recibos e o estado local continuam visíveis; uma nova conferência será feita.';
          if (avisoFalhaPolling) avisos.removeChild(avisoFalhaPolling);
          avisoFalhaPolling = h('p', { class: 'campo-ajuda quebra', role: 'status', texto });
          avisos.appendChild(avisoFalhaPolling);
          for (const redesenhar of [...(detalhesDasFilas.get(pedidos) || [])]) redesenhar();
        }
      }
      agendar();
    }, POLLING_MS);
  }
  try {
    await atualizar();
    if (ctx.obsoleta()) return;
    agendar();
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
export function secaoAjustesDaPeca(ctx, pedidos, pecaId, comparacao) {
  const { h } = ctx;
  const meus = ordenarPedidos((pedidos || []).filter((p) => p.pecaId === pecaId));
  if (!meus.length) return null;
  const secao = h('section', { class: 'peca-ajustes', 'aria-label': 'Ajustes pedidos' });
  const redesenhar = () => secao.replaceChildren(h('h3', { texto: 'Ajustes pedidos' }),
    h('ul', { class: 'pedidos-itens' }, ordenarPedidos(pedidos.filter((p) => p.pecaId === pecaId)).map((p) => linhaPedido(ctx, p, { acoes: true, disponivel: filaDisponivel(pedidos), aceitePermitido: !comparacao || (comparacao.pronta && comparacao.pedidoId === p.id) }))));
  comparacao?.observadores.add(redesenhar);
  redesenhar.alvo = secao;
  if (!detalhesDasFilas.has(pedidos)) detalhesDasFilas.set(pedidos, new Set());
  detalhesDasFilas.get(pedidos).add(redesenhar);
  redesenhar();
  return secao;
}

function linhaPedido(ctx, p, { acoes, disponivel = true, aceitePermitido = true }) {
  const { h } = ctx;
  const quando = (v) => v ? ctx.formatar.dataHora(v) : 'não informado';
  const aceitar = p.estado === 'corrigido-aguardando-aceite' && /^[a-f0-9]{40}$/.test(p.versaoCorrigida || '') && /^[a-f0-9]{40}$/.test(p.commit || '');
  const retry = p.estado === 'falha-de-envio' && Number.isInteger(p.tentativas) && p.tentativas < 3;
  const bloco = h('div', { class: 'bloco-acao' });
  if (acoes) {
    for (const [permitida, tipo, rotulo] of [[aceitar, 'aceitar', 'Aceitar versão corrigida'], [retry, 'retry', 'Tentar entrega novamente'], [p.estado === 'precisa-de-atencao', 'reenviar', 'Reenviar pedido'], [p.estado === 'precisa-de-atencao', 'encerrar', 'Encerrar pedido']]) {
      if (!permitida) continue;
      const botao = h('button', { class: 'botao', type: 'button', texto: rotulo, disabled: !disponivel || (tipo === 'aceitar' && !aceitePermitido), onclick: () => agir(ctx, p, tipo, botao) });
      bloco.appendChild(botao);
    }
  } else {
    bloco.appendChild(h('a', { class: 'botao botao-fantasma', href: `#/marketing/aprovacao?peca=${encodeURIComponent(p.pecaId)}`, texto: 'Abrir a peça' }));
  }
  const ids = [`Pedido ${curto(p.id)}`, `Versão alvo ${curto(p.versaoAlvo)}`, p.versaoCorrigida ? `Versão corrigida ${curto(p.versaoCorrigida)}` : null, p.commit ? `Commit ${curto(p.commit)}` : null, p.aceite ? `Aceite ${curto(p.aceite.versao)}` : null].filter(Boolean).join(' · ');
  const estado = ESTADOS[p.estado] || `Estado não reconhecido: ${p.estado || 'ausente'}. Atualize antes de agir.`;
  const nomeDaPeca = acoes ? '' : `${p.pecaTitulo || 'Peça sem nome'} · `;
  const espelho = avisoEspelho(p);
  const emEspelho = momentoSeguro(p.espelho?.em);
  return h('li', { class: 'pedido-linha' },
    h('p', { class: 'pedido-titulo quebra', role: 'status', texto: `${nomeDaPeca}${quando(p.criadoEm)} · ${estado}` }),
    espelho ? h('p', { class: 'campo-ajuda quebra', role: 'status', texto: `${espelho}${emEspelho ? ` Recibo em ${quando(emEspelho)}.` : ''}` }) : null,
    p.estado === 'falha-de-envio' ? h('p', { class: 'campo-ajuda quebra', texto: MOTIVOS[p.motivo] || 'Confira o agente antes de repetir: uma falha pode deixar a entrega incerta. O servidor limita as tentativas.' }) : null,
    p.estado === 'aguardando-aprovacao-de-custo' ? h('div', { class: 'demanda-custo' },
      h('p', { class: 'campo-ajuda', texto: 'A ferramenta paga permanece pausada. Responda sobre o custo pela conversa; nenhum custo é autorizado por esta tela.' }),
      p.custo ? h('dl', { class: 'lista-chave-valor' },
        h('dt', { texto: 'Ferramenta' }), h('dd', { texto: p.custo.ferramenta || 'Não informada' }),
        h('dt', { texto: 'Créditos estimados' }), h('dd', { texto: Number.isFinite(p.custo.creditos) ? String(p.custo.creditos) : 'Não informados' }),
        h('dt', { texto: 'Valor estimado' }), h('dd', { texto: Number.isFinite(p.custo.valorReais) ? p.custo.valorReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Não informado' }),
        h('dt', { texto: 'Cotação usada' }), h('dd', { texto: Number.isFinite(p.custo.cotacao) ? String(p.custo.cotacao) : 'Não informada' }),
        h('dt', { texto: 'Motivo para não fazer localmente' }), h('dd', { texto: p.custo.motivoNaoLocal || 'Não informado' })) :
        h('p', { class: 'campo-ajuda', texto: 'Estimativa ainda não informada. Confira pela conversa antes de decidir.' })) : null,
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
  encerrado: 'Pedido encerrado', 'recusado-pelo-autor': 'Recusado pelo autor',
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
    let motivo;
    if (tipo === 'encerrar') {
      const valores = await ctx.formulario({
        titulo: 'Encerrar pedido', texto: 'Informe um novo motivo para encerrar este pedido. O texto original permanece oculto.',
        campos: [{ nome: 'motivo', rotulo: 'Motivo do encerramento', tipo: 'textarea', obrigatorio: true, linhas: 4, ajuda: 'De 1 a 500 caracteres Unicode, sem contar espaços nas pontas.' }],
        rotuloBotao: 'Revisar encerramento',
      });
      if (!valores || ctx.obsoleta()) return;
      motivo = typeof valores.motivo === 'string' ? valores.motivo.trim() : '';
      if (!motivo || Array.from(motivo).length > 500) {
        ctx.aviso('Informe um motivo de 1 a 500 caracteres para encerrar o pedido.', 'erro');
        return;
      }
    }
    const confirmado = await ctx.confirmar({ titulo: tipo === 'encerrar' ? 'Confirmar encerramento' : tipo === 'aceitar' ? 'Aceitar esta correção' : tipo === 'reenviar' ? 'Reenviar pedido' : 'Tentar entrega novamente',
      texto: tipo === 'encerrar' ? 'O pedido será encerrado localmente. A sincronização remota ainda precisa de confirmação. Nenhum custo é autorizado.' : tipo === 'aceitar' ? 'Confirme somente depois de revisar a versão corrigida. Nada será publicado ou enviado à Meta.' : 'Confira primeiro se o agente recebeu o pedido. Repetir uma entrega incerta pode duplicar trabalho.',
      detalhes: [pedido.pecaTitulo || 'Peça sem nome', `Pedido ${curto(pedido.id)} · versão ${curto(pedido.versaoCorrigida || pedido.versaoAlvo)}`], rotuloBotao: 'Confirmar' });
    if (confirmado !== true) return;
    if (ctx.obsoleta()) return;
    const corpo = { pedidoId: pedido.id, confirmacao: true };
    if (tipo === 'encerrar') corpo.motivo = motivo;
    if (tipo === 'aceitar') { corpo.pecaId = pedido.pecaId; corpo.versao = pedido.versaoCorrigida; }
    await ctx.acao(`/api/marketing/ajustes/${tipo}`, corpo);
    if (!ctx.obsoleta()) { ctx.aviso(tipo === 'encerrar' ? 'Pedido encerrado localmente. Confira o recibo de sincronização.' : tipo === 'aceitar' ? 'Aceite registrado para esta versão.' : 'Nova tentativa registrada. A entrega ainda precisa de confirmação.', 'ok'); ctx.recarregar(); }
  } catch (err) {
    console.warn('[ajustes]', err.codigo || 'falha');
    // O código interno fica no console; a pessoa lê o que fazer.
    if (!ctx.obsoleta()) ctx.aviso(err.codigo === 'confirmacao-invalida'
      ? 'O servidor recusou a confirmação: o painel pode estar rodando código antigo. Feche a janela "Grana. Admin" e abra pelo atalho.'
      : 'A ação não foi confirmada. Atualize os recibos antes de repetir.', 'erro');
  } finally { if (!ctx.obsoleta()) botao.disabled = false; }
}
