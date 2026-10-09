'use strict';
// Exercita o scripts/verificar-apk.mjs REAL (o mesmo do workflow "Publicar APK") com
// APKs montados e assinados em memoria: so passa o pacote do Grana. assinado pelo
// certificado fixado (achado R1 do Lynx, 08/10/2026). Cada fixture nasce aqui, com
// chave gerada na hora, para nao versionar APK nem chave privada. A montagem do
// bloco de assinatura e do resumo de conteudo e escrita de novo neste arquivo, de
// proposito: se usasse a funcao do modulo, um erro nela passaria dos dois lados.
// A conferencia cruzada com o `apksigner` no APK publicado roda quando
// GRANA_APK_REAL aponta para o arquivo (fora da CI, que nao baixa 170 MB).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'verificar-apk.mjs');

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const lp = (...partes) => { const c = Buffer.concat(partes); return Buffer.concat([u32(c.length), c]); };

// ---- AndroidManifest.xml binario minimo --------------------------------------
function axml({ tag = 'manifest', atributos = { package: 'com.gabriouss.grana', versionName: '1.2.3' }, extras = [], utf8 = false } = {}) {
  const textos = [tag, ...Object.keys(atributos), ...Object.values(atributos), ...extras];
  const dados = textos.map((t) => utf8
    ? Buffer.concat([Buffer.from([t.length, Buffer.byteLength(t)]), Buffer.from(t, 'utf8'), Buffer.from([0])])
    : Buffer.concat([u16(t.length), Buffer.from(t, 'utf16le'), u16(0)]));
  const offsets = []; let o = 0; for (const d of dados) { offsets.push(u32(o)); o += d.length; }
  let corpo = Buffer.concat(dados); corpo = Buffer.concat([corpo, Buffer.alloc((4 - (corpo.length % 4)) % 4)]);
  const inicioTextos = 28 + 4 * textos.length;
  const pool = Buffer.concat([u16(1), u16(28), u32(inicioTextos + corpo.length), u32(textos.length), u32(0), u32(utf8 ? 0x100 : 0), u32(inicioTextos), u32(0), ...offsets, corpo]);
  const nomes = Object.keys(atributos);
  const attrs = nomes.map((n, i) => { const v = 1 + nomes.length + i; return Buffer.concat([u32(0xffffffff), u32(1 + i), u32(v), u16(8), Buffer.from([0, 3]), u32(v)]); });
  const elemento = Buffer.concat([u16(0x0102), u16(16), u32(36 + 20 * attrs.length), u32(1), u32(0xffffffff),
    u32(0xffffffff), u32(0), u16(20), u16(20), u16(attrs.length), u16(0), u16(0), u16(0), ...attrs]);
  return Buffer.concat([u16(3), u16(8), u32(8 + pool.length + elemento.length), pool, elemento]);
}

