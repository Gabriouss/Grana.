/*
 * Nenhuma janela em que a sobra some sem aviso, nem conta duas vezes
 * (A3, A4 e A5 do parecer do Lynx, 22/11/2026), nem um X retido que não
 * existe mais (R1), nem a sobra editada contada duas vezes (R2).
 *
 *   node __tests__/sobra-janelas.cjs
 *
 * Hook, serviço, cache e cálculo REAIS, e as expressões REAIS das duas telas
 * (chamada do hook, estados do cartão do Livre, Saldo do mês e faixa). A lista
 * vem dos buscadores REAIS de lib/data.ts. Só React, rede, disco, fila e o
 * `load` em volta do buscador são dublês. Guarda CADA quadro: o que
 * importa é o valor enquanto muda, não só o final.
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = (c) => ts.transpileModule(c, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
class Relogio extends Date { constructor(...a) { super(...(a.length ? a : ['2026-11-22T12:00:00'])); } static now() { return new Relogio().getTime(); } }

let passou = 0, falhou = 0;
const ok = (c, nome) => { if (c) passou++; else { falhou++; console.error('  FALHA  ' + nome); } };

function lerTela(arquivo) {
  const ast = ts.createSourceFile(arquivo, ler(arquivo), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const r = { decl: new Map(), attrs: {}, faixa: null, textoDaFaixa: null };
  const texto = (n) => n.getText(ast);
  (function visitar(n) {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      if (ts.isCallExpression(n.initializer) && texto(n.initializer.expression) === 'useSobraDoMes') {
        r.saida = texto(n.name);
        r.opcoes = n.initializer.arguments[2] ? texto(n.initializer.arguments[2]) : '{}';
        r.nomes = n.name.elements.map((e) => texto(e.name));
      }
      if (!r.decl.has(texto(n.name))) r.decl.set(texto(n.name), texto(n.initializer));
    }
    if (ts.isJsxSelfClosingElement(n) && texto(n.tagName) === 'SafeToSpendCard') {
      for (const a of n.attributes.properties) if (a.initializer?.expression) r.attrs[texto(a.name)] = texto(a.initializer.expression);
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && !r.faixa && /^\(\s*<View style=\{styles\.offlineBanner\}/.test(texto(n.right))) {
      r.faixa = texto(n.left);
      (function achar(m) {
        if (ts.isJsxExpression(m) && m.expression && ts.isConditionalExpression(m.expression) && !r.textoDaFaixa) r.textoDaFaixa = texto(m.expression);
        ts.forEachChild(m, achar);
      })(n.right);
    }
    ts.forEachChild(n, visitar);
  })(ast);
  return r;
}
const INICIO = lerTela('app/(app)/index.tsx');
const LANC = lerTela('app/(app)/lancamentos.tsx');

const X = 266;
const salario = { id: 'sal', type: 'in', amount: 1000, category: 'Salário', occurred_on: '2026-11-05', wallet_id: 'p', created_at: '2026-11-05T12:00:00Z' };
const lancada = { id: 'tx', type: 'in', amount: X, category: 'Sobra do mês', occurred_on: '2026-11-01', wallet_id: 'p', created_at: '2026-11-07T12:00:00Z' };
const LEGADA = { valor: X, convertida: false, transaction_id: null };
const ANTES_DA_MIGRATION = { valor: X };
const CONVERTIDA = { valor: 0, convertida: true, transaction_id: 'tx' };

/* Uma tela montada: estado próprio de lista, carga com porta e quadros. */
function montar({ tela, linha = LEGADA, lista = [salario], noServidor = lista, rede = true, disco = new Map(), mes = 10 }) {
  const m = { linha, noServidor, rede, quadros: [], cargas: 0, transactions: [], loading: true, offline: false, foco: true, mes,
    portaSobra: null, portaLista: null, cargaFalha: false, erroNaSobra: null };
  /* Fila e falas de voz no disco, lidas pelos módulos REAIS (N1, 23/11/2026). */
  m.naFila = (amount) => disco.set('grana:queue:transactions-pendentes', JSON.stringify([{ localId: 'local-1', userId: 'u', criadoEm: '2026-11-07T12:00:00Z',
    input: { type: 'out', description: 'pendente', amount, category: 'Outros', color: '#fff', occurred_on: '2026-11-06', wallet_id: 'p' } }]));
  m.vozNaFila = (amount) => disco.set('grana:voz:operacao:u:v1', JSON.stringify({ requestId: 'v1', criadoEm: '2026-11-07T12:00:00Z',
    payload: { kind: 'transaction', type: 'out', description: 'fala', amount, category: 'Outros', color: '#fff', occurred_on: '2026-11-06', wallet_id: 'p' } }));
  const slots = [];
  let cursor = 0, efeitos = [], sujo = false, montado = false;
  const agendar = () => { if (!montado || sujo) return; sujo = true; queueMicrotask(() => { sujo = false; render(); }); };
  const mesmas = (a, b) => a && a.length === b.length && a.every((v, i) => v === b[i]);
  const React = {
    useState(v) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { v: typeof v === 'function' ? v() : v };
      return [slots[i].v, (n) => { const novo = typeof n === 'function' ? n(slots[i].v) : n; if (novo !== slots[i].v) { slots[i].v = novo; agendar(); } }];
    },
    useRef(v) { const i = cursor++; return (slots[i] ??= { current: v }); },
    useCallback(fn, deps) { const i = cursor++; if (!mesmas(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
  };
  function useFocusEffect(fn) {
    const i = cursor++;
    const s = (slots[i] ??= {});
    if (s.fn !== fn || s.foco !== m.foco) efeitos.push(() => { s.limpar?.(); s.fn = fn; s.foco = m.foco; s.limpar = m.foco ? fn() : null; });
  }
  const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
  const supabase = {
    from(tabela) {
      if (tabela === 'transactions') {
        const filtros = [];
        const q = { select: () => q, order: () => q, range: () => q,
          gte(c, v) { filtros.push((t) => t[c] >= v); return q; },
          lte(c, v) { filtros.push((t) => t[c] <= v); return q; },
          async then(res, rej) {
            await m.portaLista;
            const r = !m.rede ? semRede() : m.cargaFalha ? { data: null, error: { code: '42501', message: 'recusado' } }
              : { data: m.noServidor.filter((t) => filtros.every((f) => f(t))), error: null };
            return Promise.resolve(r).then(res, rej);
          } };
        return q;
      }
      const q = { select: () => q, eq: () => q, async maybeSingle() {
        await m.portaSobra;
        if (m.erroNaSobra) return { data: null, error: m.erroNaSobra };
        return m.rede ? { data: m.linha, error: null } : semRede();
      } };
      return q;
    },
    async rpc(nome, args) {
      if (!m.rede) return semRede();
      if (args.p_valor !== null || m.linha?.valor > 0) {
        m.linha = CONVERTIDA;
        m.noServidor = [...m.noServidor.filter((t) => t.id !== 'tx'), lancada];
      }
      return { data: { estado: 'convertida', mes: args.p_mes, transaction_id: 'tx' }, error: null };
    },
  };
  const stubs = {
    react: React, 'expo-router': { useFocusEffect },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async (k) => disco.get(k) ?? null, setItem: async (k, v) => { disco.set(k, v); },
      removeItem: async (k) => { disco.delete(k); }, getAllKeys: async () => [...disco.keys()], multiRemove: async () => {},
      multiGet: async (ks) => ks.map((k) => [k, disco.get(k) ?? null]),
    } },
    './supabase': { supabase }, './sessao-offline': { idDoUsuarioLocal: async () => 'u', sessaoEstaTravada: () => false },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  };
  /* Só do que lib/data.ts importa e a leitura da lista não usa. */
  const doData = {
    './creditLimitAlert': {}, './widgets-home-events': { notificarDadosDosWidgetsAlterados() {}, observarDadosDosWidgets: () => () => {} },
  };
  const modulos = new Map();
  function real(rel) {
    if (modulos.has(rel)) return modulos.get(rel);
    const exports = {}; modulos.set(rel, exports);
    vm.runInNewContext(js(ler(rel)), { exports, Date: Relogio, console: { error() {}, warn() {}, log() {} }, setTimeout: () => 0, clearTimeout() {},
      require(id) {
        if (rel === 'lib/data.ts' && id in doData) return doData[id];
        if (id in stubs) return stubs[id];
        if (id.startsWith('@/')) return real(id.slice(2) + '.ts');
        if (id.startsWith('.')) return real(path.posix.join(path.posix.dirname(rel), id + '.ts'));
        throw new Error('import não simulado: ' + id);
      } }, { filename: rel });
    return exports;
  }
  const { useSobraDoMes } = real('lib/use-sobra-do-mes.ts');
  const sobra = real('lib/sobra-do-mes.ts');
  const format = real('lib/format.ts');
  const financeiro = real('lib/safe-to-spend.ts');
  const credito = real('lib/creditoFaturas.ts');
  const { casaComBusca } = real('lib/filtro-compras.ts');
  const dados = real('lib/data.ts');

  let carga = 0;
  async function load() {
    const minha = ++carga; m.cargas++;
    try {
      const dois = String(m.mes + 1).padStart(2, '0');
      const lista = await (tela === 'inicio' ? dados.fetchTransactions()
        : dados.fetchTransactionsDoPeriodo(`2026-${dois}-01`, `2026-${dois}-${new Date(2026, m.mes + 1, 0).getDate()}`));
      if (minha !== carga) return;
      /* Como as telas: o que o buscador devolve vira a lista, venha do servidor ou do disco. */
      m.transactions = lista; m.offline = false;
    } catch {
      /* Como as telas: sem disco fica o que já havia, e a faixa acende. */
      if (minha !== carga) return;
      m.offline = true;
    }
    m.loading = false; render();
  }
  function ambiente() {
    return { ...sobra, ...format, ...financeiro, ...credito, casaComBusca, Date: Relogio, String, useMemo: (f) => f(), useState: (v) => [v], userId: 'u',
      loading: m.loading, transactions: m.transactions, loadRef: { current: load }, load,
      selectedYear: 2026, selectedMonth: m.mes, now: new Relogio(), wallets: [{ id: 'p', user_id: 'u', is_default: true, created_at: '2026-01-01' }],
      carteiraPrincipalId: 'p', activeWalletId: 'total', creditCards: [], goals: [], walletGoals: [], invoicePayments: [], modoCategoria: false,
      consultaCategoria: { resultado: null }, categoryFilter: null, search: '',
      carregandoFontesLivre: false, fontesLivreDisponiveis: true,
      offline: m.offline, pendingCount: 0, motivoOffline: m.offline ? 'sem-rede' : null,
      textoDaFaixaOffline: (motivo) => motivo ?? 'sem-rede',
    };
  }
  const avaliar = (codigo, env) => { const exports = {}; vm.runInNewContext(js(codigo), { ...env, exports }); return exports.r; };
  const fonte = tela === 'inicio' ? INICIO : LANC;
  function render() {
    montado = true; cursor = 0; efeitos = [];
    const env = ambiente();
    const antes = fonte.decl.has('vendoMesAtual') ? `const vendoMesAtual = ${fonte.decl.get('vendoMesAtual')};\n` : '';
    const opcoes = avaliar(`${antes}exports.r = (${fonte.opcoes});`, env);
    const r = useSobraDoMes('u', true, opcoes);
    m.resultado = r;
    const nomes = avaliar(`const ${fonte.saida} = resultado;\nexports.r = { ${fonte.nomes.join(',')} };`, { resultado: r });
    Object.assign(env, nomes);
    if (tela === 'inicio') {
      const s = avaliar(`exports.r = ${fonte.decl.get('safeToSpend')};`, env);
      m.quadros.push({ lido: !m.loading, saldo: s.saldoAtual, inclui: s.sobraConfirmada,
        oculto: !!avaliar(`exports.r = !!((${fonte.attrs.carregando}) || (${fonte.attrs.indisponivel}));`, env),
        indisponivel: !!avaliar(`exports.r = !!(${fonte.attrs.indisponivel});`, env) });
    } else {
      const nomesDecl = ['vendoMesAtual', 'walletTransactions', 'monthTransactions', 'transacoesDoResumo', '{ monthIn, monthOut }', 'mesSelecionado', 'sobraDoSaldo', 'monthBalance', 'avisoDaSobra'];
      const codigo = nomesDecl.filter((n) => fonte.decl.has(n)).map((n) => `const ${n} = ${fonte.decl.get(n)};`).join('\n');
      const v = avaliar(`${codigo}\nconst aviso = !!(${fonte.faixa});\nexports.r = { saldo: monthBalance, entradas: monthIn, aviso, texto: aviso ? (${fonte.textoDaFaixa}) : null };`, env);
      m.quadros.push({ lido: !m.loading, ...v });
    }
    for (const e of efeitos) e();
  }
  m.render = render;
  m.abrir = async () => { m.transactions = lista; m.loading = false; m.offline = !m.rede; render(); await tick(); };
  m.refocar = async () => { m.foco = false; render(); await tick(2); m.quadros.length = 0; m.foco = true; render(); await tick(); };
  m.ultimo = () => m.quadros.at(-1);
  m.load = load;
  return m;
}
const perto = (a, b) => Math.abs(a - b) < 0.005;
const semJanelaInicio = (m) => m.quadros.filter((q) => q.lido).every((q) => q.oculto || (perto(q.saldo, 1000 + X) && perto(q.inclui, X)));
const semJanelaLanc = (m) => m.quadros.filter((q) => q.lido).every((q) => perto(q.saldo, 1000 + X) || (q.aviso && perto(q.saldo, 1000)));
function porta() { let abrir; const p = new Promise((r) => { abrir = r; }); return { p, abrir }; }

