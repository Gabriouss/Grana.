// Aprovação: fila de para-aprovacao, prévia grande, trilha Versão → Revisão → Aceite → Planejamento.
// Aprovar grava o aceite do autor para AQUELA versão (sha1). Não publica nem agenda nada em rede social.

import { tituloPeca, rotuloSemana, rotuloEstado, trilha } from './_pecas.js';

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Aprovação', 'Aprovar registra o seu aceite desta versão exata. Nada é publicado nem agendado no Instagram.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);
  ctx.estado.carregando(corpo, 'Lendo o acervo de marketing…');

  let pecas;
  try {
    const r = await ctx.api('/api/marketing/pecas');
    pecas = r.dados?.pecas || [];
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return;
  }
  if (ctx.obsoleta()) return;

  const fila = pecas.filter((p) => p.estado === 'para-aprovacao')
    .sort((a, b) => (a.aprovada === b.aprovada ? String(b.semana?.inicio || '').localeCompare(String(a.semana?.inicio || '')) : a.aprovada ? 1 : -1));
  if (!fila.length) {
    ctx.estado.vazio(corpo, 'Nenhuma peça esperando aprovação. Quando um agente terminar uma peça, ela aparece aqui.');
    return;
  }

  let selecionada = fila.find((p) => p.id === ctx.params.peca) || fila.find((p) => !p.aprovada) || fila[0];
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  const lista = h('ul', { class: 'fila', 'aria-label': 'Peças esperando aprovação' });
  const detalhe = h('div', { class: 'fila-detalhe' });
  corpo.appendChild(h('div', { class: 'aprovacao' }, h('div', { class: 'fila-coluna' },
    h('p', { class: 'fila-contagem', texto: contagem(fila) }), lista), detalhe));

  const desenharLista = () => {
    while (lista.firstChild) lista.removeChild(lista.firstChild);
    for (const p of fila) {
      const item = h('li', null, h('button', {
        class: 'fila-item', type: 'button', 'aria-current': p === selecionada ? 'true' : undefined,
        onclick: () => { selecionada = p; desenharLista(); desenharDetalhe(); detalhe.focus({ preventScroll: false }); },
      },
      h('span', { class: 'fila-item-titulo', texto: tituloPeca(p) }),
      h('span', { class: 'fila-item-meta', texto: `${rotuloSemana(p.semana)} · ${p.tipo}` }),
      ctx.selo(p.aprovada ? 'ok' : p.ajuste ? 'alerta' : 'neutro', p.aprovada ? 'Aprovada' : p.ajuste ? 'Ajuste pedido' : 'Esperando')));
      lista.appendChild(item);
    }
  };

  const desenharDetalhe = () => {
    while (detalhe.firstChild) detalhe.removeChild(detalhe.firstChild);
    const p = selecionada;
    detalhe.setAttribute('tabindex', '-1');
    detalhe.setAttribute('aria-label', `Detalhe de ${tituloPeca(p)}`);
    detalhe.appendChild(h('h2', { class: 'secao-titulo', texto: tituloPeca(p) }));
    detalhe.appendChild(trilha(ctx, p));
    detalhe.appendChild(p.tipo === 'texto' ? previaTexto(ctx, p) : ctx.midia(p, { grande: true }));
    detalhe.appendChild(h('div', { class: 'peca-legenda' },
      h('h3', { texto: 'Legenda' }),
      p.legenda ? h('p', { class: 'texto-legenda', texto: p.legenda }) : h('p', { class: 'texto-fraco', texto: 'Sem legenda registrada para esta peça.' }),
      p.fonteLegenda ? h('p', { class: 'campo-ajuda', texto: `Fonte da legenda: ${p.fonteLegenda}` }) : null));
    detalhe.appendChild(h('dl', { class: 'lista-chave-valor' },
      h('dt', { texto: 'Estado' }), h('dd', { texto: rotuloEstado(p) }),
      h('dt', { texto: 'Semana' }), h('dd', { texto: rotuloSemana(p.semana) }),
      h('dt', { texto: 'Versão' }), h('dd', { class: 'mono', texto: String(p.versao || '').slice(0, 12) }),
      h('dt', { texto: 'Arquivo' }), h('dd', { class: 'mono quebra', texto: p.caminho }),
      p.aceite ? [h('dt', { texto: 'Aceite' }), h('dd', { texto: `${ctx.formatar.dataHora(p.aceite.aprovadoEm)}${p.aceite.evidencia ? `, ${p.aceite.evidencia}` : ''}` })] : null,
      p.ajuste ? [h('dt', { texto: 'Ajuste pedido' }), h('dd', { texto: `${p.ajuste.motivo || ''}${p.ajuste.pedidoEm ? ` (${ctx.formatar.dataHora(p.ajuste.pedidoEm)})` : ''}` })] : null));
    if (p.aceiteDeVersaoAnterior) detalhe.appendChild(ctx.alerta('atencao', 'Uma versão anterior desta peça foi aprovada, mas o arquivo mudou depois. O aceite antigo não vale para esta versão.'));
    if (p.indice) {
      detalhe.appendChild(h('details', { class: 'peca-indice' },
        h('summary', { texto: 'Linha do índice da semana (pareceres e pendências)' }),
        h('p', { class: 'campo-ajuda', texto: 'Parecer de revisor não é aceite seu. Só o botão abaixo registra aceite.' }),
        ctx.markdown(p.indice.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((x) => `- ${x.trim()}`).join('\n'))));
    }
    const botaoAprovar = h('button', { class: 'botao botao-primario', type: 'button', texto: p.aprovada ? 'Aprovada nesta versão' : 'Aprovar esta versão', disabled: !!p.aprovada,
      onclick: () => aprovar(ctx, p, botaoAprovar) });
    const botaoAjuste = h('button', { class: 'botao', type: 'button', texto: 'Pedir ajuste', onclick: () => pedirAjuste(ctx, p) });
    detalhe.appendChild(h('div', { class: 'bloco-acao' }, botaoAprovar, botaoAjuste,
      p.aprovada ? h('a', { class: 'botao botao-fantasma', href: '#/marketing/calendario', texto: 'Marcar data no calendário' }) : null));
  };

  desenharLista();
  desenharDetalhe();
}

