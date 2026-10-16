// Sino global e central de notificações do painel local (M6, docs/admin/m6-prism). Dono: Lumen.
//
// Vive na casca, fora dos módulos de rota: fica no topo de toda tela depois do login. Lê pelo
// servidor local (GET /api/marketing/notificacoes) e marca leitura por POST. Sem fundação remota
// o servidor devolve um dublê marcado "dados de teste", e a central repete essa marca.
//
// A parte pura (contador, filtros, agrupamento, marcar todas) não toca no DOM e tem teste de
// paridade com lib/admin-notificacoes.ts (__tests__/admin-sino-local.cjs).
// Texto vindo da API entra sempre por textContent (o `h` do app.js cuida disso).

export const FONTES = [
  { valor: 'todas', rotulo: 'Todas as fontes' },
  { valor: 'publicacoes', rotulo: 'Publicações' },
  { valor: 'criativos', rotulo: 'Criativos' },
  { valor: 'feedbacks', rotulo: 'Feedbacks' },
  { valor: 'sistema', rotulo: 'Sistema' },
  { valor: 'novidades', rotulo: 'Novidades' },
];
export const IMPORTANCIAS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'agir', rotulo: 'Precisa agir' },
  { valor: 'informacao', rotulo: 'Informação' },
];
export const FILTRO_INICIAL = { aba: 'nao-lidas', fonte: 'todas', importancia: 'todas' };

export const lida = (n) => Boolean(n.lidaEm);
export const rotuloFonte = (f) => (FONTES.find((x) => x.valor === f) || { rotulo: 'Sistema' }).rotulo;
export const contarNaoLidas = (lista) => lista.filter((n) => !lida(n)).length;

// De 1 a 99 mostra o numeral; acima, 99+; zero ou desconhecido não mostra selo.
export function rotuloContador(total) {
  if (total === null || total === undefined || !Number.isFinite(total) || total <= 0) return null;
  return total > 99 ? '99+' : String(Math.floor(total));
}

// O nome acessível conserva o total completo e nunca vira "nenhuma" quando o número é desconhecido.
export function nomeAcessivelSino(total) {
  if (total === null || total === undefined) return 'Notificações indisponíveis';
  if (total <= 0) return 'Notificações, nenhuma não lida';
  return total === 1 ? 'Notificações, 1 não lida' : `Notificações, ${total} não lidas`;
}

export const textoNaoLidas = (n) => (n === 0 ? 'Nenhuma não lida' : n === 1 ? '1 não lida' : `${n} não lidas`);

export function filtrar(lista, f) {
  return lista.filter((n) => (f.aba === 'todas' || !lida(n))
    && (f.fonte === 'todas' || n.fonte === f.fonte)
    && (f.importancia === 'todas' || n.importancia === f.importancia));
}
export const filtrosAtivos = (f) => (f.fonte !== 'todas' ? 1 : 0) + (f.importancia !== 'todas' ? 1 : 0);

// Mais recente primeiro; "Hoje" e "Anteriores" pelo dia local de quem lê.
export function agrupar(lista, agora) {
  const corte = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const ordenada = [...lista].sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm));
  const hoje = ordenada.filter((n) => Date.parse(n.criadoEm) >= corte);
  const antes = ordenada.filter((n) => Date.parse(n.criadoEm) < corte);
  return [...(hoje.length ? [{ rotulo: 'Hoje', itens: hoje }] : []), ...(antes.length ? [{ rotulo: 'Anteriores', itens: antes }] : [])];
}

// Marcar todas: só as que existem no instante da ação (de todos os filtros) e ainda não lidas.
export function idsParaMarcarTodas(lista, instante) {
  return lista.filter((n) => !lida(n) && Date.parse(n.criadoEm) <= instante).map((n) => n.id);
}
// Aplica por id sobre a lista de AGORA: o que chegou durante a gravação continua não lido.
export function marcarIds(lista, ids, quando) {
  const alvo = new Set(ids);
  return lista.map((n) => (alvo.has(n.id) ? { ...n, lidaEm: quando } : n));
}
export const rotuloMarcarTodas = (n) => (n === 1 ? 'Marcar 1 como lida' : `Marcar ${n} como lidas`);

// Falha de leitura nunca vira zero: com lista antiga, o número é o último conhecido; sem, é desconhecido.
export function totalConhecido(leitura) {
  if (leitura.situacao === 'ok') return contarNaoLidas(leitura.lista);
  if (leitura.situacao === 'erro' && leitura.ultima) return contarNaoLidas(leitura.ultima.lista);
  return null;
}

