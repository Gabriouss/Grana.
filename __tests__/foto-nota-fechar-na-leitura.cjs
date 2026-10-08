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
  useEffect(efeito) { efeito(); },
  useRef(inicial) {
    const k = cursor++;
    if (!(k in celulas)) celulas[k] = { current: inicial };
    return celulas[k];
  },
};

/* ── dublês ────────────────────────────────────────────────────────────── */
const registro = { alertas: [], apagadas: [], fechou: 0, leituras: [], erros: [], gravados: [] };
let cartoesDaConta = [];
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
  '@/lib/alerta': { Alert: { alert: (...a) => registro.alertas.push(a) } },
  'expo-camera': { CameraView: 'CameraView', useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })] },
  '@expo/vector-icons/Ionicons': 'Ionicons',
  '@/lib/theme': { theme: {}, radius: {}, spacing: {}, type: {}, fonts: {}, touchTarget: 48, hitSlopPara: () => 0, lh: () => 0 },
  /* Este teste é sobre fechar durante a leitura, não sobre categoria: a
     categoria obrigatória tem teste próprio (categoria-obrigatoria.cjs). */
  '@/lib/heuristics': {
    guessCategoryFromText: (t) => ({ name: t, color: '#fff' }),
    categoriaReconhecida: (t) => ({ name: t, color: '#fff' }),
    categoriaEscolhida: (t) => (t ? { name: t, color: '#fff' } : null),
    PERGUNTA_CATEGORIA: { titulo: 'Qual categoria?', texto: 'Escolha a categoria antes de salvar.' },
  },
  '@/lib/format': { formatMoney: (v) => String(v).replace('.', ','), parseAmount: (v) => Number(String(v).replace(',', '.')), formatMoneyInput: (v) => v, todayISO: () => '2026-09-26', formatDateLabel: (d) => d },
  '@/lib/offline-cache': { salvarOuGuardarNoAparelho: async (input) => { registro.gravados.push(input); return { guardado: false }; } },
  '@/lib/data': { fetchCreditCards: async () => cartoesDaConta },
  './DatePickerModal': 'DatePickerModal',
  '@/lib/lancamentos-alterados': { marcarLancamentosAlterados() {} },
  '@/lib/erros': { mensagemErro: (e) => String(e) },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
  '@/lib/wallet-context': { useWallet: () => ({ activeWalletId: 'w', wallets: [{ id: 'w', is_default: true }] }) },
  '@/lib/haptics': { hapticSuccess() {}, hapticTap() {} },
  '@/lib/limits': { LIMITS: { descricao: 80 } },
  './CategoryChips': 'CategoryChips',
  './AppPressable': 'AppPressable',
  './AppModal': { __esModule: true, default: 'AppModal', InsetsDoModal: ({ children }) => children({ top: 0, bottom: 0, left: 0, right: 0 }) },
  './Sheet': 'Sheet',
  './PermissaoCamera': 'PermissaoCamera',
  '@/lib/modal-accessibility': { useModalAccessibility() {} },
  '@/lib/motion': { useReducedMotion: () => true },
};
const discoSimulado = {
  deleteAsync: async (uri) => { registro.apagadas.push(uri); if (!teimosas.has(uri)) noCache.delete(uri); },
  getInfoAsync: async (uri) => ({ exists: noCache.has(uri) }),
  readDirectoryAsync: async () => [],
  cacheDirectory: 'file:///cache/',
};
/* lib/foto-nota-ocr.ts REAL (prazo total, exclusão da foto), com o ML Kit e o
   disco simulados. A leitura é uma promessa controlada pelo teste. */