function contagem(fila) {
  const esperando = fila.filter((p) => !p.aprovada).length;
  return esperando === 1 ? '1 peça esperando o seu aceite' : `${esperando} peças esperando o seu aceite`;
}

async function aprovar(ctx, p, botao) {
  const ok = await ctx.confirmar({
    titulo: 'Aprovar esta versão',
    texto: 'Isto registra o seu aceite desta peça e desta legenda, na versão que está na tela. Não publica, não agenda e não envia nada ao Instagram ou à Meta. Se o arquivo mudar depois, o aceite deixa de valer.',
    detalhes: [tituloPeca(p), `Versão ${String(p.versao || '').slice(0, 12)}`, p.legenda ? `Legenda: ${p.legenda.slice(0, 140)}${p.legenda.length > 140 ? '…' : ''}` : 'Sem legenda registrada'],
    frase: 'APROVAR', rotuloBotao: 'Aprovar',
  });
  if (!ok) return;
  botao.disabled = true;
  botao.textContent = 'Gravando aceite…';
  try {
    const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(p.id)}/aprovar`, { versao: p.versao, confirmacao: 'APROVAR' });
    ctx.aviso('Aceite gravado. A peça já aparece no feed e em "Aprovados sem data" no calendário.', 'ok');
    for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
    ctx.navegar(`#/marketing/aprovacao?peca=${encodeURIComponent(p.id)}`);
  } catch (err) {
    const texto = err.codigo === 'versao-mudou'
      ? 'A peça mudou depois que você abriu esta tela. Atualize e revise de novo antes de aprovar.'
      : `O aceite não foi gravado: ${err.message}`;
    ctx.aviso(texto, 'erro');
    botao.disabled = false;
    botao.textContent = 'Aprovar esta versão';
  }
}

async function pedirAjuste(ctx, p) {
  const v = await ctx.formulario({
    titulo: 'Pedir ajuste',
    texto: `O pedido fica registrado junto de "${tituloPeca(p)}", nesta versão. A peça continua na fila.`,
    campos: [{ nome: 'motivo', rotulo: 'O que precisa mudar', tipo: 'textarea', obrigatorio: true, linhas: 5, ajuda: 'Este texto fica gravado em docs/marketing/painel e vai para o GitHub público no próximo commit.' }],
    rotuloBotao: 'Registrar pedido',
  });
  if (!v) return;
  try {
    const r = await ctx.acao(`/api/marketing/pecas/${encodeURIComponent(p.id)}/ajuste`, { versao: p.versao, motivo: v.motivo });
    ctx.aviso('Pedido de ajuste registrado.', 'ok');
    for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
    ctx.navegar(`#/marketing/aprovacao?peca=${encodeURIComponent(p.id)}`);
  } catch (err) {
    ctx.aviso(`O pedido não foi registrado: ${err.message}`, 'erro');
  }
}

// Peça só de texto (copys, roteiro): mostra o próprio arquivo, para dar para ler
// o que se aprova sem sair do painel (achado F4 do Vigil). Markdown seguro do
// app.js, nunca HTML; .txt entra como texto corrido.
function previaTexto(ctx, p) {
  const { h } = ctx;
  const caixa = h('div', { class: 'previa previa-texto previa-documento' },
    h('p', { class: 'estado-texto', texto: 'Lendo o texto da peça…' }));
  const arq = (p.arquivos || []).map((a) => (typeof a === 'string' ? a : a && (a.url || a.caminho))).find((u) => /\.(md|txt)$/i.test(u || ''));
  if (!arq) {
    caixa.replaceChildren(h('p', { class: 'estado-texto', texto: 'Peça só de texto, sem arquivo .md ou .txt para mostrar. A legenda abaixo é o que existe.' }));
    return caixa;
  }
  const ctrl = new AbortController();
  const prazo = setTimeout(() => ctrl.abort(), 15000);
  fetch(ctx.urlArquivo(arq), { signal: ctrl.signal, cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(`o servidor respondeu ${r.status}`); return r.text(); })
    .then((texto) => {
      const limite = 200_000;
      const corpo = texto.length > limite ? `${texto.slice(0, limite)}\n\n(texto cortado no painel; abra o arquivo para ler o resto)` : texto;
      caixa.replaceChildren(/\.md$/i.test(arq) ? ctx.markdown(corpo) : h('p', { class: 'texto-legenda', texto: corpo }),
        h('a', { class: 'botao botao-fantasma', href: ctx.urlArquivo(arq), target: '_blank', rel: 'noopener', texto: 'Abrir o arquivo em outra aba' }));
    })
    .catch((err) => {
      caixa.replaceChildren(h('p', { class: 'estado-texto', texto: `Não consegui ler o texto da peça (${err.name === 'AbortError' ? 'demorou mais de 15 segundos' : err.message}).` }),
        h('a', { class: 'botao', href: ctx.urlArquivo(arq), target: '_blank', rel: 'noopener', texto: 'Tentar abrir o arquivo' }));
    })
    .finally(() => clearTimeout(prazo));
  return caixa;
}
