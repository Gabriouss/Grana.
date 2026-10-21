// AUD-01 (21/10/2026): no modal do Feed, a peça aparece inteira dentro da janela. No desktop a proporção da
// peça tirava a altura da largura da coluna (738x984 num corpo de 760) e o rodapé da arte ficava fora.
// Módulo real (montarMidia) e estilo.css real, medidos no Chromium do Playwright: as quatro bordas do que é
// desenhado (contain) cabem na área, a área cabe no corpo e o corpo cabe na janela, sem deformar a peça.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
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
// PNG cinza liso do tamanho pedido: a medida depende só da proporção natural.
function png(w, h) {
  const bloco = (tipo, dados) => {
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo), dados]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; // 8 bits, cinza
  const linha = Buffer.alloc(w + 1, 0x80); linha[0] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => linha)))), bloco('IEND', Buffer.alloc(0))]);
}
const IMAGENS = { '/qa/3x4.png': png(1080, 1440), '/qa/4x5.png': png(1080, 1350), '/qa/9x16.png': png(1080, 1920), '/qa/miniatura.png': png(640, 1136) };
// Mesma montagem de feed.js: abrirPost (montarMidia no corpo) e abrirPostReal (miniatura com proporção no load).
const BOOT = `import { montarMidia, topoDaPrevia } from '/telas/_previa-publicacao.js';
const h = (tag, a, ...f) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(a || {})) { if (k === 'texto') e.textContent = v; else if (k === 'class') e.className = v; else if (k === 'onclick') e.addEventListener('click', v); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); } for (const c of f.flat()) if (c) e.append(c); return e; };
const lado = (dlg) => h('div', { class: 'feed-post-lado' }, topoDaPrevia(h, { aoFechar: () => dlg.close() }),
  h('div', { class: 'feed-legenda', texto: 'Legenda longa para rolar. '.repeat(120) }), h('div', { class: 'feed-post-meta', texto: 'meta' }));
const limpar = () => document.querySelectorAll('dialog').forEach((d) => { if (d.open) d.close(); d.remove(); });
window.abrir = (p) => {
  limpar();
  const corpo = h('div', { class: 'feed-post-corpo' });
  const dlg = h('dialog', { class: 'feed-post', 'aria-label': p.titulo }, corpo);
  corpo.append(montarMidia(h, p).elemento, lado(dlg));
  document.body.append(dlg); dlg.showModal();
};
window.abrirReal = (url) => {
  limpar();
  const dlg = h('dialog', { class: 'feed-post', 'aria-label': 'Post real' });
  const img = h('img', { alt: '', class: 'feed-post-real-img' });
  const midia = h('div', { class: 'feed-post-midia feed-midia-carregando' }, img);
  img.addEventListener('load', () => { midia.classList.remove('feed-midia-carregando'); midia.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight; }, { once: true });
  img.src = url;
  dlg.append(h('div', { class: 'feed-post-corpo' }, midia, lado(dlg)));
  document.body.append(dlg); dlg.showModal();
};
// Vídeo 9:16 de verdade, gravado do canvas: a caixa do player e os controles também têm de caber.
window.gravarVideo = async (w, hh) => {
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d'); let i = 0;
  const pintar = setInterval(() => { g.fillStyle = i++ % 2 ? '#1a6' : '#a61'; g.fillRect(0, 0, w, hh); }, 40);
  const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm' }); const partes = [];
  rec.ondataavailable = (e) => partes.push(e.data);
  const fim = new Promise((r) => { rec.onstop = r; });
  rec.start(); await new Promise((r) => setTimeout(r, 500)); rec.stop(); await fim; clearInterval(pintar);
  return URL.createObjectURL(new Blob(partes, { type: 'video/webm' }));
};
window.medir = (indice) => {
  const caixa = (e) => { const b = e.getBoundingClientRect(); return { esq: b.left, topo: b.top, dir: b.right, base: b.bottom, w: b.width, h: b.height }; };
  const dlg = document.querySelector('dialog[open]');
  const el = [...dlg.querySelectorAll('.feed-slide img, .feed-slide video, .feed-post-real-img')][indice];
  const nw = el.naturalWidth || el.videoWidth, nh = el.naturalHeight || el.videoHeight;
  const b = caixa(el), ajuste = getComputedStyle(el).objectFit;
  // contain centraliza a peça na caixa; "fill" esticaria e a proporção desenhada deixaria de ser a natural.
  const k = ajuste === 'fill' ? null : Math.min(b.w / nw, b.h / nh, ajuste === 'scale-down' ? 1 : Infinity);
  const dw = k ? nw * k : b.w, dh = k ? nh * k : b.h;
  const desenho = { esq: b.esq + (b.w - dw) / 2, topo: b.topo + (b.h - dh) / 2, w: dw, h: dh };
  desenho.dir = desenho.esq + dw; desenho.base = desenho.topo + dh;
  const seta = dlg.querySelector('.feed-seta-prox:not([hidden])'), legenda = dlg.querySelector('.feed-legenda');
  return { tela: { esq: 0, topo: 0, dir: innerWidth, base: innerHeight }, dlg: caixa(dlg), corpo: caixa(dlg.querySelector('.feed-post-corpo')),
    area: caixa(dlg.querySelector('.feed-post-midia')), el: b, desenho, natural: { w: nw, h: nh }, ajuste,
    fechar: caixa(dlg.querySelector('.feed-fechar')), seta: seta ? caixa(seta) : null,
    legendaRola: legenda.scrollHeight <= legenda.clientHeight + 1 || ['auto', 'scroll'].includes(getComputedStyle(legenda).overflowY) };
};`;
const dentro = (de, em, nome) => {
  const f = 1; // tolerância de arredondamento subpixel
  assert.ok(de.esq >= em.esq - f && de.topo >= em.topo - f && de.dir <= em.dir + f && de.base <= em.base + f,
    `${nome}: ${JSON.stringify(de)} fora de ${JSON.stringify(em)}`);
};
const TELAS = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];

