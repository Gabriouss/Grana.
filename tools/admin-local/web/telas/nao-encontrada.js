// Caminho desconhecido fica visível e nunca vira sucesso silencioso.
export function montar(raiz, ctx) {
  ctx.cabecalho(raiz, 'Página não encontrada', 'Este endereço não corresponde a uma tela do painel.');
  raiz.appendChild(ctx.h('section', { class: 'estado estado-vazio', role: 'status' },
    ctx.h('p', { class: 'estado-texto', texto: `Endereço: ${ctx.params.caminho}` }),
    ctx.h('a', { class: 'botao', href: '#/visao-geral', texto: 'Voltar à visão geral' })));
}
