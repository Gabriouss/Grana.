'use strict';

// Classificacao editorial do catalogo com um acervo sintetico em os.tmpdir.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const catalogo = require('../tools/admin-local/marketing/catalogo.cjs');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-admin-catalogo-editorial-'));
const semana = path.join(
  raiz,
  'docs', 'marketing', '2026-09',
  'semana-39-2026-09-21-a-2026-09-27'
);

function grava(estado, pasta, nome, conteudo) {
  const arquivo = path.join(semana, estado, 'pecas', pasta, nome);
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, conteudo);
}

function pecaPorNome(pecas, nome) {
  const peca = pecas.find((item) => item.arquivos.some((arquivo) => arquivo.nome === nome));
  assert.ok(peca, `peca ausente no catalogo: ${nome}`);
  return peca;
}

try {
  for (const codigo of ['E01', 'E02', 'E06']) {
    grava(
      'para-aprovacao',
      'funil/revisao-06',
      `${codigo}-feed-1080x1440.png`,
      `fixture visual ${codigo}`
    );
  }

  const r5 = 'grana-r5-colar-pix-v6';
  grava('para-aprovacao', 'reels', `${r5}.mp4`, 'video R5 base');
  grava('para-aprovacao', 'reels', `${r5}-capa.png`, 'capa R5 compartilhada');
  grava('para-aprovacao', 'reels', `${r5}-narrado.mp4`, 'video R5 narrado');
  grava('para-aprovacao', 'reels', `${r5}-narrado-capa.png`, 'capa R5 compartilhada');

  const motion = 'grana-motion-desistiu-foto-da-nota';
  grava('aprovados', 'reels', `${motion}.mp4`, 'video motion base');
  grava('aprovados', 'reels', `${motion}-capa.png`, 'capa motion compartilhada');
  grava('para-aprovacao', 'reels', `${motion}-narrado.mp4`, 'video motion narrado');
  grava('para-aprovacao', 'reels', `${motion}-narrado-capa.png`, 'capa motion compartilhada');

  const pecas = catalogo.montarCatalogo(raiz);

  for (const codigo of ['E01', 'E02', 'E06']) {
    const arte = pecaPorNome(pecas, `${codigo}-feed-1080x1440.png`);
    assert.equal(arte.codigo, codigo);
    assert.equal(arte.editorial.tipo, 'visual-candidata');
    assert.equal(arte.editorial.variante, 'revisao-06');
    assert.equal(arte.editorial.copyEmbutida, 'divergente');
  }
  assert.equal(
    pecaPorNome(pecas, 'E01-feed-1080x1440.png').editorial.copyCanonica,
    'O salário caiu. Quanto já tem destino?'
  );
  assert.equal(
    pecaPorNome(pecas, 'E02-feed-1080x1440.png').editorial.copyCanonica,
    'Mercado de R$ 187,40. Salário, condomínio e assinaturas no mesmo mês.'
  );
  assert.match(
    pecaPorNome(pecas, 'E02-feed-1080x1440.png').editorial.avisoHarmonizacao,
    /repete a copy da revisão 05/
  );
  assert.equal(
    pecaPorNome(pecas, 'E06-feed-1080x1440.png').editorial.copyCanonica,
    'Os lançamentos do mês também cabem na tela grande.'
  );

  const r5Base = pecaPorNome(pecas, `${r5}.mp4`);
  const r5Narrado = pecaPorNome(pecas, `${r5}-narrado.mp4`);
  assert.equal(r5Base.editorial.tipo, 'canonico');
  assert.equal(r5Base.editorial.canonicoId, r5Base.id);
  assert.equal(r5Narrado.editorial.tipo, 'variante');
  assert.equal(r5Narrado.editorial.canonicoId, r5Base.id);
  assert.equal(r5Base.capa.nome, `${r5}-capa.png`);
  assert.equal(r5Narrado.capa.nome, `${r5}-narrado-capa.png`);
  assert.equal(r5Base.capa.sha1, r5Narrado.capa.sha1);
  assert.equal(
    r5Narrado.capa.duplicataVisual.sha1Confirmado,
    '646be9950a3347ecfbbc51383ee4a329c562f274'
  );

  const motionBase = pecaPorNome(pecas, `${motion}.mp4`);
  const motionNarrado = pecaPorNome(pecas, `${motion}-narrado.mp4`);
  assert.equal(motionBase.editorial.tipo, 'canonico');
  assert.equal(motionNarrado.editorial.tipo, 'variante');
  assert.equal(motionNarrado.editorial.canonicoId, motionBase.id);
  assert.equal(motionBase.capa.nome, `${motion}-capa.png`);
  assert.equal(motionNarrado.capa.nome, `${motion}-narrado-capa.png`);
  assert.equal(motionBase.capa.sha1, motionNarrado.capa.sha1);
  assert.equal(
    motionBase.capa.duplicataVisual.sha1Confirmado,
    'c34c5d2eea37158015b3ad9b44dbd4f4ca945eba'
  );

  for (const [video, capa] of [
    [r5Base, `${r5}-capa.png`],
    [r5Narrado, `${r5}-narrado-capa.png`],
    [motionBase, `${motion}-capa.png`],
    [motionNarrado, `${motion}-narrado-capa.png`],
  ]) {
    assert.equal(pecaPorNome(pecas, capa).capaDe, video.id);
  }

  console.log('admin-catalogo-editorial: ok');
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}
