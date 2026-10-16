// braces 3.0.3 e node-forge 1.4.0 em cópia corrigida no vendor/ (V-3, 15/10/2026). Nenhum
// dos dois tinha versão corrigida publicada: GHSA-vfj7-8cjw-p6xm (braces, estouro de pilha com
// chaves aninhadas) e GHSA-86w9-cpqp-85rv (node-forge, assinatura RSA forjada com lixo dentro do
// DigestAlgorithm). Prova no pacote REAL que os consumidores carregam: micromatch e o
// @expo/code-signing-certificates resolvem a cópia do vendor, a falha do advisory não reproduz,
// e o uso normal continua igual.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const raiz = path.join(__dirname, '..');
const real = (p) => fs.realpathSync(p);
const resolverDe = (pacote, consumidor) => {
  const dir = path.dirname(require.resolve(`${consumidor}/package.json`, { paths: [raiz] }));
  return real(require.resolve(pacote, { paths: [dir] }));
};

// ---- braces ----
const bracesIdx = resolverDe('braces', 'micromatch');
assert.equal(bracesIdx, real(path.join(raiz, 'vendor', 'braces', 'index.js')), 'o micromatch carrega a cópia do vendor');
const braces = require(bracesIdx);

assert.deepEqual(braces.expand('a/{1..3}/{x,y}'), ['a/1/x', 'a/1/y', 'a/2/x', 'a/2/y', 'a/3/x', 'a/3/y']);
assert.deepEqual(braces('{a,b}/**/*.{js,ts}'), ['(a|b)/**/*.(js|ts)']);
assert.doesNotThrow(() => braces.compile('{'.repeat(64) + 'x,y' + '}'.repeat(64)));
const mm = require(require.resolve('micromatch', { paths: [raiz] }));
assert.equal(mm.isMatch('app/index.tsx', 'app/**/*.{ts,tsx}'), true);
assert.equal(mm.isMatch('app/index.js', 'app/**/*.{ts,tsx}'), false);

// Entrada do advisory: aninhamento profundo abaixo do limite de 10.000 caracteres. A 3.0.3
// estourava a pilha (RangeError não tratado derruba o processo); agora é recusa controlada.
const fundo = 4990;
for (const op of ['compile', 'expand']) {
  assert.throws(() => braces[op]('{'.repeat(fundo) + 'a,b' + '}'.repeat(fundo)), SyntaxError, `braces.${op} recusa aninhamento fundo`);
}
assert.throws(() => braces('('.repeat(fundo) + 'x' + ')'.repeat(fundo)), SyntaxError, 'parênteses fundos também');
let ast = { type: 'text', value: 'x' };
for (let i = 0; i < 12000; i++) ast = { type: 'root', nodes: [ast] };
for (const op of ['compile', 'expand', 'stringify']) assert.throws(() => braces[op](ast), SyntaxError, `AST fundo em ${op}`);

// ---- node-forge ----
const forgeIdx = resolverDe('node-forge', '@expo/code-signing-certificates');
assert.equal(forgeIdx, real(path.join(raiz, 'vendor', 'node-forge', 'lib', 'index.js')), 'o code-signing do Expo carrega a cópia do vendor');
assert.equal(resolverDe('node-forge', '@expo/cli'), forgeIdx, 'o @expo/cli também');
const forge = require(forgeIdx);
const { BigInteger } = forge.jsbn;
const hex = forge.util.binary.hex.decode;

// Chave e vetor do teste de regressão do PR digitalbazaar/forge#1152 (e = 3).
const N = new BigInteger(
  'E932AC92252F585B3A80A4DD76A897C8B7652952FE788F6EC8DD640587A1EE56' +
  '47670A8AD4C2BE0F9FA6E49C605ADF77B5174230AF7BD50E5D6D6D6D28CCF0A8' +
  '86A514CC72E51D209CC772A52EF419F6A953F3135929588EBE9B351FCA61CED7' +
  '8F346FE00DBB6306E5C2A4C6DFC3779AF85AB417371CF34D8387B9B30AE46D7A' +
  '5FF5A655B8D8455F1B94AE736989D60A6F2FD5CADBFFBD504C5A756A2E6BB5CE' +
  'CC13BCA7503F6DF8B52ACE5C410997E98809DB4DC30D943DE4E812A47553DCE5' +
  '4844A78E36401D13F77DC650619FED88D8B3926E3D8E319C80C744779AC5D6AB' +
  'E252896950917476ECE5E8FC27D5F053D6018D91B502C4787558A002B9283DA7', 16);
const e = new BigInteger('3');
const publicKey = forge.pki.rsa.setPublicKey(N, e);
const digest = () => { const md = forge.md.sha256.create(); md.update('hello world!'); return md.digest().getBytes(); };

const forjada = hex(
  'a4ae63dd5e7712b78f4870d0f51e294df5503d4f16c5d27ae33370981fb57f0de49f' +
  '50f3d6a04666774cd984cd13972db9bf8e12bd294ef0ddc916c7c86cbae63efd7b6b' +
  '97885e69760c208a40f1aecc76a90d7af5145177efce1bb55807a8d05c20b1596753' +
  'ba710642fc9acdde6c160232654662c77cc4466c8257a38edb49f894e8845d0fd987' +
  'b857ced88f4b62505a080bd87ef700d35d392a6e8f6fde34250c50b86fae606cb551' +
  '215e8f4813239b77651d5565ad453698c071d48c31e8e526fb4a37610f64b3e1fb8e' +
  '5be5898e408ad08197a0947794a530b54f84485377ce4a7488ed485ce4e5e105dd89' +
  '698a472f390c3b1b76bc16b73276c4d1c81d');
assert.throws(
  () => publicKey.verify(digest(), forjada, undefined, { _parseAllDigestBytes: true, _skipPaddingChecks: true }),
  /does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo value/,
  'assinatura com lixo no DigestAlgorithm é recusada');

// Assinatura legítima continua válida (chave nova, e = 3 e e = 65537), e adulterada continua falsa.
for (const expoente of [3, 65537]) {
  const par = forge.pki.rsa.generateKeyPair({ bits: 1024, e: expoente });
  const md = forge.md.sha256.create();
  md.update('hello world!');
  const assinatura = par.privateKey.sign(md);
  assert.equal(par.publicKey.verify(md.digest().getBytes(), assinatura), true, `assinatura legítima com e = ${expoente}`);
  const outra = forge.md.sha256.create();
  outra.update('hello world?');
  assert.equal(par.publicKey.verify(outra.digest().getBytes(), assinatura), false, 'mensagem trocada não verifica');
}

console.log('vendor-braces-node-forge: ok');
