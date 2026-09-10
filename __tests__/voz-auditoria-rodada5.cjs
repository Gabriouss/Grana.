/* Bateria 5 extensa: composição de referências, valores e ciclo nativo.
 * node __tests__/voz-auditoria-rodada5.cjs.
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
  if (expected === null) {
    check('widget precisa revisar', text, writes.length, 0);
    check('revisão deixa recibo', text, reviews.length > 0, true);
  }
  else {
    check('widget precisa gravar', text, writes.length, 1);
    if (writes.length === 1) for (const [key, value] of Object.entries(expected)) check('widget ' + key, text, writes[0][key], value);
  }
  
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

async function cicloLocal() {
  cache.delete(path.resolve('lib/voz-local.ts'));
  let mode = 'ok', listeners = {}, starts = 0, aborts = 0, removed = 0, cleaned = [], release;
  const pending = () => new Promise(resolve => { release = resolve; });
  const api = load('lib/voz-local.ts', {
    'react-native': { Platform: { OS: 'android', Version: 33 } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: {
      supportsOnDeviceRecognition: () => true,
      getSupportedLocales: () => mode === 'idiomas' ? pending() : Promise.resolve({ installedLocales: ['pt-BR'] }),
      addListener(event, fn) { listeners[event] = fn; return { remove() { removed++; delete listeners[event]; } }; },
      abort() { aborts++; },
      start() {
        starts++;
        if (mode === 'start-throw') throw Error('simulado');
        if (mode === 'silencio') return;
        listeners.result({ isFinal: true, results: [{ transcript: 'café 5,57' }] });
        listeners.end({});
      },
    } },
    '@/modules/grana-voice-widget': { prepararAudioLocal: () => mode === 'pcm' ? pending() : Promise.resolve({ uri: 'file:///normal.pcm' }) },
    'expo-file-system/legacy': { deleteAsync: async uri => { cleaned.push(uri); } },
  });
  for (const stage of ['idiomas', 'pcm', 'silencio', 'start-throw']) {
    mode = stage;
    check('prazo ou falha conclui', stage, await api.transcreverNoAparelho('file:///a.m4a'), null);
    const before = starts;
    if (stage === 'idiomas' || stage === 'pcm') {
      release(stage === 'pcm' ? { uri: 'file:///tardio.pcm' } : { installedLocales: ['pt-BR'] });
      await new Promise(resolve => setTimeout(resolve, 5));
      check('resultado tardio não inicia motor', stage, starts, before);
      if (stage === 'pcm') check('PCM tardio limpo', stage, cleaned.includes('file:///tardio.pcm'), true);
    }
    mode = 'ok';
    check('recupera depois da falha', stage, await api.transcreverNoAparelho('file:///b.m4a'), 'café 5,57');
  }
  check('remove listeners em todos os reconhecimentos', 'ciclo', removed, starts * 3);
  check('aborta motor em toda conclusão', 'ciclo', aborts, starts);
}
(async () => {
  for (const [text, expected] of [
    ['mercado 2 mil e 500 reais e 50 centavos', 2500.5],
    ['mercado 2 mil e 50 reais e 99 centavos', 2050.99],
    ['mercado 2 mil e cinquenta centavos', 2000.5],
    ['mercado 2 mil e cinquenta e nove centavos', 2000.59],
    ['mercado 2 mil e 50,50 reais', 2050.5],
    ['mercado 2 mil e 500 e 50', 2500.5],
    ['mercado 2 mil e cinquenta e cinquenta', 2050.5],
  ]) check('escala com centavos explícitos', text, h.guessAmountFromText(text), expected);
  // Milhares explícitos x preços coloquiais. Oracle aritmético independente.
  for (const scale of [1, 2, 5, 10, 45, 99]) {
    for (let remainder = 1; remainder <= 999; remainder++) {
      for (const tail of [String(remainder), porExtenso(remainder)]) {
        const text = 'mercado ' + scale + ' mil e ' + tail + ' reais';
        check('escala explícita', text, h.guessAmountFromText(text), scale * 1000 + remainder);
        check('escala idempotente', text, h.guessAmountFromText(h.normalizarTexto(text)), scale * 1000 + remainder);
      }
    }
  }
  for (let reais = 1; reais <= 100; reais++) {
    for (let cent = 1; cent <= 99; cent++) {
      const text = 'mercado ' + reais + ' e ' + cent;
      check('centavos coloquiais preservados', text, h.guessAmountFromText(text), reais + cent / 100);
    }
  }
  for (const prefix of ['paguei o boleto da internet', 'quitei o boleto da internet', 'liquidei o boleto da internet']) {
    for (const value of ['0,01', '0,99', '18,99', '1200,50', '99999,99']) {
      await widget(prefix + ' ' + value + ' no pix', { kind: 'transaction', type: 'out', payment_method: 'pix', amount: Number(value.replace(',', '.')) });
    }
  }
  for (const date of ['hoje', 'amanhã', 'amanha', 'em 3 dias']) {
    await widget('internet 99,90 vence ' + date, { kind: 'bill', due_date: h.parseDiaVencimento('vence ' + date) });
  }
  for (const negative of ['não lançar', 'nao lancar', 'não quero lançar', 'não registrar', 'não salvar']) {
    for (const value of ['0,01', '18,99', '2500,50']) await widget('mercado ' + value + ' ' + negative, null);
  }
  for (const name of ['Pessoal', 'Empresa', 'João', 'Casa & Família', 'Viagem 2026', 'Reserva+']) {
    wallets = [{ id: 'p', name, is_default: true }, { id: 'pe', name: name + ' Empresa' }];
    for (const value of ['0,01', '0,99', '18,99', '2500,50']) {
      await widget('mercado ' + value + ' carteira ' + name, { wallet_id: 'p' });
      await widget('mercado ' + value + ' carteira ' + name + ' Empresa', { wallet_id: 'pe' });
      await widget('mercado ' + value + ' carteira ' + name + ' e carteira ' + name + ' Empresa', null);
      await widget('mercado ' + value + ' carteira ' + name + ' Empresa e carteira ' + name, null);
    }
  }
  wallets = [{ id: 'p', name: 'Pessoal', is_default: true }];
  for (const name of ['Mercado', 'Farmácia', 'Salário', 'Lazer', 'Moradia']) {
    cards = [{ id: 'c6', name, bank: 'C6', wallet_id: 'p' }, { id: 'nubank', name: 'Nubank Black', bank: 'Nubank', wallet_id: 'p' }];
    for (const [purchase, category] of [['uber', 'Transporte'], ['mercado', 'Alimentação'], ['farmácia', 'Saúde']]) {
      for (const prep of ['no crédito', 'no cartão', 'no cartão do']) {
        await widget(purchase + ' 18,99 ' + prep + ' ' + name, { category, card_id: 'c6' });
      }
    }
    await widget('mercado 18,99 no crédito ' + name + ' e Nubank', null);
  }
  cards = [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'p' }];
  for (const prep of ['no', 'de', 'do', 'da', 'na', '']) {
    await widget('mercado 18,99 no crédito ' + prep + ' Itaú', null);
  }
  await cicloLocal();
  console.log('RESULTADO', JSON.stringify({ total, passed: total - failed, failed, groups: Object.fromEntries(groups) }, null, 2));
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 2; });
