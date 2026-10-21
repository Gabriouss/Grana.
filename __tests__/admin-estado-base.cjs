// AUD-06 (21/10/2026): toda caixa de estado do painel leva a base .estado junto do modificador. O erro de
// Feedbacks usava só "estado-erro" e ficava sem o padding, a borda e o espaçamento do componente
// compartilhado; a mesma falta estava em caixas de "ausente" e "carregando" de outras telas. Lê o fonte
// real de app.js e de telas/*.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.resolve(__dirname, '../tools/admin-local/web');
const arquivos = ['app.js', ...fs.readdirSync(path.join(WEB, 'telas')).filter((f) => f.endsWith('.js')).map((f) => `telas/${f}`)];
const MODIFICADOR = /class:\s*[`'"]([^`'"]*\bestado-(?:erro|vazio|carregando|ausente)\b[^`'"]*)[`'"]/g;
const vistos = [], semBase = [];
for (const f of arquivos) {
  for (const m of fs.readFileSync(path.join(WEB, f), 'utf8').matchAll(MODIFICADOR)) {
    vistos.push(f);
    if (!/(^|\s)estado(\s|$)/.test(m[1])) semBase.push(`${f}: "${m[1]}"`);
  }
}
assert.ok(vistos.includes('telas/feedbacks.js'), 'a busca alcança o erro de Feedbacks');
assert.deepEqual(semBase, [], `caixa de estado sem a base .estado:\n${semBase.join('\n')}`);

// O carregando de Feedbacks segue a marcação do componente (texto em .estado-texto, onde fica o ponto pulsante).
const feedbacks = fs.readFileSync(path.join(WEB, 'telas/feedbacks.js'), 'utf8');
assert.match(feedbacks, /class: 'estado estado-carregando', role: 'status', 'aria-busy': 'true' \}, h\('p', \{ class: 'estado-texto'/);
assert.match(feedbacks, /class: 'estado estado-erro', role: 'alert' \},\s*h\('p', \{ class: 'estado-texto', texto: 'Não foi possível ler os feedbacks\. Isto não significa que não haja nenhum\.' \}\),\s*h\('button'/);
console.log(`admin-estado-base: ${vistos.length} caixas de estado em ${new Set(vistos).size} arquivos, todas com a base .estado OK`);
