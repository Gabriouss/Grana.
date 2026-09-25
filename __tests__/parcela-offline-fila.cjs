/* Compra parcelada, sem rede, na aba Crédito e em Lançamentos (item 3 da fila
 * do maestro de 25/09/2026: "compra no crédito avulsa e parcelada" e
 * "parcelada em Lançamentos" nunca passavam pela fila offline).
 *
 *   node __tests__/parcela-offline-fila.cjs
 *
 * Sintoma confirmado no código antes desta correção: `credito.tsx` chamava
 * `addTransaction`/`addInstallmentPurchase` direto, sem `try/catch` de rede;
 * sem conexão, a chamada rejeitava e a compra digitada se perdia atrás de um
 * `Alert.alert('Erro ao salvar compra', ...)` — o mesmo defeito que T13/T20
 * já tinham corrigido para o lançamento comum (decisão do autor de 24/09: todo
 * lançamento entra na fila offline).
 *
 * Causa: `PendingInput`/`queuePendingTransaction` só sabiam guardar UMA linha;
 * uma compra parcelada gera N. `salvarOuGuardarParceladaNoAparelho` (novo,
 * lib/offline-cache.ts) e `otimistasDaParcela` (novo, lib/fila-pendente.ts)
 * fecham essa lacuna guardando um item `tipo: 'parcela'` com o total e o
 * número de parcelas, e devolvendo as N linhas otimistas na hora.
 *
 * Módulos REAIS: lib/data.ts, lib/offline-cache.ts, lib/fila-pendente.ts,
 * lib/transaction-rules.ts, compartilhando instâncias, com banco, disco e
 * sessão simulados. As asserções olham também QUAIS chamadas chegaram ao
 * banco (idempotência) e o texto-fonte das telas (paridade de chamada).
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

/* ── Ambiente simulado ─────────────────────────────────────────────────── */
const estado = { rede: true, usuario: 'u-1', recusa: null };
const banco = [];
const gravacoesTransacao = [];
const chamadasParcela = [];
const chavesParcela = new Map();
const disco = new Map();
const AsyncStorage = {
  getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
  setItem: async (k, v) => { disco.set(k, v); },
  removeItem: async (k) => { disco.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  getAllKeys: async () => [...disco.keys()],
};
const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });

function consulta() {
  const q = { filtros: [], insercao: null, faixa: null, upsert: false, unico: false, ou: null };
  for (const m of ['select', 'order']) q[m] = () => q;
  q.eq = (c, v) => { q.filtros.push((t) => t[c] === v); return q; };
  q.gte = (c, v) => { q.filtros.push((t) => t[c] >= v); return q; };
  q.lt = (c, v) => { q.filtros.push((t) => t[c] < v); return q; };
  q.lte = (c, v) => { q.filtros.push((t) => t[c] <= v); return q; };
  q.or = () => q; // "payment_method.eq.credit,card_id.not.is.null" — teste não filtra aqui, o merge da fila é o que se testa
  q.range = (de, ate) => { q.faixa = [de, ate]; return q; };
  q.insert = (linha) => { q.insercao = linha; return q; };
  q.upsert = (linha) => { q.insercao = linha; q.upsert = true; return q; };
  q.single = () => { q.unico = true; return q; };
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (!estado.rede) return semRede();
    if (q.insercao) {
      if (estado.recusa) return { data: null, error: estado.recusa };
      const k = q.insercao.client_request_id;
      if (q.upsert && k && banco.some((t) => t.user_id === q.insercao.user_id && t.client_request_id === k)) return { data: [], error: null };
      const linha = { id: `db-${banco.length + 1}`, created_at: new Date().toISOString(), ...q.insercao };
      banco.push(linha);
      gravacoesTransacao.push(linha);
      return { data: q.upsert ? [linha] : linha, error: null };
    }
    const linhas = banco.filter((t) => q.filtros.every((f) => f(t)));
    if (q.unico) return linhas.length === 1 ? { data: linhas[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'não achei' } };
    return { data: q.faixa ? linhas.slice(q.faixa[0], q.faixa[1] + 1) : linhas, error: null };
  }).then(res, rej);
  return q;
}

/* Dublê de `adicionar_compra_parcelada`: idempotente pela mesma chave (como
   o banco real, achado 20260924230000), N linhas com parent_id na primeira.
   Não reproduz o arredondamento/rolagem de mês exatos da função SQL — isso já
   é coberto por `corpus-parcelas-estorno.ts`; aqui o que importa é a
   PLUMBING da fila (chave enviada, item sai da fila, sem duplicata). */
