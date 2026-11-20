// Item 36 (20/11/2026): importação com o primeiro lote confirmado e o segundo falhando.
// lib/data.ts e ImportarExtratoModal reais; Supabase, arquivo, alerta e hooks dublados.
// Assere quantas linhas o "servidor" guardou e com qual chave, nas duas tentativas.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
// RED: KEEL36_DIR aponta cópias da base (lib/data.ts e components/ImportarExtratoModal.tsx) fora do clone.
const fonte = (rel) => fs.readFileSync(process.env.KEEL36_DIR && /^(lib\/data\.ts|components\/ImportarExtratoModal\.tsx)$/.test(rel)
  ? path.join(process.env.KEEL36_DIR, rel) : path.join(root, rel), 'utf8');
const watchdog = setTimeout(() => { console.error('importacao-lote-parcial: não concluiu'); process.exit(1); }, 20000);
const casos = []; const caso = (n, fn) => casos.push([n, fn]);

/* ── Servidor de mentira com a regra do índice único (user_id, fitid) ── */
function servidor() {
  const s = { linhas: [], chaves: new Set(), chamadas: 0, falharNaChamada: 0 };
  s.gravar = (lote, ignorar) => {
    s.chamadas++;
    if (s.chamadas === s.falharNaChamada) return { data: null, error: { message: 'Network request failed' } };
    const entrou = [];
    for (const l of lote) {
      if (ignorar && l.fitid && s.chaves.has(l.fitid)) continue;
      if (l.fitid) s.chaves.add(l.fitid);
      s.linhas.push(l); entrou.push({ id: 'db-' + s.linhas.length });
    }
    return { data: entrou, error: null };
  };
  return s;
}

/* ── data.ts real ── */
function carregarData(srv) {
  const consulta = () => {
    const q = { lote: null, ignorar: false };
    for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'range', 'single', 'maybeSingle', 'setHeader']) q[m] = () => q;
    q.insert = (l) => { q.lote = [].concat(l); return q; };
    q.upsert = (l, op) => { q.lote = [].concat(l); q.ignorar = !!op?.ignoreDuplicates; return q; };
    q.then = (res, rej) => Promise.resolve().then(() => (q.lote ? srv.gravar(q.lote, q.ignorar) : { data: null, error: null })).then(res, rej);
    return q;
  };
  const dubles = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, multiRemove: async () => {}, getAllKeys: async () => [] } },
    './supabase': { supabase: { from: () => consulta(), rpc: async () => ({ data: [], error: null }) } },
    './sessao-offline': { sessaoEstaTravada: () => false, idDoUsuarioLocal: async () => 'u-1', lerSessaoDoDisco: async () => ({ user: { id: 'u-1' }, access_token: 'AUDIT' }) },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {}, observarDadosDosWidgets() { return () => {}; } },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './goals': { createGoal: async () => {} }, './recorrencia': {},
    './notifications': { getNotifications: () => ({ scheduleNotificationAsync: async () => {} }) },
  };
  const cache = new Map();
  function carregar(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const exports = {}; cache.set(rel, exports);
    vm.runInNewContext(ts.transpileModule(fonte(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
      exports, console: { ...console, error() {}, warn() {} }, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl, AbortController, Uint8Array,
      crypto: globalThis.crypto, setTimeout: (fn, ms, ...a) => (ms >= 30_000 ? { unref() {} } : setTimeout(fn, ms, ...a)), clearTimeout, __DEV__: false,
      require: (id) => {
        if (id in dubles) return dubles[id];
        if (id.startsWith('./')) { const alvo = path.posix.join(path.posix.dirname(rel), id.slice(2) + '.ts'); if (fs.existsSync(path.join(root, alvo))) return carregar(alvo); }
        throw new Error(`import não simulado em ${rel}: ${id}`);
      },
    }, { filename: rel });
    return exports;
  }
  return { data: carregar('lib/data.ts'), alterados: carregar('lib/lancamentos-alterados.ts') };
}
const linha = (i, fitid) => ({ type: 'out', description: 'AUDIT ' + i, amount: 1 + i / 100, category: 'Outros', color: '#ffffff', occurred_on: '2026-11-10', fitid });

