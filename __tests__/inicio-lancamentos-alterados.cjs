/*
 * "Últimos lançamentos" da Início acompanha o que foi gravado em outra tela
 * (achado T2 do Sentinel, 23/09/2026).
 *
 *   node __tests__/inicio-lancamentos-alterados.cjs
 *
 * A Início, no foco, roda só a carga leve, que não busca lançamentos. Salvar
 * pelo "+" (formulário em Lançamentos, volta à Início) mudava o saldo e
 * deixava a lista sem o item. Agora quem grava em `transactions` marca
 * `lib/lancamentos-alterados` e a Início faz a carga completa no foco quando a
 * versão mudou.
 *
 *  1. Camada de dados real (`lib/data.ts`): as seis gravações de lançamento
 *     marcam depois do sucesso, e NÃO marcam quando o banco recusa.
 *  2. Fila offline real (`lib/offline-cache.ts`): a sincronização marca quando
 *     subiu algo, e não marca quando nada subiu.
 *  3. Início (`app/(app)/index.tsx`, guarda de fonte): o foco só usa a carga
 *     leve com a versão igual à da última carga completa, e a versão é lida
 *     ANTES da busca.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

function carregar(arquivo, dubles = {}, cache = new Map()) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map,
    setTimeout, clearTimeout,
    require: (id) => {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) {
        const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregar(alvo, dubles, cache);
      }
      throw new Error('import nao simulado em ' + arquivo + ': ' + id);
    },
  }, { filename: arquivo });
  return exports;
}

/* O contador real, compartilhado pelos módulos carregados abaixo. */
const alterados = carregar('lib/lancamentos-alterados.ts');

