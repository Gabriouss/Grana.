// Calendário de publicações: mês em grade (desktop) e agenda em lista (estreito; o CSS escolhe qual mostrar).
// O aceite projeta a previsão do cronograma. Sem previsão, a peça fica na coluna própria.
// Arrastar da coluna para o dia abre o mesmo formulário do botão "Escolher data".

import { CANAIS, rotuloCanal, tituloPeca } from './_pecas.js';
import { descreverJobReal, estadoApresentacaoJob } from './_publicacoes-reais.js';
import { iconeSvg } from './_previa-publicacao.js';

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ROTULO_REDE = { instagram: 'Instagram', facebook: 'Facebook' };
const ROTULO_FORMATO = { reel: 'Reels', carrossel: 'Carrossel', video: 'Vídeo', imagem: 'Imagem', post: 'Post' };
const nomeDaPeca = (p) => p?.nomeExibicao || p?.titulo || tituloPeca(p);
// O formato já aparece em outra linha do cartão: no título curto ele só gasta espaço.
const SUFIXO_FORMATO = /\s·\s(Carrossel|Reels?|Post|Stories|Texto|Imagem|Vídeo)$/u;
const nomeCurto = (p) => nomeDaPeca(p).replace(SUFIXO_FORMATO, '');
const formatoDoNome = (p) => SUFIXO_FORMATO.exec(nomeDaPeca(p))?.[1] || null;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const identidade = (p) => JSON.stringify([p?.pecaId || p?.id, p?.versao]);
export function resumirOperacaoCalendario(jobs) {
  const ativos = new Set(['planejado', 'programado-no-painel', 'preparando', 'agendado-na-meta']);
  const atencao = new Set(['precisa-conferir', 'falhou', 'cancelamento-pendente', 'suspenso-para-revisao']);
  const confirmados = jobs.filter((j) => j.confirmadoEm);
  return {
    proximas: confirmados.filter((j) => ativos.has(estadoApresentacaoJob(j))).sort((a, b) => Date.parse(a.destino?.publicarEm) - Date.parse(b.destino?.publicarEm)),
    atencao: confirmados.filter((j) => atencao.has(estadoApresentacaoJob(j))),
  };
}
export function diaReal(job) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(job?.dataPublicacaoMeta || '')) return job.dataPublicacaoMeta;
  const data = new Date(job?.destino?.publicarEm);
  if (!Number.isFinite(data.getTime())) return null;
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(data).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}
export function linkPublicado(valor) {
  try { const u = new URL(valor); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
// Somente apresentação. A identidade editorial e os registros reais nunca são gravados juntos.
// "Agendar de verdade" só aparece com a fila real lida por inteiro e sem job ativo da peça: fora disso
// (camada Planejado, leitura parcial ou indisponível) um agendamento real pode existir sem estar na tela.
// Avisos da camada "Publicado na Meta": indisponível ou parcial nunca vira "nada publicado".
export function avisosMeta(meta) {
  if (meta?.status === 'falhou') return ['A leitura dos posts já publicados no Instagram e no Facebook falhou. Isso não quer dizer que nada foi publicado.'];
  if (meta?.status !== 'ok') return [];
  const avisos = [];
  for (const [rede, e] of Object.entries(meta.redes || {})) {
    const nome = ROTULO_REDE[rede] || rede;
    if (e?.status === 'indisponivel') avisos.push(`Não foi possível ler os posts publicados no ${nome}${e.motivo ? ` (${e.motivo})` : ''}. Isso não quer dizer que nada foi publicado.`);
    else if (e?.status === 'nao-configurado') avisos.push(`A leitura do ${nome} não está configurada, então os posts publicados lá não aparecem aqui.`);
    else if (e && e.completo === false) avisos.push(`A leitura do ${nome} veio parcial. Pode haver posts publicados que não aparecem aqui.`);
  }
  if (!avisos.length && meta.completo === false) avisos.push('A leitura dos posts publicados veio parcial. Pode haver posts que não aparecem aqui.');
  return avisos;
}

// Hoje em São Paulo, como AAAA-MM-DD, para saber se a data de um cartão planejado já passou.
export function hojeSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(agora);
}
export function dataPassou(data, agora = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(data || '') && data < hojeSaoPaulo(agora);
}

export function leituraRealCompleta(camada, reais) {
  return camada !== 'planejado' && reais?.status === 'disponivel' && reais.completo === true;
}
// Por que "Agendar de verdade" não pode ser usado agora, com a saída escrita; null quando pode.
// O botão nunca some em silêncio (regra 9): fica visível, desabilitado e com este motivo.
export function motivoSemAgendar(camada, reais, data, agora = new Date()) {
  if (dataPassou(data, agora)) return 'Data já passou: use "Mudar data" e escolha uma nova.';
  if (camada === 'planejado') return 'A camada Planejado não lê a fila real: selecione Ambos para agendar.';
  if (!reais || reais.status === 'nao-consultado') return 'Fila real ainda não consultada: clique em "Atualizar mês".';
  if (reais.status === 'indisponivel') return 'Fila real indisponível: clique em "Atualizar mês" e tente de novo.';
  if (reais.completo !== true) return 'Leitura da fila real incompleta: clique em "Carregar mais agendamentos do mês".';
  return null;
}
const AVISO_PODE_TER_REAL = 'Pode já ter agendamento real. Veja em Ambos.';

export function projetarCalendario(d, jobs, camada = 'ambos', posts = [], catalogo = []) {
  const grupos = new Map();
  const publicados = new Map();
  for (const post of posts) {
    if (!post.vinculo || !/^\d{4}-\d{2}-\d{2}$/.test(post.data || '') || (d.mes && post.data.slice(0, 7) !== d.mes)) continue;
    const k = identidade(post.vinculo);
    if (!publicados.has(k)) publicados.set(k, []);
    if (!publicados.get(k).some((p) => p.chave === post.chave && p.rede === post.rede)) publicados.get(k).push(post);
  }
  for (const job of jobs) {
    if (!Number.isFinite(Date.parse(job.confirmadoEm || '')) || !diaReal(job)) continue;
    const k = identidade(job.peca);
    if (!grupos.has(k)) grupos.set(k, []);
    const post = (publicados.get(k) || []).find((p) => job.estado === 'publicado' && p.rede === job.destino?.rede && linkPublicado(p.link) && linkPublicado(p.link) === linkPublicado(job.permalink));
    grupos.get(k).push(post ? { ...job, dataPublicacaoMeta: post.data } : job);
  }
  const itens = [];
  // O catálogo fornece a peça vinculada mesmo quando ela não tem entrada editorial neste mês.
  const editoriais = [...(d.itens || []), ...(d.aprovadosSemData || d.semData || []).map((p) => ({ peca: p })), ...catalogo.filter((p) => publicados.has(identidade(p))).map((p) => ({ peca: p }))];
  const vistos = new Set();
  for (const i of editoriais) {
    const p = i.peca || { id: i.id, versao: i.versao, titulo: i.titulo, tipo: i.tipo };
    const k = identidade(p);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const todos = grupos.get(k) || [];
    const pubs = camada === 'planejado' ? [] : publicados.get(k) || [];
    const ativos = camada === 'real' ? todos : todos.filter((j) => !['cancelado', 'falhou'].includes(j.estado));
    const foraDoMes = (d.vinculos || []).filter((v) => identidade(v) === k).flatMap((v) => v.destinos || [])
      .filter((v) => v.data?.slice(0, 7) !== d.mes && !['cancelado', 'falhou'].includes(v.estado));
    if (camada !== 'planejado' && foraDoMes.length && !ativos.length && !pubs.length) continue;
    if (camada !== 'planejado' && (ativos.length || pubs.length)) {
      const dias = [...new Set([...ativos.map(diaReal), ...pubs.map((p) => p.data), ...foraDoMes.map((v) => v.data)])].sort();
      for (const dia of dias.filter((v) => ativos.some((j) => diaReal(j) === v) || pubs.some((p) => p.data === v))) itens.push({ ...i, peca: p, data: dia, jobs: ativos.filter((j) => diaReal(j) === dia), publicacoes: pubs.filter((p) => p.data === dia), historico: todos.filter((j) => ['cancelado', 'falhou'].includes(j.estado)), marcador: dias.length > 1, principal: dia === dias[0] });
    } else if (camada !== 'real' && i.data) itens.push({ ...i, peca: p, historico: todos });
  }
  // Sem vínculo exato, o job permanece na lista. Não cria uma peça editorial fictícia.
  const semData = (d.aprovadosSemData || d.semData || []).filter((p) => camada !== 'real' && (camada === 'planejado' || (!(grupos.get(identidade(p)) || []).some((j) => !['cancelado', 'falhou'].includes(j.estado)) && !(d.vinculos || []).some((v) => identidade(v) === identidade(p) && v.destinos?.some((j) => !['cancelado', 'falhou'].includes(j.estado))))));
  const restantes = semData.filter((p) => camada === 'planejado' || !publicados.has(identidade(p)));
  return { ...d, itens: itens.sort((a, b) => a.data.localeCompare(b.data)), aprovadosSemData: restantes, semData: restantes };
}

// --- Ícones do dia: o post vira um disco com o glifo do formato; a cor e o traço dizem o estado.
const FORMATO_ICONE = { carrossel: ['carrossel', 'Carrossel'], reel: ['reels', 'Reels'], reels: ['reels', 'Reels'], video: ['reels', 'Reels'], stories: ['grade', 'Stories'] };
const formatoDoIcone = (tipo, formatoJob) => FORMATO_ICONE[String(formatoJob || '').toLowerCase()] || FORMATO_ICONE[String(tipo || '').toLowerCase()] || ['grade', 'Feed'];
const ESTADOS_ATENCAO = new Set(['precisa-conferir', 'falhou', 'cancelamento-pendente', 'suspenso-para-revisao']);
const ESTADOS_CONHECIDOS = new Set(['planejado', 'programado-no-painel', 'preparando', 'agendado-na-meta', 'publicado', 'cancelado', ...ESTADOS_ATENCAO]);
export function estadoDoIcone(item, publicado) {
  const reais = (item.jobs || []).filter((j) => j.estado !== 'cancelado');
  const textos = (lista) => lista.map((j) => { const d = descreverJobReal(j); return `${d.rede}: ${d.texto}`; }).join('; ');
  const atencao = reais.filter((j) => ESTADOS_ATENCAO.has(estadoApresentacaoJob(j)) || !ESTADOS_CONHECIDOS.has(j.estado));
  if (atencao.length) return { chave: 'atencao', texto: textos(atencao) };
  if ((publicado || reais.length) && reais.every((j) => j.estado === 'publicado')) return { chave: 'publicado', texto: 'Publicado' };
  const preparando = reais.filter((j) => j.estado === 'preparando');
  if (preparando.length) return { chave: 'preparando', texto: textos(reais) };
  if (reais.length) return { chave: 'agendado', texto: textos(reais) };
  if (item.peca?.precisaAceite) return { chave: 'atencao', texto: 'Precisa de aceite' };
  return { chave: 'planejado', texto: item.hora ? `Planejado para ${item.hora}` : 'Planejado' };
}
// Dica única em posição fixa: a célula do dia corta o que passa da borda, uma dica filha seria cortada.
let dicaEl = null;
function mostrarDica(alvo, texto) {
  if (typeof document === 'undefined') return;
  if (!dicaEl) { dicaEl = document.createElement('div'); dicaEl.className = 'cal-dica'; dicaEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(dicaEl); }
  dicaEl.textContent = texto;
  dicaEl.hidden = false;
  const r = alvo.getBoundingClientRect(), w = dicaEl.offsetWidth, hh = dicaEl.offsetHeight;
  const esquerda = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const topo = r.top - hh - 8 >= 8 ? r.top - hh - 8 : r.bottom + 8;
  dicaEl.style.left = `${esquerda}px`; dicaEl.style.top = `${topo}px`;
}
const esconderDica = () => { if (dicaEl) dicaEl.hidden = true; };
function ligarDica(el, texto) {
  const ligar = () => mostrarDica(el, texto);
  el.addEventListener('mouseenter', ligar); el.addEventListener('focus', ligar);
  el.addEventListener('mouseleave', esconderDica); el.addEventListener('blur', esconderDica);
  el.addEventListener('dragstart', esconderDica);
}

export async function montar(raiz, ctx) {
  const { h } = ctx;
  const agora = new Date();
  const mes = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(ctx.params.mes || '') ? ctx.params.mes : `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const camada = ['planejado', 'real', 'ambos'].includes(ctx.params.camada) ? ctx.params.camada : 'ambos';
  const visao = ctx.params.visao === 'lista' ? 'lista' : 'calendario';
  const navegar = (campos = {}) => ctx.navegar(`#/marketing/calendario?${new URLSearchParams({ mes, camada, visao, ...campos })}`);
  const moverMes = (delta) => { const [a, m] = mes.split('-').map(Number); const d = new Date(a, m - 1 + delta, 1); navegar({ mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }); };
  ctx.cabecalho(raiz, 'Calendário', 'Planejamento editorial, agendamentos confirmados e recibos por destino. Horários em São Paulo.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Mês anterior', onclick: () => moverMes(-1) }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Hoje', onclick: () => navegar({ mes: `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}` }) }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Próximo mês', onclick: () => moverMes(1) }),
  ]);
  const barra = h('div', { class: 'cal-unico-filtros' },
    h('div', { class: 'bloco-acao', role: 'group', 'aria-label': 'Camada do calendário' }, ['planejado', 'real', 'ambos'].map((v) => h('button', { class: 'botao', type: 'button', texto: { planejado: 'Planejado', real: 'Real', ambos: 'Ambos' }[v], 'aria-pressed': String(camada === v), onclick: () => navegar({ camada: v }) }))),
    h('div', { class: 'bloco-acao', role: 'group', 'aria-label': 'Visão do calendário' }, ['calendario', 'lista'].map((v) => h('button', { class: 'botao', type: 'button', texto: v === 'lista' ? 'Lista e recibos' : 'Calendário', 'aria-pressed': String(visao === v), onclick: () => navegar({ visao: v }) }))));
  const resumoOperacional = h('section', { class: 'cal-operacao', 'aria-label': 'Acompanhamento das publicações do mês' });
  const legendaIcones = h('p', { class: 'cal-legenda', hidden: visao === 'lista', 'aria-label': 'Legenda dos ícones do calendário' },
    ...[['publicado', 'Publicado'], ['agendado', 'Agendado no painel'], ['preparando', 'Preparando'], ['planejado', 'Planejado'], ['atencao', 'Atenção']]
      .map(([k, t]) => h('span', { class: 'cal-legenda-item' }, h('span', { class: `cal-legenda-disco cal-icone-${k}`, 'aria-hidden': 'true' }), t)));
  const topoReal = h('div', { class: 'cal-unico-pausas' });
  const status = h('div', { class: 'cal-unico-status', role: 'status', 'aria-live': 'polite' });
  const calendario = h('div', { hidden: visao === 'lista' });
  const fila = h('div', { hidden: visao !== 'lista' || camada === 'planejado' });
  const paginacao = h('div', { class: 'bloco-acao' });
  const dialogo = h('dialog', { class: 'cal-unico-painel', 'aria-labelledby': 'cal-unico-painel-titulo' });
  const conteudoPainel = h('div');
  let focoOrigem = null, controleReal = null, encerrada = false, dados = null, ocupado = false, geracao = 0;
  const acumulados = new Map();
  let meta = { status: 'nao-consultado', posts: [], redes: {}, completo: false };
  let geracaoMeta = 0;
  const referencias = new Map();
  let referenciasSequencia = new Map();
  let sequencia = new Map();
  const fechar = () => dialogo.close?.();
  dialogo.appendChild(h('div', { class: 'cal-unico-painel-topo' }, h('h2', { id: 'cal-unico-painel-titulo', texto: 'Agendar de verdade' }), h('button', { class: 'botao', type: 'button', texto: 'Fechar painel', onclick: fechar })));
  dialogo.appendChild(conteudoPainel);
  dialogo.addEventListener('close', () => focoOrigem?.focus?.());
  raiz.appendChild(barra); raiz.appendChild(legendaIcones); raiz.appendChild(topoReal); raiz.appendChild(status); raiz.appendChild(calendario); raiz.appendChild(fila); raiz.appendChild(resumoOperacional); raiz.appendChild(paginacao); raiz.appendChild(dialogo);
  const abrir = (peca, data, origem) => {
    if (!controleReal?.abrirCompositor) { ctx.aviso('O agendamento real ainda não está disponível. Atualize os dados.', 'erro'); return; }
    focoOrigem = origem;
    if (controleReal.abrirCompositor(peca, data) === false) return;
    dialogo.querySelector('#cal-unico-painel-titulo').textContent = 'Agendar de verdade';
    dialogo.showModal();
  };
  const pubDe = (item) => item.publicacoes?.[0] || null;
  async function carregarMeta() {
    const minha = ++geracaoMeta;
    let r;
    try { r = (await ctx.api(`/api/marketing/calendario/meta-publicados?mes=${mes}`)).dados; } catch (err) {
      console.warn('[calendario-meta]', err.codigo || 'leitura-falhou');
      if (minha === geracaoMeta) meta = { status: 'falhou', posts: [], redes: {}, completo: false };
      return;
    }
    if (minha === geracaoMeta) meta = { status: 'ok', posts: Array.isArray(r?.posts) ? r.posts : [], redes: r?.redes || {}, completo: r?.completo === true };
  }
  // A janela que simula o post (Instagram ou Facebook) é do arquivo _previa-post.js. O formato do item está em coord-forge-prism.md.
  async function abrirPrevia(item) {
    try { (await import('./_previa-post.js')).abrirPreviaPost(item); } catch (err) {
      console.warn('[calendario-previa]', err.codigo || 'indisponivel');
      ctx.aviso('A janela de prévia do post ainda não está disponível nesta versão do painel.', 'info');
    }
  }
  const abrirAoClicar = (item) => ({
    onclick: (e) => { if (!e.target.closest('button, a')) abrirPrevia(item); },
  });
  // Item entregue a abrirPreviaPost (_previa-post.js, do Prism): { peca, formato, rede, jobs, publicado, data, origem }.
  const FORMATO_PREVIA = { reel: 'reels', reels: 'reels', carrossel: 'carrossel', stories: 'stories', video: 'feed', imagem: 'feed', post: 'feed', feed: 'feed' };
  const formatoPrevia = (peca, jobs, post) => FORMATO_PREVIA[jobs[0]?.destino?.formato] || FORMATO_PREVIA[post?.formato] || FORMATO_PREVIA[String(peca?.tipo || '').toLowerCase()] || 'feed';
  // Peça completa do Acervo, inclusive fora da fila editorial; uma leitura por montagem, nenhuma rota nova.
  let catalogoLido = null;
  async function carregarPeca(id, versao) {
    catalogoLido ||= ctx.api('/api/marketing/pecas').then((r) => { const d = r.dados; return Array.isArray(d) ? d : (d && (d.pecas || d.itens)) || []; });
    try { return (await catalogoLido).find((p) => p.id === id && p.versao === versao) || null; } catch (err) { console.warn('[calendario-catalogo]', err.codigo || 'leitura-falhou'); catalogoLido = null; return null; }
  }
  const MOTIVO_REACEITE = 'A legenda ou o arquivo mudou depois do aceite: aprove esta versão para agendar.';
  const motivoAgendar = (data, peca) => (peca?.precisaAceite ? MOTIVO_REACEITE : motivoSemAgendar(camada, dados?.reais, data));
  // Novo aceite em 1 clique onde o autor está: o mesmo POST do Aprovar, com confirmação explícita.
  async function reaceitar(peca, botao) {
    if (botao?.disabled || ctx.obsoleta()) return;
    const ok = await ctx.confirmar({ titulo: 'Aprovar esta versão',
      texto: 'A legenda ou o arquivo desta peça mudou depois do seu aceite. Aprovar registra o aceite desta versão, com a legenda atual, e mantém a data marcada. Não publica nem agenda nada na Meta.',
      detalhes: [nomeDaPeca(peca)], rotuloBotao: 'Aprovar esta versão' });
    if (ok !== true || ctx.obsoleta()) return;
    if (botao) botao.disabled = true;
    try {
      const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(peca.id)}/aprovar`, { versao: peca.versao, confirmacao: true });
      if (ctx.obsoleta()) return;
      for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
      if (r.dados?.aprovacao?.versao !== peca.versao) { ctx.aviso('O aceite não foi confirmado. Atualize o mês e tente de novo.', 'erro'); return; }
      ctx.aviso('Versão aprovada. Agora use "Agendar de verdade".', 'ok');
      catalogoLido = null;
      await carregar();
    } catch (err) {
      console.warn('[calendario-reaceite]', err.codigo || 'falha');
      if (!ctx.obsoleta()) ctx.aviso(`O aceite não foi gravado: ${String(err.message || 'falha').replace(/[.\s]+$/u, '')}. Atualize e tente de novo.`, 'erro');
    } finally { if (botao && !ctx.obsoleta()) botao.disabled = false; }
  }
  // Botão sempre visível onde a peça planejada aparece; desabilitado com o motivo quando não pode agendar.
  const botaoAgendar = (peca, data, comMotivo = true) => {
    if (peca?.precisaAceite) {
      const b = h('button', { class: 'botao', type: 'button', texto: 'Aprovar esta versão', title: MOTIVO_REACEITE,
        onclick: (e) => { e.stopPropagation(); reaceitar(peca, e.currentTarget); } });
      return comMotivo ? [b, h('span', { class: 'campo-ajuda cal-aviso-real', texto: MOTIVO_REACEITE })] : [b];
    }
    const motivo = motivoAgendar(data);
    const b = h('button', { class: 'botao', type: 'button', texto: 'Agendar de verdade', disabled: !!motivo, title: motivo || null,
      onclick: (e) => { e.stopPropagation(); abrir(peca, data, e.currentTarget); } });
    return comMotivo && motivo ? [b, h('span', { class: 'campo-ajuda cal-aviso-real', texto: motivo })] : [b];
  };
  const itemPrevia = (i, pub) => { const jobs = i.jobs || []; const planejado = !pub && !jobs.length; const motivo = planejado ? motivoAgendar(i.data, i.peca) : null;
    return { carregarPeca, origem: pub ? 'meta' : jobs.length ? 'real' : 'planejado', peca: i.peca, data: i.data, jobs, publicado: pub || null, formato: formatoPrevia(i.peca, jobs, pub), rede: jobs[0]?.destino?.rede || pub?.rede || 'instagram',
      agendar: !planejado ? null : i.peca?.precisaAceite ? { habilitado: true, rotulo: 'Aprovar esta versão', motivo, acao: () => reaceitar(i.peca) }
        : { habilitado: !motivo, motivo, acao: () => abrir(i.peca, i.data, null) } }; };
  // A miniatura vem de uma rota local autenticada (a CSP só aceita self, data e blob): busca com o cabeçalho do painel e exibe como blob.
  const ROTA_MINIATURA = '/api/marketing/calendario/meta-midia?chave=';
  function miniaturaDoPost(src) {
    if (typeof src !== 'string' || !src.startsWith(ROTA_MINIATURA)) return null;
    const img = h('img', { class: 'cal-meta-miniatura', alt: '', decoding: 'async' });
    const sem = h('span', { class: 'campo-ajuda', texto: 'Sem miniatura' });
    const caixa = h('div', { class: 'cal-meta-miniatura-caixa' }, img);
    fetch(src, { headers: { Accept: 'image/*', 'X-Grana-Admin': '1' }, credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`status-${r.status}`))))
      .then((b) => { const url = URL.createObjectURL(b); img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true }); img.src = url; })
      .catch((err) => { console.warn('[calendario-miniatura]', err.message || 'falhou'); caixa.replaceChildren(sem); });
    return caixa;
  }
  function cartaoMeta(post, compacto = false) {
    const rede = ROTULO_REDE[post.rede] || post.rede;
    if (compacto) {
      const [glifo, rotuloFormato] = formatoDoIcone(post.formato);
      const nome = `${rede} · ${rotuloFormato} · Publicado na Meta`;
      const el = h('button', { type: 'button', class: 'cal-icone cal-icone-publicado', draggable: 'false', dados: { chave: post.chave }, 'aria-label': nome,
        onclick: () => abrirPrevia({ carregarPeca, origem: 'meta', peca: null, data: post.data, jobs: [], publicado: post, formato: FORMATO_PREVIA[post.formato] || 'feed', rede: post.rede }) },
      typeof document !== 'undefined' ? iconeSvg(glifo) : null);
      ligarDica(el, nome);
      return el;
    }
    const link = linkPublicado(post.link), miniatura = !compacto ? miniaturaDoPost(post.miniatura) : null;
    return h('article', { class: `cal-item cal-unico-item cal-item-meta${compacto ? ' cal-compacto' : ''}`, draggable: 'false', dados: { chave: post.chave }, 'aria-label': `Post publicado no ${rede}`,
      ...abrirAoClicar({ carregarPeca, origem: 'meta', peca: null, data: post.data, jobs: [], publicado: post, formato: FORMATO_PREVIA[post.formato] || 'feed', rede: post.rede }) },
    miniatura,
    h('strong', { class: 'cal-item-titulo', texto: `${rede} · ${ROTULO_FORMATO[post.formato] || 'Post'}` }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Abrir prévia', onclick: () => abrirPrevia({ carregarPeca, origem: 'meta', peca: null, data: post.data, jobs: [], publicado: post, formato: FORMATO_PREVIA[post.formato] || 'feed', rede: post.rede }) }),
    h('span', { class: 'cal-item-canal', texto: 'Publicado na Meta' }),
    post.legenda ? h('span', { class: 'cal-meta-legenda', texto: post.legenda }) : null,
    !compacto && link ? h('a', { href: link, target: '_blank', rel: 'noopener noreferrer', texto: 'Abrir publicação' }) : null);
  }
  function cartaoCompacto(i) {
    const reais = i.jobs || [], pub = pubDe(i);
    const movel = !reais.length && !pub;
    const estado = estadoDoIcone(i, pub);
    const [glifo, rotuloFormato] = formatoDoIcone(i.peca.tipo, reais[0]?.destino?.formato || pub?.formato);
    const nome = `${nomeCurto(i.peca)} · ${rotuloFormato} · ${estado.texto}`;
    const el = h('button', { type: 'button', class: `cal-icone cal-icone-${estado.chave}`, draggable: movel ? 'true' : 'false', dados: { peca: i.peca.id, versao: i.peca.versao }, 'aria-label': nome,
      ondragstart: (e) => { if (!movel) { e.preventDefault(); return; } e.dataTransfer.setData('text/x-grana-peca', i.peca.id); },
      onclick: () => abrirPrevia(itemPrevia(i, pub)) },
    typeof document !== 'undefined' ? iconeSvg(glifo) : null);
    ligarDica(el, nome);
    return el;
  }
  function cartao(i, planejar) {
    const reais = i.jobs || [], pub = pubDe(i);
    const movel = !reais.length && !pub;
    return h('article', { class: `cal-item cal-unico-item${reais.length ? ' cal-item-real' : ''}`, draggable: movel ? 'true' : 'false', dados: { peca: i.peca.id, versao: i.peca.versao },
      ondragstart: (e) => { if (!movel) { e.preventDefault(); return; } e.dataTransfer.setData('text/x-grana-peca', i.peca.id); },
      ...abrirAoClicar(itemPrevia(i, pub)) },
      h('strong', { class: 'cal-item-titulo', texto: i.marcador && !i.principal ? `Destino de ${nomeDaPeca(i.peca)}` : nomeDaPeca(i.peca) }),
      h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Abrir prévia', onclick: () => abrirPrevia(itemPrevia(i, pub)) }),
      h('span', { class: 'cal-item-canal', texto: pub ? 'Publicado na Meta' : reais.length ? i.marcador ? 'Mesma peça, destinos em dias diferentes' : 'Agendamento confirmado' : 'Planejado' }),
      ...(i.publicacoes || []).filter((p) => !reais.some((j) => j.estado === 'publicado' && j.destino.rede === p.rede && linkPublicado(p.link) && linkPublicado(p.link) === linkPublicado(j.permalink))).map((p) => h('div', { class: 'cal-unico-destino' },
        h('strong', { texto: `${ROTULO_REDE[p.rede] || p.rede} · ${ROTULO_FORMATO[p.formato] || 'Post'} · Publicado` }),
        h('span', { texto: `Publicado em ${ctx.formatar.data(p.data)}` }),
        linkPublicado(p.link) ? h('a', { href: linkPublicado(p.link), target: '_blank', rel: 'noopener noreferrer', texto: 'Abrir publicação' }) : null)),
      ...reais.map((j) => { const d = descreverJobReal(j); return h('div', { class: `cal-unico-destino${d.atencao ? ' cal-item-atencao' : ''}` },
        h('strong', { texto: `${d.rede}: ${d.texto}` }),
        h('span', { texto: j.dataPublicacaoMeta ? `Publicado em ${ctx.formatar.data(j.dataPublicacaoMeta)}` : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(j.destino.publicarEm)) + ' · São Paulo' }),
        d.motivo ? h('span', { class: 'campo-ajuda', texto: d.motivo }) : null,
        d.link && linkPublicado(d.link) ? h('a', { href: linkPublicado(d.link), target: '_blank', rel: 'noopener noreferrer', texto: d.linkRotulo }) : d.acao ? h('span', { class: 'campo-ajuda', texto: d.acao }) : null,
        h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Ver destino e recibos', onclick: () => { navegar({ visao: 'lista' }); } })); }),
      ...(i.historico || []).map((j) => h('span', { class: 'campo-ajuda', texto: `${descreverJobReal(j).rede}: ${descreverJobReal(j).texto}. Histórico na lista.` })),
      movel ? h('div', { class: 'bloco-acao' }, h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Mudar data', onclick: planejar }), botaoAgendar(i.peca, i.data)) : null);
  }
  async function desenhar() {
    const minha = ++geracao;
    const conhecidos = new Set([...(dados.itens || []).map((i) => identidade(i.peca || i)), ...(dados.aprovadosSemData || dados.semData || []).map(identidade)]);
    const faltantes = new Map(meta.posts.filter((p) => p.vinculo && !conhecidos.has(identidade(p.vinculo))).map((p) => [identidade(p.vinculo), p.vinculo]));
    const pecasPublicadas = camada === 'planejado' ? [] : (await Promise.all([...faltantes.values()].map((p) => carregarPeca(p.pecaId, p.versao)))).filter(Boolean);
    if (encerrada || ctx.obsoleta() || minha !== geracao) return;
    const resumo = resumirOperacaoCalendario([...acumulados.values()]);
    const completa = leituraRealCompleta(camada, dados?.reais);
    // Peça do job fora do mês carregado: busca pelo id (sem a versão) e, se faltar, carrega; sem nome nenhum, não inventa "Peça".
    const conhecidasPeca = [...(dados.itens || []).map((i) => i.peca), ...(dados.aprovadosSemData || []), ...pecasPublicadas];
    const doJob = (j) => conhecidasPeca.find((p) => identidade(p) === identidade(j.peca)) || conhecidasPeca.find((p) => (p?.pecaId || p?.id) === (j.peca?.pecaId || j.peca?.id));
    const extras = new Map();
    await Promise.all([...resumo.proximas.slice(0, 5), ...resumo.atencao.slice(0, 5)].filter((j) => !doJob(j) && j.peca).map(async (j) => {
      try { const p = await carregarPeca(j.peca.pecaId || j.peca.id, j.peca.versao); if (p) extras.set(identidade(j.peca), p); } catch { /* sem nome: cai no texto genérico */ }
    }));
    if (encerrada || ctx.obsoleta() || minha !== geracao) return;
    const blocoResumo = (titulo, lista) => h('section', { class: 'cal-operacao-secao' },
      h('h2', { class: 'secao-titulo', texto: titulo }),
      h('p', { class: 'campo-ajuda', texto: 'Neste mês · um resultado por rede.' }),
      lista.length ? h('ul', { class: 'cal-operacao-lista' }, lista.slice(0, 5).map((j) => {
        const d = descreverJobReal(j);
        const p = doJob(j) || extras.get(identidade(j.peca));
        return h('li', null, h('strong', { texto: `${p ? nomeDaPeca(p) : 'Publicação sem título'} · ${d.rede}` }),
          h('span', { texto: d.texto }),
          d.motivo ? h('p', { class: 'campo-ajuda', texto: d.motivo }) : null,
          d.acao ? h('p', { class: 'campo-ajuda', texto: d.acao }) : null,
          h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Ver destinos e recibos', onclick: () => navegar({ visao: 'lista' }) }));
      })) : h('p', { class: 'campo-ajuda', texto: completa ? 'Nenhuma publicação nesta situação no mês consultado.' : 'Consulta incompleta. Atualize ou carregue os demais agendamentos para conferir.' }),
      lista.length > 5 ? h('p', { class: 'campo-ajuda', texto: `Mostrando 5 de ${lista.length}. Abra Lista e recibos para ver todas.` }) : null);
    resumoOperacional.replaceChildren(blocoResumo('Próximas publicações', resumo.proximas), blocoResumo('Precisam de atenção', resumo.atencao));
    calendario.replaceChildren();
    await montarEditorial(calendario, { ...ctx, params: { ...ctx.params, mes }, calendarioParcial: dados.reais && camada !== 'planejado' && !dados.reais.completo, cabecalho() {}, cartaoCalendario: cartao, cartaoCompacto, cartaoMeta, meta: { ...meta, mostrar: camada !== 'planejado' }, agendarReal: abrir, leituraRealCompleta: leituraRealCompleta(camada, dados?.reais), motivoAgendar, botaoAgendar,
      obsoleta: () => encerrada || ctx.obsoleta() || minha !== geracao,
      api: (url) => url.startsWith('/api/marketing/calendario?') ? Promise.resolve({ dados: projetarCalendario({ ...dados, vinculos: [...referencias.values()] }, [...acumulados.values()], camada, meta.posts, pecasPublicadas) }) : ctx.api(url) });
  }
  async function carregar(continuar = false) {
    if (ocupado || encerrada || ctx.obsoleta()) return;
    ocupado = true; paginacao.replaceChildren();
    const cursor = continuar ? dados?.reais?.proximoCursor : null;
    status.replaceChildren(h('p', { texto: 'Lendo o mês e os estados confirmados…' }));
    try {
      const lendoMeta = continuar ? null : carregarMeta();
      const resposta = (await ctx.api(`/api/marketing/calendario?${new URLSearchParams({ mes, camada, ...(cursor ? { cursorReal: cursor } : {}) })}`)).dados;
      await lendoMeta;
      if (encerrada || ctx.obsoleta()) return;
      if (!resposta || !Array.isArray(resposta.itens)) throw new Error('O calendário não devolveu os dados esperados.');
      const r = resposta.reais;
      if (!continuar) { sequencia = new Map(); referenciasSequencia = new Map(); }
      for (const v of resposta.vinculos || []) for (const dest of v.destinos || []) {
        const ref = { pecaId: v.pecaId, versao: v.versao, destinos: [dest] };
        const anterior = referencias.get(dest.jobId);
        if (!anterior || dest.revisao >= anterior.destinos[0].revisao) referencias.set(dest.jobId, ref);
        referenciasSequencia.set(dest.jobId, ref);
      }
      for (const j of r?.itens || []) {
        const antes = acumulados.get(j.jobId);
        if (!antes || j.revisao >= antes.revisao) acumulados.set(j.jobId, j);
        const visto = sequencia.get(j.jobId);
        if (!visto || j.revisao >= visto.revisao) sequencia.set(j.jobId, j);
      }
      if (r?.completo && r.status === 'disponivel') {
        for (const id of acumulados.keys()) if (!sequencia.has(id)) acumulados.delete(id);
        for (const id of referencias.keys()) if (!referenciasSequencia.has(id)) referencias.delete(id);
      }
      dados = resposta;
      const incompleto = r && r.status !== 'nao-consultado' && (!r.completo || r.status === 'indisponivel' || (!continuar && r.continuacao));
      status.replaceChildren(...[...(incompleto ? [ctx.alerta('atencao', `Leitura ${r.status === 'indisponivel' ? 'indisponível' : 'parcial'} dos agendamentos. Os dados já recebidos foram preservados. ${r.motivo || 'Há mais resultados para consultar.'}`)] : []),
        r?.consultadoEm ? h('p', { class: 'campo-ajuda', texto: `Consulta real: ${ctx.formatar.dataHora(r.consultadoEm)} · São Paulo` }) : null,
        ...avisosMeta(meta).map((a) => ctx.alerta('atencao', a)),
        ...(resposta.pendenciasLegenda?.length ? [ctx.alerta('atencao', `${resposta.pendenciasLegenda.length} ${resposta.pendenciasLegenda.length === 1 ? 'peça já aprovada precisa' : 'peças já aprovadas precisam'} de legenda. Confira a Aprovação antes de agendar.`)] : [])].filter(Boolean));
      await desenhar();
      if (r?.proximoCursor) paginacao.appendChild(h('button', { class: 'botao', type: 'button', texto: 'Carregar mais agendamentos do mês', onclick: async () => { await carregar(true); controleReal?.atualizarLista?.(); } }));
      paginacao.appendChild(h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar mês', onclick: async () => { await carregar(); controleReal?.atualizarLista?.(); } }));
      if (camada === 'planejado' && visao === 'lista') fila.replaceChildren(h('p', { texto: 'Selecione Real ou Ambos para consultar a fila e os recibos.' }));
    } catch (err) {
      console.warn('[calendario-unico]', err.codigo || 'leitura-falhou');
      status.replaceChildren(ctx.alerta('atencao', 'A leitura do mês falhou. Os estados já recebidos continuam na tela; nenhuma falha ou exclusão foi presumida.'), h('button', { class: 'botao', type: 'button', texto: 'Tentar novamente', onclick: () => carregar(continuar) }));
    } finally { ocupado = false; }
  }
  await carregar();
  if (!dados || encerrada || ctx.obsoleta()) return;
  // Compatibilidade com fontes editoriais anteriores, sem fingir uma fila real vazia.
  if (dados.reais) {
    const { montarReal } = await import('./_publicacoes-reais-ui.js');
    if (ctx.obsoleta()) return;
    controleReal = await montarReal(raiz, ctx, { topo: topoReal, painel: conteudoPainel, fila,
      abrirPainel: (titulo) => { focoOrigem = document.activeElement; dialogo.querySelector('#cal-unico-painel-titulo').textContent = titulo; if (!dialogo.open) dialogo.showModal(); },
      vinculado: (job) => [...(dados.itens || []), ...(dados.aprovadosSemData || dados.semData || []).map((p) => ({ peca: p }))].some((i) => identidade(i.peca || i) === identidade(job.peca)),
      listar: async (atualizar = true) => { if (atualizar) await carregar(); return { jobs: [...acumulados.values()], limitado: !dados?.reais?.completo, proximoCursor: null }; },
      aposConfirmar: () => carregar(),
    });
  }
  return () => { encerrada = true; geracao++; controleReal?.(); dialogo.close?.(); };
}

async function montarEditorial(raiz, ctx) {
  const { h } = ctx;
  const hoje = new Date();
  const mes = /^\d{4}-\d{2}$/.test(ctx.params.mes || '') ? ctx.params.mes : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const [ano, m] = mes.split('-').map(Number);
  const irPara = (delta) => {
    const d = new Date(ano, m - 1 + delta, 1);
    ctx.navegar(`#/marketing/calendario?mes=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  ctx.cabecalho(raiz, 'Calendário', 'Ao aprovar uma versão, sua previsão do cronograma entra no calendário. Datas podem ser alteradas aqui. Nenhuma publicação é enviada à Meta por esta tela.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Mês anterior', onclick: () => irPara(-1) }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Hoje', onclick: () => ctx.navegar('#/marketing/calendario') }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Próximo mês', onclick: () => irPara(1) }),
  ]);
  // O mês vem primeiro. Cronograma, ensaio Meta, previsões e referências ficam recolhidos
  // abaixo dele: continuam a um clique, sem empurrar o calendário para longe do topo.
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);
  const contexto = h('div', { class: 'calendario-contexto' });
  raiz.appendChild(contexto);
  const recolhido = (titulo, ...filhos) => h('details', { class: 'secao-recolhida' },
    h('summary', { class: 'secao-recolhida-titulo', texto: titulo }), ...filhos);
  const cronograma = h('section', { class: 'secao', 'aria-label': 'Cronograma editorial' });
  contexto.appendChild(recolhido('Cronograma editorial', cronograma));
  montarCronograma(cronograma, ctx);
  const ensaio = h('section', { class: 'secao', 'aria-label': 'Ensaio do calendário Meta' });
  contexto.appendChild(recolhido('Ensaio do calendário Meta', ensaio));
  montarEnsaioCalendario(ensaio, ctx);
  ctx.estado.carregando(corpo, 'Lendo o calendário…');

  let d;
  try {
    d = (await ctx.api(`/api/marketing/calendario?mes=${mes}`)).dados || {};
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return;
  }
  if (ctx.obsoleta()) return;
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  const itens = (d.itens || []).map((i) => ({ ...i, peca: i.peca || { id: i.id, versao: i.versao, titulo: i.titulo, tipo: i.tipo } }));
  const semData = d.aprovadosSemData || d.semData || [];
  const canais = (d.canais && d.canais.length ? d.canais : CANAIS.map((c) => c.valor));

  const invalidos = (d.desatualizados || []).length;
  const avisos = [...(d.avisos || []).map((a) => ctx.alerta('info', a)), d.diaD ? ctx.alerta('info', `Dia D declarado: ${ctx.formatar.data(d.diaD)}.`) : null,
    invalidos ? ctx.alerta('atencao', `${invalidos} ${invalidos === 1 ? 'planejamento perdeu' : 'planejamentos perderam'} a validade. Veja "Planejamentos que perderam a validade", abaixo do calendário.`) : null].filter(Boolean);
  if (avisos.length) corpo.appendChild(h('div', { class: 'lista-alertas' }, avisos));

  const planejar = (peca, dataInicial) => escolherData(ctx, peca, dataInicial, canais);
  const cartao = (i) => ctx.cartaoCalendario ? ctx.cartaoCalendario(i, () => planejar(i.peca, i.data)) : itemCalendario(ctx, i, () => planejar(i.peca, i.data));

  // --- grade do mês
  const titulo = h('h2', { class: 'secao-titulo', texto: `${maiuscula(MESES[m - 1])} de ${ano}` });
  const grade = h('div', { class: 'calendario', role: 'grid', 'aria-label': `Calendário de ${MESES[m - 1]} de ${ano}` });
  grade.appendChild(h('div', { class: 'cal-cabecalho', role: 'row' }, DIAS_SEMANA.map((x) => h('span', { class: 'cal-dia-semana', role: 'columnheader', texto: x }))));
  const primeiro = new Date(ano, m - 1, 1);
  const inicio = new Date(primeiro);
  inicio.setDate(1 - ((primeiro.getDay() + 6) % 7)); // semana começa na segunda
  const hojeIso = ctx.formatar.isoLocal(hoje);
  // Uma lista por dia com os cartões do planejamento/real e, na camada Real ou Ambos, os posts publicados que
  // não representados por um cartão de peça (inclusive vínculo sem peça disponível). Nunca se cria vínculo aqui.
  const porDia = new Map();
  const somar = (data, e) => { if (!porDia.has(data)) porDia.set(data, []); porDia.get(data).push(e); };
  for (const i of itens) somar(i.data, { item: i });
  if (ctx.cartaoMeta && ctx.meta?.mostrar) for (const post of ctx.meta.posts) if (!itens.some((i) => i.publicacoes?.some((p) => p.chave === post.chave && p.rede === post.rede)) && /^\d{4}-\d{2}-\d{2}$/.test(post.data || '')) somar(post.data, { post });
  const compacto = !!ctx.cartaoCompacto;
  // O aviso de leitura real incompleta aparece uma vez por superfície (bandeja, janela do dia, agenda), nunca em cada cartão.
  const notaReal = () => (ctx.agendarReal && !ctx.leituraRealCompleta ? h('p', { class: 'campo-ajuda cal-aviso-real', texto: AVISO_PODE_TER_REAL }) : null);
  const cartaoCheio = (e) => (e.item ? cartao(e.item) : ctx.cartaoMeta(e.post));
  const cartaoNaCelula = (e) => (!compacto ? cartaoCheio(e) : e.item ? ctx.cartaoCompacto(e.item) : ctx.cartaoMeta(e.post, true));
  const LIMITE_NA_CELULA = 4;
  const dialogoDia = h('dialog', { class: 'cal-dia-dialogo', 'aria-labelledby': 'cal-dia-titulo' });
  dialogoDia.addEventListener('click', (e) => { if (e.target === dialogoDia || e.target.closest('button, a, article')) setTimeout(() => dialogoDia.close?.(), 0); });
  const abrirDia = (iso, lista) => {
    const [a, mm, dd] = iso.split('-').map(Number);
    dialogoDia.replaceChildren(
      h('div', { class: 'cal-unico-painel-topo' }, h('h2', { id: 'cal-dia-titulo', texto: `${dd} de ${MESES[mm - 1]} de ${a}` }), h('button', { class: 'botao', type: 'button', texto: 'Fechar' })),
      ...[notaReal(), h('div', { class: 'cal-dia-lista' }, lista.map(cartaoCheio))].filter(Boolean));
    dialogoDia.showModal?.();
  };
  corpo.appendChild(dialogoDia);

  let linha;
  for (let k = 0; k < 42; k++) {
    if (k % 7 === 0) { linha = h('div', { class: 'cal-semana', role: 'row' }); grade.appendChild(linha); }
    const dia = new Date(inicio);
    dia.setDate(inicio.getDate() + k);
    const iso = ctx.formatar.isoLocal(dia);
    const fora = dia.getMonth() !== m - 1;
    const lista = porDia.get(iso) || [];
    const celula = h('div', {
      class: `cal-dia${fora ? ' cal-fora-mes' : ''}${iso === hojeIso ? ' cal-hoje' : ''}`, role: 'gridcell',
      'aria-label': `${dia.getDate()} de ${MESES[dia.getMonth()]}${porDia.has(iso) ? `, ${porDia.get(iso).length} ${porDia.get(iso).length === 1 ? 'publicação' : 'publicações'}` : ''}`,
      dados: { data: iso },
    }, h('div', { class: 'cal-dia-topo' },
      compacto && lista.length
        ? h('button', { class: 'cal-num cal-num-botao', type: 'button', texto: String(dia.getDate()), 'aria-label': `Abrir o dia ${dia.getDate()} de ${MESES[dia.getMonth()]}`, onclick: () => abrirDia(iso, lista) })
        : h('span', { class: 'cal-num', texto: String(dia.getDate()) }),
      compacto && lista.length > LIMITE_NA_CELULA
        ? h('button', { class: 'cal-mais', type: 'button', texto: `+${lista.length - LIMITE_NA_CELULA}`, 'aria-label': `Ver os ${lista.length} itens de ${dia.getDate()} de ${MESES[dia.getMonth()]}`, onclick: () => abrirDia(iso, lista) })
        : null),
    compacto ? h('div', { class: 'cal-dia-icones' }, lista.slice(0, LIMITE_NA_CELULA).map(cartaoNaCelula)) : lista.map(cartaoNaCelula));
    // alvo de arrastar
    celula.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-grana-peca')) { e.preventDefault(); celula.classList.add('cal-alvo'); } });
    celula.addEventListener('dragleave', () => celula.classList.remove('cal-alvo'));
    celula.addEventListener('drop', (e) => {
      e.preventDefault();
      celula.classList.remove('cal-alvo');
      const id = e.dataTransfer.getData('text/x-grana-peca');
      const peca = semData.find((p) => p.id === id) || itens.find((i) => !i.jobs?.length && i.peca.id === id)?.peca;
      if (peca) planejar(peca, iso);
    });
    linha.appendChild(celula);
    if (k >= 34 && dia.getMonth() !== m - 1 && (k + 1) % 7 === 0) break; // não desenha a 6ª semana vazia
  }

  // --- agenda (lista) para tela estreita
  const agenda = h('ol', { class: 'agenda', 'aria-label': `Publicações de ${MESES[m - 1]}` });
  if (notaReal) { const n = notaReal(); if (n) agenda.appendChild(h('li', { class: 'agenda-nota' }, n)); }
  const agendaEntradas = [...porDia.entries()].sort(([x], [y]) => x.localeCompare(y)).flatMap(([data, lista]) => lista.map((e) => ({ data, e })));
  if (!agendaEntradas.length) agenda.appendChild(h('li', { class: 'agenda-vazia', texto: ctx.calendarioParcial ? 'A leitura real ainda está incompleta. Continue a consulta para conferir o mês.' : 'Nenhuma publicação marcada neste mês.' }));
  for (const { data, e } of agendaEntradas) {
    agenda.appendChild(h('li', { class: 'agenda-item' },
      h('span', { class: 'agenda-data', texto: ctx.formatar.data(data) }), cartaoCheio(e)));
  }

  // --- coluna "Aprovados sem data"
  // "Sem data (N)": a lista cresce a cada aceite sem data, então começa recolhida, com a
  // contagem à vista. O atalho ?secao=sem-data (ou uma peça recém-aceita) abre o bloco.
  // A bandeja fica aberta: as peças aprovadas sem data são arrastadas daqui para um dia do mês.
  const abrirSemData = true;
  const blocoSemData = h('details', { class: 'cal-sem-data-bloco', open: abrirSemData },
    h('summary', { class: 'secao-titulo cal-sem-data-resumo', id: 'cal-sem-data-titulo', texto: `Aprovados sem data (${semData.length})` }),
    // Um aviso só, no topo da bandeja, em vez de um por cartão.
    semData.length && ctx.agendarReal && !ctx.leituraRealCompleta ? h('p', { class: 'campo-ajuda cal-aviso-real', texto: AVISO_PODE_TER_REAL }) : null,
    semData.length
      ? h('ul', { class: 'lista-sem-data' }, semData.map((p) => {
        const li = h('div', { class: 'cal-item', draggable: 'true', title: nomeDaPeca(p), dados: { id: p.id } },
          p.capa?.url && p.capa.tipo === 'imagem' ? h('img', { class: 'cal-item-capa', src: ctx.urlArquivo(p.capa.url), alt: '', loading: 'lazy' }) : null,
          h('span', { class: 'cal-item-titulo', texto: nomeCurto(p) }),
          p.tipo || formatoDoNome(p) ? h('span', { class: 'cal-item-canal', texto: maiuscula(String(p.tipo || formatoDoNome(p))) }) : null,
          h('div', { class: 'bloco-acao' },
            h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Escolher data', onclick: () => planejar(p) }),
            ctx.botaoAgendar ? ctx.botaoAgendar(p, '', false) : null),
          ctx.motivoAgendar?.('', p) ? h('span', { class: 'campo-ajuda cal-aviso-real', texto: ctx.motivoAgendar('', p) }) : null);
        // Tudo da peça fica no próprio cartão: nome, formato e botões à vista; o detalhe longo do cronograma só ao abrir.
        const vinculo = botaoVinculo(ctx, p), detalhe = detalhesCronograma(ctx, p);
        const item = h('li', { class: 'cal-sem-cartao' }, li,
          vinculo || detalhe ? h('details', { class: 'cal-sem-detalhe', open: ctx.params.peca === p.id },
            h('summary', { texto: 'Detalhes do cronograma' }),
            ctx.params.peca === p.id ? h('p', { class: 'campo-ajuda', role: 'status', texto: 'Peça selecionada após o aceite. Ligue ao cronograma para receber a previsão.' }) : null,
            vinculo ? h('div', { class: 'bloco-acao' }, vinculo) : null, detalhe) : null);
        li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-grana-peca', p.id); e.dataTransfer.effectAllowed = 'move'; });
        return item;
      }))
      : h('p', { class: 'texto-fraco', texto: 'Nenhuma peça aprovada sem previsão válida. As previsões vinculadas entram automaticamente no calendário.' }),
    semData.length ? h('p', { class: 'campo-ajuda', texto: 'Arraste para um dia ou use "Escolher data".' }) : null);
  const coluna = h('aside', { class: 'cal-sem-data', id: 'aprovados-sem-data', tabindex: '-1', 'aria-labelledby': 'cal-sem-data-titulo' }, blocoSemData);

  corpo.appendChild(h('div', { class: 'calendario-layout' },
    h('section', { class: 'secao calendario-mes' }, titulo, grade, agenda),
    coluna));
  if (ctx.params.secao === 'sem-data') {
    coluna.focus({ preventScroll: true });
    coluna.scrollIntoView?.({ block: 'start' });
  }

  const entradas = [...itens, ...(Array.isArray(d.aguardandoDiaD) ? d.aguardandoDiaD : []), ...(Array.isArray(d.suspensos) ? d.suspensos : [])];
  if (entradas.length) {
    contexto.appendChild(recolhido(`Previsões e entradas no calendário (${entradas.length})`,
      h('p', { class: 'nota-explicativa', texto: 'A previsão vem do cronograma. Uma alteração manual preserva essa origem; o recibo do calendário não comprova publicação na Meta.' }),
      ...entradas.map((i) => h('article', { class: 'secao' },
        h('h3', { class: 'secao-titulo quebra', texto: nomeDaPeca(i.peca) }), detalhesCronograma(ctx, i), botaoVinculo(ctx, i.peca)))));
  }

  if ((d.desatualizados || []).length) {
    contexto.appendChild(recolhido(`Planejamentos que perderam a validade (${invalidos})`,
      ctx.tabela([
        { titulo: 'Peça', valor: (x) => nomeDaPeca(x) || x.id, classe: 'mono' },
        { titulo: 'Data marcada', valor: (x) => ctx.formatar.data(x.data) },
        { titulo: 'Motivo', valor: (x) => [x.motivo, x.proximoPasso].filter(Boolean).join(' ') },
      ], d.desatualizados, { legenda: 'Planejamentos inválidos' })));
  }

  if ((d.referenciaFunil || []).length) {
    contexto.appendChild(recolhido('Ordem do funil (FUNIL.md)',
      h('p', { class: 'nota-explicativa', texto: d.diaD ? 'Datas calculadas a partir do dia D, em dias úteis.' : 'Posições relativas ao dia D, em dias úteis. Viram datas quando o dia D for declarado. São códigos editoriais, não peças do acervo.' }),
      ctx.tabela([
        { titulo: 'Posição', valor: (r) => r.ordem, classe: 'mono' },
        { titulo: 'Data', valor: (r) => (r.dataCalculada ? ctx.formatar.data(r.dataCalculada) : 'depois do dia D') },
        { titulo: 'Peça', valor: (r) => r.peca, classe: 'mono' },
        { titulo: 'Situação', valor: (r) => r.situacao },
      ], d.referenciaFunil, { legenda: 'Calendário relativo do funil' })));
  }
}