(async () => {
  const browser = await playwright().chromium.launch({ headless: true });
  let medidas = 0;
  try {
    for (const [width, height] of TELAS) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><link rel="stylesheet" href="/estilo.css"><script type="module" src="/qa/boot.js"></script></head><body></body></html>' });
        if (url.pathname === '/qa/boot.js') return route.fulfill({ contentType: 'text/javascript', body: BOOT });
        if (IMAGENS[url.pathname]) return route.fulfill({ contentType: 'image/png', body: IMAGENS[url.pathname] });
        const arquivo = path.join(WEB, url.pathname);
        return fs.existsSync(arquivo) && fs.statSync(arquivo).isFile() ? route.fulfill({ path: arquivo }) : route.fulfill({ status: 404, body: '' });
      });
      await page.goto('http://127.0.0.1:4398/');
      await page.waitForFunction(() => !!window.abrir);
      const desktop = width >= 900;
      const estavel = () => page.waitForFunction(() => {
        const d = document.querySelector('dialog[open]');
        return d && !d.querySelector('.feed-midia-carregando') && [...d.querySelectorAll('.feed-slide img, .feed-slide video, .feed-post-real-img')].every((e) => e.tagName === 'VIDEO' ? e.videoWidth > 0 : e.complete && e.naturalWidth > 0)
          && d.getAnimations({ subtree: true }).length === 0;
      });
      const conferir = async (nome, indice, limiteLargura) => {
        const m = await page.evaluate((i) => window.medir(i), indice);
        const rotulo = `${width}x${height} ${nome}`;
        assert.notEqual(m.ajuste, 'fill', `${rotulo}: mídia com contain, sem esticar`);
        assert.ok(Math.abs(m.desenho.w / m.desenho.h - m.natural.w / m.natural.h) < 0.01, `${rotulo}: proporção natural preservada`);
        dentro(m.desenho, m.area, `${rotulo}: peça desenhada dentro da área`);
        dentro(m.el, m.area, `${rotulo}: caixa da mídia (e controles do vídeo) dentro da área`);
        dentro(m.area, m.tela, `${rotulo}: área inteira visível na abertura`);
        dentro(m.fechar, m.tela, `${rotulo}: fechar visível`);
        if (m.seta) dentro(m.seta, m.area, `${rotulo}: seta do carrossel na área`);
        assert.ok(m.legendaRola, `${rotulo}: legenda longa continua acessível por rolagem`);
        if (desktop) {
          dentro(m.area, m.corpo, `${rotulo}: área dentro do corpo`);
          dentro(m.corpo, m.dlg, `${rotulo}: corpo dentro da janela`);
          // Critério do aceite: numa altura útil H, 3:4 não passa de 0,75H de largura e 9:16 de 0,5625H.
          if (limiteLargura) assert.ok(m.desenho.w <= m.area.h * limiteLargura + 1, `${rotulo}: largura desenhada ${m.desenho.w} > ${m.area.h * limiteLargura}`);
          assert.ok(m.area.h <= m.corpo.h + 1, `${rotulo}: a proporção não empurra a área além do corpo (${m.area.h} > ${m.corpo.h})`);
        }
        medidas++;
        return m;
      };

      await page.evaluate(() => window.abrir({ titulo: 'Imagem 3:4', midias: ['/qa/3x4.png'], capa: null, ehVideo: false, legenda: '' }));
      await estavel();
      const m34 = await conferir('imagem 3:4', 0, 3 / 4);
      if (width === 1440) assert.ok(m34.corpo.h <= 760.5 && m34.desenho.w <= 570.5, `1440: 3:4 em ${m34.corpo.h} de altura cabe em até 570 (${m34.desenho.w})`);

      await page.evaluate(() => window.abrir({ titulo: 'Carrossel 4:5', midias: ['/qa/4x5.png', '/qa/4x5.png'], capa: null, ehVideo: false, legenda: '' }));
      await estavel();
      await conferir('carrossel 4:5, slide 1', 0, 4 / 5);
      await page.click('.feed-seta-prox');
      await page.waitForFunction(() => { const t = document.querySelector('.feed-trilho'); return Math.abs(t.scrollLeft - t.clientWidth) < 2; });
      await conferir('carrossel 4:5, slide 2', 1, 4 / 5);

      await page.evaluate(() => window.abrir({ titulo: 'Capa 9:16', midias: ['/qa/9x16.png'], capa: null, ehVideo: false, legenda: '' }));
      await estavel();
      await conferir('poster 9:16', 0, 9 / 16);

      const video = await page.evaluate(() => window.gravarVideo(180, 320));
      await page.evaluate((url) => window.abrir({ titulo: 'Reel 9:16', midias: [{ url, tipo: 'video' }], capa: { url: '/qa/9x16.png' }, ehVideo: true, legenda: '' }), video);
      await estavel();
      const mv = await conferir('vídeo 9:16', 0, 9 / 16);
      if (width === 1440) assert.ok(mv.desenho.w <= 428, `1440: 9:16 em 760 cabe em até 427,5 (${mv.desenho.w})`);

      for (const [nome, url, limite] of [['publicado 4:5', '/qa/4x5.png', 4 / 5], ['publicado, miniatura 9:16', '/qa/miniatura.png', 640 / 1136]]) {
        await page.evaluate((u) => window.abrirReal(u), url);
        await estavel();
        await conferir(nome, 0, limite);
      }
      await page.close();
    }
    // A montagem medida é a do Feed: o corpo recebe a área de montarMidia direto (feed.js) e o Calendário fica fora.
    const feed = fs.readFileSync(path.join(WEB, 'telas/feed.js'), 'utf8');
    assert.match(feed, /h\('dialog', \{ class: 'feed-post', 'aria-label': p\.titulo \}, corpo\)/);
    assert.match(feed, /corpo\.append\(midiaEl, /);
    console.log(`admin-feed-modal-midia-inteira-dom: ${medidas} medidas em ${TELAS.length} larguras (imagem 3:4, carrossel, 9:16, vídeo, publicado) com a peça inteira na janela OK`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
