// Paridade da CAPTURA de voz entre o botão do app e o widget (regra 13;
// autor, 25/09/2026: "os dois precisam se comportar exatamente iguais. Em
// tudo").
//
// O widget grava no Kotlin, que não roda aqui. Então o teste faz duas coisas:
//   1. confere que os números de lib/voz-captura.ts são os do
//      GranaVoiceCaptureService.kt, e que a regra do detector é a mesma;
//   2. executa o VoiceEntryButton REAL (transpilado, com dublês nos imports e
//      um relógio falso) e confere o que ele faz: encerra no silêncio depois
//      de ouvir fala, descarta o toque duplo sem aviso nem transcrição, e
//      entrega ao núcleo sem prazo próprio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let aprovadas = 0;
function ok(nome) { aprovadas++; console.log('  ok  ' + nome); }

function transpilar(arquivo) {
  return ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
}

function carregar(arquivo, dependencias = {}, globais = {}) {
  const modulo = { exports: {} };
  vm.runInNewContext(transpilar(arquivo), {
    exports: modulo.exports, module: modulo, console, Math, Number, Promise, Error,
    require(id) {
      if (id in dependencias) return dependencias[id];
      throw new Error('Import não simulado: ' + id);
    },
    ...globais,
  }, { filename: arquivo });
  return modulo.exports;
}

const captura = carregar('lib/voz-captura.ts');

// ── 1. Números e regra iguais aos do Kotlin ────────────────────────────────
console.log('\nCaptura: mesmos números do widget');
{
  const kt = fs.readFileSync(path.join(root,
    'modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget/GranaVoiceCaptureService.kt'), 'utf8');
  const constante = (nome) => {
    const m = kt.match(new RegExp('const val ' + nome + ' = ([\\d_]+)L?'));
    assert.ok(m, 'constante ' + nome + ' não encontrada no Kotlin');
    return Number(m[1].replace(/_/g, ''));
  };
  assert.equal(captura.INTERVALO_AMOSTRA_MS, constante('INTERVALO_AMOSTRA_MS'));
  assert.equal(captura.SILENCIO_PARA_CORTAR_MS, constante('SILENCIO_PARA_CORTAR_MS'));
  assert.equal(captura.LIMIAR_FALA, constante('LIMIAR_FALA'));
  const vozTs = fs.readFileSync(path.join(root, 'lib/voz.ts'), 'utf8');
  const maxSeg = Number(vozTs.match(/export const MAX_SEGUNDOS_GRAVACAO = (\d+);/)[1]);
  assert.equal(maxSeg * 1000, constante('LIMITE_MS'), 'teto de gravação');
  const regua = kt.match(/destino\.length\(\) > (\d+)/);
  assert.ok(regua, 'régua de tamanho não encontrada no Kotlin');
  assert.equal(captura.TAMANHO_MINIMO_AUDIO_BYTES, Number(regua[1]));
  ok('intervalo, silêncio, limiar, teto e tamanho mínimo iguais aos do Kotlin');

  // A mesma regra do `amostrador`: fala zera o silêncio; silêncio só conta
  // depois de ter ouvido fala; a primeira amostra calada só marca o início.
  const amostrador = kt.slice(kt.indexOf('private val amostrador'), kt.indexOf('override fun onBind'));
  for (const trecho of [
    'if (amplitude >= LIMIAR_FALA) {',
    'ouviuFala = true',
    'silencioDesde = 0L',
    '} else if (ouviuFala) {',
    'if (silencioDesde == 0L) silencioDesde = agora',
    'else if (agora - silencioDesde >= SILENCIO_PARA_CORTAR_MS) {',
  ]) assert.ok(amostrador.includes(trecho), 'a regra do Kotlin mudou: ' + trecho);
  ok('o detector do Kotlin tem a forma que lib/voz-captura.ts copia');
}

console.log('\nCaptura: o detector');
{
  const d = captura.criarDetectorDeSilencio();
  let t = 0;
  for (let i = 0; i < 50; i++) assert.equal(d.amostrar(100, t += 200), false, 'silêncio antes de falar não corta');
  ok('silêncio inicial nunca corta (quem demora a começar)');

  const e = captura.criarDetectorDeSilencio();
  t = 0;
  e.amostrar(5000, t += 200);
  const cortes = [];
  for (let i = 0; i < 12; i++) cortes.push(e.amostrar(100, t += 200));
  // 1ª amostra calada marca o início; o corte vem quando passam 1600ms dela.
  assert.equal(cortes.indexOf(true), 8, 'corta na amostra em que o silêncio chega a 1600ms');
  ok('fala seguida de 1,6s de silêncio encerra');

  const f = captura.criarDetectorDeSilencio();
  t = 0;
  f.amostrar(5000, t += 200);
  for (let i = 0; i < 6; i++) f.amostrar(100, t += 200);
  f.amostrar(800, t += 200); // volta a falar: o silêncio recomeça do zero
  const depois = [];
  for (let i = 0; i < 9; i++) depois.push(f.amostrar(100, t += 200));
  assert.equal(depois.indexOf(true), 8);
  ok('uma pausa curta no meio da frase não corta');

  assert.equal(captura.amplitudeDoMetering(undefined), null);
  assert.equal(captura.amplitudeDoMetering(-160), 0);
  // Conta inversa exata do expo-audio no Android: 20 * log10(a / 32767).
  for (const a of [1, 599, 600, 601, 1800, 32767]) {
    assert.equal(captura.amplitudeDoMetering(20 * Math.log10(a / 32767)), a);
  }
  assert.equal(captura.gravacaoValida(1024), false);
  assert.equal(captura.gravacaoValida(1025), true);
  assert.equal(captura.gravacaoValida(null), false);
  ok('metering do expo-audio volta para a escala do widget, sem erro de arredondamento');
}

