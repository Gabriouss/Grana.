'use strict';
// Vigia de entrega dos pedidos de ajuste. Rode num terminal do Maestri (o servidor do atalho
// roda fora dele e não alcança agente nenhum):
//
//   node tools/admin-local/vigia-ajustes.cjs
//
// Faz claim na fila privada (lock e lease) e entrega pelo .maestri/enviar.sh. Grava um batimento
// a cada 5 s para a tela dizer quando ninguém está entregando. Pode haver mais de um vigia: o
// lease garante que cada pedido é reservado uma vez só. Encerre com Ctrl+C.
const { fila, pastaFila } = require('./marketing/ajustes-fila.cjs');
const batimento = require('./marketing/ajustes-vigia-estado.cjs');

const INTERVALO_MS = 5000;
function iniciar({ intervalo = INTERVALO_MS, pasta = pastaFila, log = (m) => console.log(m) } = {}) {
  const bater = () => { try { batimento.escrever(pasta); } catch { console.error(JSON.stringify({ codigo: 'vigia-batimento-falhou' })); } };
  // Independent timers: a delivery can take ~2 min and the heartbeat must keep beating meanwhile.
  bater(); const t1 = setInterval(bater, intervalo);
  const t2 = setInterval(() => void fila.tick({ receber: false }), intervalo); void fila.tick({ receber: false });
  log(`Vigia de ajustes ativo (pid ${process.pid}). Entrega pedidos novos ao agente. Ctrl+C encerra.`);
  return () => { clearInterval(t1); clearInterval(t2); };
}
if (require.main === module) iniciar();
module.exports = { iniciar };
