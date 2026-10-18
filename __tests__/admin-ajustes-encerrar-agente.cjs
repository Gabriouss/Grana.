'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const m = { exports: {} };
const remotoMod = require('../tools/admin-local/marketing/ajustes-remoto.cjs');
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../tools/admin-local/marketing/ajustes-fila.cjs'), 'utf8'), {
  module: m, exports: m.exports, process, Date, structuredClone, setTimeout, setInterval, clearInterval,
  require: (id) => id === '../config.cjs' ? { RAIZ: '/fixture', RAIZ_DADOS: '/fixture', tem: () => false, ler: () => undefined }
    : id === 'child_process' ? { execFile() { throw new Error('REAL PROCESS FORBIDDEN'); } }
    : id === './ajustes-remoto.cjs' ? remotoMod : id === './legenda-publicacao.cjs' ? require('../tools/admin-local/marketing/legenda-publicacao.cjs') : require(id),
});
function setup(opts = {}) {
  let now = Date.parse('2026-10-08T17:00:00Z'), n = 0;
  const db = { formato: 1, pedidos: [], eventos: [] }; const calls = [];
  const peca = { id: 'a'.repeat(16), legenda: 'Legenda de publicacao da fixture.', caminho: 'docs/marketing/fixture/para-aprovacao/p', versao: 'a'.repeat(40), estado: 'para-aprovacao' };
  let serial = Promise.resolve();
  const deps = {
    agora: () => new Date(now).toISOString(), id: () => 'fixture-' + (++n), ler: () => structuredClone(db),
    transacao: (fn) => { const result = serial.then(() => { const snapshot = structuredClone(db); const r = fn(snapshot); Object.assign(db, snapshot); return structuredClone(r); }); serial = result.catch(() => {}); return result; },
    obterPeca: () => ({ ...peca }), verificarCommit: async (...args) => { calls.push(['commit', ...args]); if (opts.commitFalha) throw new Error('commit desconhecido'); },
    entregar: async (r) => { calls.push(['entregar', r.id, r.lease.id]); if (opts.entregaFalha) throw new Error('offline'); },
    log: (s) => calls.push(['log', s]),
    remoto: opts.remoto || null, remotoAusente: opts.remotoAusente || null,
  };
  return { fila: m.exports.criarFila(deps), db, peca, calls, deps, advance: (ms) => { now += ms; } };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('OK ' + name); }
(async () => {
  const pedidoEm = async (h, estado) => {
    const r = await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'Texto privado do autor' });
    h.db.pedidos[0].estado = estado; return r.id;
  };
  await test('desatualizado encerra com recibo, sem apagar o pedido nem o texto original', async () => {
    const h = setup(); const id = await pedidoEm(h, 'desatualizado'); const antes = structuredClone(h.db.pedidos[0]);
    const r = await h.fila.encerrarPeloAgente(id, { motivo: 'superado', evidencia: 'refeito pelo autor' });
    assert.equal(r.estado, 'encerrado'); assert.equal(h.db.pedidos.length, 1);
    assert.equal(h.db.pedidos[0].textoOriginal, antes.textoOriginal); assert.equal(h.db.pedidos[0].criadoEm, antes.criadoEm);
    assert.deepEqual(Object.keys(h.db.pedidos[0].encerramento).sort(), ['em', 'estadoAnterior', 'evidencia', 'motivo', 'por', 'versaoAlvo', 'versaoAtualDaPeca']);
    assert.equal(h.db.pedidos[0].encerramento.estadoAnterior, 'desatualizado'); assert.equal(h.db.pedidos[0].encerramento.versaoAtualDaPeca, h.peca.versao);
    assert.equal(h.db.eventos.at(-1).codigo, 'encerrado-por-agente-superado'); assert.equal(h.db.pedidos[0].lease, null);
    assert.equal(h.calls.filter((c) => c[0] === 'entregar').length, 0, 'encerrar nunca entrega nada');
  });
  await test('atendido e novo sem lease tambem encerram; segundo encerramento e recusado', async () => {
    const h = setup(); const id = await pedidoEm(h, 'novo');
    assert.equal((await h.fila.encerrarPeloAgente(id, { motivo: 'atendido', evidencia: 'v8 entregue' })).encerramento.motivo, 'atendido');
    await assert.rejects(() => h.fila.encerrarPeloAgente(id, { motivo: 'atendido', evidencia: 'de novo' }), (e) => e.codigo === 'estado-invalido');
  });
  await test('recusa estados que nao sao seus e entradas invalidas, sem gravar', async () => {
    for (const estado of ['em-correcao', 'corrigido-aguardando-aceite', 'aceito', 'precisa-de-atencao', 'aguardando-aprovacao-de-custo']) {
      const h = setup(); const id = await pedidoEm(h, estado); const antes = JSON.stringify(h.db);
      await assert.rejects(() => h.fila.encerrarPeloAgente(id, { motivo: 'superado', evidencia: 'x' }), (e) => e.codigo === 'estado-invalido', estado);
      assert.equal(JSON.stringify(h.db), antes, estado + ' nao grava');
    }
    const h = setup(); const id = await pedidoEm(h, 'desatualizado'); const antes = JSON.stringify(h.db);
    for (const corpo of [{ motivo: 'outro', evidencia: 'x' }, { motivo: 'superado', evidencia: '' }, { motivo: 'superado', evidencia: '   ' }, { motivo: 'superado', evidencia: 'x'.repeat(301) }, {}]) {
      await assert.rejects(() => h.fila.encerrarPeloAgente(id, corpo)); }
    await assert.rejects(() => h.fila.encerrarPeloAgente('inexistente', { motivo: 'superado', evidencia: 'x' }), (e) => e.codigo === 'pedido-inexistente');
    assert.equal(JSON.stringify(h.db), antes);
    const comLease = setup(); const id2 = await pedidoEm(comLease, 'novo'); comLease.db.pedidos[0].lease = { id: 'l', expiraEm: 'x' };
    await assert.rejects(() => comLease.fila.encerrarPeloAgente(id2, { motivo: 'superado', evidencia: 'x' }), (e) => e.codigo === 'estado-invalido', 'novo com lease nao encerra');
  });
  await test('peca que sumiu do catalogo (historico) nao impede o encerramento; recibo com versao nula', async () => {
    const h = setup(); const id = await pedidoEm(h, 'desatualizado');
    h.deps.obterPeca = () => { throw Object.assign(new Error('x'), { codigo: 'peca-inexistente' }); };
    const r = await m.exports.criarFila(h.deps).encerrarPeloAgente(id, { motivo: 'superado', evidencia: 'peca em historico' });
    assert.equal(r.encerramento.versaoAtualDaPeca, null);
    const h2 = setup(); const id2 = await pedidoEm(h2, 'desatualizado'); h2.deps.obterPeca = () => { throw new Error('outro erro'); };
    await assert.rejects(() => m.exports.criarFila(h2.deps).encerrarPeloAgente(id2, { motivo: 'superado', evidencia: 'x' }), /outro erro/);
  });
  await test('CLI: sintaxe fechada e sem lease', async () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, '../tools/admin-local/marketing/ajustes-cli.cjs'), 'utf8');
    assert.ok(/acao === 'encerrar'/.test(fonte) && /--motivo/.test(fonte) && /--evidencia/.test(fonte));
  });
  console.log('admin-ajustes-encerrar-agente: ' + count + ' grupos (modulo real, fila em memoria)');
})().catch((e) => { console.error(e); process.exitCode = 1; });
