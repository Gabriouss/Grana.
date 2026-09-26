/* Foto da nota: fechar a janela durante a leitura não pode contaminar a próxima
 * abertura (achado F3 do Watchtower, 26/09/2026).
 *
 *   node __tests__/foto-nota-fechar-na-leitura.cjs
 *
 * Executa o components/FotoNotaModal.tsx REAL com um mini-runtime de hooks
 * (useState/useRef guardados por posição, como o React faz) e dublês para o
 * resto. A leitura do ML Kit é uma promessa controlada pelo teste, para fechar
 * a janela com ela ainda pendente. Antes da correção, a leitura que terminava
 * depois punha 'confirmar' e o valor no estado, e a janela reaberta já nascia
 * na confirmação com a nota anterior. */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };

/* ── mini-runtime de hooks ─────────────────────────────────────────────── */
const celulas = [];
let cursor = 0;
const react = {
  useState(inicial) {
    const k = cursor++;
    if (!(k in celulas)) celulas[k] = typeof inicial === 'function' ? inicial() : inicial;
    return [celulas[k], (v) => { celulas[k] = typeof v === 'function' ? v(celulas[k]) : v; }];
  },
  useRef(inicial) {
    const k = cursor++;
    if (!(k in celulas)) celulas[k] = { current: inicial };
    return celulas[k];
  },
};

/* ── dublês ────────────────────────────────────────────────────────────── */
const registro = { alertas: [], apagadas: [], fechou: 0, leituras: [], erros: [] };
/* Cache simulado: a foto existe até ser apagada. `teimosa` é um arquivo que
   o sistema não deixa apagar, para provar que isso deixa log. */
const noCache = new Set();
const teimosas = new Set();
let resolverLeitura = null;
const imports = {
  react,
  'react/jsx-runtime': {
    jsx: (type, props) => (typeof type === 'function' ? type(props) : { type, props }),
    jsxs: (type, props) => (typeof type === 'function' ? type(props) : { type, props }),
  },
  'react-native': { ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View' },
  '@/lib/alert': { Alert: { alert: (...a) => registro.alertas.push(a) } },
  'expo-camera': { CameraView: 'CameraView', useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })] },
  '@expo/vector-icons/Ionicons': 'Ionicons',
  '@/lib/theme': { theme: {}, radius: {}, spacing: {}, type: {}, fonts: {}, touchTarget: 48, lh: () => 0 },
  '@/lib/heuristics': { guessCategoryFromText: (t) => ({ name: t, color: '#fff' }) },
  '@/lib/format': { formatMoney: (v) => String(v).replace('.', ','), parseAmount: Number, formatMoneyInput: (v) => v, todayISO: () => '2026-09-26' },
  '@/lib/foto-nota-ocr': { lerTotalDaFoto: (uri) => { registro.leituras.push(uri); return new Promise((r) => { resolverLeitura = r; }); } },
  '@/lib/offline-cache': { salvarOuGuardarNoAparelho: async () => ({ guardado: false }) },
  '@/lib/lancamentos-alterados': { marcarLancamentosAlterados() {} },
  '@/lib/erros': { mensagemErro: (e) => String(e) },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
  '@/lib/wallet-context': { useWallet: () => ({ activeWalletId: 'w', wallets: [] }) },
  '@/lib/haptics': { hapticSuccess() {}, hapticTap() {} },
  '@/lib/limits': { LIMITS: { descricao: 80 } },
  './CategoryChips': 'CategoryChips',
  './AppPressable': 'AppPressable',
  './AppModal': { __esModule: true, default: 'AppModal', InsetsDoModal: ({ children }) => children({ top: 0, bottom: 0, left: 0, right: 0 }) },
  './Sheet': 'Sheet',
  './PermissaoCamera': 'PermissaoCamera',
  '@/lib/modal-accessibility': { useModalAccessibility() {} },
  '@/lib/motion': { useReducedMotion: () => true },
  'expo-file-system/legacy': {
    deleteAsync: async (uri) => { registro.apagadas.push(uri); if (!teimosas.has(uri)) noCache.delete(uri); },
    getInfoAsync: async (uri) => ({ exists: noCache.has(uri) }),
  },
};

const modulo = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('components/FotoNotaModal.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText,
  { exports: modulo, console: { ...console, error: (...a) => registro.erros.push(a) }, Promise, String, Number, Object, Array, JSON,
    require: (n) => { assert.ok(n in imports, `import não simulado: ${n}`); return imports[n]; } },
);
const FotoNotaModal = modulo.default;

