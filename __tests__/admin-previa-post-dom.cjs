// Navegador real, fronteira HTTP inteiramente dublada. Nenhum POST é permitido.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'tools/admin-local/web');
const CSP = /const CSP = "([^"]+)";/.exec(fs.readFileSync(path.join(ROOT, 'tools/admin-local/seguranca.cjs'), 'utf8'))[1];
const OUT = process.env.QA_SAIDA || path.join(os.tmpdir(), 'grana-previa-post');
fs.mkdirSync(OUT, { recursive: true });
function playwright() {
  const bases = [ROOT, process.env.PLAYWRIGHT_DIR];
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache/_npx');
  if (fs.existsSync(cache)) for (const pasta of fs.readdirSync(cache)) bases.push(path.join(cache, pasta, 'node_modules'));
  for (const base of bases.filter(Boolean)) try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* tenta cache existente */ }
  throw Error('Playwright indisponível. A prova de navegador não pode ser declarada verde.');
}
const PECA = { id: 'a'.repeat(16), versao: 'b'.repeat(40), nomeExibicao: 'O mês fica claro antes de gastar · Carrossel', legenda: 'O que entra e o que já tem destino.\nVeja quanto fica livre no mês.', tipo: 'carrossel', arquivos: ['/qa/um.svg', '/qa/dois.svg', '/qa/tres.svg'] };
const job = (estado, rede = 'instagram', extra = {}) => ({ estado, destino: { rede, formato: 'feed', publicarEm: '2026-10-21T01:00:00Z' }, ...extra });
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><rect width="640" height="800" fill="#0b2d35"/><rect x="48" y="48" width="544" height="704" rx="12" fill="#052229" stroke="#aeffe3"/><text x="80" y="120" fill="#aeffe3" font-family="sans-serif" font-size="22">PRÉVIA DE TESTE · ${n}/3</text><text x="80" y="390" fill="#effffa" font-family="sans-serif" font-size="36">O mês fica claro.</text><text x="80" y="442" fill="#a6d9ce" font-family="sans-serif" font-size="25">Antes de gastar.</text><text x="80" y="700" fill="#aeffe3" font-family="sans-serif" font-size="28">Grana.</text></svg>`;
const videoPath = path.join(OUT, 'reel-fixture.mp4');
const ff = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=180x320:rate=12', '-t', '2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath], { stdio: 'pipe', windowsHide: true });
assert.equal(ff.status, 0, 'ffmpeg precisa gerar a mídia local de teste');
const thumbPath = path.join(OUT, 'miniatura-fixture.png');
assert.equal(spawnSync('ffmpeg', ['-y', '-i', videoPath, '-frames:v', '1', thumbPath], { stdio: 'pipe', windowsHide: true }).status, 0);

(async () => {
  const browser = await playwright().chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440, 2560]) {
      const page = await browser.newPage({ viewport: { width, height: 960 }, timezoneId: 'Asia/Tokyo', reducedMotion: 'reduce' });
      const erros = [], metodos = [];
      page.on('pageerror', (e) => erros.push(e.message));
      await page.route('**/*', (route) => {
        const req = route.request(), url = new URL(req.url()); metodos.push(req.method());
        assert.equal(req.method(), 'GET', 'prévia não pode escrever');
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': CSP }, body: `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/estilo.css"></head><body><main style="padding:24px"><h1>Calendário · prévia isolada</h1><button id="abrir">Abrir prévia</button></main><script type="module" src="/qa/bootstrap.js"></script></body></html>` });
        if (url.pathname === '/qa/bootstrap.js') return route.fulfill({ contentType: 'text/javascript', body: `import { abrirPreviaPost } from '/telas/_previa-post.js'; window.abrirPreviaPost=abrirPreviaPost; window.item=${JSON.stringify({ peca: PECA, formato: 'carrossel', jobs: [job('agendado-na-meta'), job('precisa-conferir', 'facebook', { codigoErro: 'conferir-recibo' })] })};document.querySelector('#abrir').onclick=()=>abrirPreviaPost(window.item);` });
        if (url.pathname.startsWith('/qa/') && url.pathname.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: SVG(url.pathname.includes('um') ? 1 : url.pathname.includes('dois') ? 2 : 3) });
        if (url.pathname === '/qa/reel.mp4') return route.fulfill({ contentType: 'video/mp4', body: fs.readFileSync(videoPath) });
        if (url.pathname === '/api/marketing/calendario/meta-midia') {
          assert.equal(req.headers()['x-grana-admin'], '1', 'miniatura usa a leitura autenticada existente');
          if (url.searchParams.get('chave') === 'b'.repeat(16)) return route.fulfill({ status: 404, body: '' });
          return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(thumbPath) });
        }
        const arquivo = url.pathname.startsWith('/design-system/') ? path.join(ROOT, url.pathname) : path.join(WEB, url.pathname);
        return fs.existsSync(arquivo) && fs.statSync(arquivo).isFile() ? route.fulfill({ path: arquivo }) : route.fulfill({ status: 404, body: '' });
      });
      await page.goto('http://127.0.0.1:4399/');
      await page.waitForFunction(() => !!window.abrirPreviaPost);
      await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click();
      await page.waitForLoadState('networkidle');
      const dialog = page.locator('dialog.previa-post[open]');
      await dialog.waitFor();
      assert.equal(await dialog.getByText('@granaponto', { exact: true }).count(), 2);
      // 19/10: estado por rede em palavras do autor (R9); 01:00Z do dia 21 é 22:00 do dia 20 em São Paulo, 10:00 no Japão.
      assert(await dialog.innerText().then((t) => t.includes('Não confirmamos se saiu') && t.includes('Abra o Facebook antes de tentar de novo')
        && /Pronto, sai (às|em .*20\/10,) 22:00/.test(t) && !/10:00/.test(t) && t.includes('Código: conferir-recibo')), 'destinos mantêm estado e horário de São Paulo mesmo com navegador no Japão');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'página sem overflow');
      assert(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth), 'janela sem overflow horizontal');
      await page.screenshot({ path: path.join(OUT, `previa-carrossel-${width}.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Próxima página', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.feed-contador-slide')?.textContent === '2 de 3');
      await dialog.locator('.feed-trilho').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.feed-contador-slide')?.textContent === '3 de 3');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.previa-post'));
      assert.equal(await page.evaluate(() => document.activeElement.id), 'abrir', 'Escape devolve o foco');

      for (const formato of ['feed', 'stories', 'reels']) {
        await page.evaluate(({ peca, formato }) => { window.item = { peca: { ...peca, tipo: formato === 'reels' ? 'video' : 'imagem', arquivos: [formato === 'reels' ? '/qa/reel.mp4' : '/qa/um.svg'] }, formato, jobs: [{ estado: 'publicado', destino: { rede: 'instagram', formato, publicarEm: '2026-10-20T18:00:00Z' }, permalink: 'https://www.instagram.com/p/audit/' }] }; }, { peca: PECA, formato });
        await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click();
        await dialog.waitFor();
        await page.waitForLoadState('networkidle');
        assert.equal(await dialog.getByRole('link', { name: 'Abrir no Instagram' }).getAttribute('href'), 'https://www.instagram.com/p/audit/');
        if (formato !== 'feed') assert(await dialog.locator('.feed-post-midia').evaluate((e) => { const [a, b = 1] = getComputedStyle(e).aspectRatio.split('/').map(Number); const r = e.getBoundingClientRect(); return Math.abs(a / b - 9 / 16) < 0.001 && Math.abs(r.width / r.height - 9 / 16) < 0.01; }), 'mídia ocupa de fato um retângulo 9:16');
        if (formato === 'reels') {
          await page.waitForFunction(() => { const v = document.querySelector('dialog video'); return v && !v.paused && v.currentTime > 0.1; }, null, { timeout: 10000 });
          await page.evaluate(() => { window.videoFechado = document.querySelector('dialog video'); });
        }
        assert(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth), `${formato} sem overflow em ${width}`);
        await page.screenshot({ path: path.join(OUT, `previa-${formato}-${width}.png`), fullPage: true });
        await dialog.getByRole('button', { name: 'Fechar prévia', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog.previa-post'));
        if (formato === 'reels') assert(await page.evaluate(() => window.videoFechado.paused), 'fechar pausa o Reel');
      }
      // Consulta tardia: uma versão diferente não substitui a peça que foi clicada.
      await page.evaluate((peca) => { window.item = { peca: { id: peca.id, versao: peca.versao }, jobs: [], carregarPeca: async () => ({ ...peca, versao: 'c'.repeat(40) }) }; }, PECA);
      await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click();
      await dialog.getByRole('button', { name: 'Tentar de novo', exact: true }).waitFor();
      assert.equal(await dialog.locator('.feed-slide').count(), 0, 'versão divergente não mostra mídia');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.previa-post'));
      await page.evaluate((peca) => { window.item = { peca: { id: peca.id, versao: peca.versao }, jobs: [], carregarPeca: async () => peca }; }, PECA);
      await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click();
      await dialog.locator('.feed-slide').first().waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.previa-post'));
      await page.evaluate(() => { window.item = { origem: 'meta', peca: null, rede: 'facebook', formato: 'carrossel', jobs: [],
        publicado: { rede: 'facebook', formato: 'carrossel', legenda: 'Legenda curta recebida da Meta.', miniatura: 'https://example.org/qa/um.svg', link: 'https://www.facebook.com/audit/posts/1', publicadoEm: '2026-10-20T18:00:00Z' },
        carregarPeca: () => { throw Error('Post solto não pode consultar uma peça inventada'); } }; });
      await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click();
      await dialog.getByText('Publicado no Facebook', { exact: true }).waitFor();
      if (!CSP.includes('img-src https:')) await dialog.getByText('Não foi possível abrir esta mídia. A legenda e os estados continuam disponíveis.', { exact: true }).waitFor();
      assert(await dialog.innerText().then((t) => t.includes('somente a miniatura e uma legenda curta')));
      assert.equal(await dialog.getByRole('link', { name: 'Abrir publicação confirmada' }).getAttribute('href'), 'https://www.facebook.com/audit/posts/1');
      await page.screenshot({ path: path.join(OUT, `previa-facebook-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.previa-post'));
      await page.evaluate(() => { const original = URL.revokeObjectURL; window.revogadas = []; URL.revokeObjectURL = (u) => { window.revogadas.push(u); original(u); }; window.item = { origem: 'meta', peca: null, rede: 'facebook', formato: 'feed', jobs: [], publicado: { rede: 'facebook', formato: 'imagem', miniatura: '/api/marketing/calendario/meta-midia?chave=' + 'a'.repeat(16), legenda: 'Legenda curta recebida da Meta.', link: 'https://www.facebook.com/audit/posts/1', publicadoEm: '2026-10-20T18:00:00Z' } }; });
      await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click();
      await dialog.locator('.feed-slide img').waitFor();
      await page.waitForFunction(() => document.querySelector('dialog .feed-slide img')?.naturalWidth > 0);
      assert(await dialog.locator('.feed-slide img').getAttribute('src').then((u) => u.startsWith('blob:')), 'miniatura local usa blob sob CSP real');
      const blobDaMiniatura = await dialog.locator('.feed-slide img').getAttribute('src');
      await page.screenshot({ path: path.join(OUT, `previa-facebook-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.previa-post'));
      assert(await page.evaluate((u) => window.revogadas.includes(u), blobDaMiniatura), 'fechar revoga a URL da miniatura');
      await page.evaluate(() => { window.item = { ...window.item, publicado: { ...window.item.publicado, miniatura: '/api/marketing/calendario/meta-midia?chave=' + 'b'.repeat(16) } }; });
      await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click();
      await dialog.getByText('Sem miniatura. Atualize o mês para tentar novamente. A legenda e o link foram preservados.', { exact: true }).waitFor();
      assert.equal(await dialog.getByRole('link', { name: 'Abrir publicação confirmada' }).count(), 1, '404 da mídia não apaga o link confirmado');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.previa-post'));
      await page.evaluate((peca) => { window.item = { peca: { id: peca.id, versao: peca.versao }, jobs: [], carregarPeca: () => new Promise((resolve) => { window.resolverLeitura = resolve; }) }; }, PECA);
      await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click();
      await dialog.getByText('Lendo mídia e legenda desta versão…', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.previa-post'));
      await page.evaluate((peca) => window.resolverLeitura(peca), PECA);
      assert.equal(await page.locator('dialog.previa-post').count(), 0, 'leitura tardia não reabre a janela fechada');
      assert.equal(erros.length, 0, erros.join('\n'));
      assert(!metodos.some((m) => m !== 'GET'));
      console.log(`${width}px: carrossel/setas/teclado, feed, stories, Reel rodando e pausado ao fechar, foco, fonte exata, estados, fuso, links e zero POST OK`);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log(`admin-previa-post-dom: prints em ${OUT}`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