async function rpcAdicionarCompraParcelada(params) {
  if (!estado.rede) return semRede();
  if (estado.recusa) return { data: null, error: estado.recusa };
  chamadasParcela.push(params);
  const chave = params.p_client_request_id;
  if (chave && chavesParcela.has(chave)) return { data: chavesParcela.get(chave), error: null };
  const n = params.p_installments;
  const base = Math.round((params.p_total_amount / n) * 100) / 100;
  const last = Math.round((params.p_total_amount - base * (n - 1)) * 100) / 100;
  const parentId = `db-${banco.length + 1}`;
  const rows = Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? parentId : `${parentId}-${i + 1}`,
    user_id: estado.usuario,
    type: 'out',
    description: `${params.p_description} (${i + 1}/${n})`,
    amount: i === n - 1 ? last : base,
    category: params.p_category,
    color: params.p_color,
    occurred_on: params.p_occurred_on,
    parent_id: i === 0 ? null : parentId,
    payment_method: params.p_payment_method,
    bank: params.p_bank,
    card_id: params.p_card_id,
    wallet_id: params.p_wallet_id,
    installment_current: i + 1,
    installment_total: n,
    client_request_id: i === 0 ? chave : null,
    created_at: new Date().toISOString(),
  }));
  banco.push(...rows);
  gravacoesTransacao.push(...rows);
  if (chave) chavesParcela.set(chave, rows);
  return { data: rows, error: null };
}

const supabase = {
  from: () => consulta(),
  rpc: async (fn, params) => (fn === 'adicionar_compra_parcelada' ? rpcAdicionarCompraParcelada(params) : (estado.rede ? { data: [], error: null } : semRede())),
};

