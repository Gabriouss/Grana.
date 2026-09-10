/* Segunda bateria exploratória, sem correções e sem rede.
 * node __tests__/voz-auditoria-rodada2.cjs
 * Saída 1: expectativas ainda não atendidas. Fora do test:ci.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [2026, 8, 10, 12, 0, 0])); }
  static now() { return new FixedDate().getTime(); }
}
function load(file, deps = {}) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Date: FixedDate, setTimeout, clearTimeout, require(id) {
    if (id in deps) return deps[id];
    return load(path.resolve(path.dirname(absolute), id.endsWith('.ts') ? id : id + '.ts'));
  } }, { filename: absolute });
  return exports;
}
const h = load('lib/heuristics.ts');
const { porExtenso } = load('__tests__/extenso.ts');
const { precisaRevisarValorVoz } = load('lib/voz-confiabilidade.ts');
let total = 0, failed = 0;
const groups = new Map();
function check(group, text, got, expected) {
  total++;
  if (Object.is(got, expected)) return;
  failed++;
  const entry = groups.get(group) ?? { count: 0, examples: [] };
  entry.count++;
  if (entry.examples.length < 5) entry.examples.push({ text, got, expected });
  groups.set(group, entry);
}

// Todas as parcelas suportadas (2..36), diferentes quantias e grafias.
for (let n = 2; n <= 36; n++) {
  for (const amount of ['18,99', '1200,50', '9999,90']) {
    const feminine = porExtenso(n).replace(/\bum\b/g, 'uma').replace(/\bdois\b/g, 'duas');
    for (const form of [`em ${n}x`, `em ${n} vezes`, `em ${n} parcelas`,
      `em ${feminine} vezes`, `em ${feminine} parcelas`, `parcelado em ${porExtenso(n)}`]) {
      const text = `mercado ${amount} no crédito C6 ${form}`;
      check('parcelas', text, h.parseParcelas(text), n);
      check('parcelamento não recorrente', text, h.parseRecorrencia(text), false);
    }
  }
}
for (const text of ['internet 89,90 não recorrente', 'internet 89,90 não se repete',
  'internet 89,90 sem ser recorrente', 'internet 89,90 não repetir todo mês']) {
  check('negação recorrência', text, h.parseRecorrencia(text), false);
}
for (const [text, expected] of [
  ['internet 89,90 todo mês', true], ['internet 89,90 todos os meses', true],
  ['internet 89,90 todo o mês', true], ['internet 89,90 mensalmente', true],
  ['internet 89,90 a cada mês', true], ['internet 89,90 toda semana', false],
  ['internet 89,90 diariamente', false], ['internet 89,90 assinatura', false],
]) check('controle recorrência', text, h.parseRecorrencia(text), expected);

// Datas explícitas válidas: expectativa construída por calendário independente.
for (let month = 1; month <= 12; month++) {
  const days = new Date(2027, month, 0).getDate();
  for (let day = 1; day <= days; day++) {
    for (const sep of ['/', '-']) {
      const text = `internet 89,90 boleto vence ${day}${sep}${month}${sep}2027`;
      const expected = `2027-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      check('datas explícitas válidas', text, h.parseDiaVencimento(text), expected);
    }
  }
}
for (const [phrase, expected] of [
  ['vence amanhã', '2026-09-11'], ['vence hoje', '2026-09-10'],
  ['vence em dois dias', '2026-09-12'], ['vence dia vinte', '2026-09-20'],
  ['vence dia 20', '2026-09-20'], ['vence dia 5', '2026-10-05'],
  ['vence 20 de setembro', '2026-09-20'],
]) check('datas faladas', phrase, h.parseDiaVencimento('internet 89,90 boleto ' + phrase), expected);
for (const date of ['31/02/2027', '29/02/2027', '31/04/2027', '31/06/2027', '31/09/2027', '31/11/2027']) {
  const parsed = h.parseDiaVencimento('internet 89,90 boleto vence ' + date);
  const [y, m, d] = parsed.split('-').map(Number);
  check('data retornada precisa existir', `${date} -> ${parsed}`, new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === parsed, true);
}

let task, writes = [], reviews = [];
let wallets = [{ id: 'p', name: 'Pessoal', is_default: true }, { id: 'e', name: 'Empresa' }];
let cards = [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'p' },
  { id: 'ec6', name: 'C6 Empresa', bank: 'C6', wallet_id: 'e' }];
load('lib/widget-voz-task.ts', {
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { task = factory(); } } },
  './offline-cache': { isLikelyNetworkError: () => false },
  '@/modules/grana-voice-widget': { definirEstado() {} },
  './voz': { transcreverAudio: async () => { throw Error('rede não permitida neste teste'); } },
  './heuristics': h, './voz-confiabilidade': { precisaRevisarValorVoz },
  './data': { fetchCategories: async () => [], fetchCreditCards: async () => cards },
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
async function widget(text, expected) {
  writes = []; reviews = [];
  await task({ caminho: '/fake.m4a', requestId: text, transcricao: text, source: 'widget' });
  if (expected === null) check('widget deveria revisar', text, writes.length, 0);
  else {
    check('widget deveria gravar', text, writes.length, 1);
    if (writes.length === 1) for (const [key, value] of Object.entries(expected)) check('widget ' + key, text, writes[0][key], value);
  }
  console.log('WIDGET', JSON.stringify({ text, writes, reviews }));
}
function screen(file, name, text) {
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
  for (const field of ['EditingBillId', 'Desc', 'Amount', 'Category', 'CatColor', 'DueDate', 'Recurring', 'ModalOpen',
    'EditingTxId', 'TxWalletId', 'TxDesc', 'TxAmount', 'TxCategory', 'TxCatColor', 'TxCardId', 'TxInstallments',
    'TxRecurring', 'TxDate', 'NewTxOpen']) context['set' + field] = value => { state[field] = value; };
  vm.runInNewContext(ts.transpileModule(found.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText + `\n${name}(input);`, context, { filename: file });
  return state;
}
(async () => {
  const billText = 'internet 89,90 boleto vence amanhã não recorrente';
  const billState = screen('app/(app)/contas.tsx', 'abrirNovaContaDoTexto', billText);
  check('app vencimento', billText, billState.DueDate, '2026-09-11');
  check('app recorrência', billText, billState.Recurring, false);
  const creditText = 'mercado 1200,50 no crédito C6 em vinte e duas vezes';
  const creditState = screen('app/(app)/credito.tsx', 'abrirNovaCompraDoTexto', creditText);
  check('app parcelas', creditText, creditState.TxInstallments, '22');
  for (const [text, expected] of [
    ['mercado 1200,50 no crédito C6 em vinte e duas vezes', { kind: 'installment', installments: 22 }],
    ['mercado 1200,50 no crédito C6 em vinte e uma parcelas', { kind: 'installment', installments: 21 }],
    ['mercado 1200,50 no crédito C6 em trinta e cinco parcelas', { kind: 'installment', installments: 35 }],
    ['mercado 1200,50 no crédito C6 em 37 parcelas', null],
    ['internet 89,90 não recorrente', { recurring: false }],
    ['internet 89,90 não se repete', { recurring: false }],
    ['internet 89,90 boleto vence amanhã', { kind: 'bill', due_date: '2026-09-11' }],
    ['internet 89,90 boleto vence dia vinte', { kind: 'bill', due_date: '2026-09-20' }],
    ['internet 89,90 boleto vence 31/02/2027', null],
    ['mercado 34,57 no crédito C6 Empresa carteira Empresa', { card_id: 'ec6', wallet_id: 'e' }],
    ['mercado 34,57 no débito C6 carteira Empresa', { payment_method: 'debit', wallet_id: 'e' }],
    ['mercado 34,57 no pix carteira Pessoal', { payment_method: 'pix', wallet_id: 'p' }],
  ]) await widget(text, expected);
  cards = [cards[0]];
  await widget('recebi um crédito de 89,90 de salário', { kind: 'transaction', type: 'in' });
  cards.push({ id: 'ec6', name: 'C6 Empresa', bank: 'C6', wallet_id: 'e' });
  for (const name of ['Crédito', 'Débito', 'Boleto', 'Recorrente']) {
    wallets = [{ id: 'p', name: 'Pessoal', is_default: true }, { id: 'e', name }];
    await widget(`mercado 34,57 carteira ${name}`, { kind: 'transaction', type: 'out', wallet_id: 'e', recurring: false, payment_method: undefined });
  }
  console.log('RESULTADO', JSON.stringify({ total, passed: total - failed, failed, groups: Object.fromEntries(groups) }, null, 2));
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 2; });
