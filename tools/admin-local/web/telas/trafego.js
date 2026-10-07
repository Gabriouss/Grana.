// Tráfego pago: portas, pré-requisitos, limites de referência e campanhas planejadas.
// Só planejamento. Nada é criado, pausado ou pago na Meta por este painel.

import { tituloPeca } from './_pecas.js';

const STATUS = [
  { valor: 'rascunho', rotulo: 'Rascunho' }, { valor: 'pronta', rotulo: 'Pronta' },
  { valor: 'no-ar', rotulo: 'No ar' }, { valor: 'encerrada', rotulo: 'Encerrada' },
];
const rotuloStatus = (s) => (STATUS.find((x) => x.valor === s) || { rotulo: s || 'sem status' }).rotulo;
const PORTA = { aberta: ['ok', 'Aberta'], fechada: ['erro', 'Fechada'], 'nao-medida': ['alerta', 'Não medida'] };
const PREREQ = { feito: ['ok', 'Feito'], pendente: ['alerta', 'Pendente'], 'a-conferir': ['neutro', 'A conferir'] };

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Tráfego pago', 'Planejamento de anúncios. Nada aqui é enviado à Meta nem gasta dinheiro.', [
    h('button', { class: 'botao botao-primario', type: 'button', texto: 'Nova campanha', onclick: () => editar(ctx, null, disponiveis) }),
  ]);
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);
  ctx.estado.carregando(corpo, 'Lendo o plano de tráfego…');

  let d;
  let disponiveis = [];
  try {
    d = (await ctx.api('/api/marketing/trafego')).dados || {};
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return;
  }
  if (ctx.obsoleta()) return;
  disponiveis = d.pecasAprovadasDisponiveis || [];
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  if (d.situacao) corpo.appendChild(ctx.alerta('atencao', d.situacao));
  for (const a of d.avisos || []) corpo.appendChild(ctx.alerta('info', a));

  const portas = d.portas || [];
  if (portas.length) {
    const fechadas = portas.filter((p) => p.estado !== 'aberta').length;
    corpo.appendChild(ctx.secao('Portas para abrir verba',
      fechadas ? ctx.alerta('critico', `${fechadas} de ${portas.length} portas não estão abertas. A verba não abre enquanto houver porta fechada.`) : ctx.alerta('info', 'Todas as portas abertas. A verba ainda depende da sua decisão.'),
      h('ul', { class: 'lista-portas' }, portas.map((p) => {
        const [s, t] = PORTA[p.estado] || ['neutro', p.estado];
        return h('li', { class: 'porta' }, ctx.selo(s, t), h('span', { texto: p.texto }), p.fonte ? h('span', { class: 'campo-ajuda', texto: p.fonte }) : null);
      }))));
  }

  const campanhas = d.campanhas || [];
  corpo.appendChild(ctx.secao('Campanhas planejadas',
    campanhas.length ? h('div', { class: 'grade-cartoes grade-campanhas' }, campanhas.map((c) => cartaoCampanha(ctx, c, disponiveis)))
      : ctx.estado.bloco.vazio('Nenhuma campanha planejada.'),
    !disponiveis.length ? h('p', { class: 'nota-explicativa', texto: 'Nenhuma peça aprovada ainda. Anúncio só pode usar peça com o seu aceite; aprove na tela de Aprovação para poder vincular.' }) : null));

  const pre = d.prerequisitos || [];
  if (pre.length) {
    corpo.appendChild(ctx.secao('Pré-requisitos técnicos',
      h('ul', { class: 'lista-portas' }, pre.map((p) => {
        const [s, t] = PREREQ[p.estado] || ['neutro', p.estado];
        return h('li', { class: 'porta' }, ctx.selo(s, t), h('span', { texto: p.texto }));
      }))));
  }

  const lim = d.limitesDeReferencia;
  if (lim) {
    corpo.appendChild(ctx.secao('Limites de referência',
      lim.aviso ? h('p', { class: 'nota-explicativa', texto: lim.aviso }) : null,
      (lim.itens || []).length ? ctx.tabela([
        { titulo: 'Sinal', valor: (x) => x.sinal },
        { titulo: 'Limite', valor: (x) => x.limite },
        { titulo: 'Decisão', valor: (x) => x.decisao },
      ], lim.itens, { legenda: 'Quando trocar ou parar' }) : null,
      lim.tetoSemanalAutor ? ctx.alerta('atencao', lim.tetoSemanalAutor) : null,
      (lim.pararTudo || []).length ? [h('h3', { texto: 'Parar tudo se' }), h('ul', null, lim.pararTudo.map((x) => h('li', { texto: x })))] : null,
      (lim.naoFazer || []).length ? [h('h3', { texto: 'Não fazer' }), h('ul', null, lim.naoFazer.map((x) => h('li', { texto: x })))] : null));
  }

  const ang = d.angulosPorEtapa;
  if (ang) {
    const etapas = [['prospeccao', 'Prospecção'], ['consideracaoRetargeting', 'Consideração e retargeting'], ['conversao', 'Conversão']].filter(([k]) => ang[k]);
    if (etapas.length) {
      corpo.appendChild(ctx.secao('Ângulos por etapa',
        h('dl', { class: 'lista-chave-valor' }, etapas.map(([k, t]) => [h('dt', { texto: t }), h('dd', { texto: ang[k] })])),
        ang.fonte ? h('p', { class: 'campo-ajuda', texto: `Fonte: ${ang.fonte}` }) : null));
    }
  }

  if ((d.fonte || []).length) {
    corpo.appendChild(h('p', { class: 'rodape-leitura', texto: `Fontes: ${d.fonte.join('; ')}` }));
  }
}

