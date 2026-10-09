'use strict';
// Agent completion tool: arguments are data, never shell commands. Only "ler" prints the
// author's text, and only for the request whose lease the caller holds.
const { fila } = require('./ajustes-fila.cjs');
const USO = 'Uso: ajustes-cli.cjs ler|renovar|custo-consumir pedidoId leaseId | concluir|desatualizado pedidoId leaseId pecaId [sha1novo commit] | custo pedidoId leaseId pecaId --estimativa JSON | custo-autorizado pedidoId leaseId --evidencia texto | custo-recusado pedidoId leaseId [--seguir-local]';
const recibo = (r) => ({ id: r.id, estado: r.estado, versaoAlvo: r.versaoAlvo, versaoCorrigida: r.versaoCorrigida });
async function main(args) {
  const [acao, pedidoId, leaseId, pecaId, versao, commit] = args;
  if (!pedidoId || !leaseId) throw new Error(USO);
  if (acao === 'ler') return fila.lerPedido(pedidoId, leaseId);
  if (acao === 'renovar') { const r = await fila.renovar(pedidoId, leaseId); return { id: r.id, estado: r.estado, expiraEm: r.lease.expiraEm }; }
  if (acao === 'custo-autorizado') {
    if (args.length !== 5 || args[3] !== '--evidencia') throw new Error(USO);
    return recibo(await fila.autorizarCusto(pedidoId, leaseId, args[4]));
  }
  if (acao === 'custo-recusado') {
    if (args.length !== 3 && !(args.length === 4 && args[3] === '--seguir-local')) throw new Error(USO);
    return recibo(await fila.recusarCusto(pedidoId, leaseId, { seguirLocal: args[3] === '--seguir-local' }));
  }
  if (acao === 'custo-consumir') {
    if (args.length !== 3) throw new Error(USO);
    return fila.consumirAutorizacaoCusto(pedidoId, leaseId);
  }
  const estados = { concluir: 'corrigido-aguardando-aceite', custo: 'aguardando-aprovacao-de-custo', desatualizado: 'desatualizado' };
  if (!estados[acao] || !pecaId) throw new Error(USO);
  let estimativa;
  if (acao === 'custo') {
    if (args.length !== 6 || args[4] !== '--estimativa') throw new Error(USO);
    try { estimativa = JSON.parse(args[5]); } catch { throw new Error(USO); }
  }
  const r = await fila.marcar(pedidoId, leaseId, estados[acao], { pecaId, versao, commit, estimativa });
  return recibo(r);
}
if (require.main === module) main(process.argv.slice(2)).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.codigo || (e.message === USO ? USO : 'ajuste-cli-falhou')); process.exitCode = 1; });
module.exports = { main };
