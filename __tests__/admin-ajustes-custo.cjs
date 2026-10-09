'use strict';
// Fase 1: contrato sobre fila, CLI e DTO reais. Todos os dados abaixo sao sinteticos.
// CLI custo recebe --estimativa JSON; evidencia fica privada. A permissao precisa
// ser consumida atomicamente antes de UMA geracao, nunca executada neste teste.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const raiz = path.resolve(__dirname, '..');
const modulo = (nome, imports = {}) => {
  const m = { exports: {} };
  const negar = () => { throw new Error('efeito externo proibido pelo harness'); };
  const permitidos = { fs: new Proxy({}, { get: () => negar }), path, os: { homedir: () => '/fixture' },
    crypto: { randomUUID: negar }, child_process: { execFile: negar },
    '../config.cjs': { RAIZ: '/fixture', RAIZ_DADOS: '/fixture' },
    './ajustes-remoto.cjs': { remotoDoEnv: () => ({ remoto: null, ausente: 'fixture' }) }, ...imports };
  const req = (id) => { assert.ok(Object.hasOwn(permitidos, id), 'import nao permitido no harness'); return permitidos[id]; };
  vm.runInNewContext(fs.readFileSync(path.join(raiz, 'tools/admin-local/marketing', nome), 'utf8'), {
    module: m, exports: m.exports, require: req, process: { env: Object.freeze({}), pid: 123, argv: [] },
    Date, AbortSignal, structuredClone, console: { log: negar, error: negar }, setTimeout: negar, setInterval: negar, clearInterval: negar,
  }, { filename: nome });
  return m.exports;
};
const real = modulo('ajustes-fila.cjs');
const dto = modulo('ajustes-dto.cjs');
const ponteReal = modulo('ajustes-remoto.cjs');
const estimativa = () => ({ ferramenta: 'fixture', gerado: 'artefato de teste', creditos: 2, valorReais: 3, cotacao: 5, motivoNaoLocal: 'motivo ficticio' });
const evidencia = 'Pessoa ficticia; 2026-10-09T12:00:00Z; conversa de teste; sim para uma geracao';
function setup(opts = {}) {
  let agora = Date.parse('2026-10-09T12:00:00Z'), contador = 0, serial = Promise.resolve();
  const db = { formato: 1, pedidos: [], eventos: [] }, calls = [], entregas = [];
  const peca = { id: 'a'.repeat(16), caminho: 'docs/marketing/fixture/para-aprovacao/teste.txt', versao: 'b'.repeat(40), estado: 'para-aprovacao' };
  const deps = {
    agora: () => new Date(agora).toISOString(), id: () => '11111111-1111-4111-8111-' + String(++contador).padStart(12, '0'),
    ler: () => structuredClone(db),
    transacao: (fn) => { const result = serial.then(() => { const copia = structuredClone(db); const r = fn(copia); Object.assign(db, copia); return structuredClone(r); }); serial = result.catch(() => {}); return result; },
    obterPeca: (id) => id === peca.id ? { ...peca } : null,
    verificarCommit: async () => { calls.push('commit'); }, entregar: async (r, texto) => { calls.push('entregar'); entregas.push({ pedido: structuredClone(r), texto }); }, log: () => { calls.push('log'); },
    remoto: opts.remoto || null,
  };
  const fila = real.criarFila(deps);
  return { fila, deps, db, calls, entregas, peca, cli: modulo('ajustes-cli.cjs', { './ajustes-fila.cjs': { fila } }), advance: (ms) => { agora += ms; } };
}
async function ativo(h) {
  await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'CANARIO_TEXTO_FICTICIO' });
  return h.fila.claim();
}
async function custo(h) {
  const r = await ativo(h);
  await h.cli.main(['custo', r.id, r.lease.id, h.peca.id, '--estimativa', JSON.stringify(estimativa())]);
  return r;
}
async function atencao(h) {
  const r = await ativo(h);
  for (let i = 0; i < 3; i++) { h.advance(45 * 60000 + 1); await h.fila.claim(); }
  assert.equal(h.db.pedidos[0].estado, 'precisa-de-atencao', 'fixture deve chegar ao estado real');
  return r;
}
function publico(p, peca) {
  const r = dto.pedidoPublico(p, peca), json = JSON.stringify(r);
  assert.ok(!json.includes('CANARIO_'), 'C01 canarios privados nunca saem no DTO HTTP');
  assert.equal(Object.hasOwn(r, 'textoOriginal'), false);
  assert.ok(!r.lease || !Object.hasOwn(r.lease, 'id'));
  return r;
}
async function semMutacao(h, acao) {
  const antes = JSON.stringify(h.db);
  await assert.rejects(acao);
  assert.equal(JSON.stringify(h.db), antes, 'recusa nao pode gravar estado/evento');
  assert.deepEqual(h.calls, [], 'recusa nao pode entregar/verificar commit/gastar');
}
function rotas(h, opcoes = {}) {
  const m = { exports: {} }, recibos = [];
  const sessao = opcoes.semSessao ? null : { id: 'fixture', s: { etapa: opcoes.etapa || 'ok', geracao: 1 } };
  const seg = {
    checarApi: () => opcoes.origem ? { status: 403, codigo: 'origem-recusada', mensagem: 'Fixture' } : null,
    dentroDoLimite: (chave) => { recibos.push(chave); return !(opcoes.limite && chave === 'marketing'); },
    sessaoDe: () => sessao, cookieExpirado: () => 'fixture', encerrarSessao: () => recibos.push('revogada'),
    checarCabecalhos: (req, opts) => { assert.equal(opts.exigeCsrf, true); assert.equal(opts.exigeOrigem, true); recibos.push('csrf-origem'); return opcoes.csrf ? { status: 403, codigo: 'csrf-invalido', mensagem: 'Fixture' } : null; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(raiz, 'tools/admin-local/rotas.cjs'), 'utf8'), {
    module: m, exports: m.exports, __dirname: path.join(raiz, 'tools/admin-local'), Buffer, URL, Date, Map, Set,
    console: { error: () => recibos.push('erro-log') },
    require: (id) => {
      if (id === 'path') return path;
      if (id === './config.cjs') return { RAIZ_DADOS: '/fixture', SIMULAR: false, ocultar: (s) => s };
      if (id === './seguranca.cjs') return seg;
      if (id === './autenticacao.cjs') return { situacaoConta: () => ({ estado: 'ok', geracao: opcoes.revogada ? 2 : 1 }) };
      if (id === './auditoria.cjs') return { registrar: (acao) => recibos.push('audit-' + acao) };
      if (id === './versao-codigo.cjs') return { desatualizado: () => false };
      const nome = path.basename(id, '.cjs');
      if (nome === 'ajustes-fila') return { fila: h.fila, vigiaEstado: () => ({ ativo: false }) };
      if (nome === 'ajustes-dto') return dto;
      if (nome === 'catalogo') return { obterPeca: (root, idPeca) => idPeca === h.peca.id ? { ...h.peca } : null };
      throw new Error('import externo de rota proibido');
    },
  }, { filename: 'rotas.cjs' });
  return { recibos, async request(acao, corpo = {}, method = 'POST') {
    const req = Readable.from([Buffer.from(JSON.stringify(corpo))]);
    req.method = method; req.headers = { 'x-grana-admin': '1' };
    const res = { statusCode: 0, setHeader() {}, writeHead(status) { this.statusCode = status; }, end(s) { this.json = JSON.parse(s); } };
    await m.exports.tratarApi(req, res, new URL('http://127.0.0.1/api/marketing/ajustes' + (acao ? '/' + acao : '')));
    return res;
  } };
}
const testes = [];
const test = (nome, fn) => testes.push([nome, fn]);
test('harness: solicitar/claim/expirar reais e zero efeitos externos', async () => {
  const h = setup(); await atencao(h); assert.deepEqual(h.calls, []); assert.equal(h.db.pedidos[0].tentativas, 3);
});
test('CLI custo sem estimativa recusa sem mutacao', async () => {
  const h = setup(), r = await ativo(h);
  await semMutacao(h, () => h.cli.main(['custo', r.id, r.lease.id, h.peca.id]));
});
test('fila tambem recusa custo sem estimativa', async () => {
  const h = setup(), r = await ativo(h);
  await semMutacao(h, () => h.fila.marcar(r.id, r.lease.id, 'aguardando-aprovacao-de-custo', { pecaId: h.peca.id }));
});
test('estimativa exige cada campo, numeros finitos e valores validos', async () => {
  const invalidas = Object.keys(estimativa()).map((campo) => { const e = estimativa(); delete e[campo]; return e; });
  invalidas.push({ ...estimativa(), creditos: -1 }, { ...estimativa(), valorReais: Infinity }, { ...estimativa(), cotacao: 0 }, { ...estimativa(), ferramenta: ' ' });
  for (const e of invalidas) { const h = setup(), r = await ativo(h); await semMutacao(h, () => h.fila.marcar(r.id, r.lease.id, 'aguardando-aprovacao-de-custo', { pecaId: h.peca.id, estimativa: e })); }
});
test('custo completo pausa, guarda estimativa no evento e nao entrega', async () => {
  const h = setup(); await custo(h); const p = h.db.pedidos[0];
  assert.equal(p.estado, 'aguardando-aprovacao-de-custo');
  assert.deepEqual(structuredClone(h.db.eventos.at(-1).estimativa), estimativa());
  await h.fila.tick(); assert.deepEqual(h.calls, []); assert.equal(p.aceite, null);
});
test('autorizacao exige evidencia e lease do pedido; sem efeitos na recusa', async () => {
  const h = setup(), r = await custo(h);
  for (const args of [[r.id, r.lease.id], [r.id, r.lease.id, '--evidencia', ' '], [r.id, 'CANARIO_LEASE_ERRADO', '--evidencia', evidencia]])
    await semMutacao(h, () => h.cli.main(['custo-autorizado', ...args]));
});
test('sim na conversa renova lease, volta a correcao e grava evidencia privada', async () => {
  const h = setup(), r = await custo(h); h.advance(60 * 60000);
  const out = await h.cli.main(['custo-autorizado', r.id, r.lease.id, '--evidencia', evidencia]);
  const p = h.db.pedidos[0]; assert.equal(out.estado, 'em-correcao'); assert.equal(p.estado, 'em-correcao');
  assert.equal(p.lease.id, r.lease.id); assert.ok(Date.parse(p.lease.expiraEm) > Date.parse(r.lease.expiraEm));
  const ev = h.db.eventos.at(-1); assert.equal(ev.codigo, 'custo-autorizado'); assert.equal(ev.evidencia, evidencia);
  assert.deepEqual(h.calls, []); assert.equal(p.aceite, null);
});
test('autorizacao atomica permite uma geracao e rejeita concorrencia/reutilizacao', async () => {
  const h = setup(), r = await custo(h);
  await h.cli.main(['custo-autorizado', r.id, r.lease.id, '--evidencia', evidencia]);
  assert.equal(typeof h.fila.consumirAutorizacaoCusto, 'function', 'contrato de consumo unico ausente');
  const results = await Promise.allSettled([h.cli.main(['custo-consumir', r.id, r.lease.id]), h.cli.main(['custo-consumir', r.id, r.lease.id])]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter((x) => x.status === 'rejected').length, 1);
  assert.equal(h.db.eventos.filter((e) => e.codigo === 'custo-consumido').length, 1);
  await semMutacao(h, () => h.fila.consumirAutorizacaoCusto(r.id, r.lease.id));
  await semMutacao(h, () => h.cli.main(['custo-autorizado', r.id, r.lease.id, '--evidencia', evidencia]));
});
test('nova estimativa exige novo sim; nenhuma permissao vaza para outro pedido', async () => {
  const h = setup(), r = await custo(h);
  await h.cli.main(['custo-autorizado', r.id, r.lease.id, '--evidencia', evidencia]);
  await h.fila.consumirAutorizacaoCusto(r.id, r.lease.id);
  await h.cli.main(['custo', r.id, r.lease.id, h.peca.id, '--estimativa', JSON.stringify(estimativa())]);
  await semMutacao(h, () => h.fila.consumirAutorizacaoCusto(r.id, r.lease.id));
  const outro = await ativo(h);
  await semMutacao(h, () => h.fila.consumirAutorizacaoCusto(outro.id, outro.lease.id));
});
test('nao na conversa encerra como recusado-pelo-autor, com motivo', async () => {
  const h = setup(), r = await custo(h);
  await h.cli.main(['custo-recusado', r.id, r.lease.id]);
  const p = h.db.pedidos[0]; assert.equal(p.estado, 'recusado-pelo-autor'); assert.ok(p.motivoEncerramento); assert.equal(p.lease, null);
  await h.fila.tick(); assert.deepEqual(h.calls, []); assert.equal(p.aceite, null); assert.equal(publico(p, h.peca).estado, 'recusado-pelo-autor');
});
test('recusa com seguir-local retoma sem autorizar gasto nem enviar outra vez', async () => {
  const h = setup(), r = await custo(h);
  await h.cli.main(['custo-recusado', r.id, r.lease.id, '--seguir-local']);
  const p = h.db.pedidos[0]; assert.equal(p.estado, 'em-correcao'); assert.equal(p.somenteLocal, true);
  await semMutacao(h, () => h.fila.consumirAutorizacaoCusto(r.id, r.lease.id));
  await h.fila.tick(); assert.deepEqual(h.calls, []);
});
test('Reenviar exige confirmacao, zera tentativas e so tick entrega uma vez', async () => {
  const h = setup(), r = await atencao(h);
  assert.equal(typeof h.fila.reenviar, 'function', 'contrato Reenviar ausente');
  await semMutacao(h, () => h.fila.reenviar(r.id, { confirmacao: false }));
  await h.fila.reenviar(r.id, { confirmacao: true });
  assert.equal(h.db.pedidos[0].estado, 'novo'); assert.equal(h.db.pedidos[0].tentativas, 0); assert.deepEqual(h.calls, []);
  await h.fila.tick(); await h.fila.tick(); assert.deepEqual(h.calls, ['entregar']);
});
test('Encerrar exige motivo, estado terminal e nunca entrega', async () => {
  const h = setup(), r = await atencao(h);
  assert.equal(typeof h.fila.encerrar, 'function', 'contrato Encerrar ausente');
  await semMutacao(h, () => h.fila.encerrar(r.id, { confirmacao: true, motivo: ' ' }));
  await h.fila.encerrar(r.id, { confirmacao: true, motivo: 'Encerramento ficticio' });
  assert.equal(h.db.pedidos[0].estado, 'encerrado'); assert.equal(h.db.pedidos[0].motivoEncerramento, 'Encerramento ficticio');
  await h.fila.tick(); assert.deepEqual(h.calls, []); assert.equal(publico(h.db.pedidos[0], h.peca).estado, 'encerrado');
  await semMutacao(h, () => h.fila.reenviar(r.id, { confirmacao: true }));
});
test('Reenviar/Encerrar nao alteram outros estados', async () => {
  for (const estado of ['novo', 'em-correcao', 'aguardando-aprovacao-de-custo', 'aceito', 'recusado-pelo-autor', 'encerrado']) {
    const h = setup(), r = await ativo(h); h.db.pedidos[0].estado = estado;
    assert.equal(typeof h.fila.reenviar, 'function'); assert.equal(typeof h.fila.encerrar, 'function');
    await semMutacao(h, () => h.fila.reenviar(r.id, { confirmacao: true }));
    await semMutacao(h, () => h.fila.encerrar(r.id, { confirmacao: true, motivo: 'Ficticio' }));
  }
});
test('DTO versaoAtual deriva da peca correta e preserva SHA alvo', async () => {
  const h = setup(), r = await ativo(h); h.peca.versao = 'c'.repeat(40);
  const p = publico(r, h.peca); assert.equal(p.versaoAtual, h.peca.versao); assert.equal(p.versaoAlvo, r.versaoAlvo);
  assert.equal(publico(r, { ...h.peca, id: 'd'.repeat(16) }).versaoAtual, null);
});
test('DTO de todos os estados fecha C01 e exclui evidencia/gerado/extras', async () => {
  const h = setup(), r = await ativo(h);
  for (const estado of ['novo', 'em-correcao', 'aguardando-aprovacao-de-custo', 'recusado-pelo-autor', 'precisa-de-atencao', 'encerrado', 'desatualizado']) {
    const p = { ...r, estado, textoOriginal: 'CANARIO_TEXTO_FICTICIO', lease: { ...r.lease, id: 'CANARIO_LEASE_FICTICIO' },
      custo: { ...estimativa(), gerado: 'CANARIO_GERADO_FICTICIO', autorizacao: { evidencia: 'CANARIO_EVIDENCIA_FICTICIA' } }, extras: 'CANARIO_EXTRA_FICTICIO' };
    const out = publico(p, h.peca); assert.equal(out.estado, estado);
    assert.deepEqual(Object.keys(out.custo).sort(), ['cotacao', 'creditos', 'ferramenta', 'motivoNaoLocal', 'valorReais'].sort());
  }
});
test('E05 legado sem estimativa e lease vencido reentrega so estimativa, sem autorizar custo', async () => {
  const h = setup(), r = await ativo(h);
  h.db.pedidos[0].estado = 'aguardando-aprovacao-de-custo'; // Fixture em memoria, nunca fila privada.
  h.advance(46 * 60000); await h.fila.tick();
  const p = h.db.pedidos[0]; assert.equal(p.estado, 'em-correcao'); assert.equal(p.somenteEstimativa, true);
  assert.notEqual(p.lease.id, r.lease.id); assert.ok(Date.parse(p.lease.expiraEm) > Date.parse(r.lease.expiraEm));
  assert.equal(h.entregas.length, 1); assert.ok(h.entregas[0].texto.includes('tarefa só estimativa, não gere nada'));
  assert.ok(!h.entregas[0].texto.includes('CANARIO_TEXTO_FICTICIO')); assert.deepEqual(h.calls, ['entregar']);
  const antes = JSON.stringify(h.db);
  await assert.rejects(() => h.cli.main(['custo', p.id, p.lease.id, h.peca.id]));
  await assert.rejects(() => h.cli.main(['custo-autorizado', p.id, p.lease.id, '--evidencia', evidencia]));
  await assert.rejects(() => h.cli.main(['custo-consumir', p.id, p.lease.id]));
  await assert.rejects(() => h.cli.main(['concluir', p.id, p.lease.id, h.peca.id, h.peca.versao, 'c'.repeat(40)]));
  assert.equal(JSON.stringify(h.db), antes); await h.fila.tick(); assert.deepEqual(h.calls, ['entregar']);
  await h.cli.main(['custo', p.id, p.lease.id, h.peca.id, '--estimativa', JSON.stringify(estimativa())]);
  assert.equal(h.db.pedidos[0].estado, 'aguardando-aprovacao-de-custo');
  await h.fila.tick(); assert.deepEqual(h.calls, ['entregar']); assert.equal(h.db.pedidos[0].custo.autorizacao, undefined);
});
test('estimativa completa vencida continua pausada sem reenvio ou autorizacao implicita', async () => {
  const h = setup(); await custo(h); h.advance(60 * 60000); await h.fila.tick();
  assert.equal(h.db.pedidos[0].estado, 'aguardando-aprovacao-de-custo'); assert.deepEqual(h.calls, []);
});
test('lease recuperado nao herda permissao de geracao anterior', async () => {
  const h = setup(), r = await custo(h);
  await h.cli.main(['custo-autorizado', r.id, r.lease.id, '--evidencia', evidencia]);
  h.advance(46 * 60000); const novo = await h.fila.claim(); assert.notEqual(novo.lease.id, r.lease.id);
  await semMutacao(h, () => h.fila.consumirAutorizacaoCusto(novo.id, novo.lease.id));
});
test('POST Reenviar/Encerrar reais, DTO fechado e efeito exato na fila', async () => {
  for (const acao of ['reenviar', 'encerrar']) {
    const h = setup(), r = await atencao(h), api = rotas(h);
    h.peca.versao = 'c'.repeat(40);
    const res = await api.request(acao, { pedidoId: r.id, confirmacao: true, motivo: 'Fixture encerrada' });
    assert.equal(res.statusCode, 200); assert.equal(res.json.dados.pedido.estado, acao === 'reenviar' ? 'novo' : 'encerrado');
    assert.equal(res.json.dados.pedido.versaoAtual, h.peca.versao);
    assert.ok(!JSON.stringify(res.json).includes('CANARIO_')); assert.equal(res.json.dados.pedido.textoOriginal, undefined);
    assert.ok(api.recibos.includes('marketing')); assert.ok(api.recibos.includes('csrf-origem')); assert.ok(api.recibos.includes('audit-acao'));
    assert.deepEqual(h.calls, []);
  }
});
test('rotas recusam IDs/corpos invalidos, estado incorreto e metodos sem mutacao', async () => {
  for (const acao of ['reenviar', 'encerrar']) {
    const h = setup(), r = await atencao(h), api = rotas(h), antes = JSON.stringify(h.db);
    for (const [corpo, method] of [[{ pedidoId: 'invalido' }, 'POST'], [{ pedidoId: r.id, confirmacao: false, motivo: '' }, 'POST'], [{ pedidoId: r.id, confirmacao: true, motivo: 'Fixture' }, 'PUT'], [{ pedidoId: r.id }, 'GET']]) {
      const res = await api.request(acao, corpo, method); assert.ok(res.statusCode >= 400); assert.equal(JSON.stringify(h.db), antes);
    }
    h.db.pedidos[0].estado = 'aceito'; const estadoAntes = JSON.stringify(h.db);
    const res = await api.request(acao, { pedidoId: r.id, confirmacao: true, motivo: 'Fixture' }); assert.equal(res.statusCode, 409);
    assert.equal(JSON.stringify(h.db), estadoAntes); assert.deepEqual(h.calls, []);
  }
});
test('guarda HTTP real exige sessao completa, CSRF/origem, conta atual e limite MARKETING_POST', async () => {
  for (const acao of ['reenviar', 'encerrar']) for (const opts of [{ semSessao: true }, { etapa: 'senha' }, { etapa: 'totp' }, { csrf: true }, { origem: true }, { revogada: true }, { limite: true }]) {
    const h = setup(), r = await atencao(h), api = rotas(h, opts), antes = JSON.stringify(h.db);
    const res = await api.request(acao, { pedidoId: r.id, confirmacao: true, motivo: 'Fixture' });
    assert.ok([401, 403, 429].includes(res.statusCode)); assert.equal(JSON.stringify(h.db), antes); assert.deepEqual(h.calls, []);
  }
});
test('lista HTTP expoe estimativa filtrada/versaoAtual, nunca evidencia; sim nao tem rota HTTP', async () => {
  const h = setup(), r = await custo(h);
  await h.cli.main(['custo-autorizado', r.id, r.lease.id, '--evidencia', 'CANARIO_EVIDENCIA_FICTICIA']);
  const api = rotas(h), lista = await api.request('', {}, 'GET'); assert.equal(lista.statusCode, 200);
  assert.ok(!JSON.stringify(lista.json).includes('CANARIO_')); assert.equal(lista.json.dados.pedidos[0].versaoAtual, h.peca.versao);
  assert.equal(lista.json.dados.pedidos[0].custo.gerado, undefined); assert.equal(lista.json.dados.pedidos[0].custo.autorizacao, undefined);
  const antes = JSON.stringify(h.db); const denied = await api.request('custo-autorizado', { pedidoId: r.id });
  assert.equal(denied.statusCode, 404); assert.equal(JSON.stringify(h.db), antes); assert.deepEqual(h.calls, []);
});
test('versao/peca incorreta impede estimativa, autorizacao e consumo sem efeitos', async () => {
  const h = setup(), r = await ativo(h);
  await semMutacao(h, () => h.fila.marcar(r.id, r.lease.id, 'aguardando-aprovacao-de-custo', { pecaId: 'd'.repeat(16), estimativa: estimativa() }));
  await h.cli.main(['custo', r.id, r.lease.id, h.peca.id, '--estimativa', JSON.stringify(estimativa())]);
  h.peca.versao = 'c'.repeat(40);
  await semMutacao(h, () => h.cli.main(['custo-autorizado', r.id, r.lease.id, '--evidencia', evidencia]));
  h.peca.versao = r.versaoAlvo;
  await h.cli.main(['custo-autorizado', r.id, r.lease.id, '--evidencia', evidencia]);
  await semMutacao(h, () => h.cli.main(['custo-consumir', r.id, 'CANARIO_LEASE_ERRADO']));
  h.peca.versao = 'c'.repeat(40);
  await semMutacao(h, () => h.cli.main(['custo-consumir', r.id, r.lease.id]));
});
test('E05 legado sem lease tambem recupera somente estimativa, preservando C01', async () => {
  const h = setup(); await ativo(h); const p = h.db.pedidos[0];
  p.estado = 'aguardando-aprovacao-de-custo'; p.lease = null;
  await h.fila.tick(); assert.equal(h.db.pedidos[0].estado, 'em-correcao'); assert.equal(h.db.pedidos[0].somenteEstimativa, true);
  assert.equal(h.entregas.length, 1); assert.ok(h.entregas[0].texto.includes('tarefa só estimativa, não gere nada'));
  assert.deepEqual(h.calls, ['entregar']); publico(h.db.pedidos[0], h.peca);
});
test('Encerrar recusa confirmacao ausente/false mesmo com motivo valido na fila e HTTP', async () => {
  for (const confirmacao of [undefined, false]) {
    const h = setup(), r = await atencao(h);
    await semMutacao(h, () => h.fila.encerrar(r.id, { confirmacao, motivo: 'Motivo ficticio valido' }));
    const api = rotas(h), antes = JSON.stringify(h.db);
    const res = await api.request('encerrar', { pedidoId: r.id, confirmacao, motivo: 'Motivo ficticio valido' });
    assert.equal(res.statusCode, 400); assert.equal(res.json.erro.codigo, 'confirmacao-invalida');
    assert.equal(JSON.stringify(h.db), antes); assert.deepEqual(h.calls, []);
  }
});
test('recusa de schema remoto preserva terminais locais; recibo persiste no GET/reinicio ate sync', async () => {
  for (const estado of ['encerrado', 'recusado-pelo-autor']) {
    let recusar = true, leuCorpoErro = false; const chamadas = [];
    const remoto = ponteReal.criarRemoto({ url: 'https://fixture.supabase.co', chave: 'fixture', fetch: async (url, init) => {
      const body = init.body && JSON.parse(init.body); chamadas.push({ method: init.method || 'GET', estado: body?.estado });
      if (init.method === 'PATCH' && recusar) return { ok: false, status: 400, json: async () => { leuCorpoErro = true; return { message: 'CANARIO_TEXTO_FICTICIO' }; } };
      return { ok: true, status: init.method ? 204 : 200, json: async () => [] };
    } });
    const h = setup({ remoto });
    const r = estado === 'encerrado' ? await atencao(h) : await custo(h);
    h.db.pedidos[0].remotoId = '22222222-2222-4222-8222-222222222222'; h.db.pedidos[0].remotoEstado = h.db.pedidos[0].estado;
    if (estado === 'encerrado') {
      const res = await rotas(h).request('encerrar', { pedidoId: r.id, confirmacao: true, motivo: 'Motivo ficticio' });
      assert.equal(res.statusCode, 200); assert.equal(res.json.dados.gravadoLocalmente, true);
      assert.equal(res.json.dados.pedido.espelho.estado, 'pendente'); assert.equal(chamadas.length, 0);
    } else await h.cli.main(['custo-recusado', r.id, r.lease.id]);
    assert.equal(h.db.pedidos[0].estado, estado);
    await h.fila.sincronizarRemoto(); assert.equal(h.db.pedidos[0].estado, estado);
    assert.equal(h.db.pedidos[0].espelho.estado, 'falha'); assert.equal(h.db.pedidos[0].espelho.codigo, 'remoto-estado-recusado');
    assert.equal(leuCorpoErro, false); assert.deepEqual(chamadas.slice(0, 2).map((c) => c.method), ['GET', 'PATCH']);
    const salvo = structuredClone(h.db.pedidos[0].espelho);
    // Outra instancia real usa o mesmo repositorio isolado: nenhum global de erro herdado.
    h.fila = real.criarFila(h.deps); assert.equal(h.fila.remotoStatus().ultimoErro, null);
    const lista = await rotas(h).request('', {}, 'GET'); assert.equal(lista.statusCode, 200);
    assert.deepEqual(lista.json.dados.pedidos[0].espelho, salvo); assert.ok(!JSON.stringify(lista.json).includes('CANARIO_'));
    const local = await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'Fixture local' });
    await h.fila.tick(); assert.equal(h.db.pedidos.find((p) => p.id === local.id).estado, 'em-correcao');
    assert.equal(h.calls.filter((c) => c === 'entregar').length, 1); assert.equal(h.db.pedidos[0].estado, estado);
    // Falha repetida nao limpa recibo; sucesso posterior sim, sem apagar estado local.
    assert.equal(h.db.pedidos[0].espelho.estado, 'falha');
    recusar = false; h.advance(30001); await h.fila.sincronizarRemoto();
    assert.equal(h.db.pedidos[0].espelho.estado, 'sincronizado'); assert.equal(h.db.pedidos[0].espelho.codigo, null);
    assert.equal(h.db.pedidos[0].estado, estado); assert.equal(h.db.pedidos[0].remotoEstado, estado);
    const sucesso = await rotas(h).request('', {}, 'GET'); assert.equal(sucesso.json.dados.pedidos[0].espelho.estado, 'sincronizado');
    assert.ok(chamadas.some((c) => c.method === 'POST' && c.estado === estado));
  }
});
test('ponte ausente persiste indisponibilidade por pedido e fila local segue sem rede', async () => {
  const h = setup(), r = await atencao(h); h.db.pedidos[0].remotoId = '22222222-2222-4222-8222-222222222222';
  await h.fila.encerrar(r.id, { confirmacao: true, motivo: 'Fixture' });
  assert.equal(h.db.pedidos[0].estado, 'encerrado');
  assert.deepEqual(structuredClone(h.db.pedidos[0].espelho), { estado: 'indisponivel', codigo: 'ponte-ausente', em: h.deps.agora() });
  h.fila = real.criarFila(h.deps); await h.fila.sincronizarRemoto();
  const lista = await rotas(h).request('', {}, 'GET'); assert.equal(lista.json.dados.remoto.status, 'ausente');
  assert.equal(lista.json.dados.pedidos[0].espelho.codigo, 'ponte-ausente'); assert.ok(!JSON.stringify(lista.json).includes('CANARIO_'));
  await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'Fixture local' }); await h.fila.tick();
  assert.deepEqual(h.calls, ['entregar']);
});
test('recusa de um pedido nao impede espelho de outro nem resposta antiga apaga pendencia nova', async () => {
  let h, mudou = false; const refletidos = [];
  const remoto = { novos: async () => [], refletir: async (r) => {
    refletidos.push(r.id);
    if (r.id === h.db.pedidos[0].id) throw Object.assign(new Error('CANARIO_TEXTO_FICTICIO'), { codigo: 'remoto-estado-recusado' });
    if (!mudou) { mudou = true; await h.fila.encerrar(r.id, { confirmacao: true, motivo: 'Fixture' }); }
  } };
  h = setup({ remoto });
  for (let i = 0; i < 2; i++) { const r = await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'Fixture' });
    const p = h.db.pedidos.find((p) => p.id === r.id); p.remotoId = '22222222-2222-4222-8222-' + String(i).padStart(12, '0');
    p.estado = 'precisa-de-atencao'; }
  await h.fila.sincronizarRemoto(); assert.equal(refletidos.length, 2);
  assert.equal(h.db.pedidos[0].espelho.codigo, 'remoto-estado-recusado');
  assert.equal(h.db.pedidos[1].estado, 'encerrado'); assert.equal(h.db.pedidos[1].espelho.estado, 'pendente');
  h.advance(30001); await h.fila.sincronizarRemoto(); assert.equal(h.db.pedidos[1].espelho.estado, 'sincronizado');
});
test('confirmacao nao booleana com motivo valido nunca grava fila/eventos', async () => {
  for (const confirmacao of [null, 0, 1, 'true', 'false', {}, []]) {
    const h = setup(), r = await atencao(h);
    await semMutacao(h, () => h.fila.encerrar(r.id, { confirmacao, motivo: 'Fixture valida' }));
    const antes = JSON.stringify(h.db), res = await rotas(h).request('encerrar', { pedidoId: r.id, confirmacao, motivo: 'Fixture valida' });
    assert.equal(res.statusCode, 400); assert.equal(JSON.stringify(h.db), antes);
  }
});
test('GET filtra codigo/timestamp/extras do recibo e ativo sem sync nao afirma saude', async () => {
  const h = setup({ remoto: { novos: async () => [], refletir: async () => {} } }); await ativo(h);
  h.db.pedidos[0].espelho = { estado: 'falha', codigo: 'CANARIO_TEXTO_FICTICIO', em: 'CANARIO_DATA_FICTICIA', textoOriginal: 'CANARIO_TEXTO_FICTICIO' };
  const res = await rotas(h).request('', {}, 'GET'); const p = res.json.dados.pedidos[0];
  assert.deepEqual(p.espelho, { estado: 'falha', codigo: null, em: null }); assert.ok(!JSON.stringify(res.json).includes('CANARIO_'));
  assert.equal(res.json.dados.remoto.status, 'ativo'); assert.equal(res.json.dados.remoto.ultimaSync, null);
});
test('outra acao local conserva aviso de falha ate o espelho confirmar a nova revisao', async () => {
  let falhar = true;
  const h = setup({ remoto: { novos: async () => [], refletir: async () => { if (falhar) throw Object.assign(new Error('Fixture'), { codigo: 'remoto-http' }); } } });
  const r = await atencao(h); h.db.pedidos[0].remotoId = '22222222-2222-4222-8222-222222222222';
  await h.fila.sincronizarRemoto(); const incidente = structuredClone(h.db.pedidos[0].espelho);
  const res = await rotas(h).request('reenviar', { pedidoId: r.id, confirmacao: true });
  assert.equal(res.statusCode, 200); assert.equal(res.json.dados.espelhamentoPendente, true);
  assert.equal(h.db.pedidos[0].estado, 'novo'); assert.deepEqual(structuredClone(h.db.pedidos[0].espelho), incidente);
  assert.deepEqual(res.json.dados.pedido.espelho, incidente);
  falhar = false; h.advance(30001); await h.fila.sincronizarRemoto();
  assert.equal(h.db.pedidos[0].espelho.estado, 'sincronizado'); assert.equal(h.db.pedidos[0].espelho.codigo, null);
});
test('POST Encerrar aceita motivo de 1-500 caracteres e recusa vazio/acima sem escrita', async () => {
  for (const motivo of ['', ' ', 'ajuste '.repeat(71) + 'fimx', null, 123]) {
    const h = setup(), r = await atencao(h), antes = JSON.stringify(h.db);
    await semMutacao(h, () => h.fila.encerrar(r.id, { motivo, confirmacao: true }));
    const res = await rotas(h).request('encerrar', { pedidoId: r.id, motivo, confirmacao: true });
    assert.equal(res.statusCode, 400); assert.equal(res.json.erro.codigo, 'motivo-invalido');
    assert.equal(JSON.stringify(h.db), antes); assert.deepEqual(h.calls, []);
  }
  for (const motivo of ['x', 'ajuste '.repeat(71) + 'fim', '😀'.repeat(500)]) {
    const h = setup(), r = await atencao(h);
    const res = await rotas(h).request('encerrar', { pedidoId: r.id, motivo, confirmacao: true });
    assert.equal(res.statusCode, 200); assert.equal(h.db.pedidos[0].estado, 'encerrado');
    assert.equal(h.db.pedidos[0].motivoEncerramento, motivo); assert.deepEqual(h.calls, []);
  }
});
(async () => {
  let falhas = 0;
  for (const [nome, fn] of testes) {
    try { await fn(); console.log('OK ' + nome); }
    catch { falhas++; console.error('FALHA ' + nome); } // Nunca imprimir argumentos/valores de dados.
  }
  console.log('admin-ajustes-custo: ' + (testes.length - falhas) + '/' + testes.length + ' grupos; zero rede/env/processos/gasto real');
  process.exitCode = falhas ? 1 : 0;
})();
