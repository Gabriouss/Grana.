'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { harness, fixture } = require('./admin-familia.cjs');
const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
const commit = 'd'.repeat(40), id = '12345678-1234-4234-8234-123456789abc';
let n = 0;
async function caso(fn, nomes = ['peca.png'], guards = {}, copy = false) {
  await fixture(async (f) => {
    if (copy) fs.writeFileSync(path.join(f.media, 'COPYS-FINAIS.md'), '## C01 Fixture\n\n**Legenda:** legenda sintetica anterior\n');
    const original = new Map([...nomes, ...(copy ? ['COPYS-FINAIS.md'] : [])].map((nome) => [f.semana + '/para-aprovacao/pecas/' + nome, fs.readFileSync(path.join(f.media, nome))]));
    const calls = [], modes = new Map(), sizes = new Map(); let falha = false;
    const h = harness(f.dir, { ...guards, git(cmd, args, opts) {
      calls.push(args); assert.equal(cmd, 'git'); assert.equal(opts.cwd, f.dir); assert.equal(opts.shell, false); assert.equal(opts.windowsHide, true); assert.ok(opts.timeout <= 20000);
      if (falha) throw new Error('fixture');
      if (args[0] === 'ls-tree') {
        assert.deepEqual(Array.from(args), ['ls-tree', '-r', '-l', '-z', commit + '^', '--', f.semana]);
        return Buffer.from([...original].map(([rel, b]) => `${modes.get(rel) || '100644'} blob ${sha(b)} ${sizes.get(rel) || b.length}\t${rel}\0`).join(''));
      }
      assert.equal(args[0], 'show'); assert.equal(args.length, 2); assert.ok(args[1].startsWith(commit + '^:'));
      const b = original.get(args[1].slice(42)); assert.ok(b, 'show limitado ao snapshot fixture'); return b;
    } });
    const antes = h.catalogo.montarCatalogo(f.dir).find((p) => p.tipo !== 'texto');
    for (const nome of nomes) fs.writeFileSync(path.join(f.media, nome), 'fixture corrigida diferente ' + nome);
    if (copy) fs.writeFileSync(path.join(f.media, 'COPYS-FINAIS.md'), '## C01 Fixture\n\n**Legenda:** legenda sintetica corrigida maior\n');
    const p = h.catalogo.montarCatalogo(f.dir).find((p) => p.caminho === antes.caminho);
    const pedido = { id, pecaId: p.id, caminho: p.caminho, estado: 'corrigido-aguardando-aceite', commit, versaoAlvo: antes.versao, versaoCorrigida: p.versao, textoOriginal: 'CANARIO-PRIVADO', lease: { id: 'CANARIO-LEASE' } };
    h.pedidos.push(pedido);
    await fn({ ...f, h, p, pedido, original, calls, modes, sizes, falhar: () => { falha = true; }, url: '/api/marketing/ajustes/' + id + '/anterior' });
  }, nomes);
}
(async () => {
  await caso(async ({ h, original, url, calls }) => {
    const r = await h.request(url, {}, 'GET'); assert.equal(r.statusCode, 200); assert.deepEqual(r.body, [...original.values()][0]);
    assert.equal(r.headers['Content-Type'], 'image/png'); assert.equal(r.headers['X-Content-Type-Options'], 'nosniff'); assert.match(r.headers['Cache-Control'], /no-store/);
    assert.ok(calls.some((a) => a[0] === 'show')); assert.ok(!r.body.includes('CANARIO'));
    const head = await h.request(url, {}, 'HEAD'); assert.equal(head.statusCode, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['Content-Length'], r.body.length); n++;
  });
  await caso(async ({ h, original, url }) => {
    const r = await h.request(url + '?arquivo=card-2.png', {}, 'GET'); assert.equal(r.statusCode, 200); assert.deepEqual(r.body, [...original.values()][1]); n++;
  }, ['card-1.png', 'card-2.png']);
  await caso(async ({ h, original, url, calls }) => {
    const r = await h.request(url, {}, 'GET'); assert.equal(r.statusCode, 200); assert.deepEqual(r.body, [...original.values()][0]);
    assert.ok(calls.some((a) => a[0] === 'show' && a[1].endsWith('/COPYS-FINAIS.md'))); n++;
  }, ['C01-card.png'], {}, true);
  for (const alterar of [(p) => { p.versaoAlvo = 'a'.repeat(40); }, (p) => { p.commit = '../invalido'; }, (p) => { p.estado = 'em-correcao'; }, (p) => { p.versaoCorrigida = 'a'.repeat(40); }]) {
    await caso(async ({ h, pedido, url }) => { alterar(pedido); const r = await h.request(url, {}, 'GET'); assert.equal(r.statusCode, 409); assert.ok(!r.body.includes('CANARIO')); n++; });
  }
  await caso(async ({ h, url, calls }) => { const r = await h.request(url + '?arquivo=../peca.png', {}, 'GET'); assert.equal(r.statusCode, 400); assert.equal(calls.length, 0); n++; });
  await caso(async ({ h, url, modes, original }) => { modes.set([...original.keys()][0], '120000'); assert.equal((await h.request(url, {}, 'GET')).statusCode, 409); n++; });
  await caso(async ({ h, url, sizes, original, calls }) => { sizes.set([...original.keys()][0], 64 * 1024 * 1024 + 1); assert.equal((await h.request(url, {}, 'GET')).statusCode, 413); assert.equal(calls.filter((a) => a[0] === 'show').length, 0); n++; });
  await caso(async ({ h, url, falhar }) => { falhar(); assert.equal((await h.request(url, {}, 'GET')).statusCode, 409); n++; });
  for (const guard of [{ semSessao: true }, { etapa: 'mfa' }, { origem: true }, { revogada: true }]) {
    await caso(async ({ h, url, calls }) => { assert.ok((await h.request(url, {}, 'GET')).statusCode >= 400); assert.equal(calls.length, 0); n++; }, ['peca.png'], guard);
  }
  await caso(async ({ h, p, pedido, media, dir, calls }) => {
    const fora = path.join(dir, 'isolado'); fs.mkdirSync(fora); fs.writeFileSync(path.join(fora, 'peca.png'), 'fixture');
    fs.renameSync(media, media + '-guardado'); fs.symlinkSync(fora, media, 'junction');
    assert.throws(() => h.catalogo.lerAnterior(dir, pedido, p, { resolver: h.resolver }), (e) => e.status === 403 || e.status === 400); assert.equal(calls.length, 0); n++;
  });
  console.log('admin-anterior: ' + n + ' grupos; modulo real/HTTP, Git em fixture, zero rede/env');
})().catch((e) => { console.error('admin-anterior FALHOU:', e.stack); process.exitCode = 1; });
