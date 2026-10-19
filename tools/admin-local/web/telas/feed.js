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
import { tituloPeca } from './_pecas.js';

const CANAIS = { 'instagram-feed': 'Feed', stories: 'Stories', reels: 'Reels', anuncio: 'Anúncio' };

let proporcaoSalva = '4/5';
try { proporcaoSalva = localStorage.getItem('grana-admin-feed-proporcao') || '4/5'; } catch { /* sem armazenamento: segue o padrão */ }

export async function montar(raiz, ctx) {
  const h = ctx.h;
  ctx.cabecalho(raiz, 'Feed', 'O que já está publicado no perfil do Instagram, lido da Meta, só leitura.');
  const area = h('div', { class: 'feed' });
  raiz.appendChild(area);

  const carregar = async () => {
    ctx.estado.carregando(area, 'Lendo o perfil no Instagram…');
    const [editorial, publicado] = await Promise.allSettled([
      ctx.api('/api/marketing/feed'), ctx.api('/api/marketing/feed-real'),
    ]);
    if (ctx.obsoleta && ctx.obsoleta()) return;
    const dados = editorial.status === 'fulfilled' ? editorial.value?.dados : null;
    const real = publicado.status === 'fulfilled' ? publicado.value : null;
    const editorialAusente = editorial.status === 'rejected' || !dados || dados.status === 'ausente';
    const rd = (real && real.dados) || {};
    const publicadas = new Set(Array.isArray(rd.vinculadas) ? rd.vinculadas : []);
    const todas = normalizar(Array.isArray(dados) ? dados : (dados && (dados.pecas || dados.itens)) || [], ctx);
    const pecas = todas.filter((p) => !publicadas.has(p.id));
    while (area.firstChild) area.removeChild(area.firstChild);
    // Ordem de um perfil: cabeçalho, abas e proporção, grade real. As próximas são outra seção, com texto próprio.
    const ui = controles(ctx);
    const perfilReal = blocoReal(ctx, rd, carregar, ui);
    const alvo = h('div', { class: 'feed-proximas-grade' });
    area.append(perfilReal.perfil, ui.elemento, perfilReal.grade,
      h('section', { class: 'feed-proximas', 'aria-label': 'Próximas, ainda não publicadas' },
        h('h3', { texto: 'Próximas, ainda não publicadas' }),
        h('p', { class: 'fraco', texto: 'Peças aprovadas que ainda não aparecem no perfil. Aprovar não publica nada.' }),
        alvo));
    if (editorialAusente) {
      alvo.append(h('p', { role: 'alert', texto: 'Não foi possível ler as próximas peças. Atualize para tentar de novo; as publicações do perfil continuam disponíveis.' }),
        h('button', { class: 'botao', type: 'button', texto: 'Atualizar próximas peças', onclick: carregar }));
      return;
    }
    desenhar(alvo, pecas, ctx, (dados && !Array.isArray(dados) && dados.perfil) || {}, ui);
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
      titulo: tituloPeca(p),
      nomeExibicao: tituloPeca(p),
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
      capaOrfa: !!p.capaOrfa,
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
  return s.inicio && s.fim ? `${dataCurta(s.inicio)} a ${dataCurta(s.fim)}` : null;
}

function nomeDoArquivo(c) {
  if (!c) return '';
  return String(c).split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
}

// ---------------------------------------------------------------------------
// Perfil e grade

function desenhar(area, pecas, ctx, perfilDados, ui) {
  const h = ctx.h;
  while (area.firstChild) area.removeChild(area.firstChild);
  area.dataset.perfil = perfilDados.nome || 'grana.';

  const reels = pecas.filter((p) => p.ehVideo);
  const grade = h('ul', { class: 'feed-grade', 'aria-label': 'Próximas publicações' });
  const painel = h('div');
  area.append(painel);

  const preencher = ({ aba, proporcao }) => {
    while (painel.firstChild) painel.removeChild(painel.firstChild);
    while (grade.firstChild) grade.removeChild(grade.firstChild);
    grade.dataset.proporcao = proporcao;
    const lista = aba === 'reels' ? reels : pecas;
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
  ui.aoMudar(preencher);
}

// Abas e proporção são do perfil inteiro: valem para a grade real e para as próximas.
function controles(ctx) {
  const h = ctx.h;
  const estado = { aba: 'publicacoes', proporcao: proporcaoSalva === '1/1' ? '1' : '45' };
  const ouvintes = [];
  const avisar = () => ouvintes.forEach((f) => f(estado));
  const abaPub = h('button', { class: 'feed-aba', type: 'button', role: 'tab', 'aria-selected': 'true', id: 'feed-aba-pub', 'aria-controls': 'feed-painel-real' },
    iconeSvg('grade'), 'PUBLICAÇÕES');
  const abaReels = h('button', { class: 'feed-aba', type: 'button', role: 'tab', 'aria-selected': 'false', id: 'feed-aba-reels', 'aria-controls': 'feed-painel-real' },
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
    estado.proporcao = proporcaoSalva === '1/1' ? '1' : '45';
    avisar();
  });
  const abas = h('div', { class: 'feed-abas', role: 'tablist', 'aria-label': 'Conteúdo do perfil' }, abaPub, abaReels);
  const trocar = (nova) => {
    estado.aba = nova;
    abaPub.setAttribute('aria-selected', String(nova === 'publicacoes'));
    abaReels.setAttribute('aria-selected', String(nova === 'reels'));
    avisar();
  };
  abaPub.addEventListener('click', () => trocar('publicacoes'));
  abaReels.addEventListener('click', () => trocar('reels'));
  abas.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const proxima = estado.aba === 'publicacoes' ? 'reels' : 'publicacoes';
    trocar(proxima);
    (proxima === 'reels' ? abaReels : abaPub).focus();
  });
  return { elemento: h('div', { class: 'feed-controles' }, proporcao, abas), aoMudar: (f) => { ouvintes.push(f); f(estado); } };
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
    p.semana ? `Período: ${p.semana}` : null,
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

