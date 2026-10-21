'use strict';
const assert = require('node:assert/strict');
const { abrirAmbiente } = require('./helpers/admin-publicacoes-ui-dom.cjs');
(async () => {
  const { browser, page } = await abrirAmbiente();
  try {
    await page.evaluate(() => window.exibir());
    const gerar = page.getByRole('button', { name: 'Gerar prévia dos destinos', exact: true });
    if (process.argv.includes('--capacidade')) {
      await page.locator('input[name="destino-conta0"][value="feed"]').check();
      await page.locator('input[name="destino-conta1"][value="feed"]').check();
      await page.locator('input[name="pecaAprovada"][value="cccccccccccccccc"]').check();
      assert.equal(await page.locator('input[type="checkbox"][value="feed"]:checked').count(), 0);
      assert.equal(await page.locator('input[type="checkbox"][value="feed"]:disabled').count(), 2);
      assert.equal(await page.locator('input[type="checkbox"][value="reels"]:checked').count(), 0);
      await page.evaluate(() => document.querySelector('[data-acao-previa]').click());
      assert.equal(await page.evaluate(() => window.posts.length), 0);
      console.log('AUD-26 não procede: troca imagem→MP4 remove Feed nas2redes, não converte destino, zeroPOST/upload no módulo real');
      return;
    }
    assert.equal(await gerar.isDisabled(), true, 'fim de busy mantém prévia bloqueada sem destinos');
    await page.locator('input[name="destino-conta0"][value="feed"]').check();
    await page.locator('input[name="agendarParaLocal"]').fill('2027-01-01T12:00');
    assert.equal(await gerar.isEnabled(), true);
    await page.locator('input[name="agendarParaLocal"]').fill('2020-01-01T12:00');
    assert.equal(await gerar.isDisabled(), true);
    await page.getByRole('button', { name: 'Atualizar estado real', exact: true }).click();
    assert.equal(await gerar.isDisabled(), true, 'busy não reabilita horário passado');
    const descrito = await gerar.getAttribute('aria-describedby');
    assert(descrito, 'motivo associado semanticamente ao botão');
    assert.match(await page.locator('#'+descrito.split(' ').at(-1)).innerText(), /horário|hora|data|destino/i);
    await page.evaluate(() => document.querySelector('[data-acao-previa]').dispatchEvent(new MouseEvent('click')));
    assert.equal(await page.evaluate(() => window.posts.length), 0);
    assert.match(await page.locator('.publicacoes-recibo').innerText(), /horário|hora|data/i, 'clique inválido deixa motivo visível');
    await page.evaluate(() => window.exibir(true));
    assert.equal(await gerar.isDisabled(), true, 'catálogo vazio permanece bloqueado após busy');
    console.log('AUD-17: fim busy sem destino/horário válido/peça mantém bloqueio com motivo; clique inválido semPOST OK');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
