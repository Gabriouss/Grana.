// Linha de status: grava os limites de uso da conta (janela de 5 h e semanal)
// para a trava de 75% (guarda.cjs) e a rotina de retomada (retomar.cjs) lerem.
// Em terminal do Orca, devolve a linha de status do próprio Orca depois de gravar.
const fs = require('fs');
const os = require('os');
const { lerConta, caminhoEstado, salvar } = require('./comum.cjs');

let entrada = '';
process.stdin.on('data', (c) => (entrada += c));
process.stdin.on('end', () => {
  let j = {};
  try { j = JSON.parse(entrada); } catch {}
  const conta = lerConta();
  const rl = j.rate_limits || {};
  const janela = (w) => w && { usado: Number(w.used_percentage), volta: w.resets_at };
  const estado = {
    conta,
    cinco_horas: janela(rl.five_hour),
    semanal: janela(rl.seven_day),
    lido_em: new Date().toISOString(),
  };
  if (estado.cinco_horas || estado.semanal) salvar(caminhoEstado(conta), estado);

  const orca = os.homedir() + '/.orca/agent-hooks/claude-statusline.cmd';
  if (process.env.ORCA_AGENT_HOOK_PORT && fs.existsSync(orca)) {
    const r = require('child_process').spawnSync(`"${orca}"`, { input: entrada, shell: true, encoding: 'utf8' });
    if (r.stdout) return process.stdout.write(r.stdout);
  }
  const fmt = (n, w) => (w && Number.isFinite(w.usado) ? `${n} ${Math.round(w.usado)}%` : `${n} ?`);
  process.stdout.write(`${conta} · ${fmt('5h', estado.cinco_horas)} · ${fmt('sem', estado.semanal)} · teto 75%`);
});
