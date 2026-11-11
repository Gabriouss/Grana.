// PrismPDF: botão e gerador reais, promessas controladas nas fronteiras.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const pendente = () => { let resolve, reject; const promise = new Promise((s, n) => { resolve = s; reject = n; }); return { promise, resolve, reject }; };
const sessao = (dono, id = dono + '-sessao', token = 'r1') => dono ? { user: { id: dono }, refresh_token: token, access_token: 'x.' + Buffer.from(JSON.stringify({ session_id: id })).toString('base64url') + '.x' } : null;
function ambiente(opts = {}) {
  let atual, session = sessao(opts.dono === undefined ? 'A' : opts.dono), demo = !!opts.demo, montado = true, sequencia = 0;
  const chamadas = [], logs = [], alertas = [], frames = [], listeners = new Set(), arquivos = new Map([['file:///cache/relatorio-alheio.pdf', 'alheio']]);
  const mudaram = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(v) { const c = atual, i = c.i++; if (!(i in c.slots)) c.slots[i] = v; return [c.slots[i], novo => { if (!montado) chamadas.push(['estado-desmontado']); c.slots[i] = novo; }]; },
    useRef(v) { const c = atual, i = c.i++; return c.slots[i] ??= { current: v }; },
    useEffect(fn, deps) { const c = atual, i = c.i++, old = c.slots[i]; if (mudaram(old?.deps, deps)) c.efeitos.push(() => { old?.limpar?.(); c.slots[i] = { deps, limpar: fn() }; }); },
  };
  const jsx = (tipo, props) => ({ tipo, props });
  const juntar = partes => partes.map((p, i) => { const uri = typeof p === 'string' ? p : p.uri; return i === 0 ? uri.replace(/\/+$/, '') : uri.replace(/^\/+/, ''); }).join('/');
  class Directory {
    constructor(...partes) { this.uri = juntar(partes); }
    create() { chamadas.push(['pasta', this.uri]); }
    delete() { chamadas.push(['apagar-pasta', this.uri]); throw Error('Nunca apague a pasta compartilhada'); }
  }
  class File {
    constructor(...partes) { this.uri = juntar(partes); }
    get name() { return this.uri.split('/').pop(); }
    async move(destino) {
      chamadas.push(['mover', this.uri, destino.uri]);
      if (opts.mover) await opts.mover.promise;
      if (opts.falhaMover) throw Error('falha sintética ao mover');
      assert.ok(arquivos.has(this.uri)); assert.ok(!arquivos.has(destino.uri));
      arquivos.set(destino.uri, arquivos.get(this.uri)); arquivos.delete(this.uri); this.uri = destino.uri;
    }
    delete() { chamadas.push(['apagar', this.uri]); if (opts.falhaExcluir) throw Error('falha sintética ao excluir'); arquivos.delete(this.uri); }
  }
  const janela = { onload: null, document: { open() {}, write(html) { chamadas.push(['html-web', html]); }, close() {} },
    close() { chamadas.push(['fechar-janela']); }, focus() { chamadas.push(['foco']); opts.noFoco?.(api); }, print() { chamadas.push(['imprimir-web']); } };
  const transacoes = opts.transacoes ?? [{ id: 'tx-A', user_id: 'A', amount: 10 }];
  let props = { ano: 2026, mes: 9, carteira: 'Total', transactions: transacoes, ...opts.props };
  const consumo = { origemSintetica: 'categorias-A' };
  const mods = {
    react: { __esModule: true, default: react, ...react }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: opts.web ? 'web' : 'android' }, ActivityIndicator: 'Busy', Text: 'Text', StyleSheet: { create: v => v } },
    '@/lib/alerta': { Alert: { alert: (...v) => alertas.push(v) } },
    '@/lib/auth-context': { useSession: () => ({ session }) },
    '@/lib/demo-context': { useDemo: () => ({ isDemoMode: demo }) },
    '@/lib/feature-flags': { useFlags: () => ({ ligado: () => true }) },
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, type: {}, fonts: {} },
    '@/lib/erros': { mensagemErro: () => 'Sem rede' }, '@/lib/offline-cache': { isLikelyNetworkError: () => false },
    '@/lib/gastos-categoria': { apurarGastosCategoria: () => { chamadas.push(['apurar-demo']); return consumo; } },
    '@/lib/data': { fetchBills: async () => { chamadas.push(['buscar-boletos']); return opts.boletos ? await opts.boletos.promise : [{ user_id: 'A', id: 'b-A' }]; } },
    '@/lib/categorias-cliente': { consultarCategorias: async () => { chamadas.push(['categorias']); return opts.categorias ? await opts.categorias.promise : { resultado: { userId: 'A', consumo } }; } },
    '@expo/vector-icons/Ionicons': 'Icon', './AppPressable': 'Botao',
    'expo-file-system': { File, Directory, Paths: { cache: 'file:///cache' } },
    'expo-print': { async printToFileAsync(o) { chamadas.push(['imprimir', o]); const uri = `file:///cache/Print/uuid-${++sequencia}.pdf`; arquivos.set(uri, 'pdf-proprio'); if (opts.imprimir) await opts.imprimir.promise; return { uri }; } },
    'expo-sharing': {
      async isAvailableAsync() { chamadas.push(['disponivel']); if (opts.disponivel) return await opts.disponivel.promise; return true; },
      async shareAsync(uri) { assert.ok(arquivos.has(uri)); chamadas.push(['compartilhar', uri]); if (opts.compartilhar) await opts.compartilhar.promise; },
    },
    './format': { MONTH_NAMES: Array(12).fill('Outubro') },
    './pdf-report-html': { montarHtml: dados => { chamadas.push(['dados-html', dados]); return '<html>relatório sintético</html>'; } },
  };
  mods['@/lib/format'] = mods['./format'];
  const auth = { onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; } };
  mods['./supabase'] = { supabase: { auth } }; mods['@/lib/supabase'] = mods['./supabase'];
  function carregar(rel) {
    const original = process.env.PRISM_PDF_RED && ['components/ExportPdfButton.tsx', 'lib/pdf-report.ts'].includes(rel);
    const arquivo = original ? path.join(process.env.PRISM_PDF_RED, rel) : path.join(raiz, rel);
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), { fileName: arquivo, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
      { exports, require: id => { assert.ok(id in mods, 'import inesperado: ' + id); return mods[id]; }, console: { warn: (...v) => logs.push(v), error: (...v) => logs.push(v) },
        AbortController, atob, setTimeout, clearTimeout, requestAnimationFrame: fn => frames.push(fn), window: { open: () => { chamadas.push(['abrir-janela']); return janela; } } }, { filename: rel });
    return exports;
  }
  mods['@/lib/sessao-offline'] = carregar('lib/sessao-offline.ts');
  const gerador = carregar('lib/pdf-report.ts');
  mods['@/lib/pdf-report'] = gerador;
  const botao = carregar('components/ExportPdfButton.tsx').default;
  const c = { i: 0, slots: [], efeitos: [] };
  function render() { atual = c; c.i = 0; c.efeitos = []; const tree = botao(props); c.efeitos.forEach(fn => fn()); return tree; }
  render();
  const api = { chamadas, logs, alertas, arquivos, janela, transacoes, consumo, gerador, render,
    clicar: () => render().props.onPress(),
    async quadro() { frames.splice(0).forEach(fn => fn()); await flush(); },
    trocar(dono, id, token) { const nova = sessao(dono, id, token); if (!opts.sessaoFicticia) session = nova; for (const fn of listeners) fn(dono ? 'SIGNED_IN' : 'SIGNED_OUT', nova); },
    mudarDemo(valor) { demo = valor; render(); },
    desmontar() { c.slots.forEach(s => s?.limpar?.()); montado = false; },
    direto(controlador = new AbortController(), dados = {}) { return gerador.gerarRelatorioPdf({ ano: 2026, mes: 9, carteira: 'Total', transactions: transacoes, bills: [], ...dados }, { dono: 'A', demo: false, sinal: controlador.signal }); },
  };
  return api;
}
const contar = (a, nome) => a.chamadas.filter(c => c[0] === nome).length;
const semEntrega = a => { assert.equal(contar(a, 'imprimir'), 0); assert.equal(contar(a, 'compartilhar'), 0); assert.equal(contar(a, 'imprimir-web'), 0); };
const apenasAlheio = a => { assert.deepEqual([...a.arquivos], [['file:///cache/relatorio-alheio.pdf', 'alheio']]); assert.equal(contar(a, 'apagar-pasta'), 0); };
const casos = [], caso = (nome, fn) => casos.push([nome, fn]);
caso('fluxo A preserva snapshot de transações e consumo retornado, com um único share', async () => {
  const a = ambiente(), p = a.clicar(); a.transacoes[0].amount = 999; await a.quadro(); await p;
  const dados = a.chamadas.find(c => c[0] === 'dados-html')[1]; assert.equal(dados.transactions[0].amount, 10); assert.equal(dados.consumoCategorias, a.consumo);
  assert.equal(contar(a, 'imprimir'), 1); assert.equal(contar(a, 'compartilhar'), 1); assert.equal(contar(a, 'apagar'), 0);
});
caso('props de outra conta são recusadas antes das buscas', async () => {
  const a = ambiente({ transacoes: [{ user_id: 'B' }] }), p = a.clicar(); await a.quadro(); await p;
  semEntrega(a); assert.equal(contar(a, 'buscar-boletos'), 0); assert.equal(contar(a, 'categorias'), 0);
});
caso('boletos recebidos de outra conta são recusados', async () => {
  const a = ambiente({ props: { bills: [{ user_id: 'B' }] } }), p = a.clicar(); await a.quadro(); await p; semEntrega(a);
});
caso('troca antes do quadro não inicia nenhuma busca', async () => {
  const a = ambiente(), p = a.clicar(); a.trocar('B'); await a.quadro(); await p; semEntrega(a); assert.equal(contar(a, 'buscar-boletos'), 0);
});
caso('troca durante fetchBills não consulta categorias nem imprime', async () => {
  const boletos = pendente(), a = ambiente({ boletos }), p = a.clicar(); await a.quadro(); a.trocar('B'); boletos.resolve([{ user_id: 'B' }]); await p;
  semEntrega(a); assert.equal(contar(a, 'categorias'), 0);
});
caso('troca durante categorias não imprime nem compartilha', async () => {
  const categorias = pendente(), a = ambiente({ categorias }), p = a.clicar(); await a.quadro(); a.trocar('B'); categorias.resolve({ resultado: { userId: 'B', consumo: {} } }); await p; semEntrega(a);
});
caso('resultado de categorias com dono diferente é recusado mesmo sem evento auth', async () => {
  const categorias = pendente(), a = ambiente({ categorias }), p = a.clicar(); await a.quadro(); categorias.resolve({ resultado: { userId: 'B', consumo: {} } }); await p; semEntrega(a);
});
caso('A -> B -> A sem render intermediário permanece cancelado', async () => {
  const categorias = pendente(), a = ambiente({ categorias }), p = a.clicar(); await a.quadro(); a.trocar('B'); a.trocar('A'); categorias.resolve({ resultado: { userId: 'A', consumo: {} } }); await p; semEntrega(a);
});
caso('nova sessão da mesma conta cancela, refresh da mesma sessão não cancela', async () => {
  for (const nova of [true, false]) {
    const categorias = pendente(), a = ambiente({ categorias }), p = a.clicar(); await a.quadro(); a.trocar('A', nova ? 'A-outra-sessao' : 'A-sessao', 'r2'); categorias.resolve({ resultado: { userId: 'A', consumo: {} } }); await p;
    if (nova) semEntrega(a); else assert.equal(contar(a, 'compartilhar'), 1);
  }
});
caso('desmontagem durante busca cancela e não altera estado nem exibe alerta depois', async () => {
  const boletos = pendente(), a = ambiente({ boletos }), p = a.clicar(); await a.quadro(); a.desmontar(); boletos.resolve([]); await p;
  semEntrega(a); assert.equal(contar(a, 'estado-desmontado'), 0); assert.equal(a.alertas.length, 0);
});
caso('gerador exige origem válida antes de montar HTML ou imprimir', async () => {
  const a = ambiente(), ctrl = new AbortController(); ctrl.abort(); await assert.rejects(a.direto(ctrl), /conta|tela/i); semEntrega(a); assert.equal(contar(a, 'dados-html'), 0);
  await assert.rejects(a.gerador.gerarRelatorioPdf({}), /conta|tela/i); semEntrega(a);
});
caso('troca durante printToFile apaga apenas o PDF próprio e não move/share', async () => {
  const imprimir = pendente(), a = ambiente({ imprimir }), p = a.clicar(); await a.quadro(); assert.equal(contar(a, 'imprimir'), 1);
  a.trocar('B'); imprimir.resolve(); await p; assert.equal(contar(a, 'mover'), 0); assert.equal(contar(a, 'compartilhar'), 0); apenasAlheio(a);
});
caso('troca durante move apaga apenas o destino próprio depois de concluir', async () => {
  const mover = pendente(), a = ambiente({ mover }), p = a.clicar(); await a.quadro(); assert.equal(contar(a, 'mover'), 1);
  a.trocar('B'); mover.resolve(); await p; assert.equal(contar(a, 'compartilhar'), 0); apenasAlheio(a);
  assert.match(a.chamadas.find(c => c[0] === 'apagar')[1], /Grana-relatorio-2026-10\.pdf$/);
});
caso('troca antes do share ou fallback de disponibilidade não entrega URI antiga', async () => {
  for (const valor of [true, false]) {
    const disponivel = pendente(), a = ambiente({ disponivel }), p = a.clicar(); await a.quadro(); assert.equal(contar(a, 'disponivel'), 1);
    a.trocar('B'); disponivel.resolve(valor); await p; assert.equal(contar(a, 'compartilhar'), 0); apenasAlheio(a);
    assert.equal(a.alertas.filter(v => v[0] === 'Relatório gerado').length, 0);
  }
});
caso('cancelamento durante share em curso limpa só arquivo próprio ao retornar', async () => {
  const compartilhar = pendente(), a = ambiente({ compartilhar }), p = a.clicar(); await a.quadro(); assert.equal(contar(a, 'compartilhar'), 1);
  a.trocar('B'); compartilhar.resolve(); await p; apenasAlheio(a); assert.equal(a.alertas.filter(v => v[0] === 'Relatório gerado').length, 0);
});
caso('fallback sem share mantém URI só enquanto a origem continua válida', async () => {
  const disponivel = pendente(), a = ambiente({ disponivel }), ctrl = new AbortController(), p = a.direto(ctrl); await flush(); disponivel.resolve(false);
  const r = await p; assert.equal(r.compartilhado, false); assert.ok(a.arquivos.has(r.uri)); ctrl.abort(); apenasAlheio(a);
});
caso('falha de mover preserva original, mas cancelamento depois ainda o remove', async () => {
  const disponivel = pendente(), a = ambiente({ falhaMover: true, disponivel }), p = a.clicar(); await a.quadro(); a.trocar('B'); disponivel.resolve(true); await p;
  assert.equal(contar(a, 'compartilhar'), 0); apenasAlheio(a); assert.match(a.chamadas.find(c => c[0] === 'apagar')[1], /Print\/uuid-1\.pdf$/);
});
caso('falha de cleanup deixa log e jamais tenta apagar a pasta ou PDF alheio', async () => {
  const imprimir = pendente(), a = ambiente({ imprimir, falhaExcluir: true }), p = a.clicar(); await a.quadro(); a.trocar('B'); imprimir.resolve(); await p;
  assert.equal(contar(a, 'compartilhar'), 0); assert.equal(contar(a, 'apagar'), 1); assert.equal(contar(a, 'apagar-pasta'), 0); assert.ok(a.arquivos.has('file:///cache/relatorio-alheio.pdf')); assert.ok(a.logs.length);
});
caso('demo sem conta usa dados de exemplo sem buscar boletos/categorias reais', async () => {
  const a = ambiente({ dono: null, demo: true }), p = a.clicar(); await a.quadro(); await p;
  assert.equal(contar(a, 'buscar-boletos'), 0); assert.equal(contar(a, 'categorias'), 0); assert.equal(contar(a, 'compartilhar'), 1);
});
caso('demo com sessão fictícia não exige correspondência com auth real vazio', async () => {
  const a = ambiente({ dono: 'demo-ficticio', demo: true, sessaoFicticia: true }); a.trocar(null); const p = a.clicar(); await a.quadro(); await p;
  assert.equal(contar(a, 'buscar-boletos'), 0); assert.equal(contar(a, 'categorias'), 0); assert.equal(contar(a, 'compartilhar'), 1);
});
caso('mudança do modo demo durante await cancela', async () => {
  const imprimir = pendente(), a = ambiente({ demo: true, imprimir }), p = a.clicar(); await a.quadro(); a.mudarDemo(false); imprimir.resolve(); await p;
  assert.equal(contar(a, 'compartilhar'), 0); apenasAlheio(a);
});
caso('web: troca depois de abrir e antes de onload fecha só a janela própria', async () => {
  const a = ambiente({ web: true }), p = a.clicar(); await a.quadro(); await p; const onload = a.janela.onload; assert.equal(typeof onload, 'function');
  a.trocar('B'); onload(); semEntrega(a); assert.ok(contar(a, 'fechar-janela') >= 1);
});
caso('web: troca durante focus ainda impede print', async () => {
  const a = ambiente({ web: true, noFoco: api => api.trocar('B') }), p = a.clicar(); await a.quadro(); await p; a.janela.onload(); semEntrega(a);
});
caso('dois cliques no mesmo quadro iniciam apenas uma geração', async () => {
  const a = ambiente(), p = a.clicar(), q = a.clicar(); await a.quadro(); await Promise.all([p, q]); assert.equal(contar(a, 'imprimir'), 1); assert.equal(contar(a, 'compartilhar'), 1);
});
(async () => {
  let falhas = 0;
  for (const [nome, fn] of casos) { try { await fn(); console.log('PrismPDF OK ' + nome); } catch (e) { falhas++; console.error('PrismPDF FALHA ' + nome + ': ' + e.message); } }
  console.log(`PrismPDF ${casos.length - falhas}/${casos.length} grupos`); process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error('PrismPDF ' + e.message); process.exitCode = 1; });
