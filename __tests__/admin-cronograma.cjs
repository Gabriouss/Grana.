'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..'), raizMod = path.join(repo, 'tools/admin-local/marketing');
const mods = new Map(), chamadas = [];
let pedidos = [];
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  vm.runInNewContext(fs.readFileSync(path.join(raizMod, nome), 'utf8'), {
    module: m, exports: m.exports, Buffer, Date, Intl, console, structuredClone,
    process: { pid: process.pid, env: new Proxy({}, { get() { throw new Error('ENV PROIBIDO'); } }) },
    fetch() { chamadas.push('Meta'); throw new Error('REDE PROIBIDA'); },
    require: (id) => {
      if (id === './ajustes-fila.cjs') return { fila: { listar: () => pedidos } };
      if (id.startsWith('./')) return load(id.slice(2));
      if (['fs', 'path', 'crypto', 'node:fs', 'node:path', 'node:crypto'].includes(id)) return require(id);
      throw new Error('IMPORT PROIBIDO ' + id);
    },
  }, { filename: nome });
  return m.exports;
}
const c = load('catalogo.cjs'), cr = load('cronograma.cjs'), ap = load('aprovacoes.cjs');
const cal = load('calendario.cjs'), promo = load('promocao.cjs'), en = load('meta-ensaio.cjs');
let grupos = 0;
async function fixture(fn, padaria = false, nomes = ['E01.jpg']) {
  const base = path.resolve(os.tmpdir()), dir = fs.mkdtempSync(path.join(base, 'grana-cronograma-'));
  const semana = padaria ? 'docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27' : 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11';
  const rel = padaria ? semana + '/para-aprovacao/pecas/reels/grana-reels-v8-pop.mp4' : semana + '/para-aprovacao/pecas/' + nomes[0];
  const media = path.dirname(path.join(dir, rel)); fs.mkdirSync(media, { recursive: true });
  if (padaria) fs.copyFileSync(path.join(repo, rel), path.join(dir, rel));
  else for (const nome of nomes) fs.writeFileSync(path.join(media, nome), 'fixture ' + nome);
  const painel = path.join(dir, 'docs/marketing/painel'); fs.mkdirSync(painel, { recursive: true });
  if (padaria) {
    const real = JSON.parse(fs.readFileSync(path.join(repo, 'docs/marketing/painel/aprovacoes.json'), 'utf8'));
    const aceite = real.aprovacoes.find((a) => a.id === '44f4151757801600' && a.versao === 'bc01c04e92badb8c64de75c15d46eb13e7a920cb');
    assert(aceite); assert.equal(aceite.aprovadoEm, '2026-10-07T10:31:32-03:00');
    const { id, versao, caminho, aprovadoEm, evidencia, escopo } = aceite;
    fs.writeFileSync(path.join(painel, 'aprovacoes.json'), JSON.stringify({ formato: 1, aprovacoes: [{ id, versao, caminho, aprovadoEm, evidencia, escopo }] }));
  }
  const indice = path.join(dir, semana, 'INDICE.md');
  const link = nomes.length > 1 ? 'para-aprovacao/pecas/' : rel.slice(semana.length + 1);
  fs.writeFileSync(indice, '# Semana\n\n| Peça | Cronograma ID |\n| --- | --- |\n| [Peça](' + link + ') | |\n');
  const p = c.montarCatalogo(dir).find((p) => p.tipo !== 'texto'); assert(p);
  const manifesto = { formato: 1, manifestoId: 'campanha-teste', versao: 1, fuso: 'America/Sao_Paulo', diaD: null,
    datasComAviso: [{ data: '2026-10-12', motivo: 'Feriado nacional: Nossa Senhora Aparecida' }],
    itens: [{ id: padaria ? 'reels-widget-padaria' : 'peca-teste', codigo: padaria ? 'R-P' : 'E01',
      dataPrevista: padaria ? { modo: 'diaD', diasUteis: 4 } : { modo: 'diaD', diasUteis: 4, hora: '19:00', canal: 'instagram-feed' } }], removidos: [] };
  const h = { dir, rel, p, indice, painel, manifesto,
    iniciar: async () => { await cr.salvarManifesto(dir, { manifesto, versaoEsperada: 0 }); await cr.registrarVinculo(dir, p.id, { versao: p.versao, versaoEsperada: 1, manifestoId: manifesto.manifestoId, itemId: manifesto.itens[0].id }); },
    aprovar: () => ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: 'APROVAR' }),
    promover: () => promo.promover(dir, p.id, { versao: p.versao, confirmacao: promo.FRASE }),
    declararD: async (diaD = '2026-10-09') => { const m = cr.ler(dir); return cr.salvarManifesto(dir, { manifesto: { ...m, versao: m.versao + 1, diaD }, versaoEsperada: m.versao, confirmacao: 'DECLARAR DIA D' }); },
    raw: () => JSON.parse(fs.readFileSync(path.join(painel, 'calendario.json'), 'utf8')),
  };
  try { await fn(h); } finally { assert.equal(path.dirname(path.resolve(dir)), base); assert(path.basename(dir).startsWith('grana-cronograma-')); fs.rmSync(dir, { recursive: true, force: true }); }
}
async function test(nome, fn, padaria, nomes) { await fixture(fn, padaria, nomes); grupos++; console.log('OK ' + nome); }
(async () => {
  await test('PADARIA aceite real07/10: aguardando D -> D+4 úteis automaticamente, sem fabricar aceite', async (h) => {
    assert.equal(h.p.id, '44f4151757801600'); assert.equal(h.p.versao, 'bc01c04e92badb8c64de75c15d46eb13e7a920cb');
    const aceiteAntes = fs.readFileSync(path.join(h.painel, 'aprovacoes.json'), 'utf8');
    await h.iniciar(); const r = await h.aprovar(); assert.equal(r.jaExistia, true);
    let dto = cal.obterCalendario(h.dir, '2026-10');
    assert.equal(dto.aguardandoDiaD.length, 1); assert.equal(dto.aguardandoDiaD[0].estado, 'aguardando dia D'); assert.equal(dto.aguardandoDiaD[0].data, null);
    assert.equal(dto.itens.length, 0); assert.equal(fs.readFileSync(path.join(h.painel, 'aprovacoes.json'), 'utf8'), aceiteAntes);
    await h.declararD(); dto = cal.obterCalendario(h.dir, '2026-10');
    assert.equal(dto.aguardandoDiaD.length, 0); assert.equal(dto.itens.length, 1); assert.equal(dto.itens[0].data, '2026-10-15');
    assert.equal(dto.itens[0].canal, null); assert.equal(dto.itens[0].hora, null); assert.equal(dto.itens[0].origem.itemId, 'reels-widget-padaria');
    assert(dto.avisos.some((s) => s.includes('horário pendente') && s.includes('canal pendente')));
    const reciboAntes = en.ensaiar(h.dir).itens[0].recibo;
    const promoted = await h.promover(); dto = cal.obterCalendario(h.dir, '2026-10');
    assert.equal(dto.itens.length, 1); assert.equal(dto.itens[0].peca.id, promoted.promocao.id);
    assert.equal(dto.itens[0].data, '2026-10-15'); assert.equal(cr.vinculo(h.dir, c.obterPeca(h.dir, promoted.promocao.id)).itemId, 'reels-widget-padaria');
    assert.equal(h.raw().planejados.filter((r) => r.estado !== 'desatualizado').length, 1);
    const ensaio = en.ensaiar(h.dir); assert.equal(ensaio.itens.length, 1); assert.equal(ensaio.itens[0].recibo, reciboAntes); assert.equal(ensaio.itens[0].evidenciaEm, '2026-10-07T10:31:32-03:00'); assert.equal(ensaio.chamadasMeta, 0);
    assert.equal(ensaio.itens[0].estado, 'bloqueado'); assert(ensaio.itens[0].bloqueios.includes('data-ou-hora-invalida')); assert(ensaio.itens[0].bloqueios.includes('canal-invalido'));
  }, true);
  await test('criar vínculo -> aprovar cria registro automaticamente -> promover -> ensaio', async (h) => {
    await h.iniciar(); assert.equal(h.raw().planejados.length, 0);
    await h.aprovar(); assert.equal(h.raw().planejados.length, 1); assert.equal(h.raw().planejados[0].estado, 'aguardando dia D');
    await h.declararD('2099-01-01'); await h.promover(); const r = en.ensaiar(h.dir); assert.equal(r.itens[0].estado, 'ensaio'); assert.equal(r.realHabilitado, false);
  });
  await test('override manual sobrevive revisão, D e promoção; mostra ambas datas', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD();
    await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-22', hora: '20:00', canal: 'instagram-feed' });
    await h.declararD('2026-10-12'); await h.promover();
    const r = cal.obterCalendario(h.dir, '2026-10').itens[0]; assert.equal(r.data, '2026-10-22'); assert.equal(r.dataPrevista.dataResolvida, '2026-10-16'); assert(r.substituicaoManual);
  });
  await test('D só com confirmação e CAS; fim de semana D+0 e D+4', async (h) => {
    await h.iniciar(); const m = cr.ler(h.dir);
    await assert.rejects(cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 2, diaD: '2026-10-03' }, versaoEsperada: 1 }), (e) => e.codigo === 'confirmacao-dia-d');
    await h.declararD('2026-10-03'); assert.equal(cal.somarDiasUteis('2026-10-03', 0), '2026-10-05'); assert.equal(cal.somarDiasUteis('2026-10-03', 4), '2026-10-09');
    await assert.rejects(cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 2 }, versaoEsperada: 1 }), (e) => e.codigo === 'cronograma-conflito');
    assert.equal(cr.ler(h.dir).recibos.length, 1);
  });
  await test('conteúdo muda: calendário desatualizado e ensaio recusa', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD(); fs.writeFileSync(path.join(h.dir, h.rel), 'nova versão sem aceite');
    const r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens.length, 0); assert.equal(r.desatualizados.length, 1);
    assert(en.ensaiar(h.dir).itens[0].bloqueios.includes('versao-ou-caminho-mudou'));
  });
  await test('item removido mantém aviso e proíbe reciclagem', async (h) => {
    await h.iniciar(); await h.aprovar(); const m = cr.ler(h.dir);
    await cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 2, itens: [], removidos: ['peca-teste'] }, versaoEsperada: 1 });
    const r = cal.obterCalendario(h.dir, '2026-10'); assert(r.avisos.some((s) => s.includes('sem data no cronograma'))); assert.equal(r.itens.length, 0);
    assert.throws(() => cr.validar({ ...m, removidos: ['peca-teste'] }), (e) => e.codigo === 'cronograma-invalido');
    await assert.rejects(cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 3 }, versaoEsperada: 2 }), (e) => e.codigo === 'id-aposentado');
  });
  await test('legado sem vínculo preserva data manual e aviso; nenhum manifesto inventado', async (h) => {
    await h.aprovar(); await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-22', canal: 'stories' });
    await cr.salvarManifesto(h.dir, { manifesto: h.manifesto, versaoEsperada: 0 });
    let r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens[0].data, '2026-10-22'); assert(r.avisos.some((s) => s.includes('vínculo de cronograma pendente')));
    await cr.registrarVinculo(h.dir, h.p.id, { versao: h.p.versao, versaoEsperada: 1, manifestoId: 'campanha-teste', itemId: 'peca-teste' });
    r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens[0].substituicaoManual.data, '2026-10-22');
  });
  await test('carrossel: token de pasta preservado após promoção', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD(); const r = await h.promover();
    assert.equal(cr.vinculo(h.dir, c.obterPeca(h.dir, r.promocao.id)).itemId, 'peca-teste'); assert.equal(cal.obterCalendario(h.dir, '2026-10').itens.length, 1);
  }, false, ['E01-01.jpg', 'E01-02.jpg']);
  await test('validação discrimina modos/data/hora; não fabrica previsões', async (h) => {
    for (const d of [{ modo: 'absoluta', data: '2026-02-31', hora: '19:00', canal: 'reels' }, { modo: 'diaD', diasUteis: 4, data: '2026-10-15', hora: '19:00', canal: 'reels' }, { modo: 'diaD', diasUteis: 4, hora: '9:00', canal: 'reels' }]) assert.throws(() => cr.validar({ ...h.manifesto, itens: [{ id: 'peca-teste', dataPrevista: d }] }));
  });
  await test('token inválido, manifesto ausente e duplicata ativa são avisos visíveis', async (h) => {
    await h.iniciar(); await h.aprovar();
    const original = fs.readFileSync(h.indice, 'utf8');
    fs.writeFileSync(h.indice, original.replace('campanha-teste#peca-teste@1', 'campanha-errada#peca-teste@1'));
    assert(cal.obterCalendario(h.dir, '2026-10').avisos.some((s) => s.includes('vínculo inválido')));
    fs.writeFileSync(h.indice, original); const segunda = path.join(path.dirname(path.join(h.dir, h.rel)), 'outra.jpg'); fs.writeFileSync(segunda, 'segunda peça');
    const outra = c.montarCatalogo(h.dir).find((p) => p.caminho.endsWith('/outra.jpg'));
    fs.appendFileSync(h.indice, '\n| Peça | Cronograma ID |\n| --- | --- |\n| [Outra](para-aprovacao/pecas/outra.jpg) | campanha-teste#peca-teste@1 |\n');
    assert(cal.obterCalendario(h.dir, '2026-10').avisos.some((s) => s.includes('vínculo duplicado')));
    await assert.rejects(cr.registrarVinculo(h.dir, outra.id, { versao: outra.versao, versaoEsperada: 1, manifestoId: 'campanha-teste', itemId: 'peca-teste' }), (e) => e.codigo === 'vinculo-duplicado');
  });
  await test('migração preserva referências legadas e recibo da data manual', async (h) => {
    await h.aprovar(); await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-22', canal: 'stories' });
    const arq = path.join(h.painel, 'calendario.json'), legado = h.raw(); legado.referenciaFunil = [{ codigo: 'R-P', diasUteis: 4 }]; fs.writeFileSync(arq, JSON.stringify(legado));
    await h.iniciar(); assert.equal(h.raw().referenciaFunilLegado[0].codigo, 'R-P'); assert.equal(h.raw().planejados[0].registroLegado.data, '2026-10-22');
  });
  await test('rotas reais: sessão completa/CSRF antes de gravar cronograma; D exige frase', async (h) => {
    const { EventEmitter } = require('node:events'); let etapa = 'totp', csrf = true, escritos = 0;
    const m = { exports: {} }, routesRoot = path.dirname(raizMod);
    vm.runInNewContext(fs.readFileSync(path.join(routesRoot, 'rotas.cjs'), 'utf8'), { module: m, exports: m.exports, __dirname: routesRoot, Buffer, Date, console,
      require: (id) => {
        if (id === 'path') return path;
        if (id === './config.cjs') return { RAIZ_DADOS: h.dir, SIMULAR: false, ocultar: (v) => v };
        if (id === './seguranca.cjs') return { checarApi: () => null, dentroDoLimite: () => true, sessaoDe: () => ({ id: 'fixture', s: { etapa, geracao: 'g' } }), checarCabecalhos: () => csrf ? null : { status: 403, codigo: 'csrf', mensagem: 'CSRF inválido.' } };
        if (id === './autenticacao.cjs') return { situacaoConta: () => ({ estado: 'ok', geracao: 'g' }) };
        if (id === './auditoria.cjs') return { registrar() {} };
        if (id === path.join(raizMod, 'cronograma.cjs')) return { ...cr, salvarManifesto(...a) { escritos++; return cr.salvarManifesto(...a); } };
        throw new Error('IMPORT PROIBIDO ' + id);
      },
    });
    async function post(body) {
      const req = new EventEmitter(); req.method = 'POST'; req.headers = { 'x-grana-admin': '1' }; let status, saida;
      const promise = m.exports.tratarApi(req, { writeHead(s) { status = s; }, end(s) { saida = JSON.parse(s); } }, new URL('http://127.0.0.1:4317/api/marketing/cronograma'));
      req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); await promise; return { status, saida };
    }
    const body = { manifesto: h.manifesto, versaoEsperada: 0 };
    assert.equal((await post(body)).status, 401); assert.equal(escritos, 0);
    etapa = 'ok'; csrf = false; assert.equal((await post(body)).status, 403); assert.equal(escritos, 0);
    csrf = true; assert.equal((await post(body)).status, 200); assert.equal(escritos, 1);
    assert.equal((await post({ manifesto: { ...h.manifesto, versao: 2, diaD: '2026-10-09' }, versaoEsperada: 1 })).status, 409); assert.equal(cr.ler(h.dir).diaD, null);
  });
  await test('índice falha na promoção: origem e vínculo preservados; retomada repara sem duplicar', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD();
    const fn = promo.criarPromocao({ ...fs, readFileSync(abs, ...a) { if (abs === h.indice) throw new Error('DISCO'); return fs.readFileSync(abs, ...a); } }, () => {});
    const r = await fn(h.dir, h.p.id, { versao: h.p.versao, confirmacao: promo.FRASE });
    assert(r.avisos.some((s) => s.includes('índice'))); assert(fs.existsSync(path.join(h.dir, h.rel))); assert.equal(cr.vinculo(h.dir, h.p).itemId, 'peca-teste');
    const again = await h.promover(); assert.equal(again.jaExistia, true); assert(!fs.existsSync(path.join(h.dir, h.rel))); assert.equal(cal.obterCalendario(h.dir, '2026-10').itens.length, 1);
  });
  await test('B1/A1: calendário falha depois de promoção/aceite; resultado confirmado e aviso próprio', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD();
    const save = cr.sincronizar; cr.sincronizar = () => { throw new Error('DETALHE INTERNO'); };
    try {
      const a = await h.aprovar(); assert.equal(a.jaExistia, true); assert(a.avisos.some((s) => s.includes('Aceite preservado; calendário pendente')));
      const r = await h.promover(); assert.equal(r.jaExistia, false); assert(r.avisos.some((s) => s.includes('Promoção registrada; calendário pendente')));
      assert(!fs.existsSync(path.join(h.dir, h.rel))); assert(!JSON.stringify(r).includes('originais foram preservados')); assert(!JSON.stringify(r).includes('DETALHE INTERNO'));
      const novamente = await h.promover(); assert.equal(novamente.jaExistia, true); assert(novamente.avisos.some((s) => s.includes('calendário pendente')));
      assert.equal(JSON.parse(fs.readFileSync(path.join(h.painel, 'aprovacoes.json'), 'utf8')).aprovacoes.length, 2);
    } finally { cr.sincronizar = save; }
  });
  await test('A2: manifesto inválido suspende previsões, preserva operacional e permite planejar com recibo', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD();
    const antes = h.raw(), arq = path.join(h.painel, 'cronograma.json'); fs.writeFileSync(arq, '{quebrado');
    const r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens.length, 0); assert.equal(r.suspensos.length, 1); assert(r.avisos.some((s) => s.includes('previsões suspensas')));
    assert.equal(h.raw().planejados[0].data, antes.planejados[0].data); assert(en.ensaiar(h.dir).itens[0].bloqueios.includes('cronograma-nao-resolvido'));
    const manual = await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-23', canal: 'stories' });
    assert(manual.avisos.some((s) => s.includes('calendário pendente'))); assert.equal(h.raw().planejados[0].substituicaoManual.data, '2026-10-23');
  });
  await test('datasComAviso versionadas: feriado avisa sem bloquear cálculo; valores inválidos recusados', async (h) => {
    await h.iniciar(); await h.aprovar(); const m = cr.ler(h.dir); m.versao = 2; m.diaD = '2026-10-06';
    await cr.salvarManifesto(h.dir, { manifesto: m, versaoEsperada: 1, confirmacao: 'DECLARAR DIA D' });
    const r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens[0].data, '2026-10-12'); assert(r.avisos.some((s) => s.includes('Feriado nacional')));
    assert.throws(() => cr.validar({ ...m, datasComAviso: [{ data: '2026-02-31', motivo: 'aviso' }] }));
  });
  await test('pedido aberto bloqueia promoção sem alterar fila/caminho; terminal não bloqueia', async (h) => {
    await h.iniciar(); await h.aprovar(); pedidos = [{ pecaId: h.p.id, versaoAlvo: h.p.versao, estado: 'novo' }];
    try {
      await assert.rejects(h.promover(), (e) => e.codigo === 'ajuste-aberto'); assert(fs.existsSync(path.join(h.dir, h.rel))); assert.equal(pedidos[0].estado, 'novo');
      pedidos[0].estado = 'aceito'; await h.promover(); assert(!fs.existsSync(path.join(h.dir, h.rel))); assert.equal(pedidos[0].estado, 'aceito');
    } finally { pedidos = []; }
  });
  await test('recibo real de primeira entrada é persistido uma vez; GET e promoção não inventam outro', async (h) => {
    await h.iniciar(); await h.aprovar();
    const arq = path.join(h.painel, 'calendario.json'), antes = fs.readFileSync(arq, 'utf8');
    let r = cal.obterCalendario(h.dir, '2026-10').aguardandoDiaD[0];
    assert.equal(r.recibo.tipo, 'entrada-automatica'); assert(r.recibo.id); assert(Number.isFinite(Date.parse(r.recibo.em))); assert.equal(r.recibos.length, 1);
    assert.equal(r.reciboAceite.tipo, 'aceite-autor'); assert.equal(r.reciboAceite.versaoPeca, r.peca.versao);
    const aceiteOriginal = JSON.stringify(r.reciboAceite);
    assert.ok(!antes.includes('aceite-autor'), 'recibo do aceite nao e gravado no calendario');
    const id = r.recibo.id; cal.obterCalendario(h.dir, '2026-10'); assert.equal(fs.readFileSync(arq, 'utf8'), antes);
    await h.aprovar(); await h.declararD(); await h.promover(); r = cal.obterCalendario(h.dir, '2026-10').itens[0];
    assert.equal(r.recibo.id, id); assert.equal(r.recibos.filter((v) => v.tipo === 'entrada-automatica').length, 1);
    assert.equal(JSON.stringify(r.reciboAceite), aceiteOriginal, 'promocao espelha registro exato sem novo aceite');
    await cal.planejar(h.dir, { id: r.peca.id, versao: r.peca.versao, data: '2026-10-22', hora: '20:00', canal: 'stories' });
    r = cal.obterCalendario(h.dir, '2026-10').itens[0]; assert.equal(r.previsaoResolvida.data, '2026-10-15'); assert.equal(r.data, '2026-10-22'); assert.equal(r.previsaoResolvida.canal, 'instagram-feed'); assert.equal(r.canal, 'stories'); assert.equal(r.recibo.id, id);
  });
  assert.deepEqual(chamadas, []); console.log(`admin-cronograma: ${grupos} grupos passaram, módulos reais, zero rede/Meta`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
