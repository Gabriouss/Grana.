// Item 51 (autor, 20/11/2026): "No saldo do mês em lançamentos no débito, precisa
// entrar automaticamente o saldo que foi passado do mês anterior para o mês
// presente." Saldo do mês = sobra confirmada + entradas − saídas, com a MESMA
// sobra do Livre (sobraParaOLivre), nas visões de carteira de 08/11.
// Offline (Supremo, 20/11): nunca travessão; sobra confirmada guardada no
// aparelho vale; sem ela, entradas − saídas e "Sobra de <mês> indisponível sem conexão".
// Só Lançamentos lê a sobra guardada: o Livre da Início offline segue
// indisponível como hoje (Supremo, 20/11 ~20:45).
// Expressões REAIS de app/(app)/lancamentos.tsx e app/(app)/index.tsx; hook e
// módulos reais de lib/. ITEM51_RAIZ troca a origem das fontes do item (RED na base).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar, root } = require('./_carregar-ts.cjs');
const raiz = process.env.ITEM51_RAIZ || root;
const fonteDe = (f) => fs.existsSync(path.join(raiz, f)) ? path.join(raiz, f) : path.join(root, f);
const ler = (f) => fs.readFileSync(fonteDe(f), 'utf8');
const transpilar = (codigo) => ts.transpileModule(codigo, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;

/* Relógio fixo em 20/11/2026 e fronteiras (React, rede, disco) simuladas; o
   resto é o código do app. */
class Relogio extends Date { constructor(...a) { super(...(a.length ? a : ['2026-11-20T15:00:00'])); } static now() { return new Relogio().getTime(); } }
const cenario = { resposta: async () => ({ data: null, error: null }), disco: new Map() };
const consulta = { select: () => consulta, eq: () => consulta, maybeSingle: () => cenario.resposta() };
let hookSlots = [], hookCursor = 0, hookEfeito = null;
const stubs = {
  react: {
    useState(v) { const i = hookCursor++; if (!(i in hookSlots)) hookSlots[i] = typeof v === 'function' ? v() : v;
      return [hookSlots[i], (n) => { hookSlots[i] = typeof n === 'function' ? n(hookSlots[i]) : n; }]; },
    useRef(v) { const i = hookCursor++; return hookSlots[i] ??= { current: v }; }, useCallback: (f) => f,
  },
  'expo-router': { useFocusEffect(fn) { hookEfeito ??= fn; } },
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  '@react-native-async-storage/async-storage': { __esModule: true, default: {
    getItem: async (k) => cenario.disco.get(k) ?? null, setItem: async (k, v) => { cenario.disco.set(k, v); },
    removeItem: async (k) => { cenario.disco.delete(k); }, getAllKeys: async () => [...cenario.disco.keys()],
    multiRemove: async (ks) => ks.forEach((k) => cenario.disco.delete(k)),
  } },
  './supabase': { supabase: { from: () => consulta } },
  './sessao-offline': { idDoUsuarioLocal: async () => 'u', sessaoEstaTravada: () => false },
};
const modulos = new Map();
function real(rel) {
  const arquivo = fonteDe(rel);
  if (modulos.has(arquivo)) return modulos.get(arquivo);
  const exports = {}; modulos.set(arquivo, exports);
  vm.runInNewContext(transpilar(fs.readFileSync(arquivo, 'utf8')), { exports, Date: Relogio, console: { error() {}, warn() {}, log() {} },
    setTimeout: () => 0, clearTimeout() {}, Promise, JSON, Number, String, Math, Error, Set, Map, Array, Object, RegExp, Intl,
    require: (id) => {
      if (id in stubs) return stubs[id];
      if (id.startsWith('.')) return real(path.posix.join(path.posix.dirname(rel), id + '.ts'));
      throw new Error('import não simulado: ' + id);
    } }, { filename: arquivo });
  return exports;
}
const sobra = real('lib/sobra-do-mes.ts');
const { useSobraDoMes } = real('lib/use-sobra-do-mes.ts');
const format = carregar('lib/format.ts');
const filtro = carregar('lib/filtro-compras.ts');
const credito = carregar('lib/creditoFaturas.ts');
const financeiro = carregar('lib/safe-to-spend.ts');

function declaracoes(arquivo) {
  const fonte = ler(arquivo);
  const ast = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const mapa = new Map();
  let chamadaDoHook = null, indisponivel = null;
  (function visitar(n) {
    if (ts.isVariableDeclaration(n) && n.initializer && !mapa.has(n.name.getText(ast))) mapa.set(n.name.getText(ast), n.initializer.getText(ast));
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useSobraDoMes') chamadaDoHook = n.arguments.map((a) => a.getText(ast));
    if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'SafeToSpendCard') {
      indisponivel = n.attributes.properties.find((a) => a.name?.getText(ast) === 'indisponivel')?.initializer.expression.getText(ast);
    }
    ts.forEachChild(n, visitar);
  })(ast);
  return { fonte, mapa, chamadaDoHook, indisponivel };
}
function avaliar(decl, nomes, saida, env) {
  const codigo = nomes.filter((n) => decl.mapa.has(n)).map((n) => `const ${n} = ${decl.mapa.get(n)};`).join('\n') + `\nexports.r = ${saida};`;
  const exports = {};
  vm.runInNewContext(transpilar(codigo), { ...env, exports });
  return exports.r;
}
const lanc = declaracoes('app/(app)/lancamentos.tsx');
const inic = declaracoes('app/(app)/index.tsx');