// ── 2. O botão real ────────────────────────────────────────────────────────
function montarBotao({ tamanho = 50_000, stop = async () => {}, metering = () => -160 } = {}) {
  const reg = { tarefas: [], alertas: [], apagados: [], gravando: false };
  let relogio = 1_000_000;
  const timers = [];
  let proximoId = 1;
  const agendar = (fn, ms, repete) => { const id = proximoId++; timers.push({ id, fn, ms, repete, vivo: true }); return id; };
  const cancelar = (id) => { const t = timers.find((x) => x.id === id); if (t) t.vivo = false; };

  // Runtime mínimo de hooks: estado por posição, re-render a cada ação.
  const hooks = [];
  let posicao = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
    Fragment: 'Fragment',
  };
  const reactMod = {
    ...React,
    default: React,
    useState(inicial) {
      const i = posicao++;
      if (!(i in hooks)) hooks[i] = inicial;
      return [hooks[i], (v) => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; }];
    },
    useRef(inicial) { const i = posicao++; if (!(i in hooks)) hooks[i] = { current: inicial }; return hooks[i]; },
    useEffect() {},
  };
  const AppPressable = function AppPressable() {};
  const gravador = {
    uri: 'file:///cache/voz.m4a',
    prepareToRecordAsync: async () => {},
    record: () => { reg.gravando = true; },
    stop: () => { reg.gravando = false; return stop(); },
    getStatus: () => ({ metering: metering(relogio) }),
  };
  const deps = {
    react: reactMod,
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Text: 'Text', Platform: { OS: 'android' },
      StyleSheet: { create: (x) => x },
    },
    '@/lib/alert': { Alert: { alert: (titulo, texto) => reg.alertas.push(titulo) } },
    '@expo/vector-icons/Ionicons': 'Ionicons',
    'expo-audio': {
      AudioQuality: { MEDIUM: 0 }, IOSOutputFormat: { MPEG4AAC: 0 },
      getRecordingPermissionsAsync: async () => ({ status: 'granted' }),
      requestRecordingPermissionsAsync: async () => ({ granted: true }),
      setAudioModeAsync: async () => {},
      useAudioRecorder: (opcoes) => { reg.opcoes = opcoes; return gravador; },
    },
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, fonts: {}, type: {} },
    '@/lib/haptics': { hapticSuccess: () => {} },
    '@/lib/voz': { MAX_SEGUNDOS_GRAVACAO: 20, mensagemDeErroVoz: (c) => ({ titulo: 'erro:' + c, texto: '' }) },
    '@/lib/voz-captura': captura,
    './AppPressable': { __esModule: true, default: AppPressable },
    './AppDialog': { __esModule: true, default: function AppDialog() {} },
    'expo-crypto': { randomUUID: () => 'req-1' },
    '@/lib/widget-voz-task': { executarTarefa: async (payload) => { reg.tarefas.push(payload); } },
    'expo-file-system': { File: class { constructor(uri) { this.uri = uri; } get exists() { return true; } get size() { return tamanho; } } },
    'expo-file-system/legacy': { deleteAsync: async (uri) => { reg.apagados.push(uri); } },
  };
  const { default: VoiceEntryButton } = carregar('components/VoiceEntryButton.tsx', deps, {
    setTimeout: (fn, ms) => agendar(fn, ms, false),
    clearTimeout: cancelar,
    setInterval: (fn, ms) => agendar(fn, ms, true),
    clearInterval: cancelar,
    Date: { now: () => relogio },
    __DEV__: false,
    React,
  });

  function render() {
    posicao = 0;
    const arvore = VoiceEntryButton({ onTranscribed: () => {}, label: 'Voz' });
    const achar = (no) => {
      if (!no || typeof no !== 'object') return null;
      if (no.type === AppPressable) return no;
      for (const filho of [].concat(no.props?.children ?? [])) { const r = achar(filho); if (r) return r; }
      return null;
    };
    return achar(arvore).props;
  }
  const esperar = () => new Promise((r) => setImmediate(r));
  async function tocar() { await render().onPress(); await esperar(); await esperar(); }
  /** Toca sem esperar o fim: para o caso em que o `stop()` nunca resolve. */
  async function tocarSemEsperar() { void render().onPress(); await esperar(); await esperar(); }
  /** Avança o relógio amostra por amostra, rodando os timers vencidos. */
  async function passar(ms) {
    const fim = relogio + ms;
    while (relogio < fim) {
      relogio += captura.INTERVALO_AMOSTRA_MS;
      for (const t of timers.filter((x) => x.vivo && x.repete)) t.fn();
      await esperar(); await esperar();
    }
  }
  async function dispararTimeout(ms) {
    for (const t of timers.filter((x) => x.vivo && !x.repete && x.ms === ms)) { t.vivo = false; t.fn(); }
    await esperar(); await esperar(); await esperar();
  }
  const amostradoresVivos = () => timers.filter((x) => x.vivo && x.repete).length;
  return { reg, tocar, tocarSemEsperar, passar, dispararTimeout, amostradoresVivos, relogio: () => relogio };
}

