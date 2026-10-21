'use strict';
// Tela/cliente, domínio, adaptador e contratoTS reais; transporte RPC dublado.
// HTTP autenticado apenas no loopback efêmero da fixture. Não lê .env nem usa4317.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'tools/admin-local/web');
const configId = require.resolve('../tools/admin-local/config.cjs');
require.cache[configId] = { id: configId, filename: configId, loaded: true, exports: {
  RAIZ: ROOT, RAIZ_DADOS: os.tmpdir(), SIMULAR: false, ler: () => null, tem: () => false,
  ocultar: String, registrarSegredo: () => {},
} };
const { criarPublicacoesReais } = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
const { criarPublicacoes } = require('../tools/admin-local/marketing/publicacoes.cjs');
const { criarEstado } = require('../tools/admin-local/marketing/publicacoes-reais-estado.cjs');
const { criarHttpPublicacoes } = require('./helpers/marketing-real-http.cjs');
function playwright() {
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  for (const base of [ROOT, process.env.PLAYWRIGHT_DIR, ...(fs.existsSync(cache) ? fs.readdirSync(cache).map(d => path.join(cache, d, 'node_modules')) : [])].filter(Boolean)) {
    try { return createRequire(path.join(base, 'fixture.js'))('playwright'); } catch {}
  }
  throw new Error('Playwright local necessário; nenhum pacote é instalado por este teste.');
}
const id = () => crypto.randomUUID(), ADMIN = id(), LOTE = id(), SNAP = id(), PREVIA = id();
const IG = id(), FB = id(), J1 = id(), J2 = id();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAYAAACEYr13AAAAMElEQVR4AaXBAQEAAAiDMKR/5xuC7QYjkEgiiSSSSCKJJJJIIokkkkgiiSSSSCKJHoQXAiYb/t5AAAAAAElFTkSuQmCC', 'base64');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const real = d => ({ contractVersion: 'e5.real.v1', modo: 'real', ...d });
const envelope = dados => ({ ok: true, dados });
const MIDIAS = [{ tipo: 'imagem', mime: 'image/jpeg' }];
const PECAS = [
  { id: 'a'.repeat(16), versao: 'b'.repeat(40), titulo: 'Imagem aprovada fixture', tipo: 'imagem', midias: MIDIAS, aprovada: true, bloqueios: [] },
  { id: 'c'.repeat(16), versao: 'd'.repeat(40), titulo: 'Vídeo aprovado fixture', tipo: 'video', midias: [{ tipo: 'video', mime: 'video/mp4' }], aprovada: true, bloqueios: [] },
];
const CONTAS = [[IG, 'instagram'], [FB, 'facebook']].map(([contaId, rede]) => ({ contaId, rede, rotulo: rede,
  revisao: 1, conexao: 'verificada', pausada: false,
  capacidades: ['feed', 'carrossel', 'reels', 'stories'].map(formato => ({ formato, estado: 'disponivel', revisao: 1, motivos: [] })),
}));
const job = (jobId, contaId, rede) => ({ jobId, loteId: LOTE, snapshotId: SNAP, estado: 'programado-no-painel', revisao: 1,
  destino: { contaId, rede, formato: 'feed', publicarEm: '2027-01-01T15:00:00.000Z', fuso: 'America/Sao_Paulo' },
  atualizadoEm: new Date().toISOString(), recibos: [] });
const JOBS = [job(J1, IG, 'instagram'), job(J2, FB, 'facebook')];
let failures = 0, checks = 0;
function ok(c, m) { checks++; if (!c) { failures++; console.error('FALHOU:', m); } else console.log('ok:', m); }

