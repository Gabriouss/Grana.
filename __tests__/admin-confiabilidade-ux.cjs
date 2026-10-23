'use strict';
// Telas reais + domínio Node real. Toda URL do navegador é interceptada localmente.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { abrirAmbiente } = require('./helpers/admin-publicacoes-ui-dom.cjs');
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-ux-confiavel-'));
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(raiz, 'conta');
const c = require('../tools/admin-local/marketing/catalogo.cjs'), ap = require('../tools/admin-local/marketing/aprovacoes.cjs');
(async () => {
  const { browser, page } = await abrirAmbiente();
  try {
    if (!process.argv.includes('--somente-email')) {
    const semana = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
    const pasta = path.join(raiz, semana, 'para-aprovacao/pecas'); fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'E01.jpg'), 'arte');
    fs.writeFileSync(path.join(pasta, 'COPYS-FINAIS.md'), '## E01 - Teste\n\n**Legenda:** Legenda teste.\n');
    fs.writeFileSync(path.join(raiz, semana, 'INDICE.md'), '# Teste\n');
    const p = c.montarCatalogo(raiz).find(p => p.tipo === 'imagem');
    let chamadas = 0;
    await page.exposeFunction('acaoEditorial', async () => {
      chamadas++;
      return { dados: await ap.aprovarEFechar(raiz, p.id, { versao: p.versao, confirmacao: true }, chamadas === 1
        ? { promover: async () => { throw Object.assign(Error('Disco'), { codigo: 'disco' }); } } : {}) };
    });
    await page.evaluate(async p => {
      const { aprovar } = await import('/telas/aprovacao.js');
      window.avisos = []; window.navegacoes = []; window.confirmacoes = 0;
      document.body.replaceChildren();
      const botao = document.createElement('button'); botao.textContent = 'Aprovar'; document.body.append(botao);
      const ctx = { obsoleta: () => false, confirmar: async () => { window.confirmacoes++; return true; },
        formatar: { dataHora: v => v }, aviso: (t, tipo) => window.avisos.push({ t, tipo }), navegar: u => window.navegacoes.push(u), acao: () => window.acaoEditorial() };
      botao.onclick = () => aprovar(ctx, p, botao);
    }, p);
    await page.getByRole('button', { name: 'Aprovar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('button').textContent === 'Continuar');
    assert.equal(await page.evaluate(() => window.navegacoes.length), 0, 'nenhuma navegação de sucesso parcial');
    assert.equal(await page.evaluate(() => window.avisos.some(a => a.tipo === 'ok')), false);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.waitForFunction(() => window.navegacoes.length === 1);
    assert.equal(await page.evaluate(() => window.confirmacoes), 1, 'Continuar não pede outro aceite');
    assert.equal(chamadas, 2);
    assert.equal(ap.listarAprovacoes(raiz).aprovacoes.length, 2, 'um aceite e uma promoção');
    await page.evaluate(async () => {
      const m = await import('/telas/_publicacoes-reais.js');
      m.gravarPendenciaPublicacao({ idempotencia: '11111111-1111-4111-8111-111111111111', tipo: 'confirmar' });
    });
    await page.reload(); await page.waitForFunction(() => !!window.exibir);
    await page.evaluate(() => window.exibir());
    assert.equal(await page.getByRole('button', { name: 'Consultar resultado pendente', exact: true }).count(), 1, 'reload recupera a intenção');
    assert.equal(await page.evaluate(() => window.posts.length), 0, 'reload não repete nenhum POST');
    assert.equal(await page.getByRole('button', { name: 'Gerar prévia dos destinos', exact: true }).isDisabled(), true);
    const aba = await page.context().newPage();
    await aba.goto(page.url()); await aba.waitForFunction(() => !!window.exibir); await aba.evaluate(() => window.exibir());
    assert.equal(await aba.getByRole('button', { name: 'Consultar resultado pendente', exact: true }).count(), 1, 'outra aba consulta a mesma intenção');
    assert.equal(await aba.evaluate(() => window.posts.length), 0);
    }
    await page.evaluate(async () => {
      const original = window.api;
      window.incidenteEmail = { emailEstado: 'falhou', emailCodigo: 'email-recusado', emailEntrega: 'nao-verificada' };
      window.api = async url => {
        const r = await original(url);
        if (Array.isArray(r.dados?.jobs) && !url.includes('/detalhe')) Object.assign(r.dados, {
          incidentesDisponiveis: true, naoReconhecidos: 1,
          incidentes: [{ incidenteId: '22222222-2222-4222-8222-222222222222', codigo: 'publicacao-incerta', jobId: r.dados.jobs[0].jobId, rede: 'facebook', resolvidoEm: null, ...window.incidenteEmail }],
        });
        return r;
      };
      await window.exibir();
    });
    assert.match(await page.locator('.pub-real-incidentes').innerText(), /Facebook.*falha[\s\S]*e-mail falhou/);
    assert.equal(await page.getByRole('button', { name: 'Conferir destino do incidente', exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => window.posts.length), 0, 'mostrar incidente/email falho não reenvia publicação');
    const cenariosEmail = [
      { estado: 'aceito', entrega: 'entregue', mensagem: /provedor informou a entrega.*caixa de entrada não foram verificadas/i, sem: /ainda não tem envio confirmado/i },
      { estado: 'aceito', entrega: 'nao-verificada', mensagem: /provedor aceitou.*entrega ainda não foi verificada/i },
      { estado: 'aceito', entrega: 'adiada', mensagem: /provedor aceitou.*entrega está adiada/i },
      { estado: 'falhou', entrega: 'falhou', mensagem: /entrega do alerta por e-mail falhou/i },
      { estado: 'aceito', mensagem: /provedor aceitou.*entrega ainda não foi verificada/i, sem: /provedor informou a entrega/i },
      { estado: 'pendente', entrega: 'nao-verificada', mensagem: /alerta por e-mail aguarda envio/i },
      { estado: 'enviando', entrega: 'nao-verificada', mensagem: /alerta por e-mail está em envio.*confirmação do provedor/i },
      { estado: 'incerto', entrega: 'nao-verificada', mensagem: /envio do alerta por e-mail tem resultado incerto/i },
      { estado: null, entrega: null, mensagem: /ainda não tem envio confirmado/i },
    ];
    for (const caso of cenariosEmail) {
      const dto = { emailEstado: caso.estado, ...(Object.hasOwn(caso, 'entrega') ? { emailEntrega: caso.entrega } : {}) };
      await page.evaluate(async dto => {
        window.incidenteEmail = dto;
        await window.exibir();
      }, dto);
      const texto = await page.locator('.pub-real-incidentes').innerText();
      assert.match(texto, caso.mensagem, `e-mail ${caso.estado}/${caso.entrega}`);
      if (caso.sem) assert.doesNotMatch(texto, caso.sem);
      if (!Object.hasOwn(caso, 'entrega')) assert.equal(await page.evaluate(() => Object.hasOwn(window.incidenteEmail, 'emailEntrega')), false, 'DTO legado realmente omite emailEntrega');
      assert.match(texto, /Facebook.*falha[\s\S]*alerta não autoriza repetir o envio/i, 'incidente original continua visivel');
      assert.equal(await page.getByRole('button', { name: 'Conferir destino do incidente', exact: true }).count(), 1);
      assert.equal(await page.evaluate(() => window.posts.length), 0, 'estado de e-mail não altera publicacao ou reconhecimento');
    }
    console.log(`admin-confiabilidade-ux: ${process.argv.includes('--somente-email') ? 'email focal: ' : 'browser→Node/aprovacao/duas abas + '}${cenariosEmail.length} estados de email na UI real; incidente preservado e zero POST OK`);
  } finally { await browser.close(); fs.rmSync(raiz, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
