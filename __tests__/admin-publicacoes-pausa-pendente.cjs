'use strict';
const assert = require('node:assert/strict');
const { abrirAmbiente } = require('./helpers/admin-publicacoes-ui-dom.cjs');
(async () => {
  let checks = 0;
  for (const escopo of ['global', 'facebook', 'instagram', 'conta']) for (const pausada of [false, true]) {
    const { browser, page } = await abrirAmbiente();
    try {
      await page.evaluate(({ escopo, pausada }) => {
        const original = window.api;
        window.falharCapacidades = false;
        window.api = async path => {
          if (path.includes('/capacidades')) {
            if (window.falharCapacidades) throw Object.assign(Error('indisponível'), { status: 503 });
            const result = structuredClone(await original(path)), d = result.dados;
            // Outro administrador pode ter alterado o mesmo escopo. Estado/revisão não atribuem autoria.
            const revisao = window.posts.length ? 7 : 1;
            if (escopo === 'conta') Object.assign(d.contas[0], { pausada, revisao });
            else { d.controles[{ global: 'pausaGlobal', facebook: 'pausaFacebook', instagram: 'pausaInstagram' }[escopo]] = pausada; d.controles.revisao = revisao; }
            return result;
          }
          if (path.includes('/detalhe')) throw Object.assign(Error('lote-inexistente'), { status: 404, codigo: 'lote-inexistente' });
          return original(path);
        };
      }, { escopo, pausada });
      await page.evaluate(() => window.exibir());
      const indice = { global: 0, facebook: 1, instagram: 2, conta: 3 }[escopo];
      const acionar = () => page.locator('.pub-real-pausa').nth(indice).getByRole('button', { name: pausada ? 'Retomar' : 'Pausar', exact: true }).click();
      await acionar();
      const primeira = await page.evaluate(() => window.posts[0]);
      assert.equal(primeira.escopo, escopo); checks++;
      await page.evaluate(() => window.exibir());
      assert.equal(await page.evaluate(() => window.posts.length), 1, 'releitura nunca repete POST'); checks++;
      await acionar();
      const segunda = await page.evaluate(() => window.posts[1]);
      assert.ok(segunda, 'releitura autoritativa permite nova ação explícita sem bloqueio global'); checks++;
      assert.equal(segunda.revisaoEsperada, 7, 'nova intenção usa CAS atual'); checks++;
      assert.notEqual(segunda.idempotencia, primeira.idempotencia, 'nova intenção explícita não é replay da antiga'); checks++;
      await page.evaluate(() => window.exibir());
      const aviso = page.locator('.pub-real-pausas-incertas');
      const pedido = `${pausada ? 'Retomar' : 'Pausar'} ${{ global: 'Pausa global', facebook: 'Facebook', instagram: 'Instagram' }[escopo] || ''}`;
      assert.match(await aviso.innerText(), /resposta do pedido .+ não chegou/i); checks++;
      if (escopo !== 'conta') assert.ok((await aviso.innerText()).includes(pedido), 'o aviso nomeia o botão que o autor apertou'); checks++;
      assert.match(await aviso.innerText(), new RegExp(`Agora: ${pausada ? 'pausada' : 'ativa'} · revisão 7`)); checks++;
      assert.doesNotMatch(await aviso.innerText(), /recibo|autoria|idempot|CAS/i, 'aviso sem jargão'); checks++;
      // A chave fica só nos detalhes técnicos, fechados: textContent, não innerText.
      assert.ok((await aviso.textContent()).includes(primeira.idempotencia)); checks++;
      assert.equal(await page.getByRole('button', { name: 'Consultar resultado pendente', exact: true }).count(), 0, 'pausa não oferece consulta de jobs como recibo'); checks++;
      await page.evaluate(() => { window.falharCapacidades = true; return window.exibir(); });
      assert.equal(await page.evaluate(() => window.posts.length), 2); checks++;
      assert.ok((await aviso.textContent()).includes(primeira.idempotencia)); checks++;
      assert.ok((await aviso.textContent()).includes(segunda.idempotencia)); checks++;
      assert.doesNotMatch(await aviso.innerText(), /Agora:/, 'falha não finge releitura autoritativa'); checks++;
      await page.evaluate(() => { window.falharCapacidades = false; return window.exibir(); });
      assert.ok((await aviso.textContent()).includes(primeira.idempotencia)); checks++;
      assert.equal(await page.evaluate(() => window.posts.length), 2); checks++;
    } finally { await browser.close(); }
  }
  console.log(`Pausas incertas: ${checks} checks, oito casos, outro admin/CAS atual/chaves preservadas/zero replay automático OK`);
})().catch(e => { console.error(e); process.exitCode = 1; });
