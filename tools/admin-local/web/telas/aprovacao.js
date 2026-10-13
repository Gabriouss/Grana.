// Aprovação: galeria de famílias; clicar abre a prévia do post com legenda e decisão.
// Aprovar grava o aceite do autor para AQUELA versão (sha1). Não publica nem agenda nada em rede social.

import { tituloPeca, rotuloSemana, rotuloEstado, trilha, historicoDaPeca, agruparFamilias, idadeDemanda, formatoDaPeca, ROTULOS_FORMATO, juntarCapasAoReel, pecaDaFila } from './_pecas.js';
import { montarMidia, midiasDaPeca, topoDaPrevia } from './_previa-publicacao.js';
import { montarFila, secaoAjustesDaPeca, situacaoDaFamilia, contarPrecisaDeVoce, textoAlertaDemanda, observarPedidos, pedidoAberto, filaDisponivel } from './ajustes.js';

// Mesmos rótulos de estado usados no detalhe dos pedidos em ajustes.js.
const ESTADOS_AJUSTE = {
  novo: 'Recebido, aguardando entrega', 'em-correcao': 'Em correção',
  'corrigido-aguardando-aceite': 'Corrigido, aguardando seu aceite', aceito: 'Aceito nesta versão',
  'falha-de-envio': 'Falha na entrega', 'aguardando-aprovacao-de-custo': 'Pausado para aprovação de custo',
  desatualizado: 'Versão desatualizada', 'precisa-de-atencao': 'Precisa de atenção',
};

