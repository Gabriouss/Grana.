'use strict';
// Camada "Publicado na Meta": módulo real, Graph dublada. Só GET, token em cabeçalho (nunca na URL),
// vínculo apenas por legenda única, falha de uma rede não apaga a outra, nada de segredo na resposta.
const assert = require('node:assert/strict');
const { criarMetaPublicados } = require('../tools/admin-local/marketing/meta-publicados.cjs');

const TOKEN = 'TOKEN-FICTICIO-AUDIT', PAGINA = 'TOKEN-PAGINA-FICTICIO';
const env = { META_GRAPH_API_VERSION: 'v23.0', META_ACCESS_TOKEN: TOKEN, META_IG_USER_ID: '111', META_PAGE_ID: '222' };
const chamadas = [];
let modo = 'ok';
const resp = (status, corpo) => ({ status, text: async () => JSON.stringify(corpo) });
global.fetch = async (url, init) => {
  chamadas.push({ url: String(url), metodo: init.method, auth: init.headers.Authorization });
  const u = new URL(url);
  if (u.pathname.endsWith('/111/media')) {
    if (modo === 'ig-negado') return resp(400, { error: { code: 10 } });
    return resp(200, { data: [
      { id: 'a', caption: 'Pare de perder dinheiro\nsem perceber nada', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/AAA/', thumbnail_url: 'https://cdn.exemplo/a.jpg', timestamp: '2026-10-12T20:00:00+0000' },
      { id: 'b', caption: 'Legenda que nenhuma peca tem', media_type: 'CAROUSEL_ALBUM', permalink: 'javascript:alert(1)', media_url: 'https://cdn.exemplo/b.jpg', timestamp: '2026-10-03T12:00:00+0000' },
      { id: 'c', caption: 'Fora do mes', media_type: 'IMAGE', timestamp: '2026-09-30T12:00:00+0000' },
      { id: 'd', caption: 'Meia-noite UTC ainda e dia 31 em Sao Paulo', media_type: 'IMAGE', timestamp: '2026-11-01T01:00:00+0000' },
    ] });
  }
  if (u.pathname.endsWith('/222') && u.searchParams.get('fields') === 'access_token') return resp(200, { access_token: PAGINA });
  if (u.pathname.endsWith('/222/published_posts')) {
    if (init.headers.Authorization !== `Bearer ${PAGINA}`) return resp(403, { error: { code: 210 } });
    return resp(200, { data: [
    { id: 'f1', message: 'Pare de perder dinheiro sem perceber nada', created_time: '2026-10-12T21:00:00+0000', permalink_url: 'https://www.facebook.com/p/1', attachments: { data: [{ media_type: 'video' }] } },
  ] }); }
  throw new Error('GET inesperado ' + u.pathname);
};
const pecas = [
  { id: 'p'.repeat(16), versao: 'v'.repeat(40), legenda: 'Pare de perder dinheiro sem perceber nada' },
  { id: 'q'.repeat(16), versao: 'w'.repeat(40), legenda: '' },
];
const mk = (e = env) => criarMetaPublicados({ ler: (n) => e[n] || null, catalogo: () => ({ pecas }), agora: () => new Date('2026-10-18T12:00:00Z') });

(async () => {
  const r = await mk()('.', { mes: '2026-10' });
  assert.ok(chamadas.length >= 2 && chamadas.every((c) => c.metodo === 'GET'), 'só GET');
  assert.ok(chamadas.every((c) => [`Bearer ${TOKEN}`, `Bearer ${PAGINA}`].includes(c.auth) && !c.url.includes(TOKEN) && !c.url.includes(PAGINA)), 'token só no cabeçalho');
  assert.ok(chamadas.some((c) => c.url.includes('/published_posts') && c.auth === `Bearer ${PAGINA}`), 'Facebook usa o token da Página');
  assert.equal(JSON.stringify(r).includes(TOKEN) || JSON.stringify(r).includes(PAGINA), false, 'resposta sem token');
  assert.equal(r.completo, true); assert.equal(r.posts.length, 4, 'instagram: a e b; facebook: f1; d cai em 31/10');
  const por = (rede, data) => r.posts.filter((p) => p.rede === rede && p.data === data);
  const reel = por('instagram', '2026-10-12')[0];
  assert.equal(reel.formato, 'reel'); assert.equal(reel.legenda, 'Pare de perder dinheiro sem perceber nada'); assert.equal(reel.link, 'https://www.instagram.com/reel/AAA/');
  assert.equal(reel.miniatura, 'https://cdn.exemplo/a.jpg'); assert.equal(por('instagram', '2026-10-31').length, 1, 'fuso de São Paulo');
  const car = por('instagram', '2026-10-03')[0]; assert.equal(car.formato, 'carrossel'); assert.equal(car.link, null, 'link não https descartado');
  assert.equal(car.vinculo, null, 'legenda sem peça fica solta');
  // Mesma legenda em redes diferentes vincula a mesma peça, uma vez por rede.
  assert.deepEqual(reel.vinculo, { pecaId: pecas[0].id, versao: pecas[0].versao, criterio: 'mesma-legenda' });
  assert.equal(por('facebook', '2026-10-12')[0].vinculo.pecaId, pecas[0].id);
  assert.ok(r.posts.every((p) => !('legendaCompleta' in p) && !('id' in p)), 'sem id cru nem texto completo');
  // Ambiguidade: duas peças com a mesma legenda não vinculam.
  const dup = criarMetaPublicados({ ler: (n) => env[n] || null, agora: () => new Date('2026-10-18T12:00:00Z'),
    catalogo: () => ({ pecas: [pecas[0], { ...pecas[0], id: 'z'.repeat(16) }] }) });
  assert.ok((await dup('.', { mes: '2026-10' })).posts.every((p) => p.vinculo === null), 'legenda de duas peças não vincula');
  // Falha de uma rede preserva a outra e não vira "mês vazio".
  modo = 'ig-negado';
  const parcial = await mk()('.', { mes: '2026-10' });
  assert.equal(parcial.redes.instagram.status, 'indisponivel'); assert.equal(parcial.redes.instagram.motivo, 'sem-permissao');
  assert.equal(parcial.redes.facebook.status, 'disponivel'); assert.equal(parcial.completo, false); assert.equal(parcial.posts.length, 1);
  // Sem configuração: avisa, não chama a Graph.
  const antes = chamadas.length;
  const sem = await mk({})('.', { mes: '2026-10' });
  assert.equal(chamadas.length, antes); assert.equal(sem.redes.instagram.status, 'nao-configurado'); assert.equal(sem.completo, false);
  for (const f of [{ mes: '2026-13' }, { mes: '2026-10', x: 1 }, []]) await assert.rejects(() => mk()('.', f), (e) => e.status === 400);
  console.log('admin-meta-publicados: só GET, token no cabeçalho, fuso, formatos, vínculo só por legenda única, falha parcial e sem configuração OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
