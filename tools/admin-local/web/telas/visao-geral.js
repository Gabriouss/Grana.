// Visão geral: status de cada integração e o que pede atenção agora.

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Visão geral', 'O estado do Grana. agora, lido pelo servidor local.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);
  ctx.estado.carregando(corpo, 'Lendo Supabase, Vercel, EAS, GitHub e Cakto…');

  let r;
  try {
    r = await ctx.api('/api/visao-geral');
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return;
  }
  if (ctx.obsoleta()) return;
  const d = normalizar(r.dados || {});
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  // alertas primeiro: é o que pede ação
  const alertas = Array.isArray(d.alertas) ? d.alertas : [];
  if (alertas.length) {
    corpo.appendChild(ctx.secao('Alertas',
      h('div', { class: 'lista-alertas' }, alertas.map((a) => ctx.alerta(a.nivel, a.texto || a.mensagem, a.link)))));
  }

  const semana = d.builds?.semana;
  const mes = d.builds?.mes;
  const deploy = d.vercel?.ultimoDeploy;
  const commit = d.git?.commit;
  const versaoLocal = d.app?.versao;
  const versaoAnunciada = d.app?.versaoAnunciada;

  const cartoes = [
    ctx.cartao({
      titulo: 'Versão do app',
      valor: versaoLocal || 'sem dado',
      detalhe: versaoAnunciada
        ? (versaoAnunciada === versaoLocal ? 'Igual à versão anunciada no app_release.' : `Anunciada no app_release: ${versaoAnunciada}.`)
        : 'Versão do app.json desta máquina.',
      status: versaoAnunciada && versaoLocal && versaoAnunciada !== versaoLocal ? 'alerta' : undefined,
      link: '#/eas', rotuloLink: 'Ver builds',
    }),
    ctx.cartao({
      titulo: 'Builds desta semana',
      valor: semana ? `${semana.usadas} de ${semana.teto ?? 3}` : 'sem dado',
      detalhe: mes ? `No mês: ${mes.usadas} de ${mes.cota ?? 15}, somando as duas máquinas.` : 'Contagem do mês não lida.',
      status: semana && semana.usadas >= (semana.teto ?? 3) ? 'alerta' : undefined,
      link: '#/eas', rotuloLink: 'Ver saldo',
    }),
    ctx.cartao({
      titulo: 'Último deploy do site',
      valor: deploy ? estadoDeploy(deploy.estado) : 'sem dado',
      detalhe: deploy ? `${ctx.formatar.relativo(deploy.criadoEm)}${deploy.commit ? `, commit ${String(deploy.commit.hash || deploy.commit).slice(0, 7)}` : ''}.` : 'A Vercel não foi lida.',
      status: deploy && deploy.estado !== 'READY' ? (deploy.estado === 'ERROR' ? 'erro' : 'alerta') : undefined,
      link: '#/vercel', rotuloLink: 'Ver deploys',
    }),
    ctx.cartao({
      titulo: 'Último commit',
      valor: commit ? (commit.curto || String(commit.hash || '').slice(0, 7)) : 'sem dado',
      detalhe: commit ? `${commit.assunto || ''} (${ctx.formatar.relativo(commit.data)})${textoSincronia(d.git)}` : 'O git local não foi lido.',
      status: d.git && (d.git.atras > 0) ? 'alerta' : undefined,
      link: '#/github', rotuloLink: 'Ver GitHub',
    }),
    ctx.cartao({
      titulo: 'Assinantes ativos',
      valor: typeof d.assinantes?.ativos === 'number' ? ctx.formatar.numero(d.assinantes.ativos) : 'sem dado',
      detalhe: 'Número agregado. O painel não mostra dado pessoal de assinante.',
      link: '#/supabase', rotuloLink: 'Ver Supabase',
    }),
  ];
  if (d.vendas30) {
    cartoes.push(ctx.cartao({
      titulo: 'Vendas em 30 dias',
      valor: `${d.vendas30.pedidos} ${d.vendas30.pedidos === 1 ? 'venda paga' : 'vendas pagas'}`,
      detalhe: ctx.formatar.reais(d.vendas30.valor),
      link: '#/vendas', rotuloLink: 'Ver vendas',
    }));
  }
  if (typeof d.marketing?.paraAprovacao === 'number') {
    cartoes.push(ctx.cartao({
      titulo: 'Marketing',
      valor: d.marketing.paraAprovacao === 1 ? '1 peça esperando' : `${d.marketing.paraAprovacao} peças esperando`,
      detalhe: 'Aprovar não publica nada. Só registra o seu aceite daquela versão.',
      link: '#/marketing/aprovacao', rotuloLink: 'Abrir aprovação',
    }));
  }
  corpo.appendChild(ctx.secao('Resumo', h('div', { class: 'grade-cartoes' }, cartoes)));

  const integracoes = normalizarIntegracoes(d.integracoes);
  corpo.appendChild(ctx.secao('Integrações',
    integracoes.length
      ? h('ul', { class: 'lista-integracoes' }, integracoes.map((i) => h('li', { class: 'integracao' },
        h('span', { class: 'integracao-nome', texto: i.nome }),
        ctx.selo(i.status),
        i.detalhe ? h('span', { class: 'integracao-detalhe', texto: i.detalhe } ) : null)))
      : ctx.estado.bloco.vazio('O servidor não informou o status das integrações.')));

  corpo.appendChild(h('p', { class: 'rodape-leitura', texto: `Lido ${ctx.formatar.dataHora(r.atualizadoEm)}${r.simulado ? ' (simulado)' : ''}.` }));
}

