// Tela Feed do painel local (Lumen): simulação do perfil do Instagram do Grana.
//
// Mostra só peças APROVADAS (a rota /api/marketing/feed já filtra: pasta aprovados ou
// aceite registrado para aquela versão). A gramática é a do perfil do Instagram
// (cabeçalho, contadores, grade de 3 colunas, post aberto com legenda), com a
// identidade do Grana.: escuro, petróleo, menta rara, Neue Machina. Nada aqui publica.
//
// Ordem da grade, como num perfil de verdade, com a publicação mais recente no topo:
// primeiro as aprovadas ainda sem data (as próximas a entrar), depois as datadas da mais
// tardia para a mais antiga. Nenhum número inventado: os contadores contam as peças.

import { AVATAR, EXT_VIDEO, iconeSvg, midiasDaPeca, montarMidia, topoDaPrevia, ligarDialogo } from './_previa-publicacao.js';

const CANAIS = { 'instagram-feed': 'Feed', stories: 'Stories', reels: 'Reels', anuncio: 'Anúncio' };

let proporcaoSalva = '4/5';
try { proporcaoSalva = localStorage.getItem('grana-admin-feed-proporcao') || '4/5'; } catch { /* sem armazenamento: segue o padrão */ }

export async function montar(raiz, ctx) {
  const h = ctx.h;
  ctx.cabecalho(raiz, 'Feed', 'Como o perfil fica com as peças que você aprovou. Aprovar não publica nada; a publicação continua sendo sua, no aplicativo do Instagram.');
  const area = h('div', { class: 'feed' });
  raiz.appendChild(area);

  const carregar = async () => {
    ctx.estado.carregando(area, 'Lendo as peças aprovadas…');
    let resposta;
    try {
      resposta = await ctx.api('/api/marketing/feed');
    } catch (err) {
      if (ctx.obsoleta && ctx.obsoleta()) return;
      ctx.estado.erro(area, err, carregar);
      return;
    }
    if (ctx.obsoleta && ctx.obsoleta()) return;
    const dados = resposta && resposta.dados;
    if (dados && dados.status === 'ausente') { ctx.estado.ausente(area, 'marketing', dados.motivo); return; }
    const pecas = normalizar(Array.isArray(dados) ? dados : (dados && (dados.pecas || dados.itens)) || [], ctx);
    desenhar(area, pecas, ctx, (dados && !Array.isArray(dados) && dados.perfil) || {});
  };

  let dialogo = null;
  const fecharDialogo = () => { if (dialogo && dialogo.open) dialogo.close(); };
  area.addEventListener('feed:abrir', (e) => { dialogo = e.detail; });

  await carregar();
  return () => { fecharDialogo(); document.querySelectorAll('dialog.feed-post').forEach((d) => d.remove()); };
}

// ---------------------------------------------------------------------------
// Dados