// ---------------------------------------------------------------------------
// Perfil real (Graph, só leitura)

const TIPOS_REAL = { reel: 'Reel', carrossel: 'Carrossel', video: 'Vídeo', imagem: 'Feed' };
const MOTIVOS_REAL = {
  'nao-configurado': 'A leitura do Instagram não está configurada neste computador (variáveis META_* do .env).',
  'sem-permissao': 'A Meta recusou a credencial de leitura. Gere um token novo com permissão de conteúdo do Instagram.',
  'resposta-invalida': 'A Meta respondeu de um jeito que o painel não entendeu.',
};

// A rota de miniatura é autenticada (cabeçalho do painel): <img src> direto não manda o cabeçalho e a
// imagem vem negada. Busca com o cabeçalho e exibe como blob, como o Calendário.
const ROTA_MINIATURA = '/api/marketing/calendario/meta-midia?chave=';
function carregarMiniatura(src, img, aoFalhar) {
  if (typeof src !== 'string' || !src.startsWith(ROTA_MINIATURA)) { aoFalhar(); return; }
  fetch(src, { headers: { Accept: 'image/*', 'X-Grana-Admin': '1' }, credentials: 'same-origin' })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`status-${r.status}`))))
    .then((b) => { img.src = URL.createObjectURL(b); })
    .catch((err) => { console.warn('[feed-miniatura]', err.message || 'falhou'); aoFalhar(); });
}

function blocoReal(ctx, rd, recarregar, ui) {
  const h = ctx.h;
  const painel = h('div', { id: 'feed-painel-real', role: 'tabpanel', 'aria-labelledby': 'feed-aba-pub' });
  if (rd.status !== 'disponivel') {
    const motivo = MOTIVOS_REAL[rd.motivo] || 'Não foi possível ler o perfil na Meta agora.';
    return { perfil: h('section', { class: 'feed-real', 'aria-label': 'Perfil real do Instagram' },
      h('div', { class: 'estado estado-erro', role: 'alert' },
        h('p', { class: 'estado-texto', texto: motivo }),
        h('button', { class: 'botao', type: 'button', texto: 'Tentar de novo', onclick: recarregar }))), grade: painel };
  }
  const p = rd.perfil || {};
  const n = (v) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(v));
  const perfil = h('header', { class: 'feed-perfil' },
    h('div', { class: 'feed-avatar' }, h('img', { src: AVATAR, alt: 'Ícone circular do Grana.', width: 150, height: 150 })),
    h('div', { class: 'feed-identidade' },
      h('div', { class: 'feed-nome-linha' },
        h('h2', { class: 'feed-nome', texto: p.usuario ? '@' + p.usuario : 'Instagram' }),
        h('span', { class: 'selo selo-neutro', texto: 'Lido da Meta' })),
      h('ul', { class: 'feed-contadores', 'aria-label': 'Contadores do perfil' },
        h('li', null, h('b', { texto: n(p.posts) }), 'publicações'),
        h('li', null, h('b', { texto: n(p.seguidores) }), 'seguidores'),
        h('li', null, h('b', { texto: n(p.seguindo) }), 'seguindo'))));
  const posts = Array.isArray(rd.posts) ? rd.posts : [];
  const grade = h('ul', { class: 'feed-grade', 'aria-label': 'Publicações do perfil' });
  const celulas = posts.map((post) => celulaReal(ctx, post, () => abrirPostReal(ctx, post, p.usuario)));
  ui.aoMudar(({ aba, proporcao }) => {
    painel.replaceChildren();
    grade.replaceChildren();
    grade.dataset.proporcao = proporcao;
    painel.setAttribute('aria-labelledby', aba === 'reels' ? 'feed-aba-reels' : 'feed-aba-pub');
    const lista = celulas.filter((c, i) => aba !== 'reels' || posts[i].formato === 'reel');
    if (!lista.length) {
      painel.appendChild(h('div', { class: 'estado estado-vazio', role: 'status' }, h('p', { class: 'estado-texto',
        texto: !posts.length ? 'A Meta não devolveu nenhuma publicação para este perfil.' : 'Nenhum Reel entre as publicações lidas.' })));
      return;
    }
    if (!rd.completo && aba !== 'reels') painel.appendChild(h('p', { class: 'fraco', texto: `Mostrando as ${posts.length} publicações mais recentes.` }));
    for (const c of lista) grade.appendChild(h('li', null, c));
    painel.appendChild(grade);
  });
  return { perfil, grade: painel };
}

