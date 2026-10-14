'use strict';
// Registro explícito de famílias (docs/marketing/painel/familias.json), 14/10/2026.
// Módulos reais num repositório temporário (fixture AUDIT-*). Prova:
// - revisão nova em pasta nova NÃO cria segunda família; a anterior vira superada;
// - toda ação sobre revisão superada é recusada NO SERVIDOR, sem nenhuma escrita;
// - aceite antigo de revisão superada não vale para feed, calendário nem cronograma;
// - capa vinculada pelo registro entra no Reel, sai do feed e entra na versão composta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const base = fs.mkdtempSync(path.join(process.env.GRANA_TEMP || os.tmpdir(), 'grana-familias-'));
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(base, 'conta'); // fila privada isolada
const raiz = path.join(base, 'repo');
const cat = require('../tools/admin-local/marketing/catalogo.cjs');
const aprovacoes = require('../tools/admin-local/marketing/aprovacoes.cjs');
const calendario = require('../tools/admin-local/marketing/calendario.cjs');
const cronograma = require('../tools/admin-local/marketing/cronograma.cjs');
const { promover } = require('../tools/admin-local/marketing/promocao.cjs');
const { fila } = require('../tools/admin-local/marketing/ajustes-fila.cjs');

const S39 = 'docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27';
const S40 = 'docs/marketing/2026-10/semana-40-2026-09-28-a-2026-10-04';
const S41 = 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11';
const S42 = 'docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18';
const grava = (rel, conteudo) => { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, conteudo); };
const PAINEL = path.join(raiz, 'docs/marketing/painel');
const registro = (dados) => grava('docs/marketing/painel/familias.json', JSON.stringify(dados, null, 2));

// Fotografia de tudo o que uma recusa não pode tocar: acervo, painel e fila privada.
function fotografia() {
  const mapa = new Map();
  const varrer = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name); if (e.isDirectory()) varrer(f); else mapa.set(f, fs.readFileSync(f).toString('base64'));
  } };
  varrer(raiz); varrer(process.env.GRANA_ADMIN_PASTA_CONTA);
  return mapa;
}
async function recusaSemEscrita(acao, codigo, rotulo) {
  const antes = fotografia();
  await assert.rejects(async () => acao(), (e) => e.codigo === codigo, rotulo);
  const depois = fotografia();
  assert.deepEqual([...depois.keys()].sort(), [...antes.keys()].sort(), `${rotulo}: nenhum arquivo criado ou apagado`);
  for (const [f, b] of antes) assert.equal(depois.get(f), b, `${rotulo}: ${path.basename(f)} não mudou`);
}

