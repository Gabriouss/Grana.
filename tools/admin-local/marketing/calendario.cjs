'use strict';
// Calendário de publicações do painel local (dono: Flare).
//
// O manifesto guarda previsão e dia D; calendario.json preserva substituições
// manuais e recibos pela chave estável. Aceite da versão exata projeta a previsão.
// Nenhum arquivo ou legenda é copiado. Planejar nunca publica na Meta.

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
  return require('./cronograma.cjs').projetarSeguro(raiz, dados);
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

function detalhesPlano(plano) {
  const estado = plano?.estado || null;
  const passos = {
    'vínculo inválido': 'Confira o vínculo no índice e escolha um item válido do cronograma.',
    'vínculo duplicado': 'Confira as peças ligadas a este item e escolha outro item para uma delas.',
    desatualizado: 'Atualize a lista e aceite a versão atual antes de planejar.',
    'cronograma inválido': 'Confira o manifesto e recarregue o calendário.',
    'sem data no cronograma': 'Escolha um item ativo do cronograma para ligar esta peça.',
    'aguardando dia D': 'Defina o Dia D para resolver a previsão desta peça.',
  };
  return {
    estadoCronograma: estado,
    motivo: passos[estado] ? estado : null,
    proximoPasso: passos[estado] || (!plano ? 'Ligue a peça ao cronograma ou escolha uma data.' : null),
    dataPrevista: plano?.dataPrevista || null,
    previsaoResolvida: plano?.dataPrevista ? { data: plano.dataPrevista.dataResolvida, hora: plano.dataPrevista.hora || null, canal: plano.dataPrevista.canal || null } : null,
    origem: plano?.origem || null, substituicaoManual: plano?.substituicaoManual || null,
    recibos: plano?.recibos || [], recibo: plano?.recibos?.find((r) => r.tipo === 'entrada-automatica') || null,
    legado: !!plano?.legado,
  };
}
function resumoPeca(p, plano = null) {
  const capa = p.arquivos[0] || null;
  // p.aceite já vem do catálogo filtrado pelo validador único (aceite-evidencia.cjs).
  const aceite = p.aceite || null;
  return {
    id: p.id,
    versao: p.versao,
    titulo: p.titulo,
    tipo: p.tipo,
    estado: p.estado,
    estadoEfetivo: p.estadoEfetivo,
    capa: capa ? { url: capa.url, tipo: capa.tipo } : null,
    semana: p.semana,
    // Projecao do registro exato; nunca um novo aceite no calendario.json.
    reciboAceite: aceite ? { tipo: 'aceite-autor', versaoPeca: aceite.versao, aprovadoEm: aceite.aprovadoEm, evidencia: aceite.evidencia } : null,
    ...detalhesPlano(plano),
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
  const aguardandoDiaD = [];
  const suspensos = [];
  const desatualizados = [];
  for (const plano of dados.planejados) {
    const p = porId.get(plano.id);
    if (!p || p.versao !== plano.versao || !p.aprovada || plano.estado === 'desatualizado' || p.capaDe) {
      // Peça trocou de versão, saiu do acervo ou perdeu o aceite: o plano não vale mais.
      desatualizados.push({ ...plano, estadoCronograma: 'desatualizado', proximoPasso: !p ? 'Confira o acervo e escolha outra peça.' : 'Atualize a lista e aceite a versão atual antes de planejar.', motivo: !p ? 'peça não está mais no acervo' : p.capaDe ? 'capa é componente do Reel; planeje o Reel' : p.estadoEfetivo === 'superada' ? 'revisão superada por outra da mesma família' : p.versao !== plano.versao ? 'peça mudou de versão depois do planejamento' : 'peça sem aceite para esta versão' });
      continue;
    }
    const registro = { data: plano.data, hora: plano.hora || null, canal: plano.canal, observacao: plano.observacao || null, peca: resumoPeca(p),
      estado: plano.estado || 'planejado', reciboAceite: resumoPeca(p).reciboAceite, ...detalhesPlano(plano) };
    if (plano.estado === 'aguardando dia D') { aguardandoDiaD.push(registro); continue; }
    if (['cronograma inválido', 'vínculo inválido', 'vínculo duplicado', 'sem data no cronograma'].includes(plano.estado)) { suspensos.push(registro); continue; }
    if (!plano.data || !['planejado', undefined].includes(plano.estado)) continue;
    if (plano.data.slice(0, 7) !== alvo) continue;
    itens.push(registro);
  }
  itens.sort((a, b) => `${a.data}${a.hora || ''}`.localeCompare(`${b.data}${b.hora || ''}`));

  const planejadosValidos = new Set(dados.planejados.filter((c) => c.estado === 'aguardando dia D' || (c.data && ['planejado', undefined].includes(c.estado))).map((c) => `${c.id}:${c.versao}`));
  const aprovadosSemData = pecas
    .filter((p) => p.aprovada && p.tipo !== 'texto' && !p.capaDe && !planejadosValidos.has(`${p.id}:${p.versao}`))
    .map((p) => resumoPeca(p, dados.planejados.find((r) => r.id === p.id && r.versao === p.versao)));

  const referenciaFunil = dados.referenciaFunil.map((r) => ({
    ...r,
    dataCalculada: dados.diaD && Number.isInteger(r.diasUteis) ? somarDiasUteis(dados.diaD, r.diasUteis) : null,
  }));

  const avisos = [...(dados.avisosCronograma || [])];
  if (aprovadosSemData.length) avisos.push(`${aprovadosSemData.length} ${aprovadosSemData.length === 1 ? 'peça aprovada está sem data válida' : 'peças aprovadas estão sem data válida'} no cronograma. Nenhuma data foi inferida.`);
  if (!dados.diaD) avisos.push('Dia D ainda não declarado. Nada da campanha é publicado antes dele (decisão do autor de 25/09/2026).');
  if (desatualizados.length) avisos.push(`${desatualizados.length} ${desatualizados.length === 1 ? 'planejamento perdeu a validade porque a peça mudou ou perdeu' : 'planejamentos perderam a validade porque a peça mudou ou perdeu'} o aceite.`);

  return {
    mes: alvo,
    diaD: dados.diaD,
    canais: CANAIS,
    itens,
    aguardandoDiaD,
    suspensos,
    aprovadosSemData,
    desatualizados,
    referenciaFunil,
    avisos,
  };
}

// POST /api/marketing/calendario  { id, versao, data, hora?, canal, observacao? }
// Com { id, remover: true } tira a peça do calendário.
function planejar(raiz, corpo = {}) {
  return serializar(raiz, () => {
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
    require('./catalogo.cjs').exigirVigente(peca, 'O planejamento');
    require('./catalogo.cjs').exigirItemAutonomo(peca, 'O planejamento');
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
    const cr = require('./cronograma.cjs');
    const anterior = dados.planejados.find((r) => r.id === peca.id && r.versao === peca.versao);
    const auto = anterior?.manifestoId ? anterior : null;
    const recibos = [...(anterior?.recibos || [])];
    // Legado tem a última marcação datada, mesmo sem lista de recibos.
    // Preserve essa evidência antes de substituir o registro manual.
    if (!auto && anterior?.planejadoEm && Number.isFinite(Date.parse(anterior.planejadoEm)) && dataValida(anterior.data) &&
      !recibos.some((r) => r.em === anterior.planejadoEm && (r.tipo === 'data-marcada' || r.acao === 'substituicao-manual'))) {
      recibos.push({ tipo: 'data-marcada', em: anterior.planejadoEm, data: anterior.data, hora: anterior.hora, canal: anterior.canal });
    }
    if (auto) {
      const substituicaoManual = { data: registro.data, hora: registro.hora, canal: registro.canal, observacao: registro.observacao };
      Object.assign(registro, auto, substituicaoManual, { planejadoEm: registro.planejadoEm, substituicaoManual, estado: 'planejado', recibos: [...recibos, { acao: 'substituicao-manual', em: registro.planejadoEm, data: registro.data, hora: registro.hora, canal: registro.canal }] });
    } else registro.recibos = [...recibos, { tipo: 'data-marcada', em: registro.planejadoEm, data: registro.data, hora: registro.hora, canal: registro.canal }];
    dados.planejados = dados.planejados.filter((c) => c.id !== peca.id);
    dados.planejados.push(registro);
    gravarJsonAtomico(caminhoPainel(raiz, ARQUIVO), dados);
    const avisos = ['Planejamento salvo no painel. Nada foi agendado no Instagram nem na Meta.'];
    cr.sincronizarComAviso(raiz, avisos, 'Planejamento salvo');
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
