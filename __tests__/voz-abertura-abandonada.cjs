/*
 * Item 29 (20/11/2026): o botão de voz do app aguardava permissão, sessão de
 * áudio e `prepareToRecordAsync()` sem conferir se a pessoa ainda estava ali.
 * Um preparo que voltava depois de sair da tela, mandar o app para o fundo ou
 * desmontar o botão chegava a `record()` e armava o envio; um preparo que
 * nunca voltava deixava o botão mudo, sem recibo.
 *
 * Executa o `components/VoiceEntryButton.tsx` REAL (transpilado, dublês só nos
 * imports) e conta as chamadas: prepare, record, stop, apagar e tarefa.
 *
 *   node __tests__/voz-abertura-abandonada.cjs
 *   VOZ_BOTAO_ARQUIVO=<caminho> node __tests__/voz-abertura-abandonada.cjs   (RED contra a base)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const arquivoBotao = process.env.VOZ_BOTAO_ARQUIVO || path.join(root, 'components/VoiceEntryButton.tsx');

function carregar(arquivo, dependencias, globais = {}) {
  const fonte = fs.readFileSync(path.isAbsolute(arquivo) ? arquivo : path.join(root, arquivo), 'utf8');
  const js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const modulo = { exports: {} };
  vm.runInNewContext(js, {
    exports: modulo.exports, module: modulo, console, Math, Number, Promise, Error, JSON, Object, Array, String,
    require(id) {
      if (dependencias && id in dependencias) return dependencias[id];
      if (id in require('./modulos-puros-reais.cjs')) return require('./modulos-puros-reais.cjs')[id];
      throw new Error('Import não simulado: ' + id);
    },
    ...globais,
  }, { filename: arquivo });
  return modulo.exports;
}

const captura = carregar('lib/voz-captura.ts');
const recibos = carregar('lib/voz-recibos.ts');

/** Preparo controlado: cada chamada devolve uma promessa que o teste resolve ou rejeita. */
function montar({ preparoImediato = false } = {}) {
  const reg = { prepares: 0, records: 0, stops: 0, apagados: [], tarefas: 0, alertas: [], avisos: [] };
  const preparos = [];
  let foco = true;
  let estadoApp = 'active';
  const ouvintesApp = [];
  let relogio = 1_000_000;
  const timers = [];
  let proximoId = 1;

  const hooks = [];
  const efeitos = [];
  let posicao = 0;
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }), Fragment: 'Fragment' };
  const reactMod = {
    ...React, default: React,
    useState(inicial) {
      const i = posicao++;
      if (!(i in hooks)) hooks[i] = inicial;
      return [hooks[i], (v) => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; }];
    },
    useRef(inicial) { const i = posicao++; if (!(i in hooks)) hooks[i] = { current: inicial }; return hooks[i]; },
    useEffect(fn, deps) {
      const i = posicao++;
      const antes = efeitos[i];
      const mudou = !antes || !deps || deps.length !== antes.deps.length || deps.some((d, k) => !Object.is(d, antes.deps[k]));
      if (mudou) efeitos[i] = { fn, deps: deps ?? [], limpar: antes?.limpar, pendente: true };
    },
  };
  const AppPressable = function AppPressable() {};
  const gravador = {
    uri: 'file:///cache/voz.m4a',
    prepareToRecordAsync() {
      reg.prepares++;
      if (preparoImediato) return Promise.resolve();
      return new Promise((resolve, reject) => preparos.push({ resolve, reject }));
    },
    record() { reg.records++; },
    stop: async () => { reg.stops++; },
    getStatus: () => ({ metering: -160 }),
  };
  const deps = {
    react: reactMod,
    'expo-router': { useIsFocused: () => foco },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Text: 'Text', Platform: { OS: 'android' }, StyleSheet: { create: (x) => x },
      AppState: {
        get currentState() { return estadoApp; },
        addEventListener: (_tipo, fn) => { ouvintesApp.push(fn); return { remove: () => ouvintesApp.splice(ouvintesApp.indexOf(fn), 1) }; },
      },
    },
    '@/lib/alerta': { Alert: { alert: (titulo) => { reg.alertas.push(titulo); } } },
    '@expo/vector-icons/Ionicons': 'Ionicons',
    'expo-audio': {
      AudioQuality: { MEDIUM: 0 }, IOSOutputFormat: { MPEG4AAC: 0 },
      getRecordingPermissionsAsync: async () => ({ status: 'granted' }),
      requestRecordingPermissionsAsync: async () => ({ granted: true }),
      setAudioModeAsync: async () => {},
      useAudioRecorder: () => gravador,
    },
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, fonts: {}, type: {} },
    '@/lib/haptics': { hapticSuccess: () => {} },
    '@/lib/voz': { MAX_SEGUNDOS_GRAVACAO: 20, mensagemDeErroVoz: (c) => ({ titulo: 'erro:' + c, texto: '' }) },
    '@/lib/voz-captura': captura,
    '@/modules/grana-voice-widget': { iniciarMonitoramentoCaptura() {}, capturaSilenciada: () => false, pararMonitoramentoCaptura() {} },
    '@/lib/voz-recibos': recibos,
    './AppPressable': { __esModule: true, default: AppPressable },
    './AppDialog': { __esModule: true, default: function AppDialog() {} },
    'expo-crypto': { randomUUID: () => 'req-1' },
    '@/lib/widget-voz-task': { executarTarefa: async () => { reg.tarefas++; } },
    'expo-file-system': { File: class { get exists() { return true; } get size() { return 50_000; } } },
    'expo-file-system/legacy': { deleteAsync: async (uri) => { reg.apagados.push(uri); } },
  };
  const { default: VoiceEntryButton } = carregar(arquivoBotao, deps, {
    setTimeout: (fn, ms) => { const id = proximoId++; timers.push({ id, fn, ms, vivo: true }); return id; },
    clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.vivo = false; },
    setInterval: (fn, ms) => { const id = proximoId++; timers.push({ id, fn, ms, vivo: true, repete: true }); return id; },
    clearInterval: (id) => { const t = timers.find((x) => x.id === id); if (t) t.vivo = false; },
    Date: { now: () => relogio },
    __DEV__: false,
    React,
  });

  let montado = true;
  function render() {
    posicao = 0;
    const arvore = VoiceEntryButton({ onTranscribed() {}, label: 'Voz' });
    for (const e of efeitos) {
      if (!e?.pendente) continue;
      e.pendente = false;
      if (typeof e.limpar === 'function') e.limpar();
      e.limpar = e.fn();
    }
    const achar = (no) => {
      if (!no || typeof no !== 'object') return null;
      if (no.type === AppPressable) return no;
      for (const filho of [].concat(no.props?.children ?? [])) { const r = achar(filho); if (r) return r; }
      return null;
    };
    return achar(arvore).props;
  }
  const esperar = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
  render();
  return {
    reg,
    /** Toca sem esperar o handler: ele pode estar preso no preparo. */
    async tocar() { assert.ok(montado, 'tocar depois de desmontar'); void render().onPress(); await esperar(); },
    async desmontar() { montado = false; for (const e of efeitos) if (typeof e?.limpar === 'function') e.limpar(); await esperar(); },
    async focar(v) { foco = v; render(); await esperar(); },
    async irPara(estado) { estadoApp = estado; for (const fn of [...ouvintesApp]) fn(estado); await esperar(); },
    async resolverPreparo(i = 0) { preparos[i].resolve(); await esperar(); },
    async rejeitarPreparo(i = 0) { preparos[i].reject(new Error('prepare falhou')); await esperar(); },
    async vencer(ms) {
      relogio += ms;
      for (const t of timers.filter((x) => x.vivo && !x.repete && x.ms === ms)) { t.vivo = false; t.fn(); }
      await esperar();
    },
  };
}