// Aceita o formato do contrato e o que o servidor do Keel devolve hoje.
function normalizar(d) {
  const bs = d.buildsDaSemana;
  const integ = d.integracoes || {};
  const alertasFuncoes = (integ.funcoes?.alertas || []).map((a) => (typeof a === 'string' ? { nivel: 'atencao', texto: a } : a));
  return {
    ...d,
    app: d.app || { versao: d.versaoApp, versaoAnunciada: d.versaoAnunciada },
    builds: d.builds || (bs ? { semana: { usadas: bs.feitos, teto: bs.teto }, mes: bs.mes ? { usadas: bs.mes.preparos, cota: bs.mes.cota } : undefined } : undefined),
    vercel: d.vercel || { ultimoDeploy: d.ultimoDeploy || integ.vercel?.ultimoProducao },
    git: { ...(d.git || {}), commit: d.git?.commit || d.ultimoCommit },
    assinantes: { ativos: d.assinantes?.ativos ?? d.assinantes?.ativas },
    vendas30: integ.cakto?.pagos?.ultimos30,
    alertas: [...(d.alertas || []), ...alertasFuncoes],
  };
}

const NOMES = { funcoes: 'Edge Functions', supabase: 'Supabase', vercel: 'Vercel', eas: 'EAS', github: 'GitHub', cakto: 'Cakto', git: 'Git local' };

function normalizarIntegracoes(v) {
  if (Array.isArray(v)) return v.map((i) => ({ nome: i.nome || NOMES[i.id] || i.id, status: i.status, detalhe: i.detalhe || i.motivo }));
  if (v && typeof v === 'object') {
    return Object.entries(v).map(([id, i]) => ({
      nome: NOMES[id] || id,
      status: typeof i === 'string' ? i : i?.status,
      detalhe: typeof i === 'object' ? (i.detalhe || i.motivo || i.observacao) : undefined,
    }));
  }
  return [];
}

function estadoDeploy(e) {
  return { READY: 'No ar', ERROR: 'Falhou', BUILDING: 'Publicando', QUEUED: 'Na fila', CANCELED: 'Cancelado', INITIALIZING: 'Iniciando' }[e] || e || 'sem dado';
}

function textoSincronia(git) {
  if (!git) return '';
  const partes = [];
  if (git.aFrente > 0) partes.push(`${git.aFrente} à frente do GitHub`);
  if (git.atras > 0) partes.push(`${git.atras} atrás do GitHub`);
  return partes.length ? `. Local ${partes.join(' e ')}.` : '.';
}
