'use strict';
// W-C1 (Watchtower, 14/10): um validador único de aceite para catálogo, calendário, cronograma,
// promoção e ensaio. O aceite composto "derivado de aceites separados" só vale para as duas
// derivações autorizadas e com a cadeia conferida. Lê o acervo REAL só para leitura; toda
// adulteração é feita em cópias em memória, nada é gravado.
const assert = require('node:assert/strict');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const cat = require('../tools/admin-local/marketing/catalogo.cjs');
const { aceiteValido, DERIVACOES_AUTORIZADAS, EVIDENCIA_DERIVADA } = require('../tools/admin-local/marketing/aceite-evidencia.cjs');

const aceites = cat.lerJson(cat.caminhoPainel(raiz, 'aprovacoes.json'), { aprovacoes: [] }).aprovacoes;
const pecas = cat.montarCatalogo(raiz);
const derivados = aceites.filter((a) => a.evidencia === EVIDENCIA_DERIVADA);
assert.equal(derivados.length, 2, 'os dois derivados autorizados existem no registro');
assert.deepEqual(derivados.map((a) => a.id).sort(), DERIVACOES_AUTORIZADAS.map((d) => d.id).sort());
const copia = (o) => structuredClone(o);

const recusas = cat.lerJson(cat.caminhoPainel(raiz, 'historico.json'), { recusas: [] }).recusas;
for (const a of derivados) {
  const real = pecas.find((x) => x.id === a.id);
  // 19/10: o autor recusou o Reel "Fala o gasto, pronto" (já publicado) e ele saiu de aprovados com outro id.
  // Peça recusada pelo autor não tem mais cadeia a conferir no acervo; o registro do aceite continua.
  if (!real && recusas.some((r) => r.origem?.id === a.id)) { console.log(`${a.id}: recusado pelo autor, fora do acervo vivo`); continue; }
  // 18/10: a legenda do Reel passou a entrar no catálogo (ligada pelo nome do arquivo) e a versão dela muda, então o aceite
  // derivado do Reel real lapsa de propósito até o autor aprovar de novo. A cadeia continua travada no estado em que a
  // derivação foi autorizada (sem legenda); isso prova que o renome só trocou id e caminho.
  const p = real && real.composicao ? { ...real, legenda: null, versao: cat.versaoComposta(real.composicao.video, real.composicao.capa, null),
    composicao: { ...real.composicao, legenda: 'sem-legenda' } } : real;
  if (real && real.legenda) assert.equal(aceiteValido(a, real, Date.now(), aceites), false, `${a.id}: com a legenda ligada o aceite antigo lapsa e pede nova aprovação`);
  assert.ok(p && p.composicao, `${a.id}: Reel composto no acervo`);
  assert.equal(aceiteValido(a, p, Date.now(), aceites), true, `${a.id}: derivação autorizada com cadeia íntegra vale`);
  assert.equal(aceiteValido(a, p), false, `${a.id}: sem a lista de aceites não há como conferir a capa, então não vale`);

  // Negativos: cada elo adulterado derruba a derivação.
  const semCapa = aceites.filter((x) => x.id !== a.derivadoDe.capa.id);
  assert.equal(aceiteValido(a, p, Date.now(), semCapa), false, 'aceite da capa ausente');
  const capaAdulterada = aceites.map((x) => (x.id === a.derivadoDe.capa.id ? { ...x, evidencia: 'parecer do Keel aprovado' } : x));
  assert.equal(aceiteValido(a, p, Date.now(), capaAdulterada), false, 'aceite da capa sem evidência de autor');
  const capaOutraData = aceites.map((x) => (x.id === a.derivadoDe.capa.id ? { ...x, aprovadoEm: '2026-10-12T09:00:00-03:00' } : x));
  assert.equal(aceiteValido(a, p, Date.now(), capaOutraData), false, 'data do aceite da capa diverge da citada');
  const outroVideo = copia(a); outroVideo.derivadoDe.video.sha1 = '0'.repeat(40);
  assert.equal(aceiteValido(outroVideo, p, Date.now(), aceites), false, 'SHA-1 do vídeo diverge');
  const outraCapa = copia(a); outraCapa.composicao.capa = '1'.repeat(40);
  assert.equal(aceiteValido(outraCapa, p, Date.now(), aceites), false, 'composição diferente da selada no Reel');
  // Capa trocada no disco: o Reel muda de versão e a composição também.
  const pTrocada = { ...p, versao: cat.versaoComposta(p.composicao.video, '2'.repeat(40), p.legenda), composicao: { ...p.composicao, capa: '2'.repeat(40) } };
  assert.equal(aceiteValido({ ...a, versao: pTrocada.versao }, pTrocada, Date.now(), aceites), false, 'capa trocada: derivação não autorizada para a versão nova');
  assert.equal(aceiteValido({ ...a, evidencia: 'aceite composto do autor' }, p, Date.now(), aceites), false, 'texto de evidência livre não vale');
  assert.equal(aceiteValido({ ...a, aprovadoEm: '2099-01-01T00:00:00-03:00' }, p, Date.now(), aceites), false, 'data no futuro');
}

