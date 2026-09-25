/* Fala guardada sem rede aparece na lista como "aguardando envio", nas duas
 * entradas da voz (regra 13), e áudio não transcrito fica fora dos totais
 * (decisão do autor de 24/09/2026: todo lançamento guardado aparece e sobe).
 *
 *   node __tests__/voz-pendente-na-lista.cjs
 *
 * Módulos REAIS: lib/voice-operations.ts (o núcleo que o app e o widget usam
 * para gravar a fala), lib/data.ts, lib/fila-pendente.ts, lib/cache-de-tela.ts
 * e lib/voz-pendente-na-lista.ts, com banco, disco e sessão simulados.
 *
 *  1. Sem rede, a fala do app e a do widget voltam `pending` e as duas entram
 *     na lista (id `local-voz-…`, que as telas mostram como "aguardando
 *     envio") e nos totais.
 *  2. Outra conta no mesmo aparelho não vê as falas (achado A1).
 *  3. Sem dobrar: quando a linha do servidor (`source_event_id = requestId`)
 *     chega, a fala local sai da junção no mesmo passo, mesmo com a chave
 *     local ainda no disco.
 *  4. Parcelada e boleto por voz não entram na lista.
 *  5. Áudio não transcrito só é contado (sem valor), por dono, nas duas
 *     entradas, e não entra na lista nem nos totais.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

/* ── Ambiente simulado ─────────────────────────────────────────────────── */
const estado = { rede: true, usuario: 'u-1' };
const banco = [];
const disco = new Map();
const AsyncStorage = {
  getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
  setItem: async (k, v) => { disco.set(k, v); },
  removeItem: async (k) => { disco.delete(k); },
  multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  getAllKeys: async () => [...disco.keys()],
  multiGet: async (ks) => ks.map((k) => [k, disco.has(k) ? disco.get(k) : null]),
};
const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });

function consulta() {
  const q = { faixa: null };
  for (const m of ['select', 'order', 'eq', 'gte', 'lte']) q[m] = () => q;
  q.range = (de, ate) => { q.faixa = [de, ate]; return q; };
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (!estado.rede) return semRede();
    const linhas = banco.filter((t) => t.user_id === estado.usuario);
    return { data: q.faixa ? linhas.slice(q.faixa[0], q.faixa[1] + 1) : linhas, error: null };
  }).then(res, rej);
  return q;
}
function rpc(nome) {
  const resposta = () => Promise.resolve(estado.rede
    ? (nome === 'registrar_operacao_voz'
      ? { data: { status: 'committed', operation_id: 'op', ids: ['x'], replayed: false }, error: null }
      : { data: [], error: null })
    : semRede());
  return { abortSignal: resposta, then: (res, rej) => resposta().then(res, rej) };
}
const supabase = { from: () => consulta(), rpc };

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
    AbortController, setTimeout: (fn, ms, ...a) => (ms >= 10_000 ? { unref() {} } : setTimeout(fn, ms, ...a)),
    clearTimeout: (t) => (t && t.unref ? undefined : clearTimeout(t)), __DEV__: false,
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

const voz = carregar('lib/voice-operations.ts');
const data = carregar('lib/data.ts');
const lista = carregar('lib/voz-pendente-na-lista.ts');

const fala = (descricao, amount, extra = {}) => ({
  kind: 'transaction', type: 'out', description: descricao, amount, category: 'Alimentação', color: '#fff',
  occurred_on: '2026-09-24', wallet_id: 'w-1', ...extra,
});
const soma = (itens) => itens.reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0);