const agendados = [];
const setTimeoutControlado = (fn, ms, ...a) => {
  if (ms >= 30_000) { const t = { fn, ms }; agendados.push(t); return t; }
  return setTimeout(fn, ms, ...a);
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
    setTimeout: setTimeoutControlado, clearTimeout, __DEV__: false,
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

const data = carregar('lib/data.ts');
const fila = carregar('lib/offline-cache.ts');

const compraParcelada = (overrides = {}) => ({
  type: 'out',
  description: 'Notebook',
  amount: 3000,
  category: 'Compras',
  color: '#fff',
  occurred_on: '2026-09-10',
  installments: 3,
  payment_method: 'credit',
  bank: 'nubank',
  card_id: 'cartao-1',
  ...overrides,
});

(async () => {
  /* Com rede, uma vez, para cada busca ter cache no disco (sem cache, ficar
     sem rede sobe o erro de verdade, e é o certo — ver `comCacheOffline` — mas
     não é o que este teste quer exercitar). */
  await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-11-30');
  await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-09-30');
  await data.fetchCreditTransactionsForMonth(2026, 8);

  /* ── Sem rede: compra parcelada no crédito guarda na fila, não se perde ── */
  estado.rede = false;
  const salvo = await fila.salvarOuGuardarParceladaNoAparelho(compraParcelada());
  ok(salvo.guardado, 'sem rede: salvarOuGuardarParceladaNoAparelho guarda na fila em vez de rejeitar');
  igual(chamadasParcela.length, 0, 'nada chegou a chamar a RPC');
  igual(await fila.getPendingCount(), 1, 'um item pendente (a série inteira, não uma por parcela)');
  igual(salvo.lancamentos.length, 3, 'devolve as 3 linhas otimistas na hora');
  igual(salvo.lancamentos.map((t) => t.amount), [1000, 1000, 1000], 'valor de cada parcela (3000 / 3)');
  igual(salvo.lancamentos.map((t) => t.description), ['Notebook (1/3)', 'Notebook (2/3)', 'Notebook (3/3)'], 'descrição com "(i/n)", como o banco grava');
  ok(salvo.lancamentos.every((t) => /^local-/.test(t.parent_id ?? t.id)), 'ids/parent_id locais, trocados quando a fila sobe');

  /* Arredondamento: 100 / 3 = 33.33 + 33.33 + 33.34 (a última absorve o resto). */
  const salvoCentavos = await fila.salvarOuGuardarParceladaNoAparelho(compraParcelada({ amount: 100, description: 'Ajuste', card_id: 'cartao-2' }));
  igual(salvoCentavos.lancamentos.map((t) => t.amount), [33.33, 33.33, 33.34], 'a última parcela absorve o resto do arredondamento, como a RPC faz');

  /* ── O pendente aparece na lista comum de Lançamentos/Início, CADA parcela
     no seu próprio mês (setembro, outubro, novembro), como qualquer compra
     parcelada já lançada — não as 3 empilhadas no mês da compra. ────────── */
  const doTrimestre = await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-11-30');
  igual(doTrimestre.filter((t) => t.description.startsWith('Notebook')).length, 3, 'as 3 parcelas aparecem no trimestre, uma por mês');
  const doMesDaCompra = await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-09-30');
  igual(doMesDaCompra.filter((t) => t.description.startsWith('Notebook')).map((t) => t.description), ['Notebook (1/3)'], 'só a 1ª parcela cai no mês da compra');

  /* ── A aba Crédito só junta pendente de cartão, não uma saída comum ──── */
  const semCartao = await fila.salvarOuGuardarNoAparelho({
    type: 'out', description: 'Mercado', amount: 50, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-15',
  });
  ok(semCartao.guardado, 'saída comum também guarda sem rede');
  const doMesCredito = await data.fetchCreditTransactionsForMonth(2026, 8); // setembro, mês 0-based
  ok(doMesCredito.some((t) => t.description === 'Notebook (1/3)'), 'a Crédito mostra a parcela pendente do cartão');
  ok(!doMesCredito.some((t) => t.description === 'Mercado'), 'mas não uma saída comum pendente, sem cartão');
  const doMesGeral = await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-09-30');
  ok(doMesGeral.some((t) => t.description === 'Mercado'), 'a saída comum continua aparecendo em Lançamentos/Início');

  /* ── Recusa que não é de rede (crédito sem cartão) não entra na fila ──── */
  const antesDoErro = await fila.getPendingCount();
  await assert.rejects(
    fila.salvarOuGuardarParceladaNoAparelho(compraParcelada({ card_id: undefined, description: 'Sem cartão' })),
    (e) => /precisa de um cartão/.test(e.message)
  );
  passou++;
  igual(await fila.getPendingCount(), antesDoErro, 'crédito sem cartão sobe como erro e não vira pendente');

  /* ── A rede volta: a fila sobe com a MESMA chave de idempotência ─────── */
  estado.rede = true;
  const resultado = await fila.flushPendingQueue();
  igual(resultado.synced, 3, 'os 3 itens pendentes (2 parcelas + 1 saída comum) sobem');
  igual(await fila.getPendingCount(), 0, 'fila esvazia');
  igual(chamadasParcela.length, 2, 'a RPC foi chamada uma vez por compra parcelada, não uma vez por parcela');
  ok(chamadasParcela.every((c) => typeof c.p_client_request_id === 'string' && c.p_client_request_id.length > 0), 'cada chamada leva a chave de idempotência');
  igual(new Set(chamadasParcela.map((c) => c.p_client_request_id)).size, 2, 'chaves diferentes para as duas compras');

  const depois = await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-11-30');
  igual(depois.filter((t) => t.description.startsWith('Notebook')).length, 3, 'depois de subir, ainda 3 linhas (sem duplicata)');
  ok(depois.every((t) => !/^local-/.test(t.id)), 'e já com o id do banco');

  /* Reenvio da MESMA chave (ex.: resposta perdida) não duplica no banco. */
  const antesDoTamanho = banco.length;
  const chaveRepetida = chamadasParcela[0].p_client_request_id;
  await rpcAdicionarCompraParcelada({ ...chamadasParcela[0], p_client_request_id: chaveRepetida });
  igual(banco.length, antesDoTamanho, 'reenviar a mesma chave não grava de novo (idempotência do banco)');

  /* ── Paridade de chamada: as telas usam o wrapper, não a função crua ─── */
  const credito = fs.readFileSync(path.join(root, 'app/(app)/credito.tsx'), 'utf8');
  const lancamentos = fs.readFileSync(path.join(root, 'app/(app)/lancamentos.tsx'), 'utf8');
  ok(credito.includes('salvarOuGuardarParceladaNoAparelho') && credito.includes('salvarOuGuardarNoAparelho'),
    'credito.tsx usa os dois wrappers de fila (avulsa e parcelada)');
  ok(!/[^.]addInstallmentPurchase\(/.test(credito.replace(/\/\*[\s\S]*?\*\//g, '')),
    'credito.tsx não chama addInstallmentPurchase direto (só pelo wrapper, dentro de offline-cache.ts)');
  ok(lancamentos.includes('salvarOuGuardarParceladaNoAparelho'),
    'lancamentos.tsx usa o wrapper de fila para compra parcelada');
  ok(!/[^.]addInstallmentPurchase\(/.test(lancamentos.replace(/\/\*[\s\S]*?\*\//g, '')),
    'lancamentos.tsx não chama addInstallmentPurchase direto');

  console.log(`parcela-offline-fila: ${passou} checagens OK`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
