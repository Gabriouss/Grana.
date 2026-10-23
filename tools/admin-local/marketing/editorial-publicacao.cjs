'use strict';
const c = require('./catalogo.cjs');
const ids = require('./identidade-publicacao.cjs');
const CONTRATO = 'e5.real.v2';
const ESTADOS = ['em-revisao', 'aguardando-aceite', 'aceito'];
const erro = codigo => new c.ErroMarketing(codigo,
  'Nao foi possivel conferir a revisao no servidor. Preserve a peca e tente novamente conectado.', 409);
function validarEstado(r) {
  if (r?.contractVersion !== CONTRATO || !ids.UUID.test(r.conteudoId)
    || !Number.isSafeInteger(r.geracaoEditorial) || r.geracaoEditorial < 1
    || !ids.VERSAO.test(r.versaoAtual) || !ESTADOS.includes(r.estadoEditorial)) throw erro('editorial-contrato-invalido');
}
function criarEditorial({ remoto, obterPeca = c.obterPeca,
  habilitado = raiz => {
    const ativacao = c.lerJson(c.caminhoPainel(raiz, 'editorial-publicacao.json'), {});
    return ativacao.contractVersion === CONTRATO && ativacao.habilitado === true;
  }, log = codigo => console.error('[painel] ' + codigo) } = {}) {
  const fonte = () => remoto || require('../adaptadores/marketing-backend.cjs').backend().publicacoes;
  const operar = p => fonte().executar({ recurso: 'publicacoes-reais', modo: 'real', contractVersion: CONTRATO, ...p });
  const unidade = (raiz, p) => p.capaDe ? obterPeca(raiz, p.capaDe) : p;
  const ativo = (raiz, p) => habilitado(raiz) || !!ids.buscar(raiz, p.id)?.remoto;
  async function consultar(raiz, p) {
    const r = await operar({ acao: 'acompanhar', pecaId: p.id });
    if (r?.contractVersion !== CONTRATO || !Array.isArray(r.jobs) || typeof r.legadoPendente !== 'boolean') throw erro('editorial-contrato-invalido');
    if (r.conteudoId != null) validarEstado(r);
    return r;
  }
  async function resolver(raiz, p, criar) {
    let r = ids.buscar(raiz, p.id);
    // A RPC pode ter terminado sem a resposta chegar. Repetir o pedido gravado
    // ANTES de comparar a geracao evita confundir esse caso com outra maquina.
    for (const pendente of Object.values(r?.pendentes || {})) {
      if (pendente.versao !== p.versao || pendente.pecaId !== p.id) throw erro('editorial-resposta-pendente');
      r = await enviar(raiz, r, pendente.operacao, p, pendente.motivo ? { motivo: pendente.motivo } : {});
    }
    // Consultar inclusive com identidade local: a outra maquina pode estar adiante.
    const remoto = await consultar(raiz, p);
    if (remoto.conteudoId) {
      if (r?.remoto && (r.conteudoId !== remoto.conteudoId || r.geracaoEditorial !== remoto.geracaoEditorial)) {
        throw erro('sincronizacao-editorial-necessaria');
      }
      if (r && r.conteudoId !== remoto.conteudoId) throw erro('identidade-ambigua');
      r = await ids.garantir(raiz, p, [], remoto);
    } else if (r?.remoto) throw erro('editorial-contrato-invalido');
    return r || (criar || remoto.legadoPendente || remoto.jobs.length ? await ids.garantir(raiz, p) : null);
  }
  async function enviar(raiz, r, op, p, extra = {}) {
    const { chave, pedido } = await ids.reservar(raiz, r, op, p, extra);
    let resposta;
    const { motivo: _motivoLocal, ...dados } = pedido;
    try { resposta = await operar({ acao: 'editorial', pedido: dados }); }
    catch (e) { log('editorial-resposta-pendente'); throw e; }
    validarEstado(resposta);
    const geracao = pedido.geracaoEsperada + (op === 'iniciarRevisao' ? 1 : 0);
    if (resposta.conteudoId !== r.conteudoId || resposta.geracaoEditorial !== geracao
      || resposta.versaoAtual !== p.versao || (op === 'iniciarRevisao' && resposta.estadoEditorial !== 'em-revisao')
      || (op === 'registrarAceite' && resposta.estadoEditorial !== 'aceito')
      || (op === 'registrarVersao' && !['aguardando-aceite', 'aceito'].includes(resposta.estadoEditorial))) throw erro('editorial-contrato-invalido');
    return ids.alterar(raiz, r.conteudoId, atual => {
      if (atual.recibos?.some(x => x.idempotencia === pedido.idempotencia)) return;
      if (atual.geracaoEditorial !== pedido.geracaoEsperada) throw erro('geracao-editorial-divergente');
      Object.assign(atual, { remoto: true, geracaoEditorial: resposta.geracaoEditorial,
        estadoEditorial: resposta.estadoEditorial, versaoAtual: resposta.versaoAtual,
        aliasesRegistrados: pedido.aliases });
      if (op === 'registrarAceite') atual.aceita = ids.manifesto(p);
      atual.recibos ||= [];
      atual.recibos.push({ ...pedido, resposta: structuredClone(resposta) });
      delete atual.pendentes[chave];
    });
  }
  const api = {
    ativo,
    async sincronizar(raiz, peca) {
      const p = unidade(raiz, peca), local = ids.buscar(raiz, p.id);
      if (Object.keys(local?.pendentes || {}).length) throw erro('editorial-resposta-pendente');
      const remoto = await consultar(raiz, p);
      if (!remoto.conteudoId) throw erro('identidade-inexistente');
      // So leitura e recibo local. Sincronizar nao aceita a versao nem retoma jobs.
      return ids.garantir(raiz, p, [], remoto);
    },
    async iniciarRevisao(raiz, peca, motivo = 'revisao') {
      const p = unidade(raiz, peca);
      if (!['revisao', 'ajuste', 'recusa'].includes(motivo)) throw erro('motivo-invalido');
      // Rascunho sem identidade remota nao precisa de rede para continuar editavel.
      const local = ids.buscar(raiz, p.id);
      const aceites = c.lerJson(c.caminhoPainel(raiz, 'aprovacoes.json'), { aprovacoes: [] }).aprovacoes;
      if (!Array.isArray(aceites)) throw erro('aceites-invalidos');
      const jaTeveAceite = aceites.some(a => a.id === p.id || a.origem?.id === p.id);
      // O rollout local desligado não libera revisão de conteúdo já aceito.
      if (!ativo(raiz, p) && !jaTeveAceite && !p.aprovada && !p.aceite && p.estado !== 'aprovados') return null;
      if (!local?.remoto && !Object.keys(local?.pendentes || {}).length
        && !jaTeveAceite && !p.aprovada && !p.aceite && p.estado !== 'aprovados') return null;
      const r = await resolver(raiz, p, true);
      if (r.estadoEditorial === 'em-revisao' && r.remoto && r.versaoAtual === p.versao) return r;
      return enviar(raiz, r, 'iniciarRevisao', p, { motivo });
    },
    async registrarVersao(raiz, peca) {
      const p = unidade(raiz, peca);
      if (!ativo(raiz, p)) return null;
      const r = await resolver(raiz, p, false);
      if (!r?.remoto) return r;
      if (r.versaoAtual !== p.versao && r.estadoEditorial !== 'em-revisao') throw erro('suspensao-previa-necessaria');
      if (r.versaoAtual === p.versao && ['aguardando-aceite', 'aceito'].includes(r.estadoEditorial)
        && JSON.stringify(r.aliasesRegistrados) === JSON.stringify(r.aliases.map(a => a.pecaId).sort())) return r;
      return enviar(raiz, r, 'registrarVersao', p);
    },
    async registrarAceite(raiz, peca) {
      const p = unidade(raiz, peca);
      if (!ativo(raiz, p)) return null;
      if (require('./snapshot-local.cjs').motivoSemAceite(raiz, p, Date.now(), { somenteAceiteEditorial: true })) throw erro('sem-aceite');
      let r = await resolver(raiz, p, true);
      if (!r.remoto) r = await enviar(raiz, r, 'iniciarRevisao', p, { motivo: 'revisao' });
      if (r.versaoAtual !== p.versao && r.estadoEditorial !== 'em-revisao') throw erro('suspensao-previa-necessaria');
      if (r.estadoEditorial === 'em-revisao' || r.versaoAtual !== p.versao) r = await enviar(raiz, r, 'registrarVersao', p);
      return r.estadoEditorial === 'aceito' ? r : enviar(raiz, r, 'registrarAceite', p);
    },
    async acompanhar(raiz, peca) { return consultar(raiz, unidade(raiz, peca)); },
  };
  return api;
}
module.exports = { criarEditorial, CONTRATO, ...criarEditorial() };