function normalizar(lista, ctx) {
  const pecas = lista.map((p) => {
    const midias = midiasDaPeca(p, ctx.urlArquivo);
    const todos = midias;
    const temVideo = midias.some((a) => EXT_VIDEO.test(a));
    const tipo = p.tipo || (midias.length > 1 ? 'carrossel' : temVideo ? 'video' : midias.length ? 'imagem' : 'texto');
    const pub = p.planejamento || p.publicacao || (p.data ? { data: p.data, hora: p.hora, canal: p.canal } : null);
    const editorial = p.editorial && typeof p.editorial === 'object' ? p.editorial : null;
    const duplicataCapa = p.capa?.duplicataVisual && typeof p.capa.duplicataVisual === 'object'
      ? p.capa.duplicataVisual
      : null;
    return {
      bruto: p,
      id: p.id,
      titulo: p.titulo || nomeDoArquivo(p.caminho || todos[0]) || 'Peça sem título',
      legenda: p.legenda || '',
      midias,
      // capa pareada pelo catálogo (<video>-capa.png); a rota do feed já tira a capa da grade como peça solta
      capa: p.capa && p.capa.url ? {
        url: ctx.urlArquivo ? ctx.urlArquivo(p.capa.url) : p.capa.url,
        aprovada: !!p.capa.aprovada,
        duplicataVisual: duplicataCapa,
      } : null,
      editorial,
      tipo,
      ehVideo: tipo === 'video' || tipo === 'reels' || (midias.length === 1 && temVideo),
      data: pub && pub.data ? pub.data : null,
      hora: pub && pub.hora ? pub.hora : null,
      canal: (pub && pub.canal) || p.canal || null,
      aprovadoEm: (p.aceite && p.aceite.aprovadoEm) || p.aprovadoEm || null,
      versao: p.versao || null,
      caminho: p.caminho || todos[0] || null,
      semana: textoSemana(p.semana),
    };
  });
  // perfil: o mais novo no topo. Sem data primeiro (são as próximas), depois data decrescente.
  return pecas.sort((a, b) => {
    if (!a.data && b.data) return -1;
    if (a.data && !b.data) return 1;
    if (a.data && b.data) {
      const k = `${b.data} ${b.hora || ''}`.localeCompare(`${a.data} ${a.hora || ''}`);
      if (k) return k;
    }
    return String(b.aprovadoEm || '').localeCompare(String(a.aprovadoEm || ''));
  });
}

function textoSemana(s) {
  if (!s) return null;
  if (typeof s === 'string') return s;
  const n = s.numero ? `Semana ${s.numero}` : 'Semana';
  return s.inicio && s.fim ? `${n}, ${dataCurta(s.inicio)} a ${dataCurta(s.fim)}` : n;
}

function nomeDoArquivo(c) {
  if (!c) return '';
  return String(c).split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}

// ---------------------------------------------------------------------------
// Perfil e grade

