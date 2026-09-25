/* As telas que lançam (Início e Lançamentos) salvam pelo núcleo do T13, e o
 * item guardado sem rede aparece na Início ao voltar (T13 + T2, 24/09/2026).
 *
 *   node __tests__/t13-telas-salvar-ou-guardar.cjs
 *
 * O Harbor publicou `salvarOuGuardarNoAparelho` (03534c8), mas as duas telas
 * ainda repetiam cada uma o seu `try { addTransaction } catch { fila }`.
 * Agora as duas chamam o helper, e o aviso "salvo no aparelho" só aparece com
 * `guardado: true`, que só vem depois de a fila ter sido gravada.
 *
 * Um defeito a mais apareceu na troca: enfileirar não passa por
 * `addTransaction`, então nada marcava `lib/lancamentos-alterados`. Quem
 * salvava sem rede pelo "+" da Início (folha em Lançamentos, volta à Início)
 * caía na carga leve, que não busca lançamentos, e o item guardado não
 * aparecia lá. Lançamentos agora marca quando `guardado`.
 *
 *  1. Módulos REAIS (`lib/data.ts`, `lib/offline-cache.ts`,
 *     `lib/fila-pendente.ts`, `lib/cache-de-tela.ts`,
 *     `lib/lancamentos-alterados.ts`): sem rede guarda e não grava no banco;
 *     a carga completa da Início traz o item; com rede grava uma vez; recusa
 *     do banco sobe como erro e não enfileira.
 *  2. Guarda de fonte nas duas telas: helper no lugar do try/catch, aviso
 *     condicionado a `guardado`, marca em Lançamentos.
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
const estado = { rede: true, usuario: 'u-1', recusa: null };
const banco = [];
const gravacoes = [];
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
  const q = { insercao: null, faixa: null };
  for (const m of ['select', 'order', 'eq', 'gte', 'lte']) q[m] = () => q;
  q.range = (de, ate) => { q.faixa = [de, ate]; return q; };
  q.insert = (linha) => { q.insercao = linha; return q; };
  /* Desde o T22 (25/09) o salvar manda client_request_id e usa upsert com
     ignoreDuplicates: chave repetida não grava e não devolve linha. */
  q.upsert = (linha) => { q.insercao = linha; q.upsert = true; return q; };
  q.single = () => q;
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (!estado.rede) return semRede();
    if (q.insercao) {
      if (estado.recusa) return { data: null, error: estado.recusa };
      const k = q.insercao.client_request_id;
      if (q.upsert === true && k && banco.some((t) => t.client_request_id === k)) return { data: [], error: null };
      const linha = { id: `db-${banco.length + 1}`, created_at: new Date().toISOString(), ...q.insercao };
      banco.push(linha);
      gravacoes.push(linha);
      return { data: q.upsert === true ? [linha] : linha, error: null };
    }
    return { data: q.faixa ? banco.slice(q.faixa[0], q.faixa[1] + 1) : [...banco], error: null };
  }).then(res, rej);
  return q;
}
const supabase = { from: () => consulta(), rpc: async () => (estado.rede ? { data: [], error: null } : semRede()) };

/* A nova tentativa de 30 s fica parada: aqui só interessa o que a tela faz. */
const setTimeoutControlado = (fn, ms, ...a) => (ms >= 30_000 ? { unref() {} } : setTimeout(fn, ms, ...a));

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
const alterados = carregar('lib/lancamentos-alterados.ts');

const entrada = (descricao) => ({
  type: 'out', description: descricao, amount: 12.5, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-23',
});

/* ── 1. Módulos reais ───────────────────────────────────────────────────── */
async function modulos() {
  console.log('\nMódulos reais');

  /* Com rede: a Início carrega uma vez, e a lista fica no disco. */
  await data.addTransaction(entrada('AUDIT antes'));
  await data.fetchTransactions();
  const versaoDaCargaDaInicio = alterados.versaoDosLancamentos();

  /* Sem rede, pela folha de Lançamentos. */
  estado.rede = false;
  const antes = gravacoes.length;
  const r = await fila.salvarOuGuardarNoAparelho(entrada('AUDIT sem rede'));
  assert.equal(r.guardado, true);
  assert.equal(gravacoes.length, antes, 'nada chegou ao banco');
  assert.equal(await fila.getPendingCount(), 1);
  ok('sem rede: guardado, na fila, nada gravado no banco');

  /* O que Lançamentos faz com `guardado` (guardado pela fonte, abaixo). */
  alterados.marcarLancamentosAlterados();
  assert.notEqual(alterados.versaoDosLancamentos(), versaoDaCargaDaInicio);
  ok('a marca faz o foco da Início pedir a carga completa');

  const listaDaInicio = await data.fetchTransactions();
  assert.ok(listaDaInicio.some((t) => t.description === 'AUDIT sem rede'), 'carga completa sem o pendente');
  ok('a carga completa da Início, ainda sem rede, traz o item guardado');

  /* Com rede: grava uma vez, marca sozinho, não guarda. */
  estado.rede = true;
  const versao = alterados.versaoDosLancamentos();
  const antesComRede = gravacoes.length;
  const r2 = await fila.salvarOuGuardarNoAparelho(entrada('AUDIT com rede'));
  assert.equal(r2.guardado, false);
  assert.equal(gravacoes.length, antesComRede + 1);
  assert.equal(alterados.versaoDosLancamentos(), versao + 1);
  ok('com rede: uma gravação, sem fila, e a lista marcada pelo addTransaction');

  /* Recusa do banco não vira "salvo no aparelho". */
  estado.recusa = { message: 'new row violates check constraint', code: '23514' };
  const pendentesAntes = await fila.getPendingCount();
  await assert.rejects(fila.salvarOuGuardarNoAparelho(entrada('AUDIT recusado')));
  assert.equal(await fila.getPendingCount(), pendentesAntes);
  estado.recusa = null;
  ok('recusa do banco sobe como erro e não entra na fila');
}

/* ── 2. Telas (fonte) ───────────────────────────────────────────────────── */
function telas() {
  console.log('\nTelas (fonte)');
  const inicio = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
  const lancamentos = fs.readFileSync(path.join(root, 'app/(app)/lancamentos.tsx'), 'utf8');

  for (const [nome, fonte] of [['Início', inicio], ['Lançamentos', lancamentos]]) {
    assert.match(fonte, /const \{ guardado \} = await salvarOuGuardarNoAparelho\(/, nome);
    assert.doesNotMatch(fonte, /queuePendingTransaction/, `${nome} ainda enfileira por conta própria`);
    assert.doesNotMatch(fonte, /await addTransaction\(/, `${nome} ainda grava lançamento sem o helper`);
    assert.match(fonte, /triggerToast\(guardado \? 'Sem conexão\. Lançamento salvo no aparelho' : 'Lançamento salvo'\)/, nome);
  }
  ok('Início e Lançamentos salvam pelo helper, e o aviso depende de guardado');

  assert.match(lancamentos, /if \(guardado\) \{[\s\S]{0,400}marcarLancamentosAlterados\(\);[\s\S]{0,40}\}/);
  ok('Lançamentos marca a lista quando guarda no aparelho');
}

(async () => {
  await modulos();
  telas();
  console.log(`\n${aprovadas} checagens do T13 nas telas passaram — 0 falhas`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