const principal = { id: 'p', user_id: 'u', name: 'Principal', is_default: true, created_at: '2026-01-01' };
const outra = { id: 'o', user_id: 'u', name: 'Reserva', is_default: false, created_at: '2026-02-01' };
const wallets = [outra, principal];
let id = 0;
const tx = (type, amount, wallet_id, extra = {}) => ({ id: String(++id), user_id: 'u', type, amount, wallet_id, category: 'Outros',
  description: 'AUDIT', occurred_on: '2026-11-05', created_at: '2026-11-05T12:00:00Z', ...extra });
const transactions = [
  tx('in', 2002.23, 'p'), tx('out', 2113.78, 'p', { occurred_on: '2026-11-10' }), tx('in', 50, null, { occurred_on: '2026-11-03' }),
  tx('in', 70, 'o'), tx('out', 10, 'o'),
  tx('out', 500, 'p', { payment_method: 'credit', card_id: 'c' }), tx('in', 999, 'p', { occurred_on: '2026-10-28' }),
];
const cards = [{ id: 'c', wallet_id: 'p', name: 'Cartão AUDIT', closing_day: 20, due_day: 27, limit_amount: 1000 }];
const confirmada = { userId: 'u', mes: '2026-11', estado: 'confirmada', valor: 266.31 };
const pendente = { userId: 'u', mes: '2026-11', estado: 'pendente' };

function lancamentos(activeWalletId, extras = {}) {
  const env = { ...sobra, ...format, ...filtro, String, useMemo: (f) => f(), wallets, userId: 'u', activeWalletId, transactions,
    modoCategoria: false, consultaCategoria: { resultado: null }, categoryFilter: null, search: '', selectedYear: 2026, selectedMonth: 10,
    sobraDoMes: confirmada, carregandoSobra: false, erroSobra: false, sobraSemConexao: false, hojeDaSobra: '2026-11-20', sobraForaDaLista: null, offline: false, ...extras };
  const r = avaliar(lanc, ['carteiraPrincipalId', 'walletTransactions', 'monthTransactions', 'transacoesDoResumo', '{ monthIn, monthOut }',
    'mesSelecionado', 'sobraDoSaldo', 'monthBalance'], '{ monthIn, monthOut, monthBalance, walletTransactions, sobraDoSaldo: typeof sobraDoSaldo === "undefined" ? undefined : sobraDoSaldo }', env);
  r.sobra = r.sobraDoSaldo?.valor ?? 0; r.situacao = r.sobraDoSaldo?.situacao;
  return r;
}
function livre(activeWalletId, sobraDoMes = confirmada) {
  const env = { ...sobra, ...credito, ...financeiro, ...format, Date, useMemo: (f) => f(), wallets, userId: 'u', activeWalletId, transactions,
    creditCards: cards, goals: [], bills: [], invoicePayments: [], sobraDoMes, hojeDaSobra: '2026-11-20' };
  return avaliar(inic, ['carteiraPrincipalId', 'walletGoals', 'safeToSpend'], 'safeToSpend', env);
}
/* Abre o hook real numa "tela" nova, com o disco e a rede do cenário. */
async function abrirHook(opcoes = { usarCacheOffline: true }) {
  hookSlots = []; hookEfeito = null;
  const render = () => { hookCursor = 0; return useSobraDoMes('u', true, opcoes); };
  render(); hookEfeito();
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  return render();
}
const doHook = (h) => ({ sobraDoMes: h.sobraDoMes, carregandoSobra: h.carregando, erroSobra: h.erro, sobraSemConexao: h.semConexao });
const c = (v) => Math.round(v * 100);
let checks = 0;
const igual = (real, esperado, nome) => { assert.equal(real, esperado, nome); checks++; };

