'use strict';
// Agendamento real no Node: captura, publicacoes.cjs, backend e o módulo REMOTO real
// (admin-publicacoes-reais.ts). Só a fronteira remota é dublada: RPC/tabela/Storage do
// Supabase em memória e a rede do PUT assinado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { criarPublicacoesReais } = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
const { criarPublicacoes } = require('../tools/admin-local/marketing/publicacoes.cjs');
const { criarEstado } = require('../tools/admin-local/marketing/publicacoes-reais-estado.cjs');
const { criarCapturador } = require('../tools/admin-local/marketing/snapshot-local.cjs');
const sha = (alg, v) => crypto.createHash(alg).update(v).digest('hex');

const ADMIN = '22222222-2222-4222-8222-222222222222';
const CONTA = '33333333-3333-4333-8333-333333333333';
const PREVIA = '44444444-4444-4444-8444-444444444444';
const LOTE = '55555555-5555-4555-8555-555555555555';
const CHAVE_1 = '66666666-6666-4666-8666-666666666666';
const CHAVE_2 = '77777777-7777-4777-8777-777777777777';
const SNAP = '88888888-8888-4888-8888-888888888888';
const HASH_PREVIA = 'c'.repeat(64);

// ---------- dublê do Supabase (só a fronteira) ----------
function criarRemoto() {
  const log = [], snapshots = new Map(), objetos = new Map(), lotes = new Map();
  let falharConfirmar = null, travarConfirmar = false;
  const resposta = (data, error = null) => ({ data, error });
  const rpcs = {
    snapshot_iniciar: a => {
      assert.equal(a.p_admin, ADMIN);
      const d = a.p_pedido;
      const row = { id: SNAP, admin_id: ADMIN, identidade: 'f'.repeat(64), estado: 'recebendo', revisao: 1,
        dados: { ...d, midias: d.midias.map((m, i) => ({ ...m, objeto: `snap/${SNAP}/${i}` })),
          capa: d.capa ? { ...d.capa, objeto: `snap/${SNAP}/capa` } : null } };
      snapshots.set(SNAP, row); return resposta(row);
    },
    snapshot_finalizar: a => {
      const r = snapshots.get(a.p_snapshot);
      assert.equal(r.revisao, a.p_revisao);
      Object.assign(r, { estado: 'pronto', revisao: r.revisao + 1 }); return resposta(r);
    },
    previa: a => resposta({ id: PREVIA, hash: HASH_PREVIA, expira_em: '2027-01-01T15:00:00.000Z', destinos: a.p_pedido.destinos }),
    consultar: a => a.p_filtro.acao === 'contas'
      ? resposta({ controles: { habilitado: true, recuperacaoPendente: false, pausaGlobal: false, pausaFacebook: false,
        pausaInstagram: false, margemValidaAte: '2099-01-01T00:00:00Z' }, contas: [{ contaId: CONTA, pausada: false }] })
      : resposta({ lote: { id: a.p_filtro.loteId }, jobs: [] }),
    confirmar: a => {
      // O servidor guarda a chave: a mesma chave devolve o mesmo lote (replay).
      const replay = lotes.has(a.p_idempotencia);
      lotes.set(a.p_idempotencia, LOTE);
      if (travarConfirmar) return new Promise(() => {}); // resposta perdida: o lote existe, o PC não sabe
      if (falharConfirmar) { const e = falharConfirmar; falharConfirmar = null; return resposta(null, { message: e }); }
      return resposta({ loteId: LOTE, replay });
    },
  };
  const cliente = {
    rpc(nome, args) {
      log.push(['rpc', nome.replace('admin_marketing_real_', ''), args]);
      const fn = rpcs[nome.replace('admin_marketing_real_', '')];
      return { abortSignal: () => Promise.resolve(fn(args)) };
    },
    from(tabela) {
      assert.equal(tabela, 'admin_marketing_real_snapshots');
      let id;
      const q = { select: () => q, eq: (_, v) => { id = v; return q; }, abortSignal: () => q,
        maybeSingle: async () => { log.push(['select', id]); return resposta(snapshots.get(id) || null); } };
      return q;
    },
    storage: { from: bucket => ({
      createSignedUploadUrl: async objeto => {
        log.push(['assinar', objeto]);
        return resposta({ signedUrl: `https://abcdefgh.supabase.co/storage/v1/object/upload/sign/${bucket}/${objeto}?token=fixture` });
      },
      download: async objeto => {
        log.push(['baixar', objeto]);
        const b = objetos.get(objeto);
        return b ? resposta(new Blob([b])) : resposta(null, { message: 'ausente' });
      },
    }) },
  };
  const rede = async (url, init) => {
    const u = new URL(url);
    assert.equal(init.method, 'PUT'); assert.equal(init.redirect, 'error');
    const objeto = decodeURIComponent(u.pathname.split('/sign/marketing-remoto/')[1]);
    log.push(['put', objeto]);
    objetos.set(objeto, Buffer.from(init.body));
    return { status: 200, body: null };
  };
  return { log, cliente, rede, snapshots, lotes,
    falharConfirmar: c => { falharConfirmar = c; }, travarConfirmar: v => { travarConfirmar = v; } };
}