// ---- zip sem compressao -------------------------------------------------------
function zip(arquivos) {
  const locais = [], centrais = []; let pos = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const n = Buffer.from(nome);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(conteudo.length, 18); local.writeUInt32LE(conteudo.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(conteudo.length, 20); central.writeUInt32LE(conteudo.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(pos, 42);
    locais.push(local, n, conteudo); centrais.push(central, n); pos += 30 + n.length + conteudo.length;
  }
  const entradas = Buffer.concat(locais), dir = Buffer.concat(centrais), total = Object.keys(arquivos).length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(total, 8); eocd.writeUInt16LE(total, 10); eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(entradas.length, 16);
  return { entradas, dir, eocd };
}
const juntar = ({ entradas, dir, eocd }, bloco = Buffer.alloc(0)) => {
  const fim = Buffer.from(eocd); fim.writeUInt32LE(entradas.length + bloco.length, 16);
  return Buffer.concat([entradas, bloco, dir, fim]);
};

// ---- certificado X.509 autoassinado, em DER, escrito a mao ---------------------
const der = (tag, ...c) => { const b = Buffer.concat(c); const t = b.length < 128 ? [b.length] : b.length < 256 ? [0x81, b.length] : [0x82, b.length >> 8, b.length & 255]; return Buffer.concat([Buffer.from([tag, ...t]), b]); };
const OID_RSA_SHA256 = Buffer.from('06092a864886f70d01010b0500', 'hex'), OID_ECDSA_SHA256 = Buffer.from('06082a8648ce3d040302', 'hex');
function identidade(tipo, nome) {
  const { publicKey, privateKey } = tipo === 'ec' ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }) : crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const alg = der(0x30, tipo === 'ec' ? OID_ECDSA_SHA256 : OID_RSA_SHA256);
  const dn = der(0x30, der(0x31, der(0x30, Buffer.from('0603550403', 'hex'), der(0x0c, Buffer.from(nome)))));
  const validade = der(0x30, der(0x17, Buffer.from('260101000000Z')), der(0x17, Buffer.from('360101000000Z')));
  const tbs = der(0x30, Buffer.from('a003020102', 'hex'), der(0x02, Buffer.from([1])), alg, dn, validade, dn, spki);
  const cert = der(0x30, tbs, alg, der(0x03, Buffer.from([0]), crypto.sign('sha256', tbs, privateKey)));
  return { privateKey, spki, cert, sha: crypto.createHash('sha256').update(cert).digest('hex') };
}

// ---- assinatura v2/v3 ----------------------------------------------------------
function resumo({ entradas, dir, eocd }, hash) {
  const MB = 1024 * 1024, partes = [];
  for (const s of [entradas, dir, eocd]) for (let i = 0; i < s.length; i += MB) { const p = s.subarray(i, i + MB); partes.push(crypto.createHash(hash).update(Buffer.concat([Buffer.from([0xa5]), u32(p.length), p])).digest()); }
  return crypto.createHash(hash).update(Buffer.concat([Buffer.from([0x5a]), u32(partes.length), ...partes])).digest();
}
const ALG = { 0x0101: ['sha256', (k) => ({ key: k, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 })], 0x0103: ['sha256', (k) => k], 0x0104: ['sha512', (k) => k], 0x0201: ['sha256', (k) => k] };
/** `o` permite montar blocos FALSOS: certificado de um, chave de outro, etc. */
function assinar(z, id, o = {}) {
  const alg = o.alg ?? (id.spki.length < 200 ? 0x0201 : 0x0103), v3 = o.v3 === true;
  const [hash, chave] = ALG[alg];
  const dadosAssinados = Buffer.concat([lp(lp(u32(alg), lp(o.resumo ?? resumo(z, hash)))), lp(lp(o.cert ?? id.cert)), ...(v3 ? [u32(24), u32(0x7fffffff)] : []), lp()]);
  const assinatura = crypto.sign(hash, dadosAssinados, chave((o.assinaCom ?? id).privateKey));
  const assinante = Buffer.concat([lp(dadosAssinados), ...(v3 ? [u32(24), u32(0x7fffffff)] : []), lp(lp(u32(alg), lp(assinatura))), lp(o.spki ?? id.spki)]);
  const valor = lp(lp(assinante));
  const par = Buffer.concat([u64(4 + valor.length), u32(v3 ? 0xf05368c0 : 0x7109871a), valor]);
  const tamanho = par.length + 24;
  return Buffer.concat([u64(tamanho), par, u64(tamanho), Buffer.from('APK Sig Block 42')]);
}

