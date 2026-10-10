// Aprovação: fila de para-aprovacao, prévia grande, trilha Versão → Revisão → Aceite → Planejamento.
// Aprovar grava o aceite do autor para AQUELA versão (sha1). Não publica nem agenda nada em rede social.

import { tituloPeca, rotuloSemana, rotuloEstado, trilha, agruparFamilias, idadeDemanda } from './_pecas.js';
import { montarFila, secaoAjustesDaPeca, situacaoDaDemanda, observarPedidos, pedidoAberto, filaDisponivel } from './ajustes.js';

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
  ctx.cabecalho(raiz, 'Aprovação', 'Revise as demandas, acompanhe os agentes e registre o aceite de cada versão. Nada é publicado ou agendado no Instagram.', [
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

  const fila = pecas.filter((p) => ['para-aprovacao', 'aprovados', 'historico'].includes(p.estado))
    .sort((a, b) => (a.aprovada === b.aprovada ? String(b.semana?.inicio || '').localeCompare(String(a.semana?.inicio || '')) : a.aprovada ? 1 : -1));
  if (!fila.length) {
    ctx.estado.vazio(corpo, 'Nenhuma demanda no acervo. Quando uma peça estiver disponível, ela aparece aqui.');
    return;
  }

  let selecionada = fila.find((p) => p.id === ctx.params.peca) || fila.find((p) => !p.aprovada) || fila[0];
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  const familias = agruparFamilias(fila, familiasServidor);
  let limparComparacao = () => {};
  const preferencias = lerFiltros();
  const tipos = ['todos', 'imagem', 'video', 'carrossel', 'texto'];
  const estados = ['todos', 'voce', 'agentes', 'resolvidas'];
  const semanas = [...new Map(fila.filter((p) => p.semana?.inicio).map((p) => [p.semana.inicio, p.semana])).values()].sort((a, b) => b.inicio.localeCompare(a.inicio));
  const filtros = {
    tipo: tipos.includes(preferencias.tipo) ? preferencias.tipo : 'todos',
    estado: estados.includes(preferencias.estado) ? preferencias.estado : 'todos',
    semana: semanas.some((s) => s.inicio === preferencias.semana) ? preferencias.semana : 'todas',
  };
  const lista = h('div', { class: 'demanda-secoes', 'aria-label': 'Mesa de demandas' });
  const detalhe = h('div', { class: 'fila-detalhe demanda-detalhe' });
  const contagemFamilias = h('p', { class: 'fila-contagem', 'aria-live': 'polite' });
  const grupoSelecionado = () => familias.find((g) => g.pecas.some((p) => p.id === selecionada?.id));
  const escolher = (p) => { selecionada = p; desenharLista(); desenharDetalhe(); detalhe.focus({ preventScroll: false }); };
  const situacaoFamilia = (grupo) => {
    const situacoes = grupo.pecas.map((p) => situacaoDaDemanda(p, pedidos));
    return situacoes.find((s) => s.secao === 'voce') || situacoes.find((s) => s.secao === 'agentes') || situacoes[0];
  };
  const seletor = (id, rotulo, opcoes, chave) => h('div', { class: 'campo' }, h('label', { for: id, texto: rotulo }),
    h('select', { id, onchange: (e) => { filtros[chave] = e.target.value; guardarFiltros(filtros); desenharLista(); desenharDetalhe(); } },
      opcoes.map(([value, texto]) => h('option', { value, texto, selected: filtros[chave] === value }))));
  corpo.appendChild(h('div', { class: 'barra-filtros filtros-demandas form-linha' },
    seletor('demandas-semana', 'Semana', [['todas', 'Todas as semanas'], ...semanas.map((s) => [s.inicio, rotuloSemana(s)])], 'semana'),
    seletor('demandas-tipo', 'Formato', [['todos', 'Todos os formatos'], ['imagem', 'Imagem'], ['video', 'Vídeo'], ['carrossel', 'Carrossel'], ['texto', 'Texto']], 'tipo'),
    seletor('demandas-estado', 'Próxima ação', [['todos', 'Todas'], ['voce', 'Precisa de você'], ['agentes', 'Com os agentes'], ['resolvidas', 'Resolvidas']], 'estado')));
  corpo.appendChild(h('div', { class: 'aprovacao mesa-demandas' }, h('div', { class: 'fila-coluna' }, contagemFamilias, lista), detalhe));

  const desenharLista = () => {
    while (lista.firstChild) lista.removeChild(lista.firstChild);
    const visiveis = familias.filter((g) => g.pecas.some((p) => (filtros.tipo === 'todos' || p.tipo === filtros.tipo) &&
      (filtros.semana === 'todas' || p.semana?.inicio === filtros.semana)));
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
      const itens = h('ul', { class: 'fila demanda-lista' });
      for (const g of grupos[chave]) {
        const p = g.principal;
        const s = situacaoFamilia(g);
        const imagem = p.capa?.url || (p.tipo === 'imagem' ? p.arquivos?.[0]?.url : null);
        const selo = ctx.selo(s.secao === 'voce' ? 'alerta' : s.secao === 'resolvidas' ? 'ok' : 'neutro', s.rotulo);
        selo.setAttribute('class', `${selo.getAttribute?.('class') || selo.attrs?.class || 'selo'} demanda-selo`);
        selo.setAttribute('data-estado', s.pedido?.estado || p.estadoEfetivo || p.estado);
        itens.appendChild(h('li', { class: 'demanda-familia' }, h('button', {
          class: 'fila-item demanda-item', type: 'button', 'aria-current': g === grupoSelecionado() ? 'true' : undefined,
          'data-estado': s.pedido?.estado || p.estadoEfetivo || p.estado, 'data-secao': s.secao,
          onclick: () => escolher(p),
        },
        imagem ? h('img', { class: 'demanda-miniatura', src: ctx.urlArquivo ? ctx.urlArquivo(imagem) : imagem, alt: '', loading: 'lazy' }) : null,
        h('span', { class: 'fila-item-titulo', texto: tituloPeca(p) }),
        h('span', { class: 'fila-item-meta', texto: `${rotuloSemana(p.semana)} · ${p.tipo}` }),
        selo,
        h('span', { class: 'demanda-proximo', texto: s.proximo }),
        h('span', { class: 'demanda-idade', texto: idadeDemanda(s.em) }))));
      }
      secao.appendChild(itens);
      lista.appendChild(secao);
    }
  };

  const desenharDetalhe = () => {
    limparComparacao();
    limparComparacao = () => {};
    while (detalhe.firstChild) detalhe.removeChild(detalhe.firstChild);
    const p = selecionada;
    if (!p) { detalhe.appendChild(h('p', { class: 'campo-ajuda', texto: 'Selecione uma demanda para revisar.' })); return; }
    detalhe.setAttribute('tabindex', '-1');
    detalhe.setAttribute('aria-label', `Detalhe de ${tituloPeca(p)}`);
    detalhe.appendChild(h('h2', { class: 'secao-titulo', texto: tituloPeca(p) }));
    const familiaAtual = grupoSelecionado();
    const alternativas = familiaAtual?.pecas.filter((a) => !a.capaDe && a.id !== p.id) || [];
    if (alternativas.length) detalhe.appendChild(h('section', { class: 'demanda-alternativas', 'aria-label': 'Alternativas da família' },
      h('h3', { texto: 'Alternativas' }), h('div', { class: 'bloco-acao' }, alternativas.map((a) => h('button', {
        class: 'botao botao-fantasma', type: 'button', texto: tituloPeca(a), onclick: () => escolher(a),
      })) )));
    detalhe.appendChild(trilha(ctx, p));
    const corrigido = pedidos?.find((r) => r.pecaId === p.id && r.estado === 'corrigido-aguardando-aceite' && r.versaoCorrigida === p.versao);
    let comparacao;
    if (corrigido) {
      comparacao = compararVersoes(ctx, p, corrigido);
      detalhe.appendChild(comparacao.elemento);
      limparComparacao = comparacao.limpar;
    } else detalhe.appendChild(p.tipo === 'texto' ? previaTexto(ctx, p) : ctx.midia(p, { grande: true }));
    if (!corrigido && pedidos?.some((r) => r.pecaId === p.id && r.estado === 'corrigido-aguardando-aceite')) {
      detalhe.appendChild(ctx.alerta('atencao', 'A versão da peça não confere com a correção entregue. Atualize antes de comparar e dar o aceite.'));
    }
    if (p.capa?.pecaId) {
      const capa = fila.find((a) => a.id === p.capa.pecaId);
      if (capa) detalhe.appendChild(h('section', { class: 'demanda-capa', 'aria-label': 'Capa do vídeo' },
        h('h3', { texto: 'Capa do vídeo' }), ctx.midia(capa),
        h('p', { class: 'campo-ajuda', texto: capa.aprovada ? 'Capa aprovada nesta versão, com aceite próprio.' : 'A capa exige aceite próprio; o aceite do vídeo não vale para ela.' }),
        h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Revisar capa', onclick: () => escolher(capa) })));
    }
    if (p.editorial?.copyCanonica) detalhe.appendChild(h('div', { class: 'peca-legenda demanda-copy' },
      h('h3', { texto: 'Copy de referência' }), h('p', { class: 'texto-legenda', texto: p.editorial.copyCanonica }),
      p.editorial.avisoHarmonizacao ? h('p', { class: 'campo-ajuda', texto: p.editorial.avisoHarmonizacao }) : null));
    if (p.recusa) detalhe.appendChild(h('section', { class: 'demanda-recusa' },
      h('h3', { texto: 'Motivo público da recusa' }),
      h('p', { class: 'campo-ajuda', texto: p.recusa.motivo }),
      h('p', { class: 'campo-ajuda', texto: ctx.formatar.dataHora(p.recusa.recusadoEm) })));
    detalhe.appendChild(h('div', { class: 'peca-legenda' },
      h('h3', { texto: 'Legenda' }),
      p.legenda ? h('p', { class: 'texto-legenda', texto: p.legenda }) : h('p', { class: 'texto-fraco', texto: 'Sem legenda registrada para esta peça.' }),
      p.fonteLegenda ? h('p', { class: 'campo-ajuda', texto: `Fonte da legenda: ${p.fonteLegenda}` }) : null));
    detalhe.appendChild(h('dl', { class: 'lista-chave-valor' },
      h('dt', { texto: 'Estado' }), h('dd', { texto: rotuloEstado(p) }),
      h('dt', { texto: 'Semana' }), h('dd', { texto: rotuloSemana(p.semana) }),
      h('dt', { texto: 'Versão' }), h('dd', { class: 'mono', texto: String(p.versao || '').slice(0, 12) }),
      h('dt', { texto: 'Arquivo' }), h('dd', { class: 'mono quebra', texto: p.caminho }),
      p.aceite ? [h('dt', { texto: 'Aceite' }), h('dd', { texto: `${ctx.formatar.dataHora(p.aceite.aprovadoEm)}${p.aceite.evidencia ? `, ${p.aceite.evidencia}` : ''}` })] : null,
      p.ajuste ? [h('dt', { texto: 'Ajuste pedido' }), h('dd', { texto: `${Object.hasOwn(ESTADOS_AJUSTE, p.ajuste.estado) ? ESTADOS_AJUSTE[p.ajuste.estado] : 'Estado não reconhecido. Atualize antes de agir.'}${p.ajuste.pedidoEm ? ` (${ctx.formatar.dataHora(p.ajuste.pedidoEm)})` : ''}` })] : null));
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
        onclick: () => pedirAjuste(ctx, { ...p, versao: pedidoComVersaoAtual.versaoAtual }),
      }));
    }
    if (p.aceiteDeVersaoAnterior) detalhe.appendChild(ctx.alerta('atencao', 'Uma versão anterior desta peça foi aprovada, mas o arquivo mudou depois. O aceite antigo não vale para esta versão.'));
    if (p.indice) {
      detalhe.appendChild(h('details', { class: 'peca-indice' },
        h('summary', { texto: 'Linha do índice da semana (pareceres e pendências)' }),
        h('p', { class: 'campo-ajuda', texto: 'Parecer de revisor não é aceite seu. Só o botão abaixo registra aceite.' }),
        ctx.markdown(p.indice.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((x) => `- ${x.trim()}`).join('\n'))));
    }
    const temPedidoAberto = pedidos?.some((r) => r.pecaId === p.id && pedidoAberto(r));
    const filaIndisponivel = !filaDisponivel(pedidos);
    if (temPedidoAberto) detalhe.appendChild(ctx.alerta('atencao', 'Esta peça tem pedido aberto. Revise a correção e dê o aceite pelo pedido na fila de ajustes.'));
    if (filaIndisponivel) detalhe.appendChild(ctx.alerta('atencao', 'A fila não pôde ser conferida. Atualize antes de registrar aceite.'));
    const botaoAprovar = h('button', { class: 'botao botao-primario', type: 'button', texto: p.aprovada ? 'Aprovada nesta versão' : temPedidoAberto ? 'Aceite pela fila de ajustes' : 'Aprovar esta versão', disabled: !!p.aprovada || temPedidoAberto || filaIndisponivel || p.estado === 'historico',
      onclick: () => aprovar(ctx, p, botaoAprovar) });
    const botaoAjuste = h('button', { class: 'botao', type: 'button', texto: 'Pedir ajuste', disabled: filaIndisponivel || p.estado === 'historico', onclick: () => pedirAjuste(ctx, p) });
    const botaoRecusar = h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Recusar peça',
      disabled: filaIndisponivel || temPedidoAberto || p.estado === 'historico',
      onclick: () => recusarPeca(ctx, p, familiaAtual?.pecas || [p], pedidos, botaoRecusar) });
    detalhe.appendChild(h('div', { class: 'bloco-acao' }, botaoAprovar, botaoAjuste, botaoRecusar,
      p.aprovada ? h('a', { class: 'botao botao-fantasma', href: '#/marketing/calendario', texto: 'Marcar data no calendário' }) : null));
  };

  desenharLista();
  desenharDetalhe();
  observarPedidos(pedidos, () => { if (!ctx.obsoleta()) { desenharLista(); desenharDetalhe(); } });
  return () => limparComparacao();
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
