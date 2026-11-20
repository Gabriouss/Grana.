'use strict';
/*
 * Item 41 (20/11/2026): sair da tela ou trocar de conta no meio de uma
 * exportação longa não cancelava nada. A leitura seguia página a página e, no
 * fim, a folha de compartilhar (ou o download) abria atrasada, por cima de
 * outra tela ou para a conta seguinte. O PDF não cancela o `printToFileAsync`,
 * e um novo relatório empilhava outra impressão nativa.
 *
 * Executa os módulos REAIS (lib/exportar-meus-dados.ts, lib/exportar-lancamentos.ts,
 * lib/pdf-report.ts) e os botões REAIS, com dados sintéticos e fronteiras
 * dubladas (Supabase, disco, compartilhamento, impressão). Asserta nos efeitos:
 * arquivos criados, folhas abertas, cliques de download, alertas e impressões.
 *
 *   node __tests__/exportacao-cancelada.cjs
 *   EXPORT_BASE_DIR=<pasta com lib/ e components/> node __tests__/exportacao-cancelada.cjs   (RED contra a base)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const base = process.env.EXPORT_BASE_DIR || root;
const SOB_TESTE = ['lib/exportar-meus-dados.ts', 'lib/exportar-lancamentos.ts', 'lib/pdf-report.ts',
  'components/BaixarMeusDadosBotao.tsx', 'components/ExportarLancamentosBotao.tsx'];
const giro = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/** Mundo sintético: uma conta, N lançamentos inventados, disco e folha de compartilhar contados. */
function mundo({ lancamentos = 2500 } = {}) {
  const w = { dono: 'conta-sintetica-A', token: 'token-sintetico-A', paginas: [], arquivos: new Map(), shares: [], cliques: 0,
    alertas: [], impressoes: [], apagados: [], aoPaginar: null, ouvintes: [], timers: [] };
  const linha = (tabela, i) => ({ id: `${tabela}-${String(i).padStart(6, '0')}`, user_id: w.dono, badge_id: `b-${i}`,
    occurred_on: '2026-11-08', type: 'out', amount: 1, category: 'Teste', description: 'sintético', wallet_id: 'carteira-s', payment_method: 'pix' });
  const tabelas = { transactions: lancamentos, wallets: 1 };
  const resposta = (valor) => ({ setHeader() { return this; }, then: (a, b) => Promise.resolve().then(() => valor).then(a, b) });
  w.supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: w.dono }, access_token: w.token } }, error: null }),
      getUser: async () => ({ data: { user: { id: w.dono, email: 'sintetico@invalid.test' } }, error: null }),
      onAuthStateChange: (fn) => { w.ouvintes.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
    },
    rpc: () => resposta({ data: { allowed: true, enforced: false, status: 'active' }, error: null }),
    from(tabela) {
      const p = { tabela };
      const q = {
        select() { return q; }, eq() { return q; }, gte() { return q; }, lt() { return q; }, order() { return q; },
        range(de, ate) { p.de = de; p.ate = ate; return q; }, setHeader() { return q; },
        then(a, b) {
          return Promise.resolve().then(async () => {
            w.paginas.push(p);
            await w.aoPaginar?.(p);
            const n = tabelas[tabela] ?? 0;
            const data = Array.from({ length: Math.max(0, Math.min(p.ate + 1, n) - p.de) }, (_, i) => linha(tabela, p.de + i));
            if (tabela === 'wallets') data.forEach((x) => { x.id = 'carteira-s'; x.name = 'Principal'; x.is_default = true; });
            return { data, error: null };
          }).then(a, b);
        },
      };
      return q;
    },
  };
  class File {
    constructor(...partes) { this.uri = partes.map((x) => (x && x.uri) || x).join('/'); this.name = this.uri.split('/').pop(); }
    get exists() { return w.arquivos.has(this.uri); }
    create() { w.arquivos.set(this.uri, ''); }
    write(v) { w.arquivos.set(this.uri, v); w.aoEscrever?.(); }
    delete() { w.apagados.push(this.uri); w.arquivos.delete(this.uri); }
    async move(destino) { w.arquivos.set(destino.uri, w.arquivos.get(this.uri)); w.arquivos.delete(this.uri); this.uri = destino.uri; }
  }
  class Directory { constructor(...partes) { this.uri = partes.map((x) => (x && x.uri) || x).join('/'); } create() {} }
  w.fronteiras = {
    'react-native': { Platform: { OS: 'android' }, ActivityIndicator: 'ActivityIndicator', Text: 'Text', View: 'View', StyleSheet: { create: (x) => x } },
    './supabase': { supabase: w.supabase },
    'expo-file-system': { File, Directory, Paths: { cache: 'cache' } },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (uri) => { w.shares.push(uri); } },
    'expo-crypto': { randomUUID: () => 'uuid-sintetico' },
    'expo-print': { printToFileAsync: () => new Promise((resolve) => w.impressoes.push({ resolve })) },
    './pdf-report-html': { montarHtml: () => '<html>sintético</html>' },
    'expo-linking': { openURL: async () => {} },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
    '@/lib/checkout-assinatura': { destinoSuporte: 'mailto:suporte@invalid.test' },
    '@/lib/alerta': { Alert: { alert: (...a) => w.alertas.push(a[0]) } },
    '@/lib/erros': { mensagemErro: (e, apoio) => (e && e.message) || apoio },
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, fonts: {}, type: {}, lh: () => 20 },
    '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
    '@/lib/wallet-context': { useWallet: () => ({ activeWalletId: 'carteira-s', wallets: [{ id: 'carteira-s', user_id: w.dono, name: 'Principal' }] }) },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
  };
  for (const nome of ['AppPressable', 'AppModal', 'Sheet', 'MonthSelector', 'SegmentedTabs']) w.fronteiras['./' + nome] = { __esModule: true, default: nome };

  const cache = new Map();
  w.carregar = function carregar(rel) {
    const arquivo = SOB_TESTE.includes(rel) ? path.join(base, rel) : path.join(root, rel);
    if (cache.has(arquivo)) return cache.get(arquivo);
    const m = { exports: {} };
    cache.set(arquivo, m.exports);
    const js = ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), { fileName: arquivo,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(js, {
      module: m, exports: m.exports, Date, Promise, Error, JSON, Object, Array, String, Number, Math, Map, Set, RegExp, Blob,
      AbortController,
      setTimeout: (fn, ms) => { w.timers.push({ fn, ms, vivo: true }); return w.timers.length; },
      clearTimeout: (id) => { if (w.timers[id - 1]) w.timers[id - 1].vivo = false; },
      URL: { createObjectURL: () => 'blob:sintetico', revokeObjectURL() {} },
      document: { createElement: () => ({ click() { w.cliques++; } }) },
      requestAnimationFrame: (fn) => fn(),
      console: { warn() {}, error() {}, log() {} },
      require(id) {
        if (id === 'react') return w.react;
        if (id in w.fronteiras) return w.fronteiras[id];
        if (id === '@/lib/exportar-meus-dados') return carregar('lib/exportar-meus-dados.ts');
        if (id === '@/lib/exportar-lancamentos') return carregar('lib/exportar-lancamentos.ts');
        if (id.startsWith('./')) return carregar(path.posix.join(path.posix.dirname(rel), id) + '.ts');
        throw new Error('fronteira inesperada ' + id + ' em ' + rel);
      },
    }, { filename: arquivo });
    return m.exports;
  };
  return w;
}

