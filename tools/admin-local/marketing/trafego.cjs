'use strict';
// Tráfego pago planejado do painel local (dono: Flare).
//
// docs/marketing/painel/trafego.json guarda portas, pré-requisitos, limites de
// referência e campanhas planejadas. Nada é enviado à Meta: o painel só
// planeja. Os números de partida vêm do plano de verba curta (rascunho de
// 30/09/2026) e estão marcados como hipótese, não como resultado medido.

const crypto = require('crypto');
const {
  ErroMarketing,
  agoraLocalIso,
  caminhoPainel,
  lerJson,
  gravarJsonAtomico,
  serializar,
  dataValida,
  textoCurto,
  montarCatalogo,
  enriquecer,
} = require('./catalogo.cjs');

const ARQUIVO = 'trafego.json';
const STATUS = ['rascunho', 'pronta', 'no-ar', 'encerrada'];
const ORCAMENTO_DIARIO_MAX = 1000; // trava contra erro de digitação, em R$
const TETO_SEMANAL_AUTOR = 100; // parâmetro do autor em 22/09/2026, em R$

function ler(raiz) {
  const dados = lerJson(caminhoPainel(raiz, ARQUIVO), { formato: 1, campanhas: [] });
  if (!Array.isArray(dados.campanhas)) dados.campanhas = [];
  return dados;
}

// GET /api/marketing/trafego
function listarTrafego(raiz) {
  const dados = ler(raiz);
  const pecas = enriquecer(raiz, montarCatalogo(raiz));
  const porId = new Map(pecas.map((p) => [p.id, p]));
  const campanhas = dados.campanhas.map((c) => ({
    ...c,
    pecasVinculadas: (c.pecas || []).map((id) => {
      const p = porId.get(id);
      return p
        ? { id, titulo: p.titulo, tipo: p.tipo, aprovada: p.aprovada, capa: p.arquivos[0] ? p.arquivos[0].url : null }
        : { id, titulo: null, aprovada: false, ausente: true };
    }),
    orcamentoTotal: totalDe(c),
  }));
  const portasFechadas = (dados.portas || []).filter((p) => p.estado !== 'aberta').length;
  const avisos = ['Planejamento local. Nada aqui foi criado, pausado ou pago na Meta.'];
  if (portasFechadas) avisos.push(`${portasFechadas} porta(s) do plano ainda não abertas: a verba não abre.`);
  return { ...dados, campanhas, pecasAprovadasDisponiveis: pecas.filter((p) => p.aprovada && p.tipo !== 'texto').map((p) => ({ id: p.id, titulo: p.titulo, tipo: p.tipo })), avisos };
}

function totalDe(c) {
  if (typeof c.orcamentoDiario !== 'number') return null;
  if (Number.isInteger(c.dias)) return Math.round(c.orcamentoDiario * c.dias * 100) / 100;
  const p = c.periodo || {};
  if (p.inicio && p.fim && dataValida(p.inicio) && dataValida(p.fim)) {
    const dias = Math.round((Date.parse(p.fim) - Date.parse(p.inicio)) / 86400000) + 1;
    return dias > 0 ? Math.round(c.orcamentoDiario * dias * 100) / 100 : null;
  }
  return null;
}