const FILTROS_DEMANDAS = 'grana-admin-demandas-filtros';
function lerFiltros() {
  try { return JSON.parse(localStorage.getItem(FILTROS_DEMANDAS)) || {}; } catch { return {}; }
}
function guardarFiltros(filtros) {
  try { localStorage.setItem(FILTROS_DEMANDAS, JSON.stringify(filtros)); } catch { /* filtros continuam funcionando sem armazenamento */ }
}

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.contadorAprovacao?.(null);
  ctx.cabecalho(raiz, 'Aprovação', 'Clique numa peça para abrir a prévia, ler a legenda e decidir. Aprovar registra o seu aceite daquela versão; nada é publicado ou agendado no Instagram.', [
    h('a', { class: 'botao botao-fantasma', href: '#/marketing/calendario?secao=sem-data', texto: 'Aprovados sem data' }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);
  const pedidos = await montarFila(raiz, ctx);
  if (ctx.obsoleta()) return;
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);
  ctx.estado.carregando(corpo, 'Lendo o acervo de marketing…');

  let pecas;
  let familiasServidor;
  try {
    const r = await ctx.api('/api/marketing/pecas');
    if (!Array.isArray(r.dados?.pecas)) throw new Error('O acervo não devolveu uma lista válida.');
    pecas = r.dados.pecas;
    familiasServidor = r.dados.familias;
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return;
  }
  if (ctx.obsoleta()) return;

  // COPYS-FINAIS.md é referência editorial, não peça: fica no Acervo (mesmo predicado do contador).
  const fila = pecas.filter(pecaDaFila)
    .sort((a, b) => (a.aprovada === b.aprovada ? String(b.semana?.inicio || '').localeCompare(String(a.semana?.inicio || '')) : a.aprovada ? 1 : -1));
  if (!fila.length) {
    ctx.contadorAprovacao?.(filaDisponivel(pedidos) ? 0 : null);
    ctx.estado.vazio(corpo, 'Nenhuma demanda no acervo. Quando uma peça estiver disponível, ela aparece aqui.');
    return;
  }

  let selecionada = fila.find((p) => p.id === ctx.params.peca) || fila.find((p) => !p.aprovada) || fila[0];
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  const familias = juntarCapasAoReel(agruparFamilias(fila, familiasServidor));
  const preferencias = lerFiltros();
  const formatos = ['todos', 'reels', 'estaticos'];
  const estaticos = ['todos', 'feed', 'stories', 'carrossel', 'conferir'];
  const estados = ['todos', 'voce', 'agentes', 'resolvidas'];
  const semanas = [...new Map(fila.filter((p) => p.semana?.inicio).map((p) => [p.semana.inicio, p.semana])).values()].sort((a, b) => b.inicio.localeCompare(a.inicio));
  const filtros = {
    formato: formatos.includes(preferencias.formato) ? preferencias.formato : 'todos',
    estatico: estaticos.includes(preferencias.estatico) ? preferencias.estatico : 'todos',
    estado: estados.includes(preferencias.estado) ? preferencias.estado : 'todos',
    semana: semanas.some((s) => s.inicio === preferencias.semana) ? preferencias.semana : 'todas',
  };
  const lista = h('div', { class: 'demanda-secoes', 'aria-label': 'Galeria de demandas' });
  const contagemFamilias = h('p', { class: 'fila-contagem', 'aria-live': 'polite' });
  const grupoSelecionado = () => familias.find((g) => g.pecas.some((p) => p.id === selecionada?.id));
  const situacaoFamilia = (grupo) => situacaoDaFamilia(grupo, pedidos);
  const seletor = (id, rotulo, opcoes, chave) => h('div', { class: 'campo' }, h('label', { for: id, texto: rotulo }),
    h('select', { id, onchange: (e) => { filtros[chave] = e.target.value; guardarFiltros(filtros); desenharLista(); desenharDetalhe(); } },
      opcoes.map(([value, texto]) => h('option', { value, texto, selected: filtros[chave] === value }))));
  corpo.appendChild(h('div', { class: 'barra-filtros filtros-demandas form-linha' },
    seletor('demandas-semana', 'Semana', [['todas', 'Todas as semanas'], ...semanas.map((s) => [s.inicio, rotuloSemana(s)])], 'semana'),
    seletor('demandas-estado', 'Próxima ação', [['todos', 'Todas'], ['voce', 'Precisa de você'], ['agentes', 'Com os agentes'], ['resolvidas', 'Resolvidas']], 'estado')));
  // Formato em fichas: Reels separados dos estáticos, e os estáticos por destino comprovado.
  const fichas = (rotulo, opcoes, chave) => h('div', { class: 'filtros', role: 'group', 'aria-label': rotulo },
    opcoes.map(([valor, texto]) => h('button', { class: 'chip', type: 'button', texto, 'aria-pressed': String(filtros[chave] === valor),
      onclick: () => { filtros[chave] = valor; guardarFiltros(filtros); desenharFichas(); desenharLista(); desenharDetalhe(); } })));
  const areaFichas = h('div', { class: 'galeria-fichas' });
  const desenharFichas = () => {
    while (areaFichas.firstChild) areaFichas.removeChild(areaFichas.firstChild);
    areaFichas.appendChild(fichas('Formato', [['todos', 'Todos'], ['reels', 'Reels'], ['estaticos', 'Estáticos']], 'formato'));
    if (filtros.formato === 'estaticos') areaFichas.appendChild(fichas('Tipo de estático',
      [['todos', 'Todos os estáticos'], ['feed', 'Feed'], ['stories', 'Stories'], ['carrossel', 'Carrossel'], ['conferir', 'Formato a conferir']], 'estatico'));
  };
  desenharFichas();
  corpo.appendChild(h('div', { class: 'galeria-demandas' }, areaFichas, contagemFamilias, lista));

  // Janela de prévia: a mesma gramática do post aberto no Feed (mídia à esquerda, legenda e
  // decisão ao lado). A mídia só é montada ao abrir, para a galeria não baixar vídeo à toa;
  // a comparação de uma correção começa na hora, porque é ela que libera o aceite.
  const midiaSlot = h('div', { class: 'aprovacao-janela-midia' });
  const cabecaJanela = h('div', { class: 'aprovacao-janela-cabeca' });
  const detalhe = h('div', { class: 'aprovacao-janela-conteudo demanda-detalhe' });
  let devolverFoco = null;
  let midiaAtual = { chave: null, pausar: () => {}, limpar: () => {}, comparacao: null };
  const pausarMidia = () => { midiaAtual.pausar(); midiaSlot.querySelectorAll?.('video').forEach((v) => v.pause()); };
  const janela = h('dialog', {
    class: 'feed-post aprovacao-janela', 'aria-label': 'Prévia da peça',
    onclose: () => {
      pausarMidia();
      rascunhoAberto = null;
      // A galeria é redesenhada ao abrir: o foco volta ao card da família, achado pelo id.
      const alvo = lista.querySelector?.(`[data-peca="${CSS.escape(grupoSelecionado()?.principal?.id || '')}"]`)
        || (devolverFoco?.isConnected ? devolverFoco : null);
      alvo?.focus?.();
    },
    onclick: (e) => { if (e.target === janela) janela.close(); },
  }, h('div', { class: 'feed-post-corpo' }, midiaSlot, h('div', { class: 'feed-post-lado aprovacao-janela-lado' }, cabecaJanela, detalhe)));
  corpo.appendChild(janela);
  const limparComparacao = () => { midiaAtual.limpar(); };

  const chaveDaMidia = (p, corrigido) => `${p.id}:${p.versao || ''}:${corrigido?.id || ''}`;
  const montarMidiaDaPeca = (p) => {
    while (midiaSlot.firstChild) midiaSlot.removeChild(midiaSlot.firstChild);
    if (p.tipo === 'texto') { midiaSlot.appendChild(previaTexto(ctx, p)); return () => {}; }
    const previa = montarMidia(h, {
      titulo: tituloPeca(p),
      midias: midiasDaPeca(p, ctx.urlArquivo),
      capa: p.capa?.url ? { url: ctx.urlArquivo ? ctx.urlArquivo(p.capa.url) : p.capa.url } : null,
      ehVideo: p.tipo === 'video',
      legenda: p.legenda,
    });
    midiaSlot.appendChild(previa.elemento);
    return previa.pausar;
  };
  // Troca de peça pausa o vídeo anterior; o redesenho do polling, na mesma peça, mantém o player.
  const prepararMidia = (p, corrigido) => {
    const chave = chaveDaMidia(p, corrigido);
    if (midiaAtual.chave === chave) return;
    pausarMidia();
    midiaAtual.limpar();
    midiaAtual = { chave: null, pausar: () => {}, limpar: () => {}, comparacao: null };
    while (midiaSlot.firstChild) midiaSlot.removeChild(midiaSlot.firstChild);
    if (corrigido) {
      const comparacao = compararVersoes(ctx, p, corrigido);
      midiaSlot.appendChild(comparacao.elemento);
      midiaAtual = { chave, pausar: () => {}, limpar: comparacao.limpar, comparacao };
    } else if (janela.open) {
      midiaAtual = { chave, pausar: montarMidiaDaPeca(p), limpar: () => {}, comparacao: null };
    }
  };
  const desenharCabeca = () => {
    const p = selecionada;
    while (cabecaJanela.firstChild) cabecaJanela.removeChild(cabecaJanela.firstChild);
    if (!p) return;
    cabecaJanela.appendChild(topoDaPrevia(h, { formato: rotuloFormato(p), aoFechar: () => janela.close() }));
  };
  const abrirJanela = () => {
    if (!selecionada) return;
    if (!janela.open) devolverFoco = typeof document !== 'undefined' ? document.activeElement : null;
    const corrigido = pedidos?.find((r) => r.pecaId === selecionada.id && r.estado === 'corrigido-aguardando-aceite' && r.versaoCorrigida === selecionada.versao);
    if (!janela.open) janela.showModal?.();
    if (!corrigido && midiaAtual.chave !== chaveDaMidia(selecionada, null)) {
      pausarMidia();
      midiaAtual = { chave: chaveDaMidia(selecionada, null), pausar: montarMidiaDaPeca(selecionada), limpar: () => {}, comparacao: null };
    }
    desenharCabeca();
    cabecaJanela.querySelector?.('.feed-fechar')?.focus();
  };
  // Pedido de ajuste dentro da janela. O rascunho é por peça e versão: fechar a janela ou
  // trocar de peça guarda o texto em memória (nada de confirmação por cima da janela), e o
  // polling não redesenha a coluna enquanto há um rascunho aberto, para não roubar o foco.
  const rascunhos = new Map();
  let rascunhoAberto = null;
  const chaveRascunho = (p) => `${p.id}:${p.versao || ''}`;
  const escolher = (p, abrir = true) => {
    if (selecionada?.id !== p.id) rascunhoAberto = null;
    selecionada = p; desenharLista(); desenharDetalhe();
    if (abrir) abrirJanela();
  };

  const desenharLista = () => {
    ctx.contadorAprovacao?.(filaDisponivel(pedidos) ? contarPrecisaDeVoce(familias, pedidos) : null);
    while (lista.firstChild) lista.removeChild(lista.firstChild);
    const passaFormato = (g) => {
      const f = formatoDaPeca(g.principal);
      if (filtros.formato === 'reels') return f === 'reels';
      if (filtros.formato === 'estaticos') return ['feed', 'stories', 'carrossel', 'conferir'].includes(f) && (filtros.estatico === 'todos' || filtros.estatico === f);
      return true;
    };
    const visiveis = familias.filter((g) => passaFormato(g) && g.pecas.some((p) => filtros.semana === 'todas' || p.semana?.inicio === filtros.semana));
    const grupos = { voce: [], agentes: [], resolvidas: [] };
    for (const g of visiveis) {
      const s = situacaoFamilia(g);
      if (filtros.estado !== 'todos' && filtros.estado !== s.secao) continue;
      if (s.secao === 'resolvidas') {
        const em = Date.parse(s.em || '');
        if (!Number.isFinite(em) || Date.now() - em > 7 * 86400000 || em > Date.now()) continue;
      }
      grupos[s.secao].push(g);
    }
    const exibidos = Object.values(grupos).flat();
    if (!exibidos.some((g) => g.pecas.some((p) => p.id === selecionada?.id))) selecionada = exibidos[0]?.principal || null;
    contagemFamilias.textContent = `${exibidos.length} ${exibidos.length === 1 ? 'família' : 'famílias'} com esses filtros`;
    for (const [chave, titulo] of [['voce', 'Precisa de você'], ['agentes', 'Com os agentes'], ['resolvidas', 'Resolvidas']]) {
      const resolvidas = chave === 'resolvidas';
      const secao = h(resolvidas ? 'details' : 'section', { class: `demanda-secao${resolvidas ? ' demanda-resolvidas' : ''}`, 'aria-label': titulo },
        h(resolvidas ? 'summary' : 'h2', { class: 'demanda-secao-titulo', texto: `${titulo} (${grupos[chave].length})` }));
      if (!grupos[chave].length) secao.appendChild(h('p', { class: 'campo-ajuda demanda-vazio', texto: resolvidas ? 'Nenhuma demanda resolvida nos últimos 7 dias com esses filtros.' : 'Nenhuma demanda nesta seção com esses filtros.' }));
      const itens = h('ul', { class: 'galeria-grade demanda-lista' });
      for (const g of grupos[chave]) itens.appendChild(cardDaFamilia(g));
      secao.appendChild(itens);
      lista.appendChild(secao);
    }
  };

  const cardDaFamilia = (g) => {
    const p = g.principal;
    const s = situacaoFamilia(g);
    const selo = ctx.selo(s.secao === 'voce' ? 'alerta' : s.secao === 'resolvidas' ? 'ok' : 'neutro', s.rotulo);
    selo.setAttribute('class', `${selo.getAttribute?.('class') || selo.attrs?.class || 'selo'} demanda-selo`);
    selo.setAttribute('data-estado', s.pedido?.estado || p.estadoEfetivo || p.estado);
    const paginas = p.tipo === 'carrossel' ? (p.arquivos || []).length : 0;
    return h('li', { class: 'demanda-familia' }, h('button', {
      class: 'galeria-card demanda-item', type: 'button', 'aria-current': g === grupoSelecionado() ? 'true' : undefined,
      'aria-haspopup': 'dialog', dados: { peca: p.id },
      'data-estado': s.pedido?.estado || p.estadoEfetivo || p.estado, 'data-secao': s.secao,
      onclick: () => escolher(p),
    },
    h('span', { class: 'galeria-card-midia', 'aria-hidden': 'true' },
      miniatura(ctx, p),
      h('span', { class: 'galeria-card-formato', dados: { formato: formatoDaPeca(p) }, texto: paginas ? `${rotuloFormato(p)} · ${paginas} páginas` : rotuloFormato(p) }),
      p.capaOrfa ? h('span', { class: 'galeria-card-aviso', texto: 'Capa sem Reel' })
        : p.tipo === 'video' && !p.capa ? h('span', { class: 'galeria-card-aviso', texto: 'Sem capa' }) : null),
    h('span', { class: 'galeria-card-corpo' },
      h('span', { class: 'galeria-card-titulo', texto: tituloPeca(p) }),
      h('span', { class: 'galeria-card-meta', texto: rotuloSemana(p.semana) }),
      selo,
      h('span', { class: 'demanda-proximo', texto: [...s.alertas.map(textoAlertaDemanda), s.proximo].filter(Boolean).join(' ') }),
      h('span', { class: 'demanda-idade', texto: idadeDemanda(s.em) }))));
  };

  const desenharDetalhe = () => {
    while (detalhe.firstChild) detalhe.removeChild(detalhe.firstChild);
    const p = selecionada;
    if (!p) { detalhe.appendChild(h('p', { class: 'campo-ajuda', texto: 'Selecione uma demanda para revisar.' })); return; }
    janela.setAttribute('aria-label', `Prévia de ${tituloPeca(p)}`);
    const corrigido = pedidos?.find((r) => r.pecaId === p.id && r.estado === 'corrigido-aguardando-aceite' && r.versaoCorrigida === p.versao);
    prepararMidia(p, corrigido);
    if (janela.open) desenharCabeca();
    const comparacao = midiaAtual.comparacao;
    comparacao?.estado.observadores.clear();
    const familiaAtual = grupoSelecionado();
    const s = situacaoDaFamilia(familiaAtual || { pecas: [p] }, pedidos);

    // 1. O que é e o que falta: título, estado e próximo passo.
    detalhe.appendChild(h('h2', { class: 'secao-titulo aprovacao-janela-titulo', texto: tituloPeca(p) }));
    detalhe.appendChild(h('p', { class: 'aprovacao-janela-estado' },
      h('span', { texto: `${rotuloEstado(p)} · ${rotuloSemana(p.semana)}` }),
      s?.proximo ? h('span', { class: 'campo-ajuda', texto: s.proximo }) : null));
    // 2. Legenda, como no post.
    detalhe.appendChild(h('div', { class: 'peca-legenda aprovacao-legenda' },
      h('h3', { texto: 'Legenda' }),
      p.legenda ? h('p', { class: 'texto-legenda', texto: p.legenda }) : h('p', { class: 'texto-fraco', texto: 'Sem legenda registrada para esta peça.' }),
      p.fonteLegenda ? h('p', { class: 'campo-ajuda', texto: `Fonte da legenda: ${p.fonteLegenda}` }) : null));

    const alternativas = familiaAtual?.pecas.filter((a) => !a.capaDe && a.id !== p.id) || [];
    if (alternativas.length) detalhe.appendChild(h('section', { class: 'demanda-alternativas', 'aria-label': 'Alternativas da família' },
      h('h3', { texto: 'Alternativas' }), h('div', { class: 'bloco-acao' }, alternativas.map((a) => h('button', {
        class: 'botao botao-fantasma', type: 'button', texto: tituloPeca(a), onclick: () => escolher(a),
      })) )));
    if (p.capa?.pecaId) {
      const capa = fila.find((a) => a.id === p.capa.pecaId);
      if (capa) detalhe.appendChild(h('section', { class: 'demanda-capa', 'aria-label': 'Capa do vídeo' },
        h('h3', { texto: 'Capa deste Reel' }),
        capa.arquivos?.[0]?.url ? h('img', { class: 'demanda-capa-miniatura', src: ctx.urlArquivo ? ctx.urlArquivo(capa.arquivos[0].url) : capa.arquivos[0].url, alt: `Capa de ${tituloPeca(p)}`, loading: 'lazy' }) : null,
        h('p', { class: 'campo-ajuda', texto: capa.aprovada ? 'Capa aprovada nesta versão, com aceite próprio.' : 'A capa exige aceite próprio; o aceite do vídeo não vale para ela.' }),
        h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Revisar capa', onclick: () => escolher(capa) })));
    } else if (p.tipo === 'video') {
      detalhe.appendChild(ctx.alerta('atencao', 'Este Reel ainda não tem capa vinculada. Sem capa, a publicação usa o primeiro quadro do vídeo.'));
    }
    if (p.capaDe) {
      const video = fila.find((a) => a.id === p.capaDe);
      detalhe.appendChild(h('p', { class: 'campo-ajuda aprovacao-capa-de', texto: video ? `Esta imagem é a capa do Reel "${tituloPeca(video)}". Ela entra no Reel, nunca como post próprio.` : 'Esta imagem é capa de um Reel. Ela entra no Reel, nunca como post próprio.' }));
      if (video) detalhe.appendChild(h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Voltar ao Reel', onclick: () => escolher(video) }));
    } else if (p.capaOrfa) {
      detalhe.appendChild(ctx.alerta('atencao', 'Capa sem Reel vinculado. Ela continua visível aqui para não se perder, mas não deve ser publicada como post comum. Peça aos agentes o vínculo com o vídeo certo.'));
    }

    // 3. Avisos que mudam a decisão.
    for (const a of situacaoDaFamilia({ pecas: [p] }, pedidos).alertas) {
      detalhe.appendChild(h('p', { class: 'demanda-atencao campo-ajuda', role: 'status', texto: [textoAlertaDemanda(a), a.proximoPasso].filter(Boolean).join(' ') }));
    }
    if (!corrigido && pedidos?.some((r) => r.pecaId === p.id && r.estado === 'corrigido-aguardando-aceite')) {
      detalhe.appendChild(ctx.alerta('atencao', 'A versão da peça não confere com a correção entregue. Atualize antes de comparar e dar o aceite.'));
    }
    if (p.aceiteDeVersaoAnterior) detalhe.appendChild(ctx.alerta('atencao', 'Uma versão anterior desta peça foi aprovada, mas o arquivo mudou depois. O aceite antigo não vale para esta versão.'));
    if (p.recusa) detalhe.appendChild(h('section', { class: 'demanda-recusa' },
      h('h3', { texto: 'Motivo público da recusa' }),
      h('p', { class: 'campo-ajuda', texto: p.recusa.motivo }),
      h('p', { class: 'campo-ajuda', texto: ctx.formatar.dataHora(p.recusa.recusadoEm) })));
    const temPedidoAberto = pedidos?.some((r) => r.pecaId === p.id && pedidoAberto(r));
    const filaIndisponivel = !filaDisponivel(pedidos);
    if (temPedidoAberto) detalhe.appendChild(ctx.alerta('atencao', 'Esta peça tem pedido aberto. Revise a correção e dê o aceite pelo pedido abaixo.'));
    if (filaIndisponivel) detalhe.appendChild(ctx.alerta('atencao', 'A fila não pôde ser conferida. Atualize antes de registrar aceite.'));

    // 4. Pedidos já feitos e a decisão.
    const ajustesDaPeca = secaoAjustesDaPeca(ctx, pedidos, p.id, comparacao?.estado || { pronta: false, observadores: new Set() });
    if (ajustesDaPeca) detalhe.appendChild(ajustesDaPeca);
    const pedidoComVersaoAtual = pedidos?.find((r) => r.pecaId === p.id &&
      typeof r.versaoAtual === 'string' &&
      /^[a-f0-9]{40}$/.test(r.versaoAtual || '') &&
      (r.estado === 'desatualizado' || r.versaoAtual !== r.versaoAlvo));
    if (pedidoComVersaoAtual) {
      detalhe.appendChild(h('button', {
        class: 'botao', type: 'button', texto: 'Pedir ajuste na versão atual',
        disabled: !filaDisponivel(pedidos) || p.estado === 'historico',
        onclick: () => { janela.close?.(); return pedirAjuste(ctx, { ...p, versao: pedidoComVersaoAtual.versaoAtual }); },
      }));
    }
    const botaoAprovar = h('button', { class: 'botao botao-primario', type: 'button', texto: p.aprovada ? 'Aprovada nesta versão' : temPedidoAberto ? 'Aceite pela fila de ajustes' : 'Aprovar esta versão', disabled: !!p.aprovada || temPedidoAberto || filaIndisponivel || p.estado === 'historico',
      onclick: () => aprovar(ctx, p, botaoAprovar) });
    const podePedir = !filaIndisponivel && p.estado !== 'historico';
    const aberto = rascunhoAberto === chaveRascunho(p);
    const botaoAjuste = h('button', { class: 'botao', type: 'button', texto: aberto ? 'Fechar pedido de ajuste' : rascunhos.get(chaveRascunho(p))?.texto ? 'Pedir ajuste (rascunho guardado)' : 'Pedir ajuste', 'aria-expanded': String(aberto),
      disabled: !podePedir, onclick: () => { rascunhoAberto = aberto ? null : chaveRascunho(p); desenharDetalhe(); } });
    if (aberto && podePedir) {
      if (!rascunhos.has(chaveRascunho(p))) rascunhos.set(chaveRascunho(p), { categorias: new Set(), texto: '' });
      detalhe.appendChild(ajusteNaJanela(ctx, p, rascunhos.get(chaveRascunho(p)), {
        cancelar: () => { rascunhoAberto = null; desenharDetalhe(); },
        enviado: () => { rascunhos.delete(chaveRascunho(p)); rascunhoAberto = null; },
      }));
    }
    const botaoRecusar = h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Recusar peça',
      disabled: filaIndisponivel || temPedidoAberto || p.estado === 'historico',
      onclick: () => recusarPeca(ctx, p, familiaAtual?.pecas || [p], pedidos, botaoRecusar) });
    const botaoMover = p.aprovada && p.estado === 'para-aprovacao' ? h('button', {
      class: 'botao', type: 'button', texto: 'Mover para aprovados', disabled: filaIndisponivel || temPedidoAberto,
      onclick: () => promoverPeca(ctx, p, botaoMover),
    }) : null;
    detalhe.appendChild(h('div', { class: 'bloco-acao aprovacao-decisao' }, botaoAprovar, botaoAjuste, botaoRecusar,
      botaoMover,
      p.aprovada && p.estado === 'aprovados' ? h('a', { class: 'botao botao-fantasma', href: `#/marketing/calendario?secao=sem-data&peca=${encodeURIComponent(p.id)}`, texto: 'Marcar data no calendário' }) : null));

    // 5. Evidência, recolhida: andamento, histórico, referência e dados técnicos.
    detalhe.appendChild(h('details', { class: 'aprovacao-mais' },
      h('summary', { texto: 'Andamento e histórico' }),
      trilha(ctx, p),
      historicoDaPeca(ctx, p, pedidos || [])));
    if (p.editorial?.copyCanonica) detalhe.appendChild(h('details', { class: 'aprovacao-mais peca-legenda demanda-copy' },
      h('summary', { texto: 'Copy de referência' }), h('p', { class: 'texto-legenda', texto: p.editorial.copyCanonica }),
      p.editorial.avisoHarmonizacao ? h('p', { class: 'campo-ajuda', texto: p.editorial.avisoHarmonizacao }) : null));
    detalhe.appendChild(h('details', { class: 'aprovacao-mais' },
      h('summary', { texto: 'Dados técnicos' }),
      h('dl', { class: 'lista-chave-valor' },
        h('dt', { texto: 'Estado' }), h('dd', { texto: rotuloEstado(p) }),
        h('dt', { texto: 'Semana' }), h('dd', { texto: rotuloSemana(p.semana) }),
        h('dt', { texto: 'Versão' }), h('dd', { class: 'mono', texto: String(p.versao || '').slice(0, 12) }),
        h('dt', { texto: 'Arquivo' }), h('dd', { class: 'mono quebra', texto: p.caminho }),
        p.aceite ? [h('dt', { texto: 'Aceite' }), h('dd', { texto: `${ctx.formatar.dataHora(p.aceite.aprovadoEm)}${p.aceite.evidencia ? `, ${p.aceite.evidencia}` : ''}` })] : null,
        p.ajuste ? [h('dt', { texto: 'Ajuste pedido' }), h('dd', { texto: `${Object.hasOwn(ESTADOS_AJUSTE, p.ajuste.estado) ? ESTADOS_AJUSTE[p.ajuste.estado] : 'Estado não reconhecido. Atualize antes de agir.'}${p.ajuste.pedidoEm ? ` (${ctx.formatar.dataHora(p.ajuste.pedidoEm)})` : ''}` })] : null)));
    if (p.indice) {
      detalhe.appendChild(h('details', { class: 'aprovacao-mais peca-indice' },
        h('summary', { texto: 'Linha do índice da semana (pareceres e pendências)' }),
        h('p', { class: 'campo-ajuda', texto: 'Parecer de revisor não é aceite seu. Só o botão Aprovar registra aceite.' }),
        ctx.markdown(p.indice.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((x) => `- ${x.trim()}`).join('\n'))));
    }
  };

  desenharLista();
  desenharDetalhe();
  if (ctx.params.peca && selecionada?.id === ctx.params.peca) abrirJanela();
  observarPedidos(pedidos, () => { if (!ctx.obsoleta()) { desenharLista(); if (!rascunhoAberto) desenharDetalhe(); } });
  return () => { pausarMidia(); limparComparacao(); if (janela.open) janela.close(); };
}

// Categorias do pedido de ajuste. Viram prefixo do motivo, na MESMA rota de hoje
// (POST /pecas/:id/ajuste { versao, motivo }): nenhum campo novo no servidor.
export const CATEGORIAS_AJUSTE = [
  ['legenda', 'Legenda', 'Texto do post.'],
  ['visual', 'Visual', 'Imagem, cena ou quadro mostrado.'],
  ['design', 'Design', 'Composição, hierarquia, tipografia.'],
  ['copy', 'Copy da arte', 'Palavras dentro da arte, texto em tela ou locução.'],
];
const LIMITE_MOTIVO = 2000; // limite efetivo do backend para o motivo

export function motivoDoAjuste(categorias, texto) {
  const rotulos = CATEGORIAS_AJUSTE.filter(([k]) => categorias.has(k)).map(([, r]) => r);
  const corpo = String(texto || '').trim();
  return rotulos.length && corpo ? `${rotulos.join(', ')}: ${corpo}` : '';
}

function ajusteNaJanela(ctx, p, rascunho, { cancelar, enviado }) {
  const { h } = ctx;
  const idBase = `ajuste-${p.id}`;
  const recibo = h('p', { class: 'campo-ajuda', role: 'status', 'aria-live': 'polite' });
  let enviando = false;
  const registrar = h('button', { class: 'botao botao-primario', type: 'button', texto: 'Registrar pedido', onclick: async () => {
    if (enviando || ctx.obsoleta()) return;
    const motivo = motivoDoAjuste(rascunho.categorias, rascunho.texto);
    if (!motivo) { recibo.textContent = 'Escolha ao menos uma categoria e escreva o que precisa mudar.'; return; }
    if (Array.from(motivo).length > LIMITE_MOTIVO) { recibo.textContent = `O pedido passou de ${LIMITE_MOTIVO} caracteres. Encurte o texto.`; return; }
    enviando = true; registrar.disabled = true; registrar.textContent = 'Registrando…';
    try {
      const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(p.id)}/ajuste`, { versao: p.versao, motivo });
      if (ctx.obsoleta()) return;
      enviado();
      ctx.aviso('Pedido de ajuste registrado nesta versão.', 'ok');
      for (const a of r?.dados?.avisos || []) ctx.aviso(a, 'info');
      ctx.navegar(`#/marketing/aprovacao?peca=${encodeURIComponent(p.id)}`);
    } catch (err) {
      console.warn('[aprovacao-ajuste]', err.codigo || 'falha');
      if (ctx.obsoleta()) return;
      recibo.textContent = err.codigo === 'versao-mudou'
        ? 'A peça mudou depois que você abriu esta janela. Recarregue a Aprovação e revise a versão nova antes de pedir o ajuste. O seu texto continua aqui.'
        : `O pedido não foi registrado: ${err.message}. Recarregue e confira os recibos antes de repetir.`;
      enviando = false; registrar.disabled = false; registrar.textContent = 'Registrar pedido';
    }
  } });
  return h('section', { class: 'aprovacao-ajuste', 'aria-label': 'Pedir ajuste nesta versão' },
    h('h3', { texto: 'Pedir ajuste' }),
    h('fieldset', { class: 'aprovacao-ajuste-categorias' },
      h('legend', { texto: 'O que precisa mudar' }),
      CATEGORIAS_AJUSTE.map(([k, rotulo, ajuda]) => h('label', { class: 'aprovacao-ajuste-categoria', for: `${idBase}-${k}`, title: ajuda },
        h('input', { id: `${idBase}-${k}`, type: 'checkbox', value: k, checked: rascunho.categorias.has(k),
          onchange: (e) => { if (e.target.checked) rascunho.categorias.add(k); else rascunho.categorias.delete(k); } }),
        h('span', { texto: rotulo })))),
    h('div', { class: 'campo' },
      h('label', { for: `${idBase}-texto`, texto: 'Descreva o ajuste' }),
      h('textarea', { id: `${idBase}-texto`, class: 'aprovacao-ajuste-texto', rows: 4, maxlength: LIMITE_MOTIVO, texto: rascunho.texto,
        oninput: (e) => { rascunho.texto = e.target.value; } })),
    h('p', { class: 'campo-ajuda', texto: 'Fica registrado só no painel, junto desta versão. A peça continua na fila e o card não se duplica.' }),
    recibo,
    h('div', { class: 'bloco-acao' }, registrar, h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Cancelar', onclick: cancelar })));
}

// Formato visível de uma peça na galeria e no topo da prévia.
function rotuloFormato(p) {
  if (p.capaDe || p.capaOrfa) return 'Capa de Reel';
  return ROTULOS_FORMATO[formatoDaPeca(p)];
}

// Miniatura do card: capa do Reel, primeira página, primeiro quadro do vídeo ou o título.
function miniatura(ctx, p) {
  const { h } = ctx;
  const u = (x) => (ctx.urlArquivo ? ctx.urlArquivo(x) : x);
  if (p.capa?.url) return h('img', { src: u(p.capa.url), alt: '', loading: 'lazy', decoding: 'async' });
  const arq = (p.arquivos || []).map((a) => (typeof a === 'string' ? a : a?.url)).find((x) => /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov|m4v)$/i.test(x || ''));
  if (!arq) return h('span', { class: 'galeria-card-texto', texto: tituloPeca(p) });
  if (/\.(mp4|webm|mov|m4v)$/i.test(arq)) return h('video', { src: `${u(arq)}#t=0.1`, preload: 'metadata', muted: true, playsinline: true, tabindex: '-1' });
  return h('img', { src: u(arq), alt: '', loading: 'lazy', decoding: 'async' });
}

// O servidor comprova a versão alvo. Nunca montamos uma URL de Git ou caminho histórico no cliente.
export function compararVersoes(ctx, p, pedido) {
  const { h } = ctx;
  const estado = { pronta: false, pedidoId: pedido.id, observadores: new Set() };
  const antes = h('div', { class: 'demanda-comparacao-coluna' }, h('h3', { texto: 'Antes do ajuste' }));
  const depois = h('div', { class: 'demanda-comparacao-coluna' }, h('h3', { texto: 'Versão corrigida' }),
    p.tipo === 'texto' ? previaTexto(ctx, p) : ctx.midia(p, { grande: true }));
  const recibo = h('p', { class: 'campo-ajuda', role: 'status', texto: 'Conferindo a versão anterior antes de liberar o aceite…' });
  const elemento = h('section', { 'aria-label': 'Antes e depois do ajuste' },
    h('div', { class: 'demanda-comparacao' }, antes, depois), recibo);
  const urls = [];
  let encerrada = false;
  let controlador;
  // O DTO separa o nome literal da URL já codificada para servir a mídia.
  const arquivos = (p.arquivos || []).map((a) => typeof a === 'string' ? a.split('/').pop() : a.nome)
    .filter((nome) => typeof nome === 'string' && nome);
  async function carregar() {
    controlador?.abort();
    controlador = new AbortController();
    const ctrl = controlador;
    const prazo = setTimeout(() => ctrl.abort(), 15000);
    const ativos = () => !encerrada && !ctx.obsoleta() && controlador === ctrl;
    antes.replaceChildren(h('h3', { texto: 'Antes do ajuste' }));
    recibo.textContent = 'Conferindo a versão anterior antes de liberar o aceite…';
    try {
      if (!arquivos.length) throw new Error('sem-arquivos');
      for (const arquivo of arquivos) {
        const url = `/api/marketing/ajustes/${encodeURIComponent(pedido.id)}/anterior?arquivo=${encodeURIComponent(arquivo)}`;
        const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store', credentials: 'same-origin', headers: { 'X-Grana-Admin': '1' } });
        if (!r.ok) throw new Error('anterior-indisponivel');
        if (/\.(md|txt)$/i.test(arquivo)) {
          const texto = await r.text();
          if (!ativos()) return;
          if (texto.length > 200000) throw new Error('texto-muito-grande');
          antes.appendChild(/\.md$/i.test(arquivo) ? ctx.markdown(texto) : h('p', { class: 'texto-legenda', texto }));
        } else {
          const blob = await r.blob();
          if (!ativos()) return;
          if (!/\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov|m4v)$/i.test(arquivo)) throw new Error('formato-sem-previa');
          const local = URL.createObjectURL(blob);
          urls.push(local);
          const video = /\.(mp4|webm|mov|m4v)$/i.test(arquivo);
          antes.appendChild(h('div', { class: 'previa previa-grande' }, h(video ? 'video' : 'img', {
            src: local, ...(video ? { controls: true, preload: 'metadata', playsinline: true, 'aria-label': `Antes: ${tituloPeca(p)}` } : { alt: `Antes: ${tituloPeca(p)}` }),
          })));
        }
      }
      if (!ativos()) return;
      estado.pronta = true;
      recibo.textContent = 'Versão anterior conferida. Compare os arquivos e revise a legenda atual antes de aceitar.';
      for (const redesenhar of estado.observadores) redesenhar();
    } catch (err) {
      if (!ativos()) return;
      console.warn('[aprovacao-anterior]', err.name === 'AbortError' ? 'prazo-esgotado' : 'previa-indisponivel');
      recibo.textContent = 'Não foi possível conferir a versão anterior. O aceite permanece bloqueado; tente novamente ou atualize a peça.';
      antes.replaceChildren(h('h3', { texto: 'Antes do ajuste' }), h('button', {
        class: 'botao botao-fantasma', type: 'button', texto: 'Tentar comparação novamente', onclick: carregar,
      }));
      for (const local of urls.splice(0)) URL.revokeObjectURL(local);
    } finally { clearTimeout(prazo); }
  }
  carregar();
  return { elemento, estado, limpar: () => {
    encerrada = true; controlador?.abort(); estado.observadores.clear();
    for (const local of urls.splice(0)) URL.revokeObjectURL(local);
  } };
}

