'use strict';
// Vários Stories de um conjunto de imagens (autor, 24/10/2026: "ao invés de marcar qual o story vai
// ser postado, eu gostaria que tivesse uma caixinha para marcar mais de um story").
// Tela e cliente REAIS (_publicacoes-reais-ui.js e _publicacoes-reais.js) no Chromium; o servidor é
// dublado na borda HTTP. Afirma QUAIS pedidos saíram: uma prévia e uma confirmação por imagem marcada,
// em ordem, 1 minuto entre uma e outra, cada uma com chave própria, e nada reagendado duas vezes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'tools/admin-local/web');
function playwright() {
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  for (const base of [ROOT, process.env.PLAYWRIGHT_DIR, ...(fs.existsSync(cache) ? fs.readdirSync(cache).map(d => path.join(cache, d, 'node_modules')) : [])].filter(Boolean)) {
    try { return createRequire(path.join(base, 'fixture.js'))('playwright'); } catch {}
  }
  throw new Error('Playwright local necessário; nenhum pacote é instalado por este teste.');
}
const id = () => crypto.randomUUID(), IG = id(), LOTE = id();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAYAAACEYr13AAAAMElEQVR4AaXBAQEAAAiDMKR/5xuC7QYjkEgiiSSSSCKJJJJIIokkkkgiiSSSSCKJHoQXAiYb/t5AAAAAAElFTkSuQmCC', 'base64');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const real = d => ({ contractVersion: 'e5.real.v1', modo: 'real', ...d });
const envelope = dados => ({ ok: true, dados });
const IMG = { tipo: 'imagem', mime: 'image/jpeg' };
const PECAS = [
  { id: 'a'.repeat(16), versao: 'b'.repeat(40), titulo: 'Capas dos destaques fixture', tipo: 'carrossel', midias: [IMG, IMG, IMG], aprovada: true, bloqueios: [] },
  { id: 'c'.repeat(16), versao: 'd'.repeat(40), titulo: 'Imagem única fixture', tipo: 'imagem', midias: [IMG], aprovada: true, bloqueios: [] },
];
const CONTAS = [{ contaId: IG, rede: 'instagram', rotulo: 'instagram', revisao: 1, conexao: 'verificada', pausada: false,
  capacidades: ['feed', 'carrossel', 'reels', 'stories'].map(formato => ({ formato, estado: 'disponivel', revisao: 1, motivos: [] })) }];
let failures = 0, checks = 0;
function ok(c, m) { checks++; if (!c) { failures++; console.error('FALHOU:', m); } else console.log('ok:', m); }

