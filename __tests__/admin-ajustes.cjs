'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const m = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../tools/admin-local/marketing/ajustes-fila.cjs'), 'utf8'), {
  module: m, exports: m.exports, process, Date, structuredClone, setTimeout, setInterval, clearInterval,
  require: (id) => id === '../config.cjs' ? { RAIZ: '/fixture', RAIZ_DADOS: '/fixture' } : id === 'child_process' ? { execFile() { throw new Error('REAL PROCESS FORBIDDEN'); } } : require(id),
});
function setup(opts = {}) {
  let now = Date.parse('2026-10-08T17:00:00Z'), n = 0;
  const db = { formato: 1, pedidos: [], eventos: [] }; const calls = [];
  const peca = { id: 'a'.repeat(16), caminho: 'docs/marketing/fixture/para-aprovacao/p', versao: 'a'.repeat(40), estado: 'para-aprovacao' };
  let serial = Promise.resolve();
  const deps = {
    agora: () => new Date(now).toISOString(), id: () => 'fixture-' + (++n), ler: () => structuredClone(db),
    transacao: (fn) => { const result = serial.then(() => { const snapshot = structuredClone(db); const r = fn(snapshot); Object.assign(db, snapshot); return structuredClone(r); }); serial = result.catch(() => {}); return result; },
    obterPeca: () => ({ ...peca }), verificarCommit: async (...args) => { calls.push(['commit', ...args]); if (opts.commitFalha) throw new Error('commit desconhecido'); },
    entregar: async (r) => { calls.push(['entregar', r.id, r.lease.id]); if (opts.entregaFalha) throw new Error('offline'); },
    log: (s) => calls.push(['log', s]),
  };
  return { fila: m.exports.criarFila(deps), db, peca, calls, deps, advance: (ms) => { now += ms; } };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('OK ' + name); }
