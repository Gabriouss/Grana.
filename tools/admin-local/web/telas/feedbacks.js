// Feedbacks do app: leitura e gestão (estado, prioridade, responsável, etiquetas, evidência de resolução).
// Fala só com o servidor local (/api/marketing/feedbacks*); nada sai do navegador para o Supabase.
// A mensagem do usuário é texto não confiável: entra sempre por textContent, nunca é copiada para log,
// aviso ou notificação. Consentimento de uso público é dado separado e a triagem nunca o muda.

const ESTADOS = [['novo', 'Novo'], ['em_analise', 'Em análise'], ['planejado', 'Planejado'], ['em_execucao', 'Em execução'], ['resolvido', 'Resolvido'], ['arquivado', 'Arquivado']];
const NOME_ESTADO = Object.fromEntries(ESTADOS);
const NIVEL_ESTADO = { novo: 'alerta', em_analise: 'neutro', planejado: 'neutro', em_execucao: 'neutro', resolvido: 'ok', arquivado: 'neutro' };
const PRIORIDADES = [['', 'Sem prioridade'], ['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']];
const NOME_PRIORIDADE = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const TIPOS = [['', 'Todos os tipos'], ['suggestion', 'Sugestão'], ['bug', 'Problema'], ['praise', 'Elogio'], ['other', 'Outro']];
const NOME_TIPO = Object.fromEntries(TIPOS.filter(([v]) => v));
const STATUS_APP = { pending: 'Pendente no app', reviewed: 'Revisado no app', resolved: 'Resolvido no app' };

export const MOTIVOS_ERRO = {
  'pedido-invalido': 'Algum campo está fora do formato. Confira e tente de novo.',
  'confirmacao-obrigatoria': 'Arquivar pede a confirmação. Nada foi gravado.',
  'gestao-nao-aplicada': 'A gestão de feedbacks ainda não foi aplicada no banco. Nada foi gravado.',
  'feedback-inexistente': 'Esse feedback não existe mais. Atualize a lista.',
};

const resumo = (m) => { const t = String(m || ''); return t.length > 160 ? `${t.slice(0, 160)}…` : t; };

export function corpoDaGestao(item, v) {
  // Só o que mudou vai ao servidor: patch parcial conserva o resto (inclusive evidência e versão já gravadas).
  const g = item.gestao;
  const c = { id: item.id };
  if (v.estado !== g.estado) c.estado = v.estado;
  const prioridade = v.prioridade === '' ? null : v.prioridade;
  if (prioridade !== g.prioridade) c.prioridade = prioridade;
  const responsavel = v.responsavel === '' ? null : v.responsavel;
  if (responsavel !== g.responsavel) c.responsavel = responsavel;
  const etiquetas = String(v.etiquetas || '').split(',').map((e) => e.trim()).filter(Boolean);
  if (etiquetas.join('|').toLowerCase() !== g.etiquetas.join('|').toLowerCase()) c.etiquetas = etiquetas;
  const evidencia = v.evidencia === '' ? null : v.evidencia;
  if (evidencia !== g.evidencia) c.evidencia = evidencia;
  const versao = v.versaoResolucao === '' ? null : v.versaoResolucao;
  if (versao !== g.versaoResolucao) c.versaoResolucao = versao;
  return c;
}