function cartaoCampanha(ctx, c, disponiveis) {
  const { h } = ctx;
  const periodo = c.periodo || {};
  const textoPeriodo = periodo.inicio || periodo.fim
    ? `${ctx.formatar.data(periodo.inicio)} a ${ctx.formatar.data(periodo.fim)}`
    : periodo.relativo || (c.inicio ? `${ctx.formatar.data(c.inicio)} a ${ctx.formatar.data(c.fim)}` : 'sem período');
  const vinculadas = c.pecasVinculadas || [];
  return h('article', { class: 'cartao campanha' },
    h('div', { class: 'cartao-topo' }, h('h3', { class: 'cartao-titulo', texto: c.nome }),
      ctx.selo(c.status === 'no-ar' ? 'ok' : c.status === 'pronta' ? 'alerta' : 'neutro', rotuloStatus(c.status))),
    h('dl', { class: 'lista-chave-valor' },
      c.objetivo ? [h('dt', { texto: 'Objetivo' }), h('dd', { texto: c.objetivo })] : null,
      c.publico ? [h('dt', { texto: 'Público' }), h('dd', { texto: c.publico })] : null,
      h('dt', { texto: 'Verba diária' }), h('dd', { class: 'num', texto: typeof c.orcamentoDiario === 'number' ? ctx.formatar.reais(c.orcamentoDiario) : 'sem verba' }),
      typeof c.orcamentoTotal === 'number' ? [h('dt', { texto: 'Total previsto' }), h('dd', { class: 'num', texto: ctx.formatar.reais(c.orcamentoTotal) })] : null,
      h('dt', { texto: 'Período' }), h('dd', { texto: `${textoPeriodo}${c.dias ? ` (${c.dias} dias)` : ''}` }),
      h('dt', { texto: 'Peças' }), h('dd', { texto: vinculadas.length ? vinculadas.map((p) => (typeof p === 'string' ? p : tituloPeca(p))).join(', ') : 'nenhuma vinculada' })),
    c.observacoes ? h('p', { class: 'cartao-detalhe', texto: c.observacoes }) : null,
    c.origem ? h('p', { class: 'campo-ajuda', texto: `Origem: ${c.origem}` }) : null,
    h('button', { class: 'botao', type: 'button', texto: 'Editar', onclick: () => editar(ctx, c, disponiveis) }));
}

async function editar(ctx, c, disponiveis) {
  const periodo = c?.periodo || {};
  const v = await ctx.formulario({
    titulo: c ? `Editar ${c.nome}` : 'Nova campanha',
    texto: 'Só planejamento local. Nada vai para a Meta. Tudo o que você escrever aqui fica em docs/marketing/painel e vai para o GitHub público no próximo commit.',
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true, valor: c?.nome },
      { nome: 'objetivo', rotulo: 'Objetivo', tipo: 'textarea', linhas: 2, valor: c?.objetivo },
      { nome: 'publico', rotulo: 'Público', tipo: 'textarea', linhas: 2, valor: c?.publico },
      { nome: 'orcamentoDiario', rotulo: 'Verba diária em R$', tipo: 'text', valor: c?.orcamentoDiario != null ? String(c.orcamentoDiario).replace('.', ',') : '', ajuda: 'Ex.: 14,50. Acima de R$ 100 por semana o painel avisa.' },
      { nome: 'inicio', rotulo: 'Início', tipo: 'date', valor: periodo.inicio || '' },
      { nome: 'fim', rotulo: 'Fim', tipo: 'date', valor: periodo.fim || '' },
      { nome: 'relativo', rotulo: 'Período relativo ao dia D (opcional)', valor: periodo.relativo || '', ajuda: 'Ex.: D+15 a D+21' },
      { nome: 'pecas', rotulo: 'Peças aprovadas vinculadas', tipo: 'select', multiplo: true,
        valor: (c?.pecas || []).map(String),
        opcoes: disponiveis.map((p) => ({ valor: p.id, rotulo: p.titulo || p.id })),
        ajuda: disponiveis.length ? 'Ctrl+clique para escolher mais de uma.' : 'Nenhuma peça aprovada disponível.' },
      { nome: 'status', rotulo: 'Status', tipo: 'select', valor: c?.status || 'rascunho', opcoes: STATUS },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', linhas: 3, valor: c?.observacoes },
    ],
    rotuloBotao: 'Salvar campanha',
  });
  if (!v) return;
  const corpo = {
    id: c?.id, nome: v.nome, objetivo: v.objetivo || undefined, publico: v.publico || undefined,
    orcamentoDiario: v.orcamentoDiario === '' ? undefined : v.orcamentoDiario,
    dias: c?.dias, periodo: { inicio: v.inicio || undefined, fim: v.fim || undefined, relativo: v.relativo || undefined },
    pecas: v.pecas, status: v.status, observacoes: v.observacoes || undefined,
  };
  try {
    const r = await ctx.acao('/api/marketing/trafego', corpo);
    ctx.aviso('Campanha salva no planejamento local.', 'ok');
    for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
    ctx.recarregar();
  } catch (err) {
    ctx.aviso(`A campanha não foi salva: ${err.message}`, 'erro');
  }
}
