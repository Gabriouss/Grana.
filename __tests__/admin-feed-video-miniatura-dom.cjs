'use strict';
const assert = require('node:assert/strict');
const { abrirAmbiente, post } = require('./helpers/admin-feed-dom.cjs');
(async () => {
  for (const width of [390, 1440]) {
    const { browser, page } = await abrirAmbiente(width);
    try {
      for (const formato of ['reel', 'video']) {
        await page.evaluate(p => window.exibir(p), post(formato));
        await page.locator('.feed-celula').click();
        const dlg = page.locator('dialog[open]');
        const aviso = dlg.locator('.campo-ajuda');
        assert.equal(await aviso.count(), 1, 'Reel/vídeo deve identificar visualmente a miniatura parcial');
        assert.match(await aviso.innerText({ timeout: 2000 }), /apenas a miniatura do vídeo/i);
        assert.equal(await aviso.isVisible(), true);
        assert.equal(await dlg.locator('video').count(), 0, 'poster não vira player');
        await page.waitForFunction(() => document.querySelector('dialog .feed-post-real-img')?.naturalWidth > 0);
        assert.equal(await dlg.locator('img.feed-post-real-img').getAttribute('alt'), 'Miniatura do vídeo publicado');
        assert.equal(await dlg.getByRole('link', { name: 'Abrir no Instagram' }).getAttribute('href'), post('').link);
        for (const falha of ['http', 'imagem']) {
          await page.route('**/api/marketing/calendario/meta-midia?*', r => r.fulfill(falha === 'http'
            ? { status: 503, body: '' } : { contentType: 'image/jpeg', body: 'imagem-invalida' }));
          await page.evaluate(p => window.exibir(p), post(formato));
          await page.locator('.feed-celula').click();
          await page.waitForFunction(() => document.querySelector('dialog')?.textContent.includes('Sem miniatura.'));
          assert.equal(await page.locator('dialog .feed-midia-carregando').count(), 0, 'erro termina o carregamento');
          assert.match(await page.locator('dialog .campo-ajuda').innerText(), /miniatura do vídeo/i);
          assert.match(await page.locator('dialog .feed-legenda').innerText(), /Legenda remota preservada/);
          assert.equal(await page.locator('dialog').getByRole('link', { name: 'Abrir no Instagram' }).isVisible(), true);
          await page.unroute('**/api/marketing/calendario/meta-midia?*');
        }
      }
      await page.evaluate(p => window.exibir(p), post('imagem'));
      await page.locator('.feed-celula').click();
      assert.equal(await page.locator('dialog .campo-ajuda').count(), 0, 'imagem comum não recebe aviso de vídeo');
    } finally { await browser.close(); }
  }
  console.log('AUD-19: Reel/vídeo390/1440 com aviso parcial e alt, errosHTTP/decode encerram carregamento, legenda/link preservados OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