export async function montar(raiz, ctx) {
  const { h } = ctx;
  const filtros = {};
  let estadoGestao = '';
  let itens = [];
  let haMais = false;
  let gestaoDisponivel = true;
  const corpo = h('div', { class: 'feedbacks-corpo' });
  const recibo = h('p', { class: 'so-leitor', role: 'status', 'aria-live': 'polite' });

  ctx.cabecalho(raiz, 'Feedbacks', 'Triagem dos feedbacks do app. A mensagem original e o consentimento de uso público nunca mudam aqui.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => carregar(true) }),
  ]);

  const seletores = {};
  const botoesGerir = new Map();
  const seletor = (id, rotulo, opcoes, aoMudar) => {
    const campoSelect = h('select', { id, onchange: (e) => aoMudar(e.target.value) }, opcoes.map(([value, texto]) => h('option', { value, texto })));
    seletores[id] = campoSelect;
    return h('div', { class: 'campo' }, h('label', { for: id, texto: rotulo }), campoSelect);
  };
  raiz.appendChild(h('div', { class: 'barra-filtros' },
    seletor('feedbacks-andamento', 'Andamento da gestão', [['', 'Todos'], ...ESTADOS], (v) => { estadoGestao = v; desenhar(); }),
    seletor('feedbacks-tipo', 'Tipo', TIPOS, (v) => { if (v) filtros.tipo = v; else delete filtros.tipo; carregar(true); }),
    seletor('feedbacks-nota', 'Nota', [['', 'Todas'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], (v) => { if (v) filtros.nota = Number(v); else delete filtros.nota; carregar(true); }),
  ));
  raiz.appendChild(h('p', { class: 'texto-fraco', texto: 'Tipo e nota filtram no servidor. O andamento da gestão filtra só os itens já carregados.' }));
  raiz.appendChild(corpo);
  raiz.appendChild(recibo);

  async function carregar(zerar) {
    if (zerar) { itens = []; haMais = false; }
    corpo.replaceChildren(h('div', { class: 'estado estado-carregando', role: 'status', 'aria-busy': 'true' }, h('p', { class: 'estado-texto', texto: 'Carregando feedbacks…' })));
    try {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(filtros)) q.set(k, String(v));
      if (!zerar && itens.length) q.set('antesDe', itens[itens.length - 1].criadoEm);
      const r = await ctx.api(`/api/marketing/feedbacks${q.toString() ? `?${q}` : ''}`);
      if (ctx.obsoleta()) return;
      const d = r.dados || r;
      if (d.status === 'ausente' || d.status === 'pendente') {
        corpo.replaceChildren(h('div', { class: 'estado estado-ausente' }, h('p', { class: 'estado-texto', texto: d.motivo || 'Feedbacks ainda não estão disponíveis neste painel.' })));
        return;
      }
      const vistos = new Set(itens.map((i) => i.id));
      itens = itens.concat((d.feedbacks || []).filter((i) => !vistos.has(i.id)));
      haMais = Boolean(d.haMais);
      gestaoDisponivel = d.gestaoDisponivel !== false;
      desenhar();
    } catch (err) {
      console.warn('[feedbacks]', err.codigo || 'falha');
      if (ctx.obsoleta()) return;
      // Falha de leitura nunca vira lista vazia: a tela diz que não leu.
      // Mesma caixa de estado do resto do painel (base .estado + modificador), AUD-06.
      corpo.replaceChildren(h('div', { class: 'estado estado-erro', role: 'alert' },
        h('p', { class: 'estado-texto', texto: 'Não foi possível ler os feedbacks. Isto não significa que não haja nenhum.' }),
        h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Tentar de novo', onclick: () => carregar(true) })));
    }
  }

  function desenhar() {
    botoesGerir.clear();
    const visiveis = estadoGestao ? itens.filter((i) => i.gestao.estado === estadoGestao) : itens;
    const contagem = ESTADOS.map(([v, t]) => `${t}: ${itens.filter((i) => i.gestao.estado === v).length}`).join(' · ');
    const partes = [];
    if (!gestaoDisponivel) {
      partes.push(ctx.alerta('atencao', 'A gestão de feedbacks ainda não foi aplicada no banco. A lista é só de leitura e todos aparecem como Novo.'));
    }
    if (!itens.length) {
      partes.push(h('div', { class: 'estado estado-ausente' }, h('p', { class: 'estado-texto', texto: Object.keys(filtros).length ? 'Nenhum feedback corresponde aos filtros.' : 'Ainda não chegaram feedbacks.' })));
      corpo.replaceChildren(...partes);
      return;
    }
    partes.push(h('p', { class: 'texto-fraco', texto: contagem }));
    if (!visiveis.length) partes.push(h('p', { texto: 'Nenhum dos itens carregados está nesse andamento.' }));
    else {
      partes.push(ctx.tabela([
        // Andamento e ação moram na primeira coluna: em tela estreita a tabela rola de lado as colunas do fim ficam escondidas.
        { titulo: 'Mensagem', valor: (i) => {
          const botaoGerir = h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Gerir', 'aria-label': `Gerir feedback: ${resumo(i.mensagem).slice(0, 40)}`, disabled: !gestaoDisponivel, dados: { feedbackId: i.id }, onclick: (e) => gerir(i, e.currentTarget) });
          botoesGerir.set(i.id, botaoGerir);
          return h('div', { class: 'feedback-mensagem', style: 'min-width: min(26ch, 70vw)' },
            h('p', { texto: resumo(i.mensagem) }),
            h('p', {}, ctx.selo(NIVEL_ESTADO[i.gestao.estado] || 'neutro', NOME_ESTADO[i.gestao.estado] || i.gestao.estado)),
            botaoGerir);
        } },
        { titulo: 'Tipo e nota', valor: (i) => `${NOME_TIPO[i.tipo] || i.tipo}${i.nota ? ` · nota ${i.nota}` : ''}` },
        { titulo: 'Versão do app', valor: (i) => i.versaoApp || 'não informada' },
        { titulo: 'No app', valor: (i) => STATUS_APP[i.status] || i.status },
        { titulo: 'Uso público', valor: (i) => (i.usoPublicoAutorizado ? 'Autorizado' : 'Não autorizado') },
        { titulo: 'Prioridade', valor: (i) => NOME_PRIORIDADE[i.gestao.prioridade] || 'Sem prioridade' },
        { titulo: 'Recebido', valor: (i) => ctx.formatar.dataHora(i.criadoEm) },
      ], visiveis, { legenda: 'Feedbacks recebidos, do mais novo ao mais antigo' }));
    }
    if (haMais) partes.push(h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Carregar mais', onclick: () => carregar(false) }));
    corpo.replaceChildren(...partes);
  }

  async function gerir(item, botao) {
    if (botao.disabled || ctx.obsoleta()) return;
    botao.disabled = true;
    const g = item.gestao;
    try {
      // O formulário reabre com o que foi digitado e a explicação no topo quando Resolvido falta evidência ou versão:
      // fechar e mostrar só um aviso faria a pessoa redigitar tudo.
      let inicial = { estado: g.estado, prioridade: g.prioridade || '', responsavel: g.responsavel || '', etiquetas: g.etiquetas.join(', '), versaoResolucao: g.versaoResolucao || '', evidencia: g.evidencia || '' };
      let correcao = '';
      let mudanca = null;
      for (let tentativa = 0; tentativa < 5 && !mudanca; tentativa += 1) {
        const v = await ctx.formulario({
          titulo: 'Gerir feedback',
          texto: correcao || 'Não cole dado pessoal nos campos abaixo. Resolvido exige evidência e versão da resolução.',
          campos: [
            { nome: 'estado', rotulo: 'Andamento', tipo: 'select', opcoes: ESTADOS.map(([valor, rotulo]) => ({ valor, rotulo })), valor: inicial.estado },
            { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: PRIORIDADES.map(([valor, rotulo]) => ({ valor, rotulo })), valor: inicial.prioridade },
            { nome: 'responsavel', rotulo: 'Responsável', tipo: 'text', valor: inicial.responsavel, ajuda: 'Até 80 caracteres.' },
            { nome: 'etiquetas', rotulo: 'Etiquetas', tipo: 'text', valor: inicial.etiquetas, ajuda: 'Separe por vírgula. Até 8, de até 30 caracteres.' },
            { nome: 'versaoResolucao', rotulo: 'Versão da resolução', tipo: 'text', valor: inicial.versaoResolucao, ajuda: 'Ex.: 1.11.0' },
            { nome: 'evidencia', rotulo: 'Evidência da resolução', tipo: 'textarea', linhas: 3, valor: inicial.evidencia, ajuda: 'Até 500 caracteres. Resolvido sozinho não prova que a correção chegou ao app instalado.' },
          ],
          rotuloBotao: 'Salvar gestão',
        });
        if (!v || ctx.obsoleta()) return;
        const candidata = corpoDaGestao(item, v);
        if (Object.keys(candidata).length === 1) { ctx.aviso('Nada mudou.', 'info'); return; }
        if (candidata.estado === 'resolvido' && !((candidata.evidencia ?? g.evidencia) && (candidata.versaoResolucao ?? g.versaoResolucao))) {
          inicial = v;
          correcao = 'Para marcar como Resolvido, preencha a evidência e a versão da resolução. Nada foi gravado.';
          ctx.aviso(correcao, 'erro');
          continue;
        }
        mudanca = candidata;
      }
      if (!mudanca) return;
      if (mudanca.estado === 'arquivado') {
        const ok = await ctx.confirmar({ titulo: 'Arquivar este feedback?', texto: 'Ele sai da triagem. Dá para reabrir mudando o andamento depois.', detalhes: [resumo(item.mensagem).slice(0, 80)], rotuloBotao: 'Arquivar', perigo: true });
        if (ok !== true || ctx.obsoleta()) return;
        mudanca.confirmacao = true;
      }
      const r = await ctx.acao('/api/marketing/feedbacks/gestao', mudanca);
      if (ctx.obsoleta()) return;
      const d = r.dados || r;
      if (d.recusa) {
        // O banco recusou a regra (Resolvido sem evidência e versão no estado resultante): nada foi gravado.
        ctx.aviso('Para marcar como Resolvido, o item precisa ter evidência e versão da resolução. Preencha os dois e salve de novo. Nada foi gravado.', 'erro');
        recibo.textContent = 'Resolvido recusado: falta evidência ou versão. Nada foi gravado.';
        return;
      }
      item.gestao = d.gestao;
      recibo.textContent = 'Gestão salva.';
      ctx.aviso('Gestão salva.', 'ok');
      desenhar();
    } catch (err) {
      console.warn('[feedbacks-gestao]', err.codigo || 'falha');
      if (!ctx.obsoleta()) ctx.aviso(MOTIVOS_ERRO[err.codigo] || 'Não foi possível salvar a gestão. Atualize a lista antes de repetir.', 'erro');
    } finally {
      if (!ctx.obsoleta()) {
        botao.disabled = !gestaoDisponivel;
        const destinoFoco = botoesGerir.get(item.id) || seletores['feedbacks-andamento'];
        if (destinoFoco && destinoFoco !== seletores['feedbacks-andamento']) destinoFoco.disabled = !gestaoDisponivel;
        if (gestaoDisponivel && typeof destinoFoco?.focus === 'function') destinoFoco.focus();
      }
    }
  }

  await carregar(true);
}