const compilarTs = (arq, jsx) => ts.transpileModule(fs.readFileSync(arq, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;
const parser = {};
vm.runInNewContext(compilarTs('lib/nota-foto-parser.ts'), { exports: parser, Number, Set, RegExp, String, Math });
const ocr = {};
vm.runInNewContext(compilarTs('lib/foto-nota-ocr.ts'), {
  exports: ocr, Promise, String, Error, setTimeout, clearTimeout,
  console: { ...console, warn() {}, error: (...a) => registro.erros.push(a) },
  require: (n) => ({
    './nota-foto-parser': parser,
    'expo-file-system/legacy': discoSimulado,
    '@react-native-ml-kit/text-recognition': { __esModule: true, default: { recognize: (uri) => {
      registro.leituras.push(uri);
      return new Promise((r, j) => { resolverLeitura = (v) => Promise.resolve(v).then(r, j); });
    } } },
  })[n],
});
imports['@/lib/foto-nota-ocr'] = ocr;
imports['@/lib/nota-foto-parser'] = parser;
/* A decisão de gravar (crédito na fatura, débito no caixa) é o módulo REAL. */
const lancamento = {};
vm.runInNewContext(compilarTs('lib/foto-nota-lancamento.ts'), { exports: lancamento });
imports['@/lib/foto-nota-lancamento'] = lancamento;
const cupom = (texto) => ({ blocks: [{ lines: texto.split(/\n/).map((t) => ({ text: t })) }] });

/* A linha "Data da compra" é o componente REAL compartilhado com o Colar
   (30/09/2026): a foto precisa continuar igual depois da extração. */
const linhaData = {};
vm.runInNewContext(compilarTs('components/LinhaDataDaCompra.tsx', true), {
  exports: linhaData, require: (n) => { assert.ok(n in imports, `import não simulado: ${n}`); return imports[n]; },
});
imports['./LinhaDataDaCompra'] = linhaData;
imports['./TransactionSheet'] = require('./sheet-real.cjs')(imports);

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
  imports['./TransactionSheet'].reset();
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
  resolverLeitura(cupom('VALOR TOTAL R$ 42,50'));
  await tirando;
  const confirmacao = render();
  ok(naConfirmacao(confirmacao), 'sem fechar, a leitura leva à confirmação');
  ok(achar(confirmacao, (n) => n.type === 'TextInput' && n.props.value === '42,5').length === 1, 'com o valor lido');
  /* Achado do Watchtower (26/09/2026): a tela promete que a foto é apagada
     logo depois da leitura. A exclusão começa assim que a leitura termina e é
     conferida; ela não segura a confirmação (N2, 26/09 à tarde: esperar por
     ela deixou a tela em "Lendo a nota..." além do prazo). */
  await esperar();
  ok(registro.apagadas.includes('file://foto-0.jpg') && !noCache.has('file://foto-0.jpg'), 'a foto sai do cache logo depois da leitura');
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
  resolverLeitura(cupom('VALOR TOTAL R$ 99,90'));
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
  resolverLeitura(cupom('VALOR TOTAL R$ 10,00'));
  await tirando4;
  ok(naConfirmacao(render()), 'a confirmação aparece mesmo assim');
  ok(registro.erros.some((a) => /continuou no cache/.test(String(a[0]))), 'e a foto que ficou no cache deixa log de erro');

  /* 5. Forma de pagamento lida da foto (pedido do autor, 26/09/2026). Crédito
     grava na fatura, com o cartão; débito é saída de caixa na carteira. */
  const NOTA = (forma) => cupom([
    'MERCADO AUDIT FICTICIO LTDA', 'CNPJ 00.000.000/0000-00', 'VALOR TOTAL R$ 37,80',
    'FORMA DE PAGAMENTO VALOR PAGO', `${forma} 37,80`, 'Emissão: 25/09/2026 14:32',
  ].join('\n'));
  async function fotografarNota(forma) {
    imports['./TransactionSheet'].reset();
    porHandler(render(), 'fechar')();
    prepararCamera();
    const t = porHandler(render(), 'fotografar')();
    await esperar();
    resolverLeitura(NOTA(forma));
    await t;
    await esperar();
    await esperar();
    return render();
  }
  const salvar = async () => { await porHandler(render(), 'salvar')(); await esperar(); };

  cartoesDaConta = [{ id: 'cartao-1', name: 'AUDIT cartao', bank: 'nubank', wallet_id: 'w-cartao' }];
  registro.gravados.length = 0;
  let tela = await fotografarNota('Cartao de Credito');
  ok(achar(tela, (n) => n.type === 'TextInput' && n.props.value === 'Mercado AUDIT Ficticio').length === 1, 'a descrição vem do estabelecimento');
  ok(achar(tela, (n) => n.props?.accessibilityRole === 'radio' && n.props.accessibilityState?.checked).length === 2, 'crédito e o único cartão já marcados');
  await salvar();
  ok(registro.gravados.length === 1, 'crédito com um cartão grava');
  const credito = registro.gravados[0];
  ok(credito.payment_method === 'credit' && credito.card_id === 'cartao-1' && credito.bank === 'nubank', 'como compra no crédito, com o cartão');
  ok(credito.wallet_id === 'w-cartao' && credito.occurred_on === '2026-09-25' && credito.type === 'out', 'na carteira do cartão e na data do cupom');

  registro.gravados.length = 0;
  await fotografarNota('Cartao de Debito');
  await salvar();
  const debito = registro.gravados[0];
  ok(debito && debito.payment_method === 'debit' && !debito.card_id && debito.wallet_id === 'w', 'débito é saída de caixa na carteira, sem cartão');

  /* Crédito com dois cartões: nenhum escolhido, nada grava até a pessoa escolher. */
  cartoesDaConta = [{ id: 'c1', name: 'A', bank: 'x' }, { id: 'c2', name: 'B', bank: 'y' }];
  registro.gravados.length = 0;
  registro.alertas.length = 0;
  await fotografarNota('Cartao de Credito');
  await salvar();
  ok(registro.gravados.length === 0 && /cartão/i.test(String(registro.alertas.at(-1)?.[0])), 'com vários cartões, pede o cartão antes de gravar');

  /* Crédito sem cartão cadastrado: avisa e não grava. */
  cartoesDaConta = [];
  registro.alertas.length = 0;
  await fotografarNota('Cartao de Credito');
  await salvar();
  ok(registro.gravados.length === 0 && registro.alertas.at(-1)?.[0] === 'Nenhum cartão cadastrado', 'sem cartão, avisa e oferece outra forma');

  /* Foto escura ou sem texto: recibo claro e o campo de valor para digitar. */
  porHandler(render(), 'fechar')();
  prepararCamera();
  const escura = porHandler(render(), 'fotografar')();
  await esperar();
  resolverLeitura({ blocks: [] });
  await escura;
  tela = render();
  ok(naConfirmacao(tela) && achar(tela, (n) => n.type === 'Text' && /Não encontrei texto na foto/.test(String(n.props.children))).length === 1,
    'foto sem texto: aviso de foto escura ou tremida, e a confirmação para digitar');

  /* "Outros": nada marcado, a pessoa escolhe. */
  registro.alertas.length = 0;
  await fotografarNota('Outros');
  await salvar();
  ok(registro.gravados.length === 0 && registro.alertas.at(-1)?.[0] === 'Forma de pagamento', 'sem forma lida, pede a forma antes de gravar');

  /* 6. A linha "Data da compra" depois da extração para o componente
     compartilhado (30/09/2026): selo, dica, seletor sem futuro e a data
     escolhida gravada. Hoje dos dublês: 26/09/2026. */
  const rotuloData = (arvore) => achar(arvore, (n) => /^Data do lançamento:/.test(String(n.props?.accessibilityLabel)))[0]?.props.accessibilityLabel;
  const seletor = (arvore) => achar(arvore, (n) => n.type === 'DatePickerModal')[0];
  cartoesDaConta = [];
  tela = await fotografarNota('Cartao de Debito');
  ok(rotuloData(tela) === 'Data do lançamento: 2026-09-25, lida da foto', 'data do cupom com o selo "lida da foto"');
  ok(!achar(tela, (n) => n.type === 'Text' && /não parecia certa/.test(String(n.props.children))).length, 'sem dica quando a data foi aceita');
  {
    /* Selo cortado a 1.3 (achado do P2, 30/09/2026): a linha quebra no fluxo,
       e nenhum texto dela encolhe ou cresce (424dd7a). O estilo é provado
       aqui; a geometria do Yoga em tela fica no P2, a 1.0 e 1.3. */
    const linha = achar(tela, (n) => /^Data do lançamento:/.test(String(n.props?.accessibilityLabel)))[0];
    const estilo = linha.props.style;
    ok(estilo.flexWrap === 'wrap' && 'rowGap' in estilo && estilo.flexDirection === 'row', 'foto: a linha "Data da compra" quebra quando não cabe (flexWrap + rowGap)');
    const textos = achar(linha, (n) => n.type === 'Text');
    ok(textos.length >= 2 && textos.every((t) => !('flexShrink' in (t.props.style ?? {})) && !('flexGrow' in (t.props.style ?? {}))), 'foto: nenhum texto da linha usa flexShrink ou flexGrow');
  }
  achar(tela, (n) => /^Data do lançamento:/.test(String(n.props?.accessibilityLabel)))[0].props.onPress();
  ok(seletor(render()).props.visible === true && seletor(render()).props.currentISO === '2026-09-25', 'o toque abre o seletor na data lida');
  seletor(render()).props.onSelectDate('2026-10-03');
  seletor(render()).props.onClose();
  ok(rotuloData(render()) === 'Data do lançamento: 2026-09-26', 'data futura no seletor vira hoje, sem o selo');
  ok(seletor(render()).props.visible === false, 'e o seletor fecha');
  seletor(render()).props.onSelectDate('2026-09-20');
  registro.gravados.length = 0;
  await salvar();
  ok(registro.gravados[0]?.occurred_on === '2026-09-20', 'grava a data escolhida');

  porHandler(render(), 'fechar')();
  prepararCamera();
  const futura = porHandler(render(), 'fotografar')();
  await esperar();
  resolverLeitura(cupom(['MERCADO', 'VALOR TOTAL R$ 30,00', 'DEBITO 30,00', '01/10/2026'].join('\n')));
  await futura;
  await esperar();
  tela = render();
  ok(rotuloData(tela) === 'Data do lançamento: 2026-09-26', 'data do cupom recusada: hoje, sem selo');
  ok(achar(tela, (n) => n.type === 'Text' && /A data do cupom não parecia certa/.test(String(n.props.children))).length === 1, 'com a dica de antes');

  console.log(`foto-nota-fechar-na-leitura: ${passou} checagens OK`);
})().catch((e) => { console.error(e); process.exit(1); });
