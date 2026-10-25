// Voltar para aprovados (sem data): domínio, recusa no servidor com job real e botão na tela.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const c = require('../tools/admin-local/marketing/catalogo.cjs');
const cr = require('../tools/admin-local/marketing/cronograma.cjs');
const ap = require('../tools/admin-local/marketing/aprovacoes.cjs');
const cal = require('../tools/admin-local/marketing/calendario.cjs');
const nenhum = async () => ({ jobs: [], limitado: false });
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-sem-data-'));
  try {
    const semana = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
    const pasta = path.join(dir, semana, 'para-aprovacao/pecas'); fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'E01.jpg'), 'fixture');
    fs.writeFileSync(path.join(pasta, 'COPYS-FINAIS.md'), '## E01 - Fixture\n\n**Legenda:** Legenda de teste E01.\n');
    fs.writeFileSync(path.join(dir, semana, 'INDICE.md'), '# Semana\n\n| Peça | Cronograma ID |\n| --- | --- |\n| [Peça](para-aprovacao/pecas/E01.jpg) | |\n');
    fs.mkdirSync(path.join(dir, 'docs/marketing/painel'), { recursive: true });
    const p = c.montarCatalogo(dir).find((x) => x.tipo !== 'texto');
    const manifesto = { formato: 1, manifestoId: 'campanha-teste', versao: 1, fuso: 'America/Sao_Paulo', diaD: null,
      itens: [{ id: 'peca-teste', dataPrevista: { modo: 'absoluta', data: '2099-01-05', hora: '10:00', canal: 'instagram-feed' } }], removidos: [] };
    await cr.salvarManifesto(dir, { manifesto, versaoEsperada: 0 });
    await cr.registrarVinculo(dir, p.id, { versao: p.versao, versaoEsperada: 1, manifestoId: 'campanha-teste', itemId: 'peca-teste' });
    await ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: true });
    assert.equal(cal.obterCalendario(dir, '2099-01').itens.length, 1, 'planejada no dia 05');

    // Job real: o servidor recusa e nada muda.
    const comJob = async () => ({ jobs: [{ peca: { pecaId: p.id } }], limitado: false });
    await assert.rejects(cal.voltarSemData(dir, { id: p.id, versao: p.versao }, { listar: comJob }), (e) => e.codigo === 'sem-data-recusado' && e.status === 409);
    const comEstado = (...estados) => async () => ({ jobs: estados.map((estado) => ({ estado, peca: { pecaId: p.id } })), limitado: false });
    for (const e of ['precisa-conferir', 'programado-no-painel', 'agendado-na-meta', 'publicado']) {
      await assert.rejects(cal.voltarSemData(dir, { id: p.id, versao: p.versao }, { listar: comEstado(e) }), (x) => x.codigo === 'sem-data-recusado', e);
    }
    await assert.rejects(cal.voltarSemData(dir, { id: p.id, versao: p.versao }, { listar: comEstado('cancelado', 'precisa-conferir') }), (x) => x.codigo === 'sem-data-recusado', 'histórico + conferir');
    await assert.rejects(cal.voltarSemData(dir, { id: p.id, versao: p.versao }, { listar: async () => { throw new Error('fora'); } }), (e) => e.codigo === 'sem-data-recusado', 'consulta falhou: recusa');
    assert.equal(cal.obterCalendario(dir, '2099-01').itens.length, 1, 'recusa não mexe no calendário');

    // Sem job: volta para aprovados sem data, e continua assim depois de recarregar.
    await cal.voltarSemData(dir, { id: p.id, versao: p.versao }, { listar: comEstado('cancelado', 'falhou') }); // só histórico não trava
    for (let i = 0; i < 2; i++) {
      const d = cal.obterCalendario(dir, '2099-01');
      assert.equal(d.itens.length, 0);
      assert.ok(d.aprovadosSemData.some((x) => x.id === p.id), 'peça em Aprovados sem data');
      assert.equal(d.suspensos.length + d.desatualizados.length, 0);
    }
    await assert.rejects(cal.voltarSemData(dir, { id: p.id, versao: p.versao }, { listar: nenhum }), (e) => e.codigo === 'sem-data-recusado', 'já sem data');

    // Nova data tira a marca.
    await cal.planejar(dir, { id: p.id, versao: p.versao, data: '2099-01-06', hora: '09:00', canal: 'instagram-feed' });
    const d2 = cal.obterCalendario(dir, '2099-01');
    assert.equal(d2.itens.length, 1); assert.equal(d2.itens[0].data, '2099-01-06');
    assert.equal(d2.aprovadosSemData.some((x) => x.id === p.id), false);

    // Planejamento manual legado não tem estado persistido: a leitura o trata
    // como planejado, e o comando de voltar precisa aceitar o mesmo contrato.
    const arq = path.join(dir, 'docs/marketing/painel/calendario.json');
    fs.writeFileSync(arq, JSON.stringify({ formato: 1, planejados: [{
      id: p.id, versao: p.versao, caminho: p.caminho, data: '2099-01-06', hora: null, canal: 'instagram-feed',
    }] }));
    // Retira só o manifesto da fixture para exercitar o legado sem projeção.
    fs.unlinkSync(path.join(dir, 'docs/marketing/painel/cronograma.json'));
    assert.equal(cal.obterCalendario(dir, '2099-01').itens.length, 1);
    await cal.voltarSemData(dir, { id: p.id, versao: p.versao }, { listar: nenhum });
    assert.equal(cal.obterCalendario(dir, '2099-01').itens.length, 0);
    assert.ok(cal.obterCalendario(dir, '2099-01').aprovadosSemData.some(x => x.id === p.id));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  // Tela: botão no cartão planejado, ausente com job real.
  const source = fs.readFileSync('tools/admin-local/web/telas/calendario.js', 'utf8');
  const linha = (re) => { const m = re.exec(source); assert.ok(m, String(re)); return m[0]; };
  // Regra real extraída da tela: nada de job real nem de post publicado, e com data.
  const pode = vm.runInNewContext(`(() => { ${linha(/const pubDe = .*;/)} ${linha(/const podeVoltarSemData = .*;/)} return podeVoltarSemData; })()`);
  assert.match(source, /podeVoltarSemData\(i\) \? h\('button'[^]*?Voltar para aprovados \(sem data\)/, 'botão no cartão planejado');
  assert.match(source, /voltarSemData: planejado && podeVoltarSemData\(i\)/, 'botão na prévia só para planejada');
  assert.match(source, /\/api\/marketing\/calendario\/sem-data/);
  assert.equal(pode({ data: '2099-01-05', jobs: [] }), true, 'planejada sem job');
  assert.equal(pode({ data: '2099-01-05', jobs: [{ jobId: 'x' }] }), false, 'com job real');
  assert.equal(pode({ data: '2099-01-05', jobs: [], publicacoes: [{ rede: 'instagram' }] }), false, 'publicada');
  assert.equal(pode({ data: null, jobs: [] }), false, 'sem data');
  console.log('ok admin-calendario-voltar-sem-data');
})().catch((e) => { console.error(e); process.exit(1); });
