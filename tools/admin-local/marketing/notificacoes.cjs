'use strict';
// Sino e central de notificações do painel local (dono: Lumen).
//
// Contrato de partida: `marketing-notificacoes` do Harbor (E2, contratos-Harbor-META-2-4.md). O item
// real traz só id, codigo, importancia, agendamentoId, criadoEm, lidaEm e resolvidaEm, sem texto
// livre nem usuário. O texto que a pessoa lê sai da tabela CODIGOS abaixo, escrita aqui: nenhum
// texto vindo de fora chega à tela.
//
// A fonte remota usa o contrato E2 no servidor Node. Configuração/fundação ausentes
// deixam a fonte indisponível e contador null. GRANA_ADMIN_SIMULAR=1 escolhe o dublê
// em memória marcado como dados de teste; ele nunca substitui uma falha remota silenciosamente.

const { ErroMarketing } = require('./catalogo.cjs');
const config = require('../config.cjs');
const { backend } = require('../adaptadores/marketing-backend.cjs');

const CODIGOS = {
  'publicacao-precisa-conferir': { fonte: 'publicacoes', titulo: 'Confira o resultado no Instagram', resumo: 'A Meta não confirmou o resultado. Confira antes de repetir o envio.', acao: 'Conferir resultado', destino: '#/marketing/calendario' },
  'criativo-para-revisao': { fonte: 'criativos', titulo: 'Criativo pronto para sua revisão', resumo: 'Reel, versão 7. Confira as alterações e compare com a versão anterior.', acao: 'Revisar criativo', destino: '#/marketing/aprovacao' },
  'feedback-novo': { fonte: 'feedbacks', titulo: 'Novo feedback', resumo: 'Um novo relato aguarda sua análise.', acao: null, destino: null },
  'falha-reconciliada': { fonte: 'sistema', titulo: 'Falha de entrega resolvida', resumo: 'O envio que falhou foi reconciliado.', acao: null, destino: null },
};
const IMPORTANCIAS = new Set(['agir', 'informacao']);
const MAX_IDS = 50;
const ID = /^[a-z0-9-]{1,40}$/;

function sementes(agora = Date.now()) {
  const min = (m) => new Date(agora - m * 60_000).toISOString();
  const ontem = new Date(new Date(agora).setHours(15, 0, 0, 0) - 86_400_000).toISOString();
  return [
    { id: 'd1', codigo: 'publicacao-precisa-conferir', importancia: 'agir', criadoEm: min(4), lidaEm: null, resolvidaEm: null },
    { id: 'd2', codigo: 'criativo-para-revisao', importancia: 'agir', criadoEm: min(18), lidaEm: null, resolvidaEm: null },
    { id: 'd3', codigo: 'feedback-novo', importancia: 'informacao', criadoEm: min(32), lidaEm: null, resolvidaEm: null },
    { id: 'd4', codigo: 'falha-reconciliada', importancia: 'informacao', criadoEm: ontem, lidaEm: ontem, resolvidaEm: ontem },
  ];
}

let estado = sementes();

function publico(n) {
  const c = CODIGOS[n.codigo];
  return {
    id: n.id, codigo: n.codigo, importancia: IMPORTANCIAS.has(n.importancia) ? n.importancia : 'informacao',
    fonte: c ? c.fonte : 'sistema',
    titulo: c ? c.titulo : 'Notificação sem descrição',
    resumo: c ? c.resumo : 'Este tipo de notificação ainda não tem texto neste painel.',
    acao: c ? c.acao : null, destino: c ? c.destino : null,
    criadoEm: n.criadoEm, lidaEm: n.lidaEm, resolvidaEm: n.resolvidaEm,
  };
}

// GET /api/marketing/notificacoes
function listarTeste() {
  const notificacoes = estado.map(publico);
  return {
    fonte: 'dados-de-teste',
    aviso: 'Dados de teste: a fundação de notificações ainda não está ativa. Nada aqui foi enviado ou lido de um serviço real.',
    atualizadoEm: new Date().toISOString(),
    notificacoes,
    naoLidas: notificacoes.filter((n) => !n.lidaEm).length,
    proximaPagina: null,
  };
}

// POST /api/marketing/notificacoes/ler  { ids: [...], desfazer?: true }
// Leitura é reversível e não resolve nada: só mexe em lidaEm, e só de ids que existem.
function marcarTeste(raiz, corpo) {
  const ids = corpo && corpo.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_IDS || !ids.every((i) => typeof i === 'string' && ID.test(i))) {
    throw new ErroMarketing('ids-invalidos', `Mande de 1 a ${MAX_IDS} identificadores de notificação.`, 400);
  }
  const alvo = new Set(ids);
  const agora = new Date().toISOString();
  let atualizados = 0;
  estado = estado.map((n) => {
    if (!alvo.has(n.id)) return n;
    if (corpo.desfazer === true) { if (n.lidaEm) atualizados++; return { ...n, lidaEm: null }; }
    if (!n.lidaEm) { atualizados++; return { ...n, lidaEm: agora }; }
    return n;
  });
  return { atualizados, ...listarTeste() };
}

function listarNotificacoes() {
  if (config.SIMULAR) return listarTeste();
  return listarRemotas();
}
async function listarRemotas() {
  const dados = await backend().notificacoes({ recurso: 'marketing-notificacoes' });
  if (dados.status === 'indisponivel') return { ...dados, fonte: 'indisponivel', aviso: 'A fonte de notificações está indisponível. Nenhum contador foi presumido.', notificacoes: [], naoLidas: null, proximaPagina: null };
  return { ...dados, fonte: 'remota', atualizadoEm: new Date().toISOString(),
    notificacoes: dados.notificacoes.map(n => ({ ...publico(n), importancia: n.importancia === 'informacao' ? 'informacao' : 'agir' })) };
}
function marcarNotificacoes(raiz, corpo) {
  if (config.SIMULAR) return marcarTeste(raiz, corpo);
  return marcarRemotas(corpo);
}
async function marcarRemotas(corpo) {
  // O contrato remoto preserva a primeira leitura; desfazer não tem RPC aprovada.
  if (!corpo || Object.keys(corpo).some(k => !['ids', 'desfazer'].includes(k)) || (corpo.desfazer !== undefined && corpo.desfazer !== false)) {
    throw new ErroMarketing('pedido-invalido', 'Desfazer leitura não está disponível na fonte remota.', 400);
  }
  const r = await backend().notificacoes({ recurso: 'marketing-ler', ids: corpo.ids });
  if (r.status === 'indisponivel') return r;
  return { ...await listarNotificacoes(), atualizados: r.atualizados };
}
module.exports = { listarNotificacoes, marcarNotificacoes, CODIGOS, _reiniciar: () => { estado = sementes(); }, _listarTeste: listarTeste, _marcarTeste: marcarTeste };
