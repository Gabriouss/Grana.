'use strict';
const assert = require('node:assert/strict');
const { abrirAmbiente } = require('./helpers/admin-publicacoes-ui-dom.cjs');
(async () => {
  const { browser, page } = await abrirAmbiente();
  try {
    await page.evaluate(() => window.exibir());
    await page.getByRole('button', { name: 'Cancelar destino', exact: true }).click();
    const pendente = page.getByRole('button', { name: 'Consultar resultado pendente', exact: true });
    assert.equal(await pendente.count(), 1);
    const chave = await page.evaluate(() => window.posts[0].idempotencia);
    await page.evaluate(() => window.exibir()); // desmonta e remonta como a navegação SPA real
    assert.equal(await pendente.count(), 1, 'voltar à tela preserva a chave e a consulta pendente');
    await page.locator('input[name="destino-conta0"][value="feed"]').check();
    await page.locator('input[name="agendarParaLocal"]').fill('2027-01-01T12:00');
    assert.equal(await page.getByRole('button', { name: 'Gerar prévia dos destinos', exact: true }).isDisabled(), true, 'pendência bloqueia prévia mesmo com pré-requisitos válidos');
    await page.getByRole('button', { name: 'Cancelar destino', exact: true }).evaluate(e => e.click());
    assert.equal(await page.evaluate(() => window.posts.length), 1, 'navegação não libera outra mutação');
    await pendente.click();
    assert.equal(await pendente.count(), 1, 'consulta vazia não prova ausência');
    await page.evaluate(() => { window.falhaConsulta = true; });
    await pendente.click();
    await page.evaluate(() => window.exibir());
    assert.equal(await pendente.count(), 1, '404 seguido de navegação mantém pendência');
    await page.evaluate(() => { window.falhaConsulta = false; window.resolvido = true; });
    await pendente.click();
    assert.equal(await pendente.count(), 0);
    await page.evaluate(() => window.exibir());
    assert.equal(await pendente.count(), 0, 'recibo positivo encerra a pendência também na remontagem');
    const consultas = await page.evaluate(() => window.gets.filter(p => p.includes('/detalhe')));
    assert(consultas.length >= 3 && consultas.every(p => new URL(p, 'http://fixture').searchParams.get('idempotencia') === chave));
    assert.equal(await page.evaluate(() => window.posts.length), 1);
    console.log('Pendência navegação:503→sair/voltar→vazio/404 conserva chave+GET e bloqueiaPOST; recibo positivo libera OK');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
