'use strict';
// Validador e consumidores reais; somente a extração do acervo no calendário recebe
// metadados sintéticos. Não lê peças/aceites locais nem depende de conteúdo aprovado vivo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-aceite-derivado-'));
const pastaAnterior = process.env.GRANA_ADMIN_PASTA_CONTA;
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(raiz, 'conta');
const configId = require.resolve('../tools/admin-local/config.cjs');
const configAnterior = require.cache[configId];
require.cache[configId] = { id: configId, filename: configId, loaded: true, exports: {
  RAIZ: raiz, RAIZ_DADOS: raiz, ler: () => null, tem: () => false, ocultar: String,
  registrarSegredo() {}, refSupabase: () => null,
} };
const cat = require('../tools/admin-local/marketing/catalogo.cjs');
const { aceiteValido, DERIVACOES_AUTORIZADAS, EVIDENCIA_DERIVADA } = require('../tools/admin-local/marketing/aceite-evidencia.cjs');
const copia = o => structuredClone(o);
const sha = texto => crypto.createHash('sha1').update(texto).digest('hex');
const agoraAnterior = Date.now;
Date.now = () => Date.parse('2026-10-20T12:00:00Z');
const autorizado = [
  { id: 'a8163352aef99dbe', versao: 'c3f392ddc38abb04b0dca30d95490338db99e80a' },
  { id: '12c0619f5a59fa78', versao: 'd2291cb48d01c6943cb7d758c70a661c0119149e' },
];
const gravar = (rel, conteudo) => {
  const alvo = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, conteudo);
};

