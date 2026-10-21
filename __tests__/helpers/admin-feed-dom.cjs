'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '../..');
const WEB = path.join(ROOT, 'tools/admin-local/web');
function playwright() {
  const bases = [ROOT, process.env.PLAYWRIGHT_DIR];
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache/_npx');
  if (fs.existsSync(cache)) for (const p of fs.readdirSync(cache)) bases.push(path.join(cache, p, 'node_modules'));
  for (const base of bases.filter(Boolean)) try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch {}
  throw Error('Playwright indisponível');
}
function png() {
  const bloco = (tipo, dados) => {
    const b = Buffer.concat([Buffer.from(tipo), dados]), tam = Buffer.alloc(4), crc = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length); crc.writeUInt32BE(zlib.crc32(b)); return Buffer.concat([tam, b, crc]);
  };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(32); ih.writeUInt32BE(40, 4); ih[8] = 8;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), bloco('IHDR', ih),
    bloco('IDAT', zlib.deflateSync(Buffer.alloc(33 * 40))), bloco('IEND', Buffer.alloc(0))]);
}
const BOOT = `import { montar } from '/telas/feed.js';
const h = (tag, a, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(a || {})) {
    if (k === 'texto') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dados') Object.assign(e.dataset, v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const f of filhos.flat(Infinity)) if (f != null && f !== false) e.append(f);
  return e;
};
window.exibir = async (post, pecas = []) => {
  document.body.replaceChildren(); const raiz = h('main'); document.body.append(raiz);
  await montar(raiz, { h, cabecalho() {}, estado: { carregando() {} },
    formatar: { data: d => d }, urlArquivo: u => u,
    api: async url => ({dados: url.endsWith('feed-real') ? {
      status: 'disponivel', completo: true, perfil: {usuario:'teste'}, posts: post ? [post] : [], vinculadas: []
    } : {pecas}}) });
};`;
async function abrirAmbiente(width) {
  const browser = await playwright().chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const pedidos = [];
  await page.route('**/*', route => {
    const req = route.request(), u = new URL(req.url()); pedidos.push({ caminho: u.pathname, metodo: req.method() });
    if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><head><link rel="stylesheet" href="/estilo.css"></head><body><script type="module" src="/qa/boot.js"></script></body></html>' });
    if (u.pathname === '/qa/boot.js') return route.fulfill({ contentType: 'text/javascript', body: BOOT });
    if (u.pathname === '/api/marketing/calendario/meta-midia') return route.fulfill({ contentType: 'image/png', body: png() });
    const arq = path.join(WEB, u.pathname);
    return fs.existsSync(arq) && fs.statSync(arq).isFile() ? route.fulfill({ path: arq }) : route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://127.0.0.1:4396/');
  await page.waitForFunction(() => !!window.exibir);
  return { browser, page, pedidos };
}
const post = formato => ({ formato, rede: 'instagram', chave: 'a'.repeat(16),
  miniatura: '/api/marketing/calendario/meta-midia?chave=' + 'a'.repeat(16),
  data: '2026-10-21', publicadoEm: '2026-10-21T13:05:00Z', legenda: 'Legenda remota preservada',
  link: 'https://www.instagram.com/p/teste/' });
module.exports = { abrirAmbiente, post };
