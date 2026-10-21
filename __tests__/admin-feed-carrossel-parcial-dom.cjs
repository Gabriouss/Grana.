'use strict';
const assert = require('node:assert/strict');
const { abrirAmbiente, post } = require('./helpers/admin-feed-dom.cjs');
(async () => {
  for (const width of [390, 1440]) {
    const { browser, page, pedidos } = await abrirAmbiente(width);
    try {
      await page.evaluate(p => window.exibir(p), post('carrossel'));
      await page.locator('.feed-celula').click();
      const dlg = page.locator('dialog[open]');
      const aviso = dlg.locator('.campo-ajuda');
      assert.match(await aviso.innerText(), /visualização mostra apenas a miniatura do carrossel/i);
      assert.doesNotMatch(await dlg.innerText(), /A Meta entrega só|1 de 5/);
      assert.equal(await aviso.isVisible(), true);
      assert.equal(await dlg.locator('.feed-seta, .feed-contador-slide, video').count(), 0);
      assert.equal(await dlg.locator('.feed-legenda').innerText(), '@testeLegenda remota preservada');
      assert.equal(await dlg.getByRole('link', { name: 'Abrir no Instagram' }).getAttribute('href'), post('').link);
      assert(pedidos.every(p => p.metodo === 'GET' && !p.caminho.includes('/docs/marketing/')));
      await dlg.getByRole('button', { name: 'Fechar', exact: true }).click();
      assert.equal(await page.locator('dialog[open]').count(), 0);
    } finally { await browser.close(); }
  }
  console.log('AUD-18: Feed real390/1440 identifica miniatura parcial, preserva legenda/link, sem slides locais ou contador fabricado OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