(async () => {
  for (const [nome, antes] of [['antes da migration', ANTES_DA_MIGRATION], ['legada', LEGADA]]) {
    // A3: aberta com X, a migration ou outro aparelho converte, e o foco relê só a sobra.
    for (const falha of [false, true]) {
      const m = montar({ tela: 'inicio', linha: antes });
      if (antes === LEGADA) m.erroNaSobra = { code: '08006' }; // abre sem converter sozinho
      await m.abrir();
      if (antes === LEGADA) {
        /* Só a leitura: a conversão é de outro aparelho. */
        m.erroNaSobra = null; m.linha = ANTES_DA_MIGRATION;
        m.resultado.recarregar(); await tick();
      }
      m.linha = CONVERTIDA; m.noServidor = [salario, lancada];
      const p = porta(); m.portaLista = p.p; m.cargaFalha = falha;
      const cargas = m.cargas;
      await m.refocar();
      ok(semJanelaInicio(m), `A3 ${nome}, recarga em curso: nenhum quadro sem X`);
      ok(m.cargas === cargas + 1, `A3 ${nome}: o foco pede a lista uma vez (${m.cargas - cargas})`);
      p.abrir(); await tick();
      ok(semJanelaInicio(m) && m.quadros.length > 0, `A3 ${nome}, recarga ${falha ? 'falhou' : 'chegou'}: X uma vez em todos os quadros`);
      ok(!m.ultimo().oculto, `A3 ${nome}, recarga ${falha ? 'falhou' : 'chegou'}: termina com o valor na tela`);
    }
  }

  // A3: abriu agora, com a sobra nova e a lista velha (sem X conhecido).
  for (const falha of [false, true]) {
    const m = montar({ tela: 'inicio', linha: CONVERTIDA, lista: [salario], noServidor: [salario, lancada] });
    const p = porta(); m.portaLista = p.p; m.cargaFalha = falha;
    await m.abrir();
    ok(m.quadros.every((q) => q.oculto || perto(q.saldo, 1000 + X)), 'A3 sem X conhecido: confere em vez de mostrar sem a sobra');
    p.abrir(); await tick();
    const u = m.ultimo();
    if (falha) ok(u.indisponivel, 'A3 sem X conhecido e recarga falhou: Livre indisponível, com aviso');
    else ok(!u.oculto && perto(u.saldo, 1000 + X), 'A3 sem X conhecido: termina com X');
    ok(semJanelaInicio(m) && m.cargas === 1, `A3 sem X conhecido: sem janela e sem laço (${m.cargas} cargas)`);
  }

  // A3, ordem inversa: lista nova e sobra ainda legada (532 no núcleo).
  {
    const m = montar({ tela: 'inicio', linha: ANTES_DA_MIGRATION });
    await m.abrir(); m.quadros.length = 0;
    m.noServidor = [salario, lancada];
    await m.load(); await tick();
    ok(semJanelaInicio(m), 'A3 lista nova e sobra velha: X não conta duas vezes');
  }

  // A3: a Início converte.
  {
    const m = montar({ tela: 'inicio', linha: LEGADA });
    const p = porta(); m.portaLista = p.p;
    await m.abrir();
    ok(semJanelaInicio(m), 'A3 conversão na Início, lista a caminho: nenhum quadro sem X');
    p.abrir(); await tick();
    ok(semJanelaInicio(m) && !m.ultimo().oculto && m.transactions.some((t) => t.id === 'tx'), 'A3 conversão na Início: termina no lançamento, X uma vez');
  }

  // A3: confirmar na Início com a lista atrasada.
  {
    const m = montar({ tela: 'inicio', linha: null });
    await m.abrir();
    const p = porta(); m.portaLista = p.p; m.quadros.length = 0;
    await m.resultado.confirmar(X); await tick();
    ok(m.quadros.length > 0 && semJanelaInicio(m), 'A3 confirmar: até a lista chegar, confere em vez de mostrar sem X');
    p.abrir(); await tick();
    ok(!m.ultimo().oculto && perto(m.ultimo().saldo, 1000 + X) && m.cargas === 1, `A3 confirmar: termina com X e uma carga (${m.cargas})`);
  }

  // A3: apagado em outro aparelho pede a lista, e apagado aqui não trava o Livre.
  {
    const m = montar({ tela: 'inicio', linha: CONVERTIDA, lista: [salario, lancada] });
    await m.abrir();
    m.linha = { ...CONVERTIDA, transaction_id: null }; m.noServidor = [salario];
    await m.refocar();
    ok(m.cargas === 1 && perto(m.ultimo().saldo, 1000) && !m.ultimo().oculto, 'A3 apagado em outro aparelho: pede a lista e o X sai');
  }
  {
    const m = montar({ tela: 'inicio', linha: CONVERTIDA, lista: [salario, lancada] });
    await m.abrir(); m.noServidor = [salario];
    await m.load(); await tick();
    ok(m.cargas === 1 && perto(m.ultimo().saldo, 1000) && !m.ultimo().oculto, 'apagado aqui: o X sai sem "indisponível" e sem recarga extra');
  }
  {
    const m = montar({ tela: 'inicio', linha: CONVERTIDA, lista: [salario, lancada] });
    await m.abrir();
    ok(m.cargas === 0 && !m.ultimo().oculto && perto(m.ultimo().saldo, 1000 + X), 'estado normal: nenhuma carga a mais');
  }

  // A4: Lançamentos converte.
  for (const falha of [false, true]) {
    const m = montar({ tela: 'lancamentos', linha: LEGADA });
    const leitura = porta(); m.portaSobra = leitura.p;
    await m.abrir(); m.quadros.length = 0;
    const p = porta(); m.portaLista = p.p; m.cargaFalha = falha;
    leitura.abrir(); m.portaSobra = null; await tick();
    const comX = () => m.quadros.slice(m.quadros.findIndex((q) => perto(q.saldo, 1000 + X)));
    ok(m.cargas === 1, 'A4 converter em Lançamentos recarrega a lista');
    ok(m.quadros.some((q) => perto(q.saldo, 1000 + X)) && comX().every((q) => perto(q.saldo, 1000 + X)), 'A4 durante a conversão o Saldo não perde X');
    p.abrir(); await tick();
    ok(comX().every((q) => perto(q.saldo, 1000 + X)) && perto(m.ultimo().saldo, 1000 + X), `A4 recarga ${falha ? 'falhou' : 'chegou'}: X uma vez`);
    if (!falha) ok(perto(m.ultimo().entradas, 1000 + X), 'A4 termina com a sobra nas Entradas');
  }
  // A4: o foco relê a legada sem tirar X do Saldo.
  {
    const m = montar({ tela: 'lancamentos', linha: ANTES_DA_MIGRATION });
    await m.abrir();
    const p = porta(); m.portaSobra = p.p;
    await m.refocar();
    ok(m.quadros.length > 0 && semJanelaLanc(m), 'A4 releitura no foco: o Saldo mantém X');
    p.abrir(); await tick();
    ok(semJanelaLanc(m), 'A4 releitura concluída: X');
  }

  // A5: confirmar na Início e abrir Lançamentos sem rede.
  {
    const disco = new Map();
    const inicio = montar({ tela: 'inicio', linha: null, disco });
    await inicio.abrir();
    await inicio.resultado.confirmar(X); await tick();
    const m = montar({ tela: 'lancamentos', rede: false, disco, lista: [salario] });
    await m.abrir();
    ok(m.ultimo().aviso && m.ultimo().texto === 'sem-rede', 'A5 sem o ligado no cache: mostra "sem conexão"');
    ok(m.cargas <= 1, `A5 sem laço (${m.cargas})`);
    const com = montar({ tela: 'lancamentos', rede: false, disco, lista: [salario, lancada] });
    await com.abrir();
    ok(perto(com.ultimo().saldo, 1000 + X) && com.cargas === 0, 'A5 com o ligado no cache: X, sem recarga');
  }
  // A5: a faixa não depende só do cache da lista.
  for (const [erro, texto] of [[{ message: 'TypeError: Network request failed' }, 'sem-rede'], [{ code: '42501' }, 'falha']]) {
    const m = montar({ tela: 'lancamentos', linha: CONVERTIDA });
    m.erroNaSobra = erro;
    await m.abrir();
    ok(m.ultimo().aviso && m.ultimo().texto === texto, `A5 sobra não lida (${texto}): o Saldo avisa`);
  }
  {
    const m = montar({ tela: 'lancamentos', linha: CONVERTIDA, noServidor: [salario, lancada] });
    const p = porta(); m.portaLista = p.p;
    await m.abrir();
    ok(m.ultimo().aviso && m.ultimo().texto === 'lento', 'A5 lista mais velha que a sobra: "Atualização pendente" até chegar');
    p.abrir(); await tick();
    ok(!m.ultimo().aviso && perto(m.ultimo().saldo, 1000 + X), 'A5 lista chegou: X e sem aviso');
  }
  // R1: o X retido vale só até a lista voltar do servidor sem o lançamento.
  const semLigado = (m) => perto(m.ultimo().saldo, m.ultimo().entradas) && !m.ultimo().aviso;
  const comRetido = (m) => perto(m.ultimo().saldo, m.ultimo().entradas + X);
  const antesDeConverter = async (extra) => {
    const m = montar({ tela: 'lancamentos', linha: ANTES_DA_MIGRATION, ...extra });
    await m.abrir();
    await m.load(); await tick(); // o disco da lista fica com o que havia
    return m;
  };
  for (const [nome, extra] of [['com salário', {}], ['mês vazio', { lista: [] }]]) {
    const m = await antesDeConverter(extra);
    m.linha = CONVERTIDA; // convertida e movida para dezembro em outro aparelho
    const cargas = m.cargas;
    await m.refocar();
    ok(semLigado(m), `R1 movido, ${nome}: a primeira recarga com sucesso solta X`);
    for (let i = 0; i < 3; i++) { await m.refocar(); await m.load(); await tick(); }
    ok(semLigado(m) && m.cargas <= cargas + 7, `R1 movido, ${nome}: 3 focos depois segue sem X e sem laço (${m.cargas - cargas})`);
    m.rede = false; await m.load(); await tick();
    ok(perto(m.ultimo().saldo, m.ultimo().entradas), `R1 movido, ${nome}: lista do disco depois não ressuscita X`);
  }
  /* N1: mês sem outra linha no servidor e pendente preso na fila; a lista
     devolvida não tem linha do servidor nenhuma, e a origem precisa seguir. */
  for (const [nome, extra] of [['com salário', {}], ['mês vazio', { lista: [] }]]) {
    for (const [onde, por] of [['fila', (m) => m.naFila(5)], ['voz', (m) => m.vozNaFila(5)], ['fila e voz', (m) => { m.naFila(5); m.vozNaFila(0); }]]) {
      const m = await antesDeConverter(extra);
      por(m);
      m.linha = CONVERTIDA;
      await m.refocar();
      ok(perto(m.ultimo().saldo, m.ultimo().entradas - 5) && m.transactions.some((t) => t.id.startsWith('local-')),
        `R1 com pendente na ${onde}, ${nome}: a recarga com sucesso solta X (${m.ultimo().saldo})`);
    }
  }
  {
    const m = await antesDeConverter();
    m.linha = CONVERTIDA; m.cargaFalha = true;
    await m.refocar();
    ok(comRetido(m), 'R1 recarga com erro: X segue');
    m.cargaFalha = false;
    await m.refocar();
    ok(semLigado(m), 'R1 a tentativa seguinte, com sucesso: solta X');
  }
  {
    const m = await antesDeConverter();
    m.linha = CONVERTIDA;
    const p = porta(); m.portaLista = p.p;
    await m.refocar();
    m.rede = false; p.abrir(); await tick();
    ok(comRetido(m) && !m.offline, 'R1 recarga servida do disco não é sucesso: X segue');
    m.rede = true; await m.load(); await tick();
    ok(semLigado(m), 'R1 qualquer carga do servidor depois disso solta X');
  }
  {
    const m = await antesDeConverter();
    m.linha = CONVERTIDA;
    const p = porta(); m.portaLista = p.p;
    await m.refocar();
    const outra = m.load();
    p.abrir(); await outra; await tick();
    ok(semLigado(m), 'R1 recarga atropelada por outra carga: a que venceu solta X');
  }
  {
    const m = await antesDeConverter();
    const p = porta(); m.portaLista = p.p;
    const velha = m.load(); // saiu antes da conversão
    m.linha = CONVERTIDA; m.noServidor = [salario, lancada];
    await m.refocar();
    ok(semJanelaLanc(m), 'R1 carga anterior à conversão não solta X');
    p.abrir(); await velha; await tick();
    ok(semJanelaLanc(m) && perto(m.ultimo().entradas, 1000 + X), 'R1 carga anterior à conversão: termina no lançamento');
  }
  {
    const m = await antesDeConverter();
    m.linha = CONVERTIDA; m.cargaFalha = true;
    await m.refocar(); // pediu a recarga e falhou
    m.cargaFalha = false; m.mes = 9; m.render();
    await m.load(); await tick();
    const p = porta(); m.portaLista = p.p;
    m.mes = 10; m.render(); await tick();
    ok(comRetido(m), 'R1 a lista de outubro não solta o X de novembro');
    p.abrir(); await tick();
    ok(semLigado(m), 'R1 de volta a novembro: a recarga solta X');
  }
  {
    const m = montar({ tela: 'inicio', linha: ANTES_DA_MIGRATION });
    await m.abrir();
    m.linha = CONVERTIDA; // o ligado não existe na lista inteira do servidor
    await m.refocar();
    ok(m.ultimo().indisponivel && perto(m.ultimo().saldo, 1000), 'R1 Início: sem X fantasma, Livre avisa');
  }

  // R2: lista já com o lançamento editado e sobra ainda lida como legada.
  for (const tela of ['inicio', 'lancamentos']) {
    for (const valor of [80, 300]) {
      const m = montar({ tela, linha: ANTES_DA_MIGRATION });
      await m.abrir(); m.quadros.length = 0;
      m.noServidor = [salario, { ...lancada, amount: valor }];
      await m.load(); await tick();
      const umaVez = () => m.quadros.length > 0 && m.quadros.filter((q) => q.lido && !q.oculto).every((q) => perto(q.saldo, 1000 + valor));
      ok(umaVez() && !m.ultimo().oculto, `R2 ${tela}, editada para ${valor}: conta uma vez`);
      if (tela === 'inicio') ok(perto(m.ultimo().inclui, valor), `R2 Início, editada para ${valor}: "Inclui sobra" mostra o editado`);
      m.linha = CONVERTIDA;
      await m.refocar();
      ok(umaVez(), `R2 ${tela}, editada para ${valor}: depois de reler, igual`);
    }
  }
  for (const [nome, lista, saldo] of [
    ['dois no dia 1, um com o valor: casa pelo valor', [salario, { ...lancada, id: 'outro', amount: 40 }, lancada], 1000 + 40 + X],
    ['dois no dia 1, nenhum com o valor: não adivinha', [salario, { ...lancada, id: 'a', amount: 40 }, { ...lancada, id: 'b', amount: 50 }], 1000 + 90 + X],
    ['outro dia não casa', [salario, { ...lancada, amount: 80, occurred_on: '2026-11-09' }], 1000 + 80 + X],
    ['outra categoria não casa', [salario, { ...lancada, amount: 80, category: 'Outros' }], 1000 + 80 + X],
    ['saída não casa', [salario, { ...lancada, amount: 80, type: 'out' }], 1000 - 80 + X],
  ]) {
    const m = montar({ tela: 'lancamentos', linha: ANTES_DA_MIGRATION, lista });
    await m.abrir();
    ok(perto(m.ultimo().saldo, saldo), `R2 ${nome} (${m.ultimo().saldo})`);
  }
  {
    /* Lançamento manual na mesma categoria e dia: a conversão segue e os dois contam. */
    const manual = { ...lancada, id: 'manual', amount: 40 };
    const m = montar({ tela: 'lancamentos', linha: LEGADA, lista: [salario, manual] });
    await m.abrir();
    ok(perto(m.ultimo().saldo, 1000 + 40 + X) && m.linha === CONVERTIDA, 'R2 coincidência manual: converte e conta os dois');
  }

  // Casos legítimos não viram aviso.
  {
    const m = montar({ tela: 'lancamentos', linha: CONVERTIDA, lista: [salario], noServidor: [salario] });
    await m.abrir();
    ok(!m.ultimo().aviso && m.cargas === 1, 'movido para outro mês, lista atual: sem aviso e sem laço');
  }
  {
    const m = montar({ tela: 'lancamentos', linha: CONVERTIDA, mes: 9, lista: [] });
    await m.abrir();
    ok(!m.ultimo().aviso && m.cargas === 0, 'vendo outubro: a sobra de novembro não pede carga nem avisa');
  }

  // Widget: não publica o Livre sem o lançamento ligado.
  {
    let transactions = [salario];
    const publicados = [], api = {};
    vm.runInNewContext(js(ler('lib/widgets-home-sync.ts')), { exports: api, Date: Relogio, Promise, String, console: { error() {}, warn() {} },
      require: (id) => ({
        './data': { fetchTransactions: async () => transactions, fetchBills: async () => [], fetchCreditCards: async () => [], fetchCardInvoicePayments: async () => [] },
        './goals': { fetchGoals: async () => [] },
        './widgets-home-snapshot': { montarSnapshotWidgets: (e) => e },
        './sobra-do-mes': { buscarSobraDoMes: async () => ({ estado: 'confirmada', userId: 'u', mes: '2026-11', valor: 0, convertida: true, transactionId: 'tx' }), mesLocalDaSobra: () => '2026-11', sobraParaOLivre: () => 0 },
        '@/modules/grana-voice-widget': { widgetDisponivel: true, quantidadeInstalada: () => 1, atualizarSnapshot: (s) => publicados.push(s), garantirUsuario() {}, definirPrivacidade() {}, limparSnapshot() {} },
      })[id] ?? assert.fail('import ' + id) });
    ok(await api.sincronizarWidgetsHome('u', false) === false && !publicados.length, 'widget com sobra nova e lista velha: segura o snapshot');
    transactions = [salario, lancada];
    ok(await api.sincronizarWidgetsHome('u', false) === true && publicados.length === 1, 'widget com o ligado na lista: publica');
  }

  console.log(`sobra-janelas: ${passou} checagens ok, ${falhou} falhas`);
  if (falhou) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
