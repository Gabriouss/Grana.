/*
 * Retrospectiva do mês soma só CAIXA (achado T21 do Sentinel, 24/09/2026).
 *
 *   node __tests__/retrospectiva-so-caixa.cjs
 *
 * Sintoma, na retrospectiva de setembro: "Entraram R$ 0,00 e saíram
 * R$ 848,19", quando o caixa saiu R$ 503,19; "A maior de todas" apontava uma
 * parcela no crédito de R$ 300,00; e a categoria campeã dizia Alimentação
 * R$ 498,62, 69% do orçamento, enquanto o Orçamento do mês da Início mostrava
 * R$ 153,62 de R$ 720,00 para o mesmo mês. Causa: `lib/monthly-wrapped.ts`
 * somava `type === 'out'` sem `isCreditTx` (mesma classe do S43/A46).
 *
 * Módulo REAL `lib/monthly-wrapped.ts` com `lib/transaction-rules.ts` real.
 * Aqui o mês retratado é setembro (hoje em outubro, como a retrospectiva faz).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

const cache = new Map();
function carregar(arquivo, dubles = {}) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
    require: (id) => {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) {
        const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregar(alvo, dubles);
      }
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

const { gerarMonthlyWrapped } = carregar('lib/monthly-wrapped.ts', {
  './supabase': { supabase: { auth: {} } },
});
const centavos = (v) => Math.round(v * 100);

let n = 0;
const tx = (parcial) => ({
  id: `t${++n}`, user_id: 'u', description: 'AUDIT', category: 'Outros', color: '#fff', recurring: false,
  parent_id: null, occurred_on: '2026-09-10', created_at: '2026-09-10T12:00:00Z', ...parcial,
});

/* Setembro de 2026, no formato do print do Sentinel. Caixa: 503,19 de saídas,
   153,62 em Alimentação. Crédito: parcela 1/4 de 300,00 e 45,00, os dois em
   Alimentação. */
const transacoes = [
  tx({ type: 'out', amount: 153.62, category: 'Alimentação', payment_method: 'debit' }),
  tx({ type: 'out', amount: 200.0, category: 'Transporte', payment_method: 'pix' }),
  tx({ type: 'out', amount: 149.57, category: 'Casa' }),
  tx({ type: 'out', amount: 300, category: 'Alimentação', payment_method: 'credit', card_id: 'c-1',
    description: 'AUDIT compra parcelada (1/4)', installment_current: 1, installment_total: 4 }),
  tx({ type: 'out', amount: 45, category: 'Alimentação', card_id: 'c-1' }),
  /* Estorno no cartão: não é entrada de caixa. */
  tx({ type: 'in', amount: 20, category: 'Alimentação', card_id: 'c-1', payment_method: 'credit' }),
  /* Agosto, para o comparativo com o mês anterior. */
  tx({ type: 'out', amount: 400, occurred_on: '2026-08-12', payment_method: 'debit' }),
  tx({ type: 'out', amount: 999, occurred_on: '2026-08-13', payment_method: 'credit', card_id: 'c-1' }),
];
const orcamentos = [{ id: 'o1', user_id: 'u', category: 'Alimentação', amount: 720 }];

const w = gerarMonthlyWrapped(transacoes, [], orcamentos, 0, new Date(2026, 9, 2, 12, 0, 0));

console.log('\nRetrospectiva só com caixa');
assert.equal(w.label, 'Setembro de 2026');
assert.equal(centavos(w.saidas), 50319, `saídas: ${w.saidas}`);
assert.equal(centavos(w.entradas), 0, `entradas: ${w.entradas}`);
assert.equal(centavos(w.saldo), -50319, `saldo: ${w.saldo}`);
ok('capítulos 1 e 6: entraram 0,00, saíram 503,19, saldo −503,19');

assert.equal(w.maiorDespesa.id !== undefined && !w.maiorDespesa.card_id && w.maiorDespesa.payment_method !== 'credit', true,
  `maior despesa no crédito: ${w.maiorDespesa.description}`);
assert.equal(centavos(Number(w.maiorDespesa.amount)), 20000);
ok('capítulo 3: a maior despesa é de caixa (200,00), não a parcela no crédito');

const c = w.categoriaCampea;
assert.equal(c.nome, 'Transporte', `campeã: ${c.nome}`);
ok('capítulo 4: a campeã sai do caixa (Transporte 200,00), sem o crédito de Alimentação');

/* O orçamento de Alimentação, quando Alimentação é a campeã, usa a mesma
   regra da Início: 153,62 de 720,00. */
const soAlimentacao = gerarMonthlyWrapped(
  transacoes.filter((t) => t.category === 'Alimentação' || t.occurred_on.startsWith('2026-08')),
  [], orcamentos, 0, new Date(2026, 9, 2, 12, 0, 0)
);
assert.equal(soAlimentacao.categoriaCampea.nome, 'Alimentação');
assert.equal(centavos(soAlimentacao.categoriaCampea.total), 15362, `Alimentação: ${soAlimentacao.categoriaCampea.total}`);
assert.equal(Math.round(soAlimentacao.categoriaCampea.usoDoOrcamento * 10000), Math.round((153.62 / 720) * 10000));
assert.equal(Math.round(soAlimentacao.categoriaCampea.fatiaDasSaidas * 100), 100);
ok('orçamento da categoria: 153,62 de 720,00, o mesmo número da Início');

assert.equal(centavos(w.saidasMesAnterior), 40000, `agosto: ${w.saidasMesAnterior}`);
ok('comparativo com agosto também sem crédito (400,00)');

assert.equal(w.totalLancamentos, 6);
assert.equal(w.vazio, false);
ok('contagem de lançamentos inclui o crédito, que também é registro');

const modal = fs.readFileSync(path.join(root, 'components/MonthlyWrappedModal.tsx'), 'utf8');
assert.ok(!/foram para aqui/.test(modal) && /foram para esta categoria/.test(modal));
ok('copy: "foram para esta categoria"');

console.log(`\n${aprovadas} checagens da retrospectiva só com caixa passaram — 0 falhas`);