// POST /api/marketing/trafego  cria (sem id) ou edita (com id) uma campanha.
// { id?, nome, objetivo, publico, orcamentoDiario, periodo:{inicio,fim,relativo?}, pecas:[ids], status, observacoes? }
function salvarCampanha(raiz, corpo = {}) {
  return serializar(() => {
    const dados = ler(raiz);
    const nome = textoCurto(corpo.nome, 120);
    if (!nome) throw new ErroMarketing('nome-vazio', 'Dê um nome à campanha.', 400);
    const status = corpo.status || 'rascunho';
    if (!STATUS.includes(status)) throw new ErroMarketing('status-invalido', `Status precisa ser um destes: ${STATUS.join(', ')}.`, 400);

    let orcamentoDiario = null;
    if (corpo.orcamentoDiario != null && corpo.orcamentoDiario !== '') {
      orcamentoDiario = Number(String(corpo.orcamentoDiario).replace(',', '.'));
      if (!Number.isFinite(orcamentoDiario) || orcamentoDiario <= 0 || orcamentoDiario > ORCAMENTO_DIARIO_MAX) {
        throw new ErroMarketing('orcamento-invalido', `Orçamento diário em R$ entre 0,01 e ${ORCAMENTO_DIARIO_MAX}.`, 400);
      }
      orcamentoDiario = Math.round(orcamentoDiario * 100) / 100;
    }

    const periodoIn = corpo.periodo || {};
    const periodo = {
      inicio: periodoIn.inicio || null,
      fim: periodoIn.fim || null,
      relativo: textoCurto(periodoIn.relativo, 60) || null,
    };
    for (const k of ['inicio', 'fim']) {
      if (periodo[k] && !dataValida(periodo[k])) throw new ErroMarketing('periodo-invalido', 'Datas do período no formato AAAA-MM-DD.', 400);
    }
    if (periodo.inicio && periodo.fim && periodo.fim < periodo.inicio) {
      throw new ErroMarketing('periodo-invalido', 'O fim do período vem antes do início.', 400);
    }

    const ids = Array.isArray(corpo.pecas) ? [...new Set(corpo.pecas.map(String))].slice(0, 20) : [];
    const pecas = enriquecer(raiz, montarCatalogo(raiz));
    const porId = new Map(pecas.map((p) => [p.id, p]));
    for (const id of ids) {
      const p = porId.get(id);
      if (!p) throw new ErroMarketing('peca-inexistente', 'Uma das peças vinculadas não está no acervo.', 404);
      if (!p.aprovada) throw new ErroMarketing('sem-aceite', `Anúncio só usa peça aprovada. "${p.titulo}" ainda não tem aceite nesta versão.`, 409);
    }
    if ((status === 'pronta' || status === 'no-ar') && ids.length === 0) {
      throw new ErroMarketing('sem-pecas', 'Campanha pronta ou no ar precisa de pelo menos uma peça aprovada.', 409);
    }
    if ((status === 'pronta' || status === 'no-ar') && orcamentoDiario == null) {
      throw new ErroMarketing('sem-orcamento', 'Campanha pronta ou no ar precisa de orçamento diário.', 409);
    }

    const agora = agoraLocalIso();
    let campanha = corpo.id ? dados.campanhas.find((c) => c.id === corpo.id) : null;
    if (corpo.id && !campanha) throw new ErroMarketing('campanha-inexistente', 'Campanha não encontrada.', 404);
    const campos = {
      nome,
      objetivo: textoCurto(corpo.objetivo, 300) || null,
      publico: textoCurto(corpo.publico, 600) || null,
      orcamentoDiario,
      dias: Number.isInteger(corpo.dias) && corpo.dias > 0 && corpo.dias <= 366 ? corpo.dias : (campanha ? campanha.dias : null),
      periodo,
      pecas: ids,
      status,
      observacoes: textoCurto(corpo.observacoes, 2000) || null,
      atualizadoEm: agora,
    };
    if (campanha) Object.assign(campanha, campos);
    else {
      campanha = { id: crypto.randomBytes(6).toString('hex'), origem: 'criada no painel local', criadoEm: agora, ...campos };
      dados.campanhas.push(campanha);
    }
    gravarJsonAtomico(caminhoPainel(raiz, ARQUIVO), dados);

    const avisos = ['Campanha salva no painel. Nada foi enviado à Meta.'];
    if (orcamentoDiario != null && orcamentoDiario * 7 > TETO_SEMANAL_AUTOR) {
      avisos.push(`Este orçamento passa de R$ ${TETO_SEMANAL_AUTOR} por semana, o teto que o autor deu em 22/09/2026. Precisa de nova decisão dele.`);
    }
    if (status === 'no-ar') avisos.push('Status "no ar" é só anotação: confirme no Gerenciador de Anúncios.');
    return { campanha: { ...campanha, orcamentoTotal: totalDe(campanha) }, avisos };
  });
}

module.exports = {
  listarTrafego,
  listarCampanhas: listarTrafego,
  listar: listarTrafego,
  salvarCampanha,
  salvar: salvarCampanha,
  STATUS,
};
