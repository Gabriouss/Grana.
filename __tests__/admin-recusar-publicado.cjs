'use strict';
// 19/10, autor: "por que porra eu não consigo reprovar um reels que já foi publicado?". A 1ª recusa do
// "Fala o gasto, pronto" deu 200, mas a peça voltou à Aprovação: a versão gravada na recusa (sem a capa
// pareada) não batia com a de depois, e a 2ª tentativa caiu num 409 genérico. Módulos reais, fixture isolada.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { harness, fixture } = require('./admin-familia.cjs');
let grupos = 0;
async function test(nome, fn, nomes) { await fixture(async (f) => { await fn(f); grupos++; console.log('OK ' + nome); }, nomes); }
const REEL = ['reel.mp4', 'reel-capa.png'];
function setup(f) {
  const h = harness(f.dir), hist = h.load('historico.cjs');
  const cat = h.catalogo.montarCatalogo(f.dir), reel = cat.find((p) => p.nome === 'reel.mp4'), capa = cat.find((p) => p.nome === 'reel-capa.png');
  assert.equal(capa.capaDe, reel.id, 'fixture: capa pareada por nome');
  return { ...h, hist, reel, capa, corpo: { versao: reel.versao, motivo: 'Reels já publicado', confirmacao: true } };
}
const viva = (h, f, caminho) => h.catalogo.listarPecas(f.dir).pecas.find((p) => p.caminho === caminho);
const noHistorico = (rel) => rel.replace('/para-aprovacao/', '/historico/');

