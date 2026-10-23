'use strict';
// Real browser and UI/client modules; API boundary is fictitious. No server4317,
// product files, cookies, account data, Graph, or external network are consumed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'tools/admin-local/web');
function playwright() {
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  for (const base of [ROOT, process.env.PLAYWRIGHT_DIR,
    ...(fs.existsSync(cache) ? fs.readdirSync(cache).map(d => path.join(cache, d, 'node_modules')) : [])].filter(Boolean)) {
    try { return createRequire(path.join(base, 'fixture.js'))('playwright'); } catch {}
  }
  throw new Error('Set PLAYWRIGHT_DIR to an external Playwright installation');
}
const origin = 'http://127.0.0.1:4398';
const account = randomUUID(), lot = randomUUID(), snapshot = randomUUID(), jobId = randomUUID();
const job = { jobId, loteId: lot, snapshotId: snapshot, revisao: 1, estado: 'programado-no-painel',
  destino: { contaId: account, rede: 'instagram', formato: 'feed', publicarEm: '2027-01-01T15:00:00.000Z', fuso: 'America/Sao_Paulo' },
  atualizadoEm: new Date().toISOString(), recibos: [] };
const contas = [{ contaId: account, rede: 'instagram', rotulo: 'IG fictício', revisao: 1, conexao: 'verificada', pausada: false,
  capacidades: [{ formato: 'feed', estado: 'disponivel', revisao: 1, motivos: [] }] }];
const real = data => ({ ok: true, dados: { contractVersion: 'e5.real.v1', modo: 'real', ...data } });
let checks = 0;
const eq = (a, b, why) => { assert.deepEqual(a, b, why); checks++; };
(async () => {
  const browser = await playwright().chromium.launch({ headless: true });
  const context = await browser.newContext();
  const mutations = [], queries = [], pageErrors = [];
  let offline = false, resolved = false;
  try {
    await context.exposeFunction('fixture', async (route, body) => {
      const u = new URL(route, origin);
      if (body) {
        mutations.push(body);
        return { status: 503, body: { erro: { codigo: 'fixture-resposta-perdida' } } };
      }
      if (u.pathname.endsWith('/detalhe')) {
        queries.push(u.searchParams.get('idempotencia'));
        if (offline) return { status: 503, body: { erro: { codigo: 'fixture-offline' } } };
        return { status: 200, body: real({ loteId: lot, jobs: resolved ? [{ ...job, estado: 'cancelado', revisao: 2 }] : [] }) };
      }
      if (u.pathname.endsWith('/capacidades')) return { status: 200, body: real({ contas,
        controles: { habilitado: true, revisao: 1, pausaGlobal: false, pausaFacebook: false, pausaInstagram: false } }) };
      if (u.pathname.endsWith('/catalogo') || u.pathname.endsWith('/feed')) return { status: 200, body: { ok: true, dados: { pecas: [] } } };
      return { status: 200, body: real({ jobs: [job], proximoCursor: null, limitado: false,
        incidentes: [], naoReconhecidos: 0, incidentesDisponiveis: true }) };
    });
    await context.route('**/*', async route => {
      const u = new URL(route.request().url());
      assert.equal(u.origin, origin, 'all browser traffic stays in the routed fixture origin');
      if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<main id="root"></main>' });
      const base = u.pathname.startsWith('/design-system/') ? ROOT : WEB;
      const absolute = path.resolve(base, '.' + u.pathname);
      assert(absolute.startsWith(base + path.sep));
      return fs.existsSync(absolute) ? route.fulfill({ path: absolute }) : route.fulfill({ status: 404 });
    });
    async function mount(page) {
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(origin); await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        const { montarReal } = await import('/telas/_publicacoes-reais-ui.js');
        const h = (tag, attrs, ...children) => {
          const node = document.createElement(tag);
          for (const [key, value] of Object.entries(attrs || {})) {
            if (value == null || value === false) continue;
            if (key === 'texto') node.textContent = value;
            else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
            else node.setAttribute(key, value === true ? '' : String(value));
          }
          for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child);
          return node;
        };
        const request = async (route, body) => {
          const response = await window.fixture(route, body);
          if (response.status >= 400) throw Object.assign(new Error('Falha fictícia de transporte'), {
            status: response.status, codigo: response.body.erro?.codigo });
          return response.body;
        };
        window.cleanup = await montarReal(document.querySelector('#root'), { h, params: {}, obsoleta: () => false,
          api: request, acao: request, cabecalho: (root, title, description, actions) => root.append(...actions),
          confirmar: async () => true, urlArquivo: value => value });
      });
    }
    const a = await context.newPage(), b = await context.newPage();
    await mount(a); await mount(b);
    const pending = page => page.getByRole('button', { name: 'Consultar resultado pendente', exact: true });
    await a.getByRole('button', { name: 'Cancelar destino', exact: true }).click();
    await pending(a).waitFor(); await pending(b).waitFor();
    eq(mutations.length, 1, 'first tab sends one intent before its response is lost');
    const key = mutations[0].idempotencia;
    assert.match(key, /^[0-9a-f-]{36}$/); checks++;
    // A stale control cannot overwrite the intent already persisted by another tab.
    await b.getByRole('button', { name: 'Cancelar destino', exact: true }).evaluate(node => node.click());
    eq(mutations.length, 1, 'second tab observes the storage event and sends no replacement mutation');
    await b.evaluate(() => window.cleanup()); await mount(b);
    await pending(b).waitFor();
    eq(await b.evaluate(() => JSON.parse(localStorage.getItem('grana-admin-publicacao-pendente-v1')).idempotencia), key,
      'reload retains the original intent key');
    offline = true;
    await pending(b).click();
    await b.waitForFunction(() => document.querySelector('button') &&
      [...document.querySelectorAll('button')].some(node => node.textContent === 'Consultar resultado pendente' && !node.disabled));
    eq(await pending(b).count(), 1, 'offline query preserves visible pending receipt');
    eq(mutations.length, 1, 'offline does not reissue mutation');
    offline = false; resolved = true;
    await pending(b).click();
    await pending(b).waitFor({ state: 'detached' });
    await pending(a).waitFor({ state: 'detached' });
    eq(queries.every(query => query === key), true, 'both offline and recovery reads use the original key');
    eq(await a.evaluate(() => localStorage.getItem('grana-admin-publicacao-pendente-v1')), null,
      'positive receipt clears shared storage in both tabs');
    eq(mutations.length, 1, 'cross-tab recovery performs zero additional mutations');
    eq(pageErrors, [], 'no uncaught browser error');
    console.log(`admin-publicacoes-duas-abas: ${checks} assertions; real Chromium, storage event, reload, offline and receipt; external HTTP=0`);
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
