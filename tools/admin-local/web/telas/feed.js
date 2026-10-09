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

const AVATAR = '/design-system/marca/icone-circular.svg';
const EXT_VIDEO = /\.(mp4|webm|mov|m4v)$/i;
const EXT_IMAGEM = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
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
  // Flare: arquivos[] = { nome, tipo, url } com url já servível; aceita também string ou { caminho }
  const arquivos = (p) => (Array.isArray(p.arquivos) && p.arquivos.length ? p.arquivos : [p.caminho])
    .map((a) => (typeof a === 'string' ? a : a && (a.url || a.caminho)))
    .filter(Boolean)
    .map((a) => (ctx.urlArquivo ? ctx.urlArquivo(a) : url(a)));
  const pecas = lista.map((p) => {
    const todos = arquivos(p);
    const midias = todos.filter((a) => EXT_VIDEO.test(a) || EXT_IMAGEM.test(a));
    const temVideo = midias.some((a) => EXT_VIDEO.test(a));
    const tipo = p.tipo || (midias.length > 1 ? 'carrossel' : temVideo ? 'video' : midias.length ? 'imagem' : 'texto');
    const pub = p.planejamento || p.publicacao || (p.data ? { data: p.data, hora: p.hora, canal: p.canal } : null);
    return {
      bruto: p,
      id: p.id,
      titulo: p.titulo || nomeDoArquivo(p.caminho || todos[0]) || 'Peça sem título',
      legenda: p.legenda || '',
      midias,
      // capa pareada pelo catálogo (<video>-capa.png); a rota do feed já tira a capa da grade como peça solta
      capa: p.capa && p.capa.url ? { url: ctx.urlArquivo ? ctx.urlArquivo(p.capa.url) : url(p.capa.url), aprovada: !!p.capa.aprovada } : null,
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
  const dataTexto = p.data ? dataCurta(p.data) : 'Sem data';
  const avisoCapa = !p.ehVideo ? '' : !p.capa ? ' · Sem capa' : !p.capa.aprovada ? ' · Capa não aceita' : '';
  const rotuloData = dataTexto + avisoCapa;
  return h('button', { class: 'feed-celula', type: 'button', onclick: abrir, 'aria-label': `${p.titulo}${avisoCapa ? `. ${avisoCapa.slice(3)}` : ''}. ${p.data ? `Publicação em ${dataCurta(p.data)}` : 'Aprovada, sem data de publicação'}. Abrir.` },
    midia,
    tipoIcone,
    h('span', { class: 'feed-celula-selo', 'aria-hidden': 'true', texto: rotuloData }),
    h('span', { class: 'feed-celula-veu', 'aria-hidden': 'true', texto: p.titulo }));
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

  // mídia
  const midiaEl = h('div', { class: 'feed-post-midia' });
  // A área de mídia toma a proporção da peça (como o Instagram abre o post) e a mídia aparece
  // inteira (contain). Reel com capa já nasce 9:16; o resto lê a proporção natural ao carregar.
  const proporcaoDaPeca = (w, hh) => { if (w > 0 && hh > 0) midiaEl.style.aspectRatio = `${w} / ${hh}`; };
  if (p.ehVideo) proporcaoDaPeca(9, 16);
  let pausarTudo = () => {};
  if (!p.midias.length) {
    midiaEl.appendChild(h('div', { class: 'feed-celula-texto', texto: p.legenda || p.titulo }));
  } else {
    const trilho = h('div', { class: 'feed-trilho', tabindex: '0', role: 'group', 'aria-roledescription': 'carrossel', 'aria-label': p.titulo });
    const slides = p.midias.map((arq, i) => {
      const alt = p.midias.length > 1 ? `${p.titulo}, ${i + 1} de ${p.midias.length}` : p.titulo;
      const el = EXT_VIDEO.test(arq)
        ? h('video', { src: arq, controls: true, preload: 'metadata', playsinline: true, 'aria-label': alt, ...(p.capa ? { poster: p.capa.url } : {}) })
        : h('img', { src: arq, alt, decoding: 'async' });
      Object.assign(el.style, { width: '100%', height: '100%', objectFit: 'contain' });
      if (i === 0) {
        if (el.tagName === 'VIDEO') el.addEventListener('loadedmetadata', () => proporcaoDaPeca(el.videoWidth, el.videoHeight), { once: true });
        else if (el.complete && el.naturalWidth) proporcaoDaPeca(el.naturalWidth, el.naturalHeight);
        else el.addEventListener('load', () => proporcaoDaPeca(el.naturalWidth, el.naturalHeight), { once: true });
      }
      const slide = h('div', { class: 'feed-slide', role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} de ${p.midias.length}` }, el);
      slide.style.display = 'block'; // altura definida: a mídia com height:100% cabe na área em vez de crescer pela proporção natural
      slide.style.height = '100%';
      return slide;
    });
    trilho.append(...slides);
    midiaEl.appendChild(trilho);
    midiaEl.style.justifySelf = 'center'; // coluna larga: a mídia fica centrada na proporção dela
    pausarTudo = () => trilho.querySelectorAll('video').forEach((v) => v.pause());

    if (slides.length > 1) {
      let atual = 0;
      const ant = h('button', { class: 'feed-seta feed-seta-ant', type: 'button', 'aria-label': 'Slide anterior', hidden: true }, iconeSvg('esquerda'));
      const prox = h('button', { class: 'feed-seta feed-seta-prox', type: 'button', 'aria-label': 'Próximo slide' }, iconeSvg('direita'));
      const pontos = h('div', { class: 'feed-pontos', 'aria-hidden': 'true' }, slides.map(() => h('span')));
      const contador = h('span', { class: 'feed-contador-slide', 'aria-live': 'polite' });
      const marcar = (i) => {
        if (i !== atual) pausarTudo();
        atual = i;
        ant.hidden = atual === 0;
        prox.hidden = atual === slides.length - 1;
        [...pontos.children].forEach((s, k) => s.setAttribute('aria-current', String(k === atual)));
        contador.textContent = `${atual + 1}/${slides.length}`;
      };
      const ir = (i) => {
        const alvo = Math.max(0, Math.min(slides.length - 1, i));
        const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        trilho.scrollTo({ left: alvo * trilho.clientWidth, behavior: reduzir ? 'auto' : 'smooth' });
        marcar(alvo);
      };
      ant.addEventListener('click', () => ir(atual - 1));
      prox.addEventListener('click', () => ir(atual + 1));
      let espera = 0;
      trilho.addEventListener('scroll', () => {
        clearTimeout(espera);
        espera = setTimeout(() => marcar(Math.round(trilho.scrollLeft / Math.max(1, trilho.clientWidth))), 80);
      }, { passive: true });
      trilho.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'VIDEO') return; // setas do vídeo continuam sendo do vídeo
        if (e.key === 'ArrowLeft') { e.preventDefault(); ir(atual - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); ir(atual + 1); }
      });
      midiaEl.append(ant, prox, pontos, contador);
      marcar(0);
    }
  }

  // lateral: topo, legenda, metadados
  const fechar = h('button', { class: 'feed-fechar', type: 'button', 'aria-label': 'Fechar publicação' }, iconeSvg('fechar'));
  fechar.addEventListener('click', () => dlg.close());
  const topo = h('div', { class: 'feed-post-topo' },
    h('img', { src: AVATAR, alt: '' }),
    h('div', null, h('span', { texto: nomePerfil }), h('small', { texto: p.canal ? CANAIS[p.canal] || p.canal : 'Feed' })),
    fechar);

  const legenda = p.legenda
    ? h('div', { class: 'feed-legenda' }, h('b', { texto: nomePerfil }), p.legenda)
    : h('div', { class: 'feed-legenda feed-legenda-vazia', texto: 'Sem legenda ainda.' });

  const dados = [
    p.data ? `Publicação planejada: ${ctx.formatar ? ctx.formatar.data(p.data) : p.data}${p.hora ? ` às ${p.hora}` : ''}` : 'Aprovada, ainda sem data de publicação',
    p.aprovadoEm ? `Aprovada em ${ctx.dataHora ? ctx.dataHora(p.aprovadoEm) : p.aprovadoEm}` : null,
    p.semana ? `Semana: ${p.semana}` : null,
  ].filter(Boolean);
  const meta = h('div', { class: 'feed-post-meta' },
    h('div', { class: 'feed-post-acoes', 'aria-hidden': 'true' }, iconeSvg('curtir'), iconeSvg('comentar'), iconeSvg('enviar'), h('span', null, iconeSvg('salvar'))),
    h('div', { class: 'feed-post-dados' },
      dados.map((t) => h('span', { texto: t })),
      p.versao ? h('span', { class: 'mono', texto: `versão ${String(p.versao).slice(0, 12)}` }) : null,
      p.caminho ? h('span', { class: 'mono', texto: p.caminho }) : null),
    h('div', { class: 'fileira' },
      h('a', { class: 'botao botao-fantasma', href: '#/marketing/calendario', texto: p.data ? 'Ver no calendário' : 'Marcar data no calendário' }),
      lista.length > 1 ? navPost(h, area, lista, indice, ctx, dlg) : null));

  corpo.append(midiaEl, h('div', { class: 'feed-post-lado' }, topo, legenda, meta));

  dlg.addEventListener('close', () => {
    pausarTudo();
    dlg.remove();
    if (devolverFoco && devolverFoco.isConnected) devolverFoco.focus();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // clique no fundo fecha
  dlg.querySelectorAll('a[href^="#/"]').forEach((a) => a.addEventListener('click', () => dlg.close()));

  document.body.appendChild(dlg);
  dlg.showModal();
  fechar.focus();
  area.dispatchEvent(new CustomEvent('feed:abrir', { detail: dlg }));
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

function url(caminho) {
  if (/^(blob:|data:|\/)/.test(caminho)) return caminho;
  return `/${String(caminho).replace(/\\/g, '/').split('/').map((s) => encodeURIComponent(s)).join('/')}`;
}

function dataCurta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}` : String(iso);
}

function resumo(t, n) {
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Ícones desenhados em traço único de 1,75, sem a marca de ninguém.
function iconeSvg(nome) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const formas = {
    grade: ['M4 4h16v16H4z', 'M9.33 4v16', 'M14.67 4v16', 'M4 9.33h16', 'M4 14.67h16'],
    reels: ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M4 9h16', 'M8.5 4l2.5 5', 'M14 4l2.5 5', 'M10.5 12.5v4l3.5-2z'],
    carrossel: ['M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', 'M4 16V5a1 1 0 0 1 1-1h11'],
    esquerda: ['M15 5l-7 7 7 7'],
    direita: ['M9 5l7 7-7 7'],
    fechar: ['M6 6l12 12', 'M18 6L6 18'],
    curtir: ['M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z'],
    comentar: ['M20 12a8 8 0 1 1-3.1-6.33A8 8 0 0 1 20 12z', 'M20 20l-2.5-2.5'],
    enviar: ['M21 3L10 14', 'M21 3l-7 18-4-7-7-4z'],
    salvar: ['M6 4h12v17l-6-4.5L6 21z'],
  }[nome] || [];
  for (const d of formas) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}