function desenhar(area, pecas, ctx, perfilDados) {
  const h = ctx.h;
  while (area.firstChild) area.removeChild(area.firstChild);
  area.dataset.perfil = perfilDados.nome || 'grana.';

  const comData = pecas.filter((p) => p.data).length;
  const reels = pecas.filter((p) => p.ehVideo);

  const perfil = h('header', { class: 'feed-perfil' },
    h('div', { class: 'feed-avatar' }, h('img', { src: perfilDados.avatar || AVATAR, alt: 'Ícone circular do Grana.', width: 150, height: 150 })),
    h('div', { class: 'feed-identidade' },
      h('div', { class: 'feed-nome-linha' },
        h('h2', { class: 'feed-nome', texto: perfilDados.nome || 'grana.' }),
        h('span', { class: 'selo selo-neutro', texto: 'Perfil simulado' })),
      h('ul', { class: 'feed-contadores', 'aria-label': 'Resumo do perfil simulado' },
        h('li', null, h('b', { texto: String(pecas.length) }), pecas.length === 1 ? 'publicação' : 'publicações'),
        h('li', null, h('b', { texto: String(comData) }), 'com data'),
        h('li', null, h('b', { texto: String(pecas.length - comData) }), 'sem data')),
      h('div', { class: 'feed-bio' },
        h('span', { class: 'feed-bio-nome', texto: 'Grana.' }),
        // a bio não é inventada: nenhum material a define ainda (o Flare devolve bio null e bioPendente)
        perfilDados.bio
          ? h('span', { class: 'feed-bio-texto', texto: perfilDados.bio })
          : h('span', { class: 'fraco', texto: perfilDados.bioPendente || 'Bio ainda não definida em nenhum material de marketing.' }),
        perfilDados.observacao ? h('span', { class: 'fraco', texto: perfilDados.observacao }) : null)));

  area.appendChild(perfil);

  // abas: publicações e reels, como no perfil
  let aba = 'publicacoes';
  const grade = h('ul', { class: 'feed-grade', dados: { proporcao: proporcaoSalva === '1/1' ? '1' : '45' }, 'aria-label': 'Grade do perfil' });
  const abaPub = h('button', { class: 'feed-aba', type: 'button', role: 'tab', 'aria-selected': 'true', id: 'feed-aba-pub', 'aria-controls': 'feed-painel' },
    iconeSvg('grade'), 'PUBLICAÇÕES');
  const abaReels = h('button', { class: 'feed-aba', type: 'button', role: 'tab', 'aria-selected': 'false', id: 'feed-aba-reels', 'aria-controls': 'feed-painel' },
    iconeSvg('reels'), 'REELS');
  const proporcao = h('div', { class: 'filtros', role: 'group', 'aria-label': 'Proporção da grade' },
    h('button', { class: 'chip', type: 'button', 'aria-pressed': String(proporcaoSalva !== '1/1'), texto: 'Grade 4:5', dados: { valor: '4/5' } }),
    h('button', { class: 'chip', type: 'button', 'aria-pressed': String(proporcaoSalva === '1/1'), texto: 'Grade 1:1', dados: { valor: '1/1' } }));
  proporcao.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    proporcaoSalva = b.dataset.valor;
    try { localStorage.setItem('grana-admin-feed-proporcao', proporcaoSalva); } catch { /* opcional */ }
    for (const x of proporcao.children) x.setAttribute('aria-pressed', String(x === b));
    grade.dataset.proporcao = proporcaoSalva === '1/1' ? '1' : '45';
  });

  const abas = h('div', { class: 'feed-abas', role: 'tablist', 'aria-label': 'Conteúdo do perfil' }, abaPub, abaReels);
  const painel = h('div', { id: 'feed-painel', role: 'tabpanel', 'aria-labelledby': 'feed-aba-pub' });
  area.append(abas, painel);

  const preencher = () => {
    while (painel.firstChild) painel.removeChild(painel.firstChild);
    while (grade.firstChild) grade.removeChild(grade.firstChild);
    const lista = aba === 'reels' ? reels : pecas;
    painel.setAttribute('aria-labelledby', aba === 'reels' ? 'feed-aba-reels' : 'feed-aba-pub');
    if (!lista.length) {
      painel.appendChild(h('div', { class: 'estado estado-vazio', role: 'status' },
        h('p', { class: 'estado-texto', texto: aba === 'reels'
          ? 'Nenhum vídeo aprovado ainda. Reels aprovados aparecem aqui sozinhos.'
          : 'Nenhuma peça tem o seu aceite ainda. Quando você aprovar uma peça na tela Aprovação, ela aparece aqui sozinha.' }),
        h('a', { class: 'botao', href: '#/marketing/aprovacao', texto: 'Abrir a fila de aprovação' })));
      return;
    }
    lista.forEach((p, i) => grade.appendChild(h('li', null, celula(h, p, () => abrirPost(area, lista, i, ctx)))));
    painel.appendChild(grade);
  };
  const trocar = (nova) => {
    aba = nova;
    abaPub.setAttribute('aria-selected', String(nova === 'publicacoes'));
    abaReels.setAttribute('aria-selected', String(nova === 'reels'));
    preencher();
  };
  abaPub.addEventListener('click', () => trocar('publicacoes'));
  abaReels.addEventListener('click', () => trocar('reels'));
  abas.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const proxima = aba === 'publicacoes' ? 'reels' : 'publicacoes';
    trocar(proxima);
    (proxima === 'reels' ? abaReels : abaPub).focus();
  });

  area.insertBefore(proporcao, abas);
  preencher();
}