(async () => {
  await test('pedido original imutavel; reabertura e nova rodada', async () => {
    const h = setup(); const r = await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'Texto privado do autor' });
    const next = await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'Novo pedido' });
    assert.equal(next.pai, r.id); assert.equal(h.db.pedidos[0].textoOriginal, 'Texto privado do autor');
    assert.equal(h.db.pedidos[0].estado, 'novo'); assert.equal(h.calls.length, 0);
  });
  await test('SHA errado/historico/corpo invalido sem gravacao', async () => {
    const h = setup(); await assert.rejects(() => h.fila.solicitar(h.peca, { versao: 'b'.repeat(40), motivo: 'ajuste' }));
    await assert.rejects(() => h.fila.solicitar({ ...h.peca, estado: 'historico' }, { versao: h.peca.versao, motivo: 'ajuste' }));
    await assert.rejects(() => h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: '' })); assert.equal(h.db.pedidos.length, 0);
  });
  await test('claim atomico e lease em disco impedem dupla entrega', async () => {
    const h = setup(); await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' });
    await Promise.all([h.fila.tick(), h.fila.tick()]); assert.equal(h.calls.filter((c) => c[0] === 'entregar').length, 1);
    const another = m.exports.criarFila(h.deps); await another.tick(); assert.equal(h.calls.filter((c) => c[0] === 'entregar').length, 1);
    assert.equal(h.db.pedidos[0].estado, 'em-correcao'); assert.equal(h.db.pedidos[0].tentativas, 1);
  });
  await test('restart recupera lease expirado; resultado velho nao sobrescreve', async () => {
    const h = setup(); await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' }); const old = await h.fila.claim();
    h.advance(45 * 60_000 + 1); const next = await h.fila.claim(); assert.notEqual(next.lease.id, old.lease.id);
    await assert.rejects(() => h.fila.marcar(old.id, old.lease.id, 'desatualizado', { pecaId: h.peca.id })); assert.equal(h.db.pedidos[0].lease.id, next.lease.id);
  });
  await test('entrega falha recibo sem motivo/log privado; retry limitado', async () => {
    const h = setup({ entregaFalha: true }); const r = await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'TEXTO PRIVADO' });
    for (let i = 0; i < 3; i++) { if (i) await h.fila.retry(r.id); await h.fila.tick(); }
    assert.equal(h.db.pedidos[0].estado, 'falha-de-envio'); await assert.rejects(() => h.fila.retry(r.id));
    assert.equal(JSON.stringify(h.calls).includes('TEXTO PRIVADO'), false);
  });
  await test('versao mudou antes envio: desatualizado e zero entrega', async () => {
    const h = setup(); await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' }); h.peca.versao = 'b'.repeat(40);
    await h.fila.tick(); assert.equal(h.db.pedidos[0].estado, 'desatualizado'); assert(!h.calls.some((c) => c[0] === 'entregar'));
  });
  await test('correcao nao e aceite; commit publicado e SHA novo obrigatorios', async () => {
    const h = setup(); await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' }); const r = await h.fila.claim(); h.peca.versao = 'b'.repeat(40);
    await h.fila.marcar(r.id, r.lease.id, 'corrigido-aguardando-aceite', { pecaId: h.peca.id, versao: h.peca.versao, commit: 'c'.repeat(40) });
    assert.equal(h.db.pedidos[0].aceite, null); assert.equal(h.db.pedidos[0].estado, 'corrigido-aguardando-aceite'); assert.equal(h.calls[0][0], 'commit');
    await assert.rejects(() => h.fila.aceitar({ ...h.peca, versao: 'd'.repeat(40) }, r.id)); await h.fila.aceitar(h.peca, r.id);
    assert.equal(h.db.pedidos[0].aceite.versao, h.peca.versao); assert.equal(h.db.pedidos[0].estado, 'aceito');
  });
  await test('custo pago pausa: nao corrige nem aceita automaticamente', async () => {
    const h = setup(); await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' }); const r = await h.fila.claim();
    await h.fila.marcar(r.id, r.lease.id, 'aguardando-aprovacao-de-custo', { pecaId: h.peca.id }); await h.fila.tick();
    assert.equal(h.db.pedidos[0].estado, 'aguardando-aprovacao-de-custo'); assert.equal(h.db.pedidos[0].aceite, null); assert.equal(h.calls.length, 0);
  });
  await test('lease longo e renovavel; trabalho em andamento nao e reentregue', async () => {
    const h = setup(); await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' }); await h.fila.tick();
    const r = h.db.pedidos[0]; assert.ok(r.lease.inicio);
    h.advance(30 * 60_000); await h.fila.tick(); assert.equal(h.calls.filter((c) => c[0] === 'entregar').length, 1);
    await h.fila.renovar(r.id, r.lease.id); h.advance(30 * 60_000); await h.fila.tick();
    assert.equal(h.calls.filter((c) => c[0] === 'entregar').length, 1); assert.equal(h.db.pedidos[0].estado, 'em-correcao');
    h.advance(46 * 60_000); await assert.rejects(() => h.fila.renovar(r.id, r.lease.id), /lease/);
  });
  await test('ler devolve so o proprio pedido e exige lease valido', async () => {
    const h = setup(); await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'TEXTO A' });
    await h.fila.solicitar({ ...h.peca, id: 'b'.repeat(16) }, { versao: h.peca.versao, motivo: 'TEXTO B' }); const r = await h.fila.claim();
    const lido = h.fila.lerPedido(r.id, r.lease.id); assert.equal(lido.textoOriginal, 'TEXTO A'); assert.equal(JSON.stringify(lido).includes('TEXTO B'), false);
    assert.throws(() => h.fila.lerPedido(r.id, 'lease-falso'), /lease/);
  });
  await test('aceite conferido antes de gravar aprovacao', async () => {
    const h = setup(); const r = await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' });
    assert.throws(() => h.fila.conferirAceite(h.peca, r.id), /versao corrigida/); assert.equal(h.db.pedidos[0].aceite, null);
  });
  await test('entrega incerta tem recibo proprio', async () => {
    const h = setup(); h.deps.entregar = async () => { throw Object.assign(new Error('x'), { codigo: 'entrega-incerta' }); };
    const fila = m.exports.criarFila(h.deps); await fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' }); await fila.tick();
    assert.equal(h.db.pedidos[0].estado, 'falha-de-envio'); assert.equal(h.db.eventos.at(-1).codigo, 'entrega-incerta');
    assert.deepEqual(h.calls.filter((c) => c[0] === 'log'), [['log', 'ajuste-entrega-incerta']]);
  });
  await test('fila em disco: lock orfao de processo morto e liberado; lock vivo nao', async () => {
    const os = require('node:os'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-ajustes-'));
    const antes = process.env.GRANA_ADMIN_PASTA_CONTA; process.env.GRANA_ADMIN_PASTA_CONTA = dir;
    try {
      const repo = m.exports.repositorioPrivado(); const lock = repo.arquivo + '.lock';
      fs.writeFileSync(lock, '999999'); await repo.transacao((db) => { db.pedidos.push({ id: 'x' }); });
      assert.equal(fs.existsSync(lock), false); assert.equal(repo.ler().pedidos.length, 1);
      fs.writeFileSync(lock, String(process.pid)); await assert.rejects(() => repo.transacao(() => {}), /ocupada/); assert.equal(fs.existsSync(lock), true);
    } finally { if (antes === undefined) delete process.env.GRANA_ADMIN_PASTA_CONTA; else process.env.GRANA_ADMIN_PASTA_CONTA = antes; fs.rmSync(dir, { recursive: true, force: true }); }
  });
  console.log(`admin-ajustes: ${count} grupos verdes; zero processo/rede/publicacao real`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
