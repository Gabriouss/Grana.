// Interface da fila real. Todo dado vem do contrato local e toda mutação passa
// pelo cliente existente (CSRF + step-up TOTP do admin-local).
import { iconeSvg, montarMidia, topoDaPrevia } from './_previa-publicacao.js';
import {
  API_PUBLICACOES, FORMATOS_PUBLICACAO, FUSO_PUBLICACAO, ROTULOS_ESTADO,
  capacidadeDaConta, caminhoMidia, criarClientePublicacoes, horarioLocalParaUtc,
  horarioUtcParaLocal, previaConfirmavel, resumirLote, rotuloDataHorario,
  antecedenciaMinima, conferirHorario, sugestaoHorario, mensagemHumana, fraseDoMotivo, descreverJobReal, jobAtivo, quandoCurto,
} from './_publicacoes-reais.js';

// Enquanto houver job ativo e a aba estiver visível, o estado real é relido neste intervalo.
export const INTERVALO_VIGIA_MS = 30000;

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const REDES = { instagram: 'Instagram', facebook: 'Facebook' };
const FORMATOS = { feed: 'Feed', carrossel: 'Carrossel', reels: 'Reels', stories: 'Stories' };
const ESTADOS_ATIVOS = new Set(['planejado', 'programado-no-painel', 'preparando', 'agendado-na-meta']);
const ESTADOS_TERMINAIS = new Set(['publicado', 'cancelado']);
const MIME_OK = new Set(['image/png', 'image/jpeg', 'video/mp4']);

