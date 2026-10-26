// Modulos reais; fronteiras de rede/cache dubladas. Nenhuma conta real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
function carregar(arquivo, dubles = {}, cache = new Map()) {
  if (cache.has(arquivo)) return cache.get(arquivo);
  const exports = {}; cache.set(arquivo, exports);
  const js = ts.transpileModule(fs.readFileSync(path.join(raiz, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, { exports, console, Date, Math, Map, Set, Promise, require(id) {
    if (id in dubles) return dubles[id];
    if (id === './diagnostico') return { ARQUETIPOS: [] };
    if (id === './safe-to-spend') return {};
    if (id.startsWith('./')) return carregar(path.posix.join(path.posix.dirname(arquivo), id.slice(2) + '.ts'), dubles, cache);
    throw Error('Import nao simulado: ' + id);
  } }, { filename: arquivo });
  return exports;
}
const { projetarComprometimentoFuturo: projetar } = carregar('lib/projections.ts');
const hoje = new Date(2026, 9, 25);
const bill = (id, due_date, extra = {}) => ({ id, user_id: 'AUDIT', amount: 100, due_date, recurring: true, status: 'due', parent_id: null, wallet_id: 'A', ...extra });
const parcela = (id, occurred_on, extra = {}) => ({ id, user_id: 'AUDIT', type: 'out', amount: 100, occurred_on, installment_total: 3, installment_current: 1, card_id: 'card', payment_method: 'credit', wallet_id: 'A', ...extra });
const card = (extra = {}) => ({ id: 'card', closing_day: 20, due_day: 5, wallet_id: 'A', ...extra });
const valores = (r, campo = 'total') => Array.from(r, m => m[campo]);
const casos = [];
function caso(nome, fn) { casos.push([nome, fn]); }

caso('historico de pagamentos nao multiplica uma unica mensalidade', () => {
  const b = [bill('raiz', '2026-08-10', { status: 'paid' }), bill('set', '2026-09-10', { parent_id: 'raiz', status: 'paid' }), bill('out', '2026-10-10', { parent_id: 'raiz' })];
  assert.deepEqual(valores(projetar([], b, undefined, hoje)), [100, 100, 100, 100, 100, 100]);
  assert.deepEqual(valores(projetar([], b, 6, hoje)), [100, 100, 100, 100, 100, 100]);
});
caso('mes pago nao reaparece, proxima materializada nao duplica com a prevista', () => {
  const b = [bill('raiz', '2026-10-10', { status: 'paid' }), bill('nov', '2026-11-10', { parent_id: 'raiz' })];
  assert.deepEqual(valores(projetar([], b, 6, hoje)), [0, 100, 100, 100, 100, 100]);
});
caso('inicio futuro nao antecipa compromisso', () => {
  assert.deepEqual(valores(projetar([], [bill('dez', '2026-12-10')], 6, hoje)), [0, 0, 100, 100, 100, 100]);
});
caso('ultima ocorrencia encerra serie sem apagar a conta ainda devida', () => {
  const b = [bill('raiz', '2026-09-10', { status: 'paid' }), bill('fim', '2026-10-10', { parent_id: 'raiz', recurring: false })];
  assert.deepEqual(valores(projetar([], b, 6, hoje)), [100, 0, 0, 0, 0, 0]);
  b[1].status = 'paid';
  assert.deepEqual(valores(projetar([], b, 6, hoje)), [0, 0, 0, 0, 0, 0]);
});
caso('valor mais novo vale sem somar historico e entrada independe da ordem', () => {
  const b = [bill('raiz', '2026-08-31', { status: 'paid' }), bill('nova', '2026-10-31', { parent_id: 'raiz', amount: 125.10 })];
  assert.deepEqual(valores(projetar([], b.reverse(), 3, hoje)), [125.10, 125.10, 125.10]);
});
caso('atrasada do mes conta uma vez; meses anteriores nao viram parcela extra', () => {
  const b = [bill('raiz', '2026-09-10'), bill('out', '2026-10-10', { parent_id: 'raiz' })];
  assert.deepEqual(valores(projetar([], b, 2, hoje)), [100, 100]);
});
caso('nomes iguais de series distintas nao sao deduplicados', () => {
  assert.equal(projetar([], [bill('uma', '2026-10-10'), bill('outra', '2026-10-10')], 1, hoje)[0].total, 200);
});
caso('carteira e aplicada depois de resolver a serie atual', () => {
  const b = [bill('raiz', '2026-09-10', { status: 'paid' }), bill('atual', '2026-10-10', { parent_id: 'raiz', wallet_id: 'B' })];
  assert.deepEqual(valores(projetar([], b, 2, hoje, { walletId: 'A' })), [0, 0]);
  assert.deepEqual(valores(projetar([], b, 2, hoje, { walletId: 'B' })), [100, 100]);
});
caso('credito entra no vencimento da fatura, nao no mes da compra', () => {
  const t = [parcela('compra', '2026-10-21')];
  // Fecha novembro20, vence dezembro5.
  assert.deepEqual(valores(projetar(t, [], 6, hoje, { cards: [card()], payments: [] })), [0, 0, 100, 0, 0, 0]);
});
caso('fechamento29-31 usa data original e nao pula parcela em fevereiro', () => {
  const t = [parcela('raiz', '2027-01-30'), parcela('p2', '2027-02-28', { parent_id: 'raiz', installment_current: 2 }), parcela('p3', '2027-03-30', { parent_id: 'raiz', installment_current: 3 })];
  const r = projetar(t, [], 4, new Date(2027, 0, 1), { cards: [card({ closing_day: 31, due_day: 5 })], payments: [] });
  assert.deepEqual(valores(r), [0, 100, 100, 100]);
});
caso('fatura integralmente paga sai; parcial reduz somente o saldo em aberto', () => {
  const t = [parcela('compra', '2026-10-10')];
  const payment = { card_id: 'card', year: 2026, month: 9, amount: 100, paid_on: '2026-10-24' };
  assert.equal(projetar(t, [], 2, hoje, { cards: [card()], payments: [payment] })[1].total, 0);
  assert.equal(projetar(t, [], 2, hoje, { cards: [card()], payments: [{ ...payment, amount: 40 }] })[1].total, 60);
  assert.equal(projetar(t, [], 2, hoje, { cards: [card()], payments: [{ ...payment, paid_on: '2026-12-01' }] })[1].total, 100);
});
caso('compra a vista afeta saldo da fatura sem virar parcela nem duplicar pagamento', () => {
  const t = [parcela('compra', '2026-10-10'), parcela('avista', '2026-10-11', { installment_total: 1, amount: 50 }), parcela('pagamento', '2026-10-24', { installment_total: 1, amount: 130, payment_method: 'debit', card_id: null })];
  const r = projetar(t, [], 2, hoje, { cards: [card()], payments: [{ card_id: 'card', year: 2026, month: 9, amount: 130, paid_on: '2026-10-24', paid_transaction_id: 'pagamento' }] });
  assert.equal(r[1].parcelasFuturas, 20);
});
caso('credito orfao e entrada antiga no cartao ficam fora', () => {
  const t = [parcela('orfao', '2026-11-10', { card_id: null }), parcela('excluido', '2026-11-10', { card_id: 'apagado' }), parcela('entrada', '2026-11-10', { type: 'in' })];
  assert.ok(projetar(t, [], 6, hoje, { cards: [card()], payments: [] }).every(m => m.total === 0));
});
caso('carne fora do credito preserva data e carteira; pagamento nao e outra parcela', () => {
  const t = [parcela('carne', '2026-11-10', { payment_method: 'debit', card_id: null })];
  assert.equal(projetar(t, [], 2, hoje, { cards: [], walletId: 'A' })[1].total, 100);
  assert.equal(projetar(t, [], 2, hoje, { cards: [], walletId: 'B' })[1].total, 0);
});
caso('credito segue carteira atual do cartao como a tela de fatura', () => {
  const t = [parcela('compra', '2026-10-10', { wallet_id: 'antiga' })];
  assert.equal(projetar(t, [], 2, hoje, { cards: [card()], walletId: 'A' })[1].total, 100);
  assert.ok(projetar(t, [], 2, hoje, { cards: [card()], walletId: 'antiga' }).every(m => m.total === 0));
});
caso('centavos, virada de ano e seis meses incluindo o atual', () => {
  const r = projetar([], [bill('a', '2026-12-05', { amount: 0.10 }), bill('b', '2026-12-05', { amount: 0.20 })], 6, new Date(2026, 11, 31));
  assert.deepEqual(Array.from(r, m => [m.ano, m.mes]), [[2026, 11], [2027, 0], [2027, 1], [2027, 2], [2027, 3], [2027, 4]]);
  assert.ok(r.every(m => m.total === 0.30));
});
caso('datas de fim de mes nao duplicam ocorrencias materializadas', () => {
  const b = [bill('raiz', '2027-01-31', { status: 'paid' }), bill('fev', '2027-02-28', { parent_id: 'raiz' })];
  assert.deepEqual(valores(projetar([], b, 3, new Date(2027, 0, 1))), [0, 100, 100]);
});
caso('ciclo incerto nao ganha certeza inventada', () => {
  const t = [parcela('p2', '2027-02-28', { parent_id: 'ausente', installment_current: 2 })];
  const r = projetar(t, [], 3, new Date(2027, 1, 1), { cards: [card({ closing_day: 31 })] });
  assert.ok(r.some(m => m.incompleto === true));
});
caso('compras fora do horizonte e registros repetidos por id nao inflacionam', () => {
  const t = [parcela('compra', '2026-10-10'), parcela('compra', '2026-10-10'), parcela('longe', '2027-12-10')];
  const r = projetar(t, [], 6, hoje, { cards: [card()] });
  assert.deepEqual(valores(r), [0, 100, 0, 0, 0, 0]);
});
caso('carga real pagina todas as fontes sem ocultar paga, raiz antiga ou parcela futura', async () => {
  const chamadas = [];
  const rows = {
    bills: [...Array.from({ length: 999 }, (_, i) => bill('padding-' + i, '2026-01-10', { recurring: false, status: 'paid' })), bill('raiz', '2026-09-10', { status: 'paid' }), bill('out', '2026-10-10', { parent_id: 'raiz' })],
    transactions: [...Array.from({ length: 1000 }, (_, i) => parcela('entrada-' + i, '2026-01-01', { type: 'in', installment_total: 1, card_id: null })), parcela('compra', '2026-10-10')],
    credit_cards: [card()],
    credit_card_invoices: [{ card_id: 'card', year: 2026, month: 9, amount: 100, paid_on: '2026-10-24' }],
  };
  const supabase = { from(tabela) {
    assert.ok(tabela in rows); let inicio = 0, fim = Infinity;
    const q = {};
    for (const nome of ['select', 'order', 'range']) q[nome] = (...args) => {
      chamadas.push([tabela, nome, ...args]);
      if (nome === 'range') [inicio, fim] = args;
      return q;
    };
    q.then = (resolver, rejeitar) => Promise.resolve({ data: rows[tabela].slice(inicio, fim + 1), error: null }).then(resolver, rejeitar);
    return q;
  }, rpc() { throw Error('RPC proibida nesta leitura'); } };
  const data = carregar('lib/data.ts', {
    './supabase': { supabase },
    './cache-de-tela': { comCacheOffline: (_nome, buscar) => buscar },
    './sessao-offline': { idDoUsuarioLocal: async () => 'AUDIT' },
    './creditLimitAlert': {}, './widgets-home-events': {}, './lancamentos-alterados': {},
    './fila-pendente': { juntarPendentes: async t => t },
    './voz-pendente-na-lista': { juntarVozPendente: async t => t },
  });
  const [tx, bills, cards, payments] = await Promise.all([data.fetchTransactions(), data.fetchBills(), data.fetchCreditCards(), data.fetchCardInvoicePayments()]);
  assert.equal(tx.length, 1001); assert.equal(bills.length, 1001);
  assert.ok(bills.some(b => b.id === 'raiz' && b.status === 'paid'));
  assert.ok(chamadas.some(c => c[0] === 'transactions' && c[1] === 'range' && c[2] === 1000));
  assert.ok(chamadas.some(c => c[0] === 'bills' && c[1] === 'range' && c[2] === 1000));
  assert.deepEqual(valores(projetar(tx, bills, 2, hoje, { cards, payments })), [100, 100]);
});

(async () => {
  let falhas = 0;
  for (const [nome, fn] of casos) {
    try { await fn(); console.log('PASS ' + nome); }
    catch (e) { falhas++; console.error('FAIL ' + nome + ': ' + e.message); }
  }
  console.log(`${casos.length - falhas}/${casos.length} casos, ${falhas} falhas; modulo real, zero rede/escrita financeira`);
  if (falhas) process.exitCode = 1;
})();
