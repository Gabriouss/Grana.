/* Terceira bateria: combinações após de546cf. Só módulos reais e dublês locais.
 * node __tests__/voz-auditoria-rodada3.cjs
 * Corpus exploratório fora do CI; saída 1 identifica expectativas não atendidas.
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
  }).outputText, { exports, console, Date, setTimeout, clearTimeout, require(id) {
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
for (const scale of [1, 2, 5, 45]) {
  for (let remainder = 1; remainder < 100; remainder++) {
    for (const tail of [String(remainder), porExtenso(remainder)]) {
      const text = `mercado ${scale} mil e ${tail} reais`;
      check('milhar com resto abaixo de cem', text, h.guessAmountFromText(text), scale * 1000 + remainder);
    }
  }
  for (const remainder of [100, 150, 500, 999]) {
    const text = `mercado ${scale} mil e ${remainder} reais`;
    check('controle milhar com centenas', text, h.guessAmountFromText(text), scale * 1000 + remainder);
  }
}
for (const value of [1, 5, 18, 50, 99, 100, 1000]) {
  for (const cent of [1, 5, 9, 10, 50, 99]) {
    for (const suffix of ['', ' reais', ' no pix', ' no débito']) {
      const text = `mercado ${value} e ${cent}${suffix}`;
      const expected = value + cent / 100;
      check('controle reais e centavos', text, h.guessAmountFromText(text), expected);
      check('normalização repetida preserva valor', text, h.guessAmountFromText(h.normalizarTexto(text)), expected);
    }
  }
}

let task, writes = [], reviews = [];
const wallets = [{ id: 'p', name: 'Pessoal', is_default: true }];
const cards = [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'p' }];
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

// Eventos do reconhecedor nativo: dublê do dispositivo, módulo de voz real.
async function localRecognition() {
  let listeners = {}, mode = 'ok', starts = 0, removes = 0, cleanups = 0;
  const native = { supportsOnDeviceRecognition: () => true,
    getSupportedLocales: async () => ({ installedLocales: ['pt_BR'] }),
    addListener: (event, fn) => { listeners[event] = fn; return { remove() { removes++; } }; },
    abort() {}, start(options) {
      starts++;
      check('local exige reconhecimento offline', mode, options.requiresOnDeviceRecognition, true);
      queueMicrotask(() => {
        if (mode === 'error') { listeners.error({}); return; }
        if (mode !== 'empty') listeners.result({ isFinal: true, results: [{ transcript: 'mercado 18 e 99' }] });
        listeners.end({});
      });
    } };
  const local = load('lib/voz-local.ts', {
    'react-native': { Platform: { OS: 'android', Version: 33 } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: native },
    '@/modules/grana-voice-widget': { prepararAudioLocal: async () => ({ uri: 'file:///fake.pcm' }) },
    'expo-file-system/legacy': { deleteAsync: async () => { cleanups++; } },
  });
  for (const entry of ['ok', 'empty', 'error', 'ok']) {
    mode = entry;
    check('local resultado/recuperação', mode, await local.transcreverNoAparelho('file:///fake.m4a'), mode === 'ok' ? 'mercado 18 e 99' : null);
  }
  mode = 'ok';
  const first = local.transcreverNoAparelho('file:///first.m4a');
  check('local concorrência', 'segunda chamada enquanto ocupado', await local.transcreverNoAparelho('file:///second.m4a'), null);
  await first;
  check('local limpeza', 'PCM limpo em toda conclusão', cleanups, starts);
  check('local listeners', 'assinaturas removidas', removes, starts * 3);
}
(async () => {
  await widget('mercado 2 mil e 50 reais', { amount: 2050 });
  await widget('mercado 18,99 no crédito Itaú', null);
  await widget('mercado 18,99 no crédito no Itaú', null);
  await widget('mercado 18,99 no crédito do Itaú', null);
  await widget('mercado 18,99 no crédito de Itaú', null);
  await widget('mercado 18,99 e farmácia 20', null);
  await widget('mercado 18,99 e farmácia 20,50', null);
  await widget('mercado 18,99 no crédito C6', { amount: 18.99, card_id: 'c6' });
  await widget('mercado 18,99 não quero que se repita todo mês', { recurring: false });
  await localRecognition();
  console.log('RESULTADO', JSON.stringify({ total, passed: total - failed, failed, groups: Object.fromEntries(groups) }, null, 2));
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 2; });
