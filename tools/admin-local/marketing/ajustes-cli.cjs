'use strict';
// Agent completion tool: arguments are data, never shell commands. Only "ler" prints the
// author's text, and only for the request whose lease the caller holds.
const { fila } = require('./ajustes-fila.cjs');
const USO = 'Uso: ajustes-cli.cjs ler|renovar pedidoId leaseId | concluir|custo|desatualizado pedidoId leaseId pecaId [sha1novo commit]';
async function main(args) {
  const [acao, pedidoId, leaseId, pecaId, versao, commit] = args;
  if (!pedidoId || !leaseId) throw new Error(USO);
  if (acao === 'ler') return fila.lerPedido(pedidoId, leaseId);
  if (acao === 'renovar') { const r = await fila.renovar(pedidoId, leaseId); return { id: r.id, estado: r.estado, expiraEm: r.lease.expiraEm }; }
  const estados = { concluir: 'corrigido-aguardando-aceite', custo: 'aguardando-aprovacao-de-custo', desatualizado: 'desatualizado' };
  if (!estados[acao] || !pecaId) throw new Error(USO);
  const r = await fila.marcar(pedidoId, leaseId, estados[acao], { pecaId, versao, commit });
  return { id: r.id, estado: r.estado, versaoAlvo: r.versaoAlvo, versaoCorrigida: r.versaoCorrigida };
}
if (require.main === module) main(process.argv.slice(2)).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.codigo || (e.message === USO ? USO : 'ajuste-cli-falhou')); process.exitCode = 1; });
module.exports = { main };
