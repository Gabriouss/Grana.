/*
 * Nome do lançamento quando a fala traz "R$" (achado B4 do Harbor, 26/09/2026).
 *
 *   node __tests__/descricao-com-simbolo-moeda.cjs
 *
 * O Whisper escreve "conta de luz cento e oitenta reais" como "Conta de luz
 * R$ 180". A regra "de/para <nome>" parava no "$" e levava o "R" junto: o
 * boleto foi gravado de verdade, pelo widget, com o nome "Luz R". E um "dia 10"
 * solto no fim de um boleto virava o próprio nome ("Dia").
 *
 * Roda as DUAS cópias reais, a do app e do widget (`lib/heuristics.ts`) e a do
 * Granabô (`supabase/functions/_shared/interpretar-lancamento.ts`), e exige a
 * mesma saída nas duas (regra 13). O `sync-parser` compara o corpo; este teste
 * compara o resultado.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const cache = new Map();
function carregar(arquivo) {
  const absoluto = path.resolve(__dirname, '..', arquivo);
  if (cache.has(absoluto)) return cache.get(absoluto);
  const exports = {};
  cache.set(absoluto, exports);
  const js = ts.transpileModule(fs.readFileSync(absoluto, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console,
    require(id) {
      const alvo = path.resolve(path.dirname(absoluto), id.endsWith('.ts') ? id : id + '.ts');
      return carregar(path.relative(path.resolve(__dirname, '..'), alvo));
    },
  }, { filename: absoluto });
  return exports;
}

const copias = {
  app: carregar('lib/heuristics.ts'),
  granabo: carregar('supabase/functions/_shared/interpretar-lancamento.ts'),
};

const casos = [
  // Os quatro do B4, que saíam 'Luz R', 'Água R', 'Internet R' e 'Dia'.
  ['Conta de luz R$ 180 vence dia 10.', 'Luz'],
  ['Conta de água R$ 90 vence dia 5.', 'Água'],
  ['Conta de internet R$ 100 vence dia 15.', 'Internet'],
  ['boleto da luz R$ 180 dia 10', 'Boleto da luz'],
  // Os que já davam certo e não podem mudar.
  ['Mercado R$ 120 no débito.', 'Mercado'],
  ['Boleto da luz R$ 180 vence dia 10.', 'Boleto da luz'],
  ['conta de luz 180 reais vence dia 10', 'Luz'],
  ['Uber R$ 25 no crédito.', 'Uber'],
  ['Almoço de R$ 20', 'Almoço'],
  ['boleto para o dia 13 de setembro, 47 reais Liga das lendas', 'Liga das lendas'],
  ['Pix para Rafael 30 reais', 'Rafael'],
  ['Dia das mães 100 reais', 'Dia das mães'],
  // A mesma causa fora de boleto: o "R" do símbolo colava em qualquer nome.
  ['Pizza para Maria R$ 50', 'Maria'],
  ['Presente para Ana R$ 80,00', 'Ana'],
  // "dia 5" solto no fim é vencimento, não parte do nome.
  ['Aluguel R$ 1.500,00 dia 5', 'Aluguel'],
  ['boleto da luz 180 reais dia 10', 'Boleto da luz'],
  // B6 (Harbor, 26/09/2026): o "de" que apresenta o valor ficava solto.
  ['Almoço de 40 reais no restaurante.', 'Almoço no restaurante'],
  ['Devolução de 40 reais da farmácia no crédito.', 'Devolução da farmácia'],
  ['Almoço de R$ 40 no restaurante.', 'Almoço no restaurante'],
  ['Almoço de 40 no restaurante', 'Almoço no restaurante'],
  ['Café por 7 reais na padaria', 'Café na padaria'],
  // E os que já davam certo com "de" perto do valor.
  ['Compra de 50 reais no mercado.', 'Mercado'],
  ['Recebi 200 reais de aluguel.', 'Aluguel'],
  ['Reembolso da farmácia de 40 reais no crédito.', 'Reembolso da farmácia'],
  ['Energia de 350 reais', 'Energia'],
  ['Chip de 22 reais, outros', 'Chip'],
];

let checagens = 0;
for (const [fala, esperado] of casos) {
  const app = copias.app.descricaoDoLancamento(fala, 'out');
  const granabo = copias.granabo.descricaoDoLancamento(fala, 'out');
  assert.equal(app, esperado, `app/widget: ${fala}`);
  assert.equal(granabo, app, `Granabô diverge do app: ${fala}`);
  checagens += 2;
}
console.log(`${checagens}/${checagens} checagens do nome com "R$" passaram (app, widget e Granabô iguais)`);
