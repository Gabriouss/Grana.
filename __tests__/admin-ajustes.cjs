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
    : id === './ajustes-remoto.cjs' ? remotoMod : require(id),
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
    remoto: opts.remoto || null, remotoAusente: opts.remotoAusente || null,
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
    await h.fila.marcar(r.id, r.lease.id, 'aguardando-aprovacao-de-custo', { pecaId: h.peca.id, estimativa: { ferramenta: 'fixture', gerado: 'artefato ficticio', creditos: 2, valorReais: 3, cotacao: 5, motivoNaoLocal: 'motivo ficticio' } }); await h.fila.tick();
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
  // ---- ponte com a tabela remota (painel web) ----
  const RID = '33333333-3333-4333-8333-333333333333';
  const remotoNovo = (extra = {}) => ({ id: RID, peca_id: 'a'.repeat(16), caminho: 'docs/marketing/fixture/para-aprovacao/p', versao_alvo: 'a'.repeat(40), texto_original: ' TEXTO WEB PRIVADO ', criado_em: '2026-10-08T16:59:00Z', ...extra });
  function remotoFalso(opts = {}) {
    const chamadas = []; let lista = opts.lista ?? [remotoNovo()];
    return { chamadas, r: {
      novos: async () => { chamadas.push(['novos']); if (opts.falhaNovos) throw Object.assign(new Error('x'), { codigo: 'remoto-http' }); return lista; },
      marcarImportado: async (id) => { chamadas.push(['importado', id]); if (opts.falhaMarcar) throw Object.assign(new Error('x'), { codigo: 'remoto-sem-resposta' }); lista = lista.filter((n) => n.id !== id); },
      refletir: async (r) => { chamadas.push(['refletir', r.remotoId, r.estado]); },
    } };
  }
  await test('ponte: importa pedido web uma vez, marca DEPOIS de gravar, e entrega pelo mesmo caminho', async () => {
    const rf = remotoFalso(); const h = setup({ remoto: rf.r });
    await h.fila.tick();
    assert.equal(h.db.pedidos.length, 1); const p = h.db.pedidos[0];
    assert.equal(p.remotoId, RID); assert.equal(p.origem, 'painel-web'); assert.equal(p.textoOriginal, 'TEXTO WEB PRIVADO');
    assert.deepEqual(rf.chamadas.slice(0, 2), [['novos'], ['importado', RID]]);
    assert.equal(h.calls.filter((c) => c[0] === 'entregar').length, 1); assert.equal(p.estado, 'em-correcao');
    h.advance(30_001); await h.fila.tick();
    assert.ok(rf.chamadas.some((c) => c[0] === 'refletir' && c[2] === 'em-correcao')); assert.equal(h.db.pedidos[0].remotoEstado, 'em-correcao');
    assert.equal(JSON.stringify(h.calls).includes('TEXTO WEB'), false);
  });
  await test('ponte: queda entre gravar e marcar reimporta sem duplicar', async () => {
    const rf = remotoFalso({ falhaMarcar: true }); const h = setup({ remoto: rf.r });
    await h.fila.sincronizarRemoto(); h.advance(30_001); await h.fila.sincronizarRemoto();
    assert.equal(h.db.pedidos.length, 1); assert.equal(h.fila.remotoStatus().ultimoErro, 'remoto-sem-resposta');
    assert.deepEqual(h.calls.filter((c) => c[0] === 'log').map((c) => c[1]), ['ajuste-remoto-falhou', 'ajuste-remoto-falhou']);
  });
  await test('ponte: linha remota fora do formato nao entra; falha remota nao para a fila local', async () => {
    const rf = remotoFalso({ lista: [remotoNovo({ caminho: 7 }), remotoNovo({ id: 'x' }), remotoNovo({ texto_original: '' })] }); const h = setup({ remoto: rf.r });
    await h.fila.tick(); assert.equal(h.db.pedidos.length, 0);
    const caiu = remotoFalso({ falhaNovos: true }); const l = setup({ remoto: caiu.r });
    await l.fila.solicitar(l.peca, { versao: l.peca.versao, motivo: 'local' }); await l.fila.tick();
    assert.equal(l.calls.filter((c) => c[0] === 'entregar').length, 1); assert.equal(l.fila.remotoStatus().ultimoErro, 'remoto-http');
  });
  await test('ponte (achado Harbor): texto contado por caractere como a Edge; linha invalida tem recibo e sai de novo', async () => {
    const emoji = '😀'.repeat(1001);
    const rf = remotoFalso({ lista: [remotoNovo({ texto_original: emoji })] }); const h = setup({ remoto: rf.r });
    await h.fila.sincronizarRemoto(); assert.equal(h.db.pedidos.length, 1, '1001 emoji (2002 unidades UTF-16) importados');
    const local = setup(); await local.fila.solicitar(local.peca, { versao: local.peca.versao, motivo: '😀'.repeat(2000) });
    await assert.rejects(() => local.fila.solicitar(local.peca, { versao: local.peca.versao, motivo: '😀'.repeat(2001) }));
    const ruim = remotoFalso({ lista: [remotoNovo({ caminho: 7 })] }); const r = setup({ remoto: ruim.r });
    await r.fila.sincronizarRemoto();
    assert.equal(r.db.pedidos.length, 0); assert.deepEqual(ruim.chamadas.filter((c) => c[0] === 'refletir'), [['refletir', RID, 'precisa-de-atencao']]);
    assert.equal(r.fila.remotoStatus().ultimoErro, 'remoto-linha-invalida');
    assert.ok(r.calls.some((c) => c[0] === 'log' && c[1] === 'ajuste-remoto-linha-invalida'));
  });
  await test('ponte: sem chave a fila fica com status ausente e motivo, e nao tenta rede', async () => {
    const h = setup({ remotoAusente: 'SUPABASE_SERVICE_ROLE_KEY nao esta no .env' });
    await h.fila.tick(); assert.deepEqual({ ...h.fila.remotoStatus(), ultimaSync: null }, { status: 'ausente', motivo: 'SUPABASE_SERVICE_ROLE_KEY nao esta no .env', ultimaSync: null, ultimoErro: null });
    assert.match(remotoMod.remotoDoEnv({ tem: () => false, ler: () => undefined }).ausente, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(remotoMod.remotoDoEnv({ tem: () => true, ler: (k) => (k === 'EXPO_PUBLIC_SUPABASE_URL' ? 'https://evil.example.com' : 'k') }).ausente, /formato/);
  });
  await test('criarRemoto real: URLs, metodos e corpos certos; lease e aceite no formato das constraints; erro sem corpo', async () => {
    const req = []; const resp = (status, body) => ({ ok: status < 300, status, json: async () => body });
    let proximo = resp(200, [remotoNovo()]);
    const r = remotoMod.criarRemoto({ url: 'https://abc.supabase.co/', chave: 'CHAVE', agora: () => '2026-10-08T17:00:00.000Z',
      fetch: async (u, init) => { req.push({ u, m: init.method || 'GET', b: init.body ? JSON.parse(init.body) : null, h: init.headers }); const x = proximo; proximo = resp(204); return x; } });
    const lista = await r.novos();
    assert.equal(lista[0].id, RID); assert.match(req[0].u, /^https:\/\/abc\.supabase\.co\/rest\/v1\/admin_ajuste_pedidos\?select=id,peca_id,caminho,versao_alvo,texto_original,criado_em&estado=eq\.novo&importado_em=is\.null/);
    assert.equal(req[0].h.Authorization, 'Bearer CHAVE');
    await r.marcarImportado(RID);
    assert.deepEqual([req[1].m, req[1].u.split('/rest/v1')[1], req[1].b], ['PATCH', `/admin_ajuste_pedidos?id=eq.${RID}&importado_em=is.null`, { importado_em: '2026-10-08T17:00:00.000Z' }]);
    assert.deepEqual(req[2].b, { pedido_id: RID, estado: 'novo', codigo: 'importado-m1' });
    await r.refletir({ remotoId: RID, estado: 'em-correcao', tentativas: 1, lease: { id: 'L', agente: 'Beacon', inicio: 'I', expiraEm: 'E' } });
    assert.deepEqual([req[3].b.lease_id, req[3].b.lease_agente, req[3].b.lease_expira_em, req[3].b.aceite_em], ['L', 'Beacon', 'E', null]);
    await r.refletir({ remotoId: RID, estado: 'aceito', tentativas: 99, lease: null, versaoCorrigida: 'b'.repeat(40), commit: 'c'.repeat(40), aceite: { versao: 'b'.repeat(40), em: 'T' } });
    assert.deepEqual([req[5].b.lease_id, req[5].b.tentativas, req[5].b.aceite_versao, req[5].b.versao_corrigida], [null, 10, 'b'.repeat(40), 'b'.repeat(40)]);
    assert.ok(req.every((x) => !JSON.stringify(x.b || '').includes('TEXTO')), 'texto nunca vai em PATCH/evento');
    proximo = { ok: false, status: 400, json: async () => ({ message: 'TEXTO WEB PRIVADO' }) };
    await assert.rejects(() => r.novos(), (e) => e.codigo === 'remoto-http' && !String(e.message).includes('TEXTO'));
  });
  console.log(`admin-ajustes: ${count} grupos verdes; zero processo/rede/publicacao real`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
