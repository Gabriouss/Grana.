// Linha de status: grava os limites de uso da conta (janela de 5 h e semanal)
// para a trava de 75% (guarda.cjs) e a rotina de retomada (retomar.cjs) lerem.
const { lerConta, caminhoEstado, salvar } = require('./comum.cjs');

let entrada = '';
process.stdin.on('data', (c) => (entrada += c));
process.stdin.on('end', () => {
  let j = {};
  try { j = JSON.parse(entrada); } catch {}
  const conta = lerConta();
  salvar(caminhoEstado(conta) + '.bruto.json', j);
  const rl = j.rate_limits || {};
  const janela = (w) => w && { usado: Number(w.used_percentage), volta: w.resets_at };
  const estado = {
    conta,
    cinco_horas: janela(rl.five_hour),
    semanal: janela(rl.seven_day),
    lido_em: new Date().toISOString(),
  };
  if (estado.cinco_horas || estado.semanal) salvar(caminhoEstado(conta), estado);
  const fmt = (n, w) => (w && Number.isFinite(w.usado) ? `${n} ${Math.round(w.usado)}%` : `${n} ?`);
  process.stdout.write(`${conta} · ${fmt('5h', estado.cinco_horas)} · ${fmt('sem', estado.semanal)} · teto 75%`);
});