const SLUG_CRONOGRAMA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function manifestoValido(m) {
  return m && m.formato === 1 && SLUG_CRONOGRAMA.test(m.manifestoId) && Number.isSafeInteger(m.versao) && m.versao > 0 &&
    m.fuso === 'America/Sao_Paulo' && Array.isArray(m.itens) && Array.isArray(m.removidos);
}
function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return false;
  const d = new Date(`${data}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === data;
}
function mostrarAvisos(ctx, r) { for (const aviso of r.dados?.avisos || []) ctx.aviso(aviso, 'info'); }
function erroCronograma(ctx, err) {
  console.warn('[calendario-cronograma]', err.codigo || 'falha');
  const passos = {
    'cronograma-conflito': 'O cronograma mudou. Atualize a tela e escolha novamente antes de salvar.',
    'linha-cronograma-ausente': 'O índice da semana precisa de uma linha única e da coluna Cronograma ID. Peça aos agentes para preparar o índice e tente novamente.',
    'vinculo-existente': 'O índice já tem outro vínculo. Peça aos agentes para conferir o registro antes de trocar.',
    'vinculo-duplicado': 'Outra peça usa este item. Escolha outro item ou peça a correção do vínculo no índice.',
    'vinculo-invalido': 'A peça, a versão ou o item mudou. Atualize e confira o aceite antes de ligar.',
    'versao-mudou': 'A peça mudou. Volte à Aprovação e aceite a versão atual.',
  };
  if (!ctx.obsoleta()) ctx.aviso(passos[err.codigo] || `A ação não foi confirmada: ${err.message}. Atualize e confira os recibos antes de repetir.`, 'erro');
}

// Reutiliza a seção e os diálogos do painel; a revisão e os recibos são do servidor.
export async function montarCronograma(raiz, ctx) {
  ctx.estado.carregando(raiz, 'Lendo o cronograma…');
  try {
    const m = (await ctx.api('/api/marketing/cronograma')).dados;
    if (ctx.obsoleta()) return;
    if (m !== null && !manifestoValido(m)) throw new Error('Cronograma indisponível ou inválido. Peça aos agentes para conferir o arquivo.');
    raiz.replaceChildren(ctx.h('h2', { class: 'secao-titulo', texto: 'Cronograma editorial' }),
      ctx.h('p', { class: 'campo-ajuda', role: 'status', texto: m
        ? `${m.itens.length} itens · revisão ${m.versao} · ${m.diaD ? `Dia D: ${ctx.formatar.data(m.diaD)}` : 'Dia D ainda não definido. Defina a data para resolver as previsões relativas.'}`
        : 'Cronograma ausente. Crie o cronograma e adicione um item antes de ligar a peça aceita.' }));
    const acao = (tipo, texto) => {
      const b = ctx.h('button', { class: 'botao botao-fantasma', type: 'button', texto,
        onclick: () => editarCronograma(ctx, m, tipo, b) });
      return b;
    };
    raiz.appendChild(ctx.h('div', { class: 'bloco-acao' }, m
      ? [acao('diaD', 'Definir dia D'), acao('item', 'Adicionar item ao cronograma')]
      : acao('criar', 'Criar cronograma')));
    for (const r of m?.recibos || []) {
      if (r.acao === 'dia-d') raiz.appendChild(ctx.h('p', { class: 'campo-ajuda', role: 'status',
        texto: `Recibo do dia D: ${r.antes || 'não definido'} → ${r.depois || 'não definido'} · ${ctx.formatar.dataHora(r.em)}. Não autoriza publicação na Meta.` }));
    }
  } catch (err) {
    console.warn('[calendario-cronograma-leitura]', err.codigo || 'falha');
    if (!ctx.obsoleta()) ctx.estado.erro(raiz, err, () => montarCronograma(raiz, ctx));
  }
}

export async function editarCronograma(ctx, m, tipo, botao) {
  if (botao.disabled || ctx.obsoleta()) return;
  botao.disabled = true;
  try {
    const campos = tipo === 'criar' ? [{ nome: 'manifestoId', rotulo: 'Identificador do cronograma', obrigatorio: true, ajuda: 'Letras minúsculas e números separados por hífen. Exemplo: campanha-grana.' }]
      : tipo === 'diaD' ? [{ nome: 'diaD', rotulo: 'Dia D', tipo: 'date', obrigatorio: true, valor: m.diaD || '' }]
        : [{ nome: 'itemId', rotulo: 'Identificador do item', obrigatorio: true, ajuda: 'Letras minúsculas e números separados por hífen. Este identificador não poderá ser reutilizado depois da retirada.' },
          { nome: 'diasUteis', rotulo: 'Dias úteis após o dia D', tipo: 'number', obrigatorio: true, valor: 0, min: 0, max: 3650, passo: 1 },
          { nome: 'hora', rotulo: 'Horário', tipo: 'time', obrigatorio: true, valor: '19:00' },
          { nome: 'canal', rotulo: 'Canal', tipo: 'select', valor: 'reels', opcoes: CANAIS.map((c) => ({ valor: c.valor, rotulo: rotuloCanal(c.valor) })) }];
    const v = await ctx.formulario({ titulo: tipo === 'criar' ? 'Criar cronograma' : tipo === 'diaD' ? 'Definir dia D' : 'Adicionar item ao cronograma',
      texto: 'Planejamento local. Nenhuma publicação será enviada ou agendada na Meta.', campos, rotuloBotao: 'Conferir' });
    if (!v || ctx.obsoleta()) return;
    let novo;
    if (tipo === 'criar') {
      if (!SLUG_CRONOGRAMA.test(v.manifestoId || '')) throw new Error('Use um identificador com letras minúsculas e hífens');
      novo = { formato: 1, manifestoId: v.manifestoId, versao: 1, fuso: 'America/Sao_Paulo', diaD: null, itens: [], removidos: [] };
    } else {
      if (!manifestoValido(m)) throw new Error('Releia o cronograma');
      novo = { ...m, versao: m.versao + 1 };
      if (tipo === 'diaD') {
        if (!dataValida(v.diaD)) throw new Error('Informe uma data válida para o dia D');
        novo.diaD = v.diaD;
      } else {
        if (!SLUG_CRONOGRAMA.test(v.itemId || '') || m.itens.some((i) => i.id === v.itemId) || m.removidos.includes(v.itemId) ||
          !Number.isInteger(v.diasUteis) || v.diasUteis < 0 || v.diasUteis > 3650 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.hora || '') || !CANAIS.some((c) => c.valor === v.canal)) throw new Error('Confira identificador único, dias úteis, horário e canal');
        novo.itens = [...m.itens, { id: v.itemId, dataPrevista: { modo: 'diaD', diasUteis: v.diasUteis, hora: v.hora, canal: v.canal } }];
      }
    }
    const ok = await ctx.confirmar({ titulo: 'Confirmar cronograma', texto: 'Salva o planejamento local e recalcula as previsões das peças aceitas. A Meta continua em ensaio.',
      detalhes: [novo.manifestoId, tipo === 'diaD' ? `Dia D: ${ctx.formatar.data(novo.diaD)}` : tipo === 'item' ? `${v.itemId} · D+${v.diasUteis}` : 'Cronograma vazio, pronto para receber itens'], rotuloBotao: 'Salvar cronograma' });
    if (ok !== true || ctx.obsoleta()) return;
    const r = await ctx.acao('/api/marketing/cronograma', { versaoEsperada: m?.versao || 0, manifesto: novo, confirmacao: true });
    if (ctx.obsoleta()) return;
    mostrarAvisos(ctx, r);
    if (!manifestoValido(r.dados?.manifesto) || r.dados.manifesto.versao !== novo.versao) throw new Error('O servidor não confirmou a revisão salva');
    ctx.aviso(tipo === 'diaD' ? 'Dia D salvo. Confira o recibo e as previsões atualizadas.' : tipo === 'item' ? 'Item salvo. Agora ligue a peça aceita ao cronograma.' : 'Cronograma criado. Adicione um item para ligar a peça aceita.', 'ok');
    ctx.recarregar();
  } catch (err) { erroCronograma(ctx, err); }
  finally { if (!ctx.obsoleta()) botao.disabled = false; }
}

function aceiteDaPeca(p) {
  return p?.reciboAceite?.tipo === 'aceite-autor' && p.reciboAceite.versaoPeca === p.versao &&
    Number.isFinite(Date.parse(p.reciboAceite.aprovadoEm)) && p.reciboAceite.evidencia === 'aceite pelo autor no painel local';
}
function botaoVinculo(ctx, p) {
  if (!aceiteDaPeca(p) || p.estado !== 'aprovados') return null;
  const b = ctx.h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Ligar ao cronograma', onclick: () => ligarCronograma(ctx, p, b) });
  return b;
}
export async function ligarCronograma(ctx, p, botao) {
  if (botao.disabled || !aceiteDaPeca(p) || p.estado !== 'aprovados' || ctx.obsoleta()) return;
  botao.disabled = true;
  try {
    const m = (await ctx.api('/api/marketing/cronograma')).dados;
    if (ctx.obsoleta()) return;
    if (!manifestoValido(m) || !m.itens.length) throw new Error('Crie o cronograma e adicione um item antes de ligar a peça');
    const v = await ctx.formulario({ titulo: 'Ligar ao cronograma', texto: `${nomeDaPeca(p)}. O vínculo será registrado no INDICE.md da semana.`,
      campos: [{ nome: 'itemId', rotulo: 'Item do cronograma', tipo: 'select', obrigatorio: true, valor: m.itens[0].id,
        opcoes: m.itens.map((i) => ({ valor: i.id, rotulo: i.id })) }], rotuloBotao: 'Conferir vínculo' });
    if (!v || ctx.obsoleta()) return;
    if (!m.itens.some((i) => i.id === v.itemId)) throw new Error('Escolha um item da lista atual');
    const ok = await ctx.confirmar({ titulo: 'Confirmar vínculo', texto: 'Liga esta versão aceita à previsão local. Nenhuma ação real da Meta será habilitada.',
      detalhes: [nomeDaPeca(p), `Item ${v.itemId} do cronograma`], rotuloBotao: 'Ligar ao cronograma' });
    if (ok !== true || ctx.obsoleta()) return;
    const r = await ctx.acao('/api/marketing/cronograma/vinculo', { pecaId: p.id, versao: p.versao, versaoEsperada: m.versao, manifestoId: m.manifestoId, itemId: v.itemId });
    if (ctx.obsoleta()) return;
    mostrarAvisos(ctx, r);
    const recibo = r.dados?.cronograma;
    if (recibo?.manifestoId !== m.manifestoId || recibo.itemId !== v.itemId || recibo.manifestoVersao !== m.versao) throw new Error('O servidor não confirmou o vínculo no índice');
    ctx.aviso(`Vínculo registrado no INDICE.md da semana: item ${v.itemId}. Confira a previsão e o recibo do calendário.`, 'ok');
    ctx.recarregar();
  } catch (err) { erroCronograma(ctx, err); }
  finally { if (!ctx.obsoleta()) botao.disabled = false; }
}

// Leitura independente: falha do ensaio não apaga o calendário editorial.
export function montarEnsaioCalendario(raiz, ctx) {
  const { h } = ctx;
  let ocupado = false;
  const texto = (valor) => typeof valor === 'string' && valor ? valor : 'Não informado';
  const motivos = {
    'calendario-sem-planejamentos': 'O calendário ainda não tem planejamentos.',
    'data-ou-hora-invalida': 'Informe uma data e um horário válidos.',
    'horario-nao-futuro': 'O horário marcado já passou.',
    'peca-ausente': 'A peça não foi encontrada.',
    'versao-ou-caminho-mudou': 'A versão ou a localização da peça mudou.',
    'fora-de-aprovados': 'A peça ainda não está na pasta de aprovados.',
    'sem-evidencia-datada-desta-versao': 'Falta evidência datada de aceite desta versão.',
    'canal-invalido': 'O canal não é válido para este ensaio.',
    'anuncio-fora-do-fluxo-organico': 'Anúncios exigem um fluxo separado.',
    'formato-de-midia-nao-validado': 'O formato da mídia não foi validado.',
    'planejamento-duplicado': 'Este planejamento está duplicado.',
    'julgamento-keel-e-aviso-orquestrador': 'Faltam o julgamento e a liberação da etapa real.',
    'confirmacao-real-do-autor': 'A execução real exige confirmação do autor.',
    'conta-permissoes-token-e-quota': 'Conta, permissões e limites da Meta precisam ser conferidos.',
    'midia-remota-validada': 'A mídia remota precisa ser validada.',
    'agendador-e-outbox-com-reconciliacao': 'Falta o serviço de execução com registros persistentes e conferência de resultados.',
  };
  const lista = (valores) => h('ul', {}, (Array.isArray(valores) ? valores : []).map((v) => h('li', { texto: motivos[v] || texto(v) })));
  async function ler() {
    if (ocupado || ctx.obsoleta()) return;
    ocupado = true;
    raiz.replaceChildren(h('h2', { class: 'secao-titulo', texto: 'Ensaio do calendário Meta' }));
    const corpo = h('div', { class: 'secao-corpo quebra', role: 'status', 'aria-live': 'polite' });
    raiz.appendChild(corpo);
    ctx.estado.carregando(corpo, 'Lendo o ensaio…');
    try {
      const resposta = await ctx.api('/api/marketing/calendario/ensaio');
      if (ctx.obsoleta()) return;
      const d = resposta.dados;
      if (!d || d.modo !== 'ensaio' || d.realHabilitado !== false || d.chamadasMeta !== 0 || !Array.isArray(d.itens)) {
        throw Object.assign(new Error('O servidor não devolveu um ensaio válido. Nenhuma ação real foi habilitada.'), { codigo: 'ensaio-invalido' });
      }
      corpo.replaceChildren();
      corpo.appendChild(ctx.alerta('info', 'Somente simulação. Nenhuma publicação foi agendada ou enviada à Meta. Um item ensaiado não está autorizado para execução real.'));
      if (d.aviso) corpo.appendChild(h('p', { class: 'nota-explicativa', texto: texto(d.aviso) }));
      corpo.appendChild(h('p', { class: 'campo-ajuda', texto: `Leitura: ${ctx.formatar.dataHora(d.geradoEm || resposta.atualizadoEm)} · Fuso: ${texto(d.fuso)} · Dia D: ${d.diaD || 'não declarado'}` }));
      corpo.appendChild(h('p', { texto: `${d.itens.length} ${d.itens.length === 1 ? 'item' : 'itens'} · ${d.itens.filter((i) => i.estado === 'ensaio').length} ensaiados · ${d.itens.filter((i) => i.estado === 'bloqueado').length} bloqueados` }));
      if (d.bloqueiosGerais?.length) corpo.appendChild(h('div', {}, h('h3', { texto: 'Bloqueios do ensaio' }), lista(d.bloqueiosGerais)));
      if (!d.itens.length) corpo.appendChild(h('p', { texto: 'Nenhum planejamento disponível para ensaiar. Marque as datas no calendário editorial.' }));
      for (const i of d.itens) {
        corpo.appendChild(h('article', { class: 'secao' },
          h('h3', { class: 'secao-titulo', texto: `${texto(i.midias?.[0]?.nome || 'Peça do ensaio')} · ${i.estado === 'ensaio' ? 'Ensaiado, sem agendamento real' : 'Bloqueado no ensaio'}` }),
          h('div', { class: 'secao-corpo' },
            h('p', { texto: `Canal: ${texto(i.canal)} · Data: ${texto(i.data)} · Hora: ${texto(i.hora)} · Fuso: ${texto(i.fuso)}` }),
            // F4-1: id da peça, versão, chave do recibo e instante UTC não viram texto; o recibo existe ou não.
            i.recibo ? h('p', { class: 'campo-ajuda', texto: 'Recibo de simulação registrado.' }) : null,
            lista(i.bloqueios),
            h('ul', {}, (Array.isArray(i.midias) ? i.midias : []).map((m) => h('li', { texto: `${texto(m.nome)} (${texto(m.tipo)})` }))))));
      }
      if (d.pendenciasReais?.length) corpo.appendChild(h('details', {}, h('summary', { texto: 'Pendências da etapa real. Elas não autorizam publicação.' }), lista(d.pendenciasReais)));
      corpo.appendChild(h('button', { class: 'botao', type: 'button', texto: 'Atualizar ensaio', onclick: ler }));
    } catch (err) {
      if (!ctx.obsoleta()) {
        console.warn('[calendario-ensaio]', err.codigo || 'falha');
        ctx.estado.erro(corpo, err, ler);
      }
    } finally { ocupado = false; }
  }
  return ler();
}

function itemCalendario(ctx, i, aoClicar) {
  const { h } = ctx;
  const el = h('button', { class: 'cal-item', type: 'button', draggable: 'true', title: `${nomeDaPeca(i.peca)}, ${rotuloCanal(i.canal)}`, onclick: aoClicar },
    i.hora ? h('span', { class: 'cal-item-hora', texto: i.hora }) : null,
    h('span', { class: 'cal-item-titulo', texto: nomeDaPeca(i.peca) }),
    h('span', { class: 'cal-item-canal', texto: rotuloCanal(i.canal) }));
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-grana-peca', i.peca.id); e.dataTransfer.effectAllowed = 'move'; });
  return el;
}

// Apresenta a previsão recebida; resolução e identidade pertencem ao servidor.
export function detalhesCronograma(ctx, previsao) {
  if (!previsao) return null;
  // Resumos de peça usam estado para a pasta; entradas usam o estado do planejamento.
  // Um estado novo da entrada não pode ser escondido por um resumo antigo.
  const estadoDaPeca = ['para-aprovacao', 'aprovados', 'historico', 'apoio'].includes(previsao.estado);
  previsao = { ...previsao, estado: estadoDaPeca || !previsao.estado ? previsao.estadoCronograma || previsao.estado : previsao.estado };
  const { h } = ctx;
  const p = previsao.dataPrevista;
  const origem = previsao.origem;
  const data = (valor) => valor ? ctx.formatar.data(valor) : 'não resolvida';
  const horario = (valor) => valor ? `às ${valor}` : 'horário pendente';
  const canal = (valor) => valor ? rotuloCanal(valor) : 'canal pendente';
  let prevista = 'Sem data no cronograma';
  if (p?.modo === 'absoluta') prevista = `${data(p.data)} ${horario(p.hora)} · ${canal(p.canal)}`;
  if (p?.modo === 'diaD') prevista = Number.isInteger(p.diasUteis) && p.diasUteis >= 0
    ? `D+${p.diasUteis} ${p.diasUteis === 1 ? 'dia útil' : 'dias úteis'} ${horario(p.hora)} · ${canal(p.canal)}`
    : 'Posição relativa não informada. Confira o cronograma.';
  const estados = {
    'aguardando-dia-d': 'Aguardando dia D. A data sai quando o dia D for marcado.',
    'aguardando dia D': 'Aguardando dia D. A data sai quando o dia D for marcado.',
    'sem-data-no-cronograma': 'Sem data no cronograma.',
    'vinculo-invalido': 'O vínculo do cronograma precisa ser corrigido.',
    'vinculo-pendente': 'Vínculo do cronograma pendente.',
    'duplicado': 'Mais de uma peça reivindica este item. Corrija o vínculo.',
    'desatualizado': 'A peça mudou depois do aceite. O planejamento anterior perdeu a validade.',
    'data-passada': 'A data prevista já passou. Nada será publicado imediatamente.',
    'sem data no cronograma': 'Sem data no cronograma.',
    'vínculo inválido': 'O vínculo do cronograma precisa ser corrigido.',
    'vínculo duplicado': 'Mais de uma peça reivindica este item. Corrija o vínculo.',
    'cronograma inválido': 'Cronograma inválido. As previsões estão suspensas até a correção.',
  };
  const manual = previsao.substituicaoManual;
  const recibos = (Array.isArray(previsao.recibos) && previsao.recibos.length ? previsao.recibos : previsao.recibo ? [previsao.recibo] : []).filter((r) => r && typeof r === 'object');
  if (previsao.reciboAceite && !recibos.some((r) => r.tipo === 'aceite-autor')) recibos.push(previsao.reciboAceite);
  return h('div', { class: 'secao-corpo quebra' },
    h('p', { texto: `Data prevista: ${prevista}` }),
    h('p', { class: 'campo-ajuda', texto: previsao.proximoPasso || (previsao.estado === 'planejado' ? 'Planejada no calendário local. Confira o recibo. A Meta continua em ensaio.'
      : !origem ? 'Próximo passo: ligue a peça aceita a um item do cronograma. Se o item não existe, adicione-o ao cronograma.'
        : previsao.estado === 'desatualizado' ? 'Próximo passo: volte à Aprovação e aceite a versão atual.'
          : ['aguardando dia D', 'aguardando-dia-d'].includes(previsao.estado) ? 'Próximo passo: defina o dia D para resolver a previsão.'
            : ['duplicado', 'vinculo-invalido', 'vínculo inválido', 'vínculo duplicado', 'cronograma inválido'].includes(previsao.estado) ? 'Próximo passo: peça aos agentes para conferir o item e o vínculo no índice antes de planejar.'
              : 'Próximo passo: confira a previsão e os recibos antes de seguir.') }),
    origem ? h('p', { class: 'campo-ajuda', texto: `Origem: ${origem.manifestoId || 'manifesto não informado'} · ${origem.itemId || 'item não informado'} · revisão ${origem.manifestoVersao ?? 'não informada'}` }) : h('p', { class: 'campo-ajuda', texto: 'Origem do cronograma não informada.' }),
    p?.modo === 'diaD' && (p.dataResolvida || previsao.dataResolvida) ? h('p', { texto: `Previsão resolvida: ${data(p.dataResolvida || previsao.dataResolvida)}` }) : null,
    estados[previsao.estado] ? ctx.alerta('atencao', estados[previsao.estado]) : previsao.estado && !['resolvido', 'planejado'].includes(previsao.estado) ? ctx.alerta('atencao', `Estado do cronograma: ${previsao.estado}. Confira antes de seguir.`) : null,
    previsao.motivo && previsao.motivo !== previsao.estado ? ctx.alerta('atencao', previsao.motivo) : null,
    manual ? h('p', { texto: `Data alterada pelo autor: ${data(manual.data)} ${horario(manual.hora)} · ${canal(manual.canal)}. A previsão de origem foi preservada.` }) : null,
    ...recibos.map((r) => h('p', { role: 'status', class: 'campo-ajuda', texto: r.tipo === 'aceite-autor'
      ? `Recibo do aceite: seu aceite no painel${r.aprovadoEm ? ` · ${ctx.formatar.dataHora(r.aprovadoEm)}` : ''}${r.evidencia ? ` · ${r.evidencia}` : ''}. Não comprova publicação na Meta.`
      : `Recibo do calendário: ${r.tipo || r.acao || 'tipo não informado'}${r.em ? ` · ${ctx.formatar.dataHora(r.em)}` : ''}${r.estado ? ` · ${['aguardando dia D', 'aguardando-dia-d'].includes(previsao.estado) && ['aguardando dia D', 'aguardando-dia-d'].includes(r.estado) ? 'Planejamento registrado' : r.estado}` : ''}. Não comprova publicação na Meta.` })),
    origem && !recibos.length ? ctx.alerta('atencao', 'Recibo do calendário ainda não informado. Atualize para conferir o registro.') : null,
    ...(Array.isArray(previsao.avisos) ? previsao.avisos : []).map((aviso) => ctx.alerta('atencao', aviso)));
}

const planejamentosEmCurso = new WeakSet();
export async function escolherData(ctx, peca, dataInicial, canais) {
  if (ctx.obsoleta() || planejamentosEmCurso.has(ctx)) return;
  planejamentosEmCurso.add(ctx);
  try {
    const v = await ctx.formulario({
      titulo: 'Data de publicação',
      texto: `${nomeDaPeca(peca)}. Isto só marca no calendário do painel. Ninguém publica nada por aqui.`,
      campos: [
        { nome: 'data', rotulo: 'Dia', tipo: 'date', obrigatorio: true, valor: dataInicial || '' },
        { nome: 'hora', rotulo: 'Horário (opcional)', tipo: 'time', valor: '' },
        { nome: 'canal', rotulo: 'Onde', tipo: 'select', valor: peca.tipo === 'video' ? 'reels' : 'instagram-feed',
          opcoes: canais.map((c) => ({ valor: c, rotulo: rotuloCanal(c) })) },
        { nome: 'observacao', rotulo: 'Observação (opcional)', tipo: 'textarea', linhas: 2, ajuda: 'Este texto fica gravado em docs/marketing/painel e vai para o GitHub público no próximo commit.' },
      ],
      rotuloBotao: 'Marcar data',
    });
    if (!v || ctx.obsoleta()) return;
    if (!dataValida(v.data) || (v.hora && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.hora)) || !canais.includes(v.canal)) {
      throw new Error('Confira a data, o horário e o canal antes de marcar.');
    }
    const r = await ctx.acao('/api/marketing/calendario', {
      id: peca.id, versao: peca.versao, data: v.data, hora: v.hora || undefined, canal: v.canal, observacao: v.observacao || undefined,
    });
    if (ctx.obsoleta()) return;
    for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
    const recibo = r.dados?.planejamento;
    if (recibo?.id !== peca.id || recibo.versao !== peca.versao || recibo.data !== v.data ||
      (recibo.hora || null) !== (v.hora || null) || recibo.canal !== v.canal || !Number.isFinite(Date.parse(recibo.planejadoEm))) {
      throw new Error('A resposta não confirmou o planejamento. Atualize e confira os recibos antes de repetir.');
    }
    ctx.aviso(`Marcado para ${ctx.formatar.data(recibo.data)}.`, 'ok');
    ctx.navegar(`#/marketing/calendario?mes=${v.data.slice(0, 7)}`);
  } catch (err) {
    console.warn('[calendario-planejar]', err.codigo || 'falha');
    if (!ctx.obsoleta()) ctx.aviso(err.codigo === 'versao-mudou'
      ? 'A peça mudou depois do aceite. Ela precisa de novo aceite antes de ganhar data.'
      : 'Não foi possível confirmar a data; atualize e confira antes de repetir.', 'erro');
  } finally { planejamentosEmCurso.delete(ctx); }
}
