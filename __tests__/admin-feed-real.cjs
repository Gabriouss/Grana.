'use strict';
// Aba Feed real: módulo meta-publicados real, Graph dublada. Só GET, token em cabeçalho,
// nada de token/CDN na resposta, falha vira status com motivo (nunca lista vazia calada).
const assert = require('node:assert/strict');
const { criarMetaPublicados } = require('../tools/admin-local/marketing/meta-publicados.cjs');

const TOKEN = 'TOKEN-FICTICIO-FEED';
const env = { META_GRAPH_API_VERSION: 'v23.0', META_ACCESS_TOKEN: TOKEN, META_IG_USER_ID: '111' };
const chamadas = [];
let modo = 'ok';
const resp = (status, corpo) => ({ status, text: async () => JSON.stringify(corpo) });
global.fetch = async (url, init) => {
  chamadas.push({ url: String(url), metodo: init.method, auth: init.headers.Authorization });
  const u = new URL(url);
  if (modo === 'negado') return resp(400, { error: { code: 190 } });
  if (u.pathname.endsWith('/111') && u.searchParams.get('fields').includes('followers_count')) {
    return resp(200, { username: 'granaponto', name: 'Grana.', media_count: 7, followers_count: 12, follows_count: 3 });
  }
  if (u.pathname.endsWith('/111/media')) {
    return resp(200, { data: [
      { id: 'a', caption: 'Primeira legenda longa do reel', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/AAA/', thumbnail_url: 'https://scontent.cdninstagram.com/a.jpg', timestamp: '2026-10-12T20:00:00+0000' },
      { id: 'b', caption: 'Post antigo', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/BBB/', media_url: 'https://scontent.cdninstagram.com/b.jpg', timestamp: '2025-01-03T12:00:00+0000' },
    ] });
  }
  throw new Error('GET inesperado ' + u.pathname);
};
const pecas = [{ id: 'p'.repeat(16), versao: 'v'.repeat(40), legenda: 'Primeira legenda longa do reel' }];
const mk = () => criarMetaPublicados({ ler: (n) => env[n] || null, catalogo: () => ({ pecas }), agora: () => new Date('2026-10-18T12:00:00Z') });

(async () => {
  const r = await mk().feedReal('.');
  assert.equal(r.status, 'disponivel');
  assert.ok(chamadas.length >= 2 && chamadas.every((c) => c.metodo === 'GET' && c.auth === `Bearer ${TOKEN}` && !c.url.includes(TOKEN)), 'só GET, token só no cabeçalho');
  assert.deepEqual(r.perfil, { usuario: 'granaponto', nome: 'Grana.', posts: 7, seguidores: 12, seguindo: 3 });
  assert.equal(r.posts.length, 2, 'sem filtro de mês: posts antigos entram');
  assert.equal(r.posts[0].formato, 'reel'); assert.equal(r.posts[0].link, 'https://www.instagram.com/reel/AAA/');
  assert.deepEqual(r.vinculadas, [pecas[0].id], 'peça já publicada sai das próximas');
  const txt = JSON.stringify(r);
  assert.equal(txt.includes(TOKEN) || txt.includes('cdninstagram'), false, 'sem token nem URL da CDN');
  assert.ok(r.posts.every((p) => p.miniatura.startsWith('/api/marketing/calendario/meta-midia?chave=') && !('id' in p)));
  modo = 'negado';
  const f = await mk().feedReal('.');
  assert.equal(f.status, 'indisponivel'); assert.equal(f.motivo, 'sem-permissao'); assert.deepEqual(f.posts, []);
  const sem = await criarMetaPublicados({ ler: () => null, catalogo: () => ({ pecas: [] }) }).feedReal('.');
  assert.equal(sem.status, 'nao-configurado');
  console.log('admin-feed-real: ok');
})().catch((e) => { console.error(e); process.exit(1); });
