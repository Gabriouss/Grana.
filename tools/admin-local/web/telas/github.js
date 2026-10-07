// GitHub: estado do git local contra o origin/main e as releases (de onde sai o APK permanente).

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'GitHub', 'O repositório é público: tudo o que entra no git pode ser lido por qualquer pessoa.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);

  raiz.appendChild(ctx.bloco('Git local', '/api/git/estado', (bruto) => {
    const d = normalizarGit(bruto);
    const c = d.commit;
    return [
      h('dl', { class: 'lista-chave-valor' },
        h('dt', { texto: 'Branch' }), h('dd', { class: 'mono', texto: d.branch || 'sem dado' }),
        h('dt', { texto: 'Último commit' }), h('dd', { class: 'mono', texto: [c.curto || String(c.hash || '').slice(0, 7), c.assunto || c.mensagem].filter(Boolean).join(' · ') || 'sem dado' }),
        c.data ? [h('dt', { texto: 'Data' }), h('dd', { texto: ctx.formatar.dataHora(c.data) })] : null,
        h('dt', { texto: 'Em relação ao GitHub' }), h('dd', { texto: sincronia(d) }),
        typeof d.alterados === 'number' ? [h('dt', { texto: 'Arquivos alterados sem commit' }), h('dd', { texto: String(d.alterados) })] : null,
        typeof d.worktrees === 'number' ? [h('dt', { texto: 'Worktrees' }), h('dd', { texto: String(d.worktrees) })] : null,
        typeof d.stashes === 'number' ? [h('dt', { texto: 'Stashes' }), h('dd', { texto: String(d.stashes) })] : null),
      d.worktrees > 1 || d.stashes > 0 ? ctx.alerta('atencao', 'Há worktree extra ou stash guardado. O projeto trabalha numa linha só, sem nada guardado (regra 10).') : null,
      d.branch && !['main', 'master'].includes(d.branch) ? ctx.alerta('atencao', `A branch atual é ${d.branch}. O projeto trabalha numa linha só (regra 10).`) : null,
      d.atras > 0 ? ctx.alerta('atencao', 'Esta máquina está atrás do GitHub. Puxe antes de commitar ou de preparar build.') : null,
      h('p', { class: 'nota-explicativa', texto: d.observacao || 'A comparação usa a última vez que esta máquina buscou o GitHub. O painel não faz git fetch sozinho.' }),
    ];
  }, { integracao: 'git' }));

  raiz.appendChild(ctx.bloco('Releases', '/api/github/releases', (d) => {
    const lista = d.releases || d.itens || [];
    if (!lista.length) return null;
    return [d.linkPermanente ? h('p', { class: 'nota-explicativa' }, 'Link permanente do APK: ', h('a', { href: d.linkPermanente, target: '_blank', rel: 'noopener noreferrer', class: 'mono quebra', texto: d.linkPermanente })) : null, ctx.tabela([
      { titulo: 'Publicada', valor: (r) => ctx.formatar.dataHora(r.publicadoEm || r.publicadaEm) },
      { titulo: 'Tag', valor: (r) => r.tag, classe: 'mono' },
      { titulo: 'Nome', valor: (r) => r.nome },
      { titulo: 'Arquivos', valor: (r) => (r.assets || []).map((a) => `${a.nome}${typeof a.downloads === 'number' ? ` (${a.downloads} downloads)` : ''}`).join(', ') },
      { titulo: 'Link', valor: (r) => (r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', texto: 'Abrir' }) : null) },
    ], lista, { legenda: 'Releases recentes' })];
  }, { integracao: 'github', textoVazio: 'Nenhuma release publicada.' }));
}

export function normalizarGit(d) {
  const o = d.origemMain || {};
  return {
    branch: d.branch,
    commit: d.commit || d.ultimoCommit || {},
    aFrente: d.aFrente ?? o.aFrente,
    atras: d.atras ?? o.atras,
    alterados: d.alterados ?? d.alteracoesNaoCommitadas,
    worktrees: d.worktrees,
    stashes: d.stashes,
    observacao: o.observacao,
  };
}

function sincronia(d) {
  if (typeof d.aFrente !== 'number' && typeof d.atras !== 'number') return 'sem dado';
  if (!d.aFrente && !d.atras) return 'Igual ao origin/main';
  const partes = [];
  if (d.aFrente) partes.push(`${d.aFrente} commit${d.aFrente > 1 ? 's' : ''} à frente`);
  if (d.atras) partes.push(`${d.atras} commit${d.atras > 1 ? 's' : ''} atrás`);
  return partes.join(' e ');
}