export async function montarReal(raiz, ctx, integracao = null) {
  const { h } = ctx;
  const cliente = criarClientePublicacoes(ctx);
  let capacidades = null;
  let catalogo = null;
  let feedPorPeca = new Map();
  let pagina = null;
  let pilhaCursor = [];
  let jobs = [];
  let detalhe = null;
  let selecaoPeca = ctx.params?.peca || '';
  let selecaoDestinos = new Set();
  let previa = null;
  let previaVistas = false;
  let previewBlobs = [];
  let ocupado = false;
  let encerrada = false;
  let pendencia = null;
  let relogioPrevia = null;
  let relogioFila = null;
  const estadosVistos = new Map();
  const controladores = new Set();
  // Uma chave por INTENÇÃO, não por clique: depois de timeout ou perda de resposta o mesmo
  // pedido reutiliza a chave (achado C3). Só sai daqui quando o resultado é definitivo.
  const intencoes = new Map();
  const chaveDe = (...partes) => {
    const k = partes.join('|');
    if (!intencoes.has(k)) intencoes.set(k, uuidNovo());
    return { k, idempotencia: intencoes.get(k) };
  };

  const corpo = h('div', { class: 'tela-corpo publicacoes pub-real' });
  const recibo = h('p', { class: 'publicacoes-recibo', role: 'status', 'aria-live': 'polite', tabindex: '-1' });
  const reciboPainel = h('p', { class: 'publicacoes-recibo-painel', role: 'status', 'aria-live': 'polite' });
  const disponibilidade = h('div', { class: 'pub-real-disponibilidade', role: 'status', 'aria-live': 'polite' });
  const controles = h('div', { class: 'pub-real-controles' });
  const compositor = h('section', { class: 'secao pub-real-compositor', 'aria-labelledby': 'pub-real-compor-titulo' });
  const lista = h('section', { class: 'secao pub-real-lista', 'aria-labelledby': 'pub-real-lista-titulo' });
  const detalheEl = h('section', { class: 'secao publicacoes-detalhe pub-real-detalhe', 'aria-label': 'Detalhe e recibos', hidden: true });
  const previewEl = h('section', { class: 'secao pub-real-previa', 'aria-label': 'Prévia estimada por destino', hidden: true });
  const acoesTopo = [
    h('a', { class: 'botao botao-fantasma', href: '#/marketing/publicacoes?modo=simulacao', texto: 'Abrir simulação isolada' }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar estado real', onclick: () => atualizarTudo() }),
  ];
  if (!integracao) ctx.cabecalho(raiz, 'Agendamento real', 'Uma confirmação autoriza execução futura no serviço remoto. O calendário editorial é referência; só a confirmação autoriza publicação.', acoesTopo);
  if (integracao) {
    integracao.topo.append(disponibilidade, controles, recibo, h('div', { class: 'bloco-acao' }, acoesTopo));
    integracao.painel.append(reciboPainel, compositor, previewEl);
    integracao.fila.append(lista, detalheEl);
  } else raiz.append(corpo, recibo, disponibilidade, controles, compositor, previewEl, lista, detalheEl);

  const botao = (texto, onclick, opcoes = {}) => h('button', {
    class: `botao ${opcoes.primario ? 'botao-primario' : 'botao-fantasma'}`,
    type: 'button', texto, onclick, disabled: (opcoes.operacao === false ? false : ocupado) || !!opcoes.disabled,
    'data-operacao': opcoes.operacao === false ? undefined : 'true',
  });

  // A frase vem primeiro; o código, quando houver, fica pequeno e depois (útil para o suporte).
  function avisar(texto, erro = false, codigo = null) {
    for (const el of [recibo, reciboPainel]) {
      el.replaceChildren(texto, ...(codigo ? [' ', h('small', { class: 'pub-real-codigo', texto: `Código: ${codigo}` })] : []));
      el.setAttribute('role', erro ? 'alert' : 'status');
    }
  }

  function erroLegivel(err, acao = 'A operação') {
    const { frase, codigo } = mensagemHumana(err);
    avisar(`${acao} não foi concluída. ${frase}`, true, codigo);
  }

  function busy(valor) {
    ocupado = valor;
    raiz.setAttribute('aria-busy', String(valor));
    raiz.querySelectorAll('button[data-operacao]').forEach((b) => { b.disabled = valor || b.dataset.bloqueado === 'true'; });
  }

  function liberarPreview() {
    clearInterval(relogioPrevia); relogioPrevia = null;
    for (const url of previewBlobs) URL.revokeObjectURL(url);
    previewBlobs = [];
    previa = null;
    previaVistas = false;
    previewEl.hidden = true;
    previewEl.replaceChildren();
  }

  function invalidaSelecao() {
    liberarPreview();
    avisar('Seleção alterada. Gere uma nova prévia antes de confirmar.');
    desenharCompositor();
  }

  function pecaSelecionada() { return catalogo?.pecas.find((p) => p.id === selecaoPeca) || null; }
  function destinosSelecionados() {
    if (!capacidades) return [];
    return [...selecaoDestinos].map((k) => {
      const [contaId, formato] = k.split('\u001f');
      const conta = capacidades.contas.find((c) => c.contaId === contaId);
      return conta ? { contaId, rede: conta.rede, formato } : null;
    }).filter(Boolean);
  }
  function chaveDestino(contaId, formato) { return `${contaId}\u001f${formato}`; }
  function contaPorId(id, rede) { return capacidades?.contas.find((c) => c.contaId === id && c.rede === rede) || null; }
  function nomeDestino(d) { return contaPorId(d?.contaId, d?.rede)?.rotulo || `${REDES[d?.rede] || 'Conta'} indisponível`; }

  // Horário bom = existe no fuso, está no futuro e deixa tempo para o executor preparar (R7).
  const minimoAtual = () => antecedenciaMinima(destinosSelecionados(), pecaSelecionada());
  function horarioConferido(valorLocal) {
    let utc;
    try { utc = horarioLocalParaUtc(valorLocal); } catch (err) { return { ok: false, texto: valorLocal ? err.message : 'Escolha a data e a hora da publicação.' }; }
    return conferirHorario(utc, minimoAtual());
  }
  function horarioInicial(data) {
    const editorial = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? `${data}T09:00` : '';
    return editorial && horarioConferido(editorial).ok ? editorial : sugestaoHorario(minimoAtual());
  }

  function atualizarResumoHorario() {
    const input = compositor.querySelector('[name="agendarParaLocal"]');
    const saida = compositor.querySelector('.pub-real-horario-resumo');
    const acaoPrevia = compositor.querySelector('[data-acao-previa]');
    if (!input || !saida) return;
    const r = horarioConferido(input.value);
    saida.textContent = r.texto;
    saida.dataset.valido = String(r.ok);
    saida.setAttribute('role', r.ok ? 'status' : 'alert');
    if (acaoPrevia) acaoPrevia.disabled = ocupado || !pecaSelecionada() || !destinosSelecionados().length || saida.dataset.valido !== 'true';
  }

  function imagemDaPeca(peca) {
    const feed = feedPorPeca.get(peca.id);
    const raw = feed?.bruto || feed;
    const candidatos = [
      raw?.capa?.url, raw?.capa?.caminho,
      ...(Array.isArray(raw?.arquivos) ? raw.arquivos.map((a) => typeof a === 'string' ? a : a?.url || a?.caminho) : []),
      raw?.caminho,
    ].filter(Boolean);
    const caminho = candidatos.find((x) => /\.(png|jpe?g|webp|gif|avif)$/i.test(String(x)));
    if (!caminho) return null;
    try { return ctx.urlArquivo(caminho); } catch { return null; }
  }

  function desenharCompositor() {
    if (!capacidades || !catalogo) return;
    const peca = pecaSelecionada();
    const cardsPecas = catalogo.pecas.length
      ? h('div', { class: 'pub-real-pecas', role: 'radiogroup', 'aria-label': 'Peças aprovadas e vigentes' }, catalogo.pecas.map((item) => {
        const idRadio = `pub-real-peca-${item.id}`;
        const thumb = imagemDaPeca(item);
        const feed = feedPorPeca.get(item.id);
        return h('label', { class: `pub-real-peca${item.id === selecaoPeca ? ' selecionada' : ''}`, for: idRadio },
          h('input', { id: idRadio, type: 'radio', name: 'pecaAprovada', value: item.id, checked: item.id === selecaoPeca,
            onchange: () => { selecaoPeca = item.id; invalidaSelecao(); } }),
          thumb ? h('img', { class: 'pub-real-miniatura', src: thumb, alt: `Miniatura: ${item.titulo}`, loading: 'lazy' })
            : h('span', { class: 'pub-real-miniatura pub-real-miniatura-vazia', 'aria-label': 'Miniatura indisponível', texto: 'Sem miniatura' }),
          h('span', { class: 'pub-real-peca-texto' },
            h('strong', { texto: item.titulo }),
            h('small', { texto: `${item.tipo || 'Peça'} · versão aprovada` }),
            feed?.data ? h('small', { texto: `Calendário editorial: ${feed.data}${feed.hora ? ` às ${feed.hora}` : ''} · referência sem autorização` }) : null));
      })) : h('p', { class: 'texto-fraco', texto: 'Nenhuma peça com aceite vigente foi retornada pelo catálogo real.' });

    const contas = capacidades.contas.map((conta) => {
      const estados = FORMATOS_PUBLICACAO.map((formato) => {
        const cap = capacidadeDaConta(conta, formato);
        const key = chaveDestino(conta.contaId, formato);
        return h('label', { class: `pub-real-formato${cap.disponivel ? '' : ' indisponivel'}` },
          h('input', { type: 'checkbox', name: `destino-${conta.contaId}`, value: formato,
            checked: selecaoDestinos.has(key), disabled: !cap.disponivel,
            'aria-label': `${REDES[conta.rede]} ${conta.rotulo}, ${FORMATOS[formato]}${cap.disponivel ? '' : ', indisponível'}`,
            onchange: (e) => {
              if (e.target.checked) selecaoDestinos.add(key); else selecaoDestinos.delete(key);
              invalidaSelecao();
            } }),
          h('span', null, h('strong', { texto: FORMATOS[formato] }),
            h('small', { texto: cap.disponivel ? 'Capacidade verificada' : motivos(cap.motivos) })));
      });
      return h('fieldset', { class: 'pub-real-conta' },
        h('legend', null, h('span', { class: `pub-real-rede pub-real-${conta.rede}`, texto: REDES[conta.rede] }),
          h('strong', { texto: conta.rotulo }), h('small', { texto: rotuloConexao(conta.conexao, conta.pausada) })),
        conta.capacidades.length ? h('div', { class: 'pub-real-formatos' }, estados)
          : h('p', { class: 'texto-fraco', texto: 'Nenhuma capacidade verificada.' }));
    });

    const anterior = compositor.querySelector('.pub-real-compositor-conteudo');
    const valorHorario = anterior?.querySelector('[name="agendarParaLocal"]')?.value || horarioInicial('');
    const hora = h('input', { type: 'datetime-local', name: 'agendarParaLocal', required: true, value: valorHorario,
      'aria-describedby': 'pub-real-fuso-ajuda pub-real-horario-resumo', onchange: () => { liberarPreview(); atualizarResumoHorario(); }, oninput: atualizarResumoHorario });
    const resumoHora = h('p', { class: 'pub-real-horario-resumo', id: 'pub-real-horario-resumo', role: 'status', 'aria-live': 'polite' });
    const previaBtn = h('button', { class: 'botao botao-primario', type: 'button', 'data-operacao': true,
      'data-acao-previa': true, texto: 'Gerar prévia dos destinos', disabled: ocupado || !peca || !destinosSelecionados().length,
      onclick: () => gerarPrevia() });
    compositor.replaceChildren(
      h('h2', { class: 'secao-titulo', id: 'pub-real-compor-titulo', texto: 'Preparar publicação' }),
      h('p', { class: 'pub-real-aviso', texto: 'Escolha onde e quando publicar. Depois, confira as imagens e a legenda antes de confirmar o agendamento.' }),
      estadoDaPausa(),
      h('div', { class: 'pub-real-compositor-conteudo' },
        h('fieldset', { class: 'pub-real-selecao' }, h('legend', { texto: '1 · Peça aprovada vigente' }), cardsPecas),
        h('fieldset', { class: 'pub-real-selecao' }, h('legend', { texto: '2 · Contas e formatos disponíveis' }),
          capacidades.controles?.habilitado === false ? h('p', { class: 'alerta alerta-atencao', texto: 'A publicação remota está desabilitada no servidor.' }) : null,
          h('div', { class: 'pub-real-contas' }, contas)),
        h('fieldset', { class: 'pub-real-selecao pub-real-horario' },
          h('legend', { texto: '3 · Data e hora' }),
          h('label', { for: 'pub-real-agendar-para', texto: `Agendar em ${FUSO_PUBLICACAO}` }),
          hora, h('small', { id: 'pub-real-fuso-ajuda', class: 'campo-ajuda', texto: 'Use o horário de Brasília, mesmo se o seu computador estiver em outro fuso.' }),
          resumoHora)),
      h('div', { class: 'pub-real-acoes' }, previaBtn,
        h('span', { class: 'campo-ajuda', texto: 'A data editorial é uma sugestão. Revise horário e destinos antes de gerar a prévia.' })));
    hora.id = 'pub-real-agendar-para';
    atualizarResumoHorario();
  }

  // Pausa visível ANTES da prévia (não só depois do erro), com Retomar ali mesmo.
  function estadoDaPausa() {
    const c = capacidades.controles;
    const ligadas = [
      c.pausaGlobal ? ['global', null, 'Pausa geral', c.revisao] : null,
      c.pausaInstagram ? ['instagram', null, 'Pausa do Instagram', c.revisao] : null,
      c.pausaFacebook ? ['facebook', null, 'Pausa do Facebook', c.revisao] : null,
      ...capacidades.contas.filter((a) => a.pausada).map((a) => ['conta', a.contaId, `Pausa da conta ${a.rotulo}`, a.revisao]),
    ].filter(Boolean);
    if (!ligadas.length) return h('p', { class: 'pub-real-pausa-estado campo-ajuda', role: 'status', texto: 'Publicação ativa: nenhuma pausa ligada.' });
    return h('div', { class: 'alerta alerta-atencao pub-real-pausa-estado', role: 'alert' },
      h('p', { texto: `${ligadas.map((l) => l[2]).join(', ')} ${ligadas.length === 1 ? 'está ligada' : 'estão ligadas'}: nada é preparado nem publicado enquanto houver pausa. Retome para agendar.` }),
      h('div', { class: 'bloco-acao' }, ligadas.map(([escopo, contaId, rotulo, revisao]) =>
        botao(`Retomar ${rotulo.replace(/^Pausa (d[aoe] )?/, '').replace(/^geral$/, 'tudo')}`, () => mudarPausa(escopo, contaId, true, revisao, rotulo), { disabled: !c.habilitado }))));
  }

  async function atualizarTudo() {
    if (ocupado || encerrada) return;
    busy(true);
    disponibilidade.replaceChildren(h('p', { class: 'campo-ajuda', role: 'status', texto: 'Conferindo contrato real, catálogo aprovado e fila…' }));
    try {
      const [cap, cat, feed, page1] = await Promise.all([
        cliente.capacidades(), cliente.catalogo(),
        ctx.api('/api/marketing/feed'), integracao ? integracao.listar() : cliente.listar({ limite: 20 }),
      ]);
      if (encerrada || ctx.obsoleta()) return;
      capacidades = cap;
      catalogo = cat;
      const listaFeed = feed?.dados?.pecas || feed?.dados?.itens || [];
      feedPorPeca = new Map(listaFeed.filter((p) => p && typeof p.id === 'string').map((p) => [p.id, p]));
      pagina = page1;
      pilhaCursor = [];
      jobs = page1.jobs;
      notarMudancas(jobs);
      vigiar();
      const validos = new Set(catalogo.pecas.map((p) => p.id));
      if (!validos.has(selecaoPeca)) selecaoPeca = catalogo.pecas[0]?.id || '';
      selecaoDestinos = new Set([...selecaoDestinos].filter((key) => {
        const [contaId, formato] = key.split('\u001f');
        const conta = capacidades.contas.find((c) => c.contaId === contaId);
        return !!conta && capacidadeDaConta(conta, formato).disponivel;
      }));
      disponibilidade.replaceChildren(
        h('p', { class: 'pub-real-dado-real', texto: `CONTRATO REAL · ${plural(cap.contas.length, 'conta', 'contas')} · ${plural(catalogo.pecas.length, 'peça aprovada', 'peças aprovadas')} · fila ${page1.limitado ? 'parcial' : 'consultada'}` }),
        h('p', { class: 'campo-ajuda', texto: 'O navegador não envia IDs de conta digitados, URLs remotas ou dados de autorização.' }));
      desenharControles();
      desenharCompositor();
      desenharLista();
      if (!feedPorPeca.size && catalogo.pecas.length) avisar('O catálogo foi carregado, mas a fonte de miniaturas do Feed está indisponível. Não confirme sem uma prévia visual completa.', true);
      else avisar('Dados reais carregados do admin-local. Nenhuma publicação foi enviada ao carregar esta tela.');
    } catch (err) {
      if (encerrada || ctx.obsoleta()) return;
      capacidades = catalogo = pagina = null;
      jobs = [];
      disponibilidade.replaceChildren(h('div', { class: 'estado-ausente' },
        h('h2', { texto: 'Agendamento real indisponível' }),
        h('p', { texto: 'O servidor não confirmou todos os contratos reais necessários. A tela não presumiu contas, capacidades nem fila vazia.' }),
        botao('Tentar novamente', () => atualizarTudo())));
      compositor.replaceChildren(); controles.replaceChildren(); lista.replaceChildren();
      erroLegivel(err, 'A leitura do agendamento real');
    } finally { busy(false); }
  }

  function desenharControles() {
    if (!capacidades) return;
    const c = capacidades.controles;
    const global = pausaConfig('global', 'Pausa global', c.pausaGlobal, c.revisao);
    const facebook = pausaConfig('facebook', 'Facebook', c.pausaFacebook, c.revisao);
    const instagram = pausaConfig('instagram', 'Instagram', c.pausaInstagram, c.revisao);
    const contas = capacidades.contas.map((a) => pausaConfig('conta', a.rotulo, a.pausada, a.revisao, a.contaId, a.rede));
    controles.replaceChildren(h('section', { class: 'secao pub-real-pausas', 'aria-labelledby': 'pub-real-pausas-titulo' },
      h('h2', { class: 'secao-titulo', id: 'pub-real-pausas-titulo', texto: 'Controles de pausa' }),
      h('p', { class: 'campo-ajuda', texto: 'Pausar interrompe novas etapas elegíveis; não cancela jobs e não garante que um efeito já iniciado pare.' }),
      h('div', { class: 'pub-real-pausas-grid' }, [global, facebook, instagram, ...contas])));
  }

  function pausaConfig(escopo, rotulo, pausada, revisao, contaId = null, rede = '') {
    const identificador = contaId == null ? escopo : `${escopo}:${contaId}`;
    const status = pausada ? 'Pausada' : 'Ativa';
    return h('article', { class: 'pub-real-pausa cartao' },
      h('div', null, h('h3', { texto: rotulo }), h('p', { texto: `${rede ? `${REDES[rede]} · ` : ''}${status} · revisão ${revisao}` })),
      botao(pausada ? 'Retomar' : 'Pausar', () => mudarPausa(escopo, contaId, pausada, revisao, rotulo), { disabled: ocupado || !capacidades.controles.habilitado }));
  }

  async function mudarPausa(escopo, contaId, pausada, revisaoEsperada, rotulo) {
    const acao = pausada ? 'retomar' : 'pausar';
    const { k: chaveIntencao, idempotencia } = chaveDe('pausa', acao, escopo, contaId || '', revisaoEsperada);
    const campos = { escopo, revisaoEsperada, idempotencia, confirmacao: true, ...(contaId ? { contaId } : {}) };
    const resumo = `${pausada ? 'Retomar' : 'Pausar'} ${rotulo}. Estado atual: ${pausada ? 'pausada' : 'ativa'}. Revisão ${revisaoEsperada}.`;
    const ok = await ctx.confirmar({ titulo: `${pausada ? 'Retomar' : 'Pausar'} ${rotulo}?`, texto: resumo,
      detalhes: ['O servidor valida MFA local recente e CSRF.', 'A pausa não cancela jobs existentes nem resolve estado incerto.'],
      rotuloBotao: `${pausada ? 'Retomar' : 'Pausar'} ${rotulo}` });
    if (!ok || ctx.obsoleta() || ocupado) return;
    await executarComando(acao, campos, { idempotencia, chaveIntencao, rotulo: resumo });
  }

  function desenharLista() {
    if (!pagina) return;
    const filtros = h('div', { class: 'pub-real-filtros', role: 'group', 'aria-label': 'Filtros da página carregada' });
    const estado = h('select', { 'aria-label': 'Filtrar por estado', onchange: () => filtrarPagina() },
      h('option', { value: '', texto: 'Todos os estados desta página' }), Object.entries(ROTULOS_ESTADO).map(([v, t]) => h('option', { value: v, texto: t })));
    const rede = h('select', { 'aria-label': 'Filtrar por rede', onchange: () => filtrarPagina() },
      h('option', { value: '', texto: 'Todas as redes desta página' }), Object.entries(REDES).map(([v, t]) => h('option', { value: v, texto: t })));
    const de = h('input', { type: 'date', 'aria-label': 'Agendados a partir de', onchange: () => filtrarPagina() });
    const ate = h('input', { type: 'date', 'aria-label': 'Agendados até', onchange: () => filtrarPagina() });
    filtros.append(h('label', null, 'Estado', estado), h('label', null, 'Rede', rede), h('label', null, 'De', de), h('label', null, 'Até', ate),
      h('span', { class: 'campo-ajuda', texto: 'Filtros aplicados somente aos registros da página recebida.' }));
    const resultados = h('div', { class: 'publicacoes-lista pub-real-jobs' });
    const paginacao = h('div', { class: 'pub-real-paginacao' });
    const filtrado = () => jobs.filter((j) => (!estado.value || j.estado === estado.value)
      && (!rede.value || j.destino.rede === rede.value)
      && (!de.value || horarioUtcParaLocal(j.destino.publicarEm).slice(0, 10) >= de.value)
      && (!ate.value || horarioUtcParaLocal(j.destino.publicarEm).slice(0, 10) <= ate.value));
    function filtrarPagina() { montarResultados(filtrado()); }
    function montarResultados(itens) {
      resultados.replaceChildren(...(itens.length ? itens.map((j) => cartaoJob(j, false)) : [h('p', { class: 'texto-fraco', texto: jobs.length ? 'Nenhum registro desta página corresponde aos filtros.' : 'A consulta real retornou zero jobs nesta página.' })]));
    }
    const botoesPagina = () => paginacao.replaceChildren(
      botao('Página anterior', async () => {
        if (!pilhaCursor.length || ocupado) return;
        const cursor = pilhaCursor.pop();
        await carregarPagina(cursor, false);
      }, { disabled: !pilhaCursor.length }),
      h('span', { class: 'campo-ajuda', texto: `Até ${plural(jobs.length, 'job', 'jobs')} · ${pagina.limitado ? 'consulta limitada' : 'fim da fila'}` }),
      botao('Próxima página', async () => {
        if (!pagina.proximoCursor || ocupado) return;
        pilhaCursor.push(pagina.cursorAtual || '');
        await carregarPagina(pagina.proximoCursor, true);
      }, { disabled: !pagina.proximoCursor }));
    const mais = h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar fila real', 'data-operacao': true, onclick: () => atualizarTudo() });
    lista.replaceChildren(h('h2', { class: 'secao-titulo', id: 'pub-real-lista-titulo', texto: 'Fila real e recibos' }),
      h('p', { class: 'campo-ajuda', texto: 'Um job por destino. Estados diferentes no mesmo lote permanecem independentes e são resumidos como parciais.' }), filtros, mais, resultados, paginacao);
    montarResultados(filtrado());
    botoesPagina();
  }

  async function carregarPagina(cursor, empilhar) {
    if (ocupado) return;
    busy(true);
    try {
      const nova = await cliente.listar({ limite: 20, ...(cursor ? { cursor } : {}) });
      if (encerrada || ctx.obsoleta()) return;
      pagina = { ...nova, cursorAtual: cursor || null };
      jobs = nova.jobs;
      detalhe = null;
      detalheEl.hidden = true;
      desenharLista();
      avisar(`Página recebida: ${plural(jobs.length, 'job', 'jobs')}.`);
    } catch (err) { if (!encerrada && !ctx.obsoleta()) erroLegivel(err, 'A consulta da próxima página'); }
    finally { busy(false); }
  }

  function cartaoJob(job, emDetalhe) {
    const nome = nomeDestino(job.destino);
    const resumoHora = rotuloDataHorario(job.destino.publicarEm, job.destino.fuso || FUSO_PUBLICACAO);
    const resumo = resumirLote(jobs.filter((j) => j.loteId === job.loteId));
    const acoes = [];
    acoes.push(botao('Ver recibos', () => consultarDetalhe(job.jobId)));
    if (job.estado === 'precisa-conferir' || job.estado === 'cancelamento-pendente') {
      acoes.push(botao('Reconciliar estado', () => confirmarComando(job, 'reconciliar')));
    }
    if (ESTADOS_ATIVOS.has(job.estado) && job.estado !== 'agendado-na-meta' && job.estado !== 'preparando') {
      acoes.push(botao('Reagendar horário', () => abrirReagendamento(job)));
    }
    if (!ESTADOS_TERMINAIS.has(job.estado) && job.estado !== 'cancelamento-pendente' && job.estado !== 'precisa-conferir') {
      acoes.push(botao('Cancelar destino', () => confirmarComando(job, 'cancelar'), { perigo: true }));
    }
    const recibos = emDetalhe ? h('ol', { class: 'pub-real-recibos', 'aria-label': 'Recibos deste destino' }, job.recibos.length
      ? job.recibos.map((r) => h('li', null,
        h('strong', { texto: `${r.operacao} · ${r.estado}` }),
        h('span', { texto: `${r.iniciadoEm}${r.terminadoEm ? ` → ${r.terminadoEm}` : ''}` }),
        r.codigo ? h('code', { texto: r.codigo }) : null,
        r.remotoId ? h('span', { texto: `Referência remota: ${r.remotoId}` }) : null))
      : h('li', { texto: job.recibosLimitados ? 'Este detalhe não contém recibos; recarregue o detalhe para conferir.' : 'Nenhum recibo registrado.' })) : null;
    return h('article', { class: `cartao pub-real-job estado-${job.estado}` },
      integracao && !integracao.vinculado(job) ? h('p', { class: 'campo-ajuda', texto: 'Sem vínculo editorial exato com peça e versão deste mês. O destino e os recibos reais foram preservados.' }) : null,
      h('div', { class: 'pub-real-job-topo' },
        h('div', null, h('span', { class: `pub-real-rede pub-real-${job.destino.rede}`, texto: REDES[job.destino.rede] || job.destino.rede }),
          h('h3', { texto: nome }), h('p', { texto: `${FORMATOS[job.destino.formato]} · ${resumoHora}` })),
        h('strong', { class: 'pub-real-estado', texto: ROTULOS_ESTADO[job.estado] || 'Estado não reconhecido' })),
      h('p', { class: 'pub-real-parcial', texto: resumo.parcial ? `${resumo.rotulo} · lote ${resumo.total} destinos` : `${resumo.rotulo} · 1 destino` }),
      h('p', { class: 'pub-real-atualizado', texto: `Atualizado ${quandoCurto(Date.parse(job.atualizadoEm))} · revisão ${job.revisao}` }),
      (() => {
        const d = descreverJobReal(job);
        const frase = [d.atencao ? `${d.texto}.` : null, d.motivo, d.atencao ? d.acao : null].filter(Boolean).join(' ');
        return frase || job.codigoErro ? h('p', { class: d.atencao ? 'pub-real-erro' : 'campo-ajuda', role: d.atencao ? 'alert' : null },
          frase || 'A rede informou um código.', job.codigoErro ? [' ', h('small', { class: 'pub-real-codigo', texto: `Código: ${job.codigoErro}` })] : null) : null;
      })(),
      job.estado === 'publicado' ? h('p', { class: 'pub-real-publicado', texto: job.remotoId ? `Publicado · ID confirmado ${job.remotoId}` : 'Publicado segundo o recibo remoto.' }) : null,
      linkSeguro(job.permalink) ? h('a', { class: 'botao botao-fantasma', href: linkSeguro(job.permalink), target: '_blank', rel: 'noopener noreferrer', texto: 'Abrir publicação confirmada' }) : null,
      job.estado === 'publicado' && !linkSeguro(job.permalink) ? h('p', { class: 'campo-ajuda', texto: 'O link da publicação não está disponível nesta fonte. Consulte o ID e o recibo.' }) : null,
      job.recibosLimitados && !emDetalhe ? h('p', { class: 'campo-ajuda', texto: 'A lista mostra somente os recibos recentes. Abra o detalhe para conferir até 50.' }) : null,
      emDetalhe ? recibos : null,
      h('div', { class: 'pub-real-job-acoes' }, acoes));
  }

  async function gerarPrevia() {
    const peca = pecaSelecionada();
    const destinos = destinosSelecionados();
    const input = compositor.querySelector('[name="agendarParaLocal"]');
    if (!peca || !destinos.length || !input?.value || ocupado) return;
    // O relógio anda: o horário é conferido de novo no clique, não só quando foi digitado.
    const horario = horarioConferido(input.value);
    if (!horario.ok) { atualizarResumoHorario(); avisar(horario.texto, true); return; }
    liberarPreview();
    busy(true);
    avisar('Validando aceite, mídia, destinos e horário no servidor…');
    try {
      const resultado = await cliente.prever({ peca, destinos, horarioLocal: input.value, contas: capacidades.contas });
      if (encerrada || ctx.obsoleta()) return;
      previa = resultado;
      const dadosMidia = await lerSnapshotVerificado(resultado);
      if (encerrada || ctx.obsoleta()) { dadosMidia.urls.forEach((x) => URL.revokeObjectURL(x)); return; }
      previewBlobs = dadosMidia.urls;
      previaVistas = false;
      desenharPrevia(resultado, dadosMidia);
      avisar(previaConfirmavel(resultado) ? 'Prévia real carregada e mídia/legenda verificadas. Revise todos os destinos para habilitar a confirmação.' : 'A prévia real está bloqueada por estado, capacidade, revisão ou expiração. Confira os motivos abaixo.', !previaConfirmavel(resultado));
    } catch (err) {
      if (!encerrada && !ctx.obsoleta()) {
        liberarPreview();
        desenharErroPrevia(err);
        erroLegivel(err, 'A prévia');
      }
    } finally { busy(false); }
  }

  async function lerSnapshotVerificado(p) {
    const s = p.snapshot;
    if (!s || !Array.isArray(s.midias) || typeof s.legenda !== 'string' || !s.legendaSha256) throw new Error('snapshot-incompleto');
    const urls = [];
    const sha = async (buf) => {
      if (!crypto?.subtle) throw new Error('verificacao-de-midia-indisponivel');
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
    };
    if (await sha(new TextEncoder().encode(s.legenda)) !== s.legendaSha256.toLowerCase()) throw new Error('legenda-divergente');
    const midias = [...s.midias].sort((a, b) => a.ordem - b.ordem);
    const ordens = midias.map((m) => m.ordem);
    if (ordens.some((n, i) => !Number.isInteger(n) || n < 0 || (i && n <= ordens[i - 1])) || midias.length > 10) throw new Error('ordem-de-midia-invalida');
    try {
      const prontas = [];
      for (let i = 0; i < midias.length; i++) {
        const m = midias[i];
        if (!MIME_OK.has(m.mime) || (m.tipo === 'video' ? m.mime !== 'video/mp4' : !m.mime.startsWith('image/'))) throw new Error('mime-de-midia-invalido');
        const blob = await baixarMidia(caminhoMidia(p.previaId, i), m.mime);
        if (await sha(await blob.arrayBuffer()) !== String(m.sha256 || '').toLowerCase()) throw new Error('hash-de-midia-divergente');
        const url = URL.createObjectURL(blob); urls.push(url);
        prontas.push({ url, tipo: m.tipo, mime: m.mime, ordem: m.ordem });
      }
      let capa = null;
      if (s.capa) {
        if (!MIME_OK.has(s.capa.mime) || !s.capa.mime.startsWith('image/')) throw new Error('mime-de-capa-invalido');
        const blob = await baixarMidia(caminhoMidia(p.previaId, 'capa'), s.capa.mime);
        if (await sha(await blob.arrayBuffer()) !== String(s.capa.sha256 || '').toLowerCase()) throw new Error('hash-de-capa-divergente');
        capa = { url: URL.createObjectURL(blob), tipo: 'imagem', mime: s.capa.mime };
        urls.push(capa.url);
      }
      return { urls, midias: prontas, capa };
    } catch (err) { urls.forEach((x) => URL.revokeObjectURL(x)); throw err; }
  }

  async function baixarMidia(url, mimeEsperado) {
    const controller = new AbortController();
    controladores.add(controller);
    try {
      const resposta = await fetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: mimeEsperado, 'X-Grana-Admin': '1' }, signal: controller.signal });
      if (!resposta.ok) throw Object.assign(new Error(`O servidor não liberou a mídia verificada (${resposta.status}).`), { status: resposta.status, codigo: 'midia-indisponivel' });
      const mime = (resposta.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (mime !== mimeEsperado) throw new Error('mime-de-midia-divergente');
      return await resposta.blob();
    } finally { controladores.delete(controller); }
  }

  function desenharPrevia(p, dadosMidia) {
    const peca = pecaSelecionada();
    const detalhePrevia = [];
    const motivo = [...(p.snapshot?.motivos || []), ...(p.destinos || []).flatMap((d) => d.motivos || [])];
    const alvos = destinosSelecionados();
    const cards = alvos.map((alvo, i) => {
      const retorno = p.destinos[i];
      const conta = contaPorId(alvo.contaId, alvo.rede);
      const dataDestino = retorno?.publicarEm || p.snapshot?.destino?.publicarEm || p.agendarPara;
      const { elemento: media } = montarMidia(h, {
        titulo: peca?.titulo || 'Peça aprovada', midias: dadosMidia.midias.map((m) => ({ url: m.url, tipo: m.tipo })),
        capa: dadosMidia.capa, ehVideo: retorno?.formato === 'reels', legenda: p.snapshot.legenda,
      });
      return h('article', { class: 'pub-real-previa-destino cartao' },
        topoDaPrevia(h, { nome: conta?.rotulo || retorno?.nome || 'Conta conectada', formato: FORMATOS[alvo.formato] || alvo.formato,
          plataforma: alvo.rede, aoFechar: null }),
        h('p', { class: 'pub-real-previa-horario', texto: `${REDES[alvo.rede]} · ${FORMATOS[alvo.formato]} · ${rotuloDataHorario(dataDestino || p.agendarPara)}` }),
        h('div', { class: 'pub-real-previa-corpo' }, media,
          h('div', { class: 'feed-legenda' }, h('b', { texto: conta?.rotulo || 'grana.' }), h('p', { class: 'pub-real-legenda', texto: p.snapshot.legenda }))),
        retorno?.estado === 'pronto' ? h('p', { class: 'pub-real-pronto', texto: 'Este destino passou pela validação.' })
          : h('p', { class: 'pub-real-erro', role: 'alert', texto: `Este destino não pode ser agendado: ${motivos(retorno?.motivos || ['estado-nao-pronto'])}` }));
    });
    const coerente = p.snapshot?.pecaId === peca?.id && p.snapshot?.versao === peca?.versao
      && p.destinos?.length === alvos.length && p.destinos.every((d, i) => d.contaId === alvos[i].contaId && d.rede === alvos[i].rede && d.formato === alvos[i].formato);
    const botaoConfirmar = h('button', { class: 'botao botao-primario', type: 'button', 'data-operacao': true,
      texto: 'Confirmar agendamento real', disabled: true, 'data-bloqueado': 'true',
      'aria-describedby': 'pub-real-bloqueio-confirmacao', onclick: () => confirmarPrevia(p) });
    const prazo = h('div', { class: 'pub-real-prazo', 'aria-live': 'polite' });
    previaElRevisao(p, detalhePrevia);
    previewEl.hidden = false;
    previewEl.replaceChildren(
      h('h2', { class: 'secao-titulo', tabindex: '-1', texto: 'Prévia estimada por destino' }),
      h('p', { class: 'pub-real-aviso', texto: 'Confira como a publicação deve aparecer em cada rede. Revise as imagens, a ordem e a legenda antes de confirmar.' }),
      h('p', { class: 'pub-real-versao', texto: `${peca?.titulo || 'Peça'} · versão aprovada` }),
      h('div', { class: 'pub-real-previews' }, cards),
      ...(motivo.length ? [h('div', { class: 'alerta alerta-atencao', role: 'alert' }, h('strong', { texto: 'Esta prévia não pode ser confirmada' }),
        h('ul', null, [...new Set(motivo)].map((m) => h('li', null, motivos([m]), ' ', h('small', { class: 'pub-real-codigo', texto: `Código: ${typeof m === 'string' ? m : m?.codigo || 'sem-codigo'}` })))))] : []),
      ...(coerente ? [] : [h('p', { class: 'pub-real-erro', role: 'alert', texto: 'A resposta não corresponde a todos os destinos e versões escolhidos. Atualize a lista antes de confirmar.' })]),
      h('div', { class: 'pub-real-confirmacao-resumo' },
        h('h3', { texto: 'Resumo exato da autorização' }),
        h('ul', null, alvos.map((a, i) => h('li', { texto: `${nomeDestino(a)} · ${REDES[a.rede]} · ${FORMATOS[a.formato]} · ${rotuloDataHorario(p.destinos?.[i]?.publicarEm || p.agendarPara)}` }))),
        h('p', { texto: 'Esta legenda e estas imagens serão publicadas automaticamente no horário escolhido, somente após confirmar.' })),
      h('label', { class: 'pub-real-declaracao' }, h('input', { type: 'checkbox', name: 'confirmacaoVisual', checked: previaVistas,
        disabled: !coerente || !previaConfirmavel(p), onchange: (e) => { previaVistas = e.target.checked; atualizarBotaoConfirmar(); } }),
        'Revisei a mídia, a legenda e cada destino acima.'),
      h('p', { id: 'pub-real-bloqueio-confirmacao', class: 'campo-ajuda', texto: 'A confirmação só libera quando a prévia estiver válida, vigente e todos os destinos estiverem revisados.' }),
      prazo,
      botaoConfirmar);
    previewEl.querySelector('h2').focus();
    // R6: a prévia vale 10 min no servidor. Contagem visível; vencida, Confirmar trava e "Gerar outra prévia"
    // refaz com a mesma seleção e horário.
    const expira = Date.parse(p.expiraEm || '');
    function tique() {
      const restante = expira - Date.now();
      if (Number.isFinite(restante) && restante > 0) {
        const min = Math.ceil(restante / 60000);
        prazo.replaceChildren(h('span', { texto: min <= 1 ? 'A prévia vale por menos de 1 minuto.' : `A prévia vale por mais ${min} min.` }));
        return;
      }
      clearInterval(relogioPrevia); relogioPrevia = null;
      prazo.replaceChildren(h('span', { role: 'alert', texto: 'A prévia venceu. Gere outra para confirmar; a seleção e o horário continuam os mesmos.' }),
        botao('Gerar outra prévia', () => gerarPrevia(), { primario: true }));
      atualizarBotaoConfirmar();
      previewEl.querySelector('[name="confirmacaoVisual"]')?.setAttribute('disabled', '');
    }
    tique();
    relogioPrevia = setInterval(tique, 5000);
    // data-bloqueado sobrevive ao busy(false), que reabilita os demais botões de operação.
    function atualizarBotaoConfirmar() {
      const bloqueado = !coerente || !previaConfirmavel(p) || !previaVistas;
      botaoConfirmar.dataset.bloqueado = String(bloqueado);
      botaoConfirmar.disabled = ocupado || bloqueado;
    }
    atualizarBotaoConfirmar();
  }

  function previaElRevisao(p, destino) {
    destino.push(`Prévia ${p.previaId} expira ${p.expiraEm}.`, `Horário de confirmação: revisão ${p.revisao}.`);
  }

  function desenharErroPrevia(err) {
    previewEl.hidden = false;
    const { frase, codigo } = mensagemHumana(err);
    previewEl.replaceChildren(h('h2', { class: 'secao-titulo', texto: 'Não foi possível gerar a prévia' }),
      h('p', { class: 'pub-real-erro', role: 'alert' }, frase, ' ', h('small', { class: 'pub-real-codigo', texto: `Código: ${codigo}` })),
      h('p', { class: 'campo-ajuda', texto: 'Nada foi agendado. Depois de resolver, gere a prévia de novo.' }),
      botao('Gerar outra prévia', () => gerarPrevia(), { primario: true }));
  }

  async function confirmarPrevia(p) {
    if (!previaVistas || p !== previa || !previaConfirmavel(p) || ocupado) return;
    const destinos = destinosSelecionados();
    const { k: chaveIntencao, idempotencia } = chaveDe('confirmar', p.previaId, p.previaHash, p.revisao);
    const data = p.destinos?.[0]?.publicarEm || p.agendarPara;
    const sumario = [
      `Peça: ${pecaSelecionada()?.titulo || 'indisponível'} · versão aprovada`,
      ...destinos.map((d) => `${nomeDestino(d)} · ${REDES[d.rede]} · ${FORMATOS[d.formato]}`),
      `Publica ${quandoCurto(Date.parse(data))}. Cada destino segue independente: se um falhar, o outro continua.`,
      `A prévia vale até ${quandoCurto(Date.parse(p.expiraEm)).replace(/^às /, '')}.`,
    ];
    const ok = await ctx.confirmar({ titulo: 'Confirmar publicação real?',
      texto: 'Esta confirmação cria um job para cada destino e autoriza execução futura. Ações reais exigem MFA local recente e validação do servidor.',
      detalhes: sumario, rotuloBotao: 'Autorizar agendamento real' });
    if (!ok || ctx.obsoleta() || ocupado || p !== previa) return;
    pendencia = { idempotencia, previaId: p.previaId, tipo: 'confirmar' };
    busy(true);
    try {
      const lote = await cliente.confirmar(p, idempotencia);
      if (encerrada || ctx.obsoleta()) return;
      pendencia = null;
      intencoes.delete(chaveIntencao);
      liberarPreview();
      // R9: fecha a janela, diz em uma linha o que foi agendado e leva ao mês da publicação no Calendário.
      const redes = [...new Set(destinos.map((d) => REDES[d.rede]))].join(' e ');
      const texto = `Agendado: ${redes}, ${quandoCurto(Date.parse(data)).replace(/^às /, 'hoje às ')}. Acompanhe o andamento no Calendário.`;
      avisar(texto);
      ctx.aviso?.(texto, 'ok');
      estadosVistos.clear(); for (const j of lote.jobs) estadosVistos.set(j.jobId, j.estado);
      compositor.closest?.('dialog')?.close?.();
      const mesAlvo = horarioUtcParaLocal(data).slice(0, 7);
      if (integracao && ctx.params?.mes && ctx.params.mes !== mesAlvo) ctx.navegar?.(`#/marketing/calendario?mes=${mesAlvo}`);
      await atualizarFilaSemBloquear();
      recibo.focus?.();
    } catch (err) {
      if (encerrada || ctx.obsoleta()) return;
      if (resultadoIncerto(err)) {
        avisar(`Resultado da confirmação desconhecido. A chave idempotente ${idempotencia} foi preservada. Consulte o resultado antes de repetir; nenhuma nova chave será criada automaticamente.`, true);
        desenharConsultaPendente();
      } else {
        pendencia = null;
        intencoes.delete(chaveIntencao);
        erroLegivel(err, 'A confirmação do agendamento');
        if (err?.status === 409 || err?.status === 422) await atualizarTudo();
      }
    } finally { busy(false); }
  }

  function resultadoIncerto(err) { return ['resultado-desconhecido', 'prazo-esgotado', 'rede', 'prazo'].includes(err?.codigo) || !err?.status; }

  function desenharConsultaPendente() {
    const anterior = raiz.querySelector('.pub-real-consulta-pendente');
    anterior?.remove();
    const caixa = integracao && pendencia?.tipo === 'confirmar' ? integracao.painel : disponibilidade;
    caixa.appendChild(h('div', { class: 'pub-real-consulta-pendente', role: 'alert' },
      h('p', { texto: 'A resposta se perdeu. Consulte pela mesma chave antes de tentar qualquer operação.' }),
      botao('Consultar resultado pendente', () => consultarPendente(), { operacao: false })));
  }

  async function consultarPendente() {
    if (!pendencia || ocupado) return;
    busy(true);
    try {
      const d = await cliente.consultar({ idempotencia: pendencia.idempotencia });
      if (encerrada || ctx.obsoleta()) return;
      jobs = d.jobs;
      pendencia = null;
      raiz.querySelector('.pub-real-consulta-pendente')?.remove();
      desenharLista();
      avisar(d.jobs.length ? `Resultado conferido pela chave idempotente: ${resumirLote(d.jobs).rotulo}.` : 'A chave ainda não tem recibo consultável. Não repita a confirmação; atualize e aguarde a fonte responder.', !d.jobs.length);
      if (d.jobs.length) await atualizarFilaSemBloquear();
    } catch (err) { if (!encerrada && !ctx.obsoleta()) erroLegivel(err, 'A consulta pela chave preservada'); }
    finally { busy(false); }
  }

  async function confirmarComando(job, acao) {
    const conta = nomeDestino(job.destino);
    const horario = rotuloDataHorario(job.destino.publicarEm);
    const verbos = { cancelar: 'cancelar', reconciliar: 'reconciliar o estado de' };
    const { k: chaveIntencao, idempotencia } = chaveDe(acao, job.jobId, job.revisao);
    const ok = await ctx.confirmar({ titulo: `${verbos[acao]} este destino?`,
      texto: `${conta} · ${REDES[job.destino.rede]} · ${FORMATOS[job.destino.formato]} · ${horario}. Revisão ${job.revisao}.`,
      detalhes: [acao === 'reconciliar' ? 'A consulta não inicia outra publicação.' : 'A solicitação não apaga uma publicação já confirmada.', 'O servidor valida MFA local recente e CSRF.'],
      rotuloBotao: acao === 'cancelar' ? 'Solicitar cancelamento' : 'Reconciliar agora', perigo: acao === 'cancelar' });
    if (!ok || ctx.obsoleta() || ocupado) return;
    await executarComando(acao, { jobId: job.jobId, revisaoEsperada: job.revisao,
      idempotencia, confirmacao: true }, { idempotencia, chaveIntencao, jobId: job.jobId, rotulo: `${acao} · ${conta}` });
  }

  async function abrirReagendamento(job) {
    const localAtual = horarioUtcParaLocal(job.destino.publicarEm);
    const novaHora = await ctx.formulario({ titulo: 'Reagendar somente o horário',
      texto: 'O conteúdo, a versão e os destinos ficam imutáveis. A alteração preserva o job anterior e o histórico de recibos; se um efeito já começou, o servidor recusará esta operação.',
      rotuloBotao: 'Conferir novo horário', campos: [
        { nome: 'agendarParaLocal', rotulo: `Novo horário (${FUSO_PUBLICACAO})`, tipo: 'datetime-local', valor: localAtual, obrigatorio: true },
      ] });
    if (!novaHora || ocupado || ctx.obsoleta()) return;
    let agendarPara;
    try { agendarPara = horarioLocalParaUtc(novaHora.agendarParaLocal); }
    catch (err) { avisar(err.message, true); return; }
    const { k: chaveIntencao, idempotencia } = chaveDe('reagendar', job.jobId, job.revisao, agendarPara);
    const novoRotulo = rotuloDataHorario(agendarPara);
    const ok = await ctx.confirmar({ titulo: 'Confirmar novo horário?',
      texto: `${nomeDestino(job.destino)} · ${REDES[job.destino.rede]} · ${FORMATOS[job.destino.formato]}.`,
      detalhes: [`Anterior: ${rotuloDataHorario(job.destino.publicarEm)}`, `Novo: ${novoRotulo}`, `Job ${job.jobId} · revisão ${job.revisao}`,
        'Apenas horário é alterado. Alterar conteúdo ou destino exige novo aceite e outra confirmação.'],
      rotuloBotao: 'Reagendar destino' });
    if (!ok || ocupado || ctx.obsoleta()) return;
    await executarComando('reagendar', { jobId: job.jobId, revisaoEsperada: job.revisao,
      agendarPara, fuso: FUSO_PUBLICACAO, idempotencia, confirmacao: true }, { idempotencia, chaveIntencao, jobId: job.jobId, rotulo: `reagendar · ${novoRotulo}` });
  }

  async function executarComando(acao, campos, metadata) {
    if (ocupado) return;
    pendencia = { ...metadata, tipo: acao };
    busy(true);
    try {
      const resultado = await cliente.comando(acao, campos);
      if (encerrada || ctx.obsoleta()) return;
      pendencia = null;
      intencoes.delete(metadata.chaveIntencao);
      avisar(`${metadata.rotulo}: resposta real recebida. Confira o estado e os recibos por destino.`);
      if (Array.isArray(resultado.jobs)) {
        const resumo = resumirLote(resultado.jobs);
        avisar(`${metadata.rotulo}: ${resumo.rotulo} · ${plural(resumo.total, 'destino', 'destinos')}.`);
      }
      await atualizarTudo();
    } catch (err) {
      if (encerrada || ctx.obsoleta()) return;
      if (resultadoIncerto(err)) {
        avisar(`${metadata.rotulo}: resultado desconhecido. A chave ${metadata.idempotencia} foi preservada. Consulte antes de repetir.`, true);
        desenharConsultaPendente();
      } else {
        pendencia = null;
        intencoes.delete(metadata.chaveIntencao);
        erroLegivel(err, metadata.rotulo);
        if ([409, 422].includes(err?.status)) await atualizarTudo();
      }
    } finally { busy(false); }
  }

  async function consultarDetalhe(jobId) {
    if (ocupado) return;
    busy(true);
    try {
      const d = await cliente.consultar({ jobId });
      if (encerrada || ctx.obsoleta()) return;
      detalhe = d;
      const loteJobs = d.jobs;
      const resumo = resumirLote(loteJobs);
      detalheEl.hidden = false;
      detalheEl.replaceChildren(h('h2', { class: 'secao-titulo', tabindex: '-1', texto: `Detalhe do lote · ${resumo.rotulo}` }),
        h('p', { class: 'campo-ajuda', texto: `${plural(loteJobs.length, 'destino', 'destinos')} · um estado e recibos independentes por job.` }),
        ...loteJobs.map((j) => cartaoJob(j, true)),
        botao('Fechar detalhe', () => { detalheEl.hidden = true; detalheEl.replaceChildren(); detalhe = null; }, { operacao: false }));
      detalheEl.querySelector('h2').focus();
      avisar(`Detalhe real carregado: ${plural(loteJobs.length, 'destino', 'destinos')}.`);
    } catch (err) { if (!encerrada && !ctx.obsoleta()) erroLegivel(err, 'A consulta dos recibos'); }
    finally { busy(false); }
  }

  async function atualizarFilaSemBloquear() {
    try {
      const novo = await (integracao ? integracao.listar() : cliente.listar({ limite: 20 }));
      if (encerrada || ctx.obsoleta()) return;
      pagina = novo; jobs = novo.jobs; pilhaCursor = [];
      desenharLista();
      notarMudancas(jobs);
    } catch (err) { if (!encerrada && !ctx.obsoleta()) erroLegivel(err, 'A atualização da fila após a ação'); }
    finally { vigiar(); }
  }

  // R9: o autor acompanha o job sem recarregar. A primeira leitura só registra; mudanças depois
  // viram aviso. Estado de atenção traz motivo e ação, e nunca sugere repetir o envio.
  function notarMudancas(lista) {
    for (const j of lista || []) {
      const antes = estadosVistos.get(j.jobId);
      estadosVistos.set(j.jobId, j.estado);
      if (!antes || antes === j.estado) continue;
      const d = descreverJobReal(j);
      if (j.estado === 'publicado') ctx.aviso?.(`${d.rede}: publicado.${d.link ? '' : ` ${d.acao}`}`, 'ok');
      else if (d.atencao) ctx.aviso?.(`${d.rede}: ${d.texto}. ${[d.motivo, d.acao].filter(Boolean).join(' ')}`, 'erro');
    }
  }
  function vigiar() {
    clearTimeout(relogioFila); relogioFila = null;
    if (encerrada || !jobs.some(jobAtivo) || globalThis.document?.visibilityState === 'hidden') return;
    relogioFila = setTimeout(async () => {
      relogioFila = null;
      if (encerrada || ctx.obsoleta()) return;
      if (ocupado) { vigiar(); return; }
      await atualizarFilaSemBloquear();
    }, INTERVALO_VIGIA_MS);
  }
  const aoMudarVisibilidade = () => {
    if (globalThis.document?.visibilityState === 'hidden') { clearTimeout(relogioFila); relogioFila = null; }
    else if (!encerrada && jobs.some(jobAtivo)) atualizarFilaSemBloquear();
  };
  globalThis.document?.addEventListener?.('visibilitychange', aoMudarVisibilidade);

  function motivos(itens) {
    if (!Array.isArray(itens) || !itens.length) return 'Motivo de bloqueio indisponível; não selecionar';
    const rotulos = {
      'midia-incompativel': 'O formato de uma imagem ou vídeo não é aceito por esta rede. Peça a preparação do arquivo no formato compatível e gere a prévia novamente.',
      'sem-leitura-de-volta': 'A rede não permite conferir o resultado deste formato automaticamente.',
      'capacidade-nao-comprovada': 'Este formato ainda não foi verificado para esta conta.',
      'formato-nao-suportado': 'Este formato não está disponível nesta rede.',
    };
    const frase = (c) => rotulos[c] || fraseDoMotivo(c) || `Motivo informado pelo servidor: ${c}.`;
    return itens.map((x) => typeof x === 'string' ? frase(x) : x?.mensagem || (x?.codigo ? frase(x.codigo) : 'motivo não identificado')).join(' · ');
  }

  function rotuloConexao(conexao, pausada) {
    const r = { verificada: 'Conexão verificada', revogada: 'Conexão revogada', expirada: 'Conexão expirada', 'nao-verificada': 'Conexão não verificada', indisponivel: 'Conexão indisponível' }[conexao] || 'Conexão desconhecida';
    return pausada ? `${r} · pausada` : r;
  }

  function uuidNovo() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    if (!crypto?.getRandomValues) throw new Error('idempotencia-indisponivel');
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  await atualizarTudo();
  const limpar = () => {
    encerrada = true;
    for (const controller of controladores) controller.abort();
    liberarPreview();
    clearTimeout(relogioFila); relogioFila = null;
    globalThis.document?.removeEventListener?.('visibilitychange', aoMudarVisibilidade);
  };
  const achar = (peca) => catalogo?.pecas.find((p) => p.id === peca.id && p.versao === peca.versao);
  // O catálogo é lido quando a tela monta. Um aceite dado depois, na mesma tela ("Aprovar esta versão",
  // 18/10), não estava nele: relê uma vez antes de recusar, com a janela já aberta mostrando a espera.
  limpar.abrirCompositor = (peca, data) => {
    const exata = achar(peca);
    if (exata) return abrirCom(exata, data);
    compositor.replaceChildren(h('p', { class: 'campo-ajuda', role: 'status', texto: 'Conferindo o catálogo aprovado com o aceite mais recente…' }));
    (async () => {
      await atualizarTudo();
      if (encerrada || ctx.obsoleta()) return;
      const relida = achar(peca);
      if (relida) { abrirCom(relida, data); return; }
      ctx.aviso('A versão selecionada não está no catálogo real vigente. Atualize e confira o aceite.', 'erro');
      compositor.closest?.('dialog')?.close?.();
    })().catch((err) => { console.warn('[publicacoes-reais-reler]', err?.codigo || 'falha'); ctx.aviso('Não foi possível reler o catálogo aprovado. Atualize a página e tente de novo.', 'erro'); });
    return true;
  };
  function abrirCom(exata, data) {
    selecaoPeca = exata.id;
    selecaoDestinos.clear();
    liberarPreview();
    desenharCompositor();
    const input = compositor.querySelector('[name="agendarParaLocal"]');
    if (input) input.value = horarioInicial(data);
    atualizarResumoHorario();
    return true;
  }
  limpar.atualizarLista = async () => {
    if (!integracao || encerrada) return;
    const nova = await integracao.listar(false);
    pagina = nova; jobs = nova.jobs; pilhaCursor = [];
    desenharLista();
  };
  return limpar;
}

function linkSeguro(valor) {
  try { const u = new URL(valor); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
