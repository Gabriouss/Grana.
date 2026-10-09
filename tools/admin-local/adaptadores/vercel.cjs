'use strict';
// Vercel (dono: Keel). Leitura de deployments e projeto; uma única ação,
// redeploy de produção, só com confirmação por clique na tela e só de um
// deployment que pertença ao projeto do Grana. GRANA_ADMIN_SIMULAR=1 não chama a API.

const { ler, tem, SIMULAR, REPO_GITHUB } = require('../config.cjs');
const { pedirJson, ErroIntegracao } = require('./_http.cjs');

const API = 'https://api.vercel.com';
let alvo = null; // { id, nome, teamId }

function cab() {
  return { Authorization: `Bearer ${ler('VERCEL_TOKEN')}` };
}

function comTime(url, teamId) {
  if (!teamId) return url;
  return url + (url.includes('?') ? '&' : '?') + 'teamId=' + encodeURIComponent(teamId);
}

async function get(caminho, teamId) {
  const r = await pedirJson('Vercel', comTime(API + caminho, teamId), { cabecalhos: cab() });
  if (r.status >= 400) throw new ErroIntegracao('vercel-http', `Vercel: HTTP ${r.status}.`);
  return r.dados;
}

function ehDoGrana(p) {
  const [org, repo] = REPO_GITHUB.split('/');
  const link = p.link || {};
  if (link.type === 'github' && String(link.org).toLowerCase() === org.toLowerCase() && link.repo === repo) return 2;
  return /grana/i.test(p.name) ? 1 : 0;
}

/** Acha o projeto do Grana. na conta pessoal ou nos times do token. */
async function descobrir() {
  if (alvo) return alvo;
  const escopos = [null];
  try {
    const t = await get('/v2/teams?limit=20');
    for (const time of (t && t.teams) || []) escopos.push(time.id);
  } catch { /* token pessoal sem times: segue só com a conta pessoal */ }
  let melhor = null;
  for (const teamId of escopos) {
    const d = await get('/v9/projects?limit=100', teamId);
    for (const p of (d && d.projects) || []) {
      const nota = ehDoGrana(p);
      if (nota && (!melhor || nota > melhor.nota)) melhor = { nota, id: p.id, nome: p.name, teamId };
    }
    if (melhor && melhor.nota === 2) break;
  }
  if (!melhor) throw new ErroIntegracao('vercel-projeto-nao-encontrado', 'Vercel: não achei o projeto do Grana. com este token.', 404);
  alvo = { id: melhor.id, nome: melhor.nome, teamId: melhor.teamId };
  return alvo;
}

function ausente() {
  return { status: 'ausente', motivo: 'VERCEL_TOKEN não está no .env.' };
}

function mapear(d) {
  const meta = d.meta || {};
  return {
    id: d.uid,
    url: d.url ? `https://${d.url}` : null,
    estado: d.readyState || d.state,
    alvo: d.target || 'preview',
    commit: meta.githubCommitSha ? { hash: meta.githubCommitSha.slice(0, 7), mensagem: (meta.githubCommitMessage || '').split('\n')[0], branch: meta.githubCommitRef || null } : null,
    criadoEm: d.created ? new Date(d.created).toISOString() : null,
    prontoEm: d.ready ? new Date(d.ready).toISOString() : null,
    criador: (d.creator && (d.creator.username || d.creator.githubLogin)) || null,
    origem: d.source || null,
  };
}

async function deployments() {
  if (!tem('VERCEL_TOKEN')) return ausente();
  const p = await descobrir();
  const d = await get(`/v6/deployments?projectId=${encodeURIComponent(p.id)}&limit=15`, p.teamId);
  const itens = ((d && d.deployments) || []).map(mapear);
  const producao = itens.find((i) => i.alvo === 'production' && i.estado === 'READY') || null;
  return { status: 'ok', projeto: p.nome, itens, ultimoProducao: producao };
}

async function projeto() {
  if (!tem('VERCEL_TOKEN')) return ausente();
  const p = await descobrir();
  const [info, dominios] = await Promise.all([
    get(`/v9/projects/${encodeURIComponent(p.id)}`, p.teamId),
    get(`/v9/projects/${encodeURIComponent(p.id)}/domains?limit=50`, p.teamId),
  ]);
  return {
    status: 'ok',
    nome: info.name,
    framework: info.framework || null,
    nodeVersion: info.nodeVersion || null,
    repositorio: info.link ? `${info.link.org}/${info.link.repo}` : null,
    branchDeProducao: (info.link && info.link.productionBranch) || null,
    dominios: ((dominios && dominios.domains) || []).map((x) => ({ nome: x.name, verificado: !!x.verified, redireciona: x.redirect || null })),
  };
}

async function status() {
  if (!tem('VERCEL_TOKEN')) return ausente();
  const d = await deployments();
  return { status: 'ok', ultimoProducao: d.ultimoProducao };
}

/** Redeploy de produção. Recusa id fora do formato ou fora do projeto do Grana. */
async function redeploy(deploymentId) {
  if (typeof deploymentId !== 'string' || !/^dpl_[A-Za-z0-9]{8,64}$/.test(deploymentId)) {
    throw new ErroIntegracao('deployment-invalido', 'Identificador de deployment inválido.', 400);
  }
  if (!tem('VERCEL_TOKEN')) throw new ErroIntegracao('vercel-ausente', 'VERCEL_TOKEN não está no .env.', 409);
  const p = await descobrir();
  const lista = await deployments();
  const origem = lista.itens.find((i) => i.id === deploymentId);
  if (!origem) throw new ErroIntegracao('deployment-fora-do-projeto', 'Esse deployment não está entre os 15 últimos do projeto do Grana.', 409);
  // Achado A3 do Lynx: o servidor é a barreira, não o botão. Só o último
  // deployment de produção pronto pode ser republicado; um preview nunca é
  // promovido a produção por aqui.
  if (origem.alvo !== 'production' || origem.estado !== 'READY') {
    throw new ErroIntegracao('deployment-nao-e-producao', 'Só um deployment de produção com estado READY pode ser republicado. Previews não vão para produção pelo painel.', 409);
  }
  if (!lista.ultimoProducao || lista.ultimoProducao.id !== deploymentId) {
    throw new ErroIntegracao('deployment-nao-e-o-ultimo', 'Só o último deployment de produção pode ser republicado. Recarregue a lista e tente de novo.', 409);
  }
  if (SIMULAR) {
    return { simulado: true, mensagem: `Simulação: o painel pediria o redeploy de produção de ${deploymentId}. Nada foi enviado à Vercel.`, origem };
  }
  const r = await pedirJson('Vercel', comTime(`${API}/v13/deployments?forceNew=1`, p.teamId), {
    metodo: 'POST', cabecalhos: cab(), corpo: { name: p.nome, deploymentId, target: 'production' }, prazoMs: 15_000,
  });
  if (r.status >= 400) {
    const msg = r.dados && r.dados.error && r.dados.error.message ? String(r.dados.error.message).slice(0, 200) : `HTTP ${r.status}`;
    throw new ErroIntegracao('vercel-redeploy-recusado', `Vercel recusou o redeploy: ${msg}`, 502);
  }
  return { simulado: false, novo: mapear({ ...r.dados, uid: r.dados.id, readyState: r.dados.readyState, created: r.dados.createdAt }), origem };
}

module.exports = { deployments, projeto, status, redeploy };
