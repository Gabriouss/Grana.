/*
 * TRAVA DA REGRA 20 do AGENTS.md: "Saldo atual" e "Livre para gastar" usam
 * SÓ o mês vigente. Nunca saldo acumulado de meses anteriores, nunca
 * `initial_balance`. Decisão do autor em 24/09/2026: "não quero saldo
 * acumulado, quero saldo apenas do mês vigente" e "não deveremos regredir
 * para isso novamente".
 *
 *   node __tests__/regra-20-saldo-do-mes.cjs
 *
 * ESTE TESTE NÃO SE AFROUXA PARA PASSAR. Se ele falhar depois de uma mudança,
 * a mudança está errada ou falta o pedido explícito do autor que a autoriza.
 * Editar a asserção para caber no código novo é o mesmo que apagar a regra.
 *
 * Módulos REAIS: lib/safe-to-spend.ts (a conta), lib/widgets-home-snapshot.ts
 * (widgets) e lib/transaction-rules.ts (o que é crédito).
 *
 *  1. Caso de referência do autor (setembro de 2026, dia 24): entradas
 *     2.948,00, saídas de caixa 2.805,33, 7 dias restantes: saldo 142,67,
 *     livre 142,67 no total e 20,38 por dia. Boleto pendente de 107,18 NÃO
 *     desconta (decisão do autor de 25/09/2026: o boleto pesa quando é pago,
 *     porque o pagamento vira saída de caixa).
 *  2. Lançamento de mês anterior não entra.
 *  3. `initial_balance` não entra: a conta nem recebe o parâmetro, e as
 *     telas não o somam.
 *  4. Compra no crédito fica fora; pagamento de fatura entra como saída.
 *  5. A mesma palavra, o mesmo número: a Início e os widgets dizem o mesmo.
 *  6. Boleto pendente ou atrasado, deste mês ou de outro, não muda o Livre.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }
const REGRA = 'REGRA 20 (AGENTS.md): saldo e livre para gastar só do mês vigente';
function trava(condicao, detalhe) {
  assert.ok(condicao, `${REGRA}. ${detalhe}`);
}

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

const { calcularSafeToSpend, calcularSaldoAtual } = carregar('lib/safe-to-spend.ts');
const { montarSnapshotWidgets } = carregar('lib/widgets-home-snapshot.ts');
const centavos = (v) => Math.round(v * 100);

const hoje = new Date(2026, 8, 24, 20, 0, 0);
let n = 0;
const tx = (parcial) => ({
  id: `t${++n}`, user_id: 'u', description: 'AUDIT', category: 'Outros', color: '#fff', recurring: false,
  parent_id: null, wallet_id: 'w-1', occurred_on: '2026-09-10', created_at: '2026-09-10T12:00:00Z', ...parcial,
});
const bill = (parcial) => ({
  id: `b${++n}`, user_id: 'u', description: 'AUDIT', category: 'Contas', color: '#fff', status: 'due', recurring: false,
  paid_transaction_id: null, created_at: '2026-09-01T12:00:00Z', ...parcial,
});

/* Setembro: 2.948,00 de entradas e 2.805,33 de saídas de caixa, das quais
   300,00 são o pagamento de uma fatura. Fora do caixa: compras no crédito.
   Fora do mês: agosto (entrada grande) e outubro (lançamento futuro). */
const transacoes = [
  tx({ type: 'in', amount: 2500 }),
  tx({ type: 'in', amount: 448 }),
  tx({ type: 'out', amount: 2505.33, payment_method: 'debit' }),
  tx({ type: 'out', amount: 300, payment_method: 'debit', description: 'Pagamento fatura' }),
  tx({ type: 'out', amount: 345, payment_method: 'credit', card_id: 'c-1' }),
  tx({ type: 'out', amount: 90, card_id: 'c-1' }),
  tx({ type: 'in', amount: 5000, occurred_on: '2026-08-30' }),
  tx({ type: 'out', amount: 1200, occurred_on: '2026-08-15' }),
  tx({ type: 'in', amount: 700, occurred_on: '2026-10-01' }),
];
const contas = [
  bill({ amount: 107.18, due_date: '2026-09-28' }),
  bill({ amount: 999, due_date: '2026-10-05' }),
  bill({ amount: 50, due_date: '2026-09-05', status: 'paid' }),
];

