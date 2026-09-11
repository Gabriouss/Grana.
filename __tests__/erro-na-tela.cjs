/* A faixa de erro não pode virar terminal.
 *
 * Em 11/09/2026 a tela Início apareceu num aparelho despejando a LISTA INTEIRA
 * de lançamentos — ids, `user_id`, valores e datas — dentro da faixa de erro,
 * cobrindo o app. Uma biblioteca devolveu o payload dentro de `error.message`
 * e o código repassou cru para `setError`.
 *
 * Testa o MÓDULO REAL, transpilado em memória, não uma reimplementação.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function carregar(caminho, deps) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(caminho, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports, console: { ...console, error: (...a) => logs.push(a) }, String, RegExp, Error,
      require: (id) => { if (!(id in deps)) throw Error('import inesperado: ' + id); return deps[id]; } }
  );
  return exports;
}
const logs = [];
const { mensagemErro } = carregar('lib/erros.ts', {
  './offline-cache': { isLikelyNetworkError: (e) => /network|fetch/i.test(String(e?.message ?? e)) },
});

let total = 0, falhas = 0;
function checar(rotulo, obtido, esperado) {
  total++;
  if (obtido !== esperado) { falhas++; console.log(`FALHA [${rotulo}] = ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`); }
}

// O caso real: a lista de lançamentos dentro da mensagem.
const despejo = JSON.stringify([
  { id: '90771cbe-a062-4a86-b220-a90c12c2cec8', user_id: '13a6200c-eb58-4b59-a07b-b3d5507d89eb',
    type: 'out', description: 'Claude', amount: 113.5, category: 'Assinaturas' },
]);
checar('payload não chega à tela', mensagemErro(new Error(despejo), 'Erro ao carregar dados'), 'Erro ao carregar dados');
checar('mas deixa recibo no log', logs.length > 0, true);
checar('o recibo diz o tamanho', typeof logs[0][1].tamanho === 'number', true);
checar('o recibo é truncado', logs[0][1].inicio.length <= 300, true);

// Mensagem técnica CURTA continua passando: ela ajuda mais que um genérico.
checar('erro curto do Postgres passa',
  mensagemErro(new Error('duplicate key value violates unique constraint'), 'x'),
  'duplicate key value violates unique constraint');

// Falta de rede tem tradução própria e vem antes de tudo.
checar('sem rede tem frase humana',
  mensagemErro(new Error('Network request failed'), 'x'),
  'Sem conexão com a internet. Verifique e tente de novo.');

/* Mesmo curta, uma mensagem com cara de JSON não é frase para ler. O teto de
   tamanho sozinho deixaria passar um objeto pequeno. */
checar('json curto também é barrado', mensagemErro(new Error('{"user_id":"abc"}'), 'apoio'), 'apoio');

// Texto longo sem JSON também não cabe numa faixa.
checar('texto longo é barrado', mensagemErro(new Error('erro '.repeat(60)), 'apoio'), 'apoio');

// Sem mensagem nenhuma, a frase de apoio.
checar('erro vazio usa o apoio', mensagemErro(new Error(''), 'apoio'), 'apoio');

console.log(`\n${total - falhas}/${total} checagens da faixa de erro passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
