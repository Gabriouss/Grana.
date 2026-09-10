/* Bateria 4, sem rede: referências, roteamento e prazos locais.
 * node __tests__/voz-auditoria-rodada4.cjs; regressões incluídas no CI.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
// Comparação opcional, somente leitura, com os mesmos dublês e expectativas.
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
const cache = new Map();
function load(file, deps = {}) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  const relative = path.relative(process.cwd(), absolute).replace(/\\/g, '/');
  const source = baseline && relative.startsWith('lib/')
    ? execFileSync('git', ['show', `${baseline}:${relative}`], { encoding: 'utf8' })
    : fs.readFileSync(absolute, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Date, setTimeout: absolute.endsWith('voz-local.ts') ? (fn) => setTimeout(fn, 0) : setTimeout, clearTimeout, require(id) {
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
  if (typeof expected === 'number' ? Number.isFinite(got) && Math.abs(got - expected) < .005 : got === expected) return;
  failed++;
  const entry = groups.get(group) ?? { count: 0, examples: [] };
  entry.count++;
  if (entry.examples.length < 4) entry.examples.push({ text, got, expected });
  groups.set(group, entry);
}
let task, writes = [], reviews = [];
let wallets = [{ id: 'p', name: 'Pessoal', is_default: true }];
let cards = [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'p' }];
load('lib/widget-voz-task.ts', {
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { task = factory(); } } },
  './offline-cache': { isLikelyNetworkError: () => false },
  '@/modules/grana-voice-widget': { definirEstado() {} },
  './voz': { transcreverAudio: async () => { throw Error('Sem rede neste teste'); } },
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
  await task({ caminho: '/fake.m4a', requestId: text, transcricao: text });
  if (expected === null) check('widget precisa revisar', text, writes.length, 0);
  else {
    check('widget precisa gravar', text, writes.length, 1);
    if (writes.length === 1) for (const [key, value] of Object.entries(expected)) check('widget ' + key, text, writes[0][key], value);
  }
  console.log('WIDGET', JSON.stringify({ text, writes, reviews }));
}


async function localTimeout(stage) {
  cache.delete(path.resolve('lib/voz-local.ts'));
  const pending = new Promise(() => {});
  const api = load('lib/voz-local.ts', {
    'react-native': { Platform: { OS: 'android', Version: 33 } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: {
      supportsOnDeviceRecognition: () => true,
      getSupportedLocales: () => stage === 'idiomas' ? pending : Promise.resolve({ installedLocales: ['pt-BR'] }),
    } },
    '@/modules/grana-voice-widget': { prepararAudioLocal: () => pending },
    'expo-file-system/legacy': { deleteAsync: async () => {} },
  });
  // Todos os timers do módulo real são encurtados a 0 ms pelo loader.
  // O watchdog externo dá tempo para qualquer prazo instalado concluir.
  const result = await Promise.race([api.transcreverNoAparelho('file:///fake.m4a'),
    new Promise(resolve => setTimeout(() => resolve('sem prazo instalado'), 40))]);
  check('pré-reconhecimento precisa ter prazo', stage, result, null);
  const next = await api.transcreverNoAparelho('file:///next.m4a');
  console.log('LOCAL', JSON.stringify({stage,result,next}));
}
(async () => {
  for (const amount of ['18,99', '50,25', '1200,50']) {
    await widget('paguei o boleto da internet ' + amount + ' no pix', { kind: 'transaction', type: 'out', payment_method: 'pix' });
    await widget('internet ' + amount + ' vence amanhã', { kind: 'bill' });
    await widget('mercado ' + amount + ' não lançar', null);
  }
  wallets = [{ id: 'p', name: 'Pessoal', is_default: true }, { id: 'pe', name: 'Pessoal Empresa' }];
  await widget('mercado 18,99 carteira Pessoal e carteira Pessoal Empresa', null);
  await widget('mercado 18,99 carteira Pessoal Empresa', { wallet_id: 'pe' });
  wallets = [{ id: 'p', name: 'Pessoal', is_default: true }];
  cards = [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'p' },
    { id: 'black', name: 'Nubank Black', bank: 'Nubank', wallet_id: 'p' }];
  await widget('mercado 18,99 no crédito C6 e Nubank Black', null);
  await widget('mercado 18,99 no crédito C6 e Nubank', null);
  await widget('mercado 18,99 no crédito Nubank Black', { card_id: 'black' });
  cards = [{ id: 'm', name: 'Mercado', bank: 'C6', wallet_id: 'p' }];
  await widget('uber 18,99 no crédito Mercado', { card_id: 'm', category: 'Transporte' });
  await widget('uber 18,99 no pix', { kind: 'transaction', category: 'Transporte', payment_method: 'pix' });
  await localTimeout('idiomas');
  await localTimeout('conversão PCM');
  console.log('RESULTADO', JSON.stringify({ total, passed: total - failed, failed, groups: Object.fromEntries(groups) }, null, 2));
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 2; });