// ---------------------------------------------------------------------------
// Tela

const ICONE_SINO = 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4';
const ICONE_FECHAR = 'm6 6 12 12M18 6 6 18';
function icone(caminho) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'sino-icone');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', caminho);
  svg.appendChild(p);
  return svg;
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function quando(iso, agora) {
  const min = Math.max(0, Math.round((agora.getTime() - Date.parse(iso)) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  return horas < 24 ? `há ${horas} h` : new Date(iso).toLocaleDateString('pt-BR');
}

const PREFS = [
  ['publicacoes', 'Publicações'], ['criativos', 'Criativos'], ['feedbacks', 'Feedbacks'], ['sistema', 'Sistema'], ['novidades', 'Novidades'],
];
const ATUALIZAR_MS = 90_000;
const DESFAZER_MS = 8000;

/**
 * Monta o sino e a central. `ctx` traz o que o app.js já oferece: h, api (GET), acao (POST) e aviso.
 * Devolve { elemento, destruir }.
 */
export function montarSino({ h, api, acao }) {
  let leitura = { situacao: 'carregando' };
  let filtro = { ...FILTRO_INICIAL };
  let desfazer = null; // { ids, timer }
  let falha = '';
  let aviso = '';
  let dialogo = null;
  let prefs = Object.fromEntries(PREFS.map(([id]) => [id, true]));
  let emailFalhas = true;
  let estadoPrefs = '';
  let timer = null;
  let vivo = true;

  const contador = h('span', { class: 'sino-contador', 'aria-hidden': 'true', hidden: true });
  const botao = h('button', { class: 'sino-botao', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': 'Notificações, carregando', onclick: abrir }, icone(ICONE_SINO), contador);
  const anuncio = h('span', { class: 'so-leitor', role: 'status', 'aria-live': 'polite' });
  const elemento = h('div', { class: 'sino' }, botao, anuncio);

  const lista = () => (leitura.situacao === 'ok' ? leitura.lista : leitura.situacao === 'erro' && leitura.ultima ? leitura.ultima.lista : null);
  const atualizadoEm = () => (leitura.situacao === 'ok' ? leitura.atualizadoEm : leitura.situacao === 'erro' && leitura.ultima ? leitura.ultima.atualizadoEm : null);

  function pintarBotao() {
    const total = totalConhecido(leitura);
    const rotulo = rotuloContador(total);
    botao.setAttribute('aria-label', nomeAcessivelSino(total));
    botao.classList.toggle('sino-indisponivel', total === null && leitura.situacao === 'erro');
    contador.hidden = !(rotulo || (total === null && leitura.situacao === 'erro'));
    contador.textContent = rotulo || '!';
  }

  async function carregar() {
    try {
      const r = await api('/api/marketing/notificacoes');
      if (!vivo) return;
      const d = r.dados || {};
      const itens = Array.isArray(d.notificacoes) ? d.notificacoes : [];
      const antes = totalConhecido(leitura);
      leitura = { situacao: 'ok', lista: itens, atualizadoEm: d.atualizadoEm || new Date().toISOString(), fonte: d.fonte, aviso: d.aviso };
      const depois = totalConhecido(leitura);
      if (antes !== null && depois !== antes && !dialogo) anuncio.textContent = textoNaoLidas(depois);
    } catch (err) {
      if (!vivo) return;
      console.warn('[sino] leitura falhou');
      const ultima = lista() && atualizadoEm() ? { lista: lista(), atualizadoEm: atualizadoEm() } : undefined;
      leitura = { situacao: 'erro', ultima, fonte: leitura.fonte, aviso: leitura.aviso };
    }
    pintarBotao();
    if (dialogo) desenharTudo();
  }

  // ---- central (dialog modal nativo: foco preso, fundo inerte, Esc e retorno do foco vêm do navegador)
  let refs = null;

  function abrir() {
    if (dialogo) return;
    dialogo = h('dialog', { class: 'central', 'aria-labelledby': 'central-titulo' });
    dialogo.addEventListener('close', () => { dialogo.remove(); dialogo = null; refs = null; if (vivo) botao.focus(); });
    dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); }); // toque no véu
    document.body.appendChild(dialogo);
    montarEsqueleto();
    desenharTudo();
    dialogo.showModal();
    refs.titulo.focus();
    void carregar();
  }

  function montarEsqueleto() {
    const titulo = h('h2', { id: 'central-titulo', class: 'central-titulo', tabindex: '-1', texto: 'Notificações' });
    const sub = h('p', { class: 'central-sub' });
    const fechar = h('button', { class: 'sino-botao', type: 'button', 'aria-label': 'Fechar notificações', onclick: () => dialogo.close() }, icone(ICONE_FECHAR));
    const abas = h('div', { class: 'central-abas', role: 'tablist', 'aria-label': 'Filtro de notificações' });
    const abaNao = h('button', { class: 'central-aba', type: 'button', role: 'tab', id: 'aba-nao-lidas' });
    const abaTodas = h('button', { class: 'central-aba', type: 'button', role: 'tab', id: 'aba-todas' });
    for (const [b, valor, outra] of [[abaNao, 'nao-lidas', 'todas'], [abaTodas, 'todas', 'nao-lidas']]) {
      b.addEventListener('click', () => { filtro = { ...filtro, aba: valor }; desenharLista(); });
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        filtro = { ...filtro, aba: outra }; desenharLista();
        dialogo.querySelector(`#aba-${outra === 'todas' ? 'todas' : 'nao-lidas'}`).focus();
      });
      abas.appendChild(b);
    }
    const alternar = h('button', { class: 'botao botao-fantasma central-filtros-alternar', type: 'button', 'aria-controls': 'central-filtros', 'aria-expanded': 'false' });
    alternar.addEventListener('click', () => {
      const abrirF = alternar.getAttribute('aria-expanded') !== 'true';
      alternar.setAttribute('aria-expanded', String(abrirF));
      dialogo.classList.toggle('central-filtros-abertos', abrirF);
    });
    const selFonte = h('select', { id: 'central-fonte' }, FONTES.map((f) => h('option', { value: f.valor, texto: f.rotulo })));
    const selImp = h('select', { id: 'central-imp' }, IMPORTANCIAS.map((f) => h('option', { value: f.valor, texto: f.rotulo })));
    selFonte.addEventListener('change', () => { filtro = { ...filtro, fonte: selFonte.value }; desenharLista(); });
    selImp.addEventListener('change', () => { filtro = { ...filtro, importancia: selImp.value }; desenharLista(); });
    const filtros = h('div', { class: 'central-filtros', id: 'central-filtros' },
      h('label', { texto: 'Fonte' }, selFonte), h('label', { texto: 'Importância' }, selImp));
    const corpo = h('div', { class: 'central-corpo', tabindex: '-1' });
    const rodape = h('footer', { class: 'central-rodape' });
    dialogo.append(
      h('header', { class: 'central-cabecalho' }, h('div', {}, titulo, sub), fechar),
      h('div', { class: 'central-rolagem' }, abas, alternar, filtros, corpo),
      rodape);
    refs = { titulo, sub, abaNao, abaTodas, alternar, selFonte, selImp, corpo, rodape };
  }

  function desenharTudo() { if (refs) { desenharCabecalho(); desenharLista(); } }

  function desenharCabecalho() {
    const total = totalConhecido(leitura);
    refs.sub.textContent = `${total === null ? 'Contagem indisponível' : textoNaoLidas(total)}${leitura.fonte === 'dados-de-teste' ? ' · dados de teste' : ''}`;
  }

  function desenharLista() {
    if (!refs) return;
    const itens = lista();
    const naoLidas = itens ? contarNaoLidas(itens) : 0;
    const ativos = filtrosAtivos(filtro);
    for (const [b, valor, texto] of [[refs.abaNao, 'nao-lidas', `Não lidas (${naoLidas})`], [refs.abaTodas, 'todas', `Todas (${itens ? itens.length : 0})`]]) {
      b.textContent = texto;
      b.setAttribute('aria-selected', String(filtro.aba === valor));
      b.tabIndex = filtro.aba === valor ? 0 : -1;
    }
    refs.alternar.replaceChildren(h('span', { texto: 'Filtros' }), h('span', { texto: ativos === 1 ? '1 ativo' : `${ativos} ativos` }));
    refs.selFonte.value = filtro.fonte;
    refs.selImp.value = filtro.importancia;
    desenharCabecalho();

    const agora = new Date();
    const partes = [];
    if (leitura.situacao === 'carregando') partes.push(h('p', { class: 'central-bloco', role: 'status', texto: 'Carregando notificações…' }));
    if (leitura.situacao === 'erro') {
      const em = atualizadoEm();
      partes.push(h('div', { class: 'central-bloco central-bloco-atencao', role: 'alert' },
        h('h3', { texto: em ? `Sem atualização desde ${hhmm(em)}` : 'Não foi possível carregar as notificações.' }),
        h('p', { texto: em ? 'Mostrando a última lista salva. O contador mostra o último número conhecido.' : 'Tente de novo quando o servidor local responder.' }),
        h('button', { class: 'botao botao-primario', type: 'button', texto: 'Tentar de novo', onclick: () => { leitura = { situacao: 'carregando' }; desenharLista(); void carregar(); } })));
    }
    if (falha) partes.push(h('p', { class: 'central-bloco central-bloco-atencao', role: 'alert', texto: falha }));
    if (itens) {
      const visiveis = filtrar(itens, filtro);
      const grupos = agrupar(visiveis, agora);
      if (!grupos.length) {
        partes.push(filtro.aba === 'nao-lidas' && ativos === 0
          ? h('div', { class: 'central-bloco', role: 'status' }, h('h3', { texto: 'Você está em dia.' }), h('p', { texto: 'Nenhuma notificação não lida.' }))
          : h('div', { class: 'central-bloco', role: 'status' }, h('h3', { texto: 'Nenhuma notificação com estes filtros.' }),
            h('button', { class: 'botao', type: 'button', texto: 'Limpar filtros', onclick: () => { filtro = { ...FILTRO_INICIAL }; desenharLista(); } })));
      }
      for (const g of grupos) {
        partes.push(h('section', { 'aria-label': g.rotulo },
          h('p', { class: 'central-grupo', texto: g.rotulo }),
          g.itens.map((n) => h('article', { class: 'central-item' },
            h('p', { class: 'central-meta', texto: `${rotuloFonte(n.fonte)} · ${quando(n.criadoEm, agora)} · ${n.importancia === 'agir' ? 'Precisa agir' : 'Informação'}${n.resolvidaEm ? ' · Resolvida' : ''}` }),
            h('h3', { texto: n.titulo }),
            h('p', { class: 'central-resumo', texto: n.resumo }),
            lida(n) ? null : h('p', { class: 'central-nao-lida', texto: 'Não lida' }),
            h('div', { class: 'central-acoes' },
              n.acao && n.destino ? h('button', { class: 'botao botao-primario', type: 'button', texto: n.acao, onclick: () => irPara(n.destino) }) : null,
              lida(n) ? null : h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Marcar como lida', onclick: () => marcar([n.id]) }))))));
      }
    }
    refs.corpo.replaceChildren(...partes);

    const marcar1 = itens ? idsParaMarcarTodas(itens, Date.now()) : [];
    refs.rodape.replaceChildren(
      itens ? h('div', { class: 'central-rodape-marcar' },
        desfazer
          ? h('button', { class: 'botao', type: 'button', texto: 'Desfazer', onclick: desfazerTudo })
          : h('button', { class: 'botao', type: 'button', texto: rotuloMarcarTodas(marcar1.length), disabled: marcar1.length === 0, onclick: marcarTudo }),
        h('p', { class: 'central-apoio', role: 'status', 'aria-live': 'polite', texto: aviso || 'Inclui todos os filtros.' })) : null,
      h('div', { class: 'central-rodape-linha' },
        h('button', { class: 'botao', type: 'button', id: 'central-prefs', 'aria-haspopup': 'dialog', texto: 'Preferências', onclick: abrirPrefs }),
        h('p', { class: 'central-apoio', texto: atualizadoEm() ? `Atualizado às ${hhmm(atualizadoEm())}` : 'Sem atualização' })));
  }

  function irPara(destino) {
    dialogo.close();
    // depois que a central devolve o fundo, vai à tela e leva o foco ao conteúdo
    setTimeout(() => { location.hash = destino; document.getElementById('conteudo')?.focus({ preventScroll: true }); }, 0);
  }

  // ---- leitura (nunca resolve nada: só lidaEm)
  async function gravar(ids, desfazerLeitura) {
    await acao('/api/marketing/notificacoes/ler', desfazerLeitura ? { ids, desfazer: true } : { ids });
  }

  async function marcar(ids) {
    falha = '';
    try {
      await gravar(ids, false);
      const l = lista();
      if (l) { const nova = marcarIds(l, ids, new Date().toISOString()); leitura = leitura.situacao === 'ok' ? { ...leitura, lista: nova } : { ...leitura, ultima: { ...leitura.ultima, lista: nova } }; }
    } catch {
      console.warn('[sino] marcar-lida-falhou');
      falha = 'Não foi possível marcar como lida. Tente de novo.';
    }
    pintarBotao(); desenharLista();
    refs?.corpo.focus();
  }

  async function marcarTudo() {
    const l = lista();
    if (!l) return;
    falha = '';
    const ids = idsParaMarcarTodas(l, Date.now());
    if (!ids.length) return;
    try {
      await gravar(ids, false);
      const nova = marcarIds(lista() || [], ids, new Date().toISOString());
      leitura = leitura.situacao === 'ok' ? { ...leitura, lista: nova } : { ...leitura, ultima: { ...leitura.ultima, lista: nova } };
      if (desfazer) clearTimeout(desfazer.timer);
      desfazer = { ids, timer: setTimeout(() => { desfazer = null; aviso = ''; if (dialogo) desenharLista(); }, DESFAZER_MS) };
      aviso = `${ids.length === 1 ? '1 notificação marcada como lida' : `${ids.length} notificações marcadas como lidas`}.`;
    } catch {
      console.warn('[sino] marcar-todas-falhou');
      falha = 'Não foi possível marcar como lidas. O contador e a lista não mudaram.';
    }
    pintarBotao(); desenharLista();
    dialogo?.querySelector('.central-rodape-marcar button')?.focus();
  }

  async function desfazerTudo() {
    const d = desfazer;
    if (!d) return;
    clearTimeout(d.timer); desfazer = null; aviso = ''; falha = '';
    try {
      await gravar(d.ids, true);
      const nova = marcarIds(lista() || [], d.ids, null);
      leitura = leitura.situacao === 'ok' ? { ...leitura, lista: nova } : { ...leitura, ultima: { ...leitura.ultima, lista: nova } };
    } catch {
      console.warn('[sino] desfazer-falhou');
      falha = 'Não foi possível desfazer. As notificações continuam lidas.';
    }
    pintarBotao(); desenharLista();
  }

  // ---- preferências (dublê: valem só nesta aba até a fundação existir)
  function abrirPrefs() {
    const resp = h('p', { class: 'central-apoio', role: 'status', 'aria-live': 'polite', texto: '' });
    const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'pref-titulo' },
      h('h2', { class: 'modal-titulo', id: 'pref-titulo', tabindex: '-1', texto: 'Notificações por tipo' }),
      h('p', { class: 'modal-texto', texto: 'Desligar não apaga a ocorrência do painel nem resolve o incidente. Dados de teste: a escolha vale só nesta aba.' }),
      h('div', { class: 'pref-lista' },
        PREFS.map(([id, rotulo]) => h('label', { class: 'pref-linha' }, h('span', { texto: `${rotulo} no painel` }),
          h('input', { type: 'checkbox', checked: prefs[id], onchange: (e) => { prefs[id] = e.target.checked; resp.textContent = 'Preferências salvas (dados de teste).'; } }))),
        h('label', { class: 'pref-linha' }, h('span', { texto: 'E-mail só para falhas importantes' }),
          h('input', { type: 'checkbox', checked: emailFalhas, onchange: (e) => { emailFalhas = e.target.checked; resp.textContent = 'Preferências salvas (dados de teste).'; } }))),
      resp,
      h('div', { class: 'modal-acoes' }, h('button', { class: 'botao botao-primario', type: 'button', texto: 'Fechar', onclick: () => dlg.close() })));
    dlg.addEventListener('close', () => { dlg.remove(); dialogo?.querySelector('#central-prefs')?.focus(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector('#pref-titulo').focus();
  }

  carregar();
  timer = setInterval(() => { if (!document.hidden) void carregar(); }, ATUALIZAR_MS);

  return {
    elemento,
    destruir() {
      vivo = false;
      clearInterval(timer);
      if (desfazer) clearTimeout(desfazer.timer);
      for (const d of document.querySelectorAll('dialog.central, dialog.modal')) { if (d.classList.contains('central') || d.querySelector('#pref-titulo')) d.remove(); }
      elemento.remove();
    },
  };
}