export async function recusarPeca(ctx, p, familia, pedidos, botao) {
  if (botao.disabled || ctx.obsoleta() || !filaDisponivel(pedidos) || pedidos.some((r) => r.pecaId === p.id && pedidoAberto(r))) return;
  botao.disabled = true;
  try {
    const sucessoras = familia.filter((a) => a.id !== p.id && a.estado !== 'historico');
    const valores = await ctx.formulario({
      titulo: 'Recusar peça', texto: 'A peça e o motivo da recusa vão para o histórico público. Escreva um texto público sobre a peça. Escolher uma sucessora não dá aceite a ela.',
      campos: [
        { nome: 'motivo', rotulo: 'Motivo público da recusa da peça', tipo: 'textarea', obrigatorio: true, linhas: 4, ajuda: 'Escreva um motivo público novo, de 1 a 500 caracteres. Não copie o pedido privado de ajuste nem inclua dados privados.' },
        { nome: 'sucessora', rotulo: 'Peça sucessora (opcional)', tipo: 'select', opcoes: [{ valor: '', rotulo: 'Sem sucessora' }, ...sucessoras.map((a) => ({ valor: a.id, rotulo: tituloPeca(a) }))] },
      ], rotuloBotao: 'Revisar recusa',
    });
    if (!valores || ctx.obsoleta()) return;
    const motivo = typeof valores.motivo === 'string' ? valores.motivo.trim() : '';
    const sucessora = valores.sucessora || '';
    if (!motivo || Array.from(motivo).length > 500 || (sucessora && !sucessoras.some((a) => a.id === sucessora))) {
      ctx.aviso('Informe um motivo público de 1 a 500 caracteres e escolha uma sucessora da lista, se desejar.', 'erro'); return;
    }
    const confirmado = await ctx.confirmar({ titulo: 'Confirmar recusa',
      texto: 'Este motivo será registrado no histórico público da peça. Confirme que ele pode ser público. Nenhum conteúdo será publicado ou agendado em redes sociais.',
      detalhes: [tituloPeca(p), motivo, sucessora ? `Sucessora: ${tituloPeca(sucessoras.find((a) => a.id === sucessora))}` : 'Sem sucessora'], rotuloBotao: 'Recusar e arquivar' });
    if (confirmado !== true || ctx.obsoleta()) return;
    const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(p.id)}/recusar`, {
      versao: p.versao, motivo, confirmacao: true, ...(sucessora ? { sucessora } : {}),
    });
    if (ctx.obsoleta()) return;
    ctx.aviso('Recusa registrada. Confira o histórico e os avisos do arquivamento.', 'ok');
    for (const aviso of r.dados?.avisos || []) ctx.aviso(aviso, 'info');
    ctx.recarregar();
  } catch (err) {
    console.warn('[aprovacao-recusar]', err.codigo || 'falha');
    if (!ctx.obsoleta()) ctx.aviso(err.codigo === 'versao-mudou' ? 'A peça mudou. Atualize e revise antes de recusar.' : 'A recusa não foi confirmada. Atualize a peça e confira os recibos antes de repetir.', 'erro');
  } finally { if (!ctx.obsoleta()) botao.disabled = false; }
}

export async function promoverPeca(ctx, p, botao) {
  if (botao.disabled || !p.aprovada || p.estado !== 'para-aprovacao' || ctx.obsoleta()) return;
  botao.disabled = true;
  try {
    const ok = await ctx.confirmar({ titulo: 'Mover para aprovados',
      texto: 'Move os arquivos desta versão aceita para aprovados e registra a prova no índice da semana. Depois, escolha o item do cronograma no Calendário. Nada será publicado ou agendado na Meta.',
      detalhes: [tituloPeca(p)], rotuloBotao: 'Mover para aprovados' });
    if (ok !== true || ctx.obsoleta()) return;
    botao.textContent = 'Movendo…';
    const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(p.id)}/promover`, { versao: p.versao, confirmacao: true });
    if (ctx.obsoleta()) return;
    for (const aviso of r.dados?.avisos || []) ctx.aviso(aviso, 'info');
    const recibo = r.dados?.promocao;
    if (!/^[a-f0-9]{16}$/.test(recibo?.id || '') || recibo.versao !== p.versao) {
      ctx.aviso('A resposta não confirmou a peça promovida. Atualize e confira o índice antes de repetir.', 'erro');
      return;
    }
    ctx.aviso(recibo.indice ? `Promoção registrada em ${recibo.indice}. Confira o vínculo e a data no Calendário.`
      : 'Promoção registrada, mas o recibo no índice está pendente. Confira o índice da semana antes de seguir.', recibo.indice ? 'ok' : 'info');
    ctx.navegar(`#/marketing/calendario?peca=${encodeURIComponent(recibo.id)}`);
  } catch (err) {
    console.warn('[aprovacao-promover]', err.codigo || 'falha');
    if (!ctx.obsoleta()) ctx.aviso(err.codigo === 'versao-mudou' || err.codigo === 'sem-aceite'
      ? 'A versão precisa de novo aceite. Atualize e revise a peça antes de mover.'
      : `A promoção não foi confirmada: ${err.message}. Atualize e confira os recibos antes de repetir.`, 'erro');
  } finally {
    if (!ctx.obsoleta()) { botao.disabled = false; botao.textContent = 'Mover para aprovados'; }
  }
}

