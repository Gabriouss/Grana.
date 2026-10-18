'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { criarCapturador } = require('../tools/admin-local/marketing/snapshot-local.cjs');
const sha = (alg, v) => crypto.createHash(alg).update(v).digest('hex');

(async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-snapshot-teste-'));
  const rel = 'docs/marketing/2026-10/semana-42/aprovados/foto.png';
  const arquivo = path.join(raiz, rel);
  const bytes = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(1024 * 1024, 7)]);
  fs.mkdirSync(path.dirname(arquivo), { recursive: true }); fs.writeFileSync(arquivo, bytes);
  const peca = { id: 'a'.repeat(16), versao: 'b'.repeat(40), titulo: 'Peça aprovada', caminho: rel,
    aprovada: true, legenda: 'Legenda aceita', arquivos: [{ url: '/' + rel, sha1: sha('sha1', bytes), tipo: 'imagem' }],
    aceite: { id: 'a'.repeat(16), versao: 'b'.repeat(40), caminho: rel, aprovadoEm: new Date(Date.now() - 60000).toISOString(), evidencia: 'aceite pelo autor no painel local' } };
  let leituras = 0, mutar = false;
  const obterPeca = () => {
    leituras++;
    const copia = structuredClone(peca);
    if (mutar && leituras > 1) copia.aceite.aprovadoEm = new Date(Date.now() - 30000).toISOString();
    return copia;
  };
  const capturar = criarCapturador({ obterPeca, pastaTemporaria: raiz });
  try {
    const s = await capturar(raiz, peca.id, peca.versao);
    assert.equal(s.manifesto.midias[0].sha256, sha('sha256', bytes));
    assert.equal(s.manifesto.midias[0].mime, 'image/png');
    assert.equal(s.manifesto.midias[0].bytes, bytes.length);
    assert.equal(s.manifesto.legendaSha256, sha('sha256', peca.legenda));
    assert.equal(JSON.stringify(s.manifesto).includes(raiz), false);
    // O upload lê a cópia capturada, mesmo se a origem mudar depois.
    fs.writeFileSync(arquivo, Buffer.from('origem alterada'));
    const partes = []; for await (const parte of s.abrir(0)) partes.push(parte);
    assert.deepEqual(Buffer.concat(partes), bytes);
    await s.fechar(); assert.equal(fs.existsSync(s.midias[0].arquivo), false);
    await assert.rejects(capturar(raiz, peca.id, peca.versao), { codigo: 'versao-divergente' });
    fs.writeFileSync(arquivo, bytes);
    leituras = 0; mutar = true;
    await assert.rejects(capturar(raiz, peca.id, peca.versao), { codigo: 'versao-divergente' });
    mutar = false; peca.aprovada = false;
    await assert.rejects(capturar(raiz, peca.id, peca.versao), { codigo: 'sem-aceite' });
    peca.aprovada = true; const aceite = peca.aceite; peca.aceite = null;
    await assert.rejects(capturar(raiz, peca.id, peca.versao), { codigo: 'aceite-nao-sincronizado' });
    peca.aceite = aceite;
    const abort = new AbortController(); abort.abort();
    await assert.rejects(capturar(raiz, peca.id, peca.versao, { signal: abort.signal }), { codigo: 'prazo-esgotado' });
    assert.deepEqual(fs.readdirSync(raiz), ['docs'], 'falhas limpam snapshots incompletos');
    console.log('admin-snapshot-local: captura real, streaming, hash, aceite, corrida, abort e limpeza OK');
  } finally {
    const alvo = path.resolve(raiz);
    assert.equal(path.dirname(alvo), path.resolve(os.tmpdir()));
    assert.ok(path.basename(alvo).startsWith('grana-snapshot-teste-'));
    fs.rmSync(alvo, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