function celula(h, p, abrir) {
  const capa = p.midias[0];
  let midia;
  if (!capa) {
    midia = h('span', { class: 'feed-celula-texto', texto: p.legenda ? resumo(p.legenda, 140) : p.titulo });
  } else if (p.ehVideo && p.capa) {
    // capa 1080x1920: a grade recorta o centro (object-fit: cover), como o Instagram
    midia = h('img', { src: p.capa.url, alt: '', loading: 'lazy', decoding: 'async' });
  } else if (EXT_VIDEO.test(capa)) {
    // sem capa: primeiro quadro, e o selo abaixo avisa (recibo, nunca fundo vazio)
    midia = h('video', { src: capa.includes('#') ? capa : `${capa}#t=0.1`, preload: 'metadata', muted: true, playsinline: true, tabindex: '-1', 'aria-hidden': 'true' });
  } else {
    midia = h('img', { src: capa, alt: '', loading: 'lazy', decoding: 'async' });
  }
  const tipoIcone = p.midias.length > 1 ? iconeSvg('carrossel') : p.ehVideo ? iconeSvg('reels') : null;
  if (tipoIcone) tipoIcone.classList.add('feed-celula-tipo');
  const editorialLabel = rotuloEditorial(p.editorial);
  const harmonizacaoPendente = !!(p.editorial && p.editorial.avisoHarmonizacao);
  const dataTexto = p.data ? dataCurta(p.data) : 'Sem data';
  const avisoCapa = !p.ehVideo ? '' : !p.capa ? ' · Sem capa' : !p.capa.aprovada ? ' · Capa não aceita' : '';
  const rotuloData = dataTexto + avisoCapa;
  return h('button', { class: 'feed-celula', type: 'button', onclick: abrir, 'aria-label': `${p.titulo}${editorialLabel ? `. ${editorialLabel}` : ''}${harmonizacaoPendente ? '. Harmonização de copy pendente.' : ''}${avisoCapa ? `. ${avisoCapa.slice(3)}` : ''}. ${p.data ? `Publicação em ${dataCurta(p.data)}` : 'Aprovada, sem data de publicação'}. Abrir.` },
    midia,
    tipoIcone,
    editorialLabel || harmonizacaoPendente ? h('span', { class: 'feed-celula-editorial-stack', 'aria-hidden': 'true' },
      editorialLabel ? h('span', { class: 'feed-celula-editorial', texto: editorialLabel }) : null,
      harmonizacaoPendente ? h('span', { class: 'feed-celula-harmonizacao', texto: 'Harmonizar copy' }) : null) : null,
    h('span', { class: 'feed-celula-selo', 'aria-hidden': 'true', texto: rotuloData }),
    h('span', { class: 'feed-celula-veu', 'aria-hidden': 'true', texto: p.titulo }));
}

function rotuloEditorial(e) {
  if (!e) return '';
  const familia = e.familia ? `${e.familia} · ` : '';
  if (e.tipo === 'canonico') return `${familia}Base canônica`;
  if (e.tipo === 'variante') return `${familia}${e.variante === 'narrado' ? 'Variante narrada' : `Variante ${e.variante || ''}`.trim()}`;
  if (e.tipo === 'visual-candidata') return `${familia}Revisão visual 06`;
  if (e.tipo === 'capa') return `${familia}Capa`;
  return familia ? familia.trim().replace(/\s*·$/, '') : '';
}

// ---------------------------------------------------------------------------
// Post aberto

