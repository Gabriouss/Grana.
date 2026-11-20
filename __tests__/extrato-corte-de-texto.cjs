/* Item 37 (20/11/2026): o parser de extrato cortava o texto em
   LIMITS.pastedText (200 mil caracteres) em silêncio. Um registro que cruzasse
   o corte entrava partido (um valor -123,45 virava -12) e o resultado dizia
   truncado=false, então a importação aceitava o prefixo como se fosse o
   arquivo inteiro. Executa lib/heuristics.ts, lib/ofx-parser.ts e o
   ImportarExtratoModal REAIS: registro cortado nunca aceito, truncamento
   explícito, alerta antes de salvar e nenhuma escrita.
   BASELINE_DIR=<pasta> carrega os três arquivos de lá (baseline RED). */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const baseDir = process.env.BASELINE_DIR;
const daBaseline = { 'lib/heuristics.ts': 'heuristics.ts', 'lib/ofx-parser.ts': 'ofx-parser.ts', 'components/ImportarExtratoModal.tsx': 'ImportarExtratoModal.tsx' };
const fonte = (file) => fs.readFileSync(baseDir && daBaseline[file] ? path.join(baseDir, daBaseline[file]) : path.join(root, file), 'utf8');

let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };

const cache = new Map();
function real(file) {
  if (cache.has(file)) return cache.get(file);
  const api = {}; cache.set(file, api);
  vm.runInNewContext(ts.transpileModule(fonte(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports: api, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl, TextDecoder, Uint8Array,
    require: (id) => {
      if (id.startsWith('./')) return real(path.posix.join(path.posix.dirname(file), id.slice(2) + '.ts'));
      throw Error(`import não simulado em ${file}: ${id}`);
    },
  }, { filename: file });
  return api;
}
const { LIMITS } = real('lib/limits.ts');
const heuristics = real('lib/heuristics.ts');
const ofx = real('lib/ofx-parser.ts');
const N = LIMITS.pastedText;

/* Monta texto com um registro válido, enchimento até perto do corte, um
   registro cujo valor é cortado exatamente em `parcial` e mais um registro
   inteiro depois do corte. */
function cruzandoOCorte(cabeca, antes, enchimento, cruzaPrefixo, cruzaResto, depois) {
  const inicio = cabeca + antes;
  const falta = N - inicio.length - cruzaPrefixo.length;
  assert.ok(falta > 0, 'fixture cabe no corte');
  const texto = inicio + enchimento.repeat(falta) + cruzaPrefixo + cruzaResto + depois;
  assert.equal(texto.slice(0, N).slice(-cruzaPrefixo.length), cruzaPrefixo, 'o corte cai dentro do registro');
  return texto;
}

// 1. CSV: linha cruzando o corte não entra partida; corte explícito.
const csv = cruzandoOCorte('Data;Descrição;Valor\n', '10/11/2026;Padaria inteira;-8,50\n', '\n',
  '15/11/2026;Mercado cortado;-12', '3,45\n', '16/11/2026;Depois do corte;-9,90\n');
const r = heuristics.parseCsvTextDetalhado(csv);
check(r.rows.some((l) => /Padaria inteira/.test(l.description) && l.amount === 8.5), 'linha inteira antes do corte entra');
check(!r.rows.some((l) => /Mercado cortado/.test(l.description)), `linha partida no corte não é aceita (${JSON.stringify(r.rows.map((l) => [l.description, l.amount]))})`);
check(!r.rows.some((l) => /Depois do corte/.test(l.description)), 'linha depois do corte não aparece');
check(r.truncado === true, `CSV cortado declara truncado (truncado=${r.truncado})`);
check(r.cortadoPorTamanho === true, 'CSV cortado declara corte por tamanho');

// CRLF: a última linha inteira não fica com \r sobrando.
const crlf = heuristics.parseCsvTextDetalhado(csv.replace(/\n/g, '\r\n'));
check(crlf.rows.length === r.rows.length && crlf.rows.every((l, i) => l.description === r.rows[i].description), 'CRLF corta igual a LF');

// Abaixo do limite nada muda.
const curto = heuristics.parseCsvTextDetalhado('Data;Descrição;Valor\n10/11/2026;Padaria;-8,50\n');
check(curto.rows.length === 1 && curto.truncado === false && curto.cortadoPorTamanho === false, 'CSV curto segue igual');

// 2. OFX: bloco cruzando o corte (sem </STMTTRN>) não entra partido.
const bloco = (dia, nome, valor) => `<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>202611${dia}120000\n<FITID>${nome}\n<NAME>${nome}\n<TRNAMT>${valor}\n</STMTTRN>\n`;
const cabecaOfx = 'OFXHEADER:100\n<OFX>\n<BANKMSGSRSV1><STMTTRNRS><STMTRS>\n<CURDEF>BRL\n<BANKTRANLIST>\n';
const ofxTexto = cruzandoOCorte(cabecaOfx, bloco('10', 'PadariaInteira', '-8.50'), ' ',
  '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261115120000\n<FITID>MercadoCortado\n<NAME>MercadoCortado\n<TRNAMT>-12', '3.45\n</STMTTRN>\n',
  bloco('16', 'DepoisDoCorte', '-9.90') + '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n');
const o = ofx.parseOfx(ofxTexto);
check(o.lancamentos.some((l) => l.fitid === 'PadariaInteira' && l.amount === 8.5), 'bloco inteiro antes do corte entra');
check(!o.lancamentos.some((l) => l.fitid === 'MercadoCortado'), `bloco partido no corte não é aceito (${JSON.stringify(o.lancamentos.map((l) => [l.fitid, l.amount]))})`);
check(o.truncado === true && o.cortadoPorTamanho === true, `OFX cortado declara truncado e corte (truncado=${o.truncado})`);
const ofxCurto = ofx.parseOfx(cabecaOfx + bloco('10', 'Padaria', '-8.50') + '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
check(ofxCurto.lancamentos.length === 1 && ofxCurto.truncado === false && ofxCurto.cortadoPorTamanho === false, 'OFX curto segue igual');

// 3. Modal real: alerta explícito antes de salvar, prévia sem a linha partida, nenhuma escrita.
async function modal(texto, nome) {
  const c = { slots: [], i: 0, alerts: [], writes: 0 };
  const stubs = {
    react: { useEffect() {}, useState(init) { const i = c.i++; if (!(i in c.slots)) c.slots[i] = init; return [c.slots[i], (v) => { c.slots[i] = typeof v === 'function' ? v(c.slots[i]) : v; }]; } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: (x) => x, hairlineWidth: 1 } },
    '@/lib/escolher-arquivo': { LIMITE_BYTES_EXTRATO: 10_000_000, escolherArquivoDeExtrato: async () => ({ texto, nome }) },
    '@/lib/alerta': { Alert: { alert: (...args) => c.alerts.push(args) } },
    '@/lib/erros': { mensagemErro: (e) => e.message },
    '@/lib/heuristics': heuristics, '@/lib/ofx-parser': ofx, '@/lib/limits': { LIMITS },
    '@/lib/format': { formatMoney: String, formatDateLabel: String },
    '@/lib/data': { addTransactionsBatch: async () => { c.writes++; }, fetchCreditCards: async () => [] },
    '@/lib/transaction-rules': { avisoEntradasNoCartaoRecusadas: () => '' },
    '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
    '@/lib/wallet-context': { useWallet: () => ({ activeWallet: null, wallets: [] }) },
    './Sheet': { useKeyboardHeight: () => 0 },
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, fonts: {}, type: {}, lh: () => 20, hitSlopPara: () => ({}) },
  };
  const api = {};
  vm.runInNewContext(ts.transpileModule(fonte('components/ImportarExtratoModal.tsx'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, { exports: api, console, require: (id) => {
    if (id in stubs) return stubs[id];
    if (id === './AppModal') return { __esModule: true, default: 'AppModal', JanelaFlutuante: 'JanelaFlutuante' };
    return { __esModule: true, default: id };
  } });
  const nodes = (n) => {
    if (!n || typeof n !== 'object') return [];
    if (Array.isArray(n)) return n.flatMap(nodes);
    const filhos = typeof n.props?.children === 'function' ? n.props.children({}) : n.props?.children;
    return [n, ...nodes(filhos)];
  };
  const botao = nodes(api.default({ visible: true, onClose() {}, onSuccess() {} })).find((n) => n.props?.onPress?.name === 'abrirSeletor');
  assert.ok(botao, 'botão real de seleção encontrado');
  await botao.props.onPress();
  c.previa = c.slots.find((s) => Array.isArray(s) && s.some((l) => l && typeof l === 'object' && 'description' in l)) ?? [];
  return c;
}
(async () => {
  for (const [texto, nome, cortado] of [[csv, 'extrato.csv', 'Mercado cortado'], [ofxTexto, 'extrato.ofx', 'MercadoCortado']]) {
    const c = await modal(texto, nome);
    const aviso = c.alerts.find((a) => a[0] === 'Extrato grande demais');
    check(!!aviso && /ficou de fora/.test(aviso[1]) && /Nada foi salvo ainda/.test(aviso[1]), `${nome}: alerta explícito de corte antes de salvar (${JSON.stringify(c.alerts)})`);
    check(!/O arquivo tem \d+/.test(aviso?.[1] ?? ''), `${nome}: alerta não afirma o total que não foi lido`);
    check(c.previa.length > 0 && !c.previa.some((l) => l.description.includes(cortado)), `${nome}: prévia sem o registro partido`);
    check(c.writes === 0, `${nome}: nada gravado`);
  }
  console.log(`extrato-corte-de-texto: ${checks} verificações ok`);
})().catch((e) => { console.error(e); process.exit(1); });