// Um `await` que nunca resolve faz o Node sair calado, com código 0, sem rodar
// o resto. Só o fim do roteiro zera este código.
process.exitCode = 1;

(async () => {
  console.log('\nCaptura: o botão do app, executado de verdade');

  {
    const b = montarBotao();
    await b.tocar();
    assert.equal(b.reg.opcoes.isMeteringEnabled, true, 'o botão precisa ler o volume');
    assert.equal(b.reg.gravando, true);
    await b.passar(10_000);
    assert.equal(b.reg.gravando, true, 'silêncio sem fala nenhuma não encerra');
    assert.equal(b.reg.tarefas.length, 0);
    ok('silêncio antes de falar não encerra a gravação');
  }

  {
    let inicio;
    const b = montarBotao({ metering: (agora) => (agora - inicio < 1_000 ? -10 : -160) });
    await b.tocar();
    inicio = b.relogio();
    await b.passar(4_000);
    assert.equal(b.reg.gravando, false, 'fala seguida de silêncio encerra sozinha');
    assert.equal(b.reg.tarefas.length, 1, 'a fala vai para o núcleo');
    assert.equal(b.amostradoresVivos(), 0, 'o amostrador para junto com a gravação');
    ok('fala seguida de 1,6s de silêncio encerra e envia, como o widget');

    const payload = b.reg.tarefas[0];
    assert.deepEqual(Object.keys(payload).sort(), ['caminho', 'requestId', 'source']);
    assert.equal(payload.source, 'app');
    ok('o botão entrega ao núcleo sem prazo próprio');
  }

  {
    const b = montarBotao({ tamanho: 800 });
    await b.tocar();
    await b.tocar();
    assert.equal(b.reg.tarefas.length, 0, 'toque duplo não gasta transcrição');
    assert.deepEqual(b.reg.alertas, [], 'toque duplo volta ao repouso sem aviso');
    assert.deepEqual(b.reg.apagados, ['file:///cache/voz.m4a'], 'o arquivo curto é apagado');
    ok('gravação de até 1 KB é descartada sem aviso, como o widget');
  }

  {
    const b = montarBotao({ stop: async () => { throw new Error('stop failed'); } });
    await b.tocar();
    await b.tocar();
    assert.equal(b.reg.tarefas.length, 0);
    assert.deepEqual(b.reg.alertas, [], '`stop()` que lança é toque curto, não erro');
    assert.deepEqual(b.reg.apagados, ['file:///cache/voz.m4a']);
    ok('`stop()` que lança volta ao repouso sem aviso, como o widget');
  }

  {
    const b = montarBotao({ stop: () => new Promise(() => {}) });
    await b.tocar();
    await b.tocarSemEsperar();
    await b.dispararTimeout(5_000);
    assert.deepEqual(b.reg.alertas, ['Não consegui encerrar a gravação'], '`stop()` preso continua avisando (A47)');
    assert.equal(b.reg.tarefas.length, 0);
    ok('`stop()` que trava continua com aviso próprio');
  }

  {
    const b = montarBotao({ tamanho: 50_000 });
    await b.tocar();
    await b.tocar();
    assert.equal(b.reg.tarefas.length, 1, 'gravação normal segue para o núcleo');
    assert.deepEqual(b.reg.apagados, [], 'quem apaga a gravação boa é o núcleo, depois de usar');
    ok('gravação normal segue para o núcleo');
  }

  console.log('\n' + aprovadas + '/' + aprovadas + ' checagens da captura de voz passaram — 0 falhas\n');
  process.exitCode = 0;
})().catch((erro) => {
  console.error('\nFALHOU: ' + (erro && erro.stack || erro) + '\n');
  process.exit(1);
});