function abrirPost(area, lista, indice, ctx) {
  const h = ctx.h;
  document.querySelectorAll('dialog.feed-post').forEach((d) => d.remove());
  const p = lista[indice];
  const nomePerfil = area.dataset.perfil || 'grana.';
  const devolverFoco = document.activeElement;

  const corpo = h('div', { class: 'feed-post-corpo' });
  const dlg = h('dialog', { class: 'feed-post', 'aria-label': p.titulo }, corpo);

  // mídia: componente compartilhado com a Aprovação
  const { elemento: midiaEl, pausar: pausarTudo } = montarMidia(h, p);

  // lateral: topo, legenda, metadados
  const topo = topoDaPrevia(h, { nome: nomePerfil, formato: p.canal ? CANAIS[p.canal] || p.canal : 'Feed', aoFechar: () => dlg.close() });

  const legenda = p.legenda
    ? h('div', { class: 'feed-legenda' }, h('b', { texto: nomePerfil }), p.legenda)
    : h('div', { class: 'feed-legenda feed-legenda-vazia', texto: 'Sem legenda ainda.' });
  const editorial = blocoEditorial(h, p);

  const dados = [
    p.data ? `Publicação planejada: ${ctx.formatar ? ctx.formatar.data(p.data) : p.data}${p.hora ? ` às ${p.hora}` : ''}` : 'Aprovada, ainda sem data de publicação',
    p.aprovadoEm ? `Aprovada em ${ctx.dataHora ? ctx.dataHora(p.aprovadoEm) : p.aprovadoEm}` : null,
    p.semana ? `Semana: ${p.semana}` : null,
  ].filter(Boolean);
  const meta = h('div', { class: 'feed-post-meta' },
    h('div', { class: 'feed-post-acoes', 'aria-hidden': 'true' }, iconeSvg('curtir'), iconeSvg('comentar'), iconeSvg('enviar'), h('span', null, iconeSvg('salvar'))),
    h('div', { class: 'feed-post-dados' },
      dados.map((t) => h('span', { texto: t })),
      p.caminho ? h('span', { texto: `Arquivo: ${String(p.caminho).split('/').pop()}` }) : null),
    h('div', { class: 'fileira' },
      h('a', { class: 'botao botao-fantasma', href: '#/marketing/calendario', texto: p.data ? 'Ver no calendário' : 'Marcar data no calendário' }),
      lista.length > 1 ? navPost(h, area, lista, indice, ctx, dlg) : null));

  corpo.append(midiaEl, h('div', { class: 'feed-post-lado' }, topo, legenda, editorial, meta));

  ligarDialogo(dlg, { devolverFoco, aoFechar: pausarTudo });
  dlg.querySelectorAll('a[href^="#/"]').forEach((a) => a.addEventListener('click', () => dlg.close()));

  document.body.appendChild(dlg);
  dlg.showModal();
  topo.querySelector('.feed-fechar').focus();
  area.dispatchEvent(new CustomEvent('feed:abrir', { detail: dlg }));
}

function blocoEditorial(h, p) {
  const e = p.editorial;
  const duplicataVisual = (e && e.duplicataVisual) || (p.capa && p.capa.duplicataVisual);
  if (!e && !duplicataVisual) return null;

  const identidade = rotuloEditorial(e);
  return h('section', { class: 'feed-editorial', 'aria-label': 'Referência editorial' },
    identidade ? h('p', { class: 'feed-editorial-identidade', texto: identidade }) : null,
    e?.copyCanonica ? h('div', { class: 'feed-editorial-copy' },
      h('span', { class: 'feed-editorial-rotulo', texto: 'Copy canônica · referência' }),
      h('p', { texto: e.copyCanonica }),
      e.fonteCopy ? h('small', { class: 'feed-editorial-fonte', texto: `Fonte: ${e.fonteCopy}` }) : null) : null,
    e?.avisoHarmonizacao ? h('p', { class: 'feed-editorial-aviso', role: 'note', texto: e.avisoHarmonizacao }) : null,
    duplicataVisual ? h('p', { class: 'feed-editorial-capa', role: 'note', texto: 'Capa igual nas versões base e narrada.' }) : null);
}

function navPost(h, area, lista, indice, ctx, dlg) {
  const ir = (i) => { dlg.close(); abrirPost(area, lista, i, ctx); };
  return h('span', { class: 'fileira' },
    h('button', { class: 'botao botao-fantasma', type: 'button', disabled: indice === 0, 'aria-label': 'Publicação anterior', onclick: () => ir(indice - 1) }, iconeSvg('esquerda')),
    h('span', { class: 'fraco num', texto: `${indice + 1} de ${lista.length}` }),
    h('button', { class: 'botao botao-fantasma', type: 'button', disabled: indice === lista.length - 1, 'aria-label': 'Próxima publicação', onclick: () => ir(indice + 1) }, iconeSvg('direita')));
}

// ---------------------------------------------------------------------------
// Utilidades

function dataCurta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}` : String(iso);
}

function resumo(t, n) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
