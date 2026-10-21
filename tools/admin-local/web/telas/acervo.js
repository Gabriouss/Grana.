// Acervo: todas as peças de docs/marketing, por semana e estado, com filtro.

import { tituloPeca, rotuloSemana, rotuloEstado, ehReferenciaEditorial } from './_pecas.js';

const FILTROS_ESTADO = [
  ['todos', 'Todas'], ['para-aprovacao', 'Esperando aprovação'], ['aprovadas', 'Aprovadas'], ['historico', 'Histórico'],
  ['superadas', 'Substituídas'],
];
const FILTROS_TIPO = [['todos', 'Todos os formatos'], ['imagem', 'Imagem'], ['carrossel', 'Carrossel'], ['video', 'Vídeo'], ['texto', 'Texto']];

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Acervo', 'Tudo o que está em docs/marketing, lido direto das pastas. Nada é copiado.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);
  ctx.estado.carregando(corpo, 'Lendo o acervo…');

  let pecas;
  try {
    const r = await ctx.api('/api/marketing/pecas');
    pecas = r.dados?.pecas || [];
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return;
  }
  if (ctx.obsoleta()) return;
  if (!pecas.length) { ctx.estado.vazio(corpo, 'O acervo está vazio. Nenhuma peça em para-aprovacao, aprovados ou historico.'); return; }
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  const filtro = { estado: ctx.params.estado || 'todos', tipo: ctx.params.tipo || 'todos', semana: ctx.params.semana || 'todas', busca: '' };
  const semanas = [...new Map(pecas.filter((p) => p.semana).map((p) => [String(p.semana.numero), p.semana])).values()]
    .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));

  const grupoChips = (rotulo, opcoes, chave) => {
    const g = h('div', { class: 'filtros', role: 'group', 'aria-label': rotulo });
    for (const [valor, texto] of opcoes) {
      g.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filtro[chave] === valor),
        onclick: async (e) => { filtro[chave] = valor; [...g.children].forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget))); if (valor === 'superadas') await lerSuperadas(); desenhar(); } , texto }));
    }
    return g;
  };
  const seletorSemana = h('select', { id: 'acervo-semana', onchange: (e) => { filtro.semana = e.target.value; desenhar(); } },
    h('option', { value: 'todas', texto: 'Todas as semanas' }),
    semanas.map((s) => h('option', { value: String(s.numero), texto: rotuloSemana(s), selected: filtro.semana === String(s.numero) })));
  const busca = h('input', { id: 'acervo-busca', type: 'search', placeholder: 'Assunto ou código da peça', autocomplete: 'off',
    oninput: (e) => { filtro.busca = e.target.value.trim().toLowerCase(); desenhar(); } });

  corpo.appendChild(h('div', { class: 'barra-filtros' },
    grupoChips('Estado', FILTROS_ESTADO, 'estado'),
    grupoChips('Formato', FILTROS_TIPO, 'tipo'),
    h('div', { class: 'form-linha' },
      h('div', { class: 'campo' }, h('label', { for: 'acervo-semana', texto: 'Período' }), seletorSemana),
      h('div', { class: 'campo' }, h('label', { for: 'acervo-busca', texto: 'Buscar' }), busca))));

  const resumo = h('p', { class: 'fila-contagem', 'aria-live': 'polite' });
  const galeria = h('div', { class: 'galeria' });
  corpo.appendChild(resumo);
  corpo.appendChild(galeria);

  // Revisões substituídas não vêm na lista padrão (contrato do Keel, 0a9af01): pedidas só quando o filtro abre.
  let superadas = null;
  let erroSuperadas = null;
  const lerSuperadas = async () => {
    if (superadas) return;
    try {
      const r = await ctx.api('/api/marketing/pecas?estado=superada');
      superadas = (r.dados?.pecas || []).filter((p) => p.estadoEfetivo === 'superada');
      erroSuperadas = null;
    } catch (err) { erroSuperadas = err; }
  };
  const passa = (p) => {
    if (filtro.estado === 'superadas') return p.estadoEfetivo === 'superada' && passaResto(p);
    if (filtro.estado === 'aprovadas' ? !p.aprovada : filtro.estado !== 'todos' && p.estado !== filtro.estado) return false;
    return passaResto(p);
  };
  const passaResto = (p) => {
    if (filtro.tipo !== 'todos' && p.tipo !== filtro.tipo) return false;
    if (filtro.semana !== 'todas' && String(p.semana?.numero) !== filtro.semana) return false;
    if (filtro.busca && !`${p.nomeExibicao || ''} ${p.codigo || ''} ${p.nome || ''} ${p.caminho || ''}`.toLowerCase().includes(filtro.busca)) return false;
    return true;
  };

  const desenhar = () => {
    while (galeria.firstChild) galeria.removeChild(galeria.firstChild);
    const base = filtro.estado === 'superadas' ? superadas || [] : pecas;
    if (filtro.estado === 'superadas' && erroSuperadas) {
      resumo.textContent = '';
      galeria.appendChild(ctx.alerta('atencao', `Não foi possível ler as revisões substituídas: ${erroSuperadas.message || 'erro sem detalhe'}. Atualize para tentar de novo.`));
      return;
    }
    const vis = base.filter(passa);
    resumo.textContent = filtro.estado === 'superadas' ? `${vis.length} ${vis.length === 1 ? 'revisão substituída' : 'revisões substituídas'}` : `${vis.length} de ${pecas.length} peças`;
    if (!vis.length) { galeria.appendChild(ctx.estado.bloco.vazio(filtro.estado === 'superadas' ? 'Nenhuma revisão substituída com esses filtros.' : 'Nenhuma peça com esses filtros.')); return; }
    for (const p of vis) {
      galeria.appendChild(h('article', { class: 'peca' },
        h('div', { class: 'peca-midia' }, ctx.midia(p)),
        h('div', { class: 'peca-info' },
          h('h2', { class: 'peca-titulo', texto: tituloPeca(p) }),
          p.tipo === 'video' && !p.capa?.url ? h('p', { class: 'campo-ajuda', texto: 'Vídeo sem capa vinculada nesta versão.' }) : null,
          h('p', { class: 'peca-meta', texto: `${rotuloSemana(p.semana)} · ${p.tipo}${p.arquivos?.length > 1 ? ` · ${p.arquivos.length} arquivos` : ''}` }),
          ehReferenciaEditorial(p)
            ? h('span', { class: 'peca-estado selo selo-neutro', texto: 'Referência editorial, fora da Aprovação' })
            : h('span', { class: `peca-estado selo selo-${p.aprovada ? 'ok' : p.estadoEfetivo === 'superada' || p.estado === 'historico' ? 'neutro' : p.ajuste ? 'alerta' : 'neutro'}`, texto: rotuloEstado(p) }),
          p.estadoEfetivo === 'superada' && p.revisao?.vigenteCaminho ? h('p', { class: 'campo-ajuda', texto: `Substituída por ${p.revisao.vigenteCaminho.split('/').pop()}${p.revisao.nome ? `, em ${p.revisao.nome}` : ''}.` }) : null,
          p.legenda ? h('p', { class: 'peca-legenda-curta', texto: p.legenda.length > 160 ? `${p.legenda.slice(0, 160)}…` : p.legenda }) : null,
          p.tipo === 'texto' && p.arquivos?.[0]?.url ? h('a', { href: p.arquivos[0].url, target: '_blank', rel: 'noopener', texto: 'Abrir texto' }) : null,
          p.estado === 'para-aprovacao' && !ehReferenciaEditorial(p) && p.estadoEfetivo !== 'superada' ? h('a', { class: 'botao botao-fantasma', href: `#/marketing/aprovacao?peca=${encodeURIComponent(p.id)}`, texto: 'Revisar' }) : null)));
    }
  };
  if (filtro.estado === 'superadas') await lerSuperadas();
  if (ctx.obsoleta()) return;
  desenhar();
}