(async () => {
  console.log('\nTrava da regra 20');

  /* 1. Caso de referência. */
  const r = calcularSafeToSpend(transacoes, [], hoje);
  trava(centavos(r.saldoAtual) === 14267, `caso do autor: saldo esperado 142,67, veio ${r.saldoAtual}`);
  trava(r.diasRestantes === 7, `dias restantes em 24/09: 7, veio ${r.diasRestantes}`);
  trava(centavos(r.livreTotal) === 14267, `livre no total: 142,67, veio ${r.livreTotal}`);
  trava(centavos(r.livrePorDia) === 2038, `livre por dia: 20,38, veio ${r.livrePorDia}`);
  trava(!('contasFixasPendentes' in r), 'o resultado voltou a ter contas pendentes');
  ok('caso de referência do autor: saldo 142,67, livre 142,67 e 20,38 por dia');

  /* 2. Mês anterior e mês seguinte não entram. */
  const soSetembro = transacoes.filter((t) => t.occurred_on.startsWith('2026-09'));
  trava(
    centavos(calcularSaldoAtual(transacoes, hoje)) === centavos(calcularSaldoAtual(soSetembro, hoje)),
    'lançamento de outro mês mudou o saldo do mês vigente'
  );
  const comAgostoGigante = [...transacoes, tx({ type: 'in', amount: 1_000_000, occurred_on: '2026-08-31' })];
  trava(centavos(calcularSaldoAtual(comAgostoGigante, hoje)) === 14267, 'entrada de agosto somou no saldo de setembro');
  ok('lançamento de mês anterior ou seguinte não entra');

  /* 3. initial_balance fora: a conta não recebe o parâmetro, e ninguém soma. */
  trava(calcularSafeToSpend.length <= 3, 'calcularSafeToSpend voltou a receber mais parâmetros (contas ou saldo inicial?)');
  const extra = calcularSafeToSpend(transacoes, [], hoje, 5000);
  trava(centavos(extra.saldoAtual) === 14267, 'um quarto argumento (saldo inicial) mudou o saldo');
  const fontes = {
    'lib/safe-to-spend.ts': fs.readFileSync(path.join(root, 'lib/safe-to-spend.ts'), 'utf8'),
    'lib/widgets-home-snapshot.ts': fs.readFileSync(path.join(root, 'lib/widgets-home-snapshot.ts'), 'utf8'),
    'lib/widgets-home-sync.ts': fs.readFileSync(path.join(root, 'lib/widgets-home-sync.ts'), 'utf8'),
  };
  for (const [arquivo, fonte] of Object.entries(fontes)) {
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    trava(!/initial_balance|saldoInicial/.test(codigo), `${arquivo} volta a usar saldo inicial`);
    trava(!/contasFixasPendentes/.test(codigo), `${arquivo} volta a descontar boleto pendente`);
  }
  /* A lista de compromissos do widget usa boletos pendentes, e pode; o que não
     pode é o boleto entrar na conta do Livre. */
  trava(!/bills|status === 'due'/.test(fontes['lib/safe-to-spend.ts'].replace(/\/\*[\s\S]*?\*\//g, '')),
    'lib/safe-to-spend.ts volta a descontar boleto pendente');
  trava(/calcularSafeToSpend\(input\.transactions, input\.goals, hoje\)/.test(fontes['lib/widgets-home-snapshot.ts']),
    'o widget passa boletos (ou outra coisa) para calcularSafeToSpend');
  const inicio = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
  trava(
    /calcularSafeToSpend\(walletCashTransactions, walletGoals\)/.test(inicio),
    'a Início passa outra coisa para calcularSafeToSpend (contas ou saldo inicial?)'
  );
  trava(!/saldoInicialEmEscopo/.test(inicio), 'a Início voltou a somar o saldo inicial das carteiras');
  ok('initial_balance não entra na conta nem nas telas');

  /* 4. Crédito fora, pagamento de fatura dentro. */
  const semCredito = transacoes.filter((t) => !t.card_id && t.payment_method !== 'credit');
  trava(
    centavos(calcularSaldoAtual(semCredito, hoje)) === centavos(calcularSaldoAtual(transacoes, hoje)),
    'compra no crédito mexeu no saldo de caixa'
  );
  const semPagamento = transacoes.filter((t) => t.description !== 'Pagamento fatura');
  trava(
    centavos(calcularSaldoAtual(semPagamento, hoje)) === 14267 + 30000,
    'o pagamento da fatura deixou de sair do caixa no mês em que foi pago'
  );
  ok('crédito fora do caixa; pagamento de fatura entra como saída');

  /* 5. Início e widgets: mesmo número. */
  const snap = montarSnapshotWidgets({ userId: 'u', transactions: transacoes, bills: contas, goals: [], privacyHidden: false, hoje });
  const card = fs.readFileSync(path.join(root, 'components/SafeToSpendCard.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  trava(!/Contas a vencer/.test(card), 'o cartão do Livre na Início voltou a mostrar "Contas a vencer"');
  trava(centavos(snap.safeToSpend.livreTotal) === centavos(r.livreTotal), `widget ${snap.safeToSpend.livreTotal} x Início ${r.livreTotal}`);
  trava(centavos(snap.safeToSpend.livrePorDia) === centavos(r.livrePorDia), 'livre por dia diverge entre widget e Início');
  ok('Início e widgets dizem o mesmo livre para gastar');

  /* 6. Boleto pendente ou atrasado não mexe no Livre. */
  const comMuitosBoletos = montarSnapshotWidgets({
    userId: 'u', transactions: transacoes, goals: [], privacyHidden: false, hoje,
    bills: [...contas, bill({ amount: 5000, due_date: '2026-09-02' }), bill({ amount: 800, due_date: '2026-08-10' })],
  });
  trava(
    centavos(comMuitosBoletos.safeToSpend.livreTotal) === 14267,
    `boleto pendente ou atrasado mudou o Livre: ${comMuitosBoletos.safeToSpend.livreTotal}`
  );
  /* Pago, o boleto vira saída de caixa (pagar_conta) e aí sim pesa. */
  const pago = [...transacoes, tx({ type: 'out', amount: 107.18, occurred_on: '2026-09-24', description: 'Boleto pago' })];
  trava(centavos(calcularSafeToSpend(pago, [], hoje).livreTotal) === 14267 - 10718, 'boleto pago não saiu do caixa');
  ok('boleto pendente ou atrasado não muda o Livre; pago, pesa pela saída de caixa');

  console.log(`\n${aprovadas} checagens da trava da regra 20 passaram — 0 falhas`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
