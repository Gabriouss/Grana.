'use strict';
// Contrato REAL fechado do browser. SQL, idempotência e Graph pertencem ao módulo remoto.
const { ErroMarketing, listarPecas, obterPeca: obterPecaCatalogo, caminhoSeguro } = require('./catalogo.cjs');
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
    const reagendamento = p.jobId !== undefined;
    fechado(p, ['acao', ...(reagendamento ? ['jobId'] : ['pecaId', 'versao']), 'destinos', 'agendarPara', 'fuso']);
    if (reagendamento) uuid(p.jobId);
    if ((!reagendamento && (!/^[0-9a-f]{16}$/.test(p.pecaId || '') || !/^[0-9a-f]{40}$/.test(p.versao || '')))
      || !Array.isArray(p.destinos) || p.destinos.length < 1 || p.destinos.length > 8) invalido();
    if (reagendamento && p.destinos.length !== 1) invalido();
    const publicarEm = horario(p), unicos = new Set();
    const destinos = p.destinos.map(d => {
      fechado(d, ['contaId', 'rede', 'formato']);
      conta(d.contaId);
      if (!['facebook', 'instagram'].includes(d.rede) || !['feed', 'carrossel', 'reels', 'stories'].includes(d.formato)) invalido();
      const chave = JSON.stringify([d.contaId, d.rede, d.formato]);
      if (unicos.has(chave)) invalido(); unicos.add(chave);
      return { ...d, publicarEm, fuso: p.fuso };
    });
    return { acao: 'previa', ...(reagendamento ? { jobId: p.jobId } : { pecaId: p.pecaId, versao: p.versao }), destinos };
  }
  const base = ['acao', 'revisaoEsperada', 'idempotencia', 'confirmacao'];
  const campos = p.acao === 'confirmar' ? ['previaId', 'previaHash']
    : ['pausar', 'retomar'].includes(p.acao) ? ['escopo', 'contaId']
    : p.acao === 'reagendar' ? ['jobId', 'agendarPara', 'fuso', 'previaId', 'previaHash'] : ['jobId'];
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
  if (p.acao === 'reagendar' && !/^[0-9a-f]{64}$/.test(p.previaHash || '')) invalido();
  return { ...r, jobId: uuid(p.jobId), ...(p.acao === 'reagendar'
    ? { publicarEm: horario(p), fuso: p.fuso, previaId: uuid(p.previaId), previaHash: p.previaHash } : {}) };
}
function criarPublicacoes({ remoto, catalogo = listarPecas, obterPeca = obterPecaCatalogo, estado: estadoInjetado } = {}) {
  let estadoLocal;
  const estado = () => estadoInjetado || estadoLocal || (estadoLocal = require('./publicacoes-reais-estado.cjs').criarEstado());
  const fonte = () => {
    const r = remoto || require('../adaptadores/marketing-backend.cjs').backend().publicacoes;
    if (!r) throw new ErroMarketing('modulo-remoto-pendente', 'Integração de publicações reais ainda indisponível.', 503);
    return r;
  };
  const operar = p => fonte().executar({ recurso: 'publicacoes-reais', modo: 'real', ...p });
  /* Confirmação com identidade persistida ANTES da chamada remota (achado C3 do Watchtower):
     a primeira confirmação de uma prévia grava a chave no estado privado do PC; prazo
     esgotado, reinício ou um segundo clique com outra chave repetem a MESMA chave e o MESMO
     pedido, e o servidor devolve o mesmo lote (replay) em vez de criar outro. */
  async function confirmar(p) {
    const r = await estado().reservarConfirmacao({ previaId: p.previaId, previaHash: p.previaHash,
      revisaoEsperada: p.revisaoEsperada, idempotencia: p.idempotencia });
    const dados = await operar({ ...p, revisaoEsperada: r.revisaoEsperada, idempotencia: r.idempotencia });
    await estado().concluirConfirmacao({ previaId: p.previaId, previaHash: p.previaHash, loteId: dados?.loteId ?? null });
    return dados;
  }
  // Só peça com aceite datado válido desta versão é selecionável (mesmo predicado da captura).
  const motivo = (raiz, p) => require('./snapshot-local.cjs').motivoSemAceite(raiz, p);
  const MENSAGEM_SEM_ACEITE = 'A peça precisa de aceite datado desta versão.';
  return {
    catalogo(raiz, filtros = {}) {
      fechado(filtros, ['semana', 'tipo']);
      const pecas = catalogo(raiz, filtros).pecas.filter(p => !p.capaDe && p.tipo !== 'texto' && p.aprovada);
      return { pecas: pecas.map(p => {
        const m = motivo(raiz, p);
        const imagem = p.capa?.url || p.arquivos?.find(a => a.tipo === 'imagem')?.url;
        return { id: p.id, titulo: p.nomeExibicao || p.titulo, nomeExibicao: p.nomeExibicao, versao: p.versao, tipo: p.tipo, aprovada: !m,
          miniaturaUrl: !m && imagem ? `/api/marketing/publicacoes/miniatura?pecaId=${p.id}` : null,
          bloqueios: m ? [{ codigo: m, mensagem: MENSAGEM_SEM_ACEITE }] : [] };
      }), total: pecas.length };
    },
    // Miniatura autenticada (sessão + X-Grana-Admin pela rota), só de peça agendável, só imagem.
    async miniatura(raiz, pecaId) {
      if (!/^[0-9a-f]{16}$/.test(pecaId || '')) invalido();
      const p = await obterPeca(raiz, pecaId);
      if (!p || p.capaDe || motivo(raiz, p)) throw new ErroMarketing('sem-aceite', MENSAGEM_SEM_ACEITE, 409);
      const a = p.capa?.url ? p.capa : p.arquivos?.find(x => x.tipo === 'imagem');
      const rel = typeof a?.url === 'string' && a.url.startsWith('/') ? decodeURIComponent(a.url.slice(1)) : '';
      if (!/^docs\/marketing\/\d{4}-\d{2}\/semana-[^/]+\/(?:para-aprovacao|aprovados|historico)\//.test(rel)) {
        throw new ErroMarketing('midia-inexistente', 'Esta peça não tem imagem para miniatura.', 404);
      }
      const arquivo = caminhoSeguro(raiz, rel);
      const fs = require('node:fs');
      const { MAX_ARQUIVO, detectarMime } = require('./previa-conteudo.cjs');
      const stat = fs.statSync(arquivo);
      if (!stat.isFile() || stat.size < 1 || stat.size > MAX_ARQUIVO) throw new ErroMarketing('midia-grande', 'Imagem grande demais para miniatura.', 413);
      const conteudo = fs.readFileSync(arquivo);
      const mime = detectarMime(conteudo.subarray(0, 12));
      if (mime !== 'image/png' && mime !== 'image/jpeg') throw new ErroMarketing('midia-invalida', 'A miniatura precisa ser PNG ou JPEG.', 415);
      return { conteudo, mime };
    },
    contas: () => operar({ acao: 'contas' }),
    // Cursor opaco para o browser; o servidor usa {id,criadoEm}.
    async listar(filtros = {}) {
      fechado(filtros, ['cursor', 'limite']);
      if (filtros.limite !== undefined && (!Number.isInteger(filtros.limite) || filtros.limite < 1 || filtros.limite > 50)) invalido();
      if (filtros.cursor !== undefined && (typeof filtros.cursor !== 'string' || filtros.cursor.length < 1 || filtros.cursor.length > 512)) invalido();
      const pedido = { acao: 'listar', ...(filtros.limite ? { limite: filtros.limite } : {}) };
      if (filtros.cursor !== undefined) {
        let c;
        try { c = JSON.parse(Buffer.from(filtros.cursor, 'base64url').toString('utf8')); } catch { invalido(); }
        fechado(c, ['id', 'criadoEm']); uuid(c.id);
        if (typeof c.criadoEm !== 'string' || !Number.isFinite(Date.parse(c.criadoEm))) invalido();
        pedido.cursor = { id: c.id, criadoEm: c.criadoEm };
      }
      const r = await operar(pedido);
      const prox = r?.proximoCursor;
      return { ...r, proximoCursor: prox && typeof prox === 'object'
        ? Buffer.from(JSON.stringify({ id: prox.id, criadoEm: prox.criadoEm })).toString('base64url') : null };
    },
    detalhe(filtro) {
      fechado(filtro, ['jobId', 'loteId', 'idempotencia']);
      if (Object.keys(filtro).length !== 1) invalido();
      uuid(Object.values(filtro)[0]);
      return operar({ acao: 'consultar', ...filtro });
    },
    executar(raiz, corpo) {
      const p = validarPedido(corpo);
      if (p.acao === 'previa') return fonte().prever(raiz, p);
      if (p.acao === 'confirmar') return confirmar(p);
      return operar(p);
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
