'use strict';
// Rotas da API do painel local (dono: Keel).
//
// Cada rota chama um adaptador fixo. Nada de proxy genérico, SQL livre ou
// shell livre. Envelope: { ok:true, dados, atualizadoEm } ou
// { ok:false, erro:{ codigo, mensagem } }. Integração sem credencial devolve
// ok:true com dados.status = "ausente", nunca erro mudo.

const fs = require('fs');
const path = require('path');
const { RAIZ, SIMULAR, ocultar } = require('./config.cjs');
const seg = require('./seguranca.cjs');

function agoraLocalIso(d = new Date()) {
  const p = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(off / 60)}:${p(off % 60)}`;
}

function enviarJson(res, status, corpo) {
  const texto = ocultar(JSON.stringify(corpo)); // última barreira: nenhum valor do .env sai
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(texto);
}

function responderOk(res, dados) {
  enviarJson(res, 200, { ok: true, dados, atualizadoEm: agoraLocalIso() });
}

function responderErro(res, status, codigo, mensagem, causa) {
  if (causa) console.error(`[painel] ${codigo}: ${ocultar(causa && causa.message ? causa.message : causa).slice(0, 300)}`);
  if (res.headersSent) { try { res.end(); } catch {} return; }
  enviarJson(res, status, { ok: false, erro: { codigo, mensagem: ocultar(mensagem) } });
}

function lerCorpo(req, limite = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > limite) { reject(Object.assign(new Error('corpo grande'), { status: 413, codigo: 'corpo-grande' })); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto) return resolve({});
      try {
        const v = JSON.parse(texto);
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch { reject(Object.assign(new Error('json'), { status: 400, codigo: 'json-invalido', mensagem: 'O corpo não é um objeto JSON válido.' })); }
    });
    req.on('error', reject);
  });
}

// ---------- carregamento preguiçoso de módulos ----------

function tentar(caminho) {
  try { return require(caminho); } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND' && String(e.message).includes(path.basename(caminho))) return null;
    throw e;
  }
}
const adaptador = (nome) => require(`./adaptadores/${nome}.cjs`);
const marketing = (nome) => tentar(path.join(__dirname, 'marketing', `${nome}.cjs`));

/** Primeira função exportada entre os nomes candidatos. */
function funcao(mod, nomes) {
  if (!mod) return null;
  for (const n of nomes) if (typeof mod[n] === 'function') return mod[n];
  return null;
}

// Cache curto das leituras externas: a visão geral chama tudo de uma vez.
// Chamadas simultâneas da mesma chave dividem a mesma execução.
const cache = new Map();
const emCurso = new Map();
async function comCache(chave, ms, fn, forcar) {
  const c = cache.get(chave);
  if (!forcar && c && Date.now() - c.em < ms) return c.valor;
  if (emCurso.has(chave)) return emCurso.get(chave);
  const p = (async () => {
    const valor = await fn();
    cache.set(chave, { em: Date.now(), valor });
    return valor;
  })().finally(() => emCurso.delete(chave));
  emCurso.set(chave, p);
  return p;
}
/** Último valor guardado, mesmo vencido, com a idade; ou null. */
comCache.espiar = (chave) => {
  const c = cache.get(chave);
  return c ? { valor: c.valor, em: new Date(c.em).toISOString() } : null;
};

// ---------- rotas ----------

const CONFIRMACOES = { redeploy: 'REDEPLOY', build: 'PREPARAR BUILD' };

function erroDeMarketing(res, e) {
  if (e && e.codigo) return responderErro(res, e.status || 400, e.codigo, e.message);
  return responderErro(res, 500, 'marketing-falhou', 'O módulo de marketing falhou.', e);
}

async function rotaMarketingGet(res, nomeModulo, nomesFuncao, args, vazio) {
  const mod = nomeModulo === 'catalogo' ? marketing('catalogo') : marketing(nomeModulo);
  const fn = funcao(mod, nomesFuncao);
  if (!fn) return responderOk(res, { ...vazio, status: 'pendente', motivo: 'Módulo de marketing ainda não instalado.' });
  try { responderOk(res, await fn(RAIZ, ...args)); } catch (e) { erroDeMarketing(res, e); }
}

async function rotaMarketingPost(res, nomeModulo, nomesFuncao, args) {
  const fn = funcao(marketing(nomeModulo), nomesFuncao);
  if (!fn) return responderErro(res, 503, 'modulo-pendente', 'Módulo de marketing ainda não instalado.');
  try { responderOk(res, await fn(RAIZ, ...args)); } catch (e) { erroDeMarketing(res, e); }
}

const GET = {
  '/api/saude': async (req, res) => responderOk(res, { painel: 'grana-admin', versao: 1, simulado: SIMULAR }),

  // Entrega o token CSRF ligado à sessão (emite sessão nova se a do cookie expirou,
  // por exemplo depois de reiniciar o servidor). Só same-origin chega aqui.
  '/api/sessao': async (req, res) => {
    const id = seg.garantirSessao(req, res);
    responderOk(res, { csrfToken: seg.csrfDe(id), cabecalho: 'X-CSRF-Token' });
  },

  '/api/visao-geral': async (req, res, url) => {
    const forcar = url.searchParams.get('atualizar') === '1';
    responderOk(res, await adaptador('visao-geral').resumo(comCache, forcar));
  },

  '/api/supabase/resumo': async (req, res, url) => responderOk(res, await comCache('sb-resumo', 30_000, () => adaptador('supabase').resumo(), url.searchParams.get('atualizar') === '1')),
  '/api/supabase/funcoes': async (req, res, url) => responderOk(res, await comCache('sb-funcoes', 30_000, () => adaptador('supabase').funcoes(), url.searchParams.get('atualizar') === '1')),
  '/api/supabase/migrations': async (req, res) => responderOk(res, adaptador('supabase').migrations()),
  '/api/supabase/app-release': async (req, res, url) => responderOk(res, await comCache('sb-release', 30_000, () => adaptador('supabase').appRelease(), url.searchParams.get('atualizar') === '1')),
  '/api/vercel/deployments': async (req, res, url) => responderOk(res, await comCache('vc-deps', 30_000, () => adaptador('vercel').deployments(), url.searchParams.get('atualizar') === '1')),
  '/api/vercel/projeto': async (req, res, url) => responderOk(res, await comCache('vc-proj', 60_000, () => adaptador('vercel').projeto(), url.searchParams.get('atualizar') === '1')),
  '/api/eas/builds': async (req, res, url) => responderOk(res, await comCache('eas', 60_000, () => adaptador('eas').builds(), url.searchParams.get('atualizar') === '1')),
  '/api/github/releases': async (req, res, url) => responderOk(res, await comCache('gh', 60_000, () => adaptador('github').releases(), url.searchParams.get('atualizar') === '1')),
  '/api/cakto/resumo': async (req, res, url) => responderOk(res, await comCache('cakto', 60_000, () => adaptador('cakto').resumo(), url.searchParams.get('atualizar') === '1')),
  '/api/git/estado': async (req, res) => responderOk(res, adaptador('git-local').estado()),
  '/api/design-system': async (req, res) => responderOk(res, adaptador('design-system').resumo()),

  '/api/marketing/pecas': (req, res, url) => rotaMarketingGet(res, 'catalogo', ['listarPecas'], [{
    estado: url.searchParams.get('estado') || undefined,
    semana: url.searchParams.get('semana') || undefined,
    tipo: url.searchParams.get('tipo') || undefined,
  }], { pecas: [], semanas: [], total: 0 }),
  '/api/marketing/feed': (req, res) => rotaMarketingGet(res, 'catalogo', ['feed'], [], { pecas: [], total: 0 }),
  '/api/marketing/documento': (req, res) => rotaMarketingGet(res, 'catalogo', ['documento'], [], { markdown: '' }),
  '/api/marketing/calendario': (req, res, url) => {
    const mes = url.searchParams.get('mes');
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) return responderErro(res, 400, 'mes-invalido', 'Use mes=AAAA-MM.');
    return rotaMarketingGet(res, 'calendario', ['calendario', 'listarCalendario', 'listar', 'mes'], [mes || undefined], { itens: [], semData: [] });
  },
  '/api/marketing/trafego': (req, res) => rotaMarketingGet(res, 'trafego', ['listarCampanhas', 'listarTrafego', 'listar', 'trafego'], [], { campanhas: [] }),
};

const ID_PECA = /^\/api\/marketing\/pecas\/([0-9a-f]{16})\/(aprovar|ajuste)$/;

async function tratarPost(req, res, url) {
  let corpo;
  try { corpo = await lerCorpo(req); } catch (e) { return responderErro(res, e.status || 400, e.codigo || 'corpo-invalido', e.mensagem || 'Corpo inválido.'); }
  const p = url.pathname;

  const m = ID_PECA.exec(p);
  if (m) {
    if (m[2] === 'aprovar') return rotaMarketingPost(res, 'aprovacoes', ['aprovar'], [m[1], corpo]);
    return rotaMarketingPost(res, 'aprovacoes', ['pedirAjuste', 'ajuste'], [m[1], corpo]);
  }
  if (p === '/api/marketing/calendario') return rotaMarketingPost(res, 'calendario', ['planejar', 'salvar', 'gravar'], [corpo]);
  if (p === '/api/marketing/trafego') return rotaMarketingPost(res, 'trafego', ['salvarCampanha', 'salvar', 'gravar'], [corpo]);

  if (p === '/api/vercel/redeploy') {
    if (corpo.confirmacao !== CONFIRMACOES.redeploy) return responderErro(res, 400, 'confirmacao-invalida', `Digite ${CONFIRMACOES.redeploy} para confirmar.`);
    const r = await adaptador('vercel').redeploy(corpo.deploymentId);
    cache.delete('vc-deps');
    return responderOk(res, r);
  }
  if (p === '/api/eas/preparar-build') {
    if (corpo.confirmacao !== CONFIRMACOES.build) return responderErro(res, 400, 'confirmacao-invalida', `Digite ${CONFIRMACOES.build} para confirmar.`);
    const r = await adaptador('eas').prepararBuild({ tipo: corpo.tipo, mensagem: corpo.mensagem });
    cache.delete('eas');
    if (!r.ok) return responderErro(res, r.status || 409, r.codigo, r.mensagem);
    return responderOk(res, r.dados);
  }
  return responderErro(res, 404, 'rota-inexistente', 'Rota não encontrada.');
}

async function tratarApi(req, res, url) {
  const recusa = seg.checarApi(req);
  if (recusa) return responderErro(res, recusa.status, recusa.codigo, recusa.mensagem);
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const h = GET[url.pathname];
      if (!h) return responderErro(res, 404, 'rota-inexistente', 'Rota não encontrada.');
      return await h(req, res, url);
    }
    return await tratarPost(req, res, url);
  } catch (e) {
    if (e && e.integracao) return responderErro(res, e.status || 502, e.codigo || 'integracao-falhou', e.message, e.causa);
    return responderErro(res, 500, 'erro-interno', 'Falha inesperada no servidor do painel.', e);
  }
}

module.exports = { tratarApi, responderErro, agoraLocalIso };