(async () => {
  await test('recusar o Reel leva a capa junto e nenhum dos dois volta a ser acionável', async (f) => {
    const h = setup(f);
    const r = await h.hist.recusar(f.dir, h.reel.id, h.corpo);
    assert.equal(r.capas.length, 1);
    assert.ok(r.avisos.some((a) => /capa reel-capa\.png foi junto/.test(a)));
    for (const rel of [h.reel.caminho, h.capa.caminho]) {
      assert.ok(!fs.existsSync(path.join(f.dir, rel)), 'origem removida: ' + rel);
      const p = viva(h, f, noHistorico(rel));
      assert.equal(p.estadoEfetivo, 'historico'); assert.equal(p.recusada, true); assert.ok(p.recusa?.recusadoEm);
    }
    const registro = JSON.parse(fs.readFileSync(path.join(f.painel, 'historico.json'), 'utf8')).recusas;
    assert.equal(registro.length, 2);
    assert.ok(fs.readFileSync(f.indice, 'utf8').includes('<!-- recusa:' + h.capa.id));
  }, REEL);

  await test('versão gravada diferente da atual (capa pareada) ainda reconhece a recusa pelos bytes', async (f) => {
    const h = setup(f);
    const r = await h.hist.recusar(f.dir, h.reel.id, h.corpo);
    const arq = path.join(f.painel, 'historico.json'), dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
    // Reproduz o registro real de 19/10: versão do Reel gravada no meio da mudança.
    dados.recusas.find((x) => x.id === r.recusa.id).versao = 'f'.repeat(40);
    fs.writeFileSync(arq, JSON.stringify(dados));
    const p = viva(h, f, r.recusa.caminho);
    assert.equal(p.recusada, true); assert.equal(p.estadoEfetivo, 'historico');
    assert.equal(p.recusa.motivo, 'Reels já publicado');
  }, REEL);

  await test('segunda tentativa sobre a peça já no histórico diz que não há nada a fazer, com a hora', async (f) => {
    const h = setup(f);
    const r = await h.hist.recusar(f.dir, h.reel.id, h.corpo);
    const nova = viva(h, f, r.recusa.caminho);
    await assert.rejects(h.hist.recusar(f.dir, nova.id, { ...h.corpo, versao: nova.versao }), (e) => e.codigo === 'pasta-invalida' && e.status === 409
      && /^Esta peça já está no histórico \(recusada às \d{2}:\d{2}\)\. Não há nada a fazer\.$/.test(e.message));
  }, REEL);

  await test('capa com pedido aberto fica onde estava, com aviso, e o Reel é recusado mesmo assim', async (f) => {
    const h = setup(f);
    h.pedidos.push({ pecaId: h.capa.id, estado: 'novo' });
    const r = await h.hist.recusar(f.dir, h.reel.id, h.corpo);
    assert.equal(r.capas.length, 0);
    assert.ok(r.avisos.some((a) => /capa reel-capa\.png ficou onde estava \(ajuste-aberto\)/.test(a)));
    assert.ok(fs.existsSync(path.join(f.dir, h.capa.caminho)));
    assert.equal(viva(h, f, r.recusa.caminho).estadoEfetivo, 'historico');
  }, REEL);

  await test('peça publicada na Meta: o painel sabe antes e o vínculo do post segue a peça até o histórico', async (f) => {
    const h = setup(f);
    const link = 'https://www.instagram.com/reel/FICTICIO/';
    fs.writeFileSync(path.join(f.painel, 'publicados.json'), JSON.stringify({ vinculos: [
      { link, peca: h.reel.caminho, evidencia: 'fixture' },
      { link: 'https://www.facebook.com/reel/1/', peca: h.reel.caminho, evidencia: 'fixture' }] }));
    assert.deepEqual([...viva(h, f, h.reel.caminho).publicadaEm], ['Instagram', 'Facebook']);
    assert.deepEqual([...viva(h, f, h.capa.caminho).publicadaEm], []);
    const r = await h.hist.recusar(f.dir, h.reel.id, h.corpo);
    const pecas = h.catalogo.listarPecas(f.dir).pecas;
    assert.deepEqual([...pecas.find((p) => p.id === r.recusa.id).publicadaEm], ['Instagram', 'Facebook']);
    const registro = new Map([[link, h.reel.caminho]]);
    const { vincular } = require('../tools/admin-local/marketing/meta-publicados.cjs');
    const [post] = vincular([{ link, rede: 'instagram', legendaCompleta: 'x' }], pecas, registro);
    assert.equal(post.vinculo?.pecaId, r.recusa.id, 'Calendário continua mostrando o post como Publicado');
  }, REEL);

  // Tela real (aprovacao.js): aviso antes de confirmar e frase humana no erro.
  const n = (tag, attrs = {}, ...children) => ({ tag, attrs: attrs || {}, children });
  function carregarTela(ctx) {
    const sandbox = { ctx, console: { warn() {} } };
    for (const arquivo of ['_legenda-publicacao.js', '_pecas.js', 'ajustes.js', 'aprovacao.js']) {
      const fonte = fs.readFileSync(path.join(__dirname, '../tools/admin-local/web/telas', arquivo), 'utf8');
      const nomes = [...fonte.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
      vm.runInNewContext('(function(){' + fonte.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '\n;Object.assign(globalThis,{' + nomes.join(',') + '});})()', sandbox);
    }
    return sandbox;
  }
  function ctxFalso(erro) {
    const s = { confirmacoes: [], avisos: [], recargas: 0, chamadas: [] };
    s.ctx = { h: n, obsoleta: () => false, formulario: async () => ({ motivo: 'Reels já publicado', sucessora: '' }),
      confirmar: async (o) => { s.confirmacoes.push(o); return true; }, aviso: (t, tipo) => s.avisos.push([t, tipo]),
      recarregar: () => { s.recargas++; },
      acao: async (url, corpo) => { s.chamadas.push({ url, corpo }); if (erro) throw Object.assign(new Error(erro.mensagem), { codigo: erro.codigo }); return { dados: { avisos: ['A capa reel-capa.png foi junto para o histórico.'] } }; } };
    return s;
  }
  {
    const s = ctxFalso(), tela = carregarTela(s.ctx);
    const reel = { id: 'a'.repeat(16), versao: 'b'.repeat(40), estado: 'aprovados', tipo: 'video', titulo: 'Fala o gasto', caminho: 'x/reel.mp4', publicadaEm: ['Instagram', 'Facebook'] };
    const capa = { id: 'c'.repeat(16), versao: 'd'.repeat(40), estado: 'aprovados', tipo: 'imagem', titulo: 'Capa', caminho: 'x/reel-capa.png', capaDe: reel.id };
    Object.assign(tela, { reel, familia: [reel, capa], botao: { disabled: false } });
    await vm.runInNewContext('recusarPeca(ctx, reel, familia, [], botao)', tela);
    const c = s.confirmacoes[0];
    assert.match(c.texto, /^Isto só tira a peça do painel\. O post continua no Instagram e no Facebook; apagar lá é no app da Meta\./);
    assert.ok(c.detalhes.some((d) => /capa .* vai junto para o histórico/.test(d)));
    assert.equal(s.chamadas.length, 1); assert.equal(s.recargas, 1, 'some da tela na hora');
    assert.ok(s.avisos.some(([t]) => /foi junto/.test(t)));
    grupos++; console.log('OK tela: aviso de publicado e capa junto antes de confirmar; recarrega depois');
  }
  {
    const s = ctxFalso({ codigo: 'pasta-invalida', mensagem: 'Esta peça já está no histórico (recusada às 00:21). Não há nada a fazer.' }), tela = carregarTela(s.ctx);
    const p = { id: 'a'.repeat(16), versao: 'b'.repeat(40), estado: 'aprovados', tipo: 'video', titulo: 'Fala o gasto', caminho: 'x/reel.mp4' };
    Object.assign(tela, { p, familia: [p], botao: { disabled: false } });
    await vm.runInNewContext('recusarPeca(ctx, p, familia, [], botao)', tela);
    assert.deepEqual(s.avisos, [['Esta peça já está no histórico (recusada às 00:21). Não há nada a fazer.', 'info']]);
    assert.equal(s.recargas, 1, 'a tela se atualiza');
    assert.equal(s.confirmacoes[0].texto.startsWith('Isto só tira'), false, 'sem vínculo publicado, sem aviso da Meta');
    grupos++; console.log('OK tela: "já está no histórico" com a hora e atualização');
  }
  {
    const s = ctxFalso({ codigo: 'ajuste-aberto', mensagem: 'x' }), tela = carregarTela(s.ctx);
    const p = { id: 'a'.repeat(16), versao: 'b'.repeat(40), estado: 'aprovados', tipo: 'video', titulo: 'T', caminho: 'x/r.mp4' };
    Object.assign(tela, { p, familia: [p], botao: { disabled: false } });
    await vm.runInNewContext('recusarPeca(ctx, p, familia, [], botao)', tela);
    assert.match(s.avisos[0][0], /pedido de ajuste aberto/); assert.equal(s.avisos[0][1], 'erro'); assert.equal(s.recargas, 0);
    grupos++; console.log('OK tela: cada código vira frase com causa e ação');
  }
  console.log(`admin-recusar-publicado: ${grupos} grupos; módulos reais, fixture isolada, zero rede`);
})().catch((e) => { console.error(e); process.exit(1); });