/* ── 1. Camada de dados ─────────────────────────────────────────────────── */
async function camadaDeDados() {
  console.log('\nCamada de dados');
  let resposta = { data: { id: 'novo' }, error: null };
  const q = {};
  for (const m of ['insert', 'update', 'upsert', 'delete', 'select', 'single', 'eq', 'gt', 'or']) q[m] = () => q;
  q.then = (resolve) => resolve(resposta);
  const supabase = {
    from: () => q,
    rpc: async () => resposta,
  };
  const data = carregar('lib/data.ts', {
    './supabase': { supabase },
    './lancamentos-alterados': alterados,
    './cache-de-tela': { comCacheOffline: (_n, buscar) => buscar },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './paginacao': { buscarTodasAsPaginas: async () => [] },
    './types': { CATEGORIES: [] },
    './recorrencia': {},
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
  });

  const base = { type: 'out', description: 'AUDIT', amount: 7.77, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-23' };
  const gravacoes = {
    addTransaction: () => data.addTransaction(base),
    addTransactionsBatch: () => data.addTransactionsBatch([base]),
    updateTransaction: () => data.updateTransaction('t-1', { amount: 8 }),
    deleteTransaction: () => data.deleteTransaction('t-1'),
    deleteInstallmentPurchase: () => data.deleteInstallmentPurchase({ id: 't-1', parent_id: null, installment_total: 3 }),
    addInstallmentPurchase: () => data.addInstallmentPurchase({ ...base, totalAmount: 30, installments: 3 }),
  };

  for (const [nome, gravar] of Object.entries(gravacoes)) {
    /* Lote e parcelamento leem `data` como lista. */
    resposta = { data: nome === 'addTransactionsBatch' || nome === 'deleteInstallmentPurchase' || nome === 'addInstallmentPurchase' ? [{ id: 'novo' }] : { id: 'novo' }, error: null };
    const antes = alterados.versaoDosLancamentos();
    await gravar();
    assert.equal(alterados.versaoDosLancamentos(), antes + 1, nome + ' com sucesso marca uma vez');
    ok(nome + ' marca depois do sucesso');

    resposta = { data: null, error: { message: 'recusado', code: '42501' } };
    const antesDoErro = alterados.versaoDosLancamentos();
    await assert.rejects(gravar());
    assert.equal(alterados.versaoDosLancamentos(), antesDoErro, nome + ' recusado nao marca');
    ok(nome + ' recusado não marca');
  }

  /* Lote que não inseriu nada (tudo duplicado) não mudou a lista. */
  resposta = { data: [], error: null };
  const antesVazio = alterados.versaoDosLancamentos();
  await data.addTransactionsBatch([{ ...base, fitid: 'repetido' }], true);
  assert.equal(alterados.versaoDosLancamentos(), antesVazio);
  ok('reimportação só com duplicados não marca');
}

/* ── 2. Fila offline ────────────────────────────────────────────────────── */
async function filaOffline() {
  console.log('\nFila offline');
  const disco = new Map();
  const AsyncStorage = {
    getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
    setItem: async (k, v) => { disco.set(k, v); },
    removeItem: async (k) => { disco.delete(k); },
    multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
    getAllKeys: async () => [...disco.keys()],
  };
  let falhar = false;
  const enviados = [];
  const fila = carregar('lib/offline-cache.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    './lancamentos-alterados': alterados,
    /* Dublê que NÃO marca: prova que a marca vem da sincronização em si. */
    './data': {
      addTransaction: async (input) => { if (falhar) throw new Error('Network request failed'); enviados.push(input); },
      addBill: async () => {},
    },
    './goals': { createGoal: async () => {} },
    './cache-de-tela': { guardarTela: async () => {}, lerTela: async () => null, avisarDadoNovo() {}, isLikelyNetworkError: (e) => /network/i.test(String(e?.message)) },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
  });

  const item = { type: 'out', description: 'AUDIT offline', amount: 7.77, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-23' };

  let antes = alterados.versaoDosLancamentos();
  let r = await fila.flushPendingQueue();
  assert.equal(r.synced, 0);
  assert.equal(alterados.versaoDosLancamentos(), antes);
  ok('fila vazia não marca');

  await fila.queuePendingTransaction(item);
  falhar = true;
  antes = alterados.versaoDosLancamentos();
  r = await fila.flushPendingQueue();
  assert.equal(r.synced, 0);
  assert.equal(r.remaining, 1);
  assert.equal(alterados.versaoDosLancamentos(), antes);
  ok('sem rede, nada sobe e não marca');

  falhar = false;
  r = await fila.flushPendingQueue();
  assert.equal(r.synced, 1);
  assert.equal(enviados.length, 1);
  assert.equal(alterados.versaoDosLancamentos(), antes + 1);
  ok('rede de volta: sobe o item e marca');
}

/* ── 3. Início ──────────────────────────────────────────────────────────── */
function inicio() {
  console.log('\nInício (fonte)');
  const fonte = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');

  const foco = fonte.slice(fonte.indexOf('useFocusEffect(\n'), fonte.indexOf('carregarPerfil().then', fonte.indexOf('useFocusEffect(\n')));
  assert.match(foco, /versaoLancamentosCarregada\.current === versaoDosLancamentos\(\)[\s\S]*carregarDadosLeves\(\)/);
  assert.match(foco, /else \{[\s\S]*load\(\);/);
  ok('foco só usa a carga leve com a versão da última carga completa');

  const load = fonte.slice(fonte.indexOf('const load = useCallback('), fonte.indexOf('}, [isDemoMode]);', fonte.indexOf('const load = useCallback(')));
  const leitura = load.indexOf('const versaoAoComecar = versaoDosLancamentos()');
  assert.ok(leitura > 0, 'load lê a versão');
  assert.ok(leitura < load.indexOf('fetchTransactions()'), 'a versão é lida antes da busca');
  assert.match(load, /setTransactions\(tx\);\s*versaoLancamentosCarregada\.current = versaoAoComecar;/);
  assert.match(load, /setCreditCards\(DEMO_CREDIT_CARDS\);\s*versaoLancamentosCarregada\.current = versaoAoComecar;/);
  ok('carga completa grava a versão lida antes da busca (real e exemplo)');
}

(async () => {
  await camadaDeDados();
  await filaOffline();
  inicio();
  console.log(`\n${aprovadas} checagens de "Últimos lançamentos" passaram — 0 falhas`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
