// 18/10/2026 (carrossel v9): a legenda de uma peça já em aprovados mudou a pedido do autor, a versão
// mudou, o aceite antigo deixou de valer e o Aprovar recusava com "ja-aprovada". Módulos reais, numa
// semana AUDIT temporária: o reaceite é explícito (nunca herdado), a data marcada segue a versão nova
// e a falha ao levar a data preserva o aceite com aviso e log.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-reaceite-'));
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(dir, 'conta');
const ap = require('../tools/admin-local/marketing/aprovacoes.cjs');
const c = require('../tools/admin-local/marketing/catalogo.cjs');
const cal = require('../tools/admin-local/marketing/calendario.cjs');
const { motivoSemAceite } = require('../tools/admin-local/marketing/snapshot-local.cjs');

(async () => {
  try {
    const semana = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
    const pasta = path.join(dir, semana, 'para-aprovacao/pecas');
    fs.mkdirSync(pasta, { recursive: true });
    fs.mkdirSync(path.join(dir, 'docs/marketing/painel'), { recursive: true });
    fs.writeFileSync(path.join(pasta, 'E01-AUDIT.jpg'), 'AUDIT mídia fictícia');
    const copys = path.join(pasta, 'COPYS-FINAIS.md');
    fs.writeFileSync(copys, '## E01 - Fixture\n\n**Legenda:** Legenda AUDIT. Telas com dados de exemplo.\n');
    fs.writeFileSync(path.join(dir, semana, 'INDICE.md'), '# AUDIT\n');

    const original = c.montarCatalogo(dir).find((p) => p.tipo === 'imagem');
    const promovida = await ap.aprovarEFechar(dir, original.id, { versao: original.versao, confirmacao: true });
    const id = promovida.promocao.id;
    let p = c.obterPeca(dir, id);
    assert.equal(p.estado, 'aprovados');
    await cal.planejar(dir, { id, versao: p.versao, data: '2099-01-10', hora: '20:30', canal: 'instagram-feed' });

    // Autor pede para tirar a frase da legenda: versão nova, sem aceite datado, data antiga desatualizada.
    fs.writeFileSync(copys, '## E01 - Fixture\n\n**Legenda:** Legenda AUDIT.\n');
    const antiga = p.versao;
    p = c.obterPeca(dir, id);
    assert.notEqual(p.versao, antiga, 'legenda entra no hash');
    assert.equal(motivoSemAceite(dir, p), 'aceite-nao-sincronizado', 'aceite antigo não vale para a legenda nova');
    let mes = cal.obterCalendario(dir, '2099-01');
    const semData = mes.aprovadosSemData.find((x) => x.id === id);
    assert.equal(semData?.precisaAceite, true, 'Calendário pede o novo aceite');
    assert(mes.desatualizados.some((x) => x.id === id && x.versao === antiga));

    // Reaceite em 1 clique: grava aceite desta versão (não herda), e a data segue a versão vigente.
    const r = await ap.aprovarEFechar(dir, id, { versao: p.versao, confirmacao: true });
    assert.equal(r.aprovacao.versao, p.versao); assert.equal(r.jaExistia, false); assert.equal(r.promocao, null, 'em aprovados não move de novo');
    assert(r.avisos.some((t) => t.includes('10/01/2099 20:30') && t.includes('passou para esta versão')));
    p = c.obterPeca(dir, id);
    assert.equal(motivoSemAceite(dir, p), null, 'pronta para publicar');
    mes = cal.obterCalendario(dir, '2099-01');
    const item = mes.itens.find((i) => (i.peca?.id || i.id) === id);
    assert.equal(item?.data, '2099-01-10'); assert.equal((item.peca || item).versao, p.versao);
    assert.equal(mes.aprovadosSemData.some((x) => x.id === id), false);
    const aceites = ap.listarAprovacoes(dir).aprovacoes.filter((a) => a.id === id);
    assert.deepEqual(aceites.map((a) => a.versao).sort(), [antiga, p.versao].sort(), 'um aceite por versão, nenhum inventado');

    // Replay da mesma intenção devolve o recibo, sem novo aceite nem agendamento remoto.
    const repetida = await ap.aprovarEFechar(dir, id, { versao: p.versao, confirmacao: true });
    assert.equal(repetida.jaExistia, true);
    assert.equal(repetida.conclusao.estado, 'concluida');

    // Falha ao levar a data não desfaz o aceite: aviso visível e log, e a chamada aconteceu depois do aceite.
    fs.writeFileSync(copys, '## E01 - Fixture\n\n**Legenda:** Legenda AUDIT v3.\n');
    p = c.obterPeca(dir, id);
    const logs = [], erroOriginal = console.error; console.error = (t) => logs.push(t);
    const chamadas = [];
    try {
      const f = await ap.aprovarEFechar(dir, id, { versao: p.versao, confirmacao: true }, {
        planejar: async () => { chamadas.push(ap.listarAprovacoes(dir).aprovacoes.some((a) => a.id === id && a.versao === p.versao)); throw Object.assign(new Error('x'), { codigo: 'disco' }); },
      });
      assert.deepEqual(chamadas, [true], 'aceite gravado antes de levar a data');
      assert.equal(f.aprovacao.versao, p.versao);
      assert(f.avisos.some((t) => t.includes('a data marcada não passou')));
      assert(logs.some((t) => t.includes('aprovar-plano: disco')));
    } finally { console.error = erroOriginal; }
    console.log('admin-reaceite-legenda: legenda nova pede aceite explícito, data segue a versão vigente, falha preserva aceite OK');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