const falhas = [];
let aprovadas = 0;
async function caso(nome, corpo) {
  try { await corpo(); aprovadas++; console.log('  ok  ' + nome); }
  catch (e) { falhas.push(nome); console.log('  FALHOU  ' + nome + '\n          ' + (e && e.message)); }
}

process.exitCode = 1;
(async () => {
  console.log('\nItem 29: abertura do microfone abandonada (' + path.relative(root, arquivoBotao) + ')');

  await caso('controle: preparo que volta grava uma vez e o segundo toque envia', async () => {
    const b = montar({ preparoImediato: true });
    await b.tocar();
    assert.equal(b.reg.prepares, 1);
    assert.equal(b.reg.records, 1);
    await b.tocar();
    assert.equal(b.reg.stops, 1);
    assert.equal(b.reg.tarefas, 1, 'a fala normal segue para o núcleo uma vez');
    assert.deepEqual(b.reg.alertas, []);
  });

  await caso('desmontar com o preparo retido: a volta tardia não grava nem envia, e o preparo é descartado', async () => {
    const b = montar();
    await b.tocar();
    assert.equal(b.reg.prepares, 1);
    await b.desmontar();
    await b.resolverPreparo();
    assert.equal(b.reg.records, 0, 'record depois de desmontar');
    assert.equal(b.reg.tarefas, 0, 'upload/tarefa depois de desmontar');
    assert.equal(b.reg.stops, 1, 'o gravador preparado é fechado');
    assert.deepEqual(b.reg.apagados, ['file:///cache/voz.m4a'], 'o arquivo do preparo abandonado é apagado');
  });

  await caso('sair da tela e voltar antes do preparo voltar: a intenção antiga continua abandonada', async () => {
    const b = montar();
    await b.tocar();
    await b.focar(false);
    await b.focar(true);
    await b.resolverPreparo();
    assert.equal(b.reg.records, 0, 'record de uma intenção abandonada pelo blur');
    assert.equal(b.reg.tarefas, 0);
    assert.equal(b.reg.stops, 1);
    await b.tocar();
    assert.equal(b.reg.prepares, 2, 'nova intenção abre de novo depois de liberar o gravador');
    await b.resolverPreparo(1);
    assert.equal(b.reg.records, 1, 'a nova intenção grava uma vez');
  });

  await caso('app vai para o fundo durante o preparo: zero record; voltar ao ativo não ressuscita', async () => {
    const b = montar();
    await b.tocar();
    await b.irPara('background');
    await b.irPara('active');
    await b.resolverPreparo();
    assert.equal(b.reg.records, 0, 'record depois do fundo');
    assert.equal(b.reg.tarefas, 0);
  });

  await caso('`inactive` (diálogo do iOS) não abandona a abertura', async () => {
    const b = montar();
    await b.tocar();
    await b.irPara('inactive');
    await b.irPara('active');
    await b.resolverPreparo();
    assert.equal(b.reg.records, 1, 'inactive sozinho não cancela');
  });

  await caso('preparo que nunca volta: recibo no prazo, sem preparo sobreposto, e libera quando volta', async () => {
    const b = montar();
    await b.tocar();
    await b.vencer(20_000);
    assert.deepEqual(b.reg.alertas, ['Não consegui abrir o microfone'], 'o prazo dá recibo visível');
    await b.tocar();
    assert.equal(b.reg.prepares, 1, 'não prepara de novo enquanto o preparo antigo segura o gravador');
    assert.equal(b.reg.alertas[1], 'Microfone ainda ocupado', 'o toque durante a reserva explica por que não abriu');
    await b.resolverPreparo();
    assert.equal(b.reg.records, 0, 'o preparo que voltou tarde não grava');
    assert.equal(b.reg.stops, 1);
    assert.equal(b.reg.tarefas, 0);
    await b.tocar();
    assert.equal(b.reg.prepares, 2, 'depois de liberado, nova tentativa abre');
    await b.resolverPreparo(1);
    assert.equal(b.reg.records, 1);
  });

  await caso('preparo que rejeita: recibo e nova tentativa liberada', async () => {
    const b = montar();
    await b.tocar();
    await b.rejeitarPreparo();
    assert.deepEqual(b.reg.alertas, ['Microfone indisponível']);
    assert.equal(b.reg.records, 0);
    await b.tocar();
    assert.equal(b.reg.prepares, 2, 'rejeição não deixa o botão preso');
  });

  if (falhas.length) {
    console.error('\n' + falhas.length + ' falha(s), ' + aprovadas + ' aprovada(s)\n');
    process.exit(1);
  }
  console.log('\n' + aprovadas + '/' + aprovadas + ' checagens da abertura abandonada passaram — 0 falhas\n');
  process.exitCode = 0;
})().catch((e) => { console.error('\nFALHOU: ' + (e && e.stack || e)); process.exit(1); });