/** Runtime mínimo de hooks com efeitos, limpeza e desmontagem. */
function montarComponente(w, rel, sessao) {
  const slots = [];
  const efeitos = [];
  let cursor = 0;
  w.sessao = sessao;
  w.react = {
    useState(inicial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof inicial === 'function' ? inicial() : inicial; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(inicial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: inicial }; return slots[i]; },
    useEffect(fn, deps) {
      const i = cursor++;
      const antes = efeitos[i];
      if (!antes || !deps || deps.some((d, k) => !Object.is(d, antes.deps[k]))) efeitos[i] = { fn, deps: deps || [], limpar: antes && antes.limpar, pendente: true };
    },
  };
  w.fronteiras['@/lib/auth-context'] = { useSession: () => ({ session: w.sessao ? { user: { id: w.sessao, email: 'sintetico@invalid.test' } } : null }) };
  const Componente = w.carregar(rel).default;
  const render = () => {
    cursor = 0;
    const arvore = Componente({});
    for (const e of efeitos) if (e && e.pendente) { e.pendente = false; if (typeof e.limpar === 'function') e.limpar(); e.limpar = e.fn(); }
    return arvore;
  };
  const nos = (t) => (!t ? [] : Array.isArray(t) ? t.flatMap(nos) : typeof t === 'object' ? [t, ...nos(t.props && t.props.children)] : []);
  return {
    render,
    porRotulo: (rotulo) => nos(render()).find((n) => n.props && n.props.accessibilityLabel === rotulo),
    texto: () => nos(render()).filter((n) => n.type === 'Text').map((n) => [].concat(n.props.children).join('')).join(' | '),
    desmontar() { for (const e of efeitos) if (e && typeof e.limpar === 'function') e.limpar(); },
    trocarConta(nova) { w.sessao = nova; render(); },
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
  console.log('\nItem 41: exportação cancelada (' + (base === root ? 'working-tree' : path.relative(root, base)) + ')');

  await caso('meus dados, controle: sem cancelar, a cópia é entregue uma vez com aviso', async () => {
    const w = mundo();
    const b = montarComponente(w, 'components/BaixarMeusDadosBotao.tsx', w.dono);
    await b.render().props.onPress();
    assert.equal(w.shares.length, 1);
    assert.equal(w.alertas.at(-1), 'Cópia parcial gerada');
  });

  await caso('meus dados: sair da tela no meio das páginas não cria arquivo, não compartilha e não avisa', async () => {
    const w = mundo();
    const b = montarComponente(w, 'components/BaixarMeusDadosBotao.tsx', w.dono);
    let vistas = 0;
    w.aoPaginar = (p) => { if (p.tabela === 'transactions' && ++vistas === 2) b.desmontar(); };
    await b.render().props.onPress();
    await giro();
    assert.equal(w.shares.length, 0, 'folha de compartilhar tardia depois de sair da tela');
    assert.equal(w.arquivos.size, 0, 'arquivo criado depois de sair da tela');
    assert.deepEqual(w.alertas, [], 'aviso tardio depois de sair da tela');
    assert.ok(w.paginas.filter((p) => p.tabela === 'transactions').length <= 2, 'nenhuma página nova depois do cancelamento');
  });

  await caso('meus dados: troca de conta descarta progresso e resultado da conta anterior', async () => {
    const w = mundo();
    const b = montarComponente(w, 'components/BaixarMeusDadosBotao.tsx', w.dono);
    let rotuloNoMeio = '';
    w.aoPaginar = (p) => { if (p.tabela === 'transactions' && p.de === 1000) { rotuloNoMeio = b.texto(); b.trocarConta('conta-sintetica-B'); } };
    await b.render().props.onPress();
    await giro();
    assert.match(rotuloNoMeio, /Preparando seus dados \(\d+ de 15\)/, 'progresso visível durante a cópia longa');
    assert.equal(w.shares.length, 0, 'cópia da conta anterior entregue depois da troca');
    assert.deepEqual(w.alertas, [], 'aviso da conta anterior mostrado à conta nova');
    assert.doesNotMatch(b.texto(), /de 15/, 'progresso da conta anterior continua na tela');
  });

  await caso('CSV, controle: sem cancelar, compartilha uma vez', async () => {
    const w = mundo();
    const b = montarComponente(w, 'components/ExportarLancamentosBotao.tsx', w.dono);
    b.porRotulo('Exportar lançamentos em CSV').props.onPress();
    await b.porRotulo('Preparar CSV').props.onPress();
    assert.equal(w.shares.length, 1);
    assert.equal(w.alertas.at(-1), 'CSV preparado');
  });

  await caso('CSV: sair da tela no meio das páginas não compartilha nem avisa', async () => {
    const w = mundo();
    const b = montarComponente(w, 'components/ExportarLancamentosBotao.tsx', w.dono);
    b.porRotulo('Exportar lançamentos em CSV').props.onPress();
    w.aoPaginar = (p) => { if (p.tabela === 'transactions' && p.de === 1000) b.desmontar(); };
    await b.porRotulo('Preparar CSV').props.onPress();
    await giro();
    assert.equal(w.shares.length, 0, 'folha de compartilhar tardia depois de sair da tela');
    assert.deepEqual(w.alertas, [], 'aviso tardio depois de sair da tela');
    assert.equal(w.arquivos.size, 0);
  });

  await caso('CSV: cancelar depois de gravar o temporário apaga o arquivo e não compartilha', async () => {
    const w = mundo({ lancamentos: 10 });
    const b = montarComponente(w, 'components/ExportarLancamentosBotao.tsx', w.dono);
    b.porRotulo('Exportar lançamentos em CSV').props.onPress();
    w.aoEscrever = () => b.desmontar();
    await b.porRotulo('Preparar CSV').props.onPress();
    await giro();
    assert.equal(w.shares.length, 0, 'compartilhou o CSV depois de sair da tela');
    assert.equal(w.arquivos.size, 0, 'o temporário ficou no cache');
    assert.equal(w.apagados.length, 1, 'a limpeza do temporário continua acontecendo');
  });

  await caso('PDF: impressão nativa pendente não é sobreposta; o próximo espera, e a abandonada é limpa sem compartilhar', async () => {
    const w = mundo();
    const pdf = w.carregar('lib/pdf-report.ts');
    const dados = { ano: 2026, mes: 10, transactions: [], bills: [] };
    const c1 = new AbortController();
    const primeiro = pdf.gerarRelatorioPdf(dados, { dono: w.dono, demo: false, sinal: c1.signal });
    primeiro.catch(() => {});
    await giro();
    assert.equal(w.impressoes.length, 1);
    c1.abort(); // a tela do primeiro relatório saiu
    const segundo = pdf.gerarRelatorioPdf(dados, { dono: w.dono, demo: false, sinal: new AbortController().signal });
    await giro();
    assert.equal(w.impressoes.length, 1, 'segunda impressão nativa por cima da pendente');
    w.impressoes[0].resolve({ uri: 'cache/Print/sintetico-1.pdf' });
    await assert.rejects(primeiro, (e) => e.name === 'RelatorioPdfCancelado');
    await giro();
    assert.deepEqual(w.apagados, ['cache/Print/sintetico-1.pdf'], 'o PDF abandonado é apagado ao voltar');
    assert.equal(w.impressoes.length, 2, 'liberada a impressão anterior, o segundo imprime');
    w.impressoes[1].resolve({ uri: 'cache/Print/sintetico-2.pdf' });
    assert.equal((await segundo).compartilhado, true, 'o segundo relatório termina e é entregue');
    assert.equal(w.shares.length, 1, 'só o segundo é compartilhado, nunca o abandonado');
  });

  await caso('PDF: impressão anterior que nunca volta faz o próximo falhar no prazo com erro visível, sem imprimir por cima', async () => {
    const w = mundo();
    const pdf = w.carregar('lib/pdf-report.ts');
    const dados = { ano: 2026, mes: 10, transactions: [], bills: [] };
    pdf.gerarRelatorioPdf(dados, { dono: w.dono, demo: false, sinal: new AbortController().signal }).catch(() => {});
    await giro();
    const segundo = pdf.gerarRelatorioPdf(dados, { dono: w.dono, demo: false, sinal: new AbortController().signal });
    segundo.catch(() => {});
    await giro();
    assert.equal(w.impressoes.length, 1, 'segunda impressão nativa por cima da pendente');
    const prazo = w.timers.find((t) => t.vivo && t.ms === pdf.PRAZO_FILA_IMPRESSAO_MS);
    assert.ok(prazo, 'a espera pela impressão anterior tem prazo');
    prazo.fn();
    await assert.rejects(segundo, /ainda está sendo gerado/, 'estourou: erro com mensagem para a tela, nunca espera silenciosa');
    assert.equal(w.impressoes.length, 1);
    assert.equal(w.shares.length, 0);
  });

  if (falhas.length) {
    console.error('\n' + falhas.length + ' falha(s), ' + aprovadas + ' aprovada(s)\n');
    process.exit(1);
  }
  console.log('\n' + aprovadas + '/' + aprovadas + ' checagens de exportação cancelada passaram, 0 falhas\n');
  process.exitCode = 0;
})().catch((e) => { console.error('\nFALHOU: ' + (e && e.stack || e)); process.exit(1); });
