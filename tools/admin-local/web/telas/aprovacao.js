// Aprovação: galeria de famílias; clicar abre a prévia do post com legenda e decisão.
// Aprovar grava o aceite do autor para AQUELA versão (sha1). Não publica nem agenda nada em rede social.

import { tituloPeca, rotuloSemana, rotuloEstado, trilha, historicoDaPeca, agruparFamilias, idadeDemanda, formatoDaPeca, ROTULOS_FORMATO, juntarCapasAoReel, pecaDaFila, arquivada } from './_pecas.js';
import { montarMidia, midiasDaPeca, topoDaPrevia } from './_previa-publicacao.js';
import { faltaLegenda, localLegenda } from './_legenda-publicacao.js';
import { montarFila, secaoAjustesDaPeca, situacaoDaFamilia, contarPrecisaDeVoce, textoAlertaDemanda, observarPedidos, pedidoAberto, filaDisponivel, aguardaLegenda } from './ajustes.js';

// Mesmos rótulos de estado usados no detalhe dos pedidos em ajustes.js.
const ESTADOS_AJUSTE = {
  novo: 'Recebido, aguardando entrega', 'em-correcao': 'Em correção',
  'corrigido-aguardando-aceite': 'Corrigido, aguardando seu aceite', aceito: 'Aceito nesta versão',
  'falha-de-envio': 'Falha na entrega', 'aguardando-aprovacao-de-custo': 'Pausado para aprovação de custo',
  desatualizado: 'Versão desatualizada', 'precisa-de-atencao': 'Precisa de atenção',
};

