'use strict';
const path = require('node:path');
const { ensaiar } = require('./meta-ensaio.cjs');
function executar(args = process.argv.slice(2)) {
  // Nenhum parâmetro de modo real, token ou URL. Fonte fixa: este repositório.
  if (args.length) return { ok: false, codigo: 'somente-ensaio-sem-argumentos' };
  try { return { ok: true, dados: ensaiar(path.resolve(__dirname, '../../..')) }; }
  catch { return { ok: false, codigo: 'ensaio-indisponivel', mensagem: 'Não foi possível ler o calendário e os aceites. Confira os arquivos locais.' }; }
}
if (require.main === module) {
  const r = executar();
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  if (!r.ok) process.exitCode = 1;
}
module.exports = { executar };
