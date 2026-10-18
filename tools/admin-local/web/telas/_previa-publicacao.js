// Prévia de publicação compartilhada por Feed e Aprovação (Lumen).
//
// Só apresentação: mídia (vídeo com controles e poster, carrossel com setas e teclado),
// cabeçalho do post e o ciclo de vida do <dialog> (Esc nativo, clique no fundo, pausa dos
// vídeos ao fechar e foco devolvido a quem abriu). Nenhuma chamada de API mora aqui: quem
// abre a janela decide as ações e passa a coluna lateral pronta.
//
// O rótulo é "Prévia estimada do Instagram": é a gramática do post, não a captura oficial.

export const AVATAR = '/design-system/marca/icone-circular.svg';
export const EXT_VIDEO = /\.(mp4|webm|mov|m4v)$/i;
export const EXT_IMAGEM = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
export const ROTULO_PREVIA = 'Prévia estimada do Instagram';

// arquivos[] do DTO = { nome, tipo, url } com url já servível; aceita também string ou { caminho }.
export function midiasDaPeca(p, urlArquivo) {
  return (Array.isArray(p.arquivos) && p.arquivos.length ? p.arquivos : [p.caminho])
    .map((a) => (typeof a === 'string' ? a : a && (a.url || a.caminho)))
    .filter(Boolean)
    .map((a) => (urlArquivo ? urlArquivo(a) : urlPadrao(a)))
    .filter((a) => EXT_VIDEO.test(a) || EXT_IMAGEM.test(a));
}

// Área de mídia do post. `p` = { titulo, midias[], capa: { url } | null, ehVideo, legenda }.
// Devolve { elemento, pausar }: quem abre chama pausar ao fechar ou trocar de peça.
export function montarMidia(h, p) {
  const midiaEl = h('div', { class: 'feed-post-midia' });
  // A área toma a proporção da peça (como o Instagram abre o post) e a mídia aparece
  // inteira (contain). Reel nasce 9:16; o resto lê a proporção natural ao carregar.
  const proporcaoDaPeca = (w, hh) => { if (w > 0 && hh > 0) midiaEl.style.aspectRatio = `${w} / ${hh}`; };
  if (p.ehVideo) proporcaoDaPeca(9, 16);
  let pausar = () => {};
  if (!p.midias.length) {
    midiaEl.appendChild(h('div', { class: 'feed-celula-texto', texto: p.legenda || p.titulo }));
    return { elemento: midiaEl, pausar };
  }
  const trilho = h('div', { class: 'feed-trilho', tabindex: '0', role: 'group', 'aria-roledescription': 'carrossel', 'aria-label': p.titulo });
  const slides = p.midias.map((item, i) => {
    // Aceita string (caminho, tipo pela extensão) ou { url, tipo }: blob: não tem extensão.
    const arq = typeof item === 'string' ? item : item.url;
    const ehVideoItem = typeof item === 'string' ? EXT_VIDEO.test(item) : item.tipo === 'video';
    const alt = p.midias.length > 1 ? `${p.titulo}, ${i + 1} de ${p.midias.length}` : p.titulo;
    const el = ehVideoItem
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
  pausar = () => trilho.querySelectorAll('video').forEach((v) => v.pause());

  if (slides.length > 1) {
    let atual = 0;
    const ant = h('button', { class: 'feed-seta feed-seta-ant', type: 'button', 'aria-label': 'Página anterior', hidden: true }, iconeSvg('esquerda'));
    const prox = h('button', { class: 'feed-seta feed-seta-prox', type: 'button', 'aria-label': 'Próxima página' }, iconeSvg('direita'));
    const pontos = h('div', { class: 'feed-pontos', 'aria-hidden': 'true' }, slides.map(() => h('span')));
    const contador = h('span', { class: 'feed-contador-slide', 'aria-live': 'polite' });
    const marcar = (i) => {
      if (i !== atual) pausar();
      atual = i;
      ant.hidden = atual === 0;
      prox.hidden = atual === slides.length - 1;
      [...pontos.children].forEach((s, k) => s.setAttribute('aria-current', String(k === atual)));
      contador.textContent = `${atual + 1} de ${slides.length}`;
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
    // Teclado na área inteira: com o foco na seta, no trilho ou nos pontos, as setas mudam de página.
    midiaEl.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'VIDEO') return; // setas do vídeo continuam sendo do vídeo
      if (e.key === 'ArrowLeft') { e.preventDefault(); ir(atual - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); ir(atual + 1); }
    });
    midiaEl.append(ant, prox, pontos, contador);
    marcar(0);
  }
  return { elemento: midiaEl, pausar };
}

// Cabeçalho do post: avatar, perfil, formato e o botão de fechar.
export function topoDaPrevia(h, { nome = 'grana.', formato = 'Feed', aoFechar }) {
  return h('div', { class: 'feed-post-topo' },
    h('img', { src: AVATAR, alt: '' }),
    h('div', null, h('span', { texto: nome }), h('small', { texto: `${ROTULO_PREVIA} · ${formato}` })),
    h('button', { class: 'feed-fechar', type: 'button', 'aria-label': 'Fechar prévia', onclick: aoFechar }, iconeSvg('fechar')));
}

// Liga o ciclo de vida da janela. `aoFechar` roda antes do foco voltar (pausa, limpeza).
export function ligarDialogo(dlg, { devolverFoco, aoFechar, remover = true } = {}) {
  dlg.addEventListener('close', () => {
    if (aoFechar) aoFechar();
    if (remover) dlg.remove();
    if (devolverFoco && devolverFoco.isConnected) devolverFoco.focus();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // clique no fundo fecha
}

function urlPadrao(caminho) {
  if (/^(blob:|data:|\/)/.test(caminho)) return caminho;
  return `/${String(caminho).replace(/\\/g, '/').split('/').map((s) => encodeURIComponent(s)).join('/')}`;
}

// Ícones desenhados em traço único de 1,75, sem a marca de ninguém.
export function iconeSvg(nome) {
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
