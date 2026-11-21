// Pedido do autor (21/11/2026): "pedi para remover e não foi removido". O selo
// "oculto" ao lado de "Início" sai; o olho cortado no cabeçalho já mostra o
// estado. O selo "exemplo" do modo demo continua. Trava no fonte, em todas as
// telas, para o selo não voltar por outro caminho.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.resolve(__dirname, '..');
function arquivos(dir, acc = []) {
  for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(rel, acc); else if (/\.tsx$/.test(e.name)) acc.push(rel);
  }
  return acc;
}
const comSelo = [...arquivos('app'), ...arquivos('components')]
  .filter(f => />\s*oculto\s*<\/Text>/.test(fs.readFileSync(path.join(raiz, f), 'utf8')));
assert.deepEqual(comSelo, [], 'selo "oculto" voltou em: ' + comSelo.join(', '));
const inicio = fs.readFileSync(path.join(raiz, 'app', '(app)', 'index.tsx'), 'utf8');
assert.match(inicio, /isDemoMode && !MODO_TESTE \? <Text style=\{styles\.demoFlag\}>exemplo<\/Text>/, 'selo "exemplo" do modo demo sumiu');
console.log('InicioSemSeloOculto OK');
