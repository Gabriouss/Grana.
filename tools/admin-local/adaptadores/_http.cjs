'use strict';
// Chamada HTTP de saída dos adaptadores (dono: Keel).
// Prazo total de 15s cobrindo conexão E leitura do corpo (regra 9: abortar o
// fetch e ler o corpo fora da região protegida deixa o corpo pendurado sem
// proteção). Erro sai sanitizado, sem cabeçalho, token ou corpo cru.

const { ocultar } = require('../config.cjs');

const PRAZO_MS = 15_000;

class ErroIntegracao extends Error {
  constructor(codigo, mensagem, status = 502, causa) {
    super(mensagem);
    this.integracao = true;
    this.codigo = codigo;
    this.status = status;
    this.causa = causa ? ocultar(String(causa)).slice(0, 300) : undefined;
  }
}

/**
 * GET/POST JSON. Devolve { status, dados }. Lança ErroIntegracao em rede,
 * prazo, 401/403 (credencial recusada) e 5xx. 404 e 4xx voltam ao chamador.
 */
async function pedirJson(nome, url, { metodo = 'GET', cabecalhos = {}, corpo, prazoMs = PRAZO_MS, form } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), prazoMs);
  try {
    const init = { method: metodo, headers: { Accept: 'application/json', ...cabecalhos }, signal: ctl.signal, redirect: 'error' };
    if (form) {
      init.body = new URLSearchParams(form).toString();
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (corpo !== undefined) {
      init.body = JSON.stringify(corpo);
      init.headers['Content-Type'] = 'application/json';
    }
    const r = await fetch(url, init);
    const texto = await r.text(); // ainda dentro do prazo
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }
    if (r.status === 401 || r.status === 403) {
      throw new ErroIntegracao(`${nome}-credencial-recusada`, `${nome}: a credencial do .env foi recusada (HTTP ${r.status}). Pode ter sido trocada ou estar sem permissão.`, 502, texto);
    }
    if (r.status === 429) throw new ErroIntegracao(`${nome}-limite`, `${nome}: limite de requisições atingido. Tente de novo em instantes.`, 502);
    if (r.status >= 500) throw new ErroIntegracao(`${nome}-indisponivel`, `${nome}: serviço respondeu HTTP ${r.status}.`, 502, texto);
    return { status: r.status, dados };
  } catch (e) {
    if (e instanceof ErroIntegracao) throw e;
    if (e && e.name === 'AbortError') throw new ErroIntegracao(`${nome}-prazo`, `${nome}: sem resposta em ${Math.round(prazoMs / 1000)}s.`, 504);
    throw new ErroIntegracao(`${nome}-rede`, `${nome}: falha de rede ao consultar o serviço.`, 502, e && e.message);
  } finally {
    clearTimeout(timer);
  }
}

/** Converte qualquer falha num bloco de status para a visão geral (nunca derruba a tela). */
async function statusDe(fn) {
  try {
    return await fn();
  } catch (e) {
    return { status: 'erro', erro: { codigo: e.codigo || 'erro', mensagem: ocultar(e.message || 'Falha.') } };
  }
}

module.exports = { pedirJson, statusDe, ErroIntegracao, PRAZO_MS };
