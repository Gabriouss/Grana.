'use strict';
// Regressão (auditoria /impeccable, 21/10): cada miniatura do Feed vira um blob; sem liberar, o painel aberto
// o dia inteiro acumula memória a cada carga e a cada janela. Toda URL criada precisa ser liberada.
const assert = require('node:assert/strict');
const { abrirAmbiente, post } = require('./helpers/admin-feed-dom.cjs');

(async () => {
  const { browser, page } = await abrirAmbiente(1280);
  try {
    await page.evaluate(() => {
      window.blobs = { criadas: new Set(), liberadas: new Set() };
      const criar = URL.createObjectURL.bind(URL), liberar = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (b) => { const u = criar(b); window.blobs.criadas.add(u); return u; };
      URL.revokeObjectURL = (u) => { window.blobs.liberadas.add(u); return liberar(u); };
    });
    await page.evaluate((p) => window.exibir(p), post('imagem'));
    await page.waitForFunction(() => document.querySelector('.feed-celula-miniatura img')?.naturalWidth > 0);
    await page.locator('.feed-celula').first().click();
    await page.waitForFunction(() => document.querySelector('dialog[open] .feed-post-real-img')?.naturalWidth > 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({
      criadas: window.blobs.criadas.size,
      soltas: [...window.blobs.criadas].filter((u) => !window.blobs.liberadas.has(u)).length,
      visivel: document.querySelector('.feed-celula-miniatura img')?.naturalWidth > 0,
    }));
    assert.equal(r.criadas, 2, 'grade e janela carregam uma miniatura cada');
    assert.equal(r.soltas, 0, 'toda miniatura carregada libera o blob');
    assert.ok(r.visivel, 'a miniatura continua visível depois de liberada');
    console.log('admin-feed-miniatura-memoria-dom: grade e janela liberam os blobs e a miniatura segue visível OK');
  } finally { await browser.close(); }
})().catch((err) => { console.error(err); process.exitCode = 1; });
