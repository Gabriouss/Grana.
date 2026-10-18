'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { createRequire } = require('node:module');
const base = path.resolve(__dirname, '../tools/admin-local/marketing');
const legenda = require(path.join(base, 'legenda-publicacao.cjs'));
const rejeita = e => e.codigo === 'legenda-obrigatoria' && e.message === 'Falta a legenda para publicar' && e.status === 409;
function modulos() {
  const mods = new Map();
  function load(nome) {
    if (mods.has(nome)) return mods.get(nome).exports;
    const m = { exports: {} }; mods.set(nome, m);
    vm.runInNewContext(fs.readFileSync(path.join(base, nome), 'utf8'), { module: m, exports: m.exports, Buffer, Date, Intl, console,
      structuredClone, process: { pid: process.pid, env: {} }, require: id => id === './ajustes-fila.cjs' ? { fila: { listar: () => [] } }
        : id.startsWith('./') ? load(id.slice(2)) : require(id) }, { filename: nome });
    return m.exports;
  }
  return load;
}
function filaFixture() {
  let peca = { id: 'a'.repeat(16), versao: 'b'.repeat(40), caminho: 'fixture', estado: 'para-aprovacao', legenda: 'Legenda válida' };
  const db = { pedidos: [], eventos: [] }, calls = [];
  let depoisCommit = () => {};
  const m = { exports: {} }, localRequire = createRequire(path.join(base, 'ajustes-fila.cjs'));
  vm.runInNewContext(fs.readFileSync(path.join(base, 'ajustes-fila.cjs'), 'utf8'), { module: m, exports: m.exports,
    process: { env: {} }, Date, structuredClone, console, require: id => id === '../config.cjs' ? { tem: () => false, ler: () => null }
      : id === './ajustes-remoto.cjs' ? { remotoDoEnv: () => ({ remoto: null }) } : localRequire(id) });
  const deps = { obterPeca: () => ({ ...peca }), agora: () => '2026-10-18T12:00:00Z', id: () => 'fixture',
    ler: () => structuredClone(db), transacao: fn => Promise.resolve().then(() => { const copia = structuredClone(db), r = fn(copia); Object.assign(db, copia); calls.push('gravar'); return r; }),
    verificarCommit: async () => { calls.push('commit'); depoisCommit(); }, log: () => {} };
  return { fila: m.exports.criarFila(deps), db, calls, get p() { return peca; }, set p(p) { peca = p; }, depois: fn => { depoisCommit = fn; } };
}
(async () => {
  for (const valor of [undefined, null, '', '  ', '\n\t', '\u00a0']) {
    assert.throws(() => legenda.exigirLegenda({ legenda: valor }), rejeita);
    assert.equal(legenda.bloqueiosAprovacao({ legenda: valor }).length, 1);
  }
  assert.doesNotThrow(() => legenda.exigirLegenda({ legenda: ' Texto para publicar. ' }));
  const load = modulos(), cat = load('catalogo.cjs'), ap = load('aprovacoes.cjs'), promo = load('promocao.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-legenda-'));
  const semana = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07', pecas = path.join(dir, semana, 'para-aprovacao/pecas');
  try {
    fs.mkdirSync(pecas, { recursive: true }); fs.mkdirSync(path.join(dir, 'docs/marketing/painel'), { recursive: true });
    fs.writeFileSync(path.join(dir, semana, 'INDICE.md'), '# Semana\n');
    fs.writeFileSync(path.join(pecas, 'E01.jpg'), 'fixture');
    let p = cat.montarCatalogo(dir).find(p => p.tipo === 'imagem');
    const indiceAntes = fs.readFileSync(path.join(dir, semana, 'INDICE.md'), 'utf8');
    await assert.rejects(ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: true }), rejeita);
    await assert.rejects(promo.promover(dir, p.id, { versao: p.versao, confirmacao: true }), rejeita);
    assert.equal(fs.readFileSync(path.join(dir, semana, 'INDICE.md'), 'utf8'), indiceAntes);
    assert.equal(fs.existsSync(path.join(dir, 'docs/marketing/painel/aprovacoes.json')), false);
    assert.equal(fs.existsSync(path.join(dir, 'docs/marketing/painel/calendario.json')), false);
    assert.equal(fs.existsSync(path.join(dir, semana, 'aprovados')), false);
    for (const nome of ['R01-video.mp4', 'R01-video-capa.png', 'C01-01.jpg', 'C01-02.jpg', 'E02.md']) fs.writeFileSync(path.join(pecas, nome), 'fixture ' + nome);
    const semLegenda = cat.montarCatalogo(dir);
    const compostoSemLegenda = semLegenda.find(p => p.tipo === 'video');
    assert.ok(compostoSemLegenda.composicao, 'premissa: vídeo e capa selados na versão composta');
    for (const tipo of ['video', 'carrossel']) {
      const alvo = semLegenda.find(p => p.tipo === tipo); assert.ok(alvo, tipo);
      await assert.rejects(ap.aprovar(dir, alvo.id, { versao: alvo.versao, confirmacao: true }), rejeita);
    }
    // 18/10: documento de copy (texto) não exige legenda; só arte (imagem/vídeo).
    assert.deepEqual(semLegenda.find(p => p.tipo === 'texto').bloqueiosAprovacao || [], []);
    assert.equal(fs.existsSync(path.join(dir, 'docs/marketing/painel/aprovacoes.json')), false);
    // Registro histórico sem legenda fica intacto, mas não autoriza repetir aceite/operação.
    const arquivo = path.join(dir, 'docs/marketing/painel/aprovacoes.json');
    const registro = JSON.stringify({ aprovacoes: [{ id: p.id, versao: p.versao, evidencia: 'aceite pelo autor no painel local', aprovadoEm: '2026-10-18T10:00:00-03:00' }] });
    fs.writeFileSync(arquivo, registro);
    await assert.rejects(ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: true }), rejeita);
    assert.equal(fs.readFileSync(arquivo, 'utf8'), registro);
    assert.equal(cat.listarPecas(dir).pecas.find(a => a.id === p.id).bloqueiosAprovacao[0].codigo, 'legenda-obrigatoria');
    fs.writeFileSync(path.join(pecas, 'COPYS-FINAIS.md'), '## E01 · Post\n\n**Legenda:** Legenda de publicação.\n\n## R01 · Reel\n\n**Legenda:** Legenda do vídeo.\n');
    p = cat.montarCatalogo(dir).find(p => p.tipo === 'imagem');
    const aceito = await ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: true });
    assert.equal(aceito.aprovacao.versao, p.versao);
    assert.ok(fs.readFileSync(path.join(dir, semana, 'INDICE.md'), 'utf8').includes('Aceites registrados'));
    assert.equal(cat.listarPecas(dir).pecas.find(a => a.id === p.id).bloqueiosAprovacao.length, 0);
    const compostoValido = cat.montarCatalogo(dir).find(p => p.tipo === 'video');
    assert.notEqual(compostoValido.versao, compostoSemLegenda.versao);
    const compostoAceito = await ap.aprovar(dir, compostoValido.id, { versao: compostoValido.versao, confirmacao: true });
    assert.deepEqual(compostoAceito.aprovacao.composicao, compostoValido.composicao);
    // Módulo real: a guarda também antecede o retorno de promoção retomada.
    const antigoCatalogo = cat.montarCatalogo, antigoObter = cat.obterPeca;
    const destino = { ...p, id: 'c'.repeat(16), estado: 'aprovados', legenda: null, arquivos: [], versao: 'd'.repeat(40) };
    const retomada = { id: destino.id, versao: destino.versao, origem: { id: p.id }, evidencia: 'aceite pelo autor no painel local', aprovadoEm: '2026-10-18T10:00:00-03:00' };
    fs.writeFileSync(arquivo, JSON.stringify({ aprovacoes: [retomada] }));
    cat.montarCatalogo = () => [destino]; cat.obterPeca = () => destino;
    try { await assert.rejects(promo.promover(dir, p.id, { versao: destino.versao, confirmacao: true }), rejeita); }
    finally { cat.montarCatalogo = antigoCatalogo; cat.obterPeca = antigoObter; }
  } finally {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('grana-legenda-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const h = filaFixture();
  const pedido = await h.fila.solicitar(h.p, { versao: h.p.versao, motivo: 'Escrever a legenda' }); const ativo = await h.fila.claim();
  h.p.legenda = ' '; let antes = JSON.stringify(h.db), chamadas = h.calls.length;
  const cli = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(base, 'ajustes-cli.cjs'), 'utf8'), { module: cli, exports: cli.exports,
    require: id => { assert.equal(id, './ajustes-fila.cjs'); return { fila: h.fila }; } });
  await assert.rejects(cli.exports.main(['concluir', pedido.id, ativo.lease.id, h.p.id, h.p.versao, 'c'.repeat(40)]), rejeita);
  assert.equal(JSON.stringify(h.db), antes); assert.equal(h.calls.length, chamadas);
  await assert.rejects(h.fila.marcar(pedido.id, ativo.lease.id, 'corrigido-aguardando-aceite', { pecaId: h.p.id, versao: h.p.versao, commit: 'c'.repeat(40) }), rejeita);
  assert.equal(JSON.stringify(h.db), antes); assert.equal(h.calls.length, chamadas);
  h.p.legenda = 'Texto'; h.depois(() => { h.p.legenda = ''; });
  await assert.rejects(h.fila.marcar(pedido.id, ativo.lease.id, 'corrigido-aguardando-aceite', { pecaId: h.p.id, versao: h.p.versao, commit: 'c'.repeat(40) }), rejeita);
  assert.equal(JSON.stringify(h.db), antes); assert.equal(h.calls.at(-1), 'commit');
  h.p.legenda = 'Texto'; h.depois(() => {});
  await h.fila.marcar(pedido.id, ativo.lease.id, 'corrigido-aguardando-aceite', { pecaId: h.p.id, versao: h.p.versao, commit: 'c'.repeat(40) });
  h.p.legenda = ''; antes = JSON.stringify(h.db);
  assert.throws(() => h.fila.conferirAceite(h.p, pedido.id), rejeita);
  await assert.rejects(h.fila.aceitar(h.p, pedido.id), rejeita); assert.equal(JSON.stringify(h.db), antes);
  h.p.legenda = 'Texto'; h.fila.conferirAceite(h.p, pedido.id); await h.fila.aceitar(h.p, pedido.id);
  assert.equal(h.db.pedidos[0].estado, 'aceito');
  console.log('admin-legenda-aprovacao: módulos reais, whitespace, envio/aceite/promoção/retomada, corrida e zero efeito em recusa OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
