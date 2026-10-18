'use strict';
// Ciclos de família apontados pelo Harbor em 14/10 (H-01, H-02, H-03), módulos reais em VM:
// - H-01: retomar a promoção de uma revisão já superada dá 409 e não grava nada, também com
//   o índice pendente;
// - H-02: recusar a vigente prevalece sobre o registro; recusar -> reler -> aprovar/planejar
//   dá 409 sem escrita;
// - H-03: pedido de ajuste anterior à supersessão (local ou importado da web) não é entregue,
//   não gasta custo e não é concluído; vira 'desatualizado' com recibo 'revisao-superada'.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../tools/admin-local/marketing');
const rede = [];
const mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  vm.runInNewContext(fs.readFileSync(path.join(root, nome), 'utf8'), {
    module: m, exports: m.exports, Buffer, Date, Intl, console, structuredClone, __dirname: root,
    process: { pid: process.pid, env: new Proxy({}, { get() { throw new Error('ENV PROIBIDO'); } }) },
    fetch() { rede.push('fetch'); throw new Error('META PROIBIDA'); },
    require: (id) => {
      if (id === './ajustes-fila.cjs') return { fila: { listar: () => [] } };
      if (id.startsWith('./')) return load(id.slice(2));
      if (['fs', 'path', 'crypto', 'node:fs', 'node:path', 'node:crypto', 'node:os'].includes(id)) return require(id);
      throw new Error('IMPORT PROIBIDO ' + id);
    },
  }, { filename: nome });
  return m.exports;
}
const c = load('catalogo.cjs'), ap = load('aprovacoes.cjs'), promo = load('promocao.cjs');
const hist = load('historico.cjs'), cal = load('calendario.cjs');

function fotografia(dir) {
  const mapa = new Map();
  const varrer = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name); if (e.isDirectory()) varrer(f); else mapa.set(f, fs.readFileSync(f).toString('base64'));
  } };
  varrer(dir); return mapa;
}
async function recusaSemEscrita(dir, acao, codigo, rotulo) {
  const antes = fotografia(dir);
  await assert.rejects(async () => acao(), (e) => e.codigo === codigo, rotulo);
  const depois = fotografia(dir);
  assert.deepEqual([...depois.keys()].sort(), [...antes.keys()].sort(), `${rotulo}: nenhum arquivo criado ou apagado`);
  for (const [f, b] of antes) assert.equal(depois.get(f), b, `${rotulo}: ${path.basename(f)} não mudou`);
}
async function fixture(fn) {
  const tmpRoot = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'grana-ciclos-'));
  const semana = 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11';
  const media = path.join(dir, semana, 'para-aprovacao/pecas'); fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(media, 'E01.jpg'), 'AUDIT revisao 1');
  fs.writeFileSync(path.join(media, 'E02.jpg'), 'AUDIT revisao 2');
  fs.writeFileSync(path.join(dir, semana, 'INDICE.md'), '# Semana\n\n[Peça](para-aprovacao/pecas/E01.jpg)\n');
  const pastaPainel = path.join(dir, 'docs/marketing/painel'); fs.mkdirSync(pastaPainel, { recursive: true });
  fs.writeFileSync(path.join(pastaPainel, 'calendario.json'), JSON.stringify({ diaD: '2099-01-01', planejados: [] }));
  const familia = (vigente) => fs.writeFileSync(path.join(pastaPainel, 'familias.json'), JSON.stringify({ familias: [{ id: 'AUDIT', nome: 'Família AUDIT',
    revisoes: [{ caminho: `${semana}/para-aprovacao/pecas/E01.jpg` }, { caminho: `${semana}/para-aprovacao/pecas/E02.jpg` }],
    vigente: `${semana}/para-aprovacao/pecas/${vigente}` }], capas: [] }));
  familia('E01.jpg');
  fs.writeFileSync(path.join(dir, semana, 'para-aprovacao/pecas/COPYS-FINAIS.md'), '## E01 - Fixture\n\n**Legenda:** Texto de publicacao E01.\n\n## E02 - Fixture\n\n**Legenda:** Texto de publicacao E02.\n');
  const p = c.montarCatalogo(dir).find((x) => x.caminho.endsWith('E01.jpg'));
  const h = { dir, semana, media, p, familia, apPath: path.join(pastaPainel, 'aprovacoes.json'),
    aprovar: () => ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: true }),
    promover: () => promo.promover(dir, p.id, { versao: p.versao, confirmacao: true }) };
  try { await fn(h); }
  finally {
    assert.equal(path.dirname(path.resolve(dir)), tmpRoot); assert(path.basename(dir).startsWith('grana-ciclos-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function filaReal() {
  const file = path.join(root, 'ajustes-fila.cjs'), m = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module: m, exports: m.exports, structuredClone, Date, setTimeout, setInterval, clearInterval, console,
    process: { pid: 99999, env: { APPDATA: 'X:/AUDIT-NAO-EXISTE' } },
    require: (id) => id === '../config.cjs' ? { RAIZ: 'X:/AUDIT', RAIZ_DADOS: 'X:/AUDIT', tem: () => false, ler: () => undefined }
      : id === 'child_process' ? { execFile() { throw Error('PROCESSO PROIBIDO'); } }
      : id === './ajustes-remoto.cjs' ? { remotoDoEnv: () => ({ remoto: null, ausente: null }) } : id === './legenda-publicacao.cjs' ? require('../tools/admin-local/marketing/legenda-publicacao.cjs') : require(id),
  }, { filename: file });
  return m.exports.criarFila;
}