(async () => {
  try {
    for (const s of [S39, S40, S41, S42]) grava(`${s}/INDICE.md`, '# AUDIT\n');
    grava(`${S40}/para-aprovacao/pecas/lumen-v6/carrossel-1.png`, 'AUDIT-v6-1');
    grava(`${S40}/para-aprovacao/pecas/lumen-v6/carrossel-2.png`, 'AUDIT-v6-2');
    grava(`${S40}/para-aprovacao/pecas/lumen-v6/card.png`, 'AUDIT-card');
    grava(`${S40}/para-aprovacao/pecas/lumen-v7/carrossel-1.png`, 'AUDIT-v7-1');
    grava(`${S40}/para-aprovacao/pecas/lumen-v7/carrossel-2.png`, 'AUDIT-v7-2');
    grava(`${S39}/para-aprovacao/pecas/reels/audit-reel-v8.mp4`, 'AUDIT-v8');
    grava(`${S42}/aprovados/pecas/reels/audit-reel-notificacao.mp4`, 'AUDIT-notif');
    grava(`${S41}/aprovados/audit-reel-capa-1080x1920.png`, 'AUDIT-capa');
    grava(`${S40}/para-aprovacao/pecas/r13-v3/audit-r13-v3.mp4`, 'AUDIT-r13-v3');
    grava(`${S40}/historico/pecas/r13/audit-r13-final.mp4`, 'AUDIT-r13-final');

    // Sem registro: o comportamento antigo, duas famílias do mesmo carrossel (o defeito).
    let r = cat.listarPecas(raiz);
    const familiaDe = (lista, trecho) => lista.familias.filter((f) => [f.principal, ...f.alternativas, ...f.superadas].some((p) => p?.caminho.includes(trecho)));
    assert.equal(r.familias.filter((f) => /lumen-v[67]\/carrossel/.test(f.principal?.caminho || '')).length, 2, 'sem registro, v6 e v7 são duas famílias');

    const C14 = { id: 'C14', nome: 'C14, carrossel AUDIT', revisoes: [{ caminho: `${S40}/para-aprovacao/pecas/lumen-v6/carrossel-*` }, { caminho: `${S40}/para-aprovacao/pecas/lumen-v7/carrossel-*` }], vigente: `${S40}/para-aprovacao/pecas/lumen-v7/carrossel-*` };
    const RP = { id: 'R-P', nome: 'Reel AUDIT', revisoes: [{ caminho: `${S39}/para-aprovacao/pecas/reels/audit-reel-v8.mp4` }, { caminho: `${S42}/aprovados/pecas/reels/audit-reel-notificacao.mp4` }], vigente: `${S42}/aprovados/pecas/reels/audit-reel-notificacao.mp4` };
    const R13 = { id: 'R13', nome: 'R13 AUDIT', revisoes: [{ caminho: `${S40}/para-aprovacao/pecas/r13-v3/audit-r13-v3.mp4` }, { caminho: `${S40}/historico/pecas/r13/audit-r13-final.mp4` }], vigente: `${S40}/historico/pecas/r13/audit-r13-final.mp4` };
    const CAPAS = [{ capa: `${S41}/aprovados/audit-reel-capa-1080x1920.png`, reel: `${S42}/aprovados/pecas/reels/audit-reel-notificacao.mp4` }];
    registro({ formato: 1, familias: [RP, R13, C14], capas: CAPAS });

    r = cat.listarPecas(raiz);
    const todas = cat.enriquecer(raiz, cat.montarCatalogo(raiz));
    const por = (trecho) => todas.find((p) => p.caminho.includes(trecho));
    const v6 = por('lumen-v6/carrossel'), v7 = por('lumen-v7/carrossel'), card = por('lumen-v6/card.png');
    const v8 = por('audit-reel-v8'), notif = por('audit-reel-notificacao'), capa = por('audit-reel-capa');
    const r13v3 = por('audit-r13-v3'), r13final = por('audit-r13-final');

    // Uma família por peça editorial; a vigente é a principal, a anterior fica em superadas.
    const c14 = familiaDe(r, 'lumen-v');
    assert.equal(c14.filter((f) => f.principal && /carrossel/.test(f.principal.caminho)).length, 1, 'v6 e v7: uma família só');
    const fC14 = r.familias.find((f) => f.registro?.familia === 'C14');
    assert.equal(fC14.principal.id, v7.id); assert.deepEqual(fC14.superadas.map((p) => p.id), [v6.id]); assert.equal(fC14.alternativas.length, 0);
    assert.equal(fC14.registro.nome, 'C14, carrossel AUDIT');
    assert.equal(v6.estadoEfetivo, 'superada'); assert.equal(v6.revisao.ordem, 1); assert.equal(v7.revisao.ordem, 2);
    assert.equal(card.revisao, null, 'card.png da mesma pasta é outra peça, fora da família C14');
    assert.ok(!r.pecas.some((p) => p.id === v6.id || p.id === v8.id || p.id === r13v3.id), 'superada fora de pecas (fila e contador)');
    assert.equal(r.total, r.pecas.length); assert.equal(r.totalSuperadas, 3);
    const soSuperadas = cat.listarPecas(raiz, { estado: 'superada' });
    assert.deepEqual(soSuperadas.pecas.map((p) => p.id).sort(), [v6.id, v8.id, r13v3.id].sort(), '?estado=superada devolve só as superadas');

    // Revisão nova em pasta nova continua na MESMA família.
    grava(`${S40}/para-aprovacao/pecas/lumen-v8/carrossel-1.png`, 'AUDIT-v8-1');
    grava(`${S40}/para-aprovacao/pecas/lumen-v8/carrossel-2.png`, 'AUDIT-v8-2');
    registro({ formato: 1, familias: [RP, R13, { ...C14, revisoes: [...C14.revisoes, { caminho: `${S40}/para-aprovacao/pecas/lumen-v8/carrossel-*` }], vigente: `${S40}/para-aprovacao/pecas/lumen-v8/carrossel-*` }], capas: CAPAS });
    const r3 = cat.listarPecas(raiz);
    const f3 = r3.familias.filter((f) => f.registro?.familia === 'C14');
    assert.equal(f3.length, 1); assert.equal(f3[0].superadas.length, 2, 'v6 e v7 superadas pela v8');
    assert.equal(r3.familias.filter((f) => /lumen-v\d\/carrossel/.test(f.principal?.caminho || '')).length, 1, 'nenhuma segunda família de carrossel');
    registro({ formato: 1, familias: [RP, R13, C14], capas: CAPAS });

    // Capa vinculada pelo registro: componente do Reel, nunca post.
    assert.equal(capa.capaDe, notif.id); assert.equal(capa.familia, notif.familia); assert.equal(notif.capa.pecaId, capa.id);
    assert.ok(!cat.feed(raiz).pecas.some((p) => p.id === capa.id), 'capa vinculada não vira post no feed');
    const fRP = r.familias.find((f) => f.registro?.familia === 'R-P');
    assert.deepEqual(fRP.capas.map((p) => p.id), [capa.id]); assert.deepEqual(fRP.superadas.map((p) => p.id), [v8.id]);
    // Versão composta: trocar só a capa muda a versão do Reel.
    assert.ok(notif.composicao && notif.versao !== notif.versaoArquivos);
    assert.equal(notif.versao, cat.versaoComposta([notif.arquivos[0].sha1], capa.arquivos[0].sha1, notif.legenda));

    // Aceite composto explícito (14/10): Reel em aprovados com capa não é aprovado só pela pasta.
    assert.equal(notif.aprovada, false); assert.equal(notif.estadoEfetivo, 'aguardando-aceite');
    assert.equal(capa.aprovada, false, 'capa sem aceite próprio nem composto');
    const composto = await aprovacoes.aprovar(raiz, notif.id, { versao: notif.versao, confirmacao: true });
    assert.equal(composto.aprovacao.versao, notif.versao); assert.match(composto.aprovacao.escopo, /composto/);
    assert.deepEqual(composto.aprovacao.composicao, notif.composicao);
    const notifOk = cat.obterPeca(raiz, notif.id), capaOk = cat.obterPeca(raiz, capa.id);
    assert.equal(notifOk.aprovada, true); assert.equal(capaOk.estadoEfetivo, 'aprovada', 'o composto cobre a capa selada nele');
    assert.ok(cat.feed(raiz).pecas.some((p) => p.id === notif.id) && !cat.feed(raiz).pecas.some((p) => p.id === capa.id));
    // W-C2 (Watchtower, 14/10): a capa aprovada pelo composto continua componente do Reel.
    // Nenhuma ação a trata como item autônomo: 409 e nenhum byte gravado.
    assert.equal(capaOk.aprovada, true, 'premissa do W-C2: capa aprovada');
    await recusaSemEscrita(() => calendario.planejar(raiz, { id: capa.id, versao: capaOk.versao, data: '2026-10-20', canal: 'instagram-feed' }), 'componente-do-reel', 'planejar a capa sozinha');
    await recusaSemEscrita(() => cronograma.registrarVinculo(raiz, capa.id, { versao: capaOk.versao }), 'componente-do-reel', 'vincular a capa sozinha');
    await recusaSemEscrita(() => promover(raiz, capa.id, { versao: capaOk.versao, confirmacao: true }), 'componente-do-reel', 'promover a capa sozinha');
    const calCapa = calendario.obterCalendario(raiz, '2026-10');
    assert.ok(!calCapa.aprovadosSemData.some((x) => x.id === capa.id), 'capa não aparece como aprovada sem data no calendário');
    assert.ok(calCapa.aprovadosSemData.some((x) => x.id === notif.id), 'o Reel aparece');
    // Trocar só a capa muda a versão do Reel: o aceite composto antigo deixa de valer.
    grava(`${S41}/aprovados/audit-reel-capa-1080x1920.png`, 'AUDIT-capa-trocada');
    const notifTroca = cat.obterPeca(raiz, notif.id);
    assert.notEqual(notifTroca.versao, notif.versao); assert.equal(notifTroca.aprovada, false);
    grava(`${S41}/aprovados/audit-reel-capa-1080x1920.png`, 'AUDIT-capa');
    fs.rmSync(path.join(PAINEL, 'aprovacoes.json')); fs.rmSync(path.join(PAINEL, 'calendario.json'), { force: true });
    for (const s of [S39, S40, S41, S42]) grava(`${s}/INDICE.md`, '# AUDIT\n');

    // Aceite antigo da superada fica no histórico e não vale.
    const aceiteV8 = { id: v8.id, caminho: v8.caminho, versao: v8.versao, aprovadoEm: '2026-10-07T10:31:32-03:00', evidencia: 'aceite pelo autor no painel local', nota: 'AUDIT aceite antigo' };
    grava('docs/marketing/painel/aprovacoes.json', JSON.stringify({ aprovacoes: [aceiteV8], ajustes: [] }));
    grava('docs/marketing/painel/calendario.json', JSON.stringify({ planejados: [{ id: v8.id, caminho: v8.caminho, versao: v8.versao, data: '2026-10-12', hora: '17:00', canal: 'reels' }] }));
    const v8b = cat.obterPeca(raiz, v8.id);
    assert.equal(v8b.aprovada, false); assert.equal(v8b.aceite, null); assert.equal(v8b.aceiteSuperado.nota, 'AUDIT aceite antigo');
    assert.ok(!cat.feed(raiz).pecas.some((p) => p.id === v8.id), 'superada fora do feed mesmo com aceite antigo');
    const cal = calendario.obterCalendario(raiz, '2026-10');
    assert.equal(cal.desatualizados[0]?.id, v8.id); assert.match(cal.desatualizados[0].motivo, /superada/);
    assert.ok(!cronograma.projetar(raiz).planejados.some((p) => p.id === v8.id), 'cronograma não projeta superada');

    // Recusas no servidor, sem nenhuma escrita.
    await recusaSemEscrita(() => aprovacoes.aprovar(raiz, v6.id, { versao: v6.versao, confirmacao: true }), 'revisao-superada', 'aprovar v6');
    await recusaSemEscrita(() => aprovacoes.aprovar(raiz, r13v3.id, { versao: r13v3.versao, confirmacao: true }), 'revisao-superada', 'aprovar r13 v3');
    await recusaSemEscrita(() => aprovacoes.pedirAjuste(raiz, v6.id, { versao: v6.versao, motivo: 'AUDIT' }), 'revisao-superada', 'ajuste na v6');
    await recusaSemEscrita(() => fila.solicitar(v6, { versao: v6.versao, motivo: 'AUDIT' }), 'revisao-superada', 'fila direta na v6');
    await recusaSemEscrita(() => calendario.planejar(raiz, { id: v8.id, versao: v8.versao, data: '2026-10-20', canal: 'reels' }), 'revisao-superada', 'planejar v8');
    await recusaSemEscrita(() => cronograma.registrarVinculo(raiz, v8.id, { versao: v8.versao }), 'revisao-superada', 'vincular v8');
    await recusaSemEscrita(() => promover(raiz, v8.id, { versao: v8.versao, confirmacao: true }), 'revisao-superada', 'promover v8');
    const erro = await aprovacoes.aprovar(raiz, v6.id, { versao: v6.versao, confirmacao: true }).catch((e) => e);
    assert.equal(erro.status, 409); assert.match(erro.message, /lumen-v7|carrossel-\*/); assert.doesNotMatch(erro.message, /[0-9a-f]{16}/);

    // Vigente com ajuste aberto não é aprovável; a vigente guardada em historico é.
    await fila.solicitar(v7, { versao: v7.versao, motivo: 'AUDIT Troca o (O Grana. te ajuda!) para (Arrasta pro lado!)' });
    await recusaSemEscrita(() => aprovacoes.aprovar(raiz, v7.id, { versao: v7.versao, confirmacao: true }), 'ajuste-aberto', 'aprovar v7 com ajuste aberto');
    // K1 do Vigil: o pedido foi feito sobre outra versão (a página 2 mudou sem correção registrada).
    // Ele continua aberto e continua bloqueando o aceite da versão nova.
    grava(`${S40}/para-aprovacao/pecas/lumen-v7/carrossel-2.png`, 'AUDIT-v7-2-mudou');
    const v7nova = cat.obterPeca(raiz, v7.id);
    assert.notEqual(v7nova.versao, v7.versao); assert.equal(v7nova.ajuste, null, 'o DTO não acha ajuste para a versão nova');
    await recusaSemEscrita(() => aprovacoes.aprovar(raiz, v7.id, { versao: v7nova.versao, confirmacao: true }), 'ajuste-aberto', 'aprovar v7 em outra versão com pedido aberto');
    grava(`${S40}/para-aprovacao/pecas/lumen-v7/carrossel-2.png`, 'AUDIT-v7-2');
    const ok = await aprovacoes.aprovar(raiz, r13final.id, { versao: r13final.versao, confirmacao: true });
    assert.equal(ok.aprovacao.id, r13final.id);
    const r13f = cat.obterPeca(raiz, r13final.id);
    assert.equal(r13f.aprovada, true); assert.equal(r13f.estadoEfetivo, 'aprovada');

    // Promover ou recusar só troca a pasta de estado: a identidade no registro continua.
    fs.mkdirSync(path.join(raiz, `${S39}/aprovados/pecas/reels`), { recursive: true });
    fs.renameSync(path.join(raiz, `${S39}/para-aprovacao/pecas/reels/audit-reel-v8.mp4`), path.join(raiz, `${S39}/historico/pecas/reels/audit-reel-v8.mp4`.replace('/historico/', '/aprovados/')));
    const v8movida = cat.enriquecer(raiz, cat.montarCatalogo(raiz)).find((p) => p.caminho.endsWith('audit-reel-v8.mp4'));
    assert.equal(v8movida.estado, 'aprovados'); assert.equal(v8movida.estadoEfetivo, 'superada'); assert.equal(v8movida.aprovada, false, 'pasta aprovados não ressuscita a superada');

    // Família sem vigente escolhida: pendência visível e decisão bloqueada.
    registro({ formato: 1, familias: [RP, R13, { ...C14, vigente: null, pendencia: 'AUDIT autor escolhe' }], capas: CAPAS });
    const pend = cat.listarPecas(raiz).familias.find((f) => f.registro?.familia === 'C14');
    assert.equal(pend.registro.pendencia, 'AUDIT autor escolhe'); assert.equal(pend.superadas.length, 0);
    await recusaSemEscrita(() => aprovacoes.aprovar(raiz, v6.id, { versao: v6.versao, confirmacao: true }), 'familia-pendente', 'aprovar em família pendente');

    // Registro inválido falha fechado, com motivo.
    registro({ formato: 1, familias: [RP, { ...R13, revisoes: [...R13.revisoes, RP.revisoes[0]] }], capas: [] });
    assert.throws(() => cat.montarCatalogo(raiz), (e) => e.codigo === 'familias-invalido');
    registro({ formato: 1, familias: [{ ...RP, nome: '' }], capas: [] });
    assert.throws(() => cat.montarCatalogo(raiz), (e) => e.codigo === 'familias-invalido');

    console.log('admin-familias-registro: uma família por peça, superada recusada no servidor sem escrita (aprovar/ajuste/fila/planejar/vincular/promover), aceite antigo sem efeito, capa do registro no Reel e na versão composta: OK');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
