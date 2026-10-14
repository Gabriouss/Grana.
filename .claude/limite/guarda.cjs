// Gancho da regra 27 do AGENTS.md: a conta para em 75% do limite (5 h ou semanal)
// e só volta 15 min antes da redefinição.
//   node guarda.cjs pre   -> PreToolUse: nega a ferramenta enquanto a conta estiver travada
//   node guarda.cjs post  -> PostToolUse: avisa a partir de 70% para fechar o trabalho a tempo
const fs = require('fs');
const path = require('path');
const { PASTA, TETO, lerConta, caminhoEstado, caminhoBloqueio, ler, salvar, avaliar, hora } = require('./comum.cjs');

const AVISO = 70;
const modo = process.argv[2];
let entrada = '';
process.stdin.on('data', (c) => (entrada += c));
process.stdin.on('end', () => {
  try { principal(); } catch (e) { process.stderr.write(`guarda de limite: ${e.message}\n`); }
});

function principal() {
  const conta = lerConta();
  if (/^(conta-|desconhecida)/.test(conta)) return; // a regra 27 vale para conta com apelido em contas.json (a PH)
  const estado = ler(caminhoEstado(conta));
  if (!estado) return; // sem leitura ainda: não trava (a linha de status grava na primeira resposta)
  const r = avaliar(estado);

  if (modo === 'pre' && r.travado) {
    const anterior = ler(caminhoBloqueio(conta));
    if (!anterior || anterior.retomarEm !== r.retomarEm) {
      salvar(caminhoBloqueio(conta), { conta, janela: r.janela, usado: r.usado, retomarEm: r.retomarEm, retomar: hora(r.retomarEm), criado_em: new Date().toISOString() });
    }
    const motivo =
      `LIMITE DA CONTA ${conta}: janela ${r.janela} em ${Math.round(r.usado)}%, teto de ${TETO}% (regra 27 do AGENTS.md). ` +
      `Nenhuma ferramenta roda até ${hora(r.retomarEm)}, 15 min antes da redefinição. ` +
      `Encerre o turno agora, sem tentar outra ferramenta: diga ao autor em uma linha onde parou e a hora da volta. ` +
      `A rotina "Retomada-${conta}" do Maestri acorda o Orquestrador Supremo nessa hora, ` +
      `e ele retoma por ${PASTA}/retomada-${conta}.md.`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo } }));
    return;
  }

  if (modo === 'post' && !r.travado) {
    const alto = [['5 horas', estado.cinco_horas], ['semanal', estado.semanal]].filter(([, w]) => w && w.usado >= AVISO && w.usado < TETO);
    if (!alto.length) return;
    const marca = path.join(PASTA, `${conta}.aviso`);
    try { if (Date.now() - fs.statSync(marca).mtimeMs < 5 * 60 * 1000) return; } catch {}
    fs.writeFileSync(marca, '');
    const txt = alto.map(([n, w]) => `${n} em ${Math.round(w.usado)}%`).join(', ');
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext:
      `AVISO DE LIMITE (conta ${conta}): ${txt}; a trava fecha em ${TETO}%. Feche agora: commit do que estiver pronto (ou parcial, dito na mensagem), ` +
      `atualize ${PASTA}/retomada-${conta}.md com onde parou e o próximo passo, e avise os agentes da conta ${conta} que vão parar.` } }));
  }
}