// ---------- fixture local: peça aprovada com aceite datado ----------
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-real-node-'));
const estadoPasta = path.join(raiz, 'conta');
const rel = 'docs/marketing/2026-10/semana-42/aprovados/foto.png';
const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(4096, 7)]);
fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
fs.writeFileSync(path.join(raiz, rel), bytes);
const peca = { id: 'a'.repeat(16), versao: 'b'.repeat(40), titulo: 'Peça aprovada', caminho: rel, tipo: 'imagem',
  aprovada: true, legenda: 'Legenda aceita', arquivos: [{ url: '/' + rel, sha1: sha('sha1', bytes), tipo: 'imagem' }],
  aceite: { id: 'a'.repeat(16), versao: 'b'.repeat(40), caminho: rel, aprovadoEm: new Date(Date.now() - 60000).toISOString(),
    evidencia: 'aceite pelo autor no painel local' } };
const pecaSemAceite = { ...structuredClone(peca), id: 'd'.repeat(16), aprovada: false, aceite: null };
const pecas = { [peca.id]: peca, [pecaSemAceite.id]: pecaSemAceite };
const obterPeca = async (_, id) => structuredClone(pecas[id] || null);

function montar(remoto, { config = true } = {}) {
  const estado = criarEstado({ pasta: estadoPasta });
  const backend = criarPublicacoesReais({
    env: n => (n === 'ADMIN_MARKETING_USER_ID' ? ADMIN : undefined),
    remoto: () => (config ? null : { status: 'indisponivel', motivo: 'configuracao-remota-ausente' }),
    cliente: () => remoto.cliente, relogio: () => new Date('2026-12-01T12:00:00Z'), log: () => {},
    rede: remoto.rede, estado, capturar: criarCapturador({ obterPeca, pastaTemporaria: raiz }) });
  const api = criarPublicacoes({ remoto: backend, estado, obterPeca,
    catalogo: () => ({ pecas: Object.values(pecas).map(p => structuredClone(p)) }) });
  return { api, estado };
}
const pedidoPrevia = { acao: 'prever', pecaId: peca.id, versao: peca.versao,
  destinos: [{ contaId: CONTA, rede: 'instagram', formato: 'feed' }], agendarPara: '2027-01-01T15:30:00Z', fuso: 'America/Sao_Paulo' };
const confirmacao = chave => ({ acao: 'confirmar', previaId: PREVIA, previaHash: HASH_PREVIA, revisaoEsperada: 1,
  idempotencia: chave, confirmacao: true });

