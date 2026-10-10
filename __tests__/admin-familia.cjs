'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { Readable } = require('node:stream');
const raiz = path.resolve(__dirname, '..');
function harness(dir, opts = {}) {
  const mods = new Map(), calls = [], pedidos = [], logs = [];
  const cfg = { RAIZ: dir, RAIZ_DADOS: dir, PORTA: 4317, SIMULAR: false, ocultar: (v) => v };
  function load(nome, base = 'marketing') {
    const chave = base + '/' + nome;
    if (mods.has(chave)) return mods.get(chave).exports;
    const m = { exports: {} }; mods.set(chave, m);
    const pasta = path.join(raiz, 'tools/admin-local', base === '.' ? '' : base);
    vm.runInNewContext(fs.readFileSync(path.join(pasta, nome), 'utf8'), {
      module: m, exports: m.exports, __dirname: pasta, Buffer, URL, Date, Map, Set, Intl, structuredClone,
      process: { pid: process.pid, env: Object.freeze({}) }, console: { error: (s) => logs.push(s) },
      require: (id) => {
        if (id === './ajustes-fila.cjs' || path.basename(id) === 'ajustes-fila.cjs') return { fila: { listar: () => { if (opts.filaFalha) throw new Error('fixture'); return pedidos; } } };
        if (id === './config.cjs') return cfg;
        if (id === './auditoria.cjs') return { registrar: (s) => calls.push('audit-' + s) };
        if (id === './autenticacao.cjs') return { situacaoConta: () => ({ estado: 'ok', geracao: opts.revogada ? 2 : 1 }) };
        if (id === './seguranca.cjs') return seg;
        if (id === 'node:child_process') return { execFileSync: opts.git || (() => { throw new Error('PROCESSO PROIBIDO'); }) };
        if (['fs', 'node:fs', 'path', 'node:path', 'crypto', 'node:crypto'].includes(id)) return require(id);
        if (id === 'os') return { homedir: () => '/fixture' };
        if (id.startsWith('./') && base === 'marketing') return load(id.slice(2));
        if (path.isAbsolute(id) && path.dirname(id) === path.join(raiz, 'tools/admin-local/marketing')) return load(path.basename(id));
        throw new Error('IMPORT EXTERNO PROIBIDO');
      },
    }, { filename: nome });
    return m.exports;
  }
  let seg;
  seg = load('seguranca.cjs', '.');
  const resolver = seg.resolverEstatico;
  // Guard effects are controlled; file resolution remains the real module.
  Object.assign(seg, {
    checarApi: () => opts.origem ? { status: 403, codigo: 'origem', mensagem: 'Fixture' } : null,
    dentroDoLimite: (s) => { calls.push(s); return !(opts.limite && s === 'marketing'); },
    sessaoDe: () => opts.semSessao ? null : { id: 'fixture', s: { etapa: opts.etapa || 'ok', geracao: 1 } },
    checarCabecalhos: (req, guard) => { calls.push('csrf'); assert.equal(guard.exigeCsrf, true); assert.equal(guard.exigeOrigem, true); return opts.csrf ? { status: 403, codigo: 'csrf', mensagem: 'Fixture' } : null; },
    encerrarSessao: () => calls.push('revogada'), cookieExpirado: () => 'fixture',
  });
  const catalogo = load('catalogo.cjs');
  return { catalogo, load, pedidos, calls, logs, resolver, async request(url, corpo = {}, method = 'POST') {
    const api = load('rotas.cjs', '.'); const req = Readable.from([Buffer.from(JSON.stringify(corpo))]);
    req.method = method; req.headers = { 'x-grana-admin': '1' };
    const res = { statusCode: 0, headers: {}, setHeader() {}, writeHead(n, h) { this.statusCode = n; this.headers = h; }, end(s) {
      this.body = s === undefined ? Buffer.alloc(0) : Buffer.from(s);
      if (this.headers['Content-Type']?.includes('application/json')) this.json = JSON.parse(this.body.toString());
    } };
    await api.tratarApi(req, res, new URL('http://127.0.0.1' + url)); return res;
  } };
}
async function fixture(fn, nomes = ['peca.png']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-fase2-'));
  const semana = 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11';
  const media = path.join(dir, semana, 'para-aprovacao/pecas'); fs.mkdirSync(media, { recursive: true });
  for (const nome of nomes) fs.writeFileSync(path.join(media, nome), 'fixture ' + nome);
  const indice = path.join(dir, semana, 'INDICE.md'); fs.writeFileSync(indice, '# Semana fixture\n');
  const painel = path.join(dir, 'docs/marketing/painel'); fs.mkdirSync(painel, { recursive: true });
  try { await fn({ dir, semana, media, indice, painel }); }
  finally { const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(dir)); assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel)); fs.rmSync(dir, { recursive: true, force: true }); }
}
module.exports = { harness, fixture };
if (require.main === module) (async () => {
  let n = 0;
  await fixture(async (f) => {
    const h = harness(f.dir), c = h.catalogo, base = f.semana + '/para-aprovacao/pecas/';
    assert.equal(c.familia(base + 'reel-v2-narrado-capa.png'), c.familia(base + 'reel.mp4')); n++;
    assert.notEqual(c.familia(base + 'reel.mp4'), c.familia(base.replace('semana-41', 'semana-42') + 'reel.mp4')); n++;
    assert.notEqual(c.familia(base + 'reel.mp4'), c.familia(base + 'outro/reel.mp4')); n++;
    assert.equal(c.familia('../reel.mp4'), null); n++;
    const antes = c.montarCatalogo(f.dir), lista = c.listarPecas(f.dir);
    assert.equal(lista.pecas.length, 5); assert.equal(lista.familias.length, 1); n++;
    const grupo = lista.familias[0]; assert.equal(grupo.principal.nome, 'reel-v2.mp4');
    assert.equal(grupo.alternativas.length, 2); assert.equal(grupo.capas.length, 2); n++;
    assert.deepEqual(antes.map((p) => [p.id, p.versao]), lista.pecas.map((p) => [p.id, p.versao])); n++;
    const capa = lista.pecas.find((p) => p.capaDe); assert.equal(capa.aprovada, false); assert.equal(capa.aceite, null); n++;
    assert.equal(lista.total, 5); assert.equal(c.listarPecas(f.dir, { tipo: 'video' }).total, 3); n++;
  }, ['reel.mp4', 'reel-capa.png', 'reel-narrado.mp4', 'reel-narrado-capa.png', 'reel-v2.mp4']);
  await fixture(async (f) => {
    const semana = 'docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27';
    for (const [nome, estado] of [['grana-r5-colar-pix-v6', 'para-aprovacao'], ['grana-motion-desistiu-foto-da-nota', 'aprovados']]) {
      for (const sufixo of ['', '-narrado']) for (const ext of ['.mp4', '-capa.png']) {
        const pasta = path.join(f.dir, semana, sufixo ? 'para-aprovacao' : estado, 'pecas/reels'); fs.mkdirSync(pasta, { recursive: true });
        fs.writeFileSync(path.join(pasta, nome + sufixo + ext), 'fixture');
      }
    }
    const lista = harness(f.dir).catalogo.listarPecas(f.dir, { semana: 39 });
    assert.equal(lista.total, 8); assert.equal(lista.familias.length, 2); n++;
    assert.ok(lista.familias.every((g) => g.alternativas.length === 1 && g.capas.length === 2)); n++;
  });
  console.log('admin-familia: ' + n + ' verificacoes; modulos reais, zero rede/env');
})().catch(() => { console.error('admin-familia FALHOU'); process.exitCode = 1; });
