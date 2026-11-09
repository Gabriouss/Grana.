// A4: expressoes REAIS da Inicio e modulos reais; React e I/O sao fronteiras.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar, root } = require('./_carregar-ts.cjs');
const sobra = carregar('lib/sobra-do-mes.ts', {
  './supabase': { supabase: {} }, './sessao-offline': { idDoUsuarioLocal: async () => 'u' },
});
const credito = carregar('lib/creditoFaturas.ts');
const financeiro = carregar('lib/safe-to-spend.ts');
const { montarSnapshotWidgets } = carregar('lib/widgets-home-snapshot.ts');
const fonte = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
const ast = ts.createSourceFile('inicio.tsx', fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaracoes = new Map();
let pode;
function visitar(n) {
  if (ts.isVariableDeclaration(n) && n.initializer) declaracoes.set(n.name.getText(ast), n.initializer);
  if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'PerguntaSobraDoMes') {
    pode = n.attributes.properties.find(p => p.name?.getText(ast) === 'pode').initializer.expression;
  }
  ts.forEachChild(n, visitar);
}
visitar(ast);
assert.ok(pode, 'Pergunta real encontrada');
const principal = { id: 'p', user_id: 'u', name: 'Renomeada', is_default: true, created_at: '2026-01-01' };
const outra = { id: 'o', user_id: 'u', name: 'Principal', is_default: false, created_at: '2025-01-01' };
const confirmada = { userId: 'u', mes: '2026-11', estado: 'confirmada', valor: 200 };
const hoje = new Date(2026, 10, 7, 12);
let id = 0, checks = 0;
const tx = (amount, wallet_id, extra = {}) => ({ id: String(++id), user_id: 'u', type: 'in', amount,
  wallet_id, occurred_on: '2026-11-05', created_at: '2026-11-05T12:00:00Z', ...extra });
