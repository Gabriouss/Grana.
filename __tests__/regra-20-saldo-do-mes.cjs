// Regra atualizada por pedido expresso do autor em 17/10/2026 (ordem da tarde)
// e de novo em 07/11/2026 (ordem do orquestrador "ordem-keel-livre": salario
// futuro do mes conta desde o dia 1; fatura so desconta ao pagar).
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
      if (id.startsWith('.')) {
        const alvo = path.join(path.dirname(arquivo), id.endsWith('.ts') ? id : id + '.ts');
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
  /* 07/11/2026, pedido do autor: "Fatura só desconta ao pagar". As compras
     no crédito de 345 + 90 deixam de zerar o Livre, que volta ao caso de
     referência original: 142,67 no total e 20,38 por dia. */
  trava(centavos(r.livreTotal) === 14267, `07/11: credito nao pago nao reduz o Livre, esperado 142,67, veio ${r.livreTotal}`);
  trava(centavos(r.livrePorDia) === 2038, `07/11: livre por dia 20,38, veio ${r.livrePorDia}`);
  trava(!('contasFixasPendentes' in r), 'o resultado voltou a ter contas pendentes');
  ok('07/11/2026: credito ainda nao pago nao reduz o Livre; referencia de caixa preservada');

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
  trava(/calcularSafeToSpend\(input\.transactions, input\.goals, hoje, \{ cards: input\.cards, payments: input\.payments, sobraConfirmada: input\.sobraConfirmada \}\)/.test(fontes['lib/widgets-home-snapshot.ts']),
    'o widget passa boletos (ou outra coisa) para calcularSafeToSpend');
  const inicio = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
  trava(
    /calcularSafeToSpend\(lancamentosDaCarteira\(transactions, creditCards, activeWalletId\), walletGoals, new Date\(\), \{ cards: creditCards, payments: invoicePayments \?\? \[\], sobraConfirmada: activeWalletId === 'total' \? sobraParaOLivre\(sobraDoMes\) : 0 \}\)/.test(inicio),
    'a Início passa outra coisa para calcularSafeToSpend (contas ou saldo inicial?)'
  );
  trava(!/saldoInicialEmEscopo/.test(inicio), 'a Início voltou a somar o saldo inicial das carteiras');
  /* lib/wallets.ts: autorizado pelo autor em 27/09/2026, as duas somas de
     saldo por carteira deixaram de somar `initial_balance`. Módulo real: uma
     carteira com saldo inicial de 5.000 dá o MESMO saldo que com zero. */
  {
    const { calcularSaldosWallets, calcularSaldosComAgregado } = carregar('lib/wallets.ts', {
      './supabase': { supabase: {} },
      './cache-de-tela': { atualizarTelaGuardada: async () => {}, comCacheOffline: (_n, f) => f },
      './sessao-offline': { sessaoEstaTravada: () => false, idDoUsuarioLocal: async () => null },
      './format': { isCreditTx: (t) => t.payment_method === 'credit' || !!t.card_id },
    });
    const carteiras = (inicial) => [
      { id: 'w-1', name: 'Principal', is_default: true, initial_balance: inicial },
      { id: 'w-2', name: 'Reserva', is_default: false, initial_balance: inicial },
    ];
    const semInicial = calcularSaldosWallets(carteiras(0), transacoes);
    const comInicial = calcularSaldosWallets(carteiras(5000), transacoes);
    trava(centavos(comInicial.total) === centavos(semInicial.total),
      'lib/wallets.ts calcularSaldosWallets voltou a somar initial_balance no total');
    trava(JSON.stringify(comInicial.porCarteira) === JSON.stringify(semInicial.porCarteira),
      'lib/wallets.ts calcularSaldosWallets voltou a somar initial_balance por carteira');
    const agregado = [{ wallet_id: 'w-1', delta: 100 }, { wallet_id: null, delta: 20 }, { wallet_id: 'w-2', delta: -5 }];
    const agSem = calcularSaldosComAgregado(carteiras(0), agregado);
    const agCom = calcularSaldosComAgregado(carteiras(5000), agregado);
    trava(centavos(agCom.total) === 11500 && centavos(agSem.total) === 11500,
      'lib/wallets.ts calcularSaldosComAgregado voltou a somar initial_balance no total');
    trava(agCom.porCarteira['w-1'] === 120 && agCom.porCarteira['w-2'] === -5,
      'lib/wallets.ts calcularSaldosComAgregado voltou a somar initial_balance por carteira');
    const codigo = fs.readFileSync(path.join(root, 'lib/wallets.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    trava(!/Number\(\s*w\.initial_balance/.test(codigo), 'lib/wallets.ts volta a ler initial_balance como número de saldo');
  }
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

  /* 7. ENTRADA FUTURA (pedido expresso do autor, 01/11/2026, regra 20):
     "Lançamento com data futura precisa descontar do livre para gastar, mas
     apenas lançamentos dentro do mesmo mês. Fatura de cartão de crédito
     precisa interferir no livre para gastar também." e
     "Salário futuro no livre para gastar só entra após a data da entrada".
     Saída futura do mesmo mês desconta desde já; entrada só a partir do dia
     da data dela. Mesmo predicado no app, nos widgets e no Granabô. */
  {
    const nucleo = carregar('supabase/functions/_shared/livre-para-gastar.ts');
    const exemplo = [
      tx({ type: 'in', amount: 1000, occurred_on: '2026-11-01' }),
      tx({ type: 'in', amount: 2500, occurred_on: '2026-11-15' }),
      tx({ type: 'out', amount: 300, occurred_on: '2026-11-20' }),
      tx({ type: 'out', amount: 100, occurred_on: '2026-12-01' }),
    ];
    const em = (dia, hora = 12, min = 0) => new Date(2026, 10, dia, hora, min);
    const saldo = (d) => centavos(calcularSafeToSpend(exemplo, [], d).saldoAtual);
    trava(saldo(em(1)) === 70000, `01/11: base 700, veio ${saldo(em(1)) / 100}`);
    trava(saldo(em(14)) === 70000, 'véspera (14/11): a entrada de 15/11 ainda não conta');
    trava(saldo(em(15)) === 320000, `dia da data (15/11): 3.200, veio ${saldo(em(15)) / 100}`);
    trava(saldo(em(16)) === 320000, 'depois da data a entrada segue contando');
    trava(saldo(em(15, 21, 50)) === 320000, 'dia da data às 21h50 (UTC já é 16/11): a entrada de hoje conta o dia inteiro');
    trava(saldo(em(14, 21, 50)) === 70000, 'véspera às 21h50: continua sem a entrada');
    /* 07/11/2026, pedido do autor: "Salário futuro conta desde o dia 1". O
       Saldo atual continua como em 01/11; só o Livre passa a contar a entrada. */
    const livre = (d) => calcularSafeToSpend(exemplo, [], d);
    trava(centavos(livre(em(1)).livreTotal) === 320000, `07/11: no dia 1 o Livre ja conta a entrada de 15/11 (3.200), veio ${livre(em(1)).livreTotal}`);
    trava(centavos(livre(em(1)).entradasPrevistas) === 250000 && centavos(livre(em(15)).entradasPrevistas) === 0, '07/11: entradasPrevistas e a parte que ainda nao chegou');
    trava(centavos(livre(em(15)).livreTotal) === 320000, 'no dia da data o Livre nao muda');
    trava(centavos(calcularSaldoAtual(exemplo, em(1))) === 70000 && centavos(calcularSaldoAtual(exemplo, em(15))) === 320000, 'calcularSaldoAtual usa o mesmo predicado');
    /* Núcleo do Granabô (data em Brasília) igual ao do app. */
    for (const [iso, d] of [['2026-11-01', em(1)], ['2026-11-14', em(14)], ['2026-11-15', em(15)]]) {
      trava(centavos(nucleo.calcularLivre(exemplo, [], iso).saldoAtual) === saldo(d), `Granabô x app em ${iso}`);
    }
    /* Virada do mês: a entrada de 01/12 não conta em 30/11 e conta em 01/12. */
    const virada = [tx({ type: 'in', amount: 800, occurred_on: '2026-12-01' }), tx({ type: 'in', amount: 100, occurred_on: '2026-11-30' })];
    trava(centavos(calcularSafeToSpend(virada, [], new Date(2026, 10, 30, 23, 50)).saldoAtual) === 10000, '30/11 às 23h50: só a entrada de novembro');
    trava(centavos(calcularSafeToSpend(virada, [], new Date(2026, 11, 1, 0, 10)).saldoAtual) === 80000, '01/12 às 00h10: só a entrada de dezembro; a de novembro saiu do mês');
    /* Crédito, fatura, boleto e cofrinho seguem como antes. */
    const comCredito = [...exemplo, tx({ type: 'out', amount: 200, occurred_on: '2026-11-03', payment_method: 'credit', card_id: 'c-1' })];
    trava(centavos(calcularSafeToSpend(comCredito, [], em(1)).saldoAtual) === 70000, 'compra no crédito segue fora do caixa');
    const ctx = { cards: [{ id: 'c-1', closing_day: 28 }], payments: [] };
    trava(centavos(calcularSafeToSpend(comCredito, [], em(1), ctx).livreTotal) === centavos(livre(em(1)).livreTotal), '07/11: fatura aberta nao reduz o Livre');
    /* Pagar a fatura: pagar_fatura_cartao grava UMA saída de caixa sem card_id. */
    const pagaFatura = [...comCredito, tx({ type: 'out', amount: 200, occurred_on: '2026-11-05', description: 'Pagamento fatura' })];
    const ctxPago = { cards: ctx.cards, payments: [{ card_id: 'c-1', year: 2026, month: 10, amount: 200, paid_on: '2026-11-05' }] };
    trava(centavos(calcularSafeToSpend(pagaFatura, [], em(7), ctxPago).livreTotal) === 300000, '07/11: pagar a fatura reduz o Livre uma vez (3.200 - 200)');
    /* A queixa do autor em 07/11: dinheiro do mês já previsto e o card dizendo
       "Sem saldo disponível". Salário em 20/11, hoje 07/11, gastos de 600. */
    const queixa = [
      tx({ type: 'in', amount: 3000, occurred_on: '2026-11-20' }),
      tx({ type: 'out', amount: 600, occurred_on: '2026-11-03', payment_method: 'debit' }),
      tx({ type: 'out', amount: 400, occurred_on: '2026-11-04', payment_method: 'credit', card_id: 'c-1' }),
    ];
    const q = calcularSafeToSpend(queixa, [], em(7), ctx);
    trava(centavos(q.saldoAtual) === -60000, `07/11: o Saldo atual não muda (-600), veio ${q.saldoAtual}`);
    trava(centavos(q.livreTotal) === 240000 && q.semSaldo === false, `07/11: salário de 20/11 já conta no dia 7 (2.400) e não há "Sem saldo", veio ${q.livreTotal}`);
    trava(q.diasRestantes === 24 && centavos(q.livrePorDia) === 10000, '07/11: 2.400 em 24 dias = 100 por dia');
    const qWidget = montarSnapshotWidgets({ userId: 'u', transactions: queixa, bills: [], goals: [], privacyHidden: false, hoje: em(7), cards: ctx.cards, payments: [] });
    trava(centavos(qWidget.safeToSpend.livreTotal) === 240000 && qWidget.safeToSpend.semSaldo === false, '07/11: widget igual à Início');
    const qGranabo = nucleo.calcularLivre(queixa, [], '2026-11-07', ctx);
    trava(centavos(qGranabo.livreTotal) === 240000 && qGranabo.semSaldo === false, '07/11: Granabô igual à Início');
    const semNada = calcularSafeToSpend([tx({ type: 'out', amount: 50, occurred_on: '2026-11-02' })], [], em(7));
    trava(semNada.semSaldo === true && semNada.livreTotal === 0, 'só saída no mês: Sem saldo e Livre zero');
    ok('saldo: entrada futura só a partir da data; Livre: entrada do mês desde o dia 1; crédito só ao pagar; fuso 21h50 e virada do mês');

    /* SOBRA DO MÊS ANTERIOR (Adendo 2 do autor, 07/11/2026): "vai dizer que eu
       tô com saldo liberado, mas eu tô com absolutamente R$0 na conta". Só o
       valor que a PESSOA confirmou entra; sem confirmação, zero. A sugestão
       que preenche a pergunta é o caixa de outubro, piso zero, sem recursão. */
    const outubro = [
      tx({ type: 'in', amount: 4000, occurred_on: '2026-10-05' }),
      tx({ type: 'out', amount: 2500, occurred_on: '2026-10-20' }),
      tx({ type: 'out', amount: 900, occurred_on: '2026-10-21', card_id: 'c-1' }),
      tx({ type: 'in', amount: 99999, occurred_on: '2026-09-05' }),
    ];
    const metasOut = [{ current_amount: 300, month_reserves: { '2026-10': 300 } }];
    trava(nucleo.sugerirSobraDoMesAnterior(outubro, metasOut, '2026-11-07') === 1200, 'sugestão: caixa de outubro (4.000 − 2.500) − guardado de outubro (300) = 1.200, sem setembro e sem crédito');
    trava(nucleo.sugerirSobraDoMesAnterior([tx({ type: 'out', amount: 50, occurred_on: '2026-10-02' })], [], '2026-11-07') === 0, 'sugestão negativa vira zero');
    trava(nucleo.sugerirSobraDoMesAnterior([], [], '2026-11-07') === 0, 'mês anterior sem dados: zero');
    trava(nucleo.mesAnterior('2027-01-03') === '2026-12', 'mês anterior de janeiro é dezembro do ano anterior');
    const novembroVazio = calcularSafeToSpend(outubro, [], em(7));
    trava(novembroVazio.livreTotal === 0 && novembroVazio.sobraConfirmada === 0 && novembroVazio.semSaldo, 'sem confirmação a sobra é zero, mesmo com outubro positivo');
    const confirmada = calcularSafeToSpend(outubro, [], em(7), { sobraConfirmada: 800 });
    trava(centavos(confirmada.livreTotal) === 80000 && confirmada.semSaldo === false && centavos(confirmada.saldoAtual) === 0, 'sobra confirmada (800) entra só no Livre; Saldo atual segue zero');
    trava(calcularSafeToSpend(outubro, [], em(7), { sobraConfirmada: -50 }).livreTotal === 0, 'sobra negativa não entra');
    const confW = montarSnapshotWidgets({ userId: 'u', transactions: outubro, bills: [], goals: [], privacyHidden: false, hoje: em(7), sobraConfirmada: 800 });
    trava(centavos(confW.safeToSpend.livreTotal) === 80000, 'widget usa a mesma sobra confirmada');
    trava(centavos(nucleo.calcularLivre(outubro, [], '2026-11-07', { sobraConfirmada: 800 }).livreTotal) === 80000, 'Granabô usa a mesma sobra confirmada');
    ok('sobra: só a confirmada entra no Livre; sugestão = caixa do mês anterior, piso zero');
  }

  console.log(`\n${aprovadas} checagens da trava da regra 20 passaram — 0 falhas`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