(async () => {
  try {
    // 1. Prévia: upload privado e finalização ANTES da prévia; nenhuma confirmação.
    const r1 = criarRemoto();
    const { api } = montar(r1);
    const previa = await api.executar(raiz, pedidoPrevia);
    const ordem = r1.log.map(x => x[0] === 'rpc' ? x[1] : x[0]);
    const i = nome => ordem.indexOf(nome);
    assert.ok(i('snapshot_iniciar') >= 0 && i('snapshot_iniciar') < i('put'), 'iniciar antes do upload');
    assert.ok(i('put') < i('snapshot_finalizar'), 'upload antes de finalizar');
    assert.ok(i('baixar') < i('snapshot_finalizar'), 'servidor relê o objeto antes de finalizar');
    assert.ok(i('snapshot_finalizar') < i('previa'), 'snapshot pronto antes da prévia');
    assert.equal(i('confirmar'), -1, 'prévia não confirma nada');
    const ini = r1.log.find(x => x[1] === 'snapshot_iniciar')[2].p_pedido;
    assert.equal(ini.aceiteRevisao, 1);
    assert.match(ini.aceiteId, /^[0-9a-f]{64}$/);
    assert.equal(ini.midias[0].sha256, sha('sha256', bytes));
    assert.equal(r1.log.find(x => x[1] === 'previa')[2].p_pedido.destinos[0].publicarEm, '2027-01-01T15:30:00.000Z');
    assert.equal(previa.previaId, PREVIA); assert.equal(previa.previaHash, HASH_PREVIA);
    assert.equal(previa.podeConfirmar, true);
    assert.deepEqual(previa.midiasLocais, [{ ordem: 0, tipo: 'imagem', mime: 'image/png',
      url: `/api/marketing/publicacoes/midia?previaId=${PREVIA}&indice=0` }]);
    assert.equal(JSON.stringify(previa).includes(`snap/${SNAP}`), false, 'caminho privado do Storage não vai ao browser');
    assert.equal(fs.readdirSync(raiz).some(n => n.startsWith('grana-snapshot-')), false, 'captura limpa a cópia');

    // Mídia da prévia: lida pelo previaId gravado no estado local, nunca por snapshotId do browser.
    const m = await api.midia(PREVIA, '0');
    assert.equal(m.mime, 'image/png'); assert.deepEqual(m.conteudo, bytes);
    await assert.rejects(api.midia(PREVIA, '1'), { codigo: 'midia-inexistente' });
    await assert.rejects(api.midia('99999999-9999-4999-8999-999999999999', '0'), { codigo: 'previa-inexistente' });

    // Snapshot já pronto (repetição): não reenvia bytes.
    r1.log.length = 0;
    const rpcIniciar = r1.cliente.rpc;
    r1.cliente.rpc = (nome, args) => nome.endsWith('snapshot_iniciar')
      ? (r1.log.push(['rpc', 'snapshot_iniciar', args]), { abortSignal: async () => ({ data: r1.snapshots.get(SNAP), error: null }) })
      : rpcIniciar(nome, args);
    await api.executar(raiz, pedidoPrevia);
    assert.equal(r1.log.some(x => x[0] === 'put'), false, 'snapshot pronto não reenvia');
    r1.cliente.rpc = rpcIniciar;

    // Peça sem aceite: recusada antes de qualquer chamada remota.
    r1.log.length = 0;
    await assert.rejects(api.executar(raiz, { ...pedidoPrevia, pecaId: pecaSemAceite.id }), { codigo: 'sem-aceite' });
    assert.equal(r1.log.length, 0);

    // Configuração remota ausente: 503, sem captura nem RPC.
    const r0 = criarRemoto();
    await assert.rejects(montar(r0, { config: false }).api.executar(raiz, pedidoPrevia),
      { codigo: 'configuracao-remota-ausente', status: 503 });
    assert.equal(r0.log.length, 0);

    // 2. C3: confirmação com chave persistida antes da chamada remota.
    r1.log.length = 0;
    r1.falharConfirmar('erro-de-rede-qualquer');
    await assert.rejects(api.executar(raiz, confirmacao(CHAVE_1)), { codigo: 'fonte-indisponivel' });
    // Reinício do painel: estado relido do disco; o browser manda outra chave.
    const depois = montar(r1);
    const ok = await depois.api.executar(raiz, confirmacao(CHAVE_2));
    const chaves = r1.log.filter(x => x[1] === 'confirmar').map(x => x[2].p_idempotencia);
    assert.deepEqual(chaves, [CHAVE_1, CHAVE_1], 'reinício não gera chave nova');
    assert.equal(ok.loteId, LOTE); assert.equal(ok.replay, true); assert.equal(r1.lotes.size, 1, 'um lote só');
    const gravado = JSON.parse(fs.readFileSync(depois.estado.arquivo, 'utf8'));
    assert.equal(gravado.intencoes[`${PREVIA}:${HASH_PREVIA}`].estado, 'confirmada');
    assert.equal(JSON.stringify(gravado).includes('Legenda aceita'), false, 'estado local sem legenda');

    // Prazo esgotado: a resposta se perde, a nova tentativa usa a mesma chave.
    const r2 = criarRemoto();
    const c2 = montar(r2);
    fs.rmSync(path.join(estadoPasta, 'publicacoes-reais.json'));
    await c2.api.executar(raiz, pedidoPrevia);
    r2.travarConfirmar(true);
    const setTimeoutReal = global.setTimeout;
    global.setTimeout = (fn, ms, ...a) => setTimeoutReal(fn, ms >= 10000 ? 15 : ms, ...a);
    try {
      await assert.rejects(c2.api.executar(raiz, confirmacao(CHAVE_1)),
        e => ['prazo-esgotado', 'fonte-indisponivel'].includes(e.codigo));
    } finally { global.setTimeout = setTimeoutReal; }
    r2.travarConfirmar(false);
    await c2.api.executar(raiz, confirmacao(CHAVE_2));
    assert.deepEqual(r2.log.filter(x => x[1] === 'confirmar').map(x => x[2].p_idempotencia), [CHAVE_1, CHAVE_1],
      'prazo esgotado não gera chave nova');
    assert.equal(r2.lotes.size, 1);

    // 3. Catálogo e miniatura: só peça aprovada é selecionável e tem miniatura.
    const cat = c2.api.catalogo(raiz, {});
    assert.deepEqual(cat.pecas.map(p => p.id), [peca.id], 'peça não aprovada fora do catálogo');
    assert.equal(cat.pecas[0].aprovada, true);
    assert.equal(cat.pecas[0].miniaturaUrl, `/api/marketing/publicacoes/miniatura?pecaId=${peca.id}`);
    const mini = await c2.api.miniatura(raiz, peca.id);
    assert.equal(mini.mime, 'image/png'); assert.deepEqual(mini.conteudo, bytes);
    await assert.rejects(c2.api.miniatura(raiz, pecaSemAceite.id), { codigo: 'sem-aceite', status: 409 });
    await assert.rejects(c2.api.miniatura(raiz, '../../etc/passwd'), { codigo: 'pedido-invalido' });
    // Aceite revogado depois do catálogo: miniatura e catálogo passam a recusar.
    pecas[peca.id].aceite = null;
    assert.equal(c2.api.catalogo(raiz, {}).pecas[0].miniaturaUrl, null);
    assert.equal(c2.api.catalogo(raiz, {}).pecas[0].aprovada, false);
    await assert.rejects(c2.api.miniatura(raiz, peca.id), { codigo: 'sem-aceite' });

    // 4. Cursor opaco: o browser vê base64url, o servidor recebe {id,criadoEm}.
    const r3 = criarRemoto();
    const proximo = { id: LOTE, criadoEm: '2026-12-01T10:00:00.000Z' };
    r3.cliente.rpc = (nome, args) => { r3.log.push(['rpc', nome, args]);
      return { abortSignal: async () => ({ data: { jobs: [], proximoCursor: proximo }, error: null }) }; };
    const c3 = montar(r3);
    const pag = await c3.api.listar({ limite: 2 });
    assert.equal(typeof pag.proximoCursor, 'string');
    await c3.api.listar({ cursor: pag.proximoCursor });
    assert.deepEqual(r3.log.at(-1)[2].p_filtro.cursor, proximo);
    await assert.rejects(c3.api.listar({ cursor: Buffer.from('{"id":"x"}').toString('base64url') }), { codigo: 'pedido-invalido' });
    console.log('admin-publicacoes-reais-node: upload antes da prévia, chave C3 persistida (reinício e prazo), miniatura só aprovada, cursor OK');
  } finally {
    const alvo = path.resolve(raiz);
    assert.equal(path.dirname(alvo), path.resolve(os.tmpdir()));
    assert.ok(path.basename(alvo).startsWith('grana-real-node-'));
    fs.rmSync(alvo, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
