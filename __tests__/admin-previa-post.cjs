// Módulos reais da prévia e do Feed, sem rede, publicação ou reimplementação.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function carregar(nome) {
  if (cache.has(nome)) return cache.get(nome).exports;
  const m = { exports: {} }; cache.set(nome, m);
  const js = ts.transpileModule(fs.readFileSync(path.join('tools/admin-local/web/telas', nome), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (id) => carregar(id.replace('./', '')), URL, location: { origin: 'http://127.0.0.1:4399' }, console, Date, Intl });
  return m.exports;
}
const { normalizarPreviaPost: normalizar } = carregar('_previa-post.js');
const base = { id: 'a'.repeat(16), versao: 'b'.repeat(40), nomeExibicao: 'Notificação vira lançamento · Carrossel', legenda: 'Legenda real\nSegunda linha.', tipo: 'carrossel', arquivos: [{ url: '/docs/marketing/um.png' }, { url: 'docs/marketing/dois.png' }] };
const origem = JSON.stringify(base);
let r = normalizar({ peca: base, formato: 'carrossel', jobs: [] });
assert.equal(r.titulo, base.nomeExibicao);
assert.deepEqual(Array.from(r.midias), ['/docs/marketing/um.png', '/docs/marketing/dois.png']);
assert.equal(r.legenda, base.legenda);
assert.equal(JSON.stringify(base), origem);
for (const formato of ['feed', 'carrossel', 'reels', 'stories']) assert.equal(normalizar({ peca: base, formato }).formato, formato);
assert.equal(normalizar({ peca: { tipo: 'video', arquivos: ['/docs/marketing/reel.mp4'] }, formato: 'reels' }).ehVideo, true);
assert.equal(normalizar({ peca: null, publicado: { rede: 'facebook', formato: 'reel', miniatura: 'https://example.org/thumb?size=large', link: 'https://example.org/post', legenda: 'Legenda curta' } }).somenteMiniatura, true);
assert.equal(normalizar({ peca: null, publicado: { rede: 'facebook', formato: 'reel', miniatura: 'https://example.org/thumb?size=large' } }).ehVideo, false, 'miniatura não vira vídeo fictício');
assert.equal(normalizar({ peca: base, jobs: [{ estado: 'precisa-conferir', destino: { rede: 'facebook', formato: 'stories' } }] }).rede, 'facebook');
for (const insegura of ['javascript:alert(1)', 'https://name:password@example.org/post', '//example.org/post', 'https://example.org/post?access_token=segredo-ficticio']) {
  r = normalizar({ peca: { arquivos: [insegura] }, publicado: { miniatura: insegura, link: insegura } });
  assert.equal(r.midias.length, 0); assert.equal(r.link, null);
}
for (const titulo of ['reels/arquivo.mp4', 'arte.png', 'pasta\\arquivo.jpg']) assert(!normalizar({ peca: { titulo } }).titulo.includes(titulo), 'caminho não vira título');
assert.equal(normalizar({ peca: { titulo: 'Um assunto claro' } }).titulo, 'Um assunto claro');
assert.equal(normalizar({ publicado: { formato: 'imagem' } }).formato, 'feed');
assert.equal(normalizar().midias.length, 0);
assert.equal(normalizar({ publicado: { miniatura: '/api/marketing/calendario/meta-midia?chave=' + 'a'.repeat(16) } }).miniaturaLocal, '/api/marketing/calendario/meta-midia?chave=' + 'a'.repeat(16));
assert.equal(normalizar({ publicado: { miniatura: '/api/marketing/calendario/meta-midia?chave=qualquer&url=https://example.org' } }).miniaturaLocal, null);
console.log('admin-previa-post: helper real do Feed, nomeExibicao, formatos, legenda, fuso/rede, miniatura honesta, URLs seguras e imutabilidade OK');
