// Utilidades de peça de marketing, compartilhadas por Aprovação, Acervo, Calendário e Tráfego.
// O feed (Lumen) também pode importar daqui.

export function tituloPeca(p) {
  if (!p) return 'Peça';
  let nome = String(p.nome || p.titulo || p.id || '').split('/').pop();
  if (p.tipo === 'carrossel' && /\*/.test(nome)) nome = `carrossel de ${(p.arquivos || []).length || '?'} slides`;
  return p.codigo && !nome.startsWith(p.codigo) ? `${p.codigo} · ${nome}` : nome || p.codigo || 'Peça';
}

export function rotuloSemana(s) {
  if (!s) return 'sem semana';
  if (typeof s === 'string') return s;
  const fmt = (d) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '?');
  return `Semana ${s.numero} (${fmt(s.inicio)} a ${fmt(s.fim)})`;
}

const ESTADOS = {
  'para-aprovacao': 'Esperando aprovação',
  aprovados: 'Aprovada',
  historico: 'Histórico',
  apoio: 'Apoio',
  'aguardando-aceite': 'Esperando o seu aceite',
  aprovada: 'Aprovada',
  'aprovada-com-data': 'Aprovada, com data',
  'ajuste-pedido': 'Ajuste pedido',
};
export function rotuloEstado(p) {
  if (p.aprovada) return p.planejamento ? 'Aprovada, com data marcada' : 'Aprovada, sem data';
  return ESTADOS[p.estadoEfetivo] || ESTADOS[p.estado] || p.estadoEfetivo || p.estado || 'sem estado';
}

export const CANAIS = [
  { valor: 'instagram-feed', rotulo: 'Feed do Instagram' },
  { valor: 'stories', rotulo: 'Stories' },
  { valor: 'reels', rotulo: 'Reels' },
  { valor: 'anuncio', rotulo: 'Anúncio' },
];
export const rotuloCanal = (c) => (CANAIS.find((x) => x.valor === c) || { rotulo: c || 'sem canal' }).rotulo;

// Trilha Versão → Revisão → Aceite → Planejamento
export function trilha(ctx, p) {
  const { h } = ctx;
  const t = p.trilha || { versao: true, revisao: false, aceite: !!p.aprovada, planejamento: !!p.planejamento };
  const passos = [['versao', 'Versão'], ['revisao', 'Revisão'], ['aceite', 'Aceite'], ['planejamento', 'Planejamento']];
  const primeiroPendente = passos.findIndex(([k]) => !t[k]);
  return h('ol', { class: 'trilha', 'aria-label': 'Andamento da peça' }, passos.map(([k, rotulo], i) => h('li', {
    class: `trilha-passo${t[k] ? ' feito' : ''}${i === primeiroPendente ? ' atual' : ''}`,
    'aria-current': i === primeiroPendente ? 'step' : undefined,
  }, h('span', { class: 'trilha-rotulo', texto: rotulo }), h('span', { class: 'trilha-estado', texto: t[k] ? 'feito' : i === primeiroPendente ? 'agora' : 'depois' }))));
}
