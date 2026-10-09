'use strict';
// Impressão dos módulos do servidor (.cjs) no disco. O servidor guarda a de quando subiu; se a
// atual for outra, a janela aberta roda código antigo e a tela avisa para reabrir pelo atalho.
// (A pasta web/ é servida do disco a cada pedido, então não entra: ela nunca fica velha.)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function arquivos(dir, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'web' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, saida); else if (e.name.endsWith('.cjs')) saida.push(p);
  }
  return saida;
}
function impressao(dir = __dirname) {
  const h = crypto.createHash('sha1');
  for (const f of arquivos(dir).sort()) { const s = fs.statSync(f); h.update(`${path.relative(dir, f)}:${s.size}:${Math.floor(s.mtimeMs)}\n`); }
  return h.digest('hex');
}
const inicial = impressao();
module.exports = { impressao, desatualizado: () => impressao() !== inicial };