(async () => {
  console.log('\nFala guardada na lista');
  /* Com rede, a lista do mês fica no disco (é o que volta sem rede). */
  banco.push({ id: 'db-1', user_id: 'u-1', type: 'out', description: 'AUDIT do banco', amount: 10, category: 'Outros',
    color: '#fff', occurred_on: '2026-09-20', recurring: false, parent_id: null, created_at: '2026-09-20T12:00:00Z' });
  await data.fetchTransactions();
  await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-09-30');

  /* 1. Sem rede, as duas entradas. */
  estado.rede = false;
  const rApp = await voz.registrarOperacaoVoz('req-app', 'app', fala('AUDIT voz app', 7));
  const rWidget = await voz.registrarOperacaoVoz('req-widget', 'widget', fala('AUDIT voz widget', 3));
  assert.equal(rApp.status, 'pending');
  assert.equal(rWidget.status, 'pending');
  const semRedeTudo = await data.fetchTransactions();
  const semRedeMes = await data.fetchTransactionsDoPeriodo('2026-09-01', '2026-09-30');
  for (const l of [semRedeTudo, semRedeMes]) {
    const ids = l.map((t) => t.id);
    assert.ok(ids.includes('local-voz-req-app'), 'fala do app fora da lista');
    assert.ok(ids.includes('local-voz-req-widget'), 'fala do widget fora da lista');
    assert.equal(soma(l), -20, 'totais sem as falas');
  }
  const doApp = semRedeTudo.find((t) => t.id === 'local-voz-req-app');
  assert.ok(doApp.id.startsWith('local-'), 'sem marca de aguardando envio');
  assert.equal(doApp.amount, 7);
  assert.ok(typeof doApp.created_at === 'string' && doApp.created_at.length > 0);
  ok('sem rede: fala do app e do widget na lista, "aguardando envio", e nos totais');

  assert.equal((await lista.juntarVozPendente([], '2026-10-01', '2026-10-31')).length, 0);
  ok('fora do período pedido, a fala não entra');

  /* 2. Dono. */
  estado.usuario = 'u-2';
  assert.equal((await lista.juntarVozPendente([])).length, 0);
  estado.usuario = 'u-1';
  ok('outra conta no mesmo aparelho não vê as falas');

  /* 3. Sem dobrar: a linha do servidor chega com a chave local ainda no disco. */
  estado.rede = true;
  banco.push({ id: 'db-voz', user_id: 'u-1', type: 'out', description: 'AUDIT voz app', amount: 7, category: 'Alimentação',
    color: '#fff', occurred_on: '2026-09-24', recurring: false, parent_id: null, created_at: '2026-09-24T12:00:00Z',
    source: 'voz', source_event_id: 'req-app' });
  assert.ok(disco.has('grana:voz:operacao:u-1:req-app'), 'pré-condição: chave local ainda existe');
  const comServidor = await data.fetchTransactions();
  assert.equal(comServidor.filter((t) => t.description === 'AUDIT voz app').length, 1, 'fala dobrada');
  assert.equal(comServidor.find((t) => t.description === 'AUDIT voz app').id, 'db-voz');
  assert.ok(comServidor.some((t) => t.id === 'local-voz-req-widget'), 'a outra fala sumiu');
  ok('linha do servidor com o mesmo requestId substitui a fala local no mesmo passo');

  /* A sincronização real apaga as chaves e a lista fica só com o servidor. */
  await voz.sincronizarOperacoesVoz();
  assert.equal((await data.fetchTransactions()).some((t) => t.id.startsWith('local-voz-')), false);
  ok('depois de subir, nenhuma fala local sobra na lista');

  /* 4. Parcelada e boleto. */
  estado.rede = false;
  await voz.registrarOperacaoVoz('req-parc', 'app', { ...fala('AUDIT parcelada', 90), kind: 'installment', installments: 3, payment_method: 'credit', card_id: 'c-1' });
  await voz.registrarOperacaoVoz('req-bill', 'widget', { kind: 'bill', description: 'AUDIT boleto', amount: 50, category: 'Contas', color: '#fff', due_date: '2026-09-30', wallet_id: 'w-1' });
  const comOutras = await data.fetchTransactions();
  assert.equal(comOutras.some((t) => t.id === 'local-voz-req-parc' || t.id === 'local-voz-req-bill'), false);
  ok('parcelada e boleto por voz não entram na lista');

  /* 5. Áudio não transcrito: só contado, por dono, fora da lista. */
  disco.set('grana:queue:widget-voz-pendente-v1', JSON.stringify([
    { caminho: 'a.m4a', requestId: 'aud-app', userId: 'u-1', criadoEm: 1, source: 'app' },
    { caminho: 'b.m4a', requestId: 'aud-widget', userId: 'u-1', criadoEm: 2, source: 'widget' },
    { caminho: 'c.m4a', requestId: 'aud-outro', userId: 'u-2', criadoEm: 3, source: 'widget' },
  ]));
  assert.equal(await lista.contarFalasAguardandoConexao(), 2);
  const listaComAudio = await data.fetchTransactions();
  assert.equal(listaComAudio.some((t) => /aud-/.test(t.id)), false);
  assert.equal(soma(listaComAudio), soma(comOutras), 'áudio mexeu nos totais');
  estado.usuario = 'u-2';
  assert.equal(await lista.contarFalasAguardandoConexao(), 1);
  estado.usuario = 'u-1';
  ok('áudio das duas entradas só é contado, pelo dono, sem valor e fora dos totais');

  console.log(`\n${aprovadas} checagens de voz guardada na lista passaram — 0 falhas`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