async function main() {
  // 1. Sem sobra: nada muda (entradas − saídas de caixa do mês, sem crédito e sem outubro).
  igual(c(lancamentos('total', { sobraDoMes: pendente }).monthBalance), -155, 'sobra 0: Saldo do mês = entradas − saídas');
  // 2. Com sobra confirmada: entra uma vez, na Principal e no Total; outra carteira não.
  const total = lancamentos('total'), p = lancamentos('p'), o = lancamentos('o');
  igual(c(total.monthBalance), 26476, 'sobra > 0: Total = sobra + entradas − saídas (266,31 − 1,55)');
  igual(c(p.monthBalance), 20476, 'Principal recebe a sobra e o legado sem carteira');
  igual(c(o.monthBalance), 6000, 'outra carteira só com os próprios lançamentos, sem sobra');
  igual(c(total.monthBalance), c(p.monthBalance) + c(o.monthBalance), 'Total = Principal + outra: sobra contada uma vez');
  igual(total.situacao, 'inclui', 'Total mostra a linha "Inclui sobra"'); igual(o.situacao, 'nenhuma', 'outra carteira sem linha');
  // 3. Paridade com o Livre: mesmo valor de sobra e o mesmo saldo do "Saldo atual".
  for (const [carteira, r] of [['total', total], ['p', p], ['o', o]]) {
    const l = livre(carteira);
    igual(c(r.sobra), c(l.sobraConfirmada), `paridade da sobra Livre x Lançamentos (${carteira})`);
    igual(c(r.monthBalance), c(l.saldoAtual), `Saldo do mês = Saldo atual (${carteira})`);
  }
  igual(c(lancamentos('total', { sobraDoMes: pendente }).monthBalance), c(livre('total', pendente).saldoAtual), 'paridade com sobra 0');
  // 4. A sobra não é lançamento: fora da lista e do total de Entradas.
  igual(c(total.monthIn), c(lancamentos('total', { sobraDoMes: pendente }).monthIn), 'Entradas não somam a sobra');
  igual(total.walletTransactions.length, lancamentos('total', { sobraDoMes: pendente }).walletTransactions.length, 'lista não ganha linha de sobra');
  // 5. Fora do mês da sobra, com busca ou categoria, ou de outro dono: sem sobra.
  igual(c(lancamentos('total', { selectedMonth: 9 }).monthBalance), 99900, 'mês passado não recebe a sobra de novembro');
  igual(c(lancamentos('total', { search: 'AUDIT' }).sobra), 0, 'com busca o resumo soma só o visível');
  igual(c(lancamentos('total', { categoryFilter: 'Outros' }).sobra), 0, 'com categoria o resumo soma só o visível');
  igual(c(lancamentos('total', { sobraDoMes: { ...confirmada, userId: 'x' } }).monthBalance), -155, 'sobra de outra conta não entra');
  // 6. Nunca travessão por causa da sobra: carregando, erro sem rede, erro permanente.
  igual(c(lancamentos('total', { sobraDoMes: null, carregandoSobra: true }).monthBalance), -155, 'carregando: entradas − saídas, sem linha');
  const semRede = lancamentos('p', { sobraDoMes: null, erroSobra: true, sobraSemConexao: true });
  igual(c(semRede.monthBalance), -6155, 'sem rede e sem valor: entradas − saídas');
  igual(semRede.situacao, 'sem-conexao', 'sem rede: linha "indisponível sem conexão"');
  igual(lancamentos('total', { sobraDoMes: null, erroSobra: true }).situacao, 'indisponivel', 'erro permanente: linha "indisponível agora"');
  igual(lancamentos('o', { sobraDoMes: null, erroSobra: true, sobraSemConexao: true }).situacao, 'nenhuma', 'carteira sem sobra não fala de sobra');
  // 7. Hook real: sobra confirmada fica no aparelho e serve sem rede.
  cenario.disco = new Map(); cenario.resposta = async () => ({ data: { valor: 266.31 }, error: null });
  const online = await abrirHook();
  igual(online.sobraDoMes?.estado, 'confirmada', 'online: confirmada do servidor');
  igual([...cenario.disco.keys()].some((k) => k.includes('sobra-do-mes')), true, 'online: confirmada guardada no aparelho');
  cenario.resposta = async () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
  const offline = await abrirHook();
  igual(offline.erro, false, 'sem rede com cache: sem erro'); igual(offline.semConexao, true, 'sem rede com cache: marcado sem conexão');
  const comCache = lancamentos('total', doHook(offline));
  igual(c(comCache.monthBalance), 26476, 'sem rede com cache: Saldo do mês igual ao online');
  igual(comCache.situacao, 'inclui', 'sem rede com cache: linha "Inclui sobra"');
  // 7b. Mesmo disco e mesma falha de rede, pelo caminho REAL da Início: o Livre segue indisponível.
  /* 21/11/2026: a Início passa `aoLancar` (recarrega a lista quando a sobra vira
     lançamento); o que importa aqui continua sendo NÃO pedir o cache offline. */
  igual(!inic.chamadaDoHook?.[2] || !/usarCacheOffline/.test(inic.chamadaDoHook[2]), true, 'Início chama o hook sem usarCacheOffline');
  assert.ok(lanc.chamadaDoHook?.some((a) => /usarCacheOffline:\s*true/.test(a)), 'Lançamentos pede a sobra guardada'); checks++;
  const inicioOffline = await abrirHook(inic.chamadaDoHook[2]
    ? vm.runInNewContext(`(${inic.chamadaDoHook[2]})`, { loading: false, transactions, loadRef: { current: null } }) : {});
  igual(inicioOffline.erro, true, 'Início offline com sobra guardada: erro, como hoje');
  igual(vm.runInNewContext(inic.indisponivel, { fontesLivreDisponiveis: true, erroSobra: inicioOffline.erro, sobraForaDaLista: inicioOffline.sobraForaDaLista }), true,
    'Livre da Início offline continua indisponível mesmo com sobra guardada');
  // 8. Hook real: sem cache, cache de outro mês, ou erro que não é de rede.
  cenario.disco = new Map();
  const vazio = await abrirHook();
  igual(vazio.erro, true, 'sem rede sem cache: erro'); igual(vazio.semConexao, true, 'sem rede sem cache: sem conexão');
  const semCache = lancamentos('total', doHook(vazio));
  igual(c(semCache.monthBalance), -155, 'sem rede sem cache: entradas − saídas, sem travessão');
  igual(semCache.situacao, 'sem-conexao', 'sem rede sem cache: linha "indisponível sem conexão"');
  cenario.disco = new Map([['grana:cache:tela:sobra-do-mes', JSON.stringify({ userId: 'u', guardadoEm: '2026-10-20T00:00:00Z',
    dados: { ...confirmada, mes: '2026-10' } })]]);
  igual((await abrirHook()).erro, true, 'cache de outubro não vale em novembro');
  /* T7 (21/11/2026): a chave v1 guardava `valor X` do modelo antigo. Sem rede,
     ela somaria X por fora além do lançamento; a chave v2 a ignora. */
  cenario.disco = new Map([['grana:cache:tela:sobra-do-mes', JSON.stringify({ userId: 'u', guardadoEm: '2026-11-19T00:00:00Z', dados: confirmada })]]);
  const soV1 = await abrirHook();
  igual(soV1.erro, true, 'T7 cache v1 (modelo antigo) é ignorado sem rede');
  igual(lancamentos('total', doHook(soV1)).situacao, 'sem-conexao', 'T7 cache v1 não soma a sobra por fora');
  cenario.disco = new Map([['grana:cache:tela:sobra-do-mes', JSON.stringify({ userId: 'u', guardadoEm: '2026-11-19T00:00:00Z', dados: confirmada })]]);
  cenario.resposta = async () => ({ data: null, error: { code: '42501', message: 'permission denied for table sobra_do_mes' } });
  const permanente = await abrirHook();
  igual(permanente.erro, true, 'erro permanente não vira cache (regra 9)'); igual(permanente.semConexao, false, 'erro permanente não é falta de rede');
  // 9. Texto: rótulo do resumo e linhas da sobra.
  assert.match(lanc.fonte, />Saldo do mês</, 'resumo de Lançamentos chama "Saldo do mês"'); checks++;
  igual(financeiro.rotuloDaSobraIncluida('2026-11'), 'Inclui sobra de outubro', 'rótulo usa o mês anterior');
  igual(financeiro.rotuloDaSobraIncluida('2026-01'), 'Inclui sobra de dezembro', 'janeiro mostra dezembro');
  igual(financeiro.rotuloDaSobraIndisponivel('2026-11', true), 'Sobra de outubro indisponível sem conexão', 'texto sem conexão');
  igual(financeiro.rotuloDaSobraIndisponivel('2026-11', false), 'Sobra de outubro indisponível agora', 'texto erro permanente');
  console.log(`${checks} checagens do Saldo do mês com sobra (item 51) passaram - 0 falhas`);
}
main().catch((e) => { console.error(e); process.exit(1); });
