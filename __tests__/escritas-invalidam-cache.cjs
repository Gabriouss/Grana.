/*
 * Toda escrita de lancamento, boleto, orcamento e meta invalida o mapa de
 * respostas atrasadas de `lib/cache-de-tela.ts`.
 *
 *   node __tests__/escritas-invalidam-cache.cjs
 *
 * Contexto: em rede lenta, uma resposta que chega depois do prazo fica 15 s na
 * memoria e e servida de novo. A M1 fez `lancamentoGravado` invalidar (1b653b7),
 * mas so o caminho de CRIAR lancamento passa por ele: excluir, editar, encerrar
 * serie, boleto, orcamento e meta nao passavam, e a lista podia mostrar o estado
 * de antes da escrita. Os modulos sao os reais (`lib/data.ts`, `lib/goals.ts`);
 * so Supabase e a sessao sao dubles. Cada escrita e conferida nas DUAS pontas:
 * sucesso invalida, falha NAO invalida (nada mudou no banco).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

function carregar(arquivo, deps) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Map, Set,
    require: (id) => { if (id in deps) return deps[id]; throw new Error('import nao simulado em ' + arquivo + ': ' + id); },
  }, { filename: arquivo });
  return exports;
}

/* Supabase que responde sempre com o mesmo desfecho, em qualquer encadeamento. */
function supabaseDe(erro) {
  const resposta = { data: { id: 'x' }, error: erro, count: 0 };
  const q = new Proxy(function () {}, {
    get: (_a, prop) => (prop === 'then' ? (resolve) => resolve(resposta) : () => q),
  });
  return { from: () => q, rpc: () => Promise.resolve(resposta) };
}

function carregarModulos(erro) {
  const contagem = { n: 0 };
  const supabase = supabaseDe(erro);
  const comum = {
    './supabase': { supabase },
    './cache-de-tela': { comCacheOffline: (_n, buscar) => buscar, invalidarRespostasAtrasadas() { contagem.n++; } },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  };
  const data = carregar('lib/data.ts', {
    ...comum,
    './lancamentos-alterados': { marcarLancamentosAlterados() {} },
    './fila-pendente': { juntarPendentes: async (l) => l },
    './voz-pendente-na-lista': { juntarVozPendente: async (l) => l },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './transaction-rules': carregar('lib/transaction-rules.ts', {}),
    './paginacao': { buscarTodasAsPaginas: async () => [] },
    './types': { CATEGORIES: [] },
    './recorrencia': {},
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
  });
  const goals = carregar('lib/goals.ts', comum);
  return { data, goals, contagem };
}

const cartao = { id: 'a', parent_id: null, installment_total: 3 };
const ESCRITAS = {
  'deleteTransaction': (m) => m.data.deleteTransaction('t'),
  'updateTransaction': (m) => m.data.updateTransaction('t', { description: 'x' }),
  'encerrarSerieAPartirDe': (m) => m.data.encerrarSerieAPartirDe({ parent_id: 'p', occurred_on: '2026-10-01', installment_total: null }),
  'deleteInstallmentPurchase': (m) => m.data.deleteInstallmentPurchase(cartao),
  'updateBill': (m) => m.data.updateBill('b', { description: 'x' }),
  'payBill': (m) => m.data.payBill({ id: 'b' }, '2026-10-01'),
  'reopenBill': (m) => m.data.reopenBill({ id: 'b' }),
  'deleteBill': (m) => m.data.deleteBill('b'),
  'upsertBudget': (m) => m.data.upsertBudget('Mercado', 10, '#fff'),
  'upsertBudgetsBatch': (m) => m.data.upsertBudgetsBatch([{ category: 'Mercado', amount: 10, color: '#fff' }]),
  'deleteBudget': (m) => m.data.deleteBudget('Mercado'),
  'updateGoal': (m) => m.goals.updateGoal('g', { title: 'x', target_amount: 1, color: '#fff', icon: 'i' }),
  'deleteGoal': (m) => m.goals.deleteGoal('g'),
  'depositToGoal': (m) => m.goals.depositToGoal({ id: 'g' }, 1),
};

(async () => {
  let falhas = 0;
  const ok = (m) => console.log('  ok  ' + m);
  const falha = (m, e) => { falhas++; console.log('  FALHOU  ' + m + ' — ' + (e && e.message)); };

  console.log('Escrita bem-sucedida invalida o mapa; escrita que falha, nao');
  for (const [nome, rodar] of Object.entries(ESCRITAS)) {
    try {
      const bom = carregarModulos(null);
      await rodar(bom);
      assert.ok(bom.contagem.n >= 1, nome + ' nao invalidou apos gravar');

      const ruim = carregarModulos({ code: '42501', message: 'negado' });
      await assert.rejects(rodar(ruim));
      assert.equal(ruim.contagem.n, 0, nome + ' invalidou mesmo com a escrita recusada');
      ok(nome);
    } catch (e) { falha(nome, e); }
  }

  /* Cada escrita da lista tem de existir de fato: se alguem renomear, o teste
     nao pode passar vazio. */
  const m = carregarModulos(null);
  for (const nome of ['deleteTransaction', 'updateTransaction', 'encerrarSerieAPartirDe', 'deleteInstallmentPurchase', 'updateBill', 'payBill', 'reopenBill', 'deleteBill', 'upsertBudget', 'upsertBudgetsBatch', 'deleteBudget']) {
    if (typeof m.data[nome] !== 'function') falha('existe ' + nome, new Error('sumiu de lib/data.ts'));
  }
  for (const nome of ['updateGoal', 'deleteGoal', 'depositToGoal']) {
    if (typeof m.goals[nome] !== 'function') falha('existe ' + nome, new Error('sumiu de lib/goals.ts'));
  }

  console.log(falhas === 0 ? '\n' + Object.keys(ESCRITAS).length + '/' + Object.keys(ESCRITAS).length + ' escritas conferidas nas duas pontas' : '\n' + falhas + ' falha(s)');
  process.exit(falhas === 0 ? 0 : 1);
})();
