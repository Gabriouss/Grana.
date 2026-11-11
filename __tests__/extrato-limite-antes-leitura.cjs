// Módulos reais com provedores locais falsos; nenhum arquivo privado é aberto.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const fonte = file => baseline
  ? require('node:child_process').execFileSync('git', ['--no-optional-locks', '-C', root, 'show', '8ab466cb9217800eb87f001e9b5dc89392d1c778:' + file], { encoding: 'utf8', windowsHide: true })
  : fs.readFileSync(path.join(root, file), 'utf8');
const conteudo = Buffer.from('Data;Descrição;Valor\n11/11/2026;Fixture;-2,00');
function carregar(op = {}) {
  const c = { reads: 0, deleted: [], info: 0, ordem: [] }, cache = new Map();
  const dados = op.dados ?? conteudo;
  const uri = op.uri ?? 'file:///cache/DocumentPicker/fixture.csv';
  const asset = { name: op.nome ?? 'fixture.csv', uri, ...(op.metadata === undefined ? {} : { size: op.metadata }) };
  const info = op.info ?? { exists: true, isDirectory: false, size: dados.length };
  const input = { style: {}, files: [{ name: asset.name, size: op.webSize ?? dados.length, arrayBuffer: async () => {
    c.reads++; c.ordem.push('read'); return dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength);
  } }], addEventListener(event, fn) { this[event] = fn; }, remove() { c.removed = true; }, click() {
    if (op.cancel) this.cancel?.(); else this.change();
  } };
  function real(file) {
    if (cache.has(file)) return cache.get(file);
    const api = {}; cache.set(file, api);
    vm.runInNewContext(ts.transpileModule(fonte(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports: api, TextDecoder, Uint8Array, console: { warn() {} }, setTimeout, clearTimeout,
      document: { createElement: () => input, body: { appendChild() {} } },
      window: { addEventListener() {}, removeEventListener() {} },
      require(id) {
        if (id === 'react-native') return { Platform: { OS: op.web ? 'web' : 'android' } };
        if (id === 'expo-document-picker') return { getDocumentAsync: async options => {
          c.picked = options; return op.cancel ? { canceled: true } : { canceled: false, assets: [asset] };
        } };
        if (id === 'expo-file-system/legacy') return {
          cacheDirectory: 'file:///cache/',
          getInfoAsync: async () => { c.info++; c.ordem.push('info'); return info; },
          readAsStringAsync: async (_, options) => {
            c.reads++; c.ordem.push('read'); c.readOptions = options;
            if (op.readFail) throw Error('Falha de leitura fixture');
            return dados.subarray(options.position ?? 0, options.length === undefined ? undefined : (options.position ?? 0) + options.length).toString('base64');
          },
          deleteAsync: async target => { c.deleted.push(target); if (op.deleteFail) throw Error('Falha de limpeza fixture'); },
        };
        if (id.startsWith('.')) return real(path.posix.join(path.posix.dirname(file), id + '.ts'));
        throw Error(id);
      },
    }, { filename: file });
    return api;
  }
  c.api = real('lib/escolher-arquivo.ts');
  c.run = options => c.api.escolherArquivoDeExtrato(options);
  return c;
}

async function modal(picker, formato) {
  const c = { slots: [], i: 0, alerts: [], writes: 0 };
  const linha = { fitid: 'fixture', date: '2026-11-11', type: 'out', amount: 2, description: 'Fixture', category: 'Outros' };
  const stubs = {
    react: { useEffect() {}, useState(init) { const i = c.i++; if (!(i in c.slots)) c.slots[i] = init; return [c.slots[i], v => { c.slots[i] = typeof v === 'function' ? v(c.slots[i]) : v; }]; } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: x => x, hairlineWidth: 1 } },
    '@/lib/escolher-arquivo': picker,
    '@/lib/alerta': { Alert: { alert: (...args) => c.alerts.push(args) } },
    '@/lib/erros': { mensagemErro: e => e.message },
    '@/lib/heuristics': { tiposDaFatura: x => x, parseCsvTextDetalhado: () => ({ rows: [linha], truncado: true, totalLinhas: 10001 }) },
    '@/lib/ofx-parser': { parseOfx: () => ({ lancamentos: [linha], truncado: true, totalNoArquivo: 10001, origem: 'conta' }) },
    '@/lib/limits': { LIMITS: { pastedText: 200000 } },
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
  } }).outputText, { exports: api, console, require: id => {
    if (id in stubs) return stubs[id];
    if (id === './AppModal') return { __esModule: true, default: 'AppModal', JanelaFlutuante: 'JanelaFlutuante' };
    return { __esModule: true, default: id };
  } });
  function nodes(n) {
    if (!n || typeof n !== 'object') return [];
    if (Array.isArray(n)) return n.flatMap(nodes);
    const children = typeof n.props?.children === 'function' ? n.props.children({}) : n.props?.children;
    return [n, ...nodes(children)];
  }
  const tree = api.default({ visible: true, onClose() {}, onSuccess() {} });
  const button = nodes(tree).find(n => n.props?.onPress?.name === 'abrirSeletor');
  assert.ok(button, 'botão real de seleção encontrado');
  await button.props.onPress();
  assert.equal(c.writes, 0, 'ler/erro/truncar prévia não grava');
  if (formato) assert.ok(c.alerts.some(a => /prévia.*Nada foi salvo ainda/.test(a[1])), 'truncamento CSV/OFX explícito antes de salvar');
  return c;
}

