// Prévia de leitura do calendário. Mídia, carrossel e fechamento são os mesmos do Feed.
import { montarMidia, midiasDaPeca, topoDaPrevia, ligarDialogo, iconeSvg } from './_previa-publicacao.js';
import { descreverJobReal, rotuloDataHorario } from './_publicacoes-reais.js';

const FORMATOS = { feed: 'Post', carrossel: 'Carrossel', reels: 'Reels', stories: 'Stories', video: 'Vídeo' };
const REDES = { instagram: 'Instagram', facebook: 'Facebook' };
let aberta = null;

function h(tag, atributos, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos || {})) {
    if (valor == null || valor === false) continue;
    if (chave === 'texto') el.textContent = valor;
    else if (chave === 'class') el.className = valor;
    else if (chave.startsWith('on')) el.addEventListener(chave.slice(2), valor);
    else el.setAttribute(chave, valor === true ? '' : String(valor));
  }
  for (const filho of filhos.flat(Infinity)) {
    if (filho != null && filho !== false) el.append(filho instanceof Node ? filho : String(filho));
  }
  return el;
}

function urlSegura(valor, local = false) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  if (/^(?:javascript|data|blob):/i.test(valor) || valor.startsWith('//')) return null;
  try {
    const url = new URL(valor, location.origin + '/');
    if (url.username || url.password || [...url.searchParams.keys()].some((k) => /^(access_token|token|secret|authorization|api_key)$/i.test(k))) return null;
    if (local && url.origin === location.origin) return url.pathname + url.search;
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

export function normalizarPreviaPost(item = {}, miniaturaCarregada = null) {
  const peca = item.peca || {};
  const publicado = item.publicado || null;
  const jobs = Array.isArray(item.jobs) ? item.jobs : [];
  const primeiro = jobs[0]?.destino;
  const recebido = item.formato || primeiro?.formato || publicado?.formato || peca.canal || peca.tipo;
  const formato = ({ reel: 'reels', story: 'stories', imagem: 'feed', post: 'feed', 'instagram-feed': 'feed' })[recebido] || (FORMATOS[recebido] ? recebido : 'feed');
  const rede = REDES[item.rede] ? item.rede : REDES[primeiro?.rede] ? primeiro.rede : REDES[publicado?.rede] ? publicado.rede : 'instagram';
  const titulo = typeof peca.nomeExibicao === 'string' && peca.nomeExibicao.trim() ? peca.nomeExibicao.trim()
    : typeof peca.titulo === 'string' && peca.titulo.trim() && !/[\\/]|\.(mp4|png|jpe?g|webp)$/i.test(peca.titulo) ? peca.titulo.trim() : `Publicação · ${FORMATOS[formato]}`;
  const midias = midiasDaPeca(peca, (valor) => urlSegura(String(valor).replace(/\\/g, '/'), true));
  const miniatura = !midias.length ? urlSegura(publicado?.miniatura) : null;
  const miniaturaLocal = /^\/api\/marketing\/calendario\/meta-midia\?chave=[a-f0-9]{16}$/.test(publicado?.miniatura || '') ? publicado.miniatura : null;
  const capa = urlSegura(peca.capa?.url, true);
  return { titulo, formato, rede, jobs, publicado, miniaturaLocal, midias: midias.length ? midias : miniaturaCarregada ? [{ url: miniaturaCarregada, tipo: 'imagem' }] : miniatura ? [{ url: miniatura, tipo: 'imagem' }] : [],
    somenteMiniatura: !!(miniatura || miniaturaLocal || miniaturaCarregada), capa: capa ? { url: capa } : null,
    legenda: typeof peca.legenda === 'string' && peca.legenda.trim() ? peca.legenda : typeof publicado?.legenda === 'string' ? publicado.legenda : '',
    ehVideo: !miniatura && (formato === 'reels' || formato === 'video' || peca.tipo === 'video'),
    link: urlSegura(publicado?.link),
  };
}

function estilos() {
  if (document.getElementById('previa-post-estilo')) return;
  document.head.appendChild(h('link', { id: 'previa-post-estilo', rel: 'stylesheet', href: '/telas/_previa-post.css' }));
}

// Estado real de um destino em palavras do autor (R9, 19/10): com ícones na célula do Calendário,
// o detalhe por rede mora aqui. Atenção traz motivo e ação; o código fica pequeno, à parte.
function estadoDestino(job) {
  const d = job.destino || {};
  const e = descreverJobReal(job);
  const link = job.estado === 'publicado' ? urlSegura(e.link) : null;
  return h('li', { class: `previa-post-destino${e.atencao ? ' previa-post-destino-atencao' : ''}` },
    h('strong', { texto: `${REDES[d.rede] || 'Rede não informada'} · ${FORMATOS[d.formato] || 'Formato não informado'}` }),
    h('span', { role: e.atencao ? 'alert' : null, texto: e.texto }),
    e.motivo ? h('span', { class: 'campo-ajuda', texto: e.motivo }) : null,
    e.acao ? h('span', { class: 'campo-ajuda', texto: e.acao }) : null,
    job.codigoErro ? h('small', { class: 'campo-ajuda', texto: `Código: ${job.codigoErro}` }) : null,
    link ? h('a', { class: 'botao botao-fantasma', href: link, target: '_blank', rel: 'noopener noreferrer', texto: e.linkRotulo }) : null);
}

// item={peca:DTO, formato, rede, jobs:destinos[], publicado:postMeta|null}.
// Não conhece endpoint/credencial, não consulta Meta e não oferece ações de publicação.
export function abrirPreviaPost(item) {
  estilos();
  if (aberta?.open) aberta.close();
  const foco = document.activeElement;
  const dlg = h('dialog', { class: 'feed-post previa-post' });
  aberta = dlg;
  let pausar = () => {};
  let cancelarLeitura = () => {};
  let cancelarMiniatura = () => {};
  let conteudoAtual = item;
  let miniaturaAtual = null;
  let renderizacao = 0;
  function desenhar(conteudo) {
    conteudoAtual = conteudo;
    pausar();
    const p = normalizarPreviaPost(conteudo, miniaturaAtual);
    const minhaRenderizacao = ++renderizacao;
    dlg.setAttribute('aria-label', p.titulo);
    dlg.setAttribute('data-formato', p.formato);
    dlg.setAttribute('data-rede', p.rede);
    const topo = topoDaPrevia(h, { nome: '@granaponto', formato: FORMATOS[p.formato], aoFechar: () => dlg.close() });
    topo.querySelector('small').textContent = `Prévia estimada do ${REDES[p.rede]} · ${FORMATOS[p.formato]}`;
    const midia = montarMidia(h, p);
    if (p.formato === 'reels' || p.formato === 'stories') {
      midia.elemento.classList.add('previa-post-vertical');
      midia.elemento.style.setProperty('aspect-ratio', '9 / 16', 'important');
    }
    const estados = h('section', { class: 'previa-post-estados', 'aria-label': 'Estado por destino' },
      h('h3', { texto: 'Estado da publicação' }),
      p.jobs.length ? h('ul', { class: 'previa-post-destinos' }, p.jobs.map(estadoDestino)) : null,
      p.publicado ? h('div', { class: 'previa-post-destino' }, h('strong', { texto: `Publicado no ${REDES[p.publicado.rede] || REDES[p.rede]}` }),
          p.publicado.publicadoEm && Number.isFinite(Date.parse(p.publicado.publicadoEm)) ? h('span', { class: 'campo-ajuda', texto: rotuloDataHorario(p.publicado.publicadoEm) }) : null,
          p.link ? h('a', { class: 'botao botao-fantasma', href: p.link, target: '_blank', rel: 'noopener noreferrer', texto: 'Abrir publicação confirmada' }) : h('span', { class: 'campo-ajuda', texto: 'O link não foi informado pela fonte.' }))
          : !p.jobs.length ? h('p', { class: 'campo-ajuda', texto: 'Planejado no calendário. Não há confirmação de agendamento ou publicação nesta prévia.' }) : null,
      // Quem abre pelo Calendário passa conteudo.agendar; sem poder agendar, o botão fica visível, desabilitado e com o motivo.
      !p.publicado && !p.jobs.length && conteudo.agendar ? h('div', { class: 'bloco-acao previa-post-agendar' },
        h('button', { class: 'botao botao-primario', type: 'button', texto: conteudo.agendar.rotulo || 'Agendar de verdade', disabled: !conteudo.agendar.habilitado,
          onclick: () => { dlg.close(); conteudo.agendar.acao(); } }),
        conteudo.agendar.motivo ? h('p', { class: 'campo-ajuda', role: 'status', texto: conteudo.agendar.motivo }) : null) : null);
    const legenda = h('div', { class: 'feed-legenda' }, h('strong', { texto: '@granaponto' }),
      h('p', { class: 'previa-post-legenda', texto: p.legenda || 'Legenda não disponível nesta fonte.' }));
    const avisos = h('div', { class: 'previa-post-avisos' },
      h('h2', { texto: p.titulo }),
      p.somenteMiniatura ? h('p', { class: 'campo-ajuda', texto: 'A fonte trouxe somente a miniatura e uma legenda curta. Abra a publicação para conferir o conteúdo completo.' }) : null,
      !p.midias.length ? h('p', { class: 'campo-ajuda', role: 'status', texto: 'Mídia não disponível nesta fonte. A prévia preserva a legenda e os estados recebidos.' }) : null);
    midia.elemento.querySelectorAll('img, video').forEach((el) => el.addEventListener('error', () => {
      if (minhaRenderizacao === renderizacao) {
        el.hidden = true;
        avisos.appendChild(h('p', { class: 'campo-ajuda', role: 'status', texto: 'Não foi possível abrir esta mídia. A legenda e os estados continuam disponíveis.' }));
      }
    }, { once: true }));
    const decoracao = h('div', { class: 'feed-post-acoes', 'aria-hidden': 'true' }, iconeSvg('curtir'), iconeSvg('comentar'), iconeSvg('enviar'), h('span', null, iconeSvg('salvar')));
    const lado = h('div', { class: 'feed-post-lado' }, topo, avisos, legenda, h('div', { class: 'feed-post-meta' }, decoracao, estados));
    dlg.replaceChildren(h('div', { class: 'feed-post-corpo' }, midia.elemento, lado));
    pausar = midia.pausar;
    if (dlg.open) topo.querySelector('.feed-fechar').focus();
    const video = midia.elemento.querySelector('video');
    if (video && (p.formato === 'reels' || p.formato === 'stories')) {
      video.muted = true;
      video.loop = true;
      video.play().catch(() => {
        if (dlg.open && minhaRenderizacao === renderizacao) midia.elemento.appendChild(h('p', { class: 'previa-post-play', role: 'status', texto: 'Use o controle do vídeo para iniciar a reprodução.' }));
      });
    }
  }
  desenhar(item);
  const limpar = () => { cancelarLeitura(); cancelarMiniatura(); pausar(); if (miniaturaAtual) URL.revokeObjectURL(miniaturaAtual); if (aberta === dlg) aberta = null; };
  ligarDialogo(dlg, { devolverFoco: foco, aoFechar: limpar });
  // Trocar de rota encerra a mídia, mesmo quando quem abriu não manteve referência à janela.
  const aoNavegar = () => { if (dlg.open) dlg.close(); };
  window.addEventListener('hashchange', aoNavegar);
  dlg.addEventListener('close', () => window.removeEventListener('hashchange', aoNavegar), { once: true });
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.querySelector('.feed-fechar').focus();
  const inicial = normalizarPreviaPost(item);
  const caminhoMiniatura = inicial.midias.length || (item.peca && item.carregarPeca) ? null : inicial.miniaturaLocal;
  if (caminhoMiniatura) {
    const ctrl = new AbortController();
    const prazo = setTimeout(() => ctrl.abort(), 10000);
    cancelarMiniatura = () => { clearTimeout(prazo); ctrl.abort(); };
    (async () => {
      try {
        const r = await fetch(caminhoMiniatura, { headers: { 'X-Grana-Admin': '1' }, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: ctrl.signal });
        if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test((r.headers.get('content-type') || '').split(';')[0].trim()) || Number(r.headers.get('content-length')) > 5 * 1024 * 1024) throw new Error('miniatura-indisponivel');
        const blob = await r.blob();
        if (blob.size > 5 * 1024 * 1024 || !blob.size) throw new Error('miniatura-invalida');
        if (ctrl.signal.aborted || !dlg.open) return;
        miniaturaAtual = URL.createObjectURL(blob);
        desenhar(conteudoAtual);
      } catch {
        if (dlg.open) {
          console.warn('[previa-post] miniatura-indisponivel');
          dlg.querySelector('.previa-post-avisos').appendChild(h('p', { class: 'campo-ajuda', role: 'status', texto: 'Sem miniatura. Atualize o mês para tentar novamente. A legenda e o link foram preservados.' }));
        }
      } finally { clearTimeout(prazo); }
    })();
  }
  // O calendário pode fornecer o catálogo já carregado ou uma leitura autenticada existente.
  // A prévia nunca escolhe outra versão e não conhece endpoint/credencial.
  if (typeof item?.carregarPeca === 'function' && item.peca?.id && item.peca?.versao && (!item.peca.arquivos?.length || typeof item.peca.legenda !== 'string')) {
    const ler = async () => {
      cancelarLeitura();
      const ctrl = new AbortController();
      let encerrada = false;
      const mensagem = h('p', { class: 'campo-ajuda previa-post-leitura', role: 'status', texto: 'Lendo mídia e legenda desta versão…' });
      dlg.querySelector('.previa-post-avisos').appendChild(mensagem);
      const falhou = () => {
        mensagem.replaceChildren('Não foi possível carregar a mídia e a legenda desta versão. Os estados recebidos foram preservados. ',
          h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Tentar de novo', onclick: () => { mensagem.remove(); ler(); } }));
      };
      const prazo = setTimeout(() => { if (encerrada || !dlg.open) return; encerrada = true; ctrl.abort(); falhou(); }, 12000);
      cancelarLeitura = () => { encerrada = true; clearTimeout(prazo); ctrl.abort(); };
      try {
        const peca = await item.carregarPeca(item.peca.id, item.peca.versao, { signal: ctrl.signal });
        if (encerrada || !dlg.open) return;
        if (!peca || peca.id !== item.peca.id || peca.versao !== item.peca.versao) throw new Error('versao-indisponivel');
        desenhar({ ...item, peca });
      } catch {
        if (!encerrada && dlg.open) { console.warn('[previa-post] leitura-da-versao-falhou'); falhou(); }
      } finally { clearTimeout(prazo); }
    };
    ler();
  }
  return dlg;
}
