'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../tools/admin-local/marketing');
const rede = [];
const mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  vm.runInNewContext(fs.readFileSync(path.join(root, nome), 'utf8'), {
    module: m, exports: m.exports, Buffer, Date, Intl, console, structuredClone, __dirname: root,
    process: { pid: process.pid, env: new Proxy({}, { get() { throw new Error('ENV PROIBIDO'); } }) },
    fetch() { rede.push('fetch'); throw new Error('META PROIBIDA'); },
    require: (id) => {
      if (id === './ajustes-fila.cjs') return { fila: { listar: () => [] } };
      if (id.startsWith('./')) return load(id.slice(2));
      if (['fs', 'path', 'crypto', 'node:fs', 'node:path', 'node:crypto'].includes(id)) return require(id);
      throw new Error('IMPORT PROIBIDO ' + id);
    },
  }, { filename: nome });
  return m.exports;
}
const c = load('catalogo.cjs'), ap = load('aprovacoes.cjs'), promo = load('promocao.cjs');
const ensaio = load('meta-ensaio.cjs'), cal = load('calendario.cjs');
let grupos = 0;
async function fixture(fn, nomes = ['E01.jpg']) {
  const tmpRoot = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'grana-promocao-'));
  const semana = 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11';
  const media = path.join(dir, semana, 'para-aprovacao/pecas'); fs.mkdirSync(media, { recursive: true });
  for (const nome of nomes) fs.writeFileSync(path.join(media, nome), 'fixture ' + nome);
  const indice = path.join(dir, semana, 'INDICE.md'); fs.writeFileSync(indice, '# Semana\n\n[Peça](para-aprovacao/pecas/' + nomes[0] + ')\n');
  const pastaPainel = path.join(dir, 'docs/marketing/painel'); fs.mkdirSync(pastaPainel, { recursive: true });
  fs.writeFileSync(path.join(pastaPainel, 'calendario.json'), JSON.stringify({ diaD: '2099-01-01', planejados: [] }));
  const p = c.montarCatalogo(dir).find((p) => p.tipo === (nomes.length > 1 ? 'carrossel' : 'imagem'));
  assert(p);
  const h = { dir, semana, media, indice, p, apPath: path.join(pastaPainel, 'aprovacoes.json'),
    aprovar: () => ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: 'APROVAR' }),
    promover: (f = promo.promover) => f(dir, p.id, { versao: p.versao, confirmacao: promo.FRASE }),
    destino: (nome = nomes[0]) => path.join(dir, semana, 'aprovados/pecas', nome),
    lerAceites: () => JSON.parse(fs.readFileSync(path.join(pastaPainel, 'aprovacoes.json'), 'utf8')),
  };
  try { await fn(h); }
  finally {
    assert.equal(path.dirname(path.resolve(dir)), tmpRoot); assert(path.basename(dir).startsWith('grana-promocao-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function test(nome, fn, nomes) { await fixture(fn, nomes); grupos++; console.log('OK ' + nome); }
(async () => {
  await test('fluxo real aprovar->promover->planejar->ensaiar sem aceite fabricado', async (h) => {
    const aprovado = await h.aprovar(); const original = JSON.stringify(aprovado.aprovacao);
    const r = await h.promover(); assert.notEqual(r.promocao.id, h.p.id); assert.equal(r.promocao.versao, h.p.versao);
    assert.equal(JSON.stringify(h.lerAceites().aprovacoes[0]), original);
    assert.equal(r.promocao.origem.id, h.p.id); assert.equal(r.promocao.origem.caminho, h.p.caminho);
    assert.equal(r.promocao.aprovadoEm, aprovado.aprovacao.aprovadoEm); assert(r.promocao.promovidoEm);
    assert(fs.existsSync(h.destino())); assert(!fs.existsSync(path.join(h.media, 'E01.jpg')));
    const nova = c.obterPeca(h.dir, r.promocao.id); assert.equal(nova.estado, 'aprovados'); assert.equal(nova.aprovada, true);
    await cal.planejar(h.dir, { id: nova.id, versao: nova.versao, data: '2099-01-02', hora: '10:00', canal: 'instagram-feed' });
    const out = ensaio.ensaiar(h.dir); assert.equal(out.itens[0].estado, 'ensaio'); assert.equal(out.itens[0].pecaId, nova.id);
    assert.equal(out.itens[0].evidenciaEm, aprovado.aprovacao.aprovadoEm); assert.equal(out.realHabilitado, false); assert.equal(out.chamadasMeta, 0);
    assert(fs.readFileSync(h.indice, 'utf8').includes('](aprovados/pecas/E01.jpg)')); assert.deepEqual(rede, []);
  });
  await test('promove todo carrossel com mesmo SHA e links do indice', async (h) => {
    await h.aprovar(); const r = await h.promover(); assert.equal(r.promocao.arquivosPromovidos.length, 2);
    assert(fs.existsSync(h.destino('E01-01.jpg'))); assert(fs.existsSync(h.destino('E01-02.jpg')));
    assert.equal(c.obterPeca(h.dir, r.promocao.id).versao, h.p.versao);
  }, ['E01-01.jpg', 'E01-02.jpg']);
  await test('sem frase ou sem aceite nao copia nem cria prova', async (h) => {
    await assert.rejects(promo.promover(h.dir, h.p.id, { versao: h.p.versao, confirmacao: 'sim' }), (e) => e.codigo === 'confirmacao-invalida');
    await assert.rejects(h.promover(), (e) => e.codigo === 'sem-aceite'); assert(!fs.existsSync(h.destino()));
  });
  await test('parecer livre nao e evidencia: lista fechada na promocao e no ensaio', async (h) => {
    await h.aprovar(); const dados = h.lerAceites(); dados.aprovacoes[0].evidencia = 'parecer aprovado do Keel';
    fs.writeFileSync(h.apPath, JSON.stringify(dados)); await assert.rejects(h.promover(), (e) => e.codigo === 'sem-aceite');
    assert(!fs.existsSync(h.destino()));
  });
  await test('SHA mudou apos aceite recusa sem mover', async (h) => {
    await h.aprovar(); fs.writeFileSync(path.join(h.media, 'E01.jpg'), 'conteudo alterado maior');
    await assert.rejects(h.promover(), (e) => e.codigo === 'versao-mudou'); assert(!fs.existsSync(h.destino()));
  });
  await test('destino existente nunca e sobrescrito', async (h) => {
    await h.aprovar(); fs.mkdirSync(path.dirname(h.destino()), { recursive: true }); fs.writeFileSync(h.destino(), 'outro conteudo');
    await assert.rejects(h.promover(), (e) => e.codigo === 'destino-existente'); assert.equal(fs.readFileSync(h.destino(), 'utf8'), 'outro conteudo');
    assert(fs.existsSync(path.join(h.media, 'E01.jpg'))); assert.equal(h.lerAceites().aprovacoes.length, 1);
  });
  await test('segunda copia falha: originais preservados e destino parcial removido', async (h) => {
    await h.aprovar(); let n = 0; const logs = [];
    const fn = promo.criarPromocao({ ...fs, copyFileSync(...args) { if (++n === 2) throw new Error('SEGREDO'); return fs.copyFileSync(...args); } }, (s) => logs.push(s));
    await assert.rejects(h.promover(fn), (e) => e.codigo === 'promocao-falhou' && !e.message.includes('SEGREDO'));
    assert(fs.existsSync(path.join(h.media, 'E01-01.jpg'))); assert(fs.existsSync(path.join(h.media, 'E01-02.jpg')));
    assert(!fs.existsSync(h.destino('E01-01.jpg'))); assert.equal(h.lerAceites().aprovacoes.length, 1); assert(logs.includes('promocao-falhou'));
  }, ['E01-01.jpg', 'E01-02.jpg']);
  await test('falha de persistencia nunca remove a origem', async (h) => {
    await h.aprovar(); const save = c.gravarJsonAtomico; c.gravarJsonAtomico = () => { throw new Error('DISCO'); };
    try { await assert.rejects(h.promover(promo.criarPromocao(fs, () => {})), (e) => e.codigo === 'promocao-falhou'); }
    finally { c.gravarJsonAtomico = save; }
    assert(fs.existsSync(path.join(h.media, 'E01.jpg'))); assert(!fs.existsSync(h.destino())); assert.equal(h.lerAceites().aprovacoes.length, 1);
  });
  await test('prova persistida antes da limpeza; falha de limpeza retoma sem copiar/aprovar de novo', async (h) => {
    await h.aprovar(); let copiar = 0, falhar = true; const logs = [], seq = [], save = c.gravarJsonAtomico;
    c.gravarJsonAtomico = (...args) => { seq.push('persistir'); return save(...args); };
    const fn = promo.criarPromocao({ ...fs, copyFileSync(...a) { copiar++; return fs.copyFileSync(...a); }, unlinkSync(abs) {
      seq.push('limpar'); assert(seq.includes('persistir')); if (falhar) throw new Error('DISCO'); return fs.unlinkSync(abs);
    } }, (s) => logs.push(s));
    try {
      const r = await h.promover(fn); assert(r.avisos.some((a) => a.includes('origem a conferir')));
      assert(fs.existsSync(path.join(h.media, 'E01.jpg'))); assert.equal(h.lerAceites().aprovacoes.length, 2);
      falhar = false; const again = await h.promover(fn); assert.equal(again.jaExistia, true); assert.equal(copiar, 1);
      assert(!fs.existsSync(path.join(h.media, 'E01.jpg'))); assert.equal(h.lerAceites().aprovacoes.length, 2); assert(logs.includes('promocao-limpeza-pendente'));
    } finally { c.gravarJsonAtomico = save; }
  });
  await test('indice falha: prova permanece e aviso explicito; nenhum aceite reenviado', async (h) => {
    await h.aprovar(); const logs = [];
    const r = await h.promover(promo.criarPromocao({ ...fs, readFileSync(abs, ...a) { if (abs === h.indice) throw new Error('DISCO'); return fs.readFileSync(abs, ...a); } }, (s) => logs.push(s)));
    assert(r.avisos.some((v) => v.includes('índice'))); assert.equal(h.lerAceites().aprovacoes.length, 2); assert(logs.includes('promocao-indice-pendente'));
    const again = await h.promover(); assert.equal(again.jaExistia, true); assert(again.promocao.indice);
    const texto = fs.readFileSync(h.indice, 'utf8'); assert.equal((texto.match(/<!-- promocao:/g) || []).length, 1);
  });
  await test('releitura da prova falha apos gravacao: preserva origem e retomada nao duplica', async (h) => {
    await h.aprovar(); const read = c.lerJson; let lido = 0;
    c.lerJson = (...a) => { if (a[0] === h.apPath && ++lido === 2) throw new Error('DISCO'); return read(...a); };
    try { await assert.rejects(h.promover(promo.criarPromocao(fs, () => {})), (e) => e.codigo === 'promocao-falhou'); }
    finally { c.lerJson = read; }
    assert(fs.existsSync(path.join(h.media, 'E01.jpg'))); assert(fs.existsSync(h.destino())); assert.equal(h.lerAceites().aprovacoes.length, 2);
    const r = await h.promover(); assert.equal(r.jaExistia, true); assert(!fs.existsSync(path.join(h.media, 'E01.jpg'))); assert.equal(h.lerAceites().aprovacoes.length, 2);
  });
  await test('origem alterada apos prova nunca e apagada pela retomada', async (h) => {
    await h.aprovar(); await h.promover(promo.criarPromocao({ ...fs, unlinkSync() { throw new Error('DISCO'); } }, () => {}));
    const src = path.join(h.media, 'E01.jpg'); fs.writeFileSync(src, 'nova revisao de outro processo');
    const r = await h.promover(promo.criarPromocao(fs, () => {})); assert(r.avisos.some((a) => a.includes('origem a conferir')));
    assert.equal(fs.readFileSync(src, 'utf8'), 'nova revisao de outro processo');
  });
  await test('clique duplo serializa e preserva um registro de promocao', async (h) => {
    await h.aprovar(); const rs = await Promise.all([h.promover(), h.promover()]); assert.equal(rs.filter((r) => !r.jaExistia).length, 1);
    assert.equal(h.lerAceites().aprovacoes.length, 2); assert.equal(rs[0].promocao.id, rs[1].promocao.id);
  });
  await test('promover nao inventa nem altera datas ou dia D', async (h) => {
    await h.aprovar(); const arq = path.join(h.dir, 'docs/marketing/painel/calendario.json'), antes = fs.readFileSync(arq, 'utf8');
    await h.promover(); assert.equal(fs.readFileSync(arq, 'utf8'), antes); assert.deepEqual(rede, []);
  });
  await test('colisao de agrupamento no destino recusa e remove so copia propria', async (h) => {
    await h.aprovar(); fs.mkdirSync(path.dirname(h.destino()), { recursive: true }); const outro = h.destino('E01-03.jpg'); fs.writeFileSync(outro, 'arte terceira');
    await assert.rejects(h.promover(promo.criarPromocao(fs, () => {})), (e) => e.codigo === 'destino-divergente');
    assert.equal(fs.readFileSync(outro, 'utf8'), 'arte terceira'); assert(!fs.existsSync(h.destino('E01-01.jpg'))); assert(fs.existsSync(path.join(h.media, 'E01-01.jpg')));
  }, ['E01-01.jpg', 'E01-02.jpg']);
  await test('rota real exige login completo e CSRF antes de chamar promocao', async (h) => {
    const { EventEmitter } = require('node:events'); let etapa = 'ok', csrf = false, chamados = 0;
    const m = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, '../rotas.cjs'), 'utf8'), { module: m, exports: m.exports, __dirname: path.resolve(root, '..'), Buffer, Date, console,
      require: (id) => {
        if (id === 'path') return path;
        if (id === './config.cjs') return { RAIZ_DADOS: h.dir, SIMULAR: false, ocultar: (s) => s };
        if (id === './seguranca.cjs') return { checarApi: () => null, dentroDoLimite: () => true, sessaoDe: () => ({ id: 'fixture', s: { etapa, geracao: 'g' } }),
          checarCabecalhos: () => csrf ? null : { status: 403, codigo: 'csrf', mensagem: 'CSRF inválido.' } };
        if (id === './autenticacao.cjs') return { situacaoConta: () => ({ estado: 'ok', geracao: 'g' }) };
        if (id === './auditoria.cjs') return { registrar() {} };
        if (id === path.resolve(root, 'promocao.cjs')) return { promover(...args) { chamados++; return promo.promover(...args); } };
        throw new Error('IMPORT PROIBIDO ' + id);
      },
    });
    async function post(body) {
      const req = new EventEmitter(); req.method = 'POST'; req.headers = { 'x-grana-admin': '1' }; let status, saida;
      const res = { writeHead(s) { status = s; }, end(s) { saida = JSON.parse(s); } };
      const promise = m.exports.tratarApi(req, res, new URL('http://127.0.0.1:4317/api/marketing/pecas/' + h.p.id + '/promover'));
      // tratarApi consulta as guardas antes de entrar na leitura assíncrona do corpo.
      req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); await promise; return { status, saida };
    }
    await h.aprovar(); const body = { versao: h.p.versao, confirmacao: promo.FRASE };
    assert.equal((await post(body)).status, 403); assert.equal(chamados, 0); assert(!fs.existsSync(h.destino()));
    csrf = true; etapa = 'totp'; assert.equal((await post(body)).status, 401); assert.equal(chamados, 0);
    etapa = 'ok'; assert.equal((await post({ ...body, confirmacao: 'sim' })).status, 400); assert.equal(chamados, 1); assert(!fs.existsSync(h.destino()));
    assert.equal((await post(body)).status, 200); assert.equal(chamados, 2); assert(fs.existsSync(h.destino())); assert.deepEqual(rede, []);
  });
  assert.deepEqual(rede, []); console.log(`admin-meta-promocao: ${grupos} grupos passaram (modulos reais, nenhuma Meta)`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