caso('data.ts: segundo lote falha; o que entrou volta como recibo parcial e a tela é avisada', async () => {
  const srv = servidor(); srv.falharNaChamada = 2;
  const { data, alterados } = carregarData(srv);
  const antes = alterados.versaoDosLancamentos();
  const linhas = Array.from({ length: 501 }, (_, i) => linha(i, 'imp:t:' + i));
  let erro = null; try { await data.addTransactionsBatch(linhas, true); } catch (e) { erro = e; }
  assert.ok(erro, 'a falha do segundo lote tem de subir');
  assert.equal(erro.name, 'ImportacaoParcialError', `falha parcial chega como erro genérico: ${erro.message}`);
  assert.deepEqual([erro.inseridos, erro.processados, erro.total], [500, 500, 501]);
  assert.ok(alterados.versaoDosLancamentos() > antes, 'o que já entrou não avisou as listas');
  assert.equal(srv.linhas.length, 500);
  const de_novo = await data.addTransactionsBatch(linhas, true);
  assert.deepEqual([de_novo.inseridos, de_novo.ignorados, srv.linhas.length], [1, 500, 501], 'reenvio duplicou ou perdeu');
});

/* ── Modal real ── */
async function modal(texto, nome, srv) {
  const c = { slots: [], i: 0, alerts: [], lotes: [] };
  const stubs = {
    react: { useEffect() {}, useState(init) { const i = c.i++; if (!(i in c.slots)) c.slots[i] = init; return [c.slots[i], (v) => { c.slots[i] = typeof v === 'function' ? v(c.slots[i]) : v; }]; } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: (x) => x, hairlineWidth: 1 } },
    '@/lib/escolher-arquivo': { LIMITE_BYTES_EXTRATO: 10_000_000, escolherArquivoDeExtrato: async () => ({ texto, nome }) },
    '@/lib/alerta': { Alert: { alert: (...args) => c.alerts.push(args) } },
    '@/lib/erros': { mensagemErro: (e) => e.message },
    '@/lib/heuristics': heuristics, '@/lib/ofx-parser': ofx, '@/lib/limits': { LIMITS },
    '@/lib/format': { formatMoney: String, formatDateLabel: String },
    // A camada de dados é dublada com o mesmo contrato do item: 500 por lote, falha parcial com o que entrou.
    '@/lib/data': { fetchCreditCards: async () => [], addTransactionsBatch: async (prontos, ignorar) => {
      c.lotes.push(prontos.map((p) => p.fitid ?? null));
      let inseridos = 0, ignorados = 0;
      for (let i = 0; i < prontos.length; i += 500) {
        const r = srv.gravar(prontos.slice(i, i + 500), ignorar);
        if (r.error) {
          if (i === 0) throw new Error(r.error.message);
          throw Object.assign(new Error('parcial'), { name: 'ImportacaoParcialError', inseridos, ignorados, processados: i, total: prontos.length });
        }
        inseridos += r.data.length; ignorados += Math.min(500, prontos.length - i) - r.data.length;
      }
      return { inseridos, ignorados };
    } },
    '@/lib/transaction-rules': { avisoEntradasNoCartaoRecusadas: () => '' },
    '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
    '@/lib/wallet-context': { useWallet: () => ({ activeWallet: { id: 'w' }, wallets: [{ id: 'w', is_default: true }] }) },
    './Sheet': { useKeyboardHeight: () => 0 },
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, fonts: {}, type: {}, lh: () => 20, hitSlopPara: () => ({}) },
  };
  const api = {};
  vm.runInNewContext(ts.transpileModule(fonte('components/ImportarExtratoModal.tsx'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, { exports: api, console: { ...console, error() {}, warn() {} }, Date, Math, Map, Set, Promise, require: (id) => {
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
  c.render = () => { c.i = 0; return nodes(api.default({ visible: true, onClose() {}, onSuccess() {} })); };
  c.botao = (nomeFn) => c.render().find((n) => n.props?.onPress?.name === nomeFn);
  await c.botao('abrirSeletor').props.onPress();
  c.previa = () => c.slots.find((s) => Array.isArray(s) && s.length && s.every((l) => l && typeof l === 'object' && 'description' in l)) ?? [];
  // Categoria escolhida antes de importar, como a pessoa faria no seletor (o palpite não é o assunto aqui).
  for (const l of c.previa()) if (!l.category) Object.assign(l, { category: 'Outros', color: '#ffffff' });
  c.importar = async () => { await c.botao('confirmar').props.onPress(); };
  return c;
}
const LIMITS = { description: 200, pastedText: 2_000_000 };
const heuristics = (() => { const cache = new Map(); function real(file) {
  if (cache.has(file)) return cache.get(file); const api = {}; cache.set(file, api);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports: api, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl, TextDecoder, Uint8Array,
    require: (id) => { if (id.startsWith('./')) return real(path.posix.join(path.posix.dirname(file), id.slice(2) + '.ts')); throw Error(`import não simulado em ${file}: ${id}`); },
  }, { filename: file }); return api; }
  return { real, ...real('lib/heuristics.ts') }; })();
const ofx = heuristics.real('lib/ofx-parser.ts');
Object.assign(LIMITS, heuristics.real('lib/limits.ts').LIMITS);

const blocoSemFitid = (i) => `<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>202611${String(1 + (i % 28)).padStart(2, '0')}120000\n<NAME>Padaria ${i}\n<TRNAMT>-${(1 + i / 100).toFixed(2)}\n</STMTTRN>\n`;
const ofx501 = 'OFXHEADER:100\n<OFX>\n<BANKMSGSRSV1><STMTTRNRS><STMTRS>\n<CURDEF>BRL\n<BANKTRANLIST>\n'
  + Array.from({ length: 501 }, (_, i) => blocoSemFitid(i)).join('') + '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';

caso('modal: 501 linhas sem FITID, segundo lote falha; recibo parcial e reenvio sem duplicar', async () => {
  const srv = servidor(); srv.falharNaChamada = 2;
  const c = await modal(ofx501, 'extrato.ofx', srv);
  assert.equal(c.previa().length, 501, 'prévia com as 501 linhas');
  await c.importar();
  assert.equal(c.alerts.at(-1)[0], 'Importação interrompida', `falha parcial parece falha total: ${JSON.stringify(c.alerts.at(-1))}`);
  assert.match(c.alerts.at(-1)[1], /500 de 501/);
  assert.equal(c.previa().length, 501, 'a prévia some e não há como reenviar');
  await c.importar();
  assert.equal(c.alerts.at(-1)[0], 'Importação concluída');
  assert.equal(srv.linhas.length, 501, `reenvio gravou ${srv.linhas.length} linhas para 501 do arquivo`);
  assert.equal(new Set(c.lotes[0]).size, 501, 'cada ocorrência tem chave própria');
  assert.deepEqual(c.lotes[1], c.lotes[0], 'a segunda tentativa usa as mesmas chaves');
});

caso('modal: CSV com duas linhas iguais no mesmo dia entra duas vezes; reimportar o arquivo não repete', async () => {
  const csv = 'Data;Descrição;Valor\n10/11/2026;Cafe padaria;-8,50\n10/11/2026;Cafe padaria;-8,50\n11/11/2026;Mercado;-20,00\n';
  const srv = servidor();
  const a = await modal(csv, 'extrato.csv', srv); await a.importar();
  assert.equal(srv.linhas.length, 3, `ocorrências legítimas fundidas: ${srv.linhas.length} de 3`);
  const b = await modal(csv, 'extrato.csv', srv); await b.importar();
  assert.equal(srv.linhas.length, 3, 'reimportar o mesmo CSV duplicou');
  assert.match(b.alerts.at(-1)[1], /3 já existiam/);
});

(async () => { let f = 0; for (const [n, fn] of casos) { try { await fn(); console.log('OK ' + n); } catch (e) { f++; console.error('FALHA ' + n + ': ' + e.stack); } }
  clearTimeout(watchdog); console.log(`${casos.length - f}/${casos.length} casos`); process.exitCode = f ? 1 : 0; })();