// Derivação fora da lista autorizada: mesma forma, outra peça composta -> não vale.
const outroReel = pecas.find((p) => p.composicao && !DERIVACOES_AUTORIZADAS.some((d) => d.id === p.id));
if (outroReel) {
  const modelo = derivados[0];
  const forjado = { ...copia(modelo), id: outroReel.id, caminho: outroReel.caminho, versao: outroReel.versao, composicao: outroReel.composicao };
  assert.equal(aceiteValido(forjado, outroReel, Date.now(), aceites), false, 'derivação não listada no código é recusada');
}

// Consumidores concordam. Com a legenda ligada ao Reel (18/10) o aceite derivado lapsa em todos eles
// ao mesmo tempo: o catálogo não aprova mais e o calendário não mostra recibo derivado.
const enr = cat.enriquecer(raiz, pecas);
const cal = require('../tools/admin-local/marketing/calendario.cjs').obterCalendario(raiz, '2026-10');
for (const a of derivados) {
  const p = enr.find((x) => x.id === a.id);
  if (!p && recusas.some((r) => r.origem?.id === a.id)) continue; // recusado pelo autor (19/10)
  if (p.legenda) {
    assert.equal(p.aprovada, false, `${a.id}: legenda ligada, Reel volta para o aceite do autor`);
    assert.equal(p.aceite, null);
    const item = [...cal.itens, ...cal.aprovadosSemData].find((r) => r.peca?.id === a.id || r.id === a.id);
    assert.ok(!item || (item.peca ? item.peca.reciboAceite : item.reciboAceite)?.evidencia !== EVIDENCIA_DERIVADA, `${a.id}: calendário sem recibo derivado`);
  } else {
    assert.equal(p.aprovada, true); assert.equal(p.aceite?.evidencia, EVIDENCIA_DERIVADA, 'catálogo usa o mesmo validador');
  }
}
// Achado do Flare (14/10): checkout CRLF mudava a legenda e, por ela, a versão da peça.
{
  const fs = require('node:fs'), os = require('node:os');
  const versaoCom = (eol) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-crlf-'));
    try {
      const pecas = path.join(tmp, 'docs/marketing/2026-10/semana-40-2026-09-28-a-2026-10-04/para-aprovacao/pecas');
      fs.mkdirSync(path.join(pecas, 'lumen-v9'), { recursive: true });
      fs.writeFileSync(path.join(pecas, 'lumen-v9/carrossel-1.png'), 'AUDIT-1');
      fs.writeFileSync(path.join(pecas, 'lumen-v9/carrossel-2.png'), 'AUDIT-2');
      fs.writeFileSync(path.join(pecas, 'COPYS-FINAIS.md'), ['## C14 · Carrossel AUDIT', '', '**Legenda:** Primeira linha', 'segunda linha', '', 'fim'].join(eol));
      const p = cat.montarCatalogo(tmp).find((x) => x.tipo === 'carrossel');
      return { versao: p.versao, legenda: p.legenda };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  };
  const lf = versaoCom('\n'), crlf = versaoCom('\r\n');
  assert.ok(lf.legenda && !lf.legenda.includes('\r'));
  assert.equal(crlf.versao, lf.versao, 'CRLF e LF dão a mesma versão');
}

console.log('admin-aceite-derivado:validador único; 2 derivações autorizadas valem com cadeia íntegra; 9 adulterações recusadas; catálogo e calendário concordam (leitura do acervo real, nada gravado): OK');