async function aprovar(ctx, p, botao) {
  const ok = await ctx.confirmar({
    titulo: 'Aprovar esta versão',
    texto: 'Isto registra o seu aceite desta peça e desta legenda, na versão que está na tela. Não publica, não agenda e não envia nada ao Instagram ou à Meta. Se o arquivo mudar depois, o aceite deixa de valer.',
    detalhes: [tituloPeca(p), `Versão ${String(p.versao || '').slice(0, 12)}`, p.legenda ? `Legenda: ${p.legenda.slice(0, 140)}${p.legenda.length > 140 ? '…' : ''}` : 'Sem legenda registrada'],
    rotuloBotao: 'Aprovar',
  });
  if (!ok) return;
  botao.disabled = true;
  botao.textContent = 'Gravando aceite…';
  try {
    const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(p.id)}/aprovar`, { versao: p.versao, confirmacao: true });
    ctx.aviso('Aceite gravado para esta versão. Confira a previsão e o recibo na tela de Calendário.', 'ok');
    for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
    ctx.navegar(`#/marketing/aprovacao?peca=${encodeURIComponent(p.id)}`);
  } catch (err) {
    const texto = err.codigo === 'versao-mudou'
      ? 'A peça mudou depois que você abriu esta tela. Atualize e revise de novo antes de aprovar.'
      : `O aceite não foi gravado: ${err.message}`;
    ctx.aviso(texto, 'erro');
    botao.disabled = false;
    botao.textContent = 'Aprovar esta versão';
  }
}

