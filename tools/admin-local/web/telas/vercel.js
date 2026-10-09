// Vercel: deploys recentes, domínios e o único botão permitido, refazer o deploy de produção.

const ESTADOS = { READY: ['ok', 'No ar'], ERROR: ['erro', 'Falhou'], BUILDING: ['alerta', 'Publicando'], QUEUED: ['alerta', 'Na fila'], INITIALIZING: ['alerta', 'Iniciando'], CANCELED: ['neutro', 'Cancelado'] };

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Vercel', 'O site do Grana. e a landing. A Vercel já publica sozinha a cada push no main.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);

  raiz.appendChild(ctx.bloco('Projeto e domínios', '/api/vercel/projeto', (d) => {
    const dominios = d.dominios || [];
    return [
      h('dl', { class: 'lista-chave-valor' },
        d.nome ? [h('dt', { texto: 'Projeto' }), h('dd', { texto: d.nome })] : null,
        d.framework ? [h('dt', { texto: 'Framework' }), h('dd', { texto: d.framework })] : null,
        d.repositorio ? [h('dt', { texto: 'Repositório' }), h('dd', { class: 'mono', texto: d.repositorio })] : null,
        d.branchDeProducao ? [h('dt', { texto: 'Branch de produção' }), h('dd', { class: 'mono', texto: d.branchDeProducao })] : null,
        d.nodeVersion ? [h('dt', { texto: 'Node' }), h('dd', { texto: d.nodeVersion })] : null),
      dominios.length ? ctx.tabela([
        { titulo: 'Domínio', valor: (x) => (typeof x === 'string' ? x : x.nome), classe: 'mono' },
        { titulo: 'Verificado', valor: (x) => (typeof x === 'string' || x.verificado === undefined ? 'sem dado' : x.verificado ? ctx.selo('ok', 'Sim') : ctx.selo('alerta', 'Não')) },
        { titulo: 'Redireciona para', valor: (x) => x.redireciona, classe: 'mono' },
      ], dominios, { legenda: 'Domínios' }) : ctx.estado.bloco.vazio('Nenhum domínio informado.'),
    ];
  }, { integracao: 'vercel' }));

  raiz.appendChild(ctx.bloco('Deploys recentes', '/api/vercel/deployments', (d) => {
    const lista = d.deployments || d.itens || [];
    if (!lista.length) return null;
    const ultimoProducao = d.ultimoProducao || lista.find((x) => x.alvo === 'production' || x.target === 'production');
    return [
      ultimoProducao ? h('div', { class: 'bloco-acao' },
        h('p', { texto: `Último deploy de produção: ${rotulo(ultimoProducao.estado)}, ${ctx.formatar.relativo(ultimoProducao.criadoEm)}.` }),
        h('button', { class: 'botao botao-perigo', type: 'button', texto: 'Refazer o deploy de produção',
          onclick: (e) => redeploy(ctx, ultimoProducao, e.currentTarget) })) : null,
      ctx.tabela([
        { titulo: 'Quando', valor: (x) => ctx.formatar.dataHora(x.criadoEm) },
        { titulo: 'Estado', valor: (x) => { const [s, t] = ESTADOS[x.estado] || ['neutro', x.estado || 'sem dado']; return ctx.selo(s, t); } },
        { titulo: 'Alvo', valor: (x) => (x.alvo === 'production' ? 'Produção' : x.alvo === 'preview' ? 'Prévia' : x.alvo) },
        { titulo: 'Commit', valor: (x) => commitTexto(x.commit), classe: 'mono' },
        { titulo: 'Criado por', valor: (x) => x.criador },
        { titulo: 'Endereço', valor: (x) => (x.url ? h('a', { href: `https://${String(x.url).replace(/^https?:\/\//, '')}`, target: '_blank', rel: 'noopener noreferrer', texto: String(x.url).replace(/^https?:\/\//, '') }) : null), classe: 'mono' },
      ], lista, { legenda: 'Últimos deploys' }),
    ];
  }, { integracao: 'vercel', textoVazio: 'Nenhum deploy encontrado.' }));
}

function rotulo(e) { return (ESTADOS[e] || [null, e || 'sem estado'])[1].toLowerCase(); }

function commitTexto(c) {
  if (!c) return null;
  if (typeof c === 'string') return c.slice(0, 7);
  return [String(c.hash || '').slice(0, 7), c.mensagem].filter(Boolean).join(' · ');
}

async function redeploy(ctx, dep, botao) {
  const ok = await ctx.confirmar({
    titulo: 'Refazer o deploy de produção',
    texto: 'A Vercel vai publicar de novo o último deploy de produção, com o mesmo código. Nenhum código local sobe. O site fica no ar durante a troca.',
    detalhes: [`Deploy de origem: ${dep.url || dep.id}`, `Criado ${ctx.formatar.dataHora(dep.criadoEm)}`],
    rotuloBotao: 'Refazer deploy', perigo: true,
  });
  if (!ok) return;
  botao.disabled = true;
  const textoOriginal = botao.textContent;
  botao.textContent = 'Pedindo à Vercel…';
  try {
    const r = await ctx.acao('/api/vercel/redeploy', { deploymentId: dep.id, confirmacao: true });
    ctx.aviso(r.dados?.mensagem || 'A Vercel aceitou o pedido. O novo deploy aparece na lista em instantes.', 'ok');
    ctx.recarregar();
  } catch (err) {
    if (err.codigo === 'resultado-desconhecido') {
      ctx.aviso('Resultado desconhecido: a Vercel pode ter aceitado o redeploy. Confira a lista de deploys antes de repetir.', 'erro');
      botao.textContent = 'Confira a lista antes de repetir';
      setTimeout(() => ctx.recarregar(), 3000);
      return;
    }
    ctx.aviso(`O redeploy não foi feito: ${err.message}`, 'erro');
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}
