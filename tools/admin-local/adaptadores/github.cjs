'use strict';
// GitHub (dono: Keel). Só leitura: releases do repositório, onde mora o APK
// permanente (vercel.json -> releases/latest/download/grana.apk).

const { ler, tem, REPO_GITHUB } = require('../config.cjs');
const { pedirJson, ErroIntegracao } = require('./_http.cjs');

async function releases() {
  const cab = { 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'grana-admin-local' };
  // Repositório público: sem token ainda funciona, com limite menor.
  if (tem('GITHUB_TOKEN')) cab.Authorization = `Bearer ${ler('GITHUB_TOKEN')}`;
  const r = await pedirJson('GitHub', `https://api.github.com/repos/${REPO_GITHUB}/releases?per_page=10`, { cabecalhos: cab });
  if (r.status >= 400) throw new ErroIntegracao('github-http', `GitHub: HTTP ${r.status}.`);
  const itens = (r.dados || []).map((x) => ({
    tag: x.tag_name,
    nome: x.name,
    publicadaEm: x.published_at,
    rascunho: !!x.draft,
    preRelease: !!x.prerelease,
    url: x.html_url,
    assets: (x.assets || []).map((a) => ({ nome: a.name, bytes: a.size, downloads: a.download_count, url: a.browser_download_url })),
  }));
  return {
    status: 'ok',
    autenticado: tem('GITHUB_TOKEN'),
    repositorio: REPO_GITHUB,
    itens,
    linkPermanente: `https://github.com/${REPO_GITHUB}/releases/latest/download/grana.apk`,
  };
}

async function status() {
  const r = await releases();
  return { status: 'ok', ultima: r.itens[0] ? { tag: r.itens[0].tag, publicadaEm: r.itens[0].publicadaEm } : null };
}

module.exports = { releases, status };
