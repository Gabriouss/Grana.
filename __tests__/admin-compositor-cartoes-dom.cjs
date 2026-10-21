// AUD-02 (21/10/2026): os cartões de escolha de peça do compositor nunca encolhem abaixo do conteúdo.
// Com o min-height de 44px no cartão e a bandeja limitada a 240px no painel do Calendário, a grade
// encolhia as linhas até caber (44px no celular, 72px em 1440) e miniatura, título e radio invadiam o
// cartão seguinte. Módulo real (montarReal com a integração do Calendário) e estilo.css real, no Chromium.
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
function png(w, h) {
  const bloco = (tipo, dados) => {
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo), dados]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8;
  const linha = Buffer.alloc(w + 1, 0x60); linha[0] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => linha)))), bloco('IEND', Buffer.alloc(0))]);
}
const MINIATURA = png(240, 300);
// Seis peças sintéticas: títulos de uma a quatro linhas, com e sem miniatura, com e sem a linha do calendário.
const BOOT = `import { montarReal } from '/telas/_publicacoes-reais-ui.js';
// Mesma semântica do h() de app.js.
const h = (tag, attrs, ...filhos) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'texto') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dados' && typeof v === 'object') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, ''); else el.setAttribute(k, String(v));
  }
  const anexar = (fs) => { for (const f of fs) { if (f === undefined || f === null || f === false) continue; if (Array.isArray(f)) anexar(f); else if (f instanceof Node) el.appendChild(f); else el.appendChild(document.createTextNode(String(f))); } };
  anexar(filhos);
  return el;
};
const TITULOS = ['Pix', 'Organize no computador, acompanhe pelo celular',
  'O café, o delivery, a corrida: tudo somado no fim do mês, sem planilha e sem susto, com aviso antes do limite do cartão',
  'Passou na farmácia hoje', 'Recebeu um Pix, só colar',
  'Pra onde foi o dinheiro do mês, peça com título longo o bastante para quebrar em quatro linhas no celular estreito sem perder nada'];
const PECAS = TITULOS.map((titulo, i) => ({ id: 'a1b2c3d4e5f6070' + i, versao: String(i).repeat(40), titulo, tipo: ['imagem', 'carrossel', 'video'][i % 3],
  midias: [{ tipo: i % 3 === 2 ? 'video' : 'imagem', mime: i % 3 === 2 ? 'video/mp4' : 'image/png' }], aprovada: true, bloqueios: [] }));
const FEED = PECAS.filter((_, i) => i !== 1 && i !== 4).map((p, i) => ({ id: p.id, titulo: p.titulo, capa: { url: '/qa/miniatura.png' }, ...(i % 2 ? {} : { data: '2026-10-22', hora: '12:00' }) }));
const cap = (formato, estado = 'disponivel') => ({ formato, estado, revisao: 1, motivos: estado === 'disponivel' ? [] : ['capacidade-nao-comprovada'] });
const CONTAS = [{ contaId: 'ig-1', rede: 'instagram', rotulo: '@grana.app', revisao: 3, conexao: 'verificada', pausada: false, capacidades: [cap('feed'), cap('carrossel'), cap('reels', 'nao-verificado'), cap('stories', 'nao-suportado')] }];
const envelope = (dados) => ({ ok: true, dados, atualizadoEm: new Date().toISOString() });
const real = (d) => ({ contractVersion: 'e5.real.v1', modo: 'real', ...d });
const ctx = { h, params: {}, obsoleta: () => false, aviso: () => {}, navegar: () => {}, urlArquivo: (c) => c,
  confirmar: async () => false, formulario: async () => null, cabecalho: () => {}, acao: async () => { throw Error('sem POST neste teste'); },
  api: async (p) => {
    if (p.startsWith('/api/marketing/publicacoes/capacidades')) return envelope(real({ contas: CONTAS, controles: { revisao: 2, pausaGlobal: false, pausaFacebook: false, pausaInstagram: false, habilitado: true } }));
    if (p.startsWith('/api/marketing/publicacoes/catalogo')) return envelope({ pecas: PECAS, total: PECAS.length });
    if (p.startsWith('/api/marketing/feed')) return envelope({ pecas: FEED });
    throw Error('rota fora do teste: ' + p);
  } };
// Montagem do Calendário (calendario.js): o compositor vai para o conteúdo do dialog.cal-unico-painel.
window.abrir = async () => {
  const raiz = h('div'), topo = h('div'), fila = h('div'), painel = h('div');
  const dialogo = h('dialog', { class: 'cal-unico-painel' }, h('div', { class: 'cal-unico-painel-topo' }, h('h2', { texto: 'Agendar de verdade' })), painel);
  raiz.append(topo, fila, dialogo); document.body.append(raiz);
  const controle = await montarReal(raiz, ctx, { topo, painel, fila, abrirPainel: () => {}, vinculado: () => false,
    listar: async () => ({ jobs: [], limitado: false, proximoCursor: null }), aposConfirmar: () => {} });
  if (controle.abrirCompositor(PECAS[0]) === false) throw Error('compositor recusou abrir');
  dialogo.showModal();
};
window.medir = () => {
  const caixa = (e) => { const b = e.getBoundingClientRect(); return { esq: b.left, topo: b.top, dir: b.right, base: b.bottom, w: b.width, h: b.height }; };
  const bandeja = document.querySelector('.cal-unico-painel .pub-real-pecas');
  const cartoes = [...bandeja.querySelectorAll('.pub-real-peca')].map((c) => {
    const s = getComputedStyle(c), b = caixa(c);
    const px = (v) => parseFloat(v) || 0;
    // Área útil: dentro da borda e do padding do próprio cartão.
    const util = { esq: b.esq + px(s.borderLeftWidth) + px(s.paddingLeft), topo: b.topo + px(s.borderTopWidth) + px(s.paddingTop),
      dir: b.dir - px(s.borderRightWidth) - px(s.paddingRight), base: b.base - px(s.borderBottomWidth) - px(s.paddingBottom) };
    const filhos = [...c.querySelectorAll('input, .pub-real-miniatura, strong, small')].map((f) => ({ nome: f.tagName + (f.className ? '.' + f.className : ''), ...caixa(f) }));
    return { titulo: c.querySelector('strong').textContent, caixa: b, util, filhos, transborda: c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1 };
  });
  return { bandeja: { ...caixa(bandeja), clientH: bandeja.clientHeight, scrollH: bandeja.scrollHeight, rola: ['auto', 'scroll'].includes(getComputedStyle(bandeja).overflowY) }, cartoes };
};`;
const TELAS = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const dentro = (de, em, nome) => assert.ok(de.esq >= em.esq - 1 && de.topo >= em.topo - 1 && de.dir <= em.dir + 1 && de.base <= em.base + 1,
  `${nome}: ${JSON.stringify(de)} fora de ${JSON.stringify(em)}`);
