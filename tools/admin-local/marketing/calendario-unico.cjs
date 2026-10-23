'use strict';

const { ErroMarketing, hojeLocal, listarPecas } = require('./catalogo.cjs');
const { obterCalendario } = require('./calendario.cjs');
const { temLegenda } = require('./legenda-publicacao.cjs');
const FUSO = 'America/Sao_Paulo';
const dataLocal = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalido(codigo, mensagem) { throw new ErroMarketing(codigo, mensagem, 400); }
function validarCursor(cursor) {
  if (typeof cursor !== 'string' || !cursor.length || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    invalido('cursor-invalido', 'Atualize o calendário para reiniciar a consulta.');
  }
  let v;
  try { v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { /* tratado abaixo */ }
  if (!v || Array.isArray(v) || Object.keys(v).sort().join(',') !== 'criadoEm,id' || !uuid.test(v.id)
    || typeof v.criadoEm !== 'string' || !Number.isFinite(Date.parse(v.criadoEm))) {
    invalido('cursor-invalido', 'Atualize o calendário para reiniciar a consulta.');
  }
}
function criarCalendarioUnico({ editorial = obterCalendario, catalogo = listarPecas,
  listar = p => require('./publicacoes.cjs').listar(p), agora = () => new Date(), log = codigo => console.error(codigo) } = {}) {
  return async function calendario(raiz, filtros = {}) {
    if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)
      || Object.keys(filtros).some(k => !['mes', 'camada', 'cursorReal'].includes(k))) invalido('pedido-invalido', 'Confira os filtros do calendário.');
    const mes = filtros.mes === undefined ? hojeLocal().slice(0, 7) : filtros.mes;
    if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) invalido('mes-invalido', 'Use o mês no formato AAAA-MM.');
    const camada = filtros.camada === undefined ? 'ambos' : filtros.camada;
    if (!['planejado', 'real', 'ambos'].includes(camada)) invalido('camada-invalida', 'Escolha planejado, real ou ambos.');
    if (filtros.cursorReal !== undefined) validarCursor(filtros.cursorReal);
    const base = editorial(raiz, mes);
    const pecas = catalogo(raiz).pecas;
    const pendenciasLegenda = pecas.filter(p => p.aprovada && !temLegenda(p)).map(p => ({
      pecaId: p.id, versao: p.versao, titulo: p.titulo, nomeExibicao: p.nomeExibicao, codigo: 'legenda-obrigatoria', motivo: 'Falta a legenda para publicar',
    }));
    const reais = { status: 'nao-consultado', itens: [], completo: false, proximoCursor: null,
      continuacao: filtros.cursorReal !== undefined, motivo: null, consultadoEm: null };
    const confirmados = [];
    const avisos = [...(base.avisos || [])];
    if (camada !== 'planejado') {
      try {
        const pagina = await listar({ limite: 50, ...(filtros.cursorReal !== undefined ? { cursor: filtros.cursorReal } : {}) });
        if (!pagina || !Array.isArray(pagina.jobs) || typeof pagina.limitado !== 'boolean'
          || (pagina.limitado && (typeof pagina.proximoCursor !== 'string' || !pagina.proximoCursor))
          || (!pagina.limitado && pagina.proximoCursor != null)) throw new Error('pagina-invalida');
        if (pagina.limitado) validarCursor(pagina.proximoCursor);
        if (pagina.limitado && pagina.proximoCursor === filtros.cursorReal) throw new Error('cursor-sem-avanco');
        const vistos = new Map();
        for (const job of pagina.jobs) {
          if (!job || !uuid.test(job.jobId) || !job.peca || !/^[0-9a-f]{16}$/.test(job.peca.pecaId || '')
            || !/^[0-9a-f]{40}$/.test(job.peca.versao || '') || !job.destino
            || typeof job.destino.publicarEm !== 'string' || !Number.isFinite(Date.parse(job.destino.publicarEm))) throw new Error('job-invalido');
          // Prévia nunca se projeta na camada real. Só a confirmação explícita cria o cartão.
          if (!job.confirmadoEm || !Number.isFinite(Date.parse(job.confirmadoEm))) continue;
          const partes = Object.fromEntries(dataLocal.formatToParts(new Date(job.destino.publicarEm)).map(p => [p.type, p.value]));
          const data = `${partes.year}-${partes.month}-${partes.day}`;
          let permalink = null;
          if (typeof job.permalink === 'string') {
            try { const u = new URL(job.permalink); if (u.protocol === 'https:' && !u.username && !u.password) permalink = u.href; } catch { /* sem link comprovado */ }
          }
          const item = { ...job, permalink, data, fuso: FUSO };
          const anterior = vistos.get(job.jobId);
          if (!anterior || Number(job.revisao) > Number(anterior.revisao)) vistos.set(job.jobId, item);
        }
        confirmados.push(...vistos.values());
        Object.assign(reais, { status: pagina.limitado ? 'parcial' : 'disponivel', itens: confirmados.filter(j => j.data.slice(0, 7) === mes),
          incidentes: pagina.incidentes, naoReconhecidos: pagina.naoReconhecidos, incidentesLimitados: pagina.incidentesLimitados, incidentesDisponiveis: pagina.incidentesDisponiveis,
          completo: !pagina.limitado, proximoCursor: pagina.proximoCursor || null, consultadoEm: agora().toISOString() });
        if (!reais.completo) avisos.push('Leitura parcial dos agendamentos. Há mais resultados para consultar.');
        if (reais.itens.some(j => j.estado === 'publicado' && !j.permalink)) avisos.push('O link da publicação não está disponível nesta fonte. Consulte o ID e o recibo.');
      } catch {
        log('[painel] calendario-real-fonte-indisponivel');
        Object.assign(reais, { status: 'indisponivel', motivo: 'fonte-indisponivel', consultadoEm: agora().toISOString() });
        avisos.push('Não foi possível consultar os agendamentos reais. Preserve os resultados anteriores e tente novamente.');
      }
    }
    const vinculos = new Map();
    // Vínculos incluem também o outro mês: reagendar não deve ressuscitar o
    // cartão editorial no mês antigo. A coleção real visível continua mensal.
    for (const job of confirmados) {
      const { pecaId, versao } = job.peca, chave = `${pecaId}:${versao}`;
      if (!vinculos.has(chave)) vinculos.set(chave, { pecaId, versao, jobIds: [], destinos: [] });
      vinculos.get(chave).jobIds.push(job.jobId);
      vinculos.get(chave).destinos.push({ jobId: job.jobId, revisao: job.revisao, estado: job.estado, data: job.data, publicarEm: job.destino.publicarEm });
    }
    return { ...base, mes, camada, fuso: FUSO, reais, vinculos: [...vinculos.values()], pendenciasLegenda, avisos };
  };
}
const calendario = criarCalendarioUnico();
module.exports = { criarCalendarioUnico, calendario, validarCursor };
