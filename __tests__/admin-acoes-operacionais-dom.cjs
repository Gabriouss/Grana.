'use strict';
// Calendário/compositor reais: ações secundárias reconhecíveis sem hover.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'tools/admin-local/web');
function playwright() {
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache/_npx');
  const bases = [ROOT, process.env.PLAYWRIGHT_DIR, ...(fs.existsSync(cache) ? fs.readdirSync(cache).map(p => path.join(cache, p, 'node_modules')) : [])];
  for (const p of bases.filter(Boolean)) try { return createRequire(path.join(p, 'x.js'))('playwright'); } catch {}
  throw Error('Playwright local necessário para esta regressão.');
}
const envelope = dados => ({ ok: true, dados });
(async () => {
  const browser = await playwright().chromium.launch({ headless: true });
  let checks = 0;
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url()), p = u.pathname;
        assert.equal(u.origin, 'http://127.0.0.1:4397');
        assert.equal(req.method(), 'GET', 'fixture proíbe mutações');
        if (!p.startsWith('/api/')) {
          const file = path.join(p.startsWith('/design-system/') ? ROOT : WEB, p === '/' ? 'index.html' : p);
          return fs.existsSync(file) && fs.statSync(file).isFile() ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
        }
        let dados = null;
        if (p === '/api/saude') dados = { painel: 'grana-admin' };
        else if (p === '/api/sessao') dados = { etapa: 'ok', restanteSeg: 3600, csrfToken: 'fixture-local' };
        else if (p.endsWith('/notificacoes')) dados = { status: 'indisponivel', naoLidas: null };
        else if (p === '/api/marketing/calendario') dados = { itens: [], aprovadosSemData: [], reais: { status: 'disponivel', completo: true, itens: [] } };
        else if (p.endsWith('/meta-publicados')) dados = { status: 'ok', completo: true, posts: [], redes: { instagram: { status: 'disponivel', completo: true }, facebook: { status: 'disponivel', completo: true } } };
        else if (p.endsWith('/capacidades')) dados = { contractVersion: 'e5.real.v1', modo: 'real', contas: [], controles: { revisao: 1, habilitado: false, pausaGlobal: false, pausaInstagram: false, pausaFacebook: false } };
        else if (p.endsWith('/catalogo')) dados = { pecas: [] };
        else if (p.endsWith('/feed')) dados = { pecas: [] };
        else if (p === '/api/marketing/publicacoes') dados = { contractVersion: 'e5.real.v1', modo: 'real', jobs: [], limitado: false, proximoCursor: null };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(dados)) });
      });
      await page.goto('http://127.0.0.1:4397/#/marketing/calendario?mes=2026-10&visao=lista');
      await page.getByRole('button', { name: 'Atualizar mês', exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
      for (const name of ['Atualizar mês', 'Atualizar estado real', 'Atualizar fila real']) {
        const button = page.getByRole('button', { name, exact: true });
        await button.evaluate(el => el.scrollIntoView({ block: 'center' }));
        const m = await button.evaluate(el => {
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          return { border: s.borderTopColor, size: parseFloat(s.borderTopWidth), h: r.height, primary: el.classList.contains('botao-primario'), font: s.fontFamily };
        });
        assert.ok(m.size >= 1 && m.border !== 'rgba(0, 0, 0, 0)' && m.border !== 'transparent', `${width}: ${name} tem limite visual no repouso (${m.border})`); checks++;
        assert.ok(m.h >= 44 && !m.primary && /Neue/i.test(m.font), `${width}: ${name} conserva alvo, hierarquia e fonte`); checks++;
        await button.focus();
        assert.ok(await button.evaluate(el => document.activeElement === el && getComputedStyle(el).outlineStyle !== 'none'), `${width}: ${name} tem foco visível`); checks++;
      }
      const disabled = page.getByRole('button', { name: 'Página anterior', exact: true });
      // Exercita a apresentação do atributo nativo, sem chamar operação de domínio.
      await disabled.evaluate(el => { el.disabled = true; });
      assert.ok(await disabled.isDisabled(), `${width}: paginação indisponível continua disabled`); checks++;
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent === 'Página anterior' && el.disabled && parseFloat(getComputedStyle(el).opacity) < 1));
      const alpha = await disabled.evaluate(el => parseFloat(getComputedStyle(el).opacity));
      assert.ok(alpha < 1, `${width}: disabled distinto de ação ativa`); checks++;
      assert.deepEqual(errors, []); await page.close();
    }
    console.log(`admin-acoes-operacionais-dom: ${checks} checks, repouso/foco/disabled390/1440 OK`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
