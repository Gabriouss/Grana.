/* Saldos por carteira — a invariante que liga as duas visões da tela.
 *
 * O caso que originou este corpus (08/09/2026): o autor viu, no mesmo instante
 * e na mesma conta, o Expo Go mostrando "Total R$ 11.135,02 / Principal R$ 0,00"
 * enquanto o APK instalado mostrava os dois iguais. O banco estava íntegro —
 * 390 lançamentos, zero sem carteira, zero apontando para carteira inexistente
 * (conferido direto na produção).
 *
 * A causa era ordem de carregamento: `refreshSaldos` é disparado pelo efeito da
 * Início quando as TRANSAÇÕES chegam, e captura `wallets` no closure. Se a
 * busca de carteiras perde a corrida, roda com lista vazia — e aí o total soma
 * (é incondicional) enquanto nenhuma carteira recebe nada, porque a chave não
 * existe. O seletor cai no fallback `?? initial_balance` e mostra zero. No APK
 * a busca costuma ganhar a corrida; no bundle de desenvolvimento, mais lento,
 * perde. Mesmo banco, mesmo código, telas discordando.
 *
 * A regra que este arquivo protege: **o Total é sempre a soma das carteiras**.
 * Enquanto ela valer, é impossível a tela mostrar dinheiro num lugar e não no
 * outro, seja qual for a ordem em que os dados chegarem.
 *
 * Carregado pela receita da casa (ts.transpileModule + vm) porque
 * `lib/wallets.ts` importa `./supabase`, que puxa react-native e não roda em
 * Node puro — mesmo motivo e mesma técnica de `voz-offline.cjs`.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function carregar(file, deps) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports, require: (id) => { if (!(id in deps)) throw Error(id); return deps[id]; }, console }
  );
  return exports;
}

const { calcularSaldosComAgregado } = carregar('lib/wallets.ts', {
  /* `wallets.ts` passou a envolver os buscadores com o cache offline
     (10/09/2026). Aqui o dublê devolve a função crua: este corpus verifica a
     ARITMÉTICA do saldo, e o cache tem corpus próprio em
     `__tests__/cache-offline.cjs`. */
  './cache-de-tela': { comCacheOffline: (_nome, buscar) => buscar },
  './supabase': { supabase: {} },
  // Este corpus só exercita a aritmética; a identificação local tem corpus próprio.
  './sessao-offline': { idDoUsuarioLocal: async () => null },
  '@react-native-async-storage/async-storage': { __esModule: true, default: {} },
  './demo-data': { DEMO_WALLETS: [] },
  './format': { isCreditTx: (t) => t.payment_method === 'credit' },
});

let total = 0;
let falhas = 0;
function checar(nome, condicao, detalhe = '') {
  total++;
  if (condicao) return;
  falhas++;
  console.error('FALHOU  ' + nome + (detalhe ? ' — ' + detalhe : ''));
}

const carteira = (id, nome, padrao, inicial = 0) =>
  ({ id, name: nome, is_default: padrao, initial_balance: inicial });

const PRINCIPAL = 'w-principal';
const CASAMENTO = 'w-casamento';
const APAGADA = 'w-que-nao-existe-mais';
const soma = (r) => Object.values(r.porCarteira).reduce((a, b) => a + b, 0);

/* ── O caso real relatado ────────────────────────────────────────────────── */
{
  const r = calcularSaldosComAgregado(
    [carteira(PRINCIPAL, 'Principal', true)],
    [{ wallet_id: PRINCIPAL, delta: 11135.02 }]
  );
  checar('conta real: Principal recebe o valor', r.porCarteira[PRINCIPAL] === 11135.02, String(r.porCarteira[PRINCIPAL]));
  checar('conta real: Total bate com a carteira', r.total === 11135.02, String(r.total));
}

/* ── `wallet_id` nulo vai para a padrão (comportamento antigo, preservado) ── */
{
  const wallets = [carteira(PRINCIPAL, 'Principal', true), carteira(CASAMENTO, 'Casamento', false)];
  const r = calcularSaldosComAgregado(wallets, [{ wallet_id: null, delta: 500 }]);
  checar('sem carteira vai para a padrão', r.porCarteira[PRINCIPAL] === 500);
  checar('sem carteira não vaza para outra', r.porCarteira[CASAMENTO] === 0);
  checar('sem carteira: Total = soma', r.total === soma(r), `${r.total} vs ${soma(r)}`);
}

/* ── Carteira apagada não pode sumir do rateio ───────────────────────────── */
{
  const r = calcularSaldosComAgregado(
    [carteira(PRINCIPAL, 'Principal', true)],
    [{ wallet_id: PRINCIPAL, delta: 100 }, { wallet_id: APAGADA, delta: 250 }]
  );
  checar('carteira desconhecida cai na padrão em vez de evaporar', r.porCarteira[PRINCIPAL] === 350, String(r.porCarteira[PRINCIPAL]));
  checar('carteira desconhecida: Total = soma', r.total === soma(r), `${r.total} vs ${soma(r)}`);
}

/* ── A invariante, em cenários variados ──────────────────────────────────── */
{
  const wallets = [carteira(PRINCIPAL, 'Principal', true, 40), carteira(CASAMENTO, 'Casamento', false, 10)];
  const cenarios = [
    ['vazio', []],
    ['só nulo', [{ wallet_id: null, delta: 30 }]],
    ['mistura', [
      { wallet_id: PRINCIPAL, delta: 70 },
      { wallet_id: CASAMENTO, delta: -20 },
      { wallet_id: null, delta: 5 },
      { wallet_id: APAGADA, delta: 15 },
    ]],
    ['saldo negativo', [{ wallet_id: CASAMENTO, delta: -999.99 }]],
  ];
  for (const [nome, agregado] of cenarios) {
    const r = calcularSaldosComAgregado(wallets, agregado);
    checar(`invariante Total = soma das carteiras (${nome})`, Math.abs(r.total - soma(r)) < 0.005, `${r.total} vs ${soma(r)}`);
  }
}

/* ── Lista vazia: o estado exato que produzia o zero na tela ───────────────
   A função não tem como distribuir nada aqui, e é por isso que o CHAMADOR
   (`refreshSaldos`, lib/wallet-context.tsx) sai cedo quando `wallets` está
   vazio em vez de publicar este resultado. O caso fica registrado para deixar
   claro o que aconteceria sem aquela guarda. */
{
  const r = calcularSaldosComAgregado([], [{ wallet_id: PRINCIPAL, delta: 11135.02 }]);
  checar('sem carteiras carregadas, nenhuma carteira recebe', Object.keys(r.porCarteira).length === 0);
  checar('sem carteiras carregadas, o total ainda soma', r.total === 11135.02, String(r.total));
  checar('e é por isso que refreshSaldos precisa sair cedo', r.total !== soma(r), 'se passarem a bater, a guarda do contexto pode ser revista');
}

console.log(`\n${total - falhas}/${total} checagens de saldo por carteira passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