function celulaReal(ctx, post, abrir) {
  const h = ctx.h;
  const tipo = TIPOS_REAL[post.formato] || 'Feed';
  const data = post.data ? dataCurta(post.data) : '';
  const legenda = resumo(post.legenda || '', 140);
  const sem = h('span', { class: 'feed-celula-texto', texto: legenda || tipo });
  const img = h('img', { alt: '', decoding: 'async' });
  const caixa = h('span', { class: 'feed-celula-miniatura' }, img);
  carregarMiniatura(post.miniatura, img, () => caixa.replaceChildren(sem));
  return h('button', { class: 'feed-celula', type: 'button', onclick: abrir,
    'aria-label': `${tipo} de ${data}. ${legenda || 'Sem legenda'}. Abrir a prévia.` },
    caixa,
    h('span', { class: 'feed-celula-selo', 'aria-hidden': 'true', texto: `${tipo} · ${data}` }),
    h('span', { class: 'feed-celula-veu', 'aria-hidden': 'true', texto: legenda || 'Abrir a prévia' }));
}

// Post real: legenda inteira, data e o link para o Instagram, na mesma janela das peças.
function abrirPostReal(ctx, post, usuario) {
  const h = ctx.h;
  document.querySelectorAll('dialog.feed-post').forEach((d) => d.remove());
  const devolverFoco = document.activeElement;
  const tipo = TIPOS_REAL[post.formato] || 'Feed';
  const nome = usuario ? `@${usuario}` : 'Instagram';
  const dlg = h('dialog', { class: 'feed-post', 'aria-label': `${tipo} de ${post.data ? dataCurta(post.data) : 'data desconhecida'}` });
  const img = h('img', { alt: '', class: 'feed-post-real-img' });
  const midia = h('div', { class: 'feed-post-midia feed-midia-carregando' }, img);
  img.addEventListener('load', () => { img.alt = 'Miniatura da publicação'; midia.classList.remove('feed-midia-carregando'); if (img.naturalWidth > 0) midia.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; }, { once: true });
  carregarMiniatura(post.miniatura, img, () => midia.replaceChildren(h('p', { class: 'fraco', texto: 'Sem miniatura. A legenda e o link continuam ao lado.' })));
  const topo = h('div', { class: 'feed-post-topo' },
    h('img', { src: AVATAR, alt: '' }),
    h('div', null, h('span', { texto: nome }), h('small', { texto: `Publicado no Instagram · ${tipo}` })),
    h('button', { class: 'feed-fechar', type: 'button', 'aria-label': 'Fechar', onclick: () => dlg.close() }, iconeSvg('fechar')));
  const legenda = post.legenda
    ? h('div', { class: 'feed-legenda' }, h('b', { texto: nome }), post.legenda)
    : h('div', { class: 'feed-legenda feed-legenda-vazia', texto: 'Sem legenda.' });
  const quando = post.publicadoEm ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(post.publicadoEm)) : null;
  const meta = h('div', { class: 'feed-post-meta' },
    h('div', { class: 'feed-post-dados' },
      h('span', { texto: quando ? `Publicado em ${quando} · São Paulo` : post.data ? `Publicado em ${ctx.formatar.data(post.data)}` : 'Data não informada' })),
    post.link ? h('div', { class: 'fileira' },
      h('a', { class: 'botao', href: post.link, target: '_blank', rel: 'noopener noreferrer', texto: 'Abrir no Instagram' })) : null,
    post.formato === 'carrossel' ? h('p', { class: 'campo-ajuda', texto: 'A Meta entrega só a capa do carrossel. Os demais slides estão na publicação no Instagram.' }) : null);
  dlg.appendChild(h('div', { class: 'feed-post-corpo' }, midia, h('div', { class: 'feed-post-lado' }, topo, legenda, meta)));
  ligarDialogo(dlg, { devolverFoco });
  document.body.appendChild(dlg);
  dlg.showModal();
  topo.querySelector('.feed-fechar').focus();
}
