// E5 local: consumidor do contrato Harbor. Somente simulação, sem SDK ou chamada à Meta.
const API = '/api/marketing/publicacoes-simulacao';
const NOMES = {
  planejado: 'Planejado', 'programado-no-painel': 'Programado no painel',
  'agendado-na-meta': 'Agendado na Meta', preparando: 'Preparando', publicado: 'Publicado',
  'cancelamento-pendente': 'Cancelamento pendente', cancelado: 'Cancelado', falhou: 'Falhou',
  'precisa-conferir': 'Precisa conferir', bloqueado: 'Bloqueado',
};
const REDE = { global: 'Global', facebook: 'Facebook', instagram: 'Instagram' };
const HASH = /^[0-9a-f]{64}$/;
const TERMINAIS = new Set(['publicado', 'cancelado']);
const INCERTOS = new Set(['precisa-conferir', 'cancelamento-pendente']);
const pedido = (acao, campos = {}) => ({ recurso: 'publicacoes-simulacao', modo: 'simulacao', acao, ...campos });

export async function montar(raiz, ctx) {
  const { h } = ctx;
  let ocupado = false;
  let dados = null;
  const corpo = h('div', { class: 'tela-corpo publicacoes' });
  const recibo = h('p', { class: 'publicacoes-recibo', role: 'status', 'aria-live': 'polite', tabindex: '-1' });
  const detalhe = h('section', { class: 'secao publicacoes-detalhe', 'aria-label': 'Combinação e recibo', hidden: true });
  ctx.cabecalho(raiz, 'Publicação e pausa', 'SIMULAÇÃO · nenhuma publicação real. Estados e identificadores sim- não comprovam envio à Meta.', [
    h('button', { class: 'botao', type: 'button', texto: 'Atualizar', onclick: () => carregar() }),
  ]);
  raiz.append(corpo, recibo, detalhe);

  function mensagem(texto, erro = false) {
    recibo.textContent = texto;
    recibo.setAttribute('role', erro ? 'alert' : 'status');
  }
  function falhou(err) {
    const codigo = /^[a-z0-9-]{1,64}$/.test(err?.codigo || '') ? err.codigo : 'resposta-invalida';
    mensagem(`Operação não confirmada · ${API} · ${err?.status ? `HTTP ${err.status}` : 'sem resposta válida'} · ${codigo}. Atualize para conferir o estado antes de tentar outra ação.`, true);
  }
  function contrato(r) {
    if (!r?.dados || r.dados.modo !== 'simulacao') throw new Error('modo-invalido');
    return r.dados;
  }
  function ocupacao(valor) {
    ocupado = valor;
    raiz.setAttribute('aria-busy', String(valor));
    raiz.querySelectorAll('button[data-operacao]').forEach(b => { b.disabled = valor; });
  }
  const botao = (texto, onclick) => h('button', { class: 'botao', type: 'button', 'data-operacao': true, disabled: ocupado, texto, onclick });
  const destino = a => a ? `${REDE[a.rede] || a.rede} · conta ${a.conta} · ${a.formato} · ${a.estrategia} · ${ctx.dataHora(a.horario)} (hora local) · ${a.horario} (UTC)` : 'Destino indisponível';

  async function carregar() {
    if (ocupado || ctx.obsoleta()) return;
    ocupacao(true);
    try {
      const d = contrato(await ctx.api(API));
      if (d.status === 'indisponivel') {
        if (ctx.obsoleta()) return;
        dados = null;
        detalhe.hidden = true;
        detalhe.replaceChildren();
        const faltantes = Array.isArray(d.faltantes) && d.faltantes.length ? ` Faltando: ${d.faltantes.join(', ')}.` : '';
        corpo.replaceChildren(h('div', { class: 'estado-ausente' },
          h('h2', { texto: 'Publicações indisponíveis' }),
          h('p', { texto: `${d.motivo || 'Configuração remota incompleta para simulação de publicações.'}${faltantes} Nenhuma lista vazia ou pausa foi presumida.` }),
          botao('Tentar de novo', () => carregar())));
        mensagem(`SIMULAÇÃO indisponível · ${d.motivo || 'configuração incompleta'}${faltantes}`, true);
        return;
      }
      if (!Array.isArray(d.registros) || typeof d.limitado !== 'boolean'
        || !d.pausas || Object.keys(REDE).some(rede => typeof d.pausas[rede] !== 'boolean')
        || d.registros.some(j => j.modo !== 'simulacao' || !HASH.test(j.chave) || !j.alvo || !NOMES[j.estado])) throw new Error('lista-invalida');
      if (ctx.obsoleta()) return;
      dados = d;
      desenhar();
    } catch (err) {
      if (ctx.obsoleta()) return;
      dados = null;
      detalhe.hidden = true;
      detalhe.replaceChildren();
      corpo.replaceChildren(h('div', { class: 'estado-ausente' },
        h('h2', { texto: 'Publicações indisponíveis' }),
        h('p', { texto: 'Não foi possível ler o estado da simulação. Nenhuma lista vazia ou pausa foi presumida.' }),
        botao('Tentar de novo', () => carregar())));
      falhou(err);
    } finally { ocupacao(false); }
  }

  function desenhar() {
    const pausas = h('section', { class: 'secao', 'aria-label': 'Pausas da simulação' },
      h('h2', { class: 'secao-titulo', texto: 'Pausas da simulação' }),
      h('p', { texto: 'Pausar impede novos envios simulados. Não cancela agendamentos existentes; confira cada destino.' }),
      h('div', { class: 'publicacoes-pausas' }, Object.entries(REDE).map(([rede, rotulo]) => h('div', { class: 'cartao' },
        h('h3', { texto: rotulo }), h('p', { texto: dados.pausas[rede] ? 'Pausada' : 'Sem pausa neste controle' }),
        botao(dados.pausas[rede] ? `Retomar ${rotulo}` : `Pausar ${rotulo}`, () => pausa(rede))))));
    const lista = h('section', { class: 'secao', 'aria-label': 'Destinos da simulação' },
      h('h2', { class: 'secao-titulo', texto: 'Destinos da simulação' }),
      h('p', { texto: dados.limitado ? 'Exibindo os 50 registros mais recentes. Esta lista não é o inventário completo.' : `${dados.registros.length} registro(s) recebido(s).` }),
      botao('Conferir combinação', preparar),
      dados.registros.length ? h('div', { class: 'publicacoes-lista' }, dados.registros.map(j => h('article', { class: 'cartao' },
        h('h3', { texto: `${REDE[j.alvo.rede]} · ${NOMES[j.estado]} · simulação` }),
        h('p', { texto: destino(j.alvo) }), h('p', { texto: j.motivo || 'Sem observação adicional.' }),
        h('p', { class: 'publicacoes-chave', texto: `Chave: ${j.chave}` }),
        botao('Ver combinação e recibo', () => consultar(j.chave)))))
        : h('p', { texto: 'Nenhum destino retornado pela fonte de simulação.' }));
    corpo.replaceChildren(pausas, lista);
  }

  async function pausa(rede) {
    if (ocupado || !dados) return;
    const retomar = dados.pausas[rede];
    const ok = await ctx.confirmar({ titulo: `${retomar ? 'Retomar' : 'Pausar'} ${REDE[rede]} na simulação?`,
      texto: 'Nenhuma escrita real na Meta. Pausa não cancela agendamentos; retomar não resolve estados incertos nem autoriza horários vencidos.',
      rotuloBotao: retomar ? 'Retomar simulação' : 'Pausar simulação' });
    if (!ok || ocupado || ctx.obsoleta()) return;
    await operar(retomar ? 'retomar' : 'pausar', { rede, ...(retomar ? { confirmado: true } : {}) });
  }

  async function operar(acao, campos) {
    if (ocupado) return;
    ocupacao(true);
    let r;
    try {
      r = contrato(await ctx.acao(API, pedido(acao, campos)));
      if (ctx.obsoleta()) return;
      mensagem(`SIMULAÇÃO · ${r.cancelamentos || (r.registro ? `${NOMES[r.registro.estado] || r.registro.estado}. ${r.registro.motivo || ''}` : 'Controle atualizado.')} Nenhuma chamada real à Meta.`);
      if (r.registro) mostrarJob(r.registro);
    } catch (err) { if (!ctx.obsoleta()) falhou(err); }
    finally { ocupacao(false); }
    if (r && !ctx.obsoleta()) { await carregar(); recibo.focus(); }
  }

  async function preparar() {
    if (ocupado) return;
    const escolha = await ctx.formulario({ titulo: 'Conferir combinação simulada',
      texto: 'Horário digitado no fuso local do navegador; o recibo também mostra UTC. A confirmação fica bloqueada sem mídia e legenda legíveis.', rotuloBotao: 'Consultar manifesto',
      campos: [
        { nome: 'pecaId', rotulo: 'ID da peça (16 caracteres hexadecimais)', obrigatorio: true },
        { nome: 'rede', rotulo: 'Rede', tipo: 'select', opcoes: ['facebook', 'instagram'].map(valor => ({ valor, rotulo: REDE[valor] })) },
        { nome: 'conta', rotulo: 'ID da conta de destino', obrigatorio: true },
        { nome: 'formato', rotulo: 'Formato', tipo: 'select', opcoes: ['feed', 'reels', 'stories'].map(valor => ({ valor, rotulo: valor })) },
        { nome: 'horario', rotulo: 'Horário local', tipo: 'datetime-local', obrigatorio: true },
        { nome: 'estrategia', rotulo: 'Estratégia', tipo: 'select', opcoes: ['nativo-meta', 'executor-remoto'].map(valor => ({ valor, rotulo: valor })) },
      ] });
    if (!escolha || ctx.obsoleta() || ocupado) return;
    if (!/^[0-9a-f]{16}$/.test(escolha.pecaId) || !/^\d{1,40}$/.test(escolha.conta) || !Number.isFinite(Date.parse(escolha.horario))) {
      mensagem('Combinação inválida: confira ID da peça, conta e horário. Nenhuma solicitação foi enviada.', true); recibo.focus(); return;
    }
    const alvo = { ...escolha, horario: new Date(escolha.horario).toISOString() };
    ocupacao(true);
    try {
      const d = contrato(await ctx.acao(API, pedido('previa', { alvo })));
      if (ctx.obsoleta()) return;
      mostrarManifesto(d, alvo);
    } catch (err) { if (!ctx.obsoleta()) falhou(err); }
    finally { ocupacao(false); }
  }

  function mostrarManifesto(d, alvo) {
    detalhe.hidden = false;
    detalhe.replaceChildren(h('h2', { class: 'secao-titulo', tabindex: '-1', texto: 'Combinação consultada · simulação' }),
      h('p', { texto: destino(alvo) }), h('p', { class: 'publicacoes-chave', texto: `Chave: ${d.chave || 'indisponível'}` }),
      h('p', { texto: 'Prévia indisponível no contrato atual. O manifesto não fornece mídia nem legenda legível para conferir a combinação.' }),
      h('pre', { class: 'publicacoes-manifesto', texto: JSON.stringify(d, null, 2) }),
      h('button', { class: 'botao', type: 'button', disabled: true, 'aria-describedby': 'publicacoes-bloqueio-previa', texto: 'Confirmar simulação' }),
      h('p', { id: 'publicacoes-bloqueio-previa', texto: 'Confirmação bloqueada até existir prévia visual aprovada. Hashes e ordem não substituem essa conferência.' }));
    detalhe.querySelector('h2').focus();
  }

  async function consultar(chave) {
    if (ocupado) return;
    ocupacao(true);
    try {
      const d = contrato(await ctx.acao(API, pedido('consultar', { chave })));
      if (ctx.obsoleta()) return;
      const j = d.registro?.dados;
      if (!j) { mensagem('Registro não encontrado pela fonte. Nenhum envio foi presumido.', true); return; }
      mostrarJob(j);
    } catch (err) { if (!ctx.obsoleta()) falhou(err); }
    finally { ocupacao(false); }
  }

  function mostrarJob(j) {
    if (j.modo !== 'simulacao' || !HASH.test(j.chave) || !j.alvo || !NOMES[j.estado]) throw new Error('registro-invalido');
    detalhe.hidden = false;
    const acao = (nome, rotulo) => botao(rotulo, async () => {
      if (ocupado) return;
      const ok = await ctx.confirmar({ titulo: `${rotulo}?`, texto: 'Somente simulação. Nenhuma chamada real à Meta.', detalhes: [destino(j.alvo), `Chave: ${j.chave}`, `Estado: ${NOMES[j.estado]}`], rotuloBotao: rotulo });
      if (ok && !ctx.obsoleta()) await operar(nome, { chave: j.chave });
    });
    detalhe.replaceChildren(h('h2', { class: 'secao-titulo', tabindex: '-1', texto: `${NOMES[j.estado]} · simulação` }),
      h('p', { texto: destino(j.alvo) }), h('p', { class: 'publicacoes-chave', texto: `Chave: ${j.chave}` }),
      h('p', { texto: j.motivo || 'Sem observação adicional.' }),
      h('p', { texto: `Identificador fictício: ${j.remotoId || 'não retornado'}. Não é comprovante de publicação real.` }),
      h('pre', { class: 'publicacoes-manifesto', texto: JSON.stringify(j.peca?.manifesto || {}, null, 2) }),
      h('div', { class: 'bloco-acao' },
        INCERTOS.has(j.estado) ? acao('reconciliar', 'Reconciliar simulação') : null,
        ['planejado', 'programado-no-painel', 'preparando'].includes(j.estado) ? acao('executar', 'Executar simulação') : null,
        !TERMINAIS.has(j.estado) && j.estado !== 'cancelamento-pendente' ? acao('cancelar', 'Cancelar destino simulado') : null));
    detalhe.querySelector('h2').focus();
  }

  await carregar();
}