const centavos = n => Math.round(n * 100);
function igual(real, esperado, nome) { assert.equal(real, esperado, nome); checks++; }
function inicio(activeWalletId, transactions, wallets = [principal], extras = {}) {
  const env = { ...sobra, ...credito, ...financeiro, Date, useMemo: f => f(), wallets, userId: 'u',
    activeWalletId, transactions, creditCards: [], goals: [], bills: [], invoicePayments: [],
    sobraDoMes: confirmada, hojeDaSobra: '2026-11-07', sobraAdiada: false,
    carregandoFontesLivre: false, inicioEmFoco: true, ...extras };
  const nomes = ['carteiraPrincipalId', 'carteiraIncluiSobra', 'walletTransactions', 'walletBills', 'walletGoals', 'safeToSpend'];
  const codigo = nomes.filter(n => declaracoes.has(n)).map(n => `const ${n} = ${declaracoes.get(n).getText(ast)};`).join('\n')
    + `\nexports.r = { safeToSpend, walletTransactions, walletBills, walletGoals, pode: ${pode.getText(ast)} };`;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(codigo, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText, { ...env, exports });
  return exports.r;
}
function main() {
  const legado = tx(100, null);
  const uma = inicio('p', [legado]);
  igual(uma.safeToSpend.saldoAtual, 300, 'uma carteira: Principal inclui legado e sobra confirmada');
  igual(uma.safeToSpend.saldoAtual, inicio('total', [legado]).safeToSpend.saldoAtual, 'uma carteira: Total igual Principal');
  const pendente = { sobraDoMes: { userId: 'u', mes: '2026-11', estado: 'pendente' } };
  igual(inicio('p', [], [principal], pendente).pode, true, 'pergunta na unica Principal');
  const carteiras = [outra, { ...principal, id: 'estrangeira', user_id: 'outro' }, principal];
  const linhas = [legado, tx(20, 'p', { type: 'out' }), tx(70, 'o'), tx(10, 'o', { type: 'out' })];
  const metas = [
    { id: 'g-p', title: 'Meta P', current_amount: 15, target_amount: 100, wallet_id: null, month_reserves: { '2026-11': 15 } },
    { id: 'g-o', title: 'Meta O', current_amount: 5, target_amount: 100, wallet_id: 'o', month_reserves: { '2026-11': 5 } },
  ];
  const p = inicio('p', linhas, carteiras, { goals: metas });
  const o = inicio('o', linhas, carteiras, { goals: metas });
  const total = inicio('total', linhas, carteiras, { goals: metas });
  igual(p.safeToSpend.saldoAtual, 280, 'varias carteiras: Principal segue recebendo sobra e legado');
  igual(o.safeToSpend.saldoAtual, 60, 'outra tem apenas os proprios lancamentos, sem sobra');
  igual(total.safeToSpend.saldoAtual, 340, 'Total conta sobra uma vez');
  for (const campo of ['saldoAtual', 'livreTotal', 'reservadoEmMetas', 'entradasPrevistas']) {
    igual(centavos(total.safeToSpend[campo]), centavos(p.safeToSpend[campo]) + centavos(o.safeToSpend[campo]), `Total = Principal + outra: ${campo}`);
  }
  igual(p.walletTransactions.some(t => t.id === legado.id), true, 'lista real da Principal inclui legado');
  igual(o.walletTransactions.some(t => t.id === legado.id), false, 'legado nao aparece na outra');
  igual(inicio('p', [], carteiras, pendente).pode, true, 'pergunta na Principal mesmo com varias carteiras');
  igual(inicio('o', [], carteiras, pendente).pode, false, 'sem pergunta em outra carteira, mesmo chamada Principal');
  igual(inicio('total', [], carteiras, pendente).pode, true, 'pergunta no Total');
  for (const extra of [{ sobraAdiada: true }, { carregandoFontesLivre: true }, { inicioEmFoco: false }]) {
    igual(inicio('p', [], carteiras, { ...pendente, ...extra }).pode, false, 'guardas reais de adiamento/carga/foco preservadas');
  }
  igual(inicio('estrangeira', [], carteiras).safeToSpend.sobraConfirmada, 0, 'default de outro dono nao recebe sobra');
  igual(inicio('o', [], [outra]).safeToSpend.sobraConfirmada, 0, 'nao inventa default pela posicao/nome/unica carteira');
  igual(sobra.carteiraPrincipalDaSobra(carteiras, null), null, 'sem dono nao resolve Principal');
  igual(sobra.carteiraPrincipalDaSobra([outra], 'u'), null, 'sem is_default nao escolhe primeira carteira');
  igual(inicio('p', [tx(9, undefined)]).safeToSpend.saldoAtual, 209, 'legado com wallet_id ausente tambem pertence a Principal');
  for (const estado of [null, { ...confirmada, userId: 'outro' }, { ...confirmada, mes: '2026-10' }, pendente.sobraDoMes]) {
    igual(inicio('p', [], carteiras, { sobraDoMes: estado }).safeToSpend.sobraConfirmada, 0, 'sobra continua validada por dono/mes/confirmacao');
  }
  const snapshot = montarSnapshotWidgets({ userId: 'u', transactions: linhas, bills: [], goals: metas,
    privacyHidden: false, hoje, sobraConfirmada: sobra.sobraParaOLivre(confirmada, 'u', '2026-11') });
  igual(centavos(snapshot.safeToSpend.livreTotal), centavos(total.safeToSpend.livreTotal), 'widget Total e Inicio Total usam mesmo nucleo e sobra uma vez');
  const cards = [{ id: 'c', wallet_id: 'o' }];
  const compra = tx(500, 'p', { type: 'out', card_id: 'c', payment_method: 'credit' });
  igual(credito.lancamentosDaCarteira([compra], cards, 'p', 'p').length, 0, 'compra continua pertencendo a carteira do cartao');
  igual(credito.lancamentosDaCarteira([compra], cards, 'o', 'p').length, 1, 'carteira do cartao preservada');
  console.log(`sobra-carteira: ${checks} checagens reais de A4 passaram`);
}
module.exports = main;
if (require.main === module) main();
