// A área da mídia da prévia nunca colapsa a zero nem mostra o alt solto, antes, durante e depois do load.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'tools/admin-local/web');
function playwright() {
  const bases = [ROOT, process.env.PLAYWRIGHT_DIR];
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache/_npx');
  if (fs.existsSync(cache)) for (const pasta of fs.readdirSync(cache)) bases.push(path.join(cache, pasta, 'node_modules'));
  for (const base of bases.filter(Boolean)) try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* tenta o próximo */ }
  throw Error('Playwright indisponível. A prova de navegador não pode ser declarada verde.');
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const BOOT = `import { montarMidia } from '/telas/_previa-publicacao.js';
const h = (tag, a, ...f) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(a || {})) { if (k === 'texto') e.textContent = v; else if (k === 'class') e.className = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); } for (const c of f.flat()) if (c) e.append(c); return e; };
window.montar = (p) => { document.body.innerHTML = ''; const m = montarMidia(h, p); document.body.append(h('div', { class: 'feed-post-corpo' }, m.elemento, h('div', { class: 'feed-post-lado' }, h('p', { texto: 'lado' })))); };`;
(async () => {
  const browser = await playwright().chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      let liberar; const preso = new Promise((r) => { liberar = r; });
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><link rel="stylesheet" href="/estilo.css"><script type="module" src="/qa/boot.js"></script></head><body></body></html>' });
        if (url.pathname === '/qa/boot.js') return route.fulfill({ contentType: 'text/javascript', body: BOOT });
        if (url.pathname === '/qa/lento.png') { await preso; return route.fulfill({ contentType: 'image/png', body: PNG }); }
        if (url.pathname === '/qa/quebrado.png') return route.fulfill({ status: 404, body: '' });
        const arquivo = path.join(WEB, url.pathname);
        return fs.existsSync(arquivo) && fs.statSync(arquivo).isFile() ? route.fulfill({ path: arquivo }) : route.fulfill({ status: 404, body: '' });
      });
      await page.goto('http://127.0.0.1:4399/');
      await page.waitForFunction(() => !!window.montar);
      // Caso do autor: PNG comum de feed, ainda carregando.
      await page.evaluate(() => window.montar({ titulo: 'Organize no computador', midias: ['/qa/lento.png'], capa: null, ehVideo: false, legenda: '' }));
      const caixa = async () => page.locator('.feed-post-midia').evaluate((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
      const antes = await caixa();
      assert(antes.w > 50 && antes.h > 50, `${width}px: mídia antes do load tem tamanho (${antes.w}x${antes.h})`);
      assert.equal(await page.locator('.feed-slide img').getAttribute('alt'), '', `${width}px: alt não aparece enquanto carrega`);
      assert(await page.locator('.feed-post-midia').evaluate((e) => e.classList.contains('feed-midia-carregando')), `${width}px: estado de carregamento`);
      liberar();
      await page.waitForFunction(() => document.querySelector('.feed-slide img')?.complete && document.querySelector('.feed-slide img').naturalWidth > 0);
      await page.waitForFunction(() => !document.querySelector('.feed-midia-carregando'));
      const depois = await caixa();
      assert(depois.w > 50 && depois.h > 50, `${width}px: mídia depois do load tem tamanho (${depois.w}x${depois.h})`);
      assert.equal(await page.locator('.feed-slide img').getAttribute('alt'), 'Organize no computador');
      // Arquivo que não abre: frase no lugar, nunca área em branco.
      await page.evaluate(() => window.montar({ titulo: 'Quebrada', midias: ['/qa/quebrado.png'], capa: null, ehVideo: false, legenda: '' }));
      await page.locator('.feed-midia-aviso[role=alert]').waitFor();
      assert(await page.locator('.feed-post-midia').evaluate((e) => e.getBoundingClientRect().height > 50), `${width}px: erro também ocupa a área`);
      await page.close();
    }
    console.log('admin-feed-midia-dom: área da mídia com tamanho antes, durante e depois do load; alt só depois; erro com frase OK');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
