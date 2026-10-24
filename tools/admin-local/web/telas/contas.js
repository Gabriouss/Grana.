// Contas: cadastro, último login e último acesso de cada conta. Só leitura.
// Decisão do autor em 24/10/2026: lista por pessoa, numa tela própria. As telas de resumo
// (Supabase, Visão geral) continuam só com números.

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Contas', 'Cadastro, último login e último acesso de cada conta. Só leitura.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);

  raiz.appendChild(h('p', { class: 'nota-explicativa', texto: 'Na lista, o e-mail aparece só pelo começo. Para ver a conta inteira, busque pelo e-mail completo. Último login é a última vez que a pessoa entrou com e-mail e senha. Último acesso é a última vez que o app renovou a sessão dela, com precisão de cerca de uma hora. Os dados ficam só neste computador.' }));

  const campo = h('input', { id: 'contas-email', type: 'email', placeholder: 'nome@example.com', autocomplete: 'off', spellcheck: 'false' });
  const limpar = h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Ver todas', hidden: true });
  const lugar = h('div');
  const mostrar = (email) => {
    lugar.replaceChildren(email
      ? ctx.bloco('Resultado da busca', `/api/supabase/contas?email=${encodeURIComponent(email)}`, (d) => desenhar(ctx, d), { integracao: 'supabase', textoVazio: 'Nenhuma conta com esse e-mail.' })
      : ctx.bloco('Todas as contas', '/api/supabase/contas', (d) => desenhar(ctx, d), { integracao: 'supabase', textoVazio: 'Nenhuma conta encontrada.' }));
    limpar.hidden = !email;
  };
  limpar.addEventListener('click', () => { campo.value = ''; mostrar(null); });

  raiz.appendChild(h('form', { class: 'barra-filtros', onsubmit: (e) => { e.preventDefault(); const v = campo.value.trim(); mostrar(v || null); } },
    h('div', { class: 'form-linha' },
      h('div', { class: 'campo' }, h('label', { for: 'contas-email', texto: 'Buscar pelo e-mail completo' }), campo),
      h('button', { class: 'botao', type: 'submit', texto: 'Buscar' }),
      limpar)));
  raiz.appendChild(lugar);
  mostrar(null);
}

function desenhar(ctx, d) {
  const lista = Array.isArray(d.contas) ? d.contas : [];
  if (!lista.length) return null;
  const { h, formatar } = ctx;
  return [
    d.busca ? null : h('div', { class: 'grade-cartoes' },
      ctx.cartao({ titulo: 'Contas', valor: formatar.numero(lista.length),
        detalhe: lista.length >= d.limite ? `Mostrando as ${d.limite} de acesso mais recente.` : undefined }),
      ctx.cartao({ titulo: 'Acessaram em 7 dias', valor: formatar.numero(d.acessaram?.ultimos7) }),
      ctx.cartao({ titulo: 'Acessaram em 30 dias', valor: formatar.numero(d.acessaram?.ultimos30) })),
    ctx.tabela([
      { titulo: 'Conta', valor: (c) => h('span', null, c.email || 'sem e-mail',
        c.emailConfirmado ? null : h('span', { class: 'texto-fraco', texto: ' (e-mail não confirmado)' })) },
      { titulo: 'Cadastro', valor: (c) => formatar.data(c.cadastro) },
      { titulo: 'Último login', valor: (c) => c.ultimoLogin ? formatar.dataHora(c.ultimoLogin) : 'nunca', vazio: 'nunca' },
      { titulo: 'Último acesso', valor: (c) => c.ultimoAcesso ? formatar.dataHora(c.ultimoAcesso) : 'sem registro', vazio: 'sem registro' },
      { titulo: 'Assinatura', valor: (c) => assinatura(ctx, c.assinatura) },
    ], lista, { legenda: d.busca ? 'Conta encontrada' : 'Contas, da que acessou por último para a mais antiga' }),
  ];
}

function assinatura(ctx, a) {
  const { h, formatar } = ctx;
  if (!a) return ctx.selo('neutro', 'Sem assinatura');
  const nome = a.origem === 'cortesia' ? 'Cortesia' : a.origem === 'venda' ? 'Assinatura paga' : 'Outra origem';
  const ate = a.acessoAte ? formatar.data(a.acessoAte) : null;
  if (a.comAcesso) {
    const cancelada = a.status === 'canceled';
    return h('span', null, ctx.selo(cancelada ? 'alerta' : 'ok', cancelada ? `${nome} cancelada` : nome),
      ate ? h('span', { class: 'texto-fraco', texto: ` com acesso até ${ate}` }) : null);
  }
  return h('span', null, ctx.selo('erro', `${nome} vencida`), ate ? h('span', { class: 'texto-fraco', texto: ` em ${ate}` }) : null);
}
