// AUD-08 (21/10/2026): o cabeçalho da prévia do Feed separa tipo de mídia e destino planejado. MP4 sem
// canal aparecia como "Feed" por fallback; agora diz que não há destino, sem converter todo vídeo em
// Reels. Módulos reais (feed.js e _previa-publicacao.js), carregados como ESM.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// iconeSvg usa document.createElementNS; um dublê mínimo basta para montar o topo fora do navegador.
const no = () => ({ setAttribute() {}, appendChild() {} });
globalThis.document = { createElementNS: no };

(async () => {
  const web = (f) => pathToFileURL(path.resolve('tools/admin-local/web/telas', f)).href;
  const { rotuloDaPrevia } = await import(web('feed.js'));
  const { topoDaPrevia, ROTULO_PREVIA } = await import(web('_previa-publicacao.js'));

  const video = { tipo: 'video', ehVideo: true, capaOrfa: false, midias: ['/a.mp4'], canal: null };
  assert.equal(rotuloDaPrevia(video), 'Vídeo · sem destino planejado', 'MP4 sem canal não vira Feed');
  assert.ok(!/Feed|Reels/.test(rotuloDaPrevia(video)), 'nem Feed nem Reels por fallback');
  assert.equal(rotuloDaPrevia({ ...video, canal: 'reels' }), 'Vídeo · destino Reels');
  assert.equal(rotuloDaPrevia({ ...video, canal: 'instagram-feed' }), 'Vídeo · destino Feed', 'destino explícito é respeitado');
  assert.equal(rotuloDaPrevia({ tipo: 'imagem', ehVideo: false, midias: ['/a.png'], canal: 'instagram-feed' }), 'Imagem · destino Feed');
  assert.equal(rotuloDaPrevia({ tipo: 'carrossel', ehVideo: false, midias: ['/a.png', '/b.png'], canal: null }), 'Carrossel · sem destino planejado');
  assert.equal(rotuloDaPrevia({ tipo: 'imagem', ehVideo: false, capaOrfa: true, midias: ['/c.png'], canal: null }), 'Capa de Reel · sem destino planejado');
  assert.equal(rotuloDaPrevia({ tipo: 'texto', ehVideo: false, midias: [], canal: null }), 'Texto · sem destino planejado');
  // Limpar a data tira o canal, nunca o tipo da mídia.
  assert.match(rotuloDaPrevia({ ...video, canal: 'reels' }), /^Vídeo · /);
  assert.match(rotuloDaPrevia({ ...video, canal: null }), /^Vídeo · /);

  // O topo mostra o que recebeu; sem formato, fica só o rótulo da prévia (antes caía em "Feed").
  const h = (tag, attrs, ...filhos) => ({ tag, attrs: attrs || {}, filhos: filhos.flat() });
  const textos = (n) => !n || typeof n !== 'object' ? [] : [n.attrs?.texto, ...(n.filhos || []).flatMap(textos)].filter(Boolean);
  assert.deepEqual(textos(topoDaPrevia(h, { formato: rotuloDaPrevia(video) })), ['grana.', `${ROTULO_PREVIA} · Vídeo · sem destino planejado`]);
  assert.deepEqual(textos(topoDaPrevia(h, {})), ['grana.', ROTULO_PREVIA]);

  // AUD-15: o cabeçalho usa a rede recebida; AUD-16: sem ação de fechar, não há botão Fechar.
  const botao = (n) => !!n && typeof n === 'object' && (n.tag === 'button' || (n.filhos || []).some(botao));
  const fb = topoDaPrevia(h, { nome: 'Grana. (Página)', formato: 'Feed', plataforma: 'facebook', aoFechar: null });
  assert.deepEqual(textos(fb), ['Grana. (Página)', 'Prévia estimada do Facebook · Feed']);
  assert.equal(botao(fb), false, 'prévia inline sem Fechar sem ação');
  const ig = topoDaPrevia(h, { formato: 'Feed', plataforma: 'instagram', aoFechar: () => {} });
  assert.deepEqual(textos(ig), ['grana.', 'Prévia estimada do Instagram · Feed']);
  assert.equal(botao(ig), true, 'janela com fechamento mantém o botão');
  assert.deepEqual(textos(topoDaPrevia(h, { formato: 'Feed', plataforma: 'outra' })), ['grana.', 'Prévia estimada · Feed'], 'rede desconhecida não vira Instagram');

  console.log('admin-feed-rotulo-previa: tipo de mídia e destino separados, rede do destino no cabeçalho e Fechar só com ação OK');
})().catch((e) => { console.error(e); process.exit(1); });
