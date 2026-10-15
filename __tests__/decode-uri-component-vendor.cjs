// decode-uri-component 0.5.0 em CommonJS (vendor/decode-uri-component), aprovado pelo
// autor em 15/10/2026 para fechar o GHSA-vcc3-ghjq-m6fr no caminho do expo-router.
// Prova no pacote REAL instalado: o query-string que o expo-router usa resolve a cópia
// do vendor, decodifica como antes, e a entrada maliciosa do advisory termina rápido.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const raiz = path.join(__dirname, '..');
const qsDir = path.dirname(require.resolve('query-string/package.json', { paths: [raiz] }));
const resolvido = fs.realpathSync(require.resolve('decode-uri-component', { paths: [qsDir] }));
assert.equal(resolvido, fs.realpathSync(path.join(raiz, 'vendor', 'decode-uri-component', 'index.js')),
  'o query-string carrega a cópia do vendor');

const decode = require(resolvido);
assert.equal(typeof decode, 'function', 'export CommonJS é a própria função, como o query-string 7 espera');
assert.equal(decode('a%20b'), 'a b');
assert.equal(decode('%C3%A5'), 'å');
assert.equal(decode('%E0%A4%A'), '%E0%A4%A', 'malformado não lança');

const qs = require(require.resolve('query-string', { paths: [raiz] }));
assert.deepEqual({ ...qs.parse('categoria=Alimenta%C3%A7%C3%A3o&x=%E0%A4%A') },
  { categoria: 'Alimentação', x: '%E0%A4%A' });
assert.equal(qs.stringify({ q: 'a b' }), 'q=a%20b');

// Entrada do tipo do advisory: muitos `%` malformados. A 0.2.2 levava tempo exponencial.
const ruim = '%E0%A4%A'.repeat(2000) + '%';
const t0 = Date.now();
decode(ruim);
assert.ok(Date.now() - t0 < 2000, `decodificação maliciosa demorou ${Date.now() - t0} ms`);
console.log('decode-uri-component-vendor: ok');