// F4-1 na linha do INDICE.md: a célula do cronograma (`manifesto#item@versão`, com ou sem crase)
// vira "vinculada ao cronograma"; UUID e hash (7+ hex com letra e dígito, como a versão curta
// `386a6fec7528` dos aceites) somem, junto com a palavra "versão" que os apresenta. Célula vazia some.
const HEX = '(?=[0-9a-f]*\\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,}';
export function semIdTecnico(celula) {
  return String(celula)
    .replace(/`?[^\s`|#]+#[^\s`|@]+@[^\s`|]+`?/g, 'vinculada ao cronograma')
    .replace(/`?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`?/gi, '')
    .replace(new RegExp(`,?\\s*\\bvers[aã]o\\s+\`?\\b${HEX}\\b\`?`, 'gi'), '')
    .replace(new RegExp(`\`?\\b${HEX}\\b\`?`, 'gi'), '')
    .replace(/\s+([,;.])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

// Estado da capa dentro do Reel. Com composição selada, aprovar o Reel aceita vídeo, capa e legenda
// juntos; sem ela, a capa precisa do aceite dela. Capa alterada muda a versão do Reel e volta a pedir aceite.
export function textoCapa(reel, capa) {
  // "Aceite próprio" só com registro da capa (capa.aceite); capa.aprovada também vale pela pasta aprovados (F-03b).
  if (capa?.aceite) return 'Capa aprovada nesta versão, com aceite próprio.';
  if (reel.capa?.aprovada) return 'Capa aprovada junto com o Reel: o aceite desta versão cobre vídeo, capa e legenda.';
  if (reel.composicao) return 'Capa ainda sem aceite. Aprovar este Reel aceita vídeo, capa e legenda juntos.';
  return 'A capa exige aceite próprio; o aceite do vídeo não vale para ela.';
}

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
    seletor('demandas-semana', 'Período', [['todas', 'Todos os períodos'], ...semanas.map((s) => [s.inicio, rotuloSemana(s)])], 'semana'),
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
  // A decisão fica FORA da área que rola, como irmã dela: nada rola por baixo e um foco no fim
  // do conteúdo nunca fica escondido atrás dela (P-05 por teclado).
  const decisao = h('div', { class: 'bloco-acao aprovacao-decisao' });
  let devolverFoco = null;
  let midiaAtual = { chave: null, pausar: () => {}, limpar: () => {}, comparacao: null };
  const pausarMidia = () => { midiaAtual.pausar(); midiaSlot.querySelectorAll?.('video').forEach((v) => v.pause()); };
  const janela = h('dialog', {
    class: 'feed-post aprovacao-janela', 'aria-label': 'Prévia da peça',
    onclose: () => {
      pausarMidia();
      rascunhoAberto = null;
      // A galeria é redesenhada ao abrir: o foco volta ao card da família, achado pelo id.
      // Roda depois da restauração nativa do <dialog>, que mira o card antigo já recriado.
      const focar = () => {
        const alvo = lista.querySelector?.(`[data-peca="${CSS.escape(grupoSelecionado()?.principal?.id || '')}"]`)
          || (devolverFoco?.isConnected ? devolverFoco : null);
        alvo?.focus?.();
      };
      focar();
      setTimeout(focar, 0);
    },
    onclick: (e) => { if (e.target === janela) janela.close(); },
    // Esc com o pedido de ajuste aberto fecha só o pedido; o texto fica guardado.
    oncancel: (e) => {
      if (!rascunhoAberto) return;
      e.preventDefault();
      rascunhoAberto = null;
      desenharDetalhe();
      decisao.querySelector?.('[aria-expanded]')?.focus();
    },
  }, h('div', { class: 'feed-post-corpo' }, midiaSlot, h('div', { class: 'feed-post-lado aprovacao-janela-lado' }, cabecaJanela, detalhe)), decisao);
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
    // Sem <dialog> modal (ambiente sem DOM real) não há janela aberta, e a mídia não é montada.
    if (!selecionada || typeof janela.showModal !== 'function') return;
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
  let focarAjuste = false;
  const chaveRascunho = (p) => `${p.id}:${p.versao || ''}`;
  const escolher = (p, abrir = true) => {
    if (selecionada?.id !== p.id) rascunhoAberto = null;
    selecionada = p; desenharLista(); desenharDetalhe();
    if (abrir) abrirJanela();
  };

  // Mesmo código editorial (C14, R5…) em mais de uma família da mesma semana: é revisão que o
  // catálogo ainda não junta (backend, Harbor). A tela não escolhe a vigente; ela avisa.
  const outrasVersoes = (g) => {
    const p = g.principal;
    if (!p?.codigo || arquivada(p) || g.registro) return [];
    return familias.filter((o) => o !== g && !o.registro && o.principal?.codigo === p.codigo && !arquivada(o.principal)
      && o.principal.semana?.inicio === p.semana?.inicio);
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
    // Arte sem legenda não é aprovável: fica numa linha própria até a legenda chegar (autor, 18/10).
    const semLegenda = [];
    for (const g of visiveis) {
      const s = situacaoFamilia(g);
      if (aguardaLegenda(g, pedidos)) { semLegenda.push(g); continue; }
      if (filtros.estado !== 'todos' && filtros.estado !== s.secao) continue;
      if (s.secao === 'resolvidas') {
        const em = Date.parse(s.em || '');
        if (!Number.isFinite(em) || Date.now() - em > 7 * 86400000 || em > Date.now()) continue;
      }
      grupos[s.secao].push(g);
    }
    const exibidos = [...Object.values(grupos).flat(), ...semLegenda];
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
      if (chave === 'agentes' && semLegenda.length) {
        const linha = h('details', { class: 'demanda-secao demanda-resolvidas', 'aria-label': 'Sem legenda' },
          h('summary', { class: 'demanda-secao-titulo', texto: `Sem legenda (${semLegenda.length})` }),
          h('p', { class: 'campo-ajuda', texto: 'A legenda está sendo escrita. Quando chegar, a peça volta para você aprovar.' }));
        const itensSem = h('ul', { class: 'galeria-grade demanda-lista' });
        for (const g of semLegenda) itensSem.appendChild(cardDaFamilia(g));
        linha.appendChild(itensSem);
        lista.appendChild(linha);
      }
    }
  };

  const cardDaFamilia = (g) => {
    const p = g.principal;
    const irmas = outrasVersoes(g);
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
      g.registro?.pendencia ? h('span', { class: 'galeria-card-aviso', texto: 'Falta escolher a revisão' })
        : irmas.length ? h('span', { class: 'galeria-card-aviso', texto: `Outra versão na fila (${irmas.length + 1})` })
        : p.capaOrfa ? h('span', { class: 'galeria-card-aviso', texto: 'Capa sem Reel' })
        : p.tipo === 'video' && !p.capa ? h('span', { class: 'galeria-card-aviso', texto: 'Sem capa' }) : null),
    h('span', { class: 'galeria-card-corpo' },
      h('span', { class: 'galeria-card-titulo', texto: tituloPeca(p) }),
      h('span', { class: 'galeria-card-meta', texto: g.superadas?.length ? `${rotuloSemana(p.semana)} · ${g.superadas.length === 1 ? '1 revisão anterior' : `${g.superadas.length} revisões anteriores`}` : rotuloSemana(p.semana) }),
      selo,
      h('span', { class: 'demanda-proximo', texto: [...s.alertas.map(textoAlertaDemanda), s.proximo].filter(Boolean).join(' ') }),
      h('span', { class: 'demanda-idade', texto: idadeDemanda(s.em) }))));
  };

  const desenharDetalhe = () => {
    while (detalhe.firstChild) detalhe.removeChild(detalhe.firstChild);
    while (decisao.firstChild) decisao.removeChild(decisao.firstChild);
    const p = selecionada;
    decisao.hidden = !p;
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
      s?.proximo ? h('span', { class: 'campo-ajuda', texto: s.proximo }) : null,
      p.revisao?.total > 1 && p.revisao.vigente ? h('span', { class: 'campo-ajuda', texto: `Revisão ${p.revisao.ordem} de ${p.revisao.total}, a vigente${p.revisao.nome ? ` de ${p.revisao.nome}` : ''}.` }) : null));
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
        // F-03: p.capa.aprovada já conta o aceite composto do Reel (catalogo.cjs); a capa isolada só o próprio.
        h('p', { class: 'campo-ajuda', texto: textoCapa(p, capa) }),
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
    const pendencia = familiaAtual?.registro?.pendencia || p.revisao?.pendencia || null;
    if (pendencia) detalhe.appendChild(ctx.alerta('atencao', `Falta você escolher a revisão vigente${familiaAtual?.registro?.nome ? ` de ${familiaAtual.registro.nome}` : ''}: ${pendencia}. Até lá, aprovar e mover ficam bloqueados. Pedir ajuste continua possível.`));
    const superadas = familiaAtual?.superadas || [];
    if (superadas.length) detalhe.appendChild(h('details', { class: 'aprovacao-mais demanda-superadas' },
      h('summary', { texto: `Revisões anteriores (${superadas.length})` }),
      h('p', { class: 'campo-ajuda', texto: 'Substituídas pela revisão vigente. Ficam só para consulta: não podem ser aprovadas, agendadas nem publicadas.' }),
      h('ul', { class: 'demanda-superadas-lista' }, superadas.map((a) => h('li', {},
        h('span', { texto: `${a.revisao?.ordem ? `Revisão ${a.revisao.ordem}` : 'Revisão anterior'} · ${tituloPeca(a)} · ${rotuloSemana(a.semana)}` }),
        a.aceiteSuperado ? h('span', { class: 'campo-ajuda', texto: ` Tinha aceite de ${ctx.formatar.dataHora(a.aceiteSuperado.aprovadoEm)}, que não vale mais.` } ) : null)))));
    const irmas = familiaAtual ? outrasVersoes(familiaAtual) : [];
    if (irmas.length) {
      detalhe.appendChild(ctx.alerta('atencao', `Há ${irmas.length === 1 ? 'outra versão' : `${irmas.length} outras versões`} desta peça na fila desta semana, como peça separada. Confira qual é a vigente antes de aprovar: aprovar esta não recusa a outra.`));
      detalhe.appendChild(h('div', { class: 'bloco-acao' }, irmas.map((o) => h('button', {
        class: 'botao botao-fantasma', type: 'button', texto: `Ver ${tituloPeca(o.principal)}`, onclick: () => escolher(o.principal) }))));
    }
    for (const a of situacaoDaFamilia({ pecas: [p] }, pedidos).alertas) {
      detalhe.appendChild(h('p', { class: 'demanda-atencao campo-ajuda', role: 'status', texto: [textoAlertaDemanda(a), a.proximoPasso].filter(Boolean).join(' ') }));
    }
    if (p.aceiteDeVersaoAnterior) detalhe.appendChild(ctx.alerta('atencao', 'Uma versão anterior desta peça foi aprovada, mas o arquivo mudou depois. O aceite antigo não vale para esta versão.'));
    if (p.recusa) detalhe.appendChild(h('section', { class: 'demanda-recusa' },
      h('h3', { texto: 'Motivo público da recusa' }),
      h('p', { class: 'campo-ajuda', texto: p.recusa.motivo }),
      h('p', { class: 'campo-ajuda', texto: ctx.formatar.dataHora(p.recusa.recusadoEm) })));
    // Só bloqueia o ajuste ainda em andamento; correção entregue é aprovada pelo mesmo botão Aprovar.
    const temPedidoAberto = pedidos?.some((r) => r.pecaId === p.id && pedidoAberto(r) && r.estado !== 'corrigido-aguardando-aceite');
    const filaIndisponivel = !filaDisponivel(pedidos);
    if (temPedidoAberto) detalhe.appendChild(h('p', { class: 'campo-ajuda', role: 'status', texto: 'Ajuste em andamento. O Aprovar libera quando a versão corrigida chegar.' }));
    if (filaIndisponivel) detalhe.appendChild(ctx.alerta('atencao', 'A fila não pôde ser conferida. Atualize antes de registrar aceite.'));

    // 4. Pedidos já feitos e a decisão.
    const ajustesDaPeca = secaoAjustesDaPeca(ctx, pedidos, p.id, comparacao?.estado || { pronta: false, observadores: new Set() }, p);
    if (ajustesDaPeca) detalhe.appendChild(ajustesDaPeca);
    const pedidoComVersaoAtual = pedidos?.find((r) => r.pecaId === p.id &&
      typeof r.versaoAtual === 'string' &&
      /^[a-f0-9]{40}$/.test(r.versaoAtual || '') &&
      (r.estado === 'desatualizado' || r.versaoAtual !== r.versaoAlvo));
    if (pedidoComVersaoAtual) {
      detalhe.appendChild(h('button', {
        class: 'botao', type: 'button', texto: 'Pedir ajuste na versão atual',
        disabled: !filaDisponivel(pedidos) || arquivada(p),
        onclick: () => { janela.close?.(); return pedirAjuste(ctx, { ...p, versao: pedidoComVersaoAtual.versaoAtual }); },
      }));
    }
    if (faltaLegenda(p)) detalhe.appendChild(ctx.alerta('atencao', `Falta a legenda para publicar. ${localLegenda(p)}`));
    // Em aprovados com versão nova (legenda ou arquivo mudou depois do aceite) o Aprovar volta a valer.
    const jaAceita = !!p.aprovada && p.estado !== 'para-aprovacao' && !(p.estado === 'aprovados' && !p.aceite && p.aceiteDeVersaoAnterior);
    const botaoAprovar = h('button', { class: 'botao botao-primario', type: 'button', texto: jaAceita ? 'Aprovada nesta versão' : 'Aprovar', disabled: faltaLegenda(p) || jaAceita || temPedidoAberto || filaIndisponivel || arquivada(p) || !!pendencia,
      onclick: () => aprovar(ctx, p, botaoAprovar) });
    const podePedir = !filaIndisponivel && !arquivada(p);
    const aberto = rascunhoAberto === chaveRascunho(p);
    const botaoAjuste = h('button', { class: 'botao', type: 'button', texto: aberto ? 'Fechar pedido de ajuste' : rascunhos.get(chaveRascunho(p))?.texto ? 'Pedir ajuste (rascunho guardado)' : 'Pedir ajuste', 'aria-expanded': String(aberto),
      disabled: !podePedir, onclick: () => { rascunhoAberto = aberto ? null : chaveRascunho(p); focarAjuste = !aberto; desenharDetalhe(); } });
    if (faltaLegenda(p)) detalhe.appendChild(h('button', { class: 'botao', type: 'button', texto: 'Solicitar ajuste da legenda', disabled: !podePedir,
      onclick: () => { rascunhoAberto = chaveRascunho(p); focarAjuste = true; desenharDetalhe(); } }));
    if (aberto && podePedir) {
      if (!rascunhos.has(chaveRascunho(p))) rascunhos.set(chaveRascunho(p), { categorias: new Set(), texto: '' });
      const secaoAjuste = ajusteNaJanela(ctx, p, rascunhos.get(chaveRascunho(p)), {
        cancelar: () => { rascunhoAberto = null; desenharDetalhe(); },
        enviado: () => { rascunhos.delete(chaveRascunho(p)); rascunhoAberto = null; },
      });
      detalhe.appendChild(secaoAjuste);
      // Ao abrir, o pedido entra na vista e o foco vai para a primeira categoria (achado L8).
      if (focarAjuste) {
        focarAjuste = false;
        const reduzir = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(() => {
          secaoAjuste.scrollIntoView?.({ block: 'nearest', behavior: reduzir ? 'auto' : 'smooth' });
          secaoAjuste.querySelector?.('input')?.focus({ preventScroll: true });
        }, 0);
      }
    }
    const botaoRecusar = h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Recusar',
      disabled: filaIndisponivel || temPedidoAberto || arquivada(p),
      onclick: () => recusarPeca(ctx, p, familiaAtual?.pecas || [p], pedidos, botaoRecusar) });
    [botaoAprovar, botaoAjuste, botaoRecusar,
      p.aprovada && p.estado === 'aprovados' ? h('a', { class: 'botao botao-fantasma', href: `#/marketing/calendario?secao=sem-data&peca=${encodeURIComponent(p.id)}`, texto: 'Marcar data no calendário' }) : null,
    ].filter(Boolean).forEach((b) => decisao.appendChild(b));

    // 5. Evidência, recolhida: andamento, histórico, referência e dados técnicos.
    detalhe.appendChild(h('details', { class: 'aprovacao-mais' },
      h('summary', { texto: 'Andamento e histórico' }),
      trilha(ctx, p),
      historicoDaPeca(ctx, p, pedidos || [])));
    if (p.editorial?.copyCanonica) detalhe.appendChild(h('details', { class: 'aprovacao-mais peca-legenda demanda-copy' },
      h('summary', { texto: 'Copy de referência' }), h('p', { class: 'texto-legenda', texto: p.editorial.copyCanonica }),
      p.editorial.avisoHarmonizacao ? h('p', { class: 'campo-ajuda', texto: p.editorial.avisoHarmonizacao }) : null));
    detalhe.appendChild(h('details', { class: 'aprovacao-mais' },
      h('summary', { texto: 'Detalhes do arquivo' }),
      h('dl', { class: 'lista-chave-valor' },
        h('dt', { texto: 'Estado' }), h('dd', { texto: rotuloEstado(p) }),
        h('dt', { texto: 'Período' }), h('dd', { texto: rotuloSemana(p.semana) }),
        // F4-1: sem hash da versão; o arquivo pelo nome e pela data em que mudou.
        h('dt', { texto: 'Arquivo' }), h('dd', { class: 'quebra', texto: String(p.caminho || p.nome || 'não informado').split('/').pop() }),
        p.modificadoEm ? [h('dt', { texto: 'Alterado em' }), h('dd', { texto: ctx.formatar.dataHora(p.modificadoEm) })] : null,
        p.aceite ? [h('dt', { texto: 'Aceite' }), h('dd', { texto: `${ctx.formatar.dataHora(p.aceite.aprovadoEm)}${p.aceite.evidencia ? `, ${p.aceite.evidencia}` : ''}` })] : null,
        p.ajuste ? [h('dt', { texto: 'Ajuste pedido' }), h('dd', { texto: `${Object.hasOwn(ESTADOS_AJUSTE, p.ajuste.estado) ? ESTADOS_AJUSTE[p.ajuste.estado] : 'Estado não reconhecido. Atualize antes de agir.'}${p.ajuste.pedidoEm ? ` (${ctx.formatar.dataHora(p.ajuste.pedidoEm)})` : ''}` })] : null)));
    if (p.indice) {
      detalhe.appendChild(h('details', { class: 'aprovacao-mais peca-indice' },
        h('summary', { texto: 'Linha do índice da semana (pareceres e pendências)' }),
        h('p', { class: 'campo-ajuda', texto: 'Só o botão Aprovar registra o seu aceite.' }),
        // F4-1: a chave manifesto#item@versão, UUID e hash ficam só no INDICE.md; na tela, o vínculo aparece em palavras.
        ctx.markdown(p.indice.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((x) => semIdTecnico(x.trim())).filter(Boolean).map((x) => `- ${x}`).join('\n'))));
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
  const recibo = h('p', { class: 'campo-ajuda', role: 'status', texto: 'Carregando a versão anterior…' });
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
    recibo.textContent = 'Carregando a versão anterior…';
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
      recibo.textContent = 'Antes e depois do ajuste.';
      for (const redesenhar of estado.observadores) redesenhar();
    } catch (err) {
      if (!ativos()) return;
      console.warn('[aprovacao-anterior]', err.name === 'AbortError' ? 'prazo-esgotado' : 'previa-indisponivel');
      // Só informativa (autor, 18/10): sem a anterior, mostra a versão nova e não bloqueia o Aprovar.
      recibo.textContent = 'Versão anterior indisponível';
      antes.replaceChildren();
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
    const sucessoras = familia.filter((a) => a.id !== p.id && !arquivada(a));
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

export async function aprovar(ctx, p, botao) {
  if (botao.disabled || ctx.obsoleta() || faltaLegenda(p)) return;
  botao.disabled = true;
  try {
    const ok = await ctx.confirmar({
      titulo: 'Aprovar',
      texto: 'Aprova esta peça e esta legenda, fecha as correções entregues e move os arquivos para aprovados. Depois, abre o Calendário da peça. Não publica, não agenda e não envia nada ao Instagram ou à Meta. Se o arquivo mudar depois, o aceite deixa de valer.',
      detalhes: [tituloPeca(p), p.modificadoEm ? `Arquivo de ${ctx.formatar.dataHora(p.modificadoEm)}` : 'Versão que está na tela agora', p.legenda ? `Legenda: ${p.legenda.slice(0, 140)}${p.legenda.length > 140 ? '…' : ''}` : 'Sem legenda registrada'],
      rotuloBotao: 'Aprovar',
    });
    if (ok !== true || ctx.obsoleta()) return;
    botao.textContent = 'Aprovando…';
    const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(p.id)}/aprovar`, { versao: p.versao, confirmacao: true });
    if (ctx.obsoleta()) return;
    for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
    // Já em aprovados: não há movimentação, só o aceite desta versão.
    if (p.estado === 'aprovados') {
      if (r.dados?.aprovacao?.versao !== p.versao) { ctx.aviso('O aceite desta versão não foi confirmado. Atualize e tente Aprovar novamente.', 'erro'); return; }
      ctx.aviso('Versão aprovada. Siga ao Calendário para agendar.', 'ok');
      ctx.navegar(`#/marketing/calendario?peca=${encodeURIComponent(p.id)}`);
      return;
    }
    const recibo = r.dados?.promocao;
    if (!/^[a-f0-9]{16}$/.test(recibo?.id || '') || recibo.versao !== p.versao) {
      ctx.aviso('A movimentação para aprovados não foi confirmada. Confira os avisos e tente Aprovar novamente.', 'erro');
      return;
    }
    ctx.aviso(recibo.indice ? `Promoção registrada em ${recibo.indice}. Confira o vínculo e a data no Calendário.`
      : 'Promoção registrada, mas o recibo no índice está pendente. Confira o índice da semana antes de seguir.', recibo.indice ? 'ok' : 'info');
    ctx.navegar(`#/marketing/calendario?peca=${encodeURIComponent(recibo.id)}`);
  } catch (err) {
    console.warn('[aprovacao-aprovar]', err.codigo || 'falha');
    const texto = err.codigo === 'versao-mudou'
      ? 'A peça mudou depois que você abriu esta tela. Atualize e revise de novo antes de aprovar.'
      : `A aprovação não foi confirmada: ${String(err.message || 'Falha ao aprovar').replace(/[.\s]+$/u, '')}. Atualize e confira os recibos antes de repetir.`;
    if (!ctx.obsoleta()) ctx.aviso(texto, 'erro');
  } finally {
    if (!ctx.obsoleta()) { botao.disabled = false; botao.textContent = 'Aprovar'; }
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