(async () => {
  const m = await import(pathToFileURL(SCRIPT).href);
  let n = 0;
  const test = (nome, fn) => { fn(); n++; console.log('OK ' + nome); };
  const grana = identidade('ec', 'grana-teste'), outro = identidade('ec', 'outro'), rsa = identidade('rsa', 'rsa-teste');
  const base = (manifesto = axml()) => zip({ 'AndroidManifest.xml': manifesto, 'classes.dex': Buffer.from('dex\n035\0 codigo do app') });
  const apk = (manifesto, id = grana, o) => { const z = base(manifesto); return juntar(z, assinar(z, id, o)); };
  const problemas = (buf, versao = '1.2.3', pins = [grana.sha]) => m.analisar(buf, versao, pins).problemas;
  const recusa = (buf, padrao, versao, pins) => { const p = problemas(buf, versao, pins); assert.ok(p.some((x) => padrao.test(x)), 'esperava ' + padrao + ', veio ' + JSON.stringify(p)); };

  test('o certificado fixado e o do Grana. e o pacote e o do app', () => {
    assert.deepEqual([...m.CERTIFICADOS_GRANA], ['c902cf9ec1e9a9ccfcd05189136f3de35bfa4c78c3f5ad524d4029622a17ef61']);
    assert.equal(m.PACOTE_GRANA, 'com.gabriouss.grana'); assert.ok(Object.isFrozen(m.CERTIFICADOS_GRANA));
  });

  test('APK do pacote certo, assinado pelo certificado aceito: passa (EC, RSA PKCS1, RSA-PSS, SHA-512, v3, manifesto UTF-8)', () => {
    assert.deepEqual(problemas(apk()), []);
    assert.deepEqual(m.analisar(apk(), '1.2.3', [grana.sha]).certificados, [grana.sha]);
    for (const alg of [0x0103, 0x0101, 0x0104]) assert.deepEqual(problemas(apk(undefined, rsa, { alg }), '1.2.3', [rsa.sha]), [], 'alg ' + alg.toString(16));
    assert.deepEqual(problemas(apk(undefined, grana, { v3: true })), []);
    assert.deepEqual(problemas(apk(axml({ utf8: true }))), []);
  });

  test('assinatura valida de OUTRO certificado e recusada, inclusive com a lista padrao', () => {
    recusa(apk(undefined, outro), /certificado que não é o do Grana/);
    // sem lista = a padrao do modulo, com o certificado do Grana. de verdade
    assert.ok(m.analisar(apk(), '1.2.3').problemas.some((x) => /certificado que não é o do Grana/.test(x)));
    assert.ok(problemas(apk(undefined, outro)).join().includes(outro.sha), 'diz qual certificado veio');
  });

  test('bloco FALSO com o certificado certo colado: recusado (so ler o certificado nao basta)', () => {
    // certificado do Grana., chave publica e assinatura do atacante
    recusa(apk(undefined, outro, { cert: grana.cert }), /chave pública diferente da do certificado/);
    // certificado e chave publica do Grana., assinatura feita com a chave do atacante
    recusa(apk(undefined, grana, { assinaCom: outro }), /assinatura não confere com a chave/);
    // em nenhum dos dois o certificado do Grana. chega a ser devolvido
    assert.deepEqual(m.analisar(apk(undefined, outro, { cert: grana.cert }), '1.2.3', [grana.sha]).certificados, []);
  });

  test('conteudo trocado depois de assinado e recusado', () => {
    const b = Buffer.from(apk()); const i = b.indexOf('codigo do app'); b[i] ^= 1;
    recusa(b, /conteúdo alterado depois de assinado/);
    // arquivo acrescentado ao zip reaproveitando o bloco de assinatura do original
    const z = base(), z2 = zip({ 'AndroidManifest.xml': axml(), 'classes.dex': Buffer.from('dex\n035\0 codigo do app'), 'lib/extra.so': Buffer.from('carga') });
    recusa(juntar(z2, assinar(z, grana)), /conteúdo alterado depois de assinado/);
    recusa(apk(undefined, grana, { resumo: Buffer.alloc(32, 7) }), /conteúdo alterado depois de assinado/);
  });

  test('sem assinatura, com a marca fora do lugar ou com bloco quebrado: recusado', () => {
    recusa(juntar(base()), /assinatura recusada: sem bloco de assinatura/);
    // a marca solta dentro de um arquivo nao e o bloco que o Android le
    const z = zip({ 'AndroidManifest.xml': axml(), 'classes.dex': Buffer.from('APK Sig Block 42 \x1a\x87\x09\x71') });
    recusa(juntar(z), /assinatura recusada/);
    const b = Buffer.from(apk()); const fim = b.indexOf('APK Sig Block 42'); b.writeBigUInt64LE(5n, fim - 8);
    recusa(b, /assinatura recusada/);
    const t = base(), bloco = assinar(t, grana); recusa(juntar(t, Buffer.concat([bloco.subarray(0, 40), bloco.subarray(60)])), /assinatura recusada/);
    recusa(Buffer.from('um arquivo qualquer'), /não é um zip válido/);
  });

  test('outro pacote e recusado, mesmo citando o pacote do Grana. em outro lugar do manifesto', () => {
    recusa(apk(axml({ atributos: { package: 'com.outro.app', versionName: '1.2.3' } })), /o pacote do manifesto não é com\.gabriouss\.grana/);
    recusa(apk(axml({ atributos: { package: 'com.outro.app', versionName: '1.2.3' }, extras: ['com.gabriouss.grana'] })), /o pacote do manifesto não é/);
    recusa(apk(axml({ atributos: { package: 'com.gabriouss.grana.falso', versionName: '1.2.3' } })), /o pacote do manifesto não é/);
    recusa(apk(axml({ atributos: { versionName: '1.2.3' }, extras: ['package', 'com.gabriouss.grana'] })), /o pacote do manifesto não é/);
    recusa(apk(axml({ tag: 'application' })), /fora do formato esperado/);
    recusa(apk(Buffer.from('<manifest package="com.gabriouss.grana"/>')), /fora do formato esperado/);
  });

  test('versao e a do atributo versionName, exata', () => {
    recusa(apk(), /não declara a versão 1\.2\.4/, '1.2.4');
    recusa(apk(), /não declara a versão 1\.2$/, '1.2'); // pedaco da versao passava na busca por texto
    recusa(apk(axml({ atributos: { package: 'com.gabriouss.grana', versionName: '9.9.9' }, extras: ['1.2.3'] })), /não declara a versão 1\.2\.3/);
  });

  test('linha de comando: recusa sai com 1, sem escrever saida; importar o modulo nao dispara a CLI', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verificar-apk-'));
    const arq = path.join(dir, 'grana.apk'), out = path.join(dir, 'output'); fs.writeFileSync(out, '');
    // pacote e versao certos, assinatura valida, certificado que nao e o do Grana.: o caso do R1
    fs.writeFileSync(arq, apk(undefined, outro));
    const r = spawnSync(process.execPath, [SCRIPT, arq, '1.2.3'], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } });
    assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /APK RECUSADO/); assert.match(r.stderr, /certificado que não é o do Grana/);
    assert.equal(fs.readFileSync(out, 'utf8'), '', 'nenhum sha256 vai para o passo de publicar'); assert.equal(r.stdout, '');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const real = process.env.GRANA_APK_REAL;
  if (real && fs.existsSync(real)) {
    test('APK publicado de verdade: aceito com os certificados padrao' + (process.env.GRANA_APK_REAL_VERSAO ? '' : ' (so assinatura)'), () => {
      const buf = fs.readFileSync(real), a = m.conferirAssinatura(buf);
      assert.deepEqual(a.certificados, [...m.CERTIFICADOS_GRANA], JSON.stringify(a));
      if (process.env.GRANA_APK_REAL_VERSAO) assert.deepEqual(m.analisar(buf, process.env.GRANA_APK_REAL_VERSAO).problemas, []);
      const adulterado = Buffer.from(buf); adulterado[Math.floor(buf.length / 3)] ^= 1;
      assert.match(m.conferirAssinatura(adulterado).erro, /conteúdo alterado/);
    });
  } else console.log('-- APK real nao conferido nesta execucao (defina GRANA_APK_REAL para conferir)');

  console.log(`verificar-apk: ${n} grupos verdes; modulo real, fixtures assinadas em memoria`);
})().catch((e) => { console.error(e); process.exit(1); });
