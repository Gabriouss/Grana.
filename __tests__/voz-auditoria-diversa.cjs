/* Regressões da primeira auditoria: módulos reais, referências fictícias, nenhuma rede.
 * Integrado ao test:voz/test:ci após a correção das famílias auditadas.
 * Execute: node __tests__/voz-auditoria-diversa.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file, deps = {}) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Date, setTimeout, clearTimeout, require(id) {
    if (id in deps) return deps[id];
    return load(path.resolve(path.dirname(absolute), id.endsWith('.ts') ? id : id + '.ts'));
  } }, { filename: absolute });
  return exports;
}
const h = load('lib/heuristics.ts');
const { precisaRevisarValorVoz } = load('lib/voz-confiabilidade.ts');
const { porExtenso } = load('__tests__/extenso.ts');
let total = 0, failed = 0;
const groups = new Map();
function check(group, text, got, expected) {
  total++;
  if (typeof expected === 'number' ? Number.isFinite(got) && Math.abs(got - expected) < .005 : got === expected) return;
  failed++;
  const entry = groups.get(group) ?? { count: 0, examples: [] };
  entry.count++;
  if (entry.examples.length < 12) entry.examples.push({ text, got, expected });
  groups.set(group, entry);
}
function amount(group, text, expected) {
  check(group, text, h.guessAmountFromText(text), expected);
}
// Oráculo independente: inteiros e centavos escolhidos antes de gerar a fala.
for (const reais of [1, 2, 5, 18, 45, 99, 100, 143, 999, 1000, 12000]) {
  for (let cents = 0; cents < 100; cents++) {
    const cc = String(cents).padStart(2, '0');
    const value = reais + cents / 100;
    for (const [group, form] of [
      ['controle decimal', `${reais},${cc}`],
      ['controle E', `${reais} e ${cents}`],
      ['decimal inteiro reais e centavos', `${reais},00 reais e ${cents} centavos`],
      ['hora h', `${reais}h${cc}`],
      ['hora dois pontos', `${reais}:${cc}`],
      ['reais com centavos extenso', `${reais} reais e ${porExtenso(cents)} centavos`],
      ['virgula zero falado', `${reais} vírgula ${cents < 10 ? 'zero ' + porExtenso(cents) : porExtenso(cents)}`],
    ]) amount(group, `mercado ${form}`, value);
  }
}
for (const [text, value] of [
  ['carro 45 mil reais', 45000], ['doce noventa e nove centavos', .99],
  ['café dois e meio', 2.5], ['merenda 5h57', 5.57],
  ['mercado 1.5 mil reais', 1500], ['mercado 2 mil e 500 reais', 2500],
  ['mercado 2 mil e quinhentos reais', 2500], ['mercado dois milhões de reais', 2000000],
  ['mercado 1 milhão e 200 mil reais', 1200000],
  ['mercado 18 reais e 99', 18.99], ['mercado 18,00 reais e 99 centavos', 18.99],
  ['mercado 1.250 reais e 50 centavos', 1250.5],
  ['café dois reais e meio', 2.5], ['café 2,50 reais', 2.5],
  ['mercado 5 h 57', 5.57], ['mercado 5:57.', 5.57],
  ['mercado 18 vírgula zero cinco', 18.05],
]) amount('dirigidos', text, value);

let task, writes = [], reviews = [];
let wallets = [{ id: 'p', name: 'Pessoal', is_default: true }];
let cards = [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'p' }];
let categories = [];
load('lib/widget-voz-task.ts', {
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { task = factory(); } } },
  './offline-cache': { isLikelyNetworkError: () => false },
  '@/modules/grana-voice-widget': { definirEstado() {} },
  './voz': { transcreverAudio: async () => { throw Error('não deve acessar transcrição remota'); } },
  './heuristics': h, './voz-confiabilidade': { precisaRevisarValorVoz },
  './data': { fetchCategories: async () => categories, fetchCreditCards: async () => cards },
  './wallets': { fetchWallets: async () => wallets },
  './voice-operations': { registrarOperacaoVoz: async (_id, _source, payload) => {
    writes.push(payload); return { status: 'committed', ids: ['fake'], operationId: 'fake' };
  } },
  './widget-voz-notificacoes': { podeNotificar: async () => true,
    notificarRevisao: async title => reviews.push(title), notificarSucesso: async () => {},
    notificarFalha: async code => { throw Error(code); } },
  './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } },
  './widgets-home-sync': {}, '@react-native-async-storage/async-storage': {},
  './widget-voz-pendentes': { removerVozPendente: async () => {} },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  'expo-file-system/legacy': { deleteAsync: async () => {} },
});
async function widget(text, expected, source = 'widget') {
  writes = []; reviews = [];
  await task({ caminho: '/fake.m4a', requestId: 'test', transcricao: text, source });
  if (expected === null) check('widget deve revisar', text, writes.length, 0);
  else {
    check('widget grava uma vez', text, writes.length, 1);
    if (writes.length === 1) for (const [key, value] of Object.entries(expected)) check('widget ' + key, text, writes[0][key], value);
  }
  console.log('WIDGET', JSON.stringify({ text, source, writes, reviews }));
}
// Extrai a função REAL da tela pela AST. Só os setters e o contexto React são
// dublês; o corpo executado vem do TSX atual, não de uma reimplementação.
function appFunction(file, name, text) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!found) throw Error('Função ausente: ' + name);
  const state = {};
  const context = { ...h, wallets, cards, walletCards: cards, activeWallet: wallets[0], categoriasExtras: [],
    operacaoVoz: {}, randomUUID: () => 'fake', todayISO: () => '2026-09-10',
    formatMoney: value => value, input: text };
  for (const field of ['WalletId', 'Type', 'Desc', 'Amount', 'Category', 'FormaPagamento', 'Recorrente', 'Recognized',
    'EditingTxId', 'TxWalletId', 'TxDesc', 'TxAmount', 'TxCategory', 'TxCatColor', 'TxCardId', 'TxInstallments',
    'TxRecurring', 'TxDate', 'NewTxOpen']) context['set' + field] = value => { state[field] = value; };
  vm.runInNewContext(ts.transpileModule(found.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText + `\n${name}(input);`, context, { filename: file });
  return state;
}
(async () => {
  for (const [text, expected] of [
    ['mercado 18 e 99 no pix', { amount: 18.99, payment_method: 'pix' }],
    ['mercado 99 centavos', { amount: .99 }],
    ['café dois e meio', { amount: 2.5 }],
    ['mercado 5h57', { amount: 5.57 }],
    ['mercado 45 mil reais', null],
    ['mercado 18 vírgula zero cinco', { amount: 18.05 }],
    ['mercado 18,00 reais e 99 centavos', { amount: 18.99 }],
    ['mercado 5:57.', { amount: 5.57 }],
    ['mercado 18,99 e farmácia 20 reais', null],
    ['mercado 18,99 não 28,99', null],
    ['mercado 18,99 reais e 5 centavos', null],
    ['mercado 18,99 no crédito C6 em 3 vezes', { amount: 18.99, kind: 'installment', installments: 3, card_id: 'c6' }],
    ['internet 89,90 boleto recorrente', { amount: 89.9, kind: 'bill', recurring: true }],
  ]) await widget(text, expected);
  await widget('mercado 18,99', null, 'app');
  await widget('mercado 18,99 carteira Pessoalidade', null);
  wallets.push({ id: 's', name: 'Salário' });
  await widget('mercado 18,99 carteira salario', { amount: 18.99, wallet_id: 's', type: 'out', category: 'Alimentação' });
  let appState = appFunction('components/PasteReceiptModal.tsx', 'processText', 'mercado 18,99 carteira salario');
  check('app tipo', 'mercado 18,99 carteira salario', appState.Type, 'out');
  appState = appFunction('components/PasteReceiptModal.tsx', 'processText', 'mercado 18,00 reais e 99 centavos');
  check('app valor', 'mercado 18,00 reais e 99 centavos', appState.Amount, 18.99);
  wallets.push({ id: 'n', name: 'Reserva 2,50' });
  await widget('carteira Reserva 2,50 mercado 18 reais', null);
  cards = [{ id: 'gold', name: 'Nubank Gold', bank: 'Nubank', wallet_id: 'p' },
    { id: 'black', name: 'Nubank Black', bank: 'Nubank', wallet_id: 'p' }];
  await widget('mercado 18,99 no crédito Nubank Black', { amount: 18.99, card_id: 'black' });
  appState = appFunction('app/(app)/credito.tsx', 'abrirNovaCompraDoTexto', 'mercado 18,99 no crédito Nubank Black');
  check('app cartão', 'mercado 18,99 no crédito Nubank Black', appState.TxCardId, 'black');
  await widget('mercado 18,99 no crédito Nubank', null);
  cards = [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'p' }];
  await widget('mercado 18,99 no crédito Itaú', null);
  categories = [{ name: 'Petiscos da Lua', color: '#123456', is_default: false }];
  // Precedência nativa é contrato atual do corpus-categorias-custom, não
  // regressão: documentar a limitação sem inventar uma exigência nova aqui.
  await widget('Petiscos da Lua 18,99 no débito', { amount: 18.99, category: 'Alimentação', payment_method: 'debit' });
  categories = [{ name: 'Projeto Aurora', color: '#123456', is_default: false }];
  await widget('Projeto Aurora 18,99 no débito', { amount: 18.99, category: 'Projeto Aurora', payment_method: 'debit' });
  await widget('mercado 18,99 carteira inexistente', null);
  console.log('RESULTADO', JSON.stringify({ total, passed: total - failed, failed, groups: Object.fromEntries(groups) }, null, 2));
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 2; });