try {
  // A exceção histórica continua fechada nos mesmos dois IDs/versões. Os demais
  // campos são metadados inventados: não pretendem reproduzir bytes dos vídeos reais.
  assert.deepEqual(DERIVACOES_AUTORIZADAS, autorizado);
  const casos = autorizado.map((d, i) => {
    const caminho = `docs/marketing/2026-10/semana-fixture/aprovados/reels/caso-${i}.mp4`;
    const caminhoCapa = caminho.replace('.mp4', '-capa.png');
    const video = sha(`video-sintetico-${i}`), capa = sha(`capa-sintetica-${i}`), capaId = sha(caminhoCapa).slice(0, 16);
    const composicao = { video: [video], capa, capaPecaId: capaId, legenda: 'sem-legenda' };
    const peca = { ...d, caminho, titulo: `Reel sintético ${i}`, tipo: 'reel', estado: 'aprovados',
      semana: 'semana-fixture', legenda: null, composicao,
      arquivos: [{ tipo: 'video', sha1: video, url: '/' + caminho }], capa: { pecaId: capaId, sha1: capa, url: '/' + caminhoCapa } };
    const pecaCapa = { id: capaId, versao: cat.versaoDeArquivos([capa], null), caminho: caminhoCapa,
      titulo: `Capa sintética ${i}`, tipo: 'imagem', estado: 'aprovados', legenda: null, capaDe: d.id,
      arquivos: [{ tipo: 'imagem', sha1: capa, url: '/' + caminhoCapa }] };
    const aceiteCapa = { id: pecaCapa.id, versao: pecaCapa.versao, caminho: caminhoCapa,
      aprovadoEm: '2026-10-13T10:00:00-03:00', evidencia: 'aceite pelo autor no painel local' };
    const aceite = { ...d, caminho, aprovadoEm: '2026-10-14T10:00:00-03:00', evidencia: EVIDENCIA_DERIVADA,
      composicao: copia(composicao), derivadoDe: { video: { caminho, sha1: video }, capa: copia(aceiteCapa) } };
    return { peca, pecaCapa, aceite, aceiteCapa };
  });
  const aceites = casos.flatMap(c => [c.aceite, c.aceiteCapa]);
  const pecas = casos.flatMap(c => [c.peca, c.pecaCapa]);
  for (const { aceite: a, peca: p } of casos) {
    assert.equal(aceiteValido(a, p, Date.now(), aceites), true, `${a.id}: cadeia autorizada íntegra`);
    assert.equal(aceiteValido(a, p), false, 'sem lista não confere a capa');
    const semCapa = aceites.filter(x => x.id !== a.derivadoDe.capa.id);
    assert.equal(aceiteValido(a, p, Date.now(), semCapa), false, 'aceite da capa ausente');
    const capaAdulterada = aceites.map(x => x.id === a.derivadoDe.capa.id ? { ...x, evidencia: 'parecer do Keel aprovado' } : x);
    assert.equal(aceiteValido(a, p, Date.now(), capaAdulterada), false, 'parecer de agente não é aceite do autor');
    const capaOutraData = aceites.map(x => x.id === a.derivadoDe.capa.id ? { ...x, aprovadoEm: '2026-10-12T09:00:00-03:00' } : x);
    assert.equal(aceiteValido(a, p, Date.now(), capaOutraData), false, 'data da capa diverge da citada');
    const outroVideo = copia(a); outroVideo.derivadoDe.video.sha1 = '0'.repeat(40);
    assert.equal(aceiteValido(outroVideo, p, Date.now(), aceites), false, 'SHA-1 do vídeo diverge');
    const outraCapa = copia(a); outraCapa.composicao.capa = '1'.repeat(40);
    assert.equal(aceiteValido(outraCapa, p, Date.now(), aceites), false, 'composição diverge da selada');
    const pTrocada = { ...p, versao: cat.versaoComposta(p.composicao.video, '2'.repeat(40), p.legenda),
      composicao: { ...p.composicao, capa: '2'.repeat(40) } };
    assert.equal(aceiteValido({ ...a, versao: pTrocada.versao }, pTrocada, Date.now(), aceites), false, 'nova versão não tem derivação autorizada');
    assert.equal(aceiteValido({ ...a, evidencia: 'aceite composto do autor' }, p, Date.now(), aceites), false, 'evidência livre recusada');
    assert.equal(aceiteValido({ ...a, aprovadoEm: '2099-01-01T00:00:00-03:00' }, p, Date.now(), aceites), false, 'data futura recusada');
  }
  // Obrigatório: o negativo não desaparece quando não há outro Reel no acervo vivo.
  const outroReel = { ...copia(casos[0].peca), id: 'f'.repeat(16), caminho: 'outro-reel.mp4' };
  const forjado = { ...copia(casos[0].aceite), id: outroReel.id, caminho: outroReel.caminho };
  assert.equal(aceiteValido(forjado, outroReel, Date.now(), aceites), false, 'derivação fora da lista fechada recusada');

  function consumidores(entrada, registros) {
    gravar('docs/marketing/painel/aprovacoes.json', JSON.stringify({ formato: 1, aprovacoes: registros, ajustes: [] }));
    // Só a fronteira de extração recebe metadados: enriquecer, aceiteValido e
    // obterCalendario são os módulos reais, sem alterar sua regra ou seus exports.
    const filename = require.resolve('../tools/admin-local/marketing/calendario.cjs');
    const m = new Module(filename, module), requerer = Module.createRequire(filename);
    m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
    m.require = id => id === './catalogo.cjs' ? { ...cat, montarCatalogo: r => {
      assert.equal(r, raiz); return copia(entrada);
    } } : requerer(id);
    m._compile(fs.readFileSync(filename, 'utf8'), filename);
    return { catalogo: cat.enriquecer(raiz, copia(entrada)), calendario: m.exports.obterCalendario(raiz, '2026-10') };
  }
  const intactos = consumidores(pecas, aceites);
  for (const { peca } of casos) {
    const p = intactos.catalogo.find(x => x.id === peca.id);
    assert.equal(p.aprovada, true); assert.equal(p.aceite.evidencia, EVIDENCIA_DERIVADA);
    const item = intactos.calendario.aprovadosSemData.find(x => x.id === peca.id);
    assert.equal(item.reciboAceite.evidencia, EVIDENCIA_DERIVADA, 'calendário usa o mesmo validador');
  }
  const comLegenda = pecas.map(p => p.composicao ? { ...copia(p), legenda: 'Legenda sintética nova.',
    versao: cat.versaoComposta(p.composicao.video, p.composicao.capa, 'Legenda sintética nova.'),
    composicao: { ...p.composicao, legenda: 'incluida' } } : copia(p));
  const semNovoAceite = consumidores(comLegenda, aceites);
  for (const { peca } of casos) {
    const p = semNovoAceite.catalogo.find(x => x.id === peca.id);
    assert.equal(p.aprovada, false, 'legenda nova pede novo aceite'); assert.equal(p.aceite, null);
    assert.equal(semNovoAceite.calendario.aprovadosSemData.some(x => x.id === p.id), false, 'calendário não reaproveita derivado vencido');
  }
  const diretos = comLegenda.filter(p => p.composicao).map(p => ({ id: p.id, versao: p.versao, caminho: p.caminho,
    evidencia: 'aceite pelo autor no painel local', aprovadoEm: '2026-10-19T10:00:00-03:00' }));
  const aceitosDeNovo = consumidores(comLegenda, [...aceites, ...diretos]);
  for (const a of diretos) {
    assert.equal(aceitosDeNovo.catalogo.find(p => p.id === a.id).aceite.evidencia, a.evidencia);
    assert.equal(aceitosDeNovo.calendario.aprovadosSemData.find(p => p.id === a.id).reciboAceite.evidencia, a.evidencia);
  }
  const capaTrocada = comLegenda.map(p => p.composicao ? { ...copia(p),
    versao: cat.versaoComposta(p.composicao.video, '3'.repeat(40), p.legenda),
    composicao: { ...p.composicao, capa: '3'.repeat(40) } } : copia(p));
  const depoisDaTroca = consumidores(capaTrocada, [...aceites, ...diretos]);
  for (const a of diretos) {
    assert.equal(depoisDaTroca.catalogo.find(p => p.id === a.id).aprovada, false, 'capa trocada invalida até o aceite direto anterior');
    assert.equal(depoisDaTroca.calendario.aprovadosSemData.some(p => p.id === a.id), false);
  }

  // Extração real de bytes sintéticos continua cobrindo a regressão CRLF do Flare.
  const versaoCom = eol => {
    const tmp = path.join(raiz, eol === '\n' ? 'lf' : 'crlf');
    const rel = 'docs/marketing/2026-10/semana-40-2026-09-28-a-2026-10-04/para-aprovacao/pecas';
    fs.mkdirSync(path.join(tmp, rel, 'lumen-v9'), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel, 'lumen-v9/carrossel-1.png'), 'AUDIT-1');
    fs.writeFileSync(path.join(tmp, rel, 'lumen-v9/carrossel-2.png'), 'AUDIT-2');
    fs.writeFileSync(path.join(tmp, rel, 'COPYS-FINAIS.md'), ['## C14 · Carrossel AUDIT', '', '**Legenda:** Primeira linha', 'segunda linha', '', 'fim'].join(eol));
    const p = cat.montarCatalogo(tmp).find(x => x.tipo === 'carrossel');
    return { versao: p.versao, legenda: p.legenda };
  };
  const lf = versaoCom('\n'), crlf = versaoCom('\r\n');
  assert.ok(lf.legenda && !lf.legenda.includes('\r'));
  assert.equal(crlf.versao, lf.versao, 'CRLF e LF dão a mesma versão');
  console.log('admin-aceite-derivado: 2 exceções fechadas; 9 adulterações por cadeia e derivação não autorizada recusadas; catálogo/calendário reais; legenda/capa exigem novo aceite; fixture sintética isolada, zero acervo vivo: OK');
} finally {
  Date.now = agoraAnterior;
  if (pastaAnterior === undefined) delete process.env.GRANA_ADMIN_PASTA_CONTA;
  else process.env.GRANA_ADMIN_PASTA_CONTA = pastaAnterior;
  if (configAnterior) require.cache[configId] = configAnterior; else delete require.cache[configId];
  assert.equal(path.dirname(path.resolve(raiz)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(raiz).startsWith('grana-aceite-derivado-'));
  fs.rmSync(raiz, { recursive: true, force: true });
}
