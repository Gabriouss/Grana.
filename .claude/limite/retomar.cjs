// Pré-execução da rotina "Retomada-<conta>" do Maestri (regra 27 do AGENTS.md).
// Sai com 0, e imprime o pedido de retomada, só quando há bloqueio registrado e já chegou a hora
// (15 min antes da redefinição). Em qualquer outro caso sai com 1 e a rotina não dispara.
const fs = require('fs');
const { PASTA, caminhoBloqueio, ler, hora } = require('./comum.cjs');

const conta = process.argv[2] || 'PH';
const b = ler(caminhoBloqueio(conta));
const agora = Date.now();
if (!b || agora < b.retomarEm) process.exit(1);
const arquivo = caminhoBloqueio(conta);
if (agora > b.retomarEm + 3 * 60 * 60 * 1000) { fs.unlinkSync(arquivo); process.exit(1); } // bloqueio velho: descarta
fs.renameSync(arquivo, arquivo.replace(/\.json$/, `.disparado-${agora}.json`));
process.stdout.write(
  `Retomada automática da conta ${conta} (regra 27): a janela ${b.janela} redefine em cerca de 15 min (bloqueio previsto até ${hora(b.retomarEm)}). ` +
  `Leia ${PASTA}/retomada-${conta}.md e retome o trabalho de onde parou, inclusive religando os agentes da conta ${conta} e o Codex revisor. ` +
  `O teto de 75% continua valendo nesta janela nova.`
);
