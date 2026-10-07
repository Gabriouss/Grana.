// Documento de marketing: DOCUMENTO-DE-MARKETING.md renderizado como texto seguro, com sumário.

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Documento de marketing', 'Só leitura. Para editar, mude o arquivo no repositório.');
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);
  ctx.estado.carregando(corpo, 'Lendo o documento…');

  let d;
  try {
    d = (await ctx.api('/api/marketing/documento')).dados || {};
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return;
  }
  if (ctx.obsoleta()) return;
  const texto = d.markdown ?? d.texto ?? '';
  if (!texto.trim()) { ctx.estado.vazio(corpo, 'O documento de marketing ainda está vazio.'); return; }
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  const doc = ctx.markdown(texto);
  const titulos = [...doc.querySelectorAll('h2, h3')];
  const sumario = titulos.length > 2 ? h('nav', { class: 'documento-sumario', 'aria-label': 'Sumário do documento' },
    h('h2', { class: 'secao-titulo', texto: 'Sumário' }),
    h('ol', null, titulos.map((t) => h('li', { class: t.tagName === 'H3' ? 'sumario-sub' : undefined },
      h('a', { href: `#${t.id}`, dados: { ancora: '1' }, texto: t.textContent }))))) : null;

  corpo.appendChild(h('div', { class: 'documento-layout' }, sumario, h('article', { class: 'documento-corpo' }, doc)));
  if (d.caminho) corpo.appendChild(h('p', { class: 'rodape-leitura', texto: `Fonte: ${d.caminho}` }));
}
