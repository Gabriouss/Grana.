'use strict';
// Módulo real, relógio controlado e Graph/CDN dubladas. Nenhuma rede real.
const assert = require('node:assert/strict');
const { criarMetaPublicados } = require('../tools/admin-local/marketing/meta-publicados.cjs');
const env = { META_GRAPH_API_VERSION: 'v23.0', META_ACCESS_TOKEN: 'credencial-ficticia', META_IG_USER_ID: '111' };
let agora = new Date('2026-10-21T13:05:00Z'), geracao = 0, modo = 'ok';
const chamadas = [];
global.fetch = async (url, init) => {
  chamadas.push({ url: new URL(url), metodo: init.method });
  const media = new URL(url).pathname.endsWith('/media');
  if (media) geracao++;
  if (modo === 'negado') return { status: 400, text: async () => JSON.stringify({ error: { code: 190 } }) };
  if (media && modo === 'removido') return { status: 200, text: async () => JSON.stringify({ data: [] }) };
  return { status: 200, text: async () => JSON.stringify(media ? { data: [{
    id: 'reel-remoto', media_type: 'VIDEO', media_product_type: 'REELS',
    caption: 'Conheça o Granabô', timestamp: '2026-10-21T13:05:00Z',
    permalink: 'https://www.instagram.com/reel/teste/',
    thumbnail_url: `https://scontent.cdninstagram.com/capa-${geracao}.jpg`,
    media_url: 'https://scontent.cdninstagram.com/video.mp4',
  }] } : { username: 'teste', media_count: 1 }) };
};
const cdn = [];
const m = criarMetaPublicados({ ler: n => env[n], catalogo: () => ({ pecas: [] }), agora: () => agora,
  buscar: async (url, init) => {
    cdn.push(url); assert.equal(init.method, 'GET');
    assert.match(url, /capa-\d+\.jpg$/); // Nunca usa o MP4 nem uma mídia editorial local.
    return { status: 200, headers: { get: n => n === 'content-type' ? 'image/jpeg' : null },
      body: { async *[Symbol.asyncIterator]() { yield Buffer.from('JPEG'); } } };
  } });
(async () => {
  const feed = await m.feedReal('.');
  const post = feed.posts[0];
  assert.equal((await m.midia(post.chave)).mime, 'image/jpeg');
  assert.equal(geracao, 1);
  agora = new Date('2026-10-21T13:36:00Z');
  assert.equal((await m.midia(post.chave)).mime, 'image/jpeg', 'Feed aberto há31min deve renovar a miniatura ao abrir o mesmo Reel');
  assert.equal(geracao, 2, 'renova pela mesma leitura Graph do Feed');
  assert.match(cdn[1], /capa-2\.jpg$/, 'usa a URL remota renovada');
  await m.midia(post.chave);
  assert.equal(geracao, 2, 'chave válida não repete a consulta');
  const antes = chamadas.length;
  await assert.rejects(() => m.midia('0'.repeat(16)), e => e.status === 404);
  await assert.rejects(() => m.midia('../x'), e => e.status === 400);
  assert.equal(chamadas.length, antes, 'chaves desconhecidas não geram Graph');
  const bytesAntes = cdn.length;
  agora = new Date('2026-10-21T14:07:00Z');
  modo = 'removido';
  await assert.rejects(() => m.midia(post.chave), e => e.status === 404, 'post ausente na releitura não reutiliza a URL antiga');
  agora = new Date('2026-10-21T14:38:00Z');
  modo = 'negado';
  await assert.rejects(() => m.midia(post.chave), e => e.status === 404, 'falha da origem mantém indisponível');
  assert.equal(cdn.length, bytesAntes, 'sem busca CDN depois de ausência ou recusa');
  assert(chamadas.every(c => c.metodo === 'GET'));
  console.log('admin-meta-miniatura-renovacao: Reel JPEG válido, chave expirada renovada, MP4/local excluídos e somente GET OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
