'use strict';
const assert = require('node:assert/strict');
const { abrirAmbiente } = require('./helpers/admin-feed-dom.cjs');
(async () => {
  for (const width of [390, 1440]) {
    const { browser, page } = await abrirAmbiente(width);
    try {
      for (const data of [null, '2026-10-22']) {
        await page.evaluate(d => window.exibir(null, [{ id: 'editorial', titulo: 'Peça de teste',
          arquivos: [{ url: '/qa/editorial.png' }], legenda: 'Legenda editorial',
          planejamento: d ? { data: d } : null }]), data);
        await page.locator('.feed-proximas-grade .feed-celula').click();
        await page.waitForFunction(() => document.querySelector('dialog[open]')?.getAnimations({ subtree: true }).length === 0);
        const acao = page.locator('dialog').getByRole('link', { name: data ? 'Ver no calendário' : 'Marcar data no calendário', exact: true });
        const m = await acao.evaluate(e => {
          const s = getComputedStyle(e); return { classe: e.className, borda: s.borderTopColor,
            estilo: s.borderTopStyle, largura: parseFloat(s.borderTopWidth), altura: e.getBoundingClientRect().height };
        });
        assert.doesNotMatch(m.classe, /botao-fantasma/, 'ação de calendário visível em repouso');
        assert.equal(m.estilo, 'solid'); assert(m.largura >= 1);
        assert.notEqual(m.borda, 'rgba(0, 0, 0, 0)'); assert(m.altura >= 44);
        assert.equal(await acao.getAttribute('href'), '#/marketing/calendario');
        await acao.focus(); assert.equal(await acao.evaluate(e => e === document.activeElement), true);
        await acao.click(); assert.equal(await page.locator('dialog[open]').count(), 0);
        assert.equal(await page.evaluate(() => location.hash), '#/marketing/calendario');
      }
    } finally { await browser.close(); }
  }
  console.log('AUD-04 Feed: Ver/Marcar data com borda em repouso390/1440,44px,foco,href e fechamento preservados OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