(async () => {
  const pedidos = [], previas = new Map(), jobs = [];
  let browser;
  try {
    browser = await playwright().chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('pageerror', e => { failures++; console.error(e.message); });
    await page.exposeFunction('fixture', async (rota, body) => {
      const u = new URL(rota, 'http://fixture.invalid');
      if (body) pedidos.push(structuredClone(body));
      if (body?.acao === 'prever') {
        const previaId = id();
        previas.set(previaId, body);
        return { status: 200, body: envelope(real({ previaId, previaHash: sha(previaId), revisao: 1,
          expiraEm: new Date(Date.now() + 600000).toISOString(), podeConfirmar: true, bloqueios: [],
          snapshot: { snapshotId: id(), estado: 'pronto', pecaId: body.pecaId, versao: body.versao,
            legenda: '', legendaSha256: sha(''), midias: [{ ordem: 0, tipo: 'imagem', mime: 'image/png', sha256: sha(PNG) }], capa: null },
          destinos: body.destinos.map(d => ({ ...d, publicarEm: body.agendarPara, fuso: body.fuso, estado: 'pronto', motivos: [] })) })) };
      }
      if (body?.acao === 'confirmar') {
        const p = previas.get(body.previaId);
        const job = { jobId: id(), loteId: LOTE, snapshotId: id(), estado: 'programado-no-painel', revisao: 1,
          destino: { contaId: IG, rede: 'instagram', formato: 'stories', publicarEm: p.agendarPara, fuso: 'America/Sao_Paulo' },
          atualizadoEm: new Date().toISOString(), recibos: [] };
        jobs.push(job);
        return { status: 200, body: envelope(real({ loteId: LOTE, idempotencia: body.idempotencia, replay: false, jobs: [job] })) };
      }
      if (body) return { status: 400, body: { ok: false, erro: { codigo: 'pedido-inesperado' } } };
      if (u.pathname.endsWith('/capacidades')) return { status: 200, body: envelope(real({ contas: CONTAS,
        controles: { habilitado: true, revisao: 1, pausaGlobal: false, pausaFacebook: false, pausaInstagram: false } })) };
      if (u.pathname.endsWith('/catalogo') || u.pathname.endsWith('/feed')) return { status: 200, body: envelope({ pecas: PECAS }) };
      return { status: 200, body: envelope(real({ jobs, proximoCursor: null, limitado: false })) };
    });
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.origin !== 'http://127.0.0.1:4399') return route.abort();
      if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<main id="raiz"></main>' });
      if (u.pathname.endsWith('/midia')) return route.fulfill({ contentType: 'image/png', body: PNG });
      const base = u.pathname.startsWith('/design-system/') ? ROOT : WEB;
      const abs = path.resolve(base, '.' + u.pathname);
      if (!abs.startsWith(base + path.sep)) return route.fulfill({ status: 403 });
      return fs.existsSync(abs) ? route.fulfill({ path: abs }) : route.fulfill({ status: 404 });
    });
    await page.goto('http://127.0.0.1:4399/');
    await page.evaluate(async () => {
      const { montarReal } = await import('/telas/_publicacoes-reais-ui.js');
      function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
          if (v == null || v === false) continue;
          if (k === 'texto') el.textContent = v;
          else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
          else el.setAttribute(k, v === true ? '' : String(v));
        }
        for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
        return el;
      }
      const request = async (rota, body) => {
        const r = await window.fixture(rota, body);
        if (r.status >= 400) throw Object.assign(new Error('Falha da fixture'), { status: r.status, codigo: r.body.erro?.codigo });
        return r.body;
      };
      window.limpar = await montarReal(document.querySelector('#raiz'), { h, params: {}, obsoleta: () => false,
        api: request, acao: request, cabecalho: (root, title, description, actions) => root.append(...actions),
        confirmar: async () => true, urlArquivo: x => x });
    });
    const esperar = () => page.evaluate(() => new Promise(r => setTimeout(r, 80)));
    const quadros = page.locator('input[name="quadroStory"]');

    await page.locator(`input[name="pecaAprovada"][value="${PECAS[0].id}"]`).check();
    await page.locator(`input[name="destino-${IG}"][value="stories"]`).check();
    ok(await quadros.count() === 3 && await quadros.first().getAttribute('type') === 'checkbox', 'conjunto de 3 imagens mostra 3 caixinhas');
    ok(await page.locator('input[name="quadroStory"]:checked').count() === 1, 'começa com a primeira imagem marcada, como antes');

    // Nenhuma marcada: a prévia fica travada, com o motivo escrito.
    await page.getByRole('button', { name: 'Desmarcar todas', exact: true }).click();
    ok(await page.getByRole('button', { name: 'Gerar prévia dos destinos', exact: true }).isDisabled(), 'sem imagem marcada, não gera prévia');
    ok((await page.locator('#pub-real-previa-motivo').textContent()).includes('Marque ao menos uma imagem'), 'diz por que está travado');

    await quadros.nth(0).check();
    await quadros.nth(2).check();
    await page.locator('input[name="agendarParaLocal"]').fill('2027-01-01T12:00');
    await page.getByRole('button', { name: 'Gerar prévia dos destinos', exact: true }).click();
    const agendar1 = page.getByRole('button', { name: 'Agendar Story 1 de 2', exact: true });
    await agendar1.waitFor();
    const prev1 = pedidos.filter(p => p.acao === 'prever');
    ok(prev1.length === 1 && prev1[0].quadro === 0 && prev1[0].agendarPara === '2027-01-01T15:00:00.000Z', 'Story 1: imagem 1 às 12h00');
    await agendar1.click();
    const agendar2 = page.getByRole('button', { name: 'Agendar Story 2 de 2', exact: true });
    await agendar2.waitFor();
    const prev2 = pedidos.filter(p => p.acao === 'prever');
    ok(prev2.length === 2 && prev2[1].quadro === 2 && prev2[1].agendarPara === '2027-01-01T15:01:00.000Z', 'Story 2: imagem 3 às 12h01, gerada sozinha depois do primeiro');
    ok(!(await quadros.nth(0).isChecked()) && await quadros.nth(2).isChecked(), 'a imagem já agendada sai da seleção');
    await agendar2.click(); await esperar();
    const conf = pedidos.filter(p => p.acao === 'confirmar');
    ok(conf.length === 2 && new Set(conf.map(c => c.idempotencia)).size === 2, 'duas confirmações, cada uma com chave própria');
    ok(pedidos.filter(p => p.acao === 'prever').length === 2, 'fila acaba: nenhuma prévia a mais');
    ok(jobs.length === 2 && jobs.map(j => j.destino.publicarEm).join() === '2027-01-01T15:00:00.000Z,2027-01-01T15:01:00.000Z', 'dois Stories na ordem do conjunto');
    ok((await page.locator('body').textContent()).includes('2 Stories agendados'), 'aviso final conta os Stories');
    ok(await page.locator('input[name="quadroStory"]:checked').count() === 0, 'nenhuma imagem continua marcada para reagendar sem querer');

    // Imagem única continua com o fluxo de sempre: sem caixinhas e botão "Agendar".
    await page.locator(`input[name="pecaAprovada"][value="${PECAS[1].id}"]`).check();
    await page.locator(`input[name="destino-${IG}"][value="stories"]`).check();
    ok(await quadros.count() === 0, 'peça de uma imagem não mostra caixinhas');
    await page.locator('input[name="agendarParaLocal"]').fill('2027-01-02T12:00');
    await page.getByRole('button', { name: 'Gerar prévia dos destinos', exact: true }).click();
    await page.getByRole('button', { name: 'Agendar', exact: true }).waitFor();
    ok(pedidos.filter(p => p.acao === 'prever').at(-1).quadro === undefined, 'imagem única não manda quadro');

    await page.evaluate(() => window.limpar());
    console.log(`admin-publicacoes-stories-varios: ${checks} checks, ${failures} falhas`);
    process.exitCode = failures ? 1 : 0;
  } finally { await browser?.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
