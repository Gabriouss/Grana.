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

// Só une variantes explícitas dentro da mesma semana e do mesmo diretório
// de peças. O estado da pasta não muda a família; histórico fica separado.
export function familia(p) {
  const caminho = String(p.caminho || '');
  const m = /^(docs\/marketing\/\d{4}-\d{2}\/semana-\d{2}-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2})\/(para-aprovacao|aprovados|historico)\/(.+)\/([^/]+)$/.exec(caminho);
  if (p.familia) return p.familia;
  if (!m || !['video', 'imagem'].includes(p.tipo)) return `peca:${p.id}`;
  let nome = m[4].replace(/\.[^.]+$/, '');
  let anterior;
  do { anterior = nome; nome = nome.replace(/-(?:narrado|capa|v\d+)$/i, ''); } while (nome !== anterior);
  return `${m[1]}/${m[2] === 'historico' ? 'historico/' : ''}${m[3]}/${nome}`;
}

export function agruparFamilias(pecas, familiasServidor) {
  if (Array.isArray(familiasServidor)) {
    const porId = new Map(pecas.map((p) => [p.id, p]));
    const incluidos = new Set();
    const grupos = familiasServidor.flatMap((f) => {
      const itens = [f.principal, ...(f.alternativas || []), ...(f.capas || [])];
      const membros = [...new Map(itens.filter((p) => p && porId.has(p.id)).map((p) => [p.id, porId.get(p.id)])).values()];
      if (!membros.length) return [];
      membros.forEach((p) => incluidos.add(p.id));
      return [{ chave: f.chave || f.id, principal: porId.get(f.principal?.id) || membros[0], pecas: membros }];
    });
    // Uma peça fora de uma família válida permanece visível, sem adivinhar
    // outra família que altere o contrato usado pela recusa.
    return [...grupos, ...pecas.filter((p) => !incluidos.has(p.id)).map((p) => ({ chave: `peca:${p.id}`, principal: p, pecas: [p] }))];
  }
  const grupos = new Map();
  for (const p of pecas) {
    const chave = familia(p);
    if (!grupos.has(chave)) grupos.set(chave, { chave, pecas: [] });
    grupos.get(chave).pecas.push(p);
  }
  for (const grupo of grupos.values()) {
    grupo.pecas.sort((a, b) => {
      if (!!a.capaDe !== !!b.capaDe) return a.capaDe ? 1 : -1;
      const versao = (p) => Number(/-v(\d+)(?:-|\.)/i.exec(p.caminho || '')?.[1] || 0);
      const diferenca = versao(b) - versao(a);
      if (diferenca) return diferenca;
      if ((a.editorial?.tipo === 'canonico') !== (b.editorial?.tipo === 'canonico')) return a.editorial?.tipo === 'canonico' ? -1 : 1;
      return String(a.caminho || a.id).localeCompare(String(b.caminho || b.id));
    });
    grupo.principal = grupo.pecas.find((p) => !p.capaDe) || grupo.pecas[0];
  }
  return [...grupos.values()];
}

export function idadeDemanda(em, agora = Date.now()) {
  const instante = typeof em === 'string' ? Date.parse(em) : NaN;
  if (!Number.isFinite(instante) || instante > agora) return 'tempo não informado';
  const minutos = Math.floor((agora - instante) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
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