async function pedirAjuste(ctx, p) {
  const v = await ctx.formulario({
    titulo: 'Pedir ajuste',
    texto: `O pedido fica registrado junto de "${tituloPeca(p)}", nesta versão. A peça continua na fila.`,
    campos: [{ nome: 'motivo', rotulo: 'O que precisa mudar', tipo: 'textarea', obrigatorio: true, linhas: 5, ajuda: 'Este pedido fica visível apenas no painel administrativo e acompanha esta versão da peça.' }],
    rotuloBotao: 'Registrar pedido',
  });
  if (!v) return;
  try {
    const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(p.id)}/ajuste`, { versao: p.versao, motivo: v.motivo });
    ctx.aviso('Pedido de ajuste registrado.', 'ok');
    for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
    ctx.navegar(`#/marketing/aprovacao?peca=${encodeURIComponent(p.id)}`);
  } catch (err) {
    ctx.aviso(`O pedido não foi registrado: ${err.message}`, 'erro');
  }
}

// Peça só de texto (copys, roteiro): mostra o próprio arquivo, para dar para ler
// o que se aprova sem sair do painel (achado F4 do Vigil). Markdown seguro do
// app.js, nunca HTML; .txt entra como texto corrido.
function previaTexto(ctx, p) {
  const { h } = ctx;
  const caixa = h('div', { class: 'previa previa-texto previa-documento' },
    h('p', { class: 'estado-texto', texto: 'Lendo o texto da peça…' }));
  const arq = (p.arquivos || []).map((a) => (typeof a === 'string' ? a : a && (a.url || a.caminho))).find((u) => /\.(md|txt)$/i.test(u || ''));
  if (!arq) {
    caixa.replaceChildren(h('p', { class: 'estado-texto', texto: 'Peça só de texto, sem arquivo .md ou .txt para mostrar. A legenda abaixo é o que existe.' }));
    return caixa;
  }
  const ctrl = new AbortController();
  const prazo = setTimeout(() => ctrl.abort(), 15000);
  fetch(ctx.urlArquivo(arq), { signal: ctrl.signal, cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`o servidor respondeu ${r.status}`); return r.text(); })
    .then((texto) => {
      const limite = 200_000;
      const corpo = texto.length > limite ? `${texto.slice(0, limite)}\n\n(texto cortado no painel; abra o arquivo para ler o resto)` : texto;
      caixa.replaceChildren(/\.md$/i.test(arq) ? ctx.markdown(corpo) : h('p', { class: 'texto-legenda', texto: corpo }),
        h('a', { class: 'botao botao-fantasma', href: ctx.urlArquivo(arq), target: '_blank', rel: 'noopener', texto: 'Abrir o arquivo em outra aba' }));
    })
    .catch((err) => {
      caixa.replaceChildren(h('p', { class: 'estado-texto', texto: `Não consegui ler o texto da peça (${err.name === 'AbortError' ? 'demorou mais de 15 segundos' : err.message}).` }),
        h('a', { class: 'botao', href: ctx.urlArquivo(arq), target: '_blank', rel: 'noopener', texto: 'Tentar abrir o arquivo' }));
    })
    .finally(() => clearTimeout(prazo));
  return caixa;
}
