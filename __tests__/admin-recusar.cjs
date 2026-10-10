'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { harness, fixture } = require('./admin-familia.cjs');
let grupos = 0;
async function test(nome, fn, nomes) { await fixture(async (f) => { await fn(f); grupos++; console.log('OK ' + nome); }, nomes); }
function setup(f, opts) {
  const h = harness(f.dir, opts), p = h.catalogo.montarCatalogo(f.dir)[0], hist = h.load('historico.cjs');
  return { ...h, p, hist, corpo: { versao: p.versao, motivo: 'Motivo ficticio', confirmacao: true },
    origem: path.join(f.media, p.arquivos[0].nome), destino: path.join(f.dir, f.semana, 'historico/pecas', p.arquivos[0].nome),
    registro: path.join(f.painel, 'historico.json') };
}
(async () => {
  await test('recusa verifica copia/prova/indice antes de limpar e retoma idempotente', async (f) => {
    const h = setup(f), efeitos = [];
    const io = { ...fs, copyFileSync(de, para, flag) { assert.equal(flag, fs.constants.COPYFILE_EXCL); efeitos.push('copiar'); fs.copyFileSync(de, para, flag); },
      unlinkSync(abs) { if (abs === h.origem) { const r = JSON.parse(fs.readFileSync(h.registro)).recusas[0]; assert.ok(r.indice); assert.equal(r.evidencia, 'recusa pelo autor no painel local'); assert.ok(fs.existsSync(h.destino)); efeitos.push('limpar'); } fs.unlinkSync(abs); } };
    const fn = h.hist.criarHistorico(io, () => {}), res = await fn(f.dir, h.p.id, h.corpo);
    assert.deepEqual(efeitos, ['copiar', 'limpar']); assert.equal(res.jaExistia, false); assert.ok(!fs.existsSync(h.origem));
    assert.equal(fs.readFileSync(h.destino, 'utf8'), 'fixture peca.png'); assert.ok(fs.readFileSync(f.indice, 'utf8').includes('<!-- recusa:'));
    const p = h.catalogo.obterPeca(f.dir, res.recusa.id); assert.equal(p.estado, 'historico'); assert.equal(p.recusa.motivo, h.corpo.motivo);
    const retry = await fn(f.dir, h.p.id, h.corpo); assert.equal(retry.jaExistia, true); assert.equal(efeitos.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(h.registro)).recusas.length, 1);
  });
  await test('carrossel inteiro copiado e conferido antes de remover qualquer origem', async (f) => {
    const h = setup(f), seq = [];
    const fn = h.hist.criarHistorico({ ...fs, copyFileSync(...args) { seq.push('copiar'); fs.copyFileSync(...args); }, unlinkSync(abs) {
      if (path.dirname(abs) === f.media) { assert.equal(seq.filter((s) => s === 'copiar').length, 2); assert.equal(JSON.parse(fs.readFileSync(h.registro)).recusas[0].arquivos.length, 2); seq.push('limpar'); } fs.unlinkSync(abs);
    } }, () => {});
    const r = await fn(f.dir, h.p.id, h.corpo); assert.equal(r.recusa.arquivos.length, 2); assert.deepEqual(seq, ['copiar', 'copiar', 'limpar', 'limpar']);
  }, ['peca-1.png', 'peca-2.png']);
  await test('sem confirmacao/motivo/versao correta nenhum arquivo e copiado', async (f) => {
    const h = setup(f); let copiar = 0;
    const fn = h.hist.criarHistorico({ ...fs, copyFileSync() { copiar++; } }, () => {});
    for (const corpo of [{ ...h.corpo, confirmacao: undefined }, { ...h.corpo, confirmacao: false }, { ...h.corpo, confirmacao: 'true' }, { ...h.corpo, motivo: ' ' }, { ...h.corpo, motivo: 'x'.repeat(501) }, { ...h.corpo, versao: 'a'.repeat(40) }]) await assert.rejects(fn(f.dir, h.p.id, corpo));
    assert.equal(copiar, 0); assert.ok(fs.existsSync(h.origem)); assert.ok(!fs.existsSync(h.registro));
  });
  await test('pedido aberto ou fila indisponivel bloqueia sem copiar; terminais nao bloqueiam', async (f) => {
    const h = setup(f); let copiar = 0;
    const fn = h.hist.criarHistorico({ ...fs, copyFileSync(...args) { copiar++; return fs.copyFileSync(...args); } }, () => {});
    for (const estado of ['novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao', 'desconhecido']) {
      h.pedidos.splice(0, h.pedidos.length, { pecaId: h.p.id, estado, textoOriginal: 'CANARIO_PRIVADO' });
      await assert.rejects(fn(f.dir, h.p.id, h.corpo), (e) => e.codigo === 'ajuste-aberto');
    }
    assert.equal(copiar, 0); h.pedidos.splice(0, h.pedidos.length, { pecaId: h.p.id, estado: 'encerrado' }); await fn(f.dir, h.p.id, h.corpo);
    assert.equal(copiar, 1);
    const f2 = harness(f.dir, { filaFalha: true });
    // A fixture nova tem outra peca; fila quebrada falha fechada.
    fs.writeFileSync(path.join(f.media, 'outra.png'), 'fixture');
    const p2 = f2.catalogo.montarCatalogo(f.dir).find((p) => p.nome === 'outra.png');
    await assert.rejects(f2.load('historico.cjs').recusar(f.dir, p2.id, { ...h.corpo, versao: p2.versao }), (e) => e.codigo === 'fila-indisponivel');
  });
  await test('sucessora precisa pertencer a mesma familia e preserva aceite independente', async (f) => {
    const h = setup(f), pecas = h.catalogo.montarCatalogo(f.dir), p = pecas.find((p) => p.nome === 'reel.mp4'), s = pecas.find((p) => p.nome === 'reel-v2.mp4');
    await assert.rejects(h.hist.recusar(f.dir, p.id, { ...h.corpo, versao: p.versao, sucessora: pecas.find((p) => p.nome === 'outra.png').id }));
    const r = await h.hist.recusar(f.dir, p.id, { ...h.corpo, versao: p.versao, sucessora: s.id });
    assert.equal(r.recusa.sucessora, s.id); assert.equal(h.catalogo.obterPeca(f.dir, s.id).aceite, null);
  }, ['reel.mp4', 'reel-v2.mp4', 'outra.png']);
  await test('falha na copia ou persistencia preserva todos os originais', async (f) => {
    const h = setup(f); let copiar = 0;
    const fn = h.hist.criarHistorico({ ...fs, copyFileSync(...args) { if (++copiar === 2) throw new Error('fixture'); fs.copyFileSync(...args); } }, () => {});
    await assert.rejects(fn(f.dir, h.p.id, h.corpo), (e) => e.codigo === 'recusa-falhou');
    for (const a of h.p.arquivos) assert.ok(fs.existsSync(path.join(f.media, a.nome)));
    const save = h.hist.criarHistorico({ ...fs, renameSync(de, para) { if (para === h.registro) throw new Error('fixture'); fs.renameSync(de, para); } }, () => {});
    await assert.rejects(save(f.dir, h.p.id, h.corpo)); assert.ok(!fs.existsSync(h.registro));
    for (const a of h.p.arquivos) assert.ok(fs.existsSync(path.join(f.media, a.nome)));
  }, ['peca-1.png', 'peca-2.png']);
  await test('indice pendente e falha de limpeza deixam recibo e permitem retomar', async (f) => {
    const h = setup(f); let indiceFalha = true, limpezaFalha = true, copiar = 0;
    const fn = h.hist.criarHistorico({ ...fs, copyFileSync(...a) { copiar++; fs.copyFileSync(...a); }, renameSync(de, para) { if (para === f.indice && indiceFalha) throw new Error('fixture'); fs.renameSync(de, para); }, unlinkSync(abs) { if (abs === h.origem && limpezaFalha) throw new Error('fixture'); fs.unlinkSync(abs); } }, () => {});
    const r = await fn(f.dir, h.p.id, h.corpo); assert.ok(r.avisos.some((s) => s.includes('indice pendente'))); assert.ok(fs.existsSync(h.origem));
    indiceFalha = false; const r2 = await fn(f.dir, h.p.id, h.corpo); assert.ok(r2.avisos.some((s) => s.includes('origem pendente')));
    limpezaFalha = false; await fn(f.dir, h.p.id, h.corpo); assert.equal(copiar, 1); assert.ok(!fs.existsSync(h.origem));
  });
  for (const falhaInicial of ['indice', 'limpeza']) for (const bloqueio of ['pedido-aberto', 'fila-ilegivel', 'legado-aberto']) {
    await test('retomada apos ' + falhaInicial + ' bloqueia ' + bloqueio + ' sem finalizar ou escrever', async (f) => {
      const opts = {}, h = setup(f, opts);
      const primeira = h.hist.criarHistorico({ ...fs,
        renameSync(de, para) { if (falhaInicial === 'indice' && para === f.indice) throw new Error('fixture'); fs.renameSync(de, para); },
        unlinkSync(abs) { if (falhaInicial === 'limpeza' && abs === h.origem) throw new Error('fixture'); fs.unlinkSync(abs); },
      }, () => {});
      const parcial = await primeira(f.dir, h.p.id, h.corpo);
      assert.ok(parcial.avisos.some((s) => s.includes('pendente'))); assert.ok(fs.existsSync(h.origem)); assert.ok(fs.existsSync(h.registro));
      if (bloqueio === 'pedido-aberto') h.pedidos.push({ pecaId: h.p.id, estado: 'em-correcao' });
      if (bloqueio === 'fila-ilegivel') opts.filaFalha = true;
      if (bloqueio === 'legado-aberto') fs.writeFileSync(path.join(f.painel, 'aprovacoes.json'), JSON.stringify({ ajustes: [{ id: h.p.id, estado: 'novo' }] }));
      const preservar = [h.origem, h.destino, h.registro, f.indice].map((arq) => [arq, fs.readFileSync(arq)]);
      const efeitos = [], ioRetry = { ...fs };
      for (const metodo of ['writeFileSync', 'renameSync', 'unlinkSync', 'mkdirSync', 'copyFileSync', 'rmSync']) ioRetry[metodo] = (...args) => { efeitos.push(metodo); return fs[metodo](...args); };
      const retry = h.hist.criarHistorico(ioRetry, () => {});
      await assert.rejects(retry(f.dir, h.p.id, h.corpo), (e) => e.codigo === (bloqueio === 'fila-ilegivel' ? 'fila-indisponivel' : 'ajuste-aberto'));
      assert.deepEqual(efeitos, [], 'retomada bloqueada nao inicia indice, prova ou limpeza');
      for (const [arq, bytes] of preservar) assert.deepEqual(fs.readFileSync(arq), bytes, 'origem/copia/prova/indice intactos');
    });
  }
  await test('destino existente e junction nao sobrescrevem nem seguem fora da raiz', async (f) => {
    const h = setup(f); fs.mkdirSync(path.dirname(h.destino), { recursive: true }); fs.writeFileSync(h.destino, 'preservar');
    await assert.rejects(h.hist.recusar(f.dir, h.p.id, h.corpo)); assert.equal(fs.readFileSync(h.destino, 'utf8'), 'preservar');
    fs.rmSync(path.join(f.dir, f.semana, 'historico'), { recursive: true });
    const fora = path.join(f.dir, 'isolado'); fs.mkdirSync(fora); fs.symlinkSync(fora, path.join(f.dir, f.semana, 'historico'), 'junction');
    await assert.rejects(h.hist.recusar(f.dir, h.p.id, h.corpo), (e) => e.codigo === 'caminho-invalido'); assert.deepEqual(fs.readdirSync(fora), []);
  });
  await test('POST real guarda sessao/CSRF/Origin/limite/metodo e nao serializa fila privada', async (f) => {
    for (const opts of [{ semSessao: true }, { etapa: 'totp' }, { csrf: true }, { origem: true }, { revogada: true }, { limite: true }]) {
      const h = setup(f, opts), res = await h.request('/api/marketing/pecas/' + h.p.id + '/recusar', h.corpo);
      assert.ok([401, 403, 429].includes(res.statusCode)); assert.ok(!fs.existsSync(h.registro)); assert.ok(fs.existsSync(h.origem));
    }
    const h = setup(f); const put = await h.request('/api/marketing/pecas/' + h.p.id + '/recusar', h.corpo, 'PUT'); assert.equal(put.statusCode, 405);
    h.pedidos.push({ pecaId: '0'.repeat(16), estado: 'novo', textoOriginal: 'CANARIO_PRIVADO', lease: { id: 'CANARIO_LEASE' } });
    const res = await h.request('/api/marketing/pecas/' + h.p.id + '/recusar', h.corpo); assert.equal(res.statusCode, 200);
    assert.ok(h.calls.includes('csrf')); assert.ok(h.calls.includes('marketing')); assert.ok(!JSON.stringify(res.json).includes('CANARIO_'));
  });
  console.log('admin-recusar: ' + grupos + ' grupos; modulos reais, fixtures isoladas');
})().catch((e) => { console.error('admin-recusar FALHOU ' + (e.codigo || e.code || 'assert')); process.exitCode = 1; });
