'use strict';
// Calendário de publicações do painel local (dono: Flare).
//
// docs/marketing/painel/calendario.json guarda só o planejamento: peça,
// versão, data, hora e canal, mais o dia D quando o autor o declarar. Nenhum
// arquivo nem legenda é copiado. Só peça aprovada (aquela versão) recebe data;
// aprovar não inventa data. Planejar NÃO publica nem agenda em rede nenhuma.

const {
  ErroMarketing,
  agoraLocalIso,
  hojeLocal,
  caminhoPainel,
  lerJson,
  gravarJsonAtomico,
  serializar,
  dataValida,
  textoCurto,
  montarCatalogo,
  enriquecer,
  obterPeca,
} = require('./catalogo.cjs');

const ARQUIVO = 'calendario.json';
const CANAIS = ['instagram-feed', 'stories', 'reels', 'anuncio'];

function ler(raiz) {
  const dados = lerJson(caminhoPainel(raiz, ARQUIVO), { formato: 1, diaD: null, planejados: [], referenciaFunil: [] });
  if (!Array.isArray(dados.planejados)) dados.planejados = [];
  if (!Array.isArray(dados.referenciaFunil)) dados.referenciaFunil = [];
  return dados;
}

// D+n em dias úteis; D no fim de semana passa para a segunda (FUNIL.md, seção 5).
function somarDiasUteis(dataIso, n) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  const util = () => dt.getUTCDay() !== 0 && dt.getUTCDay() !== 6;
  while (!util()) dt.setUTCDate(dt.getUTCDate() + 1);
  let faltam = n;
  while (faltam > 0) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    if (util()) faltam -= 1;
  }
  return dt.toISOString().slice(0, 10);
}

function resumoPeca(p) {
  const capa = p.arquivos[0] || null;
  return {
    id: p.id,
    versao: p.versao,
    titulo: p.titulo,
    tipo: p.tipo,
    estado: p.estado,
    estadoEfetivo: p.estadoEfetivo,
    capa: capa ? { url: capa.url, tipo: capa.tipo } : null,
    semana: p.semana,
  };
}

// GET /api/marketing/calendario?mes=AAAA-MM
function obterCalendario(raiz, mes) {
  const alvo = mes || hojeLocal().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(alvo)) {
    throw new ErroMarketing('mes-invalido', 'Use o mês no formato AAAA-MM.', 400);
  }
  const dados = ler(raiz);
  const pecas = enriquecer(raiz, montarCatalogo(raiz));
  const porId = new Map(pecas.map((p) => [p.id, p]));

  const itens = [];
  const desatualizados = [];
  for (const plano of dados.planejados) {
    const p = porId.get(plano.id);
    if (!p || p.versao !== plano.versao || !p.aprovada) {
      // Peça trocou de versão, saiu do acervo ou perdeu o aceite: o plano não vale mais.
      desatualizados.push({ ...plano, motivo: !p ? 'peça não está mais no acervo' : p.versao !== plano.versao ? 'peça mudou de versão depois do planejamento' : 'peça sem aceite para esta versão' });
      continue;
    }
    if (plano.data.slice(0, 7) !== alvo) continue;
    itens.push({ data: plano.data, hora: plano.hora || null, canal: plano.canal, observacao: plano.observacao || null, peca: resumoPeca(p) });
  }
  itens.sort((a, b) => `${a.data}${a.hora || ''}`.localeCompare(`${b.data}${b.hora || ''}`));

  const planejadosValidos = new Set(dados.planejados.map((c) => `${c.id}:${c.versao}`));
  const aprovadosSemData = pecas
    .filter((p) => p.aprovada && p.tipo !== 'texto' && !planejadosValidos.has(`${p.id}:${p.versao}`))
    .map(resumoPeca);

  const referenciaFunil = dados.referenciaFunil.map((r) => ({
    ...r,
    dataCalculada: dados.diaD && Number.isInteger(r.diasUteis) ? somarDiasUteis(dados.diaD, r.diasUteis) : null,
  }));

  const avisos = [];
  if (!dados.diaD) avisos.push('Dia D ainda não declarado. Nada da campanha é publicado antes dele (decisão do autor de 25/09/2026).');
  if (desatualizados.length) avisos.push(`${desatualizados.length} planejamento(s) perderam a validade porque a peça mudou ou perdeu o aceite.`);

  return {
    mes: alvo,
    diaD: dados.diaD,
    canais: CANAIS,
    itens,
    aprovadosSemData,
    desatualizados,
    referenciaFunil,
    avisos,
  };
}

// POST /api/marketing/calendario  { id, versao, data, hora?, canal, observacao? }
// Com { id, remover: true } tira a peça do calendário.
function planejar(raiz, corpo = {}) {
  return serializar(() => {
    const dados = ler(raiz);
    if (corpo.remover === true) {
      const antes = dados.planejados.length;
      dados.planejados = dados.planejados.filter((c) => c.id !== corpo.id);
      if (dados.planejados.length === antes) throw new ErroMarketing('sem-planejamento', 'Esta peça não estava no calendário.', 404);
      gravarJsonAtomico(caminhoPainel(raiz, ARQUIVO), dados);
      return { removido: corpo.id, avisos: [] };
    }
    const peca = obterPeca(raiz, corpo.id);
    if (corpo.versao !== peca.versao) {
      throw new ErroMarketing('versao-mudou', 'A peça mudou depois que a tela foi aberta. Recarregue antes de planejar.', 409);
    }
    if (!peca.aprovada) {
      throw new ErroMarketing('sem-aceite', 'Só peça aprovada nesta versão entra no calendário.', 409);
    }
    if (!dataValida(corpo.data)) throw new ErroMarketing('data-invalida', 'Use uma data real no formato AAAA-MM-DD.', 400);
    const hora = corpo.hora == null || corpo.hora === '' ? null : String(corpo.hora);
    if (hora !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      throw new ErroMarketing('hora-invalida', 'Use a hora no formato HH:MM.', 400);
    }
    if (!CANAIS.includes(corpo.canal)) {
      throw new ErroMarketing('canal-invalido', `Canal precisa ser um destes: ${CANAIS.join(', ')}.`, 400);
    }
    const registro = {
      id: peca.id,
      caminho: peca.caminho,
      versao: peca.versao,
      data: corpo.data,
      hora,
      canal: corpo.canal,
      observacao: textoCurto(corpo.observacao, 500) || null,
      planejadoEm: agoraLocalIso(),
    };
    dados.planejados = dados.planejados.filter((c) => c.id !== peca.id);
    dados.planejados.push(registro);
    gravarJsonAtomico(caminhoPainel(raiz, ARQUIVO), dados);
    const avisos = ['Planejamento salvo no painel. Nada foi agendado no Instagram nem na Meta.'];
    if (!dados.diaD) avisos.push('O dia D ainda não foi declarado: a data é planejamento, não autorização de publicar.');
    else if (corpo.data < dados.diaD) avisos.push('A data escolhida é anterior ao dia D declarado.');
    return { planejamento: registro, avisos };
  });
}

module.exports = {
  obterCalendario,
  calendario: obterCalendario,
  listarCalendario: obterCalendario,
  listar: obterCalendario,
  planejar,
  salvar: planejar,
  somarDiasUteis,
  CANAIS,
};
