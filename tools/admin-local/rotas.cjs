'use strict';
// Rotas da API do painel local (dono: Keel).
//
// Cada rota chama um adaptador fixo. Nada de proxy genérico, SQL livre ou
// shell livre. Envelope: { ok:true, dados, atualizadoEm } ou
// { ok:false, erro:{ codigo, mensagem, tentarEmSeg? } }. Integração sem
// credencial devolve ok:true com dados.status = "ausente", nunca erro mudo.
//
// Camadas, nesta ordem (server.cjs já barrou Host e socket não local):
//   Origin / Sec-Fetch-Site -> X-Grana-Admin -> pareamento -> login (senha +
//   TOTP) -> CSRF nos POSTs -> step-up (TOTP dos últimos 5 min) nas ações
//   destrutivas -> limite de frequência -> confirmação digitada.

const path = require('path');
const { RAIZ_DADOS, SIMULAR, ocultar } = require('./config.cjs');
const seg = require('./seguranca.cjs');
const auth = require('./autenticacao.cjs');
const { registrar } = require('./auditoria.cjs');

const LIMITE_CORPO = 64 * 1024;

function agoraLocalIso(d = new Date()) {
  const p = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(off / 60)}:${p(off % 60)}`;
}

function enviarJson(res, status, corpo) {
  const texto = ocultar(JSON.stringify(corpo)); // última barreira: nenhum valor do .env sai
  if (res.headersSent) { try { res.end(); } catch {} return; }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(texto);
}

function responderOk(res, dados) {
  enviarJson(res, 200, { ok: true, dados, atualizadoEm: agoraLocalIso() });
}

function responderErro(res, status, codigo, mensagem, causa, extra) {
  if (causa) console.error(`[painel] ${codigo}: ${ocultar(causa && causa.message ? causa.message : causa).slice(0, 200)}`);
  enviarJson(res, status, { ok: false, erro: { codigo, mensagem: ocultar(mensagem), ...(extra || {}) } });
}

function recusar(res, r) {
  return responderErro(res, r.status, r.codigo, r.mensagem, null, r.tentarEmSeg ? { tentarEmSeg: r.tentarEmSeg } : null);
}

/** Lê o corpo JSON. Passou do limite: 413 respondido ANTES de fechar (achado R4). */
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const declarado = Number(req.headers['content-length']);
    if (Number.isFinite(declarado) && declarado > LIMITE_CORPO) {
      req.resume(); // descarta sem guardar
      return reject(Object.assign(new Error('grande'), { status: 413, codigo: 'corpo-grande', mensagem: 'O corpo passa de 64 KB.' }));
    }
    let tamanho = 0, estourou = false;
    const partes = [];
    req.on('data', (c) => {
      if (estourou) return;
      tamanho += c.length;
      if (tamanho > LIMITE_CORPO) {
        estourou = true;
        partes.length = 0;
        return reject(Object.assign(new Error('grande'), { status: 413, codigo: 'corpo-grande', mensagem: 'O corpo passa de 64 KB.' }));
      }
      partes.push(c);
    });
    req.on('end', () => {
      if (estourou) return;
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

// ---------- texto que parece credencial (A8: o repositório é público) ----------

const PADROES_CREDENCIAL = [
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bsbp_[A-Za-z0-9]{20,}/,
  /\bvercel_[A-Za-z0-9_-]{16,}/i,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b[A-Fa-f0-9]{40,}\b/, // hex longo
  /[A-Za-z0-9+/_-]{40,}={0,2}/, // base64 longo
];
// Campos que o próprio painel preenche com hash (versão da peça, ids) ficam de fora.
const CAMPOS_TECNICOS = new Set(['versao', 'id', 'pecas', 'pecaIds', 'deploymentId', 'caminho']);

function pareceCredencial(valor, chave = '') {
  if (CAMPOS_TECNICOS.has(chave)) return false;
  if (typeof valor === 'string') {
    if (PADROES_CREDENCIAL.some((re) => re.test(valor))) return true;
    return false;
  }
  if (Array.isArray(valor)) return valor.some((v) => pareceCredencial(v, chave));
  if (valor && typeof valor === 'object') return Object.entries(valor).some(([k, v]) => pareceCredencial(v, k));
  return false;
}

/** Algum valor carregado do .env aparece literalmente no texto? */
function contemSegredoDoEnv(corpo) {
  const texto = JSON.stringify(corpo);
  return ocultar(texto) !== texto;
}

// ---------- módulos ----------

function tentar(caminho) {
  try { return require(caminho); } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND' && String(e.message).includes(path.basename(caminho))) return null;
    throw e;
  }
}
const adaptador = (nome) => require(`./adaptadores/${nome}.cjs`);
const marketing = (nome) => tentar(path.join(__dirname, 'marketing', `${nome}.cjs`));

function funcao(mod, nomes) {
  if (!mod) return null;
  for (const n of nomes) if (typeof mod[n] === 'function') return mod[n];
  return null;
}

// Cache curto das leituras externas. Chamadas simultâneas da mesma chave dividem a mesma execução.
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
comCache.espiar = (chave) => {
  const c = cache.get(chave);
  return c ? { valor: c.valor, em: new Date(c.em).toISOString() } : null;
};

/** `?atualizar=1` fura o cache, mas no máximo 6 vezes por minuto (achado R1: queima de cota). */
function forcar(url) {
  return url.searchParams.get('atualizar') === '1' && seg.dentroDoLimite('atualizar', 6, 60_000);
}

// ---------- rotas de leitura (exigem login completo) ----------

const CONFIRMACOES = { redeploy: 'REDEPLOY', build: 'PREPARAR BUILD' };

function erroDeMarketing(res, e) {
  if (e && e.codigo) return responderErro(res, e.status || 400, e.codigo, e.message);
  return responderErro(res, 500, 'marketing-falhou', 'O módulo de marketing falhou.', e);
}

async function rotaMarketingGet(res, nomeModulo, nomesFuncao, args, vazio) {
  const fn = funcao(marketing(nomeModulo), nomesFuncao);
  if (!fn) return responderOk(res, { ...vazio, status: 'pendente', motivo: 'Módulo de marketing ainda não instalado.' });
  try { responderOk(res, await fn(RAIZ_DADOS, ...args)); } catch (e) { erroDeMarketing(res, e); }
}

async function rotaMarketingPost(res, nomeModulo, nomesFuncao, args) {
  const fn = funcao(marketing(nomeModulo), nomesFuncao);
  if (!fn) return responderErro(res, 503, 'modulo-pendente', 'Módulo de marketing ainda não instalado.');
  try { responderOk(res, await fn(RAIZ_DADOS, ...args)); } catch (e) { erroDeMarketing(res, e); }
}

const GET = {
  '/api/visao-geral': async (req, res, url) => responderOk(res, await adaptador('visao-geral').resumo(comCache, forcar(url))),
  '/api/supabase/resumo': async (req, res, url) => responderOk(res, await comCache('sb-resumo', 30_000, () => adaptador('supabase').resumo(), forcar(url))),
  '/api/supabase/funcoes': async (req, res, url) => responderOk(res, await comCache('sb-funcoes', 30_000, () => adaptador('supabase').funcoes(), forcar(url))),
  '/api/supabase/migrations': async (req, res) => responderOk(res, adaptador('supabase').migrations()),
  '/api/supabase/app-release': async (req, res, url) => responderOk(res, await comCache('sb-release', 30_000, () => adaptador('supabase').appRelease(), forcar(url))),
  '/api/vercel/deployments': async (req, res, url) => responderOk(res, await comCache('vc-deps', 30_000, () => adaptador('vercel').deployments(), forcar(url))),
  '/api/vercel/projeto': async (req, res, url) => responderOk(res, await comCache('vc-proj', 60_000, () => adaptador('vercel').projeto(), forcar(url))),
  '/api/eas/builds': async (req, res, url) => responderOk(res, await comCache('eas', 60_000, () => adaptador('eas').builds(), forcar(url))),
  '/api/github/releases': async (req, res, url) => responderOk(res, await comCache('gh', 60_000, () => adaptador('github').releases(), forcar(url))),
  '/api/cakto/resumo': async (req, res, url) => responderOk(res, await comCache('cakto', 60_000, () => adaptador('cakto').resumo(), forcar(url))),
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

// ---------- ações (POST, login completo + CSRF) ----------

const ID_PECA = /^\/api\/marketing\/pecas\/([0-9a-f]{16})\/(aprovar|ajuste)$/;
const MARKETING_POST = new Set(['/api/marketing/calendario', '/api/marketing/trafego']);
const DESTRUTIVAS = new Set(['/api/vercel/redeploy', '/api/eas/preparar-build']);

async function tratarAcao(req, res, url, corpo, sessao) {
  const p = url.pathname;
  const ehMarketing = ID_PECA.test(p) || MARKETING_POST.has(p);

  if (ehMarketing) {
    if (!seg.dentroDoLimite('marketing', 30, 60_000)) return responderErro(res, 429, 'limite', 'Muitas gravações seguidas. Espere um minuto.', null, { tentarEmSeg: 60 });
    if (contemSegredoDoEnv(corpo) || pareceCredencial(corpo)) {
      registrar('recusa', { rota: p, motivo: 'parece-credencial', sessao: sessao.id });
      return responderErro(res, 422, 'parece-credencial', 'Esse texto parece uma senha, token ou chave. Ele seria gravado no repositório do GitHub, que é público. Tire o trecho e tente de novo.');
    }
    const m = ID_PECA.exec(p);
    let r;
    if (m) r = rotaMarketingPost(res, 'aprovacoes', m[2] === 'aprovar' ? ['aprovar'] : ['pedirAjuste', 'ajuste'], [m[1], corpo]);
    else if (p === '/api/marketing/calendario') r = rotaMarketingPost(res, 'calendario', ['planejar', 'salvar', 'gravar'], [corpo]);
    else r = rotaMarketingPost(res, 'trafego', ['salvarCampanha', 'salvar', 'gravar'], [corpo]);
    await r;
    registrar('acao', { rota: p, resultado: res.statusCode, sessao: sessao.id });
    return undefined;
  }

  if (DESTRUTIVAS.has(p)) {
    if (!seg.stepUpValido(sessao.s)) {
      return responderErro(res, 403, 'reautenticar', 'Confirme o código do autenticador para continuar.');
    }
    if (!seg.dentroDoLimite(p, 3, 10 * 60_000)) return responderErro(res, 429, 'limite', 'Essa ação já foi pedida 3 vezes em 10 minutos. Espere.', null, { tentarEmSeg: 600 });
    const confirmacao = p === '/api/vercel/redeploy' ? CONFIRMACOES.redeploy : CONFIRMACOES.build;
    if (corpo.confirmacao !== confirmacao) return responderErro(res, 400, 'confirmacao-invalida', `Digite ${confirmacao} para confirmar.`);
    let resultado;
    try {
      if (p === '/api/vercel/redeploy') {
        const r = await adaptador('vercel').redeploy(corpo.deploymentId);
        cache.delete('vc-deps');
        resultado = { status: 200, codigo: r.simulado ? 'simulado' : 'ok' };
        responderOk(res, r);
      } else {
        const r = await adaptador('eas').prepararBuild({ tipo: corpo.tipo, mensagem: corpo.mensagem });
        cache.delete('eas');
        resultado = { status: r.ok ? 200 : r.status || 409, codigo: r.ok ? (r.dados.simulado ? 'simulado' : 'ok') : r.codigo };
        if (!r.ok) responderErro(res, r.status || 409, r.codigo, r.mensagem);
        else responderOk(res, r.dados);
      }
    } catch (e) {
      resultado = { status: e.status || 500, codigo: e.codigo || 'erro' };
      throw e;
    } finally {
      registrar('acao', { rota: p, resultado: resultado && resultado.status, codigo: resultado && resultado.codigo, simulado: SIMULAR, sessao: sessao.id });
    }
    return undefined;
  }
  return responderErro(res, 404, 'rota-inexistente', 'Rota não encontrada.');
}

// ---------- sessão e login ----------

function dadosSessao(sessao) {
  return { ...seg.resumoDaSessao(sessao), loginConfigurado: auth.configurado() };
}

function definirCookie(res, id) {
  res.setHeader('Set-Cookie', seg.cookieDaSessao(id));
}

async function tratarSessaoELogin(req, res, url, sessao) {
  const p = url.pathname;
  if (p === '/api/sessao' && req.method === 'GET') return responderOk(res, dadosSessao(sessao));

  if (req.method !== 'POST') return responderErro(res, 405, 'metodo-recusado', 'Método não permitido.');

  // Pareamento: sem sessão ainda, então sem CSRF, mas com Origin canônica obrigatória.
  if (p === '/api/parear') {
    const rc = seg.checarCabecalhos(req, { exigeCsrf: false, exigeOrigem: true });
    if (rc) return recusar(res, rc);
    const corpo = await lerCorpo(req);
    const r = seg.parear(corpo.codigo);
    registrar('pareamento', { resultado: r.ok ? 'ok' : r.codigo });
    if (!r.ok) return recusar(res, r);
    if (sessao) seg.encerrarSessao(sessao.id);
    definirCookie(res, r.id);
    return responderOk(res, dadosSessao({ id: r.id, s: { etapa: 'senha' } }));
  }

  // Daqui em diante: sessão pareada e CSRF.
  if (!sessao) return recusar(res, { status: 401, codigo: 'nao-pareado', mensagem: 'Painel não pareado. Abra pelo atalho Grana. Admin na Área de Trabalho.' });
  const rc = seg.checarCabecalhos(req, { exigeCsrf: true, sessao });
  if (rc) return recusar(res, rc);
  const corpo = await lerCorpo(req);

  if (p === '/api/sair') {
    registrar('logout', { sessao: sessao.id });
    Object.assign(sessao.s, { etapa: 'senha', senhaOk: false, loginEm: 0, totpEm: 0, motivoSaida: undefined });
    return responderOk(res, { etapa: 'senha' });
  }

  if (p === '/api/sessao/renovar') {
    if (sessao.s.etapa === 'ok') sessao.s.atividadeEm = Date.now();
    return responderOk(res, dadosSessao(sessao));
  }

  if (p === '/api/login') {
    if (sessao.s.etapa === 'ok') return responderOk(res, dadosSessao(sessao));
    const r = await auth.conferirSenha(corpo.senha);
    if (!r.ok) { registrar('login', { passo: 'senha', resultado: r.codigo, sessao: sessao.id }); return recusar(res, r); }
    // A resposta é a mesma com senha certa ou errada; o veredito sai no passo do código.
    Object.assign(sessao.s, { etapa: 'totp', senhaOk: r.senhaOk, senhaEm: Date.now(), motivoSaida: undefined });
    return responderOk(res, dadosSessao(sessao));
  }

  if (p === '/api/login/totp') {
    // Step-up: sessão já completa, só o código.
    if (sessao.s.etapa === 'ok') {
      const r = await auth.reconfirmar(corpo.codigo);
      registrar('login', { passo: 'step-up', resultado: r.ok ? 'ok' : r.codigo, fator: r.fatorFalho, sessao: sessao.id });
      if (!r.ok) return recusar(res, r); // errar o step-up não derruba o login
      sessao.s.totpEm = Date.now();
      sessao.s.atividadeEm = Date.now();
      return responderOk(res, dadosSessao(sessao));
    }
    if (sessao.s.etapa !== 'totp') return recusar(res, { status: 401, codigo: 'nao-autenticado', mensagem: 'Digite a senha primeiro.' });
    const r = await auth.concluirLogin({ senhaOk: sessao.s.senhaOk, codigo: corpo.codigo });
    registrar('login', { passo: 'final', resultado: r.ok ? 'ok' : r.codigo, fator: r.fatorFalho, sessao: sessao.id });
    if (!r.ok) {
      Object.assign(sessao.s, { etapa: 'senha', senhaOk: false }); // volta para a senha
      return recusar(res, r);
    }
    const agora = Date.now();
    // O mesmo objeto de estado passa para um id novo (contra fixação de sessão).
    Object.assign(sessao.s, { etapa: 'ok', senhaOk: false, loginEm: agora, atividadeEm: agora, totpEm: agora, motivoSaida: undefined });
    const novoId = seg.rotacionar(sessao.id);
    definirCookie(res, novoId);
    return responderOk(res, dadosSessao({ id: novoId, s: sessao.s }));
  }
  return responderErro(res, 404, 'rota-inexistente', 'Rota não encontrada.');
}

const ROTAS_SESSAO = new Set(['/api/sessao', '/api/parear', '/api/login', '/api/login/totp', '/api/sair', '/api/sessao/renovar']);

// ---------- entrada ----------

async function tratarApi(req, res, url) {
  const p = url.pathname;
  const base = seg.checarApi(req);
  if (base) return recusar(res, base);
  if (!seg.dentroDoLimite('api', 240, 60_000)) return responderErro(res, 429, 'limite', 'Pedidos demais em pouco tempo.', null, { tentarEmSeg: 60 });

  try {
    if (p === '/api/saude' && (req.method === 'GET' || req.method === 'HEAD')) {
      return responderOk(res, { painel: 'grana-admin', versao: 2, simulado: SIMULAR });
    }
    if (req.headers['x-grana-admin'] !== '1') return recusar(res, { status: 403, codigo: 'cabecalho-ausente', mensagem: 'Falta o cabeçalho X-Grana-Admin.' });

    const humano = req.headers['x-grana-atividade'] === '1';
    const sessao = seg.sessaoDe(req, humano);

    if (ROTAS_SESSAO.has(p)) return await tratarSessaoELogin(req, res, url, sessao);

    // Tudo o mais exige login completo.
    if (!sessao) return recusar(res, { status: 401, codigo: 'nao-pareado', mensagem: 'Painel não pareado. Abra pelo atalho Grana. Admin na Área de Trabalho.' });
    if (sessao.s.etapa !== 'ok') {
      if (sessao.motivo) return recusar(res, { status: 401, codigo: sessao.motivo, mensagem: sessao.motivo === 'inatividade' ? 'Sessão encerrada por inatividade.' : 'Sua sessão expirou. Entre de novo.' });
      if (sessao.s.etapa === 'totp') return recusar(res, { status: 401, codigo: 'totp-pendente', mensagem: 'Digite o código do autenticador.' });
      return recusar(res, { status: 401, codigo: 'nao-autenticado', mensagem: 'Entre com a senha e o código do autenticador.' });
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const h = GET[p];
      if (!h) return responderErro(res, 404, 'rota-inexistente', 'Rota não encontrada.');
      return await h(req, res, url);
    }
    const rc = seg.checarCabecalhos(req, { exigeCsrf: true, sessao });
    if (rc) return recusar(res, rc);
    const corpo = await lerCorpo(req);
    return await tratarAcao(req, res, url, corpo, sessao);
  } catch (e) {
    if (e && e.status === 413) {
      res.setHeader('Connection', 'close');
      res.on('finish', () => { try { req.socket.destroy(); } catch {} });
      return responderErro(res, 413, e.codigo, e.mensagem);
    }
    if (e && e.codigo === 'json-invalido') return responderErro(res, 400, e.codigo, e.mensagem);
    if (e && e.integracao) return responderErro(res, e.status || 502, e.codigo || 'integracao-falhou', e.message, e.causa);
    return responderErro(res, 500, 'erro-interno', 'Falha inesperada no servidor do painel.', e);
  }
}

/** Sessão completa para servir arquivos protegidos do repositório. */
function sessaoCompleta(req) {
  const s = seg.sessaoDe(req, false);
  return !!(s && s.s.etapa === 'ok');
}

module.exports = { tratarApi, responderErro, agoraLocalIso, sessaoCompleta, pareceCredencial };