(async () => {
  // H-01: promoção concluída, depois supersessão; retomar a promoção da revisão antiga.
  await fixture(async (h) => {
    await h.aprovar(); const r = await h.promover();
    h.familia('E02.jpg');
    assert.equal(c.obterPeca(h.dir, r.promocao.id).estadoEfetivo, 'superada');
    await recusaSemEscrita(h.dir, () => h.promover(), 'revisao-superada', 'H-01 retomar promoção concluída de revisão superada');
  });
  // H-01 com índice pendente: a retomada escreveria INDICE, aprovacoes.json e limparia a origem.
  await fixture(async (h) => {
    await h.aprovar(); await h.promover();
    const dados = JSON.parse(fs.readFileSync(h.apPath, 'utf8'));
    const reg = dados.aprovacoes.find((a) => a.origem?.id === h.p.id); reg.indice = null;
    fs.writeFileSync(h.apPath, JSON.stringify(dados));
    h.familia('E02.jpg');
    await recusaSemEscrita(h.dir, () => h.promover(), 'revisao-superada', 'H-01 retomar promoção com índice pendente de revisão superada');
  });
  console.log('OK H-01 retomada da promoção recusa revisão superada antes de índice, limpeza e calendário');

  // H-02: a vigente recusada não volta a ser acionável.
  await fixture(async (h) => {
    const r = await hist.recusar(h.dir, h.p.id, { versao: h.p.versao, motivo: 'AUDIT recusa da vigente', confirmacao: true });
    const recusada = c.obterPeca(h.dir, r.recusa.id);
    assert.equal(recusada.estado, 'historico'); assert.equal(recusada.revisao.vigente, true);
    assert.equal(recusada.recusada, true); assert.equal(recusada.aprovada, false); assert.equal(recusada.estadoEfetivo, 'historico');
    assert.ok(!c.listarPecas(h.dir).pecas.some((x) => x.id === recusada.id && x.estadoEfetivo === 'aguardando-aceite'), 'fora da fila acionável');
    await recusaSemEscrita(h.dir, () => ap.aprovar(h.dir, recusada.id, { versao: recusada.versao, confirmacao: true }), 'revisao-recusada', 'H-02 aprovar a vigente recusada');
    await recusaSemEscrita(h.dir, () => cal.planejar(h.dir, { id: recusada.id, versao: recusada.versao, data: '2026-10-20', canal: 'instagram-feed' }), 'revisao-recusada', 'H-02 planejar a vigente recusada');
    // Aceite antigo da mesma versão gravado à mão não ressuscita a recusada.
    fs.writeFileSync(h.apPath, JSON.stringify({ aprovacoes: [{ id: recusada.id, caminho: recusada.caminho, versao: recusada.versao, aprovadoEm: '2026-10-13T10:00:00-03:00', evidencia: 'aceite pelo autor no painel local' }], ajustes: [] }));
    const comAceite = c.obterPeca(h.dir, recusada.id);
    assert.equal(comAceite.aprovada, false); assert.equal(comAceite.aceite, null);
    assert.ok(!c.feed(h.dir).pecas.some((x) => x.id === recusada.id), 'recusada fora do feed mesmo com aceite');
  });
  // H-02b (W-A4): limpeza da origem falhou e a origem ficou com os mesmos bytes. Ela também é recusada.
  await fixture(async (h) => {
    await hist.recusar(h.dir, h.p.id, { versao: h.p.versao, motivo: 'AUDIT recusa da vigente', confirmacao: true });
    fs.writeFileSync(path.join(h.media, 'E01.jpg'), 'AUDIT revisao 1'); // origem preservada
    const origem = c.obterPeca(h.dir, h.p.id);
    assert.equal(origem.estado, 'para-aprovacao'); assert.equal(origem.recusada, true); assert.equal(origem.aprovada, false);
    assert.equal(origem.estadoEfetivo, 'historico', 'origem preservada sai da fila acionável');
    await recusaSemEscrita(h.dir, () => ap.aprovar(h.dir, origem.id, { versao: origem.versao, confirmacao: true }), 'revisao-recusada', 'H-02b aprovar a origem preservada');
    await recusaSemEscrita(h.dir, () => cal.planejar(h.dir, { id: origem.id, versao: origem.versao, data: '2026-10-20', canal: 'instagram-feed' }), 'revisao-recusada', 'H-02b planejar a origem preservada');
    await recusaSemEscrita(h.dir, () => promo.promover(h.dir, origem.id, { versao: origem.versao, confirmacao: true }), 'revisao-recusada', 'H-02b promover a origem preservada');
    // Bytes novos no mesmo caminho são outra versão e não herdam a recusa.
    fs.writeFileSync(path.join(h.media, 'E01.jpg'), 'AUDIT revisao 1 corrigida');
    assert.equal(c.obterPeca(h.dir, h.p.id).recusada, false);
  });
  // H-02c (Harbor, 14/10): a recusa prende a VERSÃO da origem. Matriz R1-R9 em cada falha (índice e
  // limpeza): versão nova só por legenda, mesmo id e mesmos bytes, pede decisão nova e aceita.
  const copy = (h, txt) => fs.writeFileSync(path.join(h.media, 'COPYS-FINAIS.md'), '## E01 · AUDIT legenda\n\n**Legenda:** ' + txt + '\n');
  for (const falha of ['cleanup', 'indice']) {
    await fixture(async (h) => {
      copy(h, 'AUDIT legenda antiga');
      const antiga = c.obterPeca(h.dir, h.p.id); assert.equal(antiga.legenda, 'AUDIT legenda antiga');
      await ap.aprovar(h.dir, antiga.id, { versao: antiga.versao, confirmacao: true });
      const origemArq = path.join(h.media, 'E01.jpg'), indiceArq = path.join(h.dir, h.semana, 'INDICE.md');
      const io = { ...fs,
        unlinkSync(x) { if (falha === 'cleanup' && x === origemArq) throw Error('AUDIT cleanup'); return fs.unlinkSync(x); },
        renameSync(de, para) { if (falha === 'indice' && para === indiceArq) throw Error('AUDIT indice'); return fs.renameSync(de, para); } };
      const r = await hist.criarHistorico(io, () => {})(h.dir, antiga.id, { versao: antiga.versao, motivo: 'AUDIT recusa legenda antiga', confirmacao: true });
      // R1: recusa persistida com a versão da origem, origem preservada.
      assert.ok(fs.existsSync(origemArq), `${falha}: origem preservada`); assert.equal(r.recusa.origem.versao, antiga.versao);
      // R2/R3: mesma versão recusada na origem e no destino, sem efeito.
      assert.equal(c.obterPeca(h.dir, antiga.id).recusada, true);
      await recusaSemEscrita(h.dir, () => ap.aprovar(h.dir, antiga.id, { versao: antiga.versao, confirmacao: true }), 'revisao-recusada', `${falha} R2 origem`);
      await recusaSemEscrita(h.dir, () => ap.aprovar(h.dir, r.recusa.id, { versao: r.recusa.versao, confirmacao: true }), 'revisao-recusada', `${falha} R2 destino`);
      await recusaSemEscrita(h.dir, () => cal.planejar(h.dir, { id: antiga.id, versao: antiga.versao, data: '2026-10-20', canal: 'instagram-feed' }), 'revisao-recusada', `${falha} R3 planejar`);
      await recusaSemEscrita(h.dir, () => promo.promover(h.dir, antiga.id, { versao: antiga.versao, confirmacao: true }), 'revisao-recusada', `${falha} R3 promover`);
      // R4: só a legenda muda.
      copy(h, 'AUDIT legenda NOVA');
      const nova = c.obterPeca(h.dir, antiga.id);
      assert.equal(nova.id, antiga.id); assert.notEqual(nova.versao, antiga.versao);
      assert.deepEqual(nova.arquivos.map((x) => x.sha1), antiga.arquivos.map((x) => x.sha1));
      // R5: versão antiga na tela não grava.
      await recusaSemEscrita(h.dir, () => ap.aprovar(h.dir, antiga.id, { versao: antiga.versao, confirmacao: true }), 'versao-mudou', `${falha} R5 stale`);
      // R6: versão nova sem recusa nem aceite herdados; aceite explícito grava a prova dela.
      assert.equal(nova.recusada, false); assert.equal(nova.aprovada, false); assert.equal(nova.aceite, null); assert.equal(nova.estadoEfetivo, 'aguardando-aceite');
      const ok = await ap.aprovar(h.dir, nova.id, { versao: nova.versao, confirmacao: true });
      assert.equal(ok.aprovacao.versao, nova.versao); assert.equal(c.obterPeca(h.dir, nova.id).aprovada, true);
      assert.ok(JSON.parse(fs.readFileSync(path.join(h.dir, 'docs/marketing/painel/historico.json'), 'utf8')).recusas.some((x) => x.origem.versao === antiga.versao), 'recusa anterior preservada');
      // R7: voltar à legenda antiga não reabilita o pacote recusado.
      copy(h, 'AUDIT legenda antiga');
      const deNovo = c.obterPeca(h.dir, antiga.id); assert.equal(deNovo.versao, antiga.versao); assert.equal(deNovo.recusada, true); assert.equal(deNovo.aprovada, false);
      await recusaSemEscrita(h.dir, () => ap.aprovar(h.dir, antiga.id, { versao: antiga.versao, confirmacao: true }), 'revisao-recusada', `${falha} R7`);
      // R9: bytes novos no caminho são outra versão e não herdam a recusa.
      fs.writeFileSync(origemArq, 'AUDIT revisao 1 refeita');
      assert.equal(c.obterPeca(h.dir, antiga.id).recusada, false);
    });
  }
  // R8: controle sem recusa anterior.
  await fixture(async (h) => {
    copy(h, 'AUDIT legenda antiga'); const p = c.obterPeca(h.dir, h.p.id);
    copy(h, 'AUDIT legenda NOVA'); const n = c.obterPeca(h.dir, h.p.id);
    assert.notEqual(n.versao, p.versao); assert.equal(n.recusada, false);
    assert.ok((await ap.aprovar(h.dir, n.id, { versao: n.versao, confirmacao: true })).aprovacao);
  });
  // R11: Reel com capa do registro. A recusa prende a versão composta da origem; trocar só a capa
  // cria versão nova, sem recusa e sem o aceite composto antigo.
  {
    const tmpRoot = path.resolve(os.tmpdir()), dir = fs.mkdtempSync(path.join(tmpRoot, 'grana-ciclos-'));
    try {
      const semana = 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11';
      const reelRel = `${semana}/para-aprovacao/pecas/reels/R01-audit-reel.mp4`, capaRel = `${semana}/aprovados/audit-reel-capa-1080x1920.png`;
      for (const [rel, txt] of [[reelRel, 'AUDIT-reel'], [capaRel, 'AUDIT-capa'], [`${semana}/INDICE.md`, '# AUDIT\n'], ['docs/marketing/painel/calendario.json', '{"planejados":[]}']]) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), txt);
      }
      fs.writeFileSync(path.join(dir, semana, 'para-aprovacao/pecas/COPYS-FINAIS.md'), '## R01 - Fixture\n\n**Legenda:** Texto do Reel.\n');
      fs.writeFileSync(path.join(dir, 'docs/marketing/painel/familias.json'), JSON.stringify({ familias: [{ id: 'R', nome: 'Reel AUDIT', revisoes: [{ caminho: reelRel }], vigente: reelRel }], capas: [{ capa: capaRel, reel: reelRel }] }));
      const reel = c.montarCatalogo(dir).find((x) => x.caminho === reelRel);
      assert.ok(reel.composicao, 'Reel composto');
      await ap.aprovar(dir, reel.id, { versao: reel.versao, confirmacao: true });
      const origemArq = path.join(dir, reelRel);
      const io = { ...fs, unlinkSync(x) { if (x === origemArq) throw Error('AUDIT cleanup'); return fs.unlinkSync(x); } };
      const r = await hist.criarHistorico(io, () => {})(dir, reel.id, { versao: reel.versao, motivo: 'AUDIT recusa Reel', confirmacao: true });
      assert.ok(fs.existsSync(origemArq)); assert.equal(r.recusa.origem.versao, reel.versao);
      assert.equal(c.obterPeca(dir, reel.id).recusada, true, 'Reel de origem com a mesma composição: recusado');
      await recusaSemEscrita(dir, () => ap.aprovar(dir, reel.id, { versao: reel.versao, confirmacao: true }), 'revisao-recusada', 'R11 Reel mesma composição');
      fs.writeFileSync(path.join(dir, capaRel), 'AUDIT-capa-nova');
      const novo = c.obterPeca(dir, reel.id);
      assert.notEqual(novo.versao, reel.versao); assert.equal(novo.recusada, false); assert.equal(novo.aprovada, false, 'aceite composto antigo não vale para a capa nova');
    } finally { assert.equal(path.dirname(path.resolve(dir)), tmpRoot); fs.rmSync(dir, { recursive: true, force: true }); }
  }
  console.log('OK H-02c recusa prende a versão da origem: R1-R9 em falha de índice e de limpeza, R8 controle, R11 Reel composto');
  console.log('OK H-02 recusa da vigente prevalece: reler -> aprovar/planejar 409 sem escrita; aceite antigo não reabre');

  // H-03: fila real, dependências sintéticas em memória.
  const criarFila = await filaReal();
  const montar = (peca, remoto = null) => {
    let seq = 0; const db = { formato: 1, pedidos: [], eventos: [] }, calls = [];
    const deps = { agora: () => '2026-10-14T08:00:00Z', id: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, ler: () => structuredClone(db),
      transacao: async (fn) => { const snap = structuredClone(db); const r = fn(snap); Object.assign(db, snap); return structuredClone(r); },
      obterPeca: () => structuredClone(peca), verificarCommit: async () => { calls.push('verificarCommit'); },
      entregar: async () => { calls.push('entregar'); }, log: (x) => calls.push(x), remoto };
    return { fila: criarFila(deps), db, calls };
  };
  const base = () => ({ id: 'a'.repeat(16), caminho: 'docs/marketing/AUDIT/para-aprovacao/peca.png', versao: 'b'.repeat(40), estado: 'para-aprovacao' });
  for (const [rotulo, marcar] of [['superada', (p) => { p.revisao = { superada: true, vigente: false }; p.estadoEfetivo = 'superada'; }], ['recusada', (p) => { p.recusada = true; }]]) {
    const p = base(), { fila, db, calls } = montar(p);
    await fila.solicitar(p, { versao: p.versao, motivo: 'AUDIT pedido antes da supersessão' });
    marcar(p);
    await fila.tick({ receber: false });
    assert.ok(!calls.includes('entregar'), `H-03 ${rotulo}: não entrega`);
    assert.equal(db.pedidos[0].estado, 'desatualizado'); assert.equal(db.eventos.at(-1).codigo, 'revisao-superada');
    assert.ok(calls.includes('ajuste-revisao-superada'));
  }
  // Pedido já em correção quando a revisão é superada: não conclui, não estima, não gasta.
  {
    const p = base(), { fila, db, calls } = montar(p);
    await fila.solicitar(p, { versao: p.versao, motivo: 'AUDIT' });
    await fila.tick({ receber: false }); assert.deepEqual(calls, ['entregar']);
    const r = db.pedidos[0]; assert.equal(r.estado, 'em-correcao');
    p.revisao = { superada: true, vigente: false }; p.estadoEfetivo = 'superada';
    const antes = JSON.stringify(db);
    await assert.rejects(fila.marcar(r.id, r.lease.id, 'corrigido-aguardando-aceite', { pecaId: p.id, versao: p.versao, commit: 'c'.repeat(40) }), (e) => e.codigo === 'revisao-superada');
    await assert.rejects(fila.marcar(r.id, r.lease.id, 'aguardando-aprovacao-de-custo', { pecaId: p.id, estimativa: { ferramenta: 'AUDIT', gerado: 'AUDIT', creditos: 1, valorReais: 0.05, cotacao: 5, motivoNaoLocal: 'AUDIT' } }), (e) => e.codigo === 'revisao-superada');
    await assert.rejects(fila.consumirAutorizacaoCusto(r.id, r.lease.id), (e) => ['revisao-superada', 'custo-nao-autorizado'].includes(e.codigo));
    assert.equal(JSON.stringify(db), antes, 'nenhuma transição gravada');
    assert.ok(!calls.includes('verificarCommit'), 'não confere commit de conclusão sobre superada');
  }
  // Pedido importado da web para revisão já superada.
  {
    const p = base(); p.revisao = { superada: true, vigente: false }; p.estadoEfetivo = 'superada';
    const remoto = { novos: async () => [{ id: '11111111-1111-4111-8111-111111111111', peca_id: p.id, versao_alvo: p.versao, caminho: p.caminho, texto_original: 'AUDIT web', criado_em: '2026-10-14T07:00:00Z' }],
      refletir: async () => {}, marcarImportado: async () => {} };
    const { fila, db, calls } = montar(p, remoto);
    await fila.tick({ receber: true });
    assert.ok(!calls.includes('entregar'), 'H-03 importado: não entrega');
    assert.equal(db.pedidos.length, 1); assert.equal(db.pedidos[0].estado, 'desatualizado');
    assert.ok(db.eventos.some((e) => e.codigo === 'revisao-superada'));
  }
  console.log('OK H-03 pedido anterior à supersessão (local, em correção ou importado) não é entregue, estimado, gasto nem concluído');
  assert.equal(rede.length, 0);
  console.log('admin-familias-ciclos: H-01, H-02 e H-03 nos módulos reais, zero rede/env/processo: OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