(async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-pendencia-'));
  const requests = [], rpcs = [], lots = new Map();
  let read = 0, http, browser;
  const cliente = { rpc(nome, args) { return { abortSignal: async () => {
    const n = nome.replace('admin_marketing_real_', ''); rpcs.push({ n, args });
    if (n === 'confirmar') { const replay = lots.has(args.p_idempotencia); lots.set(args.p_idempotencia, LOTE);
      return { data: { loteId: LOTE, replay }, error: null }; }
    if (n === 'comando') return { data: null, error: { message: 'fixture-resposta-perdida' } };
    if (n === 'consultar') {
      if (args.p_filtro.loteId) return { data: null, error: { message: 'fixture-consulta-pos-commit' } };
      if (args.p_filtro.idempotencia) {
        read++;
        if (read === 2) return { data: null, error: { message: 'lote-inexistente' } };
        return { data: real({ loteId: LOTE, jobs: read < 3 ? [] : JOBS }), error: null };
      }
      return { data: { jobs: JOBS, proximoCursor: null, limitado: false }, error: null };
    }
    throw new Error('RPC inesperada: ' + n);
  } }; } };
  try {
    const estado = criarEstado({ pasta });
    const remoto = criarPublicacoesReais({ env: n => n === 'ADMIN_MARKETING_USER_ID' ? ADMIN : undefined,
      remoto: () => null, cliente: () => cliente, relogio: () => new Date(), log: () => {}, rede: () => { throw new Error('Rede externa proibida'); }, estado });
    const api = criarPublicacoes({ remoto, estado });
    http = await criarHttpPublicacoes(api, pasta);
    browser = await playwright().chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('pageerror', e => { failures++; console.error(e.message); });
    await page.exposeFunction('fixture', async (rota, body) => {
      const u = new URL(rota, 'http://fixture.invalid');
      if (body) requests.push(structuredClone(body));
      if (body?.acao === 'prever') return { status: 200, body: envelope(real({ previaId: PREVIA, previaHash: 'f'.repeat(64), revisao: 1,
        expiraEm: new Date(Date.now() + 600000).toISOString(), podeConfirmar: true, bloqueios: [],
        snapshot: { snapshotId: SNAP, estado: 'pronto', pecaId: PECAS[0].id, versao: PECAS[0].versao,
          legenda: 'Legenda fixture', legendaSha256: sha('Legenda fixture'), midias: [{ ordem: 0, tipo: 'imagem', mime: 'image/png', sha256: sha(PNG) }], capa: null },
        destinos: body.destinos.map(d => ({ ...d, publicarEm: body.agendarPara, fuso: body.fuso, estado: 'pronto', motivos: [] })),
      })) };
      if (body || u.pathname.endsWith('/detalhe')) return http.pedir(rota, body);
      if (u.pathname.endsWith('/capacidades')) return { status: 200, body: envelope(real({ contas: CONTAS,
        controles: { habilitado: true, revisao: 1, pausaGlobal: false, pausaFacebook: false, pausaInstagram: false } })) };
      if (u.pathname.endsWith('/catalogo')) return { status: 200, body: envelope({ pecas: PECAS }) };
      if (u.pathname.endsWith('/feed')) return { status: 200, body: envelope({ pecas: PECAS }) };
      return { status: 200, body: envelope(real({ jobs: JOBS, proximoCursor: null, limitado: false })) };
    });
    // Somente os módulos reais e a mídia sintética são carregados pelo navegador.
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      assert.equal(u.origin, 'http://127.0.0.1:4399');
      if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<main id="raiz"></main>' });
      if (u.pathname.endsWith('/midia')) return route.fulfill({ contentType: 'image/png', body: PNG });
      const base = u.pathname.startsWith('/design-system/') ? ROOT : WEB;
      const abs = path.resolve(base, '.' + u.pathname);
      assert.ok(abs.startsWith(base + path.sep));
      return fs.existsSync(abs) ? route.fulfill({ path: abs }) : route.fulfill({ status: 404 });
    });
    async function mount() {
      read = 0;
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
    }
    const flush = () => page.evaluate(() => new Promise(r => setTimeout(r, 50)));
    await mount();
    // Seleção mantém somente os destinos compatíveis; nunca escolhe Reel pela pessoa.
    await page.locator(`input[name="destino-${IG}"][value="feed"]`).check();
    await page.locator(`input[name="destino-${FB}"][value="feed"]`).check();
    await page.locator(`input[name="pecaAprovada"][value="${PECAS[1].id}"]`).check();
    ok(await page.locator('input[type="checkbox"][value="feed"]:checked').count() === 0, 'troca imagem→MP4 remove Feed selecionado');
    ok(await page.locator('input[type="checkbox"][value="feed"]:disabled').count() === 2, 'MP4 bloqueia Feed nas duas redes');
    ok(await page.locator('input[type="checkbox"][value="reels"]:checked').count() === 0, 'troca não converte Feed em Reels automaticamente');
    await page.locator(`input[name="pecaAprovada"][value="${PECAS[0].id}"]`).check();
    await page.locator(`input[name="destino-${IG}"][value="feed"]`).check();
    await page.locator('input[name="agendarParaLocal"]').fill('2027-01-01T12:00');
    await page.getByRole('button', { name: 'Gerar prévia dos destinos', exact: true }).click();
    await page.getByRole('button', { name: 'Agendar', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Agendar', exact: true }).click(); await flush();
    ok(lots.size === 1 && rpcs.some(x => x.n === 'confirmar'), 'RPC real confirmou antes de a consulta posterior falhar503');
    const pending = page.getByRole('button', { name: 'Consultar resultado pendente', exact: true });
    ok(await pending.count() === 1, '503 depois da confirmação mantém consulta pendente visível');
    const k = requests.find(x => x.acao === 'confirmar').idempotencia;
    // Um clique antigo/programático também passa pela guarda central.
    const before = requests.length;
    await page.getByRole('button', { name: 'Cancelar destino', exact: true }).first().evaluate(el => el.click()); await flush();
    await page.getByRole('button', { name: 'Agendar', exact: true }).evaluate(el => el.click()); await flush();
    ok(requests.length === before, 'pendência de confirmação bloqueia outro comando e nova confirmação');
    if (await pending.count()) {
      await pending.click(); await flush();
      ok(await pending.count() === 1, 'consulta vazia preserva pendência');
      await pending.click(); await flush();
      ok(await pending.count() === 1, '404 na consulta preserva pendência');
      await page.getByRole('button', { name: 'Atualizar estado real', exact: true }).click(); await flush();
      ok(await pending.count() === 1, 'atualizar estado reconstrói alerta e mesma chave');
      await pending.click(); await flush();
      ok(await pending.count() === 0, 'recibo positivo resolve pendência');
      ok(rpcs.filter(x => x.n === 'consultar' && x.args.p_filtro.idempotencia).every(x => x.args.p_filtro.idempotencia === k), 'todos os GETs usam a chave original');
      ok(requests.filter(x => x.acao === 'confirmar').length === 1 && lots.size === 1, 'recuperação não reenviou confirmar nem criou lote extra');
      ok(await page.getByRole('button', { name: 'Agendar', exact: true }).count() === 0, 'consulta positiva encerra a prévia confirmada');
    }
    // Comando incerto não pode ser substituído por comando de outro job.
    await mount();
    await page.getByRole('button', { name: 'Cancelar destino', exact: true }).first().click(); await flush();
    const command = requests.at(-1), beforeSecond = requests.length;
    await page.getByRole('button', { name: 'Cancelar destino', exact: true }).last().evaluate(el => el.click()); await flush();
    ok(requests.length === beforeSecond, '503 no primeiro comando impede sobrescrita por outro job');
    if (await pending.count()) { await pending.click(); await flush(); }
    const query = rpcs.filter(x => x.n === 'consultar' && x.args.p_filtro.idempotencia).at(-1);
    ok(query?.args.p_filtro.idempotencia === command.idempotencia, 'consulta de comando preserva primeira chave');
    await page.evaluate(() => window.limpar());
    console.log(`admin-publicacoes-pendencia: ${checks} checks, ${failures} falhas; lotes=${lots.size}; Graph=0`);
    process.exitCode = failures ? 1 : 0;
  } finally {
    await browser?.close(); await http?.fechar();
    assert.equal(path.dirname(path.resolve(pasta)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(pasta).startsWith('grana-pendencia-'));
    fs.rmSync(pasta, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
