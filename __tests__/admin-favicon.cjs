'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const origem = fs.readFileSync(path.join(root, 'tools/admin-local/seguranca.cjs'), 'utf8');
function load(juncao = false) {
  const m = { exports: {} };
  vm.runInNewContext(origem, {
    module: m, exports: m.exports, process: { env: {} }, Date, Buffer, __dirname: path.join(root, 'tools/admin-local'),
    require: (id) => id === './config.cjs' ? { RAIZ: root, RAIZ_DADOS: root, PORTA: 4317 }
      : id === './auditoria.cjs' ? { registrar() {} }
        : id === 'fs' && juncao ? { ...fs, realpathSync: (p) => String(p).endsWith(path.join('public', 'favicon.svg')) ? path.join(root, '.env') : fs.realpathSync(p) } : require(id),
  });
  return m.exports;
}
const seg = load();
const r = seg.resolverEstatico('/favicon.svg');
assert.equal(r.arquivo, fs.realpathSync(path.join(root, 'public/favicon.svg')));
assert.equal(r.publico, true); assert.equal(r.mime, 'image/svg+xml');
assert.match(r.extras['Content-Security-Policy'], /sandbox/);
for (const url of ['/public/favicon.svg', '/public/.env', '/favicon.svg:stream', '/favicon.svg/../.env', '/favicon.svg\\.env']) assert.equal(seg.resolverEstatico(url), null, url);
assert.equal(load(true).resolverEstatico('/favicon.svg'), null, 'junction fora do arquivo exato recusada');
console.log('admin-favicon: resolver real, arquivo exato publico, pasta/traversal/junction recusados; zero env/rede');
