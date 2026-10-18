'use strict';
// Módulo real; só arquivos locais. Nenhum upload/publicação de teste na Meta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Jimp = require('jimp-compact');
const { criarCapturador } = require('../tools/admin-local/marketing/snapshot-local.cjs');
const sha = (alg, bytes) => crypto.createHash(alg).update(bytes).digest('hex');

(async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-jpeg-teste-'));
  const rel = 'docs/marketing/2026-10/semana-42/aprovados/';
  fs.mkdirSync(path.join(raiz, rel), { recursive: true });
  const originais = [], arquivos = [];
  const cores = [0xff0000ff, 0x00ff00ff, 0x0000ffff, 0xffff00ff, 0xff00ffff];
  try {
    for (let i = 0; i < 5; i++) {
      const imagem = await new Promise((ok, falha) => new Jimp(16, 20, cores[i], (e, im) => e ? falha(e) : ok(im)));
      const bytes = await imagem.getBufferAsync('image/png');
      originais.push(bytes);
      const url = '/' + rel + i + '.png';
      fs.writeFileSync(path.join(raiz, url.slice(1)), bytes);
      arquivos.push({ url, tipo: 'imagem', sha1: sha('sha1', bytes) });
    }
    const peca = { id: 'a'.repeat(16), versao: 'b'.repeat(40), caminho: rel, aprovada: true,
      legenda: 'Legenda aprovada.', arquivos, aceite: { id: 'a'.repeat(16), versao: 'b'.repeat(40), caminho: rel,
        aprovadoEm: new Date(Date.now() - 60000).toISOString(), evidencia: 'aceite pelo autor no painel local' } };
    const capturar = criarCapturador({ obterPeca: () => structuredClone(peca), pastaTemporaria: raiz });
    const primeira = await capturar(raiz, peca.id, peca.versao, { jpeg: true });
    const segunda = await capturar(raiz, peca.id, peca.versao, { jpeg: true });
    try {
      assert.equal(primeira.versao, peca.versao);
      assert.deepEqual(primeira.aceite, peca.aceite);
      assert.deepEqual(primeira.manifesto, segunda.manifesto, 'mesma entrada gera mesmos hashes de transporte');
      assert.deepEqual(primeira.manifesto.midias.map(m => m.ordem), [0, 1, 2, 3, 4]);
      for (let i = 0; i < 5; i++) {
        const partes = []; for await (const b of primeira.abrir(i)) partes.push(b);
        const jpeg = Buffer.concat(partes), m = primeira.manifesto.midias[i];
        assert.equal(m.mime, 'image/jpeg');
        assert.equal(m.sha256, sha('sha256', jpeg));
        assert.equal(m.bytes, jpeg.length);
        assert.deepEqual([m.largura, m.altura], [16, 20]);
        const imagem = await Jimp.read(jpeg);
        assert.deepEqual([imagem.bitmap.width, imagem.bitmap.height], [16, 20]);
        const pixel = Jimp.intToRGBA(imagem.getPixelColor(8, 10)), esperado = Jimp.intToRGBA(cores[i]);
        for (const canal of ['r', 'g', 'b']) assert.ok(Math.abs(pixel[canal] - esperado[canal]) <= 3, 'cor e ordem preservadas');
        assert.deepEqual(fs.readFileSync(path.join(raiz, arquivos[i].url.slice(1))), originais[i]);
        assert.equal(arquivos[i].sha1, sha('sha1', originais[i]));
      }
    } finally { await primeira.fechar(); await segunda.fechar(); }
    // PNG com assinatura certa e corpo inválido é erro visível, nunca upload disfarçado.
    const ruim = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 9, 9]);
    fs.writeFileSync(path.join(raiz, arquivos[0].url.slice(1)), ruim);
    arquivos[0].sha1 = sha('sha1', ruim);
    await assert.rejects(capturar(raiz, peca.id, peca.versao, { jpeg: true }), { codigo: 'midia-invalida', status: 415 });
    assert.equal(fs.readdirSync(raiz).some(n => n.startsWith('grana-snapshot-')), false);
    console.log('admin-snapshot-jpeg: 5 PNGs, ordem, JPEG real, hashes, cores, dimensões, aceite e originais intactos; erro e limpeza OK');
  } finally {
    assert.equal(path.dirname(path.resolve(raiz)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(raiz).startsWith('grana-jpeg-teste-'));
    fs.rmSync(raiz, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
