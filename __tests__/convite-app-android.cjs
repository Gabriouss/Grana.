/*
 * Convite para baixar o APK só no navegador de um Android (achado do Flare,
 * 30/09/2026, confirmado pelo maestro).
 *
 *   node __tests__/convite-app-android.cjs
 *
 * `components/ConviteAppAndroid.tsx` testava só `Platform.OS === 'web'`, e o
 * convite aparecia também no Safari do iPhone, onde não há aplicativo.
 *
 * Módulos REAIS: `lib/plataforma-web.ts` e o próprio componente, executado no
 * sandbox `vm` com React reduzido a `useState`/`useEffect` síncronos. Afirma
 * QUAIS chamadas aconteceram (regra 9): se o armazenamento foi consultado e se
 * o convite foi aberto, para cada userAgent.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };

function transpilar(arquivo) {
  return ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
}
function executar(arquivo, contexto) {
  const exports = {};
  vm.runInNewContext(transpilar(arquivo), { exports, module: { exports }, ...contexto }, { filename: arquivo });
  return exports;
}

const plataforma = executar('lib/plataforma-web.ts', {});

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadAntigo: 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  /* iPadOS 13+ por padrão pede o site de computador e se apresenta como Mac. */
  ipadComoMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

/* ── 1. Classificação ─────────────────────────────────────────────────── */
const CASOS = [
  ['iPhone Safari', UA.iphoneSafari, 5, 'ios'],
  ['iPhone Chrome', UA.iphoneChrome, 5, 'ios'],
  ['iPad antigo', UA.ipadAntigo, 5, 'ios'],
  ['iPadOS que se apresenta como Mac', UA.ipadComoMac, 5, 'ios'],
  ['Mac de verdade', UA.ipadComoMac, 0, 'computador'],
  ['Android Chrome', UA.androidChrome, 5, 'android'],
  ['Android Samsung Internet', UA.androidSamsung, 5, 'android'],
  ['tablet Android', UA.androidTablet, 10, 'android'],
  ['Windows', UA.windowsChrome, 0, 'computador'],
  ['Windows com tela de toque', UA.windowsChrome, 10, 'computador'],
  ['Linux', UA.linuxFirefox, 0, 'computador'],
  ['sem userAgent', '', 0, 'computador'],
];
for (const [nome, ua, toque, esperado] of CASOS) {
  assert.equal(plataforma.plataformaDoNavegador(ua, toque), esperado, nome);
}
ok('classifica iPhone, iPad (inclusive o que se apresenta como Mac), Android e computador');

assert.equal(plataforma.deveConvidarParaAppAndroid('android'), true);
assert.equal(plataforma.deveConvidarParaAppAndroid('ios'), false);
assert.equal(plataforma.deveConvidarParaAppAndroid('computador'), false);
ok('só Android é convidado a baixar o APK');

/* ── 2. O componente real ─────────────────────────────────────────────── */
/** Monta o componente com um navegador e devolve o que ele fez. */
async function montarConvite({ ua, toque = 0, os = 'web', url = 'https://granaponto.com.br/baixar', semNavigator = false, jaVisto = false }) {
  const registro = { consultouArmazenamento: 0, abriu: false };
  const componente = executar('components/ConviteAppAndroid.tsx', {
    ...(semNavigator ? {} : { navigator: { userAgent: ua, maxTouchPoints: toque } }),
    require(id) {
      const dubles = {
        react: {
          useState: (inicial) => [inicial, (v) => { if (v === true) registro.abriu = true; }],
          useEffect: (efeito) => { efeito(); },
        },
        'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
        'react-native': {
          Platform: { OS: os },
          StyleSheet: { create: (s) => s },
          Linking: { openURL: async () => {} },
          Pressable: 'Pressable', Text: 'Text', View: 'View',
        },
        '@react-native-async-storage/async-storage': {
          __esModule: true,
          default: { getItem: async () => { registro.consultouArmazenamento++; return jaVisto ? '1' : null; }, setItem: async () => {} },
        },
        '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
        '@/lib/theme': {
          theme: new Proxy({}, { get: () => '#000' }),
          radius: new Proxy({}, { get: () => 8 }),
          spacing: new Proxy({}, { get: () => 8 }),
          fonts: new Proxy({}, { get: () => 'fonte' }),
          type: new Proxy({}, { get: () => 14 }),
          lh: () => 20,
        },
        '@/lib/download-app': { obterUrlDownloadAndroid: () => url },
        '@/lib/plataforma-web': plataforma,
        './AppModal': { __esModule: true, default: 'AppModal' },
        './AppPressable': { __esModule: true, default: 'AppPressable' },
        './AccessibleModalPanel': { __esModule: true, default: 'AccessibleModalPanel' },
      };
      if (id in dubles) return dubles[id];
      throw new Error('import não simulado: ' + id);
    },
  });
  componente.default();
  await new Promise((r) => setTimeout(r, 0));
  return registro;
}

(async () => {
  for (const [nome, ua, toque] of [['iPhone Safari', UA.iphoneSafari, 5], ['iPhone Chrome', UA.iphoneChrome, 5], ['iPad antigo', UA.ipadAntigo, 5], ['iPadOS como Mac', UA.ipadComoMac, 5]]) {
    const r = await montarConvite({ ua, toque });
    assert.equal(r.abriu, false, `${nome}: sem convite`);
    assert.equal(r.consultouArmazenamento, 0, `${nome}: nem consulta se já viu`);
  }
  ok('iPhone e iPad (inclusive como Mac): o convite não aparece');

  for (const [nome, ua, toque] of [['Mac', UA.ipadComoMac, 0], ['Windows', UA.windowsChrome, 0], ['Linux', UA.linuxFirefox, 0]]) {
    const r = await montarConvite({ ua, toque });
    assert.equal(r.abriu, false, `${nome}: sem convite`);
    assert.equal(r.consultouArmazenamento, 0, `${nome}: nem consulta se já viu`);
  }
  ok('computador: o convite não aparece');

  for (const [nome, ua, toque] of [['Android Chrome', UA.androidChrome, 5], ['Android Samsung', UA.androidSamsung, 5], ['tablet Android', UA.androidTablet, 10]]) {
    const r = await montarConvite({ ua, toque });
    assert.equal(r.consultouArmazenamento, 1, `${nome}: consulta se já viu`);
    assert.equal(r.abriu, true, `${nome}: o convite aparece`);
    /* Dispensa já salva neste navegador (a chave que `dispensar` grava). */
    const visto = await montarConvite({ ua, toque, jaVisto: true });
    assert.equal(visto.consultouArmazenamento, 1, `${nome}: consulta a dispensa`);
    assert.equal(visto.abriu, false, `${nome}: com dispensa salva, não aparece de novo`);
  }
  ok('navegador Android: aparece sem dispensa salva, e não aparece com ela');

  /* As travas que já existiam continuam valendo. */
  assert.deepEqual({ ...(await montarConvite({ ua: UA.androidChrome, os: 'android' })) }, { consultouArmazenamento: 0, abriu: false }, 'app instalado');
  assert.deepEqual({ ...(await montarConvite({ ua: UA.androidChrome, url: null })) }, { consultouArmazenamento: 0, abriu: false }, 'sem endereço de download');
  assert.deepEqual({ ...(await montarConvite({ semNavigator: true })) }, { consultouArmazenamento: 0, abriu: false }, 'sem navigator');
  ok('app instalado, sem endereço de download ou sem navigator: nada muda');

  console.log(`\n${checagens} checagens do convite do app Android passaram — 0 falhas`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
