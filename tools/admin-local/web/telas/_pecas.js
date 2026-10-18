// Utilidades de peça de marketing, compartilhadas por Aprovação, Acervo, Calendário e Tráfego.
// O feed (Lumen) também pode importar daqui.

export function tituloPeca(p) {
  if (!p) return 'Peça';
  if (typeof p.nomeExibicao === 'string' && p.nomeExibicao.trim()) return p.nomeExibicao.trim();
  const formato = p.tipo === 'stories' || /^S\d/i.test(p.codigo || '') ? 'Stories'
    : ['video', 'reel', 'reels'].includes(p.tipo) ? 'Reels'
      : p.tipo === 'carrossel' ? 'Carrossel' : p.tipo === 'texto' ? 'Texto' : 'Post';
  const numero = Number(p.semana?.numero);
  return `${formato} · ${Number.isInteger(numero) && numero > 0 && numero <= 53 ? `Semana ${numero}` : 'Semana não informada'}`;
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
  superada: 'Substituída por revisão nova',
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

// Peça arquivada de fato. A revisão vigente escolhida no registro pode morar em historico/
// (R13 final) e mesmo assim é decidível: o servidor calcula estadoEfetivo, e é ele que vale.
export function arquivada(p) {
  return (p?.estadoEfetivo || p?.estado) === 'historico';
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
      // Registro explícito (familias.json): nome legível, pendência e revisões superadas, só leitura.
      return [{ chave: f.chave || f.id, principal: porId.get(f.principal?.id) || membros[0], pecas: membros,
        registro: f.registro || null, superadas: Array.isArray(f.superadas) ? f.superadas : [] }];
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

// Documento editorial de referência (o COPYS-FINAIS.md da semana): o catálogo lê dali as
// legendas, mas ele não é peça publicável. Fica fora da fila de Aprovação e do contador
// do menu, pelo MESMO predicado nos dois lugares, e continua acessível no Acervo.
export function ehReferenciaEditorial(p) {
  const nome = String(p?.nome || p?.caminho || '').split('/').pop();
  return /^COPYS-FINAIS\.md$/i.test(nome) || p?.papel === 'referencia';
}

// O que entra na mesa de Aprovação e no contador "Aprovação (N)".
export function pecaDaFila(p) {
  return ['para-aprovacao', 'aprovados', 'historico'].includes(p?.estado) && !ehReferenciaEditorial(p);
}

// Formato de apresentação de uma família, para os filtros Reels | Estáticos.
// Capa (pareada ou órfã) pertence ao Reel; o canal só vale quando há prova dele
// (planejamento gravado ou destino escrito no nome/pasta). Imagem 9:16 sozinha não
// prova Stories: sem prova, o formato fica "a conferir".
export function formatoDaPeca(p) {
  if (!p) return 'conferir';
  if (p.tipo === 'texto') return 'texto';
  if (p.tipo === 'video' || p.capaDe || p.capaOrfa || p.editorial?.tipo === 'capa') return 'reels';
  if (p.tipo === 'carrossel') return 'carrossel';
  const canal = p.planejamento?.canal || p.destino;
  if (canal === 'reels') return 'reels';
  if (canal === 'stories') return 'stories';
  if (canal === 'instagram-feed') return 'feed';
  const caminho = String(p.caminho || '').toLowerCase();
  if (/(^|[\/_-])stor(y|ies)([\/_.-]|$)/.test(caminho)) return 'stories';
  if (/(^|[\/_-])(feed|card)([\/_.-]|$)/.test(caminho)) return 'feed';
  return 'conferir';
}

// Capa de Reel nunca é card próprio: a família que só tem capas pareadas (capaDe) é
// absorvida pela família do vídeo, quando o vídeo está na mesma lista. Assim a galeria e o
// contador do menu contam o Reel uma vez só, e a capa pendente puxa o Reel para
// "Precisa de você". Capa cujo vídeo não está na lista continua visível, sozinha.
export function juntarCapasAoReel(familias) {
  const familiaDoVideo = new Map();
  for (const g of familias) for (const p of g.pecas) if (!p.capaDe) familiaDoVideo.set(p.id, g);
  const saida = [];
  for (const g of familias) {
    const soCapas = g.pecas.length > 0 && g.pecas.every((p) => p.capaDe);
    const alvo = soCapas ? familiaDoVideo.get(g.principal?.capaDe) : null;
    if (alvo && alvo !== g) {
      for (const p of g.pecas) if (!alvo.pecas.includes(p)) alvo.pecas.push(p);
      continue;
    }
    saida.push(g);
  }
  return saida;
}

export const ROTULOS_FORMATO = {
  reels: 'Reel', feed: 'Feed', stories: 'Stories', carrossel: 'Carrossel', texto: 'Texto', conferir: 'Formato a conferir',
};

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

// Só os campos públicos do contrato viram texto. IDs, lease e evidência livre
// nunca fazem parte da linha do tempo, mesmo se vierem junto na resposta.
export function historicoDaPeca(ctx, p, pedidos = []) {
  const { h } = ctx;
  const rotulos = {
    pedido: 'Pedido registrado', entrega: 'Peça entregue', correcao: 'Correção registrada',
    custo: 'Custo registrado', 'custo-autorizado': 'Custo autorizado pela conversa',
    'custo-recusado': 'Custo recusado pela conversa', aceite: 'Versão aceita',
    promocao: 'Movida para aprovados', data: 'Data marcada',
  };
  const fontes = [p.trilha?.eventos, ...pedidos.filter((r) => r.pecaId === p.id).map((r) => r.eventos)];
  const unicos = new Map();
  for (const eventos of fontes) {
    for (const e of Array.isArray(eventos) ? eventos : []) {
      if (!e || !Object.hasOwn(rotulos, e.tipo) || typeof e.em !== 'string' || !Number.isFinite(Date.parse(e.em))) continue;
      const valor = Number.isFinite(e.custo?.valorReais) && e.custo.valorReais >= 0 ? e.custo.valorReais : null;
      const data = /^\d{4}-\d{2}-\d{2}$/.test(e.data || '') ? e.data : null;
      const hora = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.hora || '') ? e.hora : null;
      const chave = JSON.stringify([e.tipo, Date.parse(e.em), valor, data, hora]);
      if (!unicos.has(chave)) unicos.set(chave, { tipo: e.tipo, em: e.em, valor, data, hora });
    }
  }
  const eventos = [...unicos.values()].sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
  return h('section', { class: 'demanda-historico', 'aria-label': 'Histórico da peça' },
    h('h3', { texto: 'Histórico da peça' }),
    eventos.length ? h('ol', { class: 'demanda-eventos' }, eventos.map((e) => {
      let texto = rotulos[e.tipo];
      if (e.tipo.startsWith('custo')) texto += e.valor === null ? ': valor não informado' : `: ${e.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
      if (e.tipo === 'data' && e.data) texto += `: ${ctx.formatar.data(e.data)}${e.hora ? ` às ${e.hora}` : ''}`;
      return h('li', { class: 'demanda-evento' },
        h('time', { class: 'demanda-evento-data', datetime: e.em, texto: ctx.formatar.dataHora(e.em) }),
        h('span', { class: 'demanda-evento-texto', texto }));
    })) : h('p', { class: 'campo-ajuda', texto: 'Ainda não há eventos registrados.' }));
}
