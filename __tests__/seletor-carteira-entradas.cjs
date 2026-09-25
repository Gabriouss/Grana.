/* Seletor de carteira mostra entradas, não saldo (regra 20, complemento de
 * 24/09/2026, item 4 da retomada de 25/09).
 *
 *   node __tests__/seletor-carteira-entradas.cjs
 *
 * `__tests__/entradas-por-carteira.cjs` já guarda o texto da RPC no banco;
 * este teste guarda o lado do CLIENTE, que era o que faltava (a RPC estava
 * aplicada em produção e sem nenhum chamador — `grep` deu zero em app/ e
 * components/ antes desta correção).
 *
 * Módulos REAIS: lib/wallets.ts, lib/data.ts, lib/fila-pendente.ts, com
 * banco e disco simulados. `calcularEntradasComAgregado`/
 * `calcularEntradasWallets` são funções puras e entram no mesmo sandbox só
 * porque `wallets.ts`/`data.ts` têm outros imports que precisam de dublê.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.equal(JSON.stringify(a), JSON.stringify(b), nome); passou++; };

const estado = { rede: true, usuario: 'u-1' };
const disco = new Map();
const AsyncStorage = {
  getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
  setItem: async (k, v) => { disco.set(k, v); },
  removeItem: async (k) => { disco.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  getAllKeys: async () => [...disco.keys()],
};
const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });

const banco = [];
function consulta() {
  const q = { filtros: [], insercao: null, upsert: false, unico: false };
  for (const m of ['select', 'order']) q[m] = () => q;
  q.eq = (c, v) => { q.filtros.push((t) => t[c] === v); return q; };
  q.gte = (c, v) => { q.filtros.push((t) => t[c] >= v); return q; };
  q.lt = (c, v) => { q.filtros.push((t) => t[c] < v); return q; };
  q.lte = (c, v) => { q.filtros.push((t) => t[c] <= v); return q; };
  q.or = () => q;
  q.insert = (linha) => { q.insercao = linha; return q; };
  q.upsert = (linha) => { q.insercao = linha; q.upsert = true; return q; };
  q.single = () => { q.unico = true; return q; };
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (!estado.rede) return semRede();
    if (q.insercao) {
      const k = q.insercao.client_request_id;
      if (q.upsert && k && banco.some((t) => t.user_id === q.insercao.user_id && t.client_request_id === k)) return { data: [], error: null };
      const linha = { id: `db-${banco.length + 1}`, created_at: new Date().toISOString(), ...q.insercao };
      banco.push(linha);
      return { data: q.upsert ? [linha] : linha, error: null };
    }
    const linhas = banco.filter((t) => q.filtros.every((f) => f(t)));
    if (q.unico) return linhas.length === 1 ? { data: linhas[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'não achei' } };
    return { data: linhas, error: null };
  }).then(res, rej);
  return q;
}

let linhasEntradas = [];
const supabase = {
  from: () => consulta(),
  rpc: async (fn) => {
    if (fn !== 'entradas_por_carteira') return semRede();
    return estado.rede ? { data: linhasEntradas, error: null } : semRede();
  },
};

const dubles = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
  './supabase': { supabase },
  './sessao-offline': { idDoUsuarioLocal: async () => estado.usuario },
  './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './goals': { createGoal: async () => {} },
  './recorrencia': {},
};
const cache = new Map();
function carregar(arquivo) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl,
    setTimeout, clearTimeout, __DEV__: false,
    require: (id) => {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) {
        const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregar(alvo);
      }
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

const wallets = carregar('lib/wallets.ts');
const data = carregar('lib/data.ts');
const fila = carregar('lib/offline-cache.ts');

const CARTEIRAS = [
  { id: 'w-principal', name: 'Principal', is_default: true, initial_balance: 500, color: '#1fa98d' },
  { id: 'w-viagem', name: 'Viagem', is_default: false, initial_balance: 1000, color: '#c66f8e' },
];

(async () => {
  /* ── calcularEntradasComAgregado: nunca soma initial_balance ─────────── */
  const semEntradas = wallets.calcularEntradasComAgregado(CARTEIRAS, []);
  igual(semEntradas, { porCarteira: { 'w-principal': 0, 'w-viagem': 0 }, total: 0 },
    'sem entrada nenhuma, tudo zero — nunca cai pro saldo inicial (500 + 1000)');

  const comEntradas = wallets.calcularEntradasComAgregado(CARTEIRAS, [
    { wallet_id: 'w-principal', entradas: 300 },
    { wallet_id: 'w-viagem', entradas: 700 },
    { wallet_id: null, entradas: 50 }, // sem carteira: vai pra padrão, como saldos_por_carteira já fazia
    { wallet_id: 'carteira-apagada', entradas: 20 }, // desconhecida: idem
  ]);
  igual(comEntradas.porCarteira, { 'w-principal': 370, 'w-viagem': 700 }, 'nulo e desconhecido caem na carteira padrão');
  igual(comEntradas.total, 1070, 'total é a soma bruta das entradas, sem descontar nada e sem somar saldo inicial');

  /* ── calcularEntradasWallets (modo de exemplo/sessão offline): só type=in, sem crédito ── */
  const TX = [
    { id: 't1', type: 'in', amount: 100, wallet_id: 'w-principal' },
    { id: 't2', type: 'out', amount: 999, wallet_id: 'w-principal' }, // saída: nunca desconta
    { id: 't3', type: 'in', amount: 50, wallet_id: 'w-viagem' },
    { id: 't4', type: 'in', amount: 40, wallet_id: null }, // sem carteira: vai pra padrão
    { id: 't5', type: 'in', amount: 9999, payment_method: 'credit', wallet_id: 'w-viagem' }, // estorno no cartão: fora
  ];
  const emMemoria = wallets.calcularEntradasWallets(CARTEIRAS, TX);
  igual(emMemoria.porCarteira, { 'w-principal': 140, 'w-viagem': 50 }, 'soma em memória bate com a regra da RPC');
  igual(emMemoria.total, 190, 'total em memória ignora saída e estorno no cartão, e nunca soma saldo inicial');

  /* ── fetchEntradasPorCarteira: RPC + fila offline, com rede ──────────── */
  linhasEntradas = [{ wallet_id: 'w-principal', entradas: 1000 }];
  const comRede = await data.fetchEntradasPorCarteira();
  igual(comRede, [{ wallet_id: 'w-principal', entradas: 1000 }], 'com rede: só a RPC, fila vazia');

  /* Uma entrada guardada sem rede entra na soma antes de sincronizar. */
  estado.rede = false;
  await fila.salvarOuGuardarNoAparelho({
    type: 'in', description: 'PIX recebido', amount: 250, category: 'Salário', color: '#fff',
    occurred_on: '2026-09-20', wallet_id: 'w-viagem',
  });
  /* Uma compra parcelada (sempre `out`) NÃO deveria contar como entrada nem
     aparecer aqui — a fila também guarda isso, e o merge tem que ignorar. */
  await fila.salvarOuGuardarParceladaNoAparelho({
    type: 'out', description: 'Notebook', amount: 300, category: 'Compras', color: '#fff',
    occurred_on: '2026-09-20', installments: 3, payment_method: 'credit', card_id: 'cartao-1',
  });
  estado.rede = true; // a leitura da RPC continua precisando de rede; só o queueing acima foi offline
  const comPendente = await data.fetchEntradasPorCarteira();
  ok(comPendente.some((l) => l.wallet_id === 'w-viagem' && l.entradas === 250), 'a entrada pendente entra na soma da carteira certa');
  igual(comPendente.filter((l) => l.wallet_id === 'w-viagem').length, 1, 'a compra parcelada (out) não vira uma linha de entrada');
  igual(comPendente.reduce((s, l) => s + l.entradas, 0), 1250, 'total com a RPC + o pendente');

  /* ── A tela: sem "Saldo inicial", sem chamar initial_balance ao criar/editar,
     com um rótulo que não diz "saldo" ao lado do valor ───────────────────── */
  const tela = fs.readFileSync(path.join(root, 'components/WalletPickerModal.tsx'), 'utf8');
  ok(!/Saldo inicial/i.test(tela), 'campo "Saldo inicial" saiu da tela');
  ok(!/\.initial_balance\b|initial_balance\s*:/.test(tela), 'a tela não lê nem escreve initial_balance nunca mais (só cita o nome em comentário, como explicação)');
  ok(tela.includes('entradas.total') && tela.includes('entradas.porCarteira'), 'a tela lê do novo `entradas`, não de `saldos`');
  ok(!/\bsaldos\./.test(tela), 'a tela não usa mais `saldos.*` (só `entradas.*`)');
  ok(/entradas no per[íi]odo/.test(tela), 'rótulo visível ao lado do valor, e não diz "saldo"');
  ok(!/>\s*Saldo\s*</i.test(tela), 'nenhum texto solto "Saldo" na tela');

  console.log(`seletor-carteira-entradas: ${passou} checagens OK`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