const props = { visible: true, onClose: () => { registro.fechou++; }, onSuccess() {} };
const render = () => { cursor = 0; return FotoNotaModal(props); };
function achar(no, pred, acc = []) {
  if (!no || typeof no !== 'object') return acc;
  if (Array.isArray(no)) { no.forEach((n) => achar(n, pred, acc)); return acc; }
  if (pred(no)) acc.push(no);
  achar(no.props?.children, pred, acc);
  return acc;
}
const porHandler = (arvore, nome) => achar(arvore, (n) => n.props?.onPress?.name === nome)[0]?.props.onPress;
const naConfirmacao = (arvore) => achar(arvore, (n) => n.type === 'TextInput').length > 0;
const esperar = () => new Promise((r) => setImmediate(r));

function prepararCamera() {
  const arvore = render();
  const camera = achar(arvore, (n) => n.type === 'CameraView')[0];
  ok(camera, 'a janela abre na câmera');
  camera.props.ref.current = { takePictureAsync: async () => {
    const uri = `file://foto-${registro.leituras.length}.jpg`;
    noCache.add(uri);
    return { uri };
  } };
  camera.props.onCameraReady();
}

(async () => {
  /* 1. Caminho normal: a leitura termina com a janela aberta → confirmação com o valor. */
  prepararCamera();
  const tirando = porHandler(render(), 'fotografar')();
  await esperar();
  resolverLeitura({ ok: true, total: { valorTotal: 42.5, motivo: 'ok' } });
  await tirando;
  const confirmacao = render();
  ok(naConfirmacao(confirmacao), 'sem fechar, a leitura leva à confirmação');
  ok(achar(confirmacao, (n) => n.type === 'TextInput' && n.props.value === '42,5').length === 1, 'com o valor lido');
  /* Achado do Watchtower (26/09/2026): a tela promete que a foto é apagada
     logo depois da leitura. Com `void apagarFoto`, a confirmação aparecia com
     a foto ainda no cache e uma falha ao apagar sumia calada. */
  ok(registro.apagadas.includes('file://foto-0.jpg') && !noCache.has('file://foto-0.jpg'), 'a foto já saiu do cache quando a confirmação aparece');
  ok(registro.erros.length === 0, 'exclusão normal não deixa erro')

  /* Volta ao estado inicial pelo próprio fechar da confirmação. */
  porHandler(confirmacao, 'fechar')();
  ok(!naConfirmacao(render()), 'fechar a confirmação volta para a câmera');

  /* 2. F3: fechar DURANTE a leitura. */
  registro.alertas.length = 0;
  prepararCamera();
  const tirando2 = porHandler(render(), 'fotografar')();
  await esperar();
  ok(registro.leituras.length === 2, 'a segunda leitura começou');
  porHandler(render(), 'fechar')();
  const fechamentos = registro.fechou;
  resolverLeitura({ ok: true, total: { valorTotal: 99.9, motivo: 'ok' } });
  await tirando2;
  await esperar();
  const reaberta = render();
  ok(!naConfirmacao(reaberta), 'reaberta, a janela nasce na câmera, não na confirmação da nota anterior');
  ok(achar(reaberta, (n) => n.type === 'CameraView').length === 1, 'com a câmera montada');
  ok(registro.fechou === fechamentos, 'a leitura tardia não fecha nem mexe em nada');
  ok(registro.alertas.length === 0, 'e não mostra alerta');
  ok(registro.apagadas.includes('file://foto-1.jpg'), 'a foto da leitura abandonada é apagada mesmo assim');

  /* 3. Leitura que falha depois de fechar: sem Alert de "Não consegui fotografar" na cara de quem já saiu. */
  prepararCamera();
  const tirando3 = porHandler(render(), 'fotografar')();
  await esperar();
  porHandler(render(), 'fechar')();
  resolverLeitura(Promise.reject(new Error('ML Kit caiu')));
  await tirando3;
  ok(registro.alertas.length === 0, 'falha tardia depois de fechar não mostra alerta');
  ok(!naConfirmacao(render()), 'e a janela continua na câmera');

  /* 4. Foto que o sistema não deixa apagar: a confirmação segue, com log de erro. */
  porHandler(render(), 'fechar')();
  registro.erros.length = 0;
  prepararCamera();
  teimosas.add(`file://foto-${registro.leituras.length}.jpg`);
  const tirando4 = porHandler(render(), 'fotografar')();
  await esperar();
  resolverLeitura({ ok: true, total: { valorTotal: 10, motivo: 'ok' } });
  await tirando4;
  ok(naConfirmacao(render()), 'a confirmação aparece mesmo assim');
  ok(registro.erros.some((a) => /continuou no cache/.test(String(a[0]))), 'e a foto que ficou no cache deixa log de erro');

  console.log(`foto-nota-fechar-na-leitura: ${passou} checagens OK`);
})().catch((e) => { console.error(e); process.exit(1); });
