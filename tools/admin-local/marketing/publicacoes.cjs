'use strict';
// Contrato REAL fechado do browser. SQL, idempotência e Graph pertencem ao módulo remoto.
const { ErroMarketing, listarPecas } = require('./catalogo.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const acoes = ['prever', 'confirmar', 'cancelar', 'reagendar', 'pausar', 'retomar', 'reconciliar'];
function invalido() { throw new ErroMarketing('pedido-invalido', 'Confira os campos do pedido de publicação real.', 400); }
function fechado(p, campos) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !campos.includes(k))) invalido();
}
function uuid(v) { if (typeof v !== 'string' || !UUID.test(v)) invalido(); return v; }
function conta(v) { if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v)) invalido(); return v; }
function revisao(v) { if (!Number.isSafeInteger(v) || v < 1) invalido(); return v; }
function horario(p) {
  if (p.fuso !== 'America/Sao_Paulo' || typeof p.agendarPara !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(p.agendarPara)
    || !Number.isFinite(Date.parse(p.agendarPara))
    || new Date(p.agendarPara).toISOString().replace('.000Z', 'Z') !== p.agendarPara.replace('.000Z', 'Z')) invalido();
  return new Date(p.agendarPara).toISOString();
}
function validarPedido(p) {
  if (!p || !acoes.includes(p.acao)) invalido();
  if (p.acao === 'prever') {
    fechado(p, ['acao', 'pecaId', 'versao', 'destinos', 'agendarPara', 'fuso']);
    if (!/^[0-9a-f]{16}$/.test(p.pecaId || '') || !/^[0-9a-f]{40}$/.test(p.versao || '')
      || !Array.isArray(p.destinos) || p.destinos.length < 1 || p.destinos.length > 8) invalido();
    const publicarEm = horario(p), unicos = new Set();
    const destinos = p.destinos.map(d => {
      fechado(d, ['contaId', 'rede', 'formato']);
      conta(d.contaId);
      if (!['facebook', 'instagram'].includes(d.rede) || !['feed', 'carrossel', 'reels', 'stories'].includes(d.formato)) invalido();
      const chave = JSON.stringify([d.contaId, d.rede, d.formato]);
      if (unicos.has(chave)) invalido(); unicos.add(chave);
      return { ...d, publicarEm, fuso: p.fuso };
    });
    return { acao: 'previa', pecaId: p.pecaId, versao: p.versao, destinos };
  }
  const base = ['acao', 'revisaoEsperada', 'idempotencia', 'confirmacao'];
  const campos = p.acao === 'confirmar' ? ['previaId', 'previaHash']
    : ['pausar', 'retomar'].includes(p.acao) ? ['escopo', 'contaId']
    : p.acao === 'reagendar' ? ['jobId', 'agendarPara', 'fuso'] : ['jobId'];
  fechado(p, [...base, ...campos]);
  if (p.confirmacao !== true) throw new ErroMarketing('confirmacao-invalida', 'Confirme a ação para continuar.', 400);
  const r = { acao: p.acao, revisaoEsperada: revisao(p.revisaoEsperada), idempotencia: uuid(p.idempotencia), confirmado: true };
  if (p.acao === 'confirmar') {
    if (!/^[0-9a-f]{64}$/.test(p.previaHash || '')) invalido();
    return { ...r, previaId: uuid(p.previaId), previaHash: p.previaHash };
  }
  if (['pausar', 'retomar'].includes(p.acao)) {
    if (!['global', 'facebook', 'instagram', 'conta'].includes(p.escopo)) invalido();
    if (p.escopo !== 'conta' && p.contaId !== undefined) invalido();
    return { ...r, escopo: p.escopo, ...(p.escopo === 'conta' ? { contaId: conta(p.contaId) } : {}) };
  }
  return { ...r, jobId: uuid(p.jobId), ...(p.acao === 'reagendar' ? { publicarEm: horario(p), fuso: p.fuso } : {}) };
}
function criarPublicacoes({ remoto, catalogo = listarPecas } = {}) {
  const fonte = () => {
    const r = remoto || require('../adaptadores/marketing-backend.cjs').backend().publicacoes;
    if (!r) throw new ErroMarketing('modulo-remoto-pendente', 'Integração de publicações reais ainda indisponível.', 503);
    return r;
  };
  const operar = p => fonte().executar({ recurso: 'publicacoes-reais', modo: 'real', ...p });
  return {
    catalogo(raiz, filtros = {}) {
      fechado(filtros, ['semana', 'tipo']);
      const r = catalogo(raiz, filtros);
      return { pecas: r.pecas.filter(p => !p.capaDe).map(p => ({ id: p.id, titulo: p.titulo, versao: p.versao,
        tipo: p.tipo, aprovada: p.aprovada, miniaturaUrl: null,
        bloqueios: p.aprovada && p.aceite ? [] : [{ codigo: 'sem-aceite', mensagem: 'A peça precisa de aceite datado desta versão.' }] })), total: r.pecas.filter(p => !p.capaDe).length };
    },
    contas: () => operar({ acao: 'contas' }),
    listar(filtros = {}) {
      fechado(filtros, ['cursor', 'limite']);
      if (filtros.limite !== undefined && (!Number.isInteger(filtros.limite) || filtros.limite < 1 || filtros.limite > 50)) invalido();
      if (filtros.cursor !== undefined && (typeof filtros.cursor !== 'string' || filtros.cursor.length < 1 || filtros.cursor.length > 512)) invalido();
      return operar({ acao: 'listar', ...filtros });
    },
    detalhe(filtro) {
      fechado(filtro, ['jobId', 'loteId', 'idempotencia']);
      if (Object.keys(filtro).length !== 1) invalido();
      uuid(Object.values(filtro)[0]);
      return operar({ acao: 'consultar', ...filtro });
    },
    executar(raiz, corpo) {
      const p = validarPedido(corpo);
      return p.acao === 'previa' ? fonte().prever(raiz, p) : operar(p);
    },
    midia(previaId, indice) {
      uuid(previaId);
      if (indice !== 'capa' && !/^[0-9]$/.test(indice || '')) invalido();
      return fonte().midia(previaId, indice);
    },
  };
}
const instancia = criarPublicacoes();
module.exports = { criarPublicacoes, validarPedido, ...instancia };
