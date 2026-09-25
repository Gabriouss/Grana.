/* Exercita o WalletProvider real, compilado em memória, para proteger a
 * corrida de autenticação que o Expo Go revelou. O teste observa a chamada
 * à RPC: não basta conferir um saldo calculado por uma reimplementação. */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const file = 'lib/wallet-context.tsx';
const moduleExports = {};
let valorDoContexto = null;
let stateHook = () => { throw new Error('stateHook não preparado'); };
const react = {
  createContext() {
    const contexto = {};
    contexto.Provider = (props) => { valorDoContexto = props.value; return props.children; };
    return contexto;
  },
  createElement(tipo, props, ...children) {
    return typeof tipo === 'function' ? tipo({ ...props, children: children.length === 1 ? children[0] : children }) : null;
  },
  useCallback: (fn) => fn,
  useContext: () => null,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useState: (...args) => stateHook(...args),
};

let auth = { session: null, isLoading: true, sessaoNaoConfirmada: false };
let chamadasRpc = 0;
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText, {
  exports: moduleExports,
  console,
  React: react,
  require: (id) => ({
    react: { __esModule: true, default: react, ...react },
    './auth-context': { useSession: () => auth },
    './demo-context': { useDemo: () => ({ isDemoMode: false }) },
    './demo-data': { DEMO_WALLETS: [] },
    './wallets': {
      fetchWallets: async () => [],
      calcularSaldosWallets: () => ({ porCarteira: {}, total: 0 }),
      calcularSaldosComAgregado: () => ({ porCarteira: { principal: 10 }, total: 10 }),
      calcularEntradasWallets: () => ({ porCarteira: {}, total: 0 }),
      calcularEntradasComAgregado: () => ({ porCarteira: { principal: 5 }, total: 5 }),
    },
    './data': {
      fetchTransactions: async () => [],
      fetchSaldosPorCarteira: async () => { chamadasRpc++; return [{ wallet_id: 'principal', delta: 10 }]; },
      fetchEntradasPorCarteira: async () => [{ wallet_id: 'principal', entradas: 5 }],
    },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async () => null,
      setItem: async () => {},
    } },
  }[id]),
});

const WalletProvider = moduleExports.WalletProvider;
const carteira = { id: 'principal', name: 'Principal', is_default: true, initial_balance: 0 };
function render() {
  valorDoContexto = null;
  const valores = [
    [[carteira], () => {}],
    ['total', () => {}],
    [false, () => {}],
    [{ porCarteira: {}, total: 0 }, () => {}],
    /* `entradas` (regra 20, seletor de carteira): mesmo par saldos/entradas
       de WalletProvider, useState declarado logo depois de `saldos`. */
    [{ porCarteira: {}, total: 0 }, () => {}],
  ];
  stateHook = () => valores.shift();
  WalletProvider({ children: null });
  assert.ok(valorDoContexto, 'o provider real foi montado');
  return valorDoContexto;
}

(async () => {
  auth = { session: null, isLoading: true, sessaoNaoConfirmada: false };
  await render().refreshSaldos();
  assert.equal(chamadasRpc, 0, 'não chama a RPC enquanto a sessão carrega');

  auth = { session: null, isLoading: false, sessaoNaoConfirmada: false };
  await render().refreshSaldos();
  assert.equal(chamadasRpc, 0, 'não chama a RPC sem sessão');

  auth = { session: { user: { id: 'u1' } }, isLoading: false, sessaoNaoConfirmada: true };
  await render().refreshSaldos();
  assert.equal(chamadasRpc, 0, 'não chama a RPC com sessão offline não confirmada');

  auth = { session: { user: { id: 'u1' } }, isLoading: false, sessaoNaoConfirmada: false };
  await render().refreshSaldos();
  assert.equal(chamadasRpc, 1, 'chama a RPC somente com JWT confirmado');
  console.log('OK: WalletProvider aguarda autenticação e bloqueia saldos em sessão não confirmada.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
