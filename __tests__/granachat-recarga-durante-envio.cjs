// Achado do Forge (15/10/2026, P1): a recarga do histórico ao reabrir o
// Granachat, se terminasse DEPOIS de um envio começar, trocava o estado inteiro
// e apagava a pergunta nova e a bolha da resposta. Executa o componente REAL
// components/Granachat.tsx COMPLETO e lib/assistente.ts, transpilados, com
// hooks e rede de dublê, na ordem: leitura começa -> envio começa -> leitura
// termina -> envio termina. Asserta na tela final e em quantas vezes o envio
// foi chamado. A mutação (sem o descarte da leitura obsoleta) tem que reprovar.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { criarGranachatCompleto } = require('./helpers/granachat-compat-completo.cjs');
const watchdog = setTimeout(() => { console.error('compat recarga não concluiu'); process.exit(2); }, 15000);

const fonteReal = fs.readFileSync(path.join(__dirname, '..', 'components', 'Granachat.tsx'), 'utf8');

function adiado() {
  let resolver;
  const promessa = new Promise((r) => { resolver = r; });
  return { promessa, resolver };
}

const tique = () => new Promise((r) => setImmediate(r));

async function cenario(fonte) {
  const antiga = { id: 'antiga', papel: 'assistente', texto: 'resposta antiga', ferramenta_usada: null, criado_em: new Date().toISOString() };
  const leitura = adiado();
  const resposta = adiado();
  const ui = criarGranachatCompleto({ fonte, inicial: [antiga],
    consulta: () => leitura.promessa.then(data => ({ data, error: null })),
    resposta: () => resposta.promessa,
  });
  try {
    const envio = ui.enviar('quanto gastei hoje?'); // leitura começa -> envio começa
    await tique();
    leitura.resolver([antiga]);                  // leitura termina depois
    await tique(); await tique();
    resposta.resolver({ resposta: 'Hoje você gastou R$ 10,00.', ferramenta: 'resumo' });
    await envio;
    await tique();
    const { tela, envios } = ui.resultado();
    return { tela, envios };
  } finally { ui.desmontar(); }
}

(async () => {
  const { tela, envios } = await cenario(fonteReal);
  assert.equal(envios.length, 1, 'uma só chamada de envio');
  assert.ok(tela.some((m) => m.papel === 'usuario' && m.texto === 'quanto gastei hoje?'), 'a pergunta continua na tela');
  const bolha = tela.find((m) => m.texto === 'Hoje você gastou R$ 10,00.');
  assert.ok(bolha, 'a resposta aparece (recibo visível)');
  assert.equal(bolha.carregando, false);
  assert.ok(tela.some((m) => m.id === 'antiga'), 'o histórico que já estava continua');

  // Mutação: sem o descarte da leitura obsoleta, o cenário TEM que reprovar.
  const bloco = /\n\s*if \(enviosRef\.current !== enviosNoInicio\) \{[\s\S]*?return;\s*\n\s*\}/;
  assert.match(fonteReal, bloco, 'guarda da leitura obsoleta presente');
  const mutante = await cenario(fonteReal.replace(bloco, ''));
  assert.ok(
    !mutante.tela.some((m) => m.texto === 'Hoje você gastou R$ 10,00.'),
    'o mutante perde a resposta, então o teste distingue a correção',
  );
  console.log('granachat-recarga-durante-envio: ok');
})().then(() => clearTimeout(watchdog), (e) => { clearTimeout(watchdog); console.error(e); process.exit(1); });