const cruzam = (a, b) => Math.min(a.dir, b.dir) - Math.max(a.esq, b.esq) > 1 && Math.min(a.base, b.base) - Math.max(a.topo, b.topo) > 1;

(async () => {
  const browser = await playwright().chromium.launch({ headless: true });
  let cartoesMedidos = 0;
  try {
    for (const [width, height] of TELAS) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const erros = []; page.on('pageerror', (e) => erros.push(e.message));
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><link rel="stylesheet" href="/estilo.css"><script type="module" src="/qa/boot.js"></script></head><body></body></html>' });
        if (url.pathname === '/qa/boot.js') return route.fulfill({ contentType: 'text/javascript', body: BOOT });
        if (url.pathname === '/qa/miniatura.png') return route.fulfill({ contentType: 'image/png', body: MINIATURA });
        const arquivo = path.join(WEB, url.pathname);
        return fs.existsSync(arquivo) && fs.statSync(arquivo).isFile() ? route.fulfill({ path: arquivo }) : route.fulfill({ status: 404, body: '' });
      });
      await page.goto('http://127.0.0.1:4397/');
      await page.waitForFunction(() => !!window.abrir);
      await page.evaluate(() => window.abrir());
      await page.locator('.cal-unico-painel .pub-real-peca').nth(5).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('.pub-real-peca img')].every((i) => i.complete && i.naturalWidth > 0));
      const rotulo = (s) => `${width}x${height} ${s}`;
      const m = await page.evaluate(() => window.medir());
      assert.equal(m.cartoes.length, 6, rotulo('seis cartões'));
      for (const [i, c] of m.cartoes.entries()) {
        assert.ok(!c.transborda, rotulo(`cartão ${i + 1} sem conteúdo vazando (${c.caixa.h}px)`));
        for (const f of c.filhos) dentro(f, c.util, rotulo(`cartão ${i + 1}, ${f.nome}`));
        for (const [j, outro] of m.cartoes.entries()) if (j > i) assert.ok(!cruzam(c.caixa, outro.caixa), rotulo(`cartões ${i + 1} e ${j + 1} não se sobrepõem`));
        cartoesMedidos++;
      }
      // Bandeja do painel: pode rolar, e o último cartão chega a ficar inteiro à vista.
      assert.ok(m.bandeja.rola, rotulo('bandeja rola'));
      await page.locator('.cal-unico-painel .pub-real-pecas').evaluate((b) => { b.scrollTop = b.scrollHeight; });
      const fim = await page.evaluate(() => { const b = document.querySelector('.cal-unico-painel .pub-real-pecas').getBoundingClientRect();
        const u = [...document.querySelectorAll('.pub-real-peca')].at(-1).getBoundingClientRect(); return { b: { esq: b.left, topo: b.top, dir: b.right, base: b.bottom }, u: { esq: u.left, topo: u.top, dir: u.right, base: u.bottom } }; });
      dentro(fim.u, fim.b, rotulo('último cartão inteiro depois de rolar'));
      // Clique no título marca o radio do próprio cartão (label nativo); teclado anda para o cartão seguinte.
      await page.locator('.pub-real-peca strong', { hasText: 'Passou na farmácia hoje' }).click();
      assert.equal(await page.locator('.pub-real-peca input:checked').evaluate((r) => r.closest('.pub-real-peca').querySelector('strong').textContent), 'Passou na farmácia hoje', rotulo('clique marca o próprio cartão'));
      await page.locator('.pub-real-peca input:checked').focus();
      await page.keyboard.press('ArrowDown');
      const foco = await page.evaluate(() => { const a = document.activeElement; const c = a.closest('.pub-real-peca'); const r = a.getBoundingClientRect(), k = c.getBoundingClientRect();
        return { checado: a.checked, titulo: c.querySelector('strong').textContent, dentro: r.top >= k.top && r.bottom <= k.bottom && r.left >= k.left && r.right <= k.right }; });
      assert.ok(foco.checado && foco.titulo === 'Recebeu um Pix, só colar' && foco.dentro, rotulo(`seta para baixo marca e foca o cartão seguinte (${JSON.stringify(foco)})`));
      assert.deepEqual(erros, [], rotulo('sem erro de página'));
      await page.close();
    }
    console.log(`admin-compositor-cartoes-dom: ${cartoesMedidos} cartões em ${TELAS.length} larguras contêm radio, miniatura e texto; bandeja rola até o último; label e teclado OK`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