(async () => {
  const limite = carregar().api.LIMITE_BYTES_EXTRATO ?? 10000000;
  // RED original: caminho comum sem opções não consultava tamanho antes do base64.
  const gigante = carregar({ info: { exists: true, size: limite + 1 } });
  await assert.rejects(gigante.run(), /limite|menor/);
  assert.equal(gigante.reads, 0, 'arquivo grande recusado ANTES base64');
  assert.equal(gigante.deleted.length, 1, 'só a cópia retornada nesta seleção foi limpa');
  for (const metadata of [limite + 1, NaN, Infinity, -1, '50', null]) {
    const c = carregar({ metadata }); await assert.rejects(c.run()); assert.equal(c.reads, 0); assert.equal(c.deleted.length, 1);
  }
  for (const info of [{ exists: false }, { exists: true }, { exists: true, size: NaN }, { exists: true, size: Infinity }, { exists: true, size: -1 }, { exists: true, size: 1.5 }, { exists: true, size: 20, isDirectory: true }]) {
    const c = carregar({ info }); await assert.rejects(c.run()); assert.equal(c.reads, 0); assert.equal(c.deleted.length, 1);
  }
  const c = carregar(); assert.match((await c.run()).texto, /Descrição/);
  assert.equal(c.reads, 1); assert.deepEqual(c.ordem, ['info', 'read']); assert.equal(c.deleted.length, 1);
  assert.equal(c.readOptions.position, 0); assert.equal(c.readOptions.length, limite + 1);
  const cresceu = carregar({ dados: Buffer.alloc(2000), info: { exists: true, size: 1 } });
  await assert.rejects(cresceu.run({ limiteBytes: 1000 }), /limite/);
  assert.equal(cresceu.readOptions.length, 1001, 'leitura limitada mesmo se o arquivo crescer após getInfo');
  const exato = carregar(); assert.ok(await exato.run({ limiteBytes: conteudo.length }));
  for (const uri of ['content://original', 'file:///cache-outra/fixture.csv', 'file:///cache/../original.csv', 'file:///cache/%2e%2e/original.csv']) {
    const c = carregar({ uri }); await assert.rejects(c.run()); assert.equal(c.reads, 0); assert.equal(c.deleted.length, 0, 'não apaga original/URI inseguro');
  }
  for (const opt of [{ readFail: true }, { deleteFail: true }, { info: { exists: true, size: conteudo.length - 1 } }]) {
    const c = carregar(opt); await assert.rejects(c.run()); assert.equal(c.deleted.length, 1);
  }
  const cancel = carregar({ cancel: true }); assert.equal(await cancel.run(), null); assert.equal(cancel.reads, 0); assert.equal(cancel.deleted.length, 0);
  for (const limiteBytes of [0, -1, NaN, Infinity, limite + 1]) {
    const c = carregar(); await assert.rejects(c.run({ limiteBytes })); assert.equal(c.picked, undefined);
  }
  const webGrande = carregar({ web: true, webSize: limite + 1 }); await assert.rejects(webGrande.run()); assert.equal(webGrande.reads, 0);
  const webMudou = carregar({ web: true, webSize: 1 }); await assert.rejects(webMudou.run(), /incompleto|mudou/);
  const web = carregar({ web: true }); assert.match((await web.run()).texto, /Descrição/); assert.equal(web.reads, 1);
  const erro = await modal(gigante.api); assert.ok(erro.alerts.some(a => a[0] === 'Não foi possível ler o arquivo'));
  for (const formato of ['csv', 'ofx']) {
    await modal({ LIMITE_BYTES_EXTRATO: limite, escolherArquivoDeExtrato: async options => {
      assert.equal(options.limiteBytes, limite); assert.equal(options.limparCopia, true);
      return { nome: 'fixture.' + formato, texto: formato === 'ofx' ? '<OFX>' : 'fixture csv' };
    } }, formato);
  }
  console.log('S2: teto comum antes de leitura, metadata e arquivo real, web/nativo, limpeza própria, erro e prévia explícitos.');
})().catch(e => { console.error(e); process.exitCode = 1; });
