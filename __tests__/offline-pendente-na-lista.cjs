/* Lançamento salvo sem rede aparece na lista e nos totais, e sobe sozinho
 * quando a rede volta (achado T13 do Sentinel, 23/09/2026).
 *
 *   node __tests__/offline-pendente-na-lista.cjs
 *
 * Sintoma: sem rede, com o app aberto do zero, o lançamento fechava a folha
 * mas não aparecia na lista nem somava nos totais, e só sincronizava ao
 * reabrir o app. Regressão do A59, que estava certo em 22/09.
 *
 * Causa: `fetchTransactionsDoPeriodo` passou a sair por `comCacheOffline`, que
 * sem rede devolve o mês guardado no disco COMO SUCESSO. O disco não conhece
 * o que foi salvo depois, a tela recebia a lista sem o pendente, e o
 * `guardarNoCache` de Lançamentos ainda apagava o otimista. E a fila só era
 * enviada dentro da carga de uma tela.
 *
 * Módulos REAIS: lib/data.ts, lib/cache-de-tela.ts, lib/fila-pendente.ts e
 * lib/offline-cache.ts, compartilhando instâncias, com banco, disco e sessão
 * simulados. As asserções olham também QUAIS gravações chegaram ao banco.
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
  const q = { filtros: [], insercao: null, faixa: null };
  for (const m of ['select', 'order', 'eq']) q[m] = () => q;
  q.gte = (c, v) => { q.filtros.push((t) => t[c] >= v); return q; };
  q.lte = (c, v) => { q.filtros.push((t) => t[c] <= v); return q; };
  q.range = (de, ate) => { q.faixa = [de, ate]; return q; };
  q.insert = (linha) => { q.insercao = linha; return q; };
  q.single = () => q;
  q.then = (res, rej) => Promise.resolve().then(() => {
    if (!estado.rede) return semRede();
    if (q.insercao) {
      if (estado.recusa) return { data: null, error: estado.recusa };
      const linha = { id: `db-${banco.length + 1}`, created_at: new Date().toISOString(), ...q.insercao };
      banco.push(linha);
      gravacoes.push(linha);
      return { data: linha, error: null };
    }
    const linhas = banco.filter((t) => q.filtros.every((f) => f(t)));
    return { data: q.faixa ? linhas.slice(q.faixa[0], q.faixa[1] + 1) : linhas, error: null };
  }).then(res, rej);
  return q;
}
const supabase = { from: () => consulta(), rpc: async () => (estado.rede ? { data: [], error: null } : semRede()) };

/* Timer da nova tentativa sob controle do teste; os outros continuam reais. */
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
const telas = carregar('lib/cache-de-tela.ts');

const INICIO = '2026-09-01';
const FIM = '2026-09-30';
const entrada = (descricao, occurred_on = '2026-09-23') => ({
  type: 'out', description: descricao, amount: 12.5, category: 'Alimentação', color: '#fff', occurred_on,
});
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* Com rede: um lançamento no banco, e o mês fica guardado no disco. */
  banco.push({ id: 'db-0', created_at: '2026-09-20T12:00:00Z', ...entrada('AUDIT já no banco', '2026-09-20') });
  igual((await data.fetchTransactionsDoPeriodo(INICIO, FIM)).map((t) => t.id), ['db-0'], 'com rede: o mês vem do banco');
  /* As outras telas também já abriram com rede uma vez (sem disco, sem rede,
     a busca sobe o erro, que é o certo). */
  await data.fetchTransactions();
  await data.fetchTransactionsDoPeriodo('2026-10-01', '2026-10-31');

  /* Sem rede: salvar guarda no aparelho. */
  estado.rede = false;
  const salvo = await fila.salvarOuGuardarNoAparelho(entrada('AUDIT offline'));
  ok(salvo.guardado, 'sem rede: salvarOuGuardarNoAparelho guarda na fila');
  ok(/^local-/.test(salvo.lancamento.id), 'e devolve o otimista com id local');
  igual(gravacoes.length, 0, 'nada chegou ao banco');
  igual(await fila.getPendingCount(), 1, 'um pendente');

  /* O defeito: o mês vinha do disco, sem o pendente. */
  const doMes = await data.fetchTransactionsDoPeriodo(INICIO, FIM);
  igual(doMes.map((t) => t.id).sort(), ['db-0', salvo.lancamento.id].sort(), 'sem rede: o pendente aparece na lista do mês');
  const total = doMes.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  igual(total, 25, 'e soma nos totais');
  ok((await data.fetchTransactions()).some((t) => t.id === salvo.lancamento.id), 'e no histórico da Início');
  ok(!(await data.fetchTransactionsDoPeriodo('2026-10-01', '2026-10-31')).some((t) => t.id === salvo.lancamento.id),
    'mas não no mês de outubro, fora da data dele');

  /* Outra conta no mesmo aparelho não vê o pendente de u-1. */
  estado.usuario = 'u-2';
  igual(await carregar('lib/fila-pendente.ts').juntarPendentes([]), [], 'outra conta não vê o pendente');
  estado.usuario = 'u-1';

  /* Recusa que não é de rede sobe como erro e não entra na fila. */
  estado.rede = true;
  estado.recusa = { message: 'new row violates check constraint', code: '23514' };
  await assert.rejects(fila.salvarOuGuardarNoAparelho(entrada('AUDIT recusado')), (e) => /check constraint/.test(e.message));
  passou++;
  igual(await fila.getPendingCount(), 1, 'recusa do banco não vira pendente');
  estado.recusa = null;

  /* A rede volta com o app aberto: a nova tentativa agendada sobe a fila e
     avisa as telas, sem reabrir nada. */
  estado.rede = false;
  igual(agendados.length, 1, 'guardar na fila agendou uma nova tentativa (uma só)');
  igual(agendados[0].ms, 30_000, 'a cada 30 s');
  /* A tentativa dispara ainda sem rede: falha e precisa se reagendar, senão
     a fila ficaria parada até a próxima tela. */
  agendados.shift().fn();
  await esperar(100);
  igual(agendados.length, 1, 'tentativa sem rede se reagenda');
  igual(gravacoes.length, 0, 'e não grava nada');
  let avisos = 0;
  telas.assinarDadoNovo(() => { avisos++; });
  estado.rede = true;
  agendados.shift().fn();
  await esperar(400);
  igual(gravacoes.map((g) => g.description), ['AUDIT offline'], 'a nova tentativa grava o pendente uma vez só');
  igual(await fila.getPendingCount(), 0, 'e a fila esvazia');
  ok(avisos >= 1, 'e a tela aberta é avisada para recarregar');
  igual(agendados.length, 0, 'fila vazia: nada mais agendado');

  const depois = await data.fetchTransactionsDoPeriodo(INICIO, FIM);
  igual(depois.filter((t) => t.description === 'AUDIT offline').length, 1, 'depois de subir, aparece uma vez só (sem o otimista duplicado)');
  ok(depois.every((t) => !/^local-/.test(t.id)), 'e já com o id do banco');

  /* Com rede, salvar grava direto. */
  const direto = await fila.salvarOuGuardarNoAparelho(entrada('AUDIT com rede'));
  ok(!direto.guardado && /^db-/.test(direto.lancamento.id), 'com rede: grava direto no banco');

  console.log(`offline-pendente-na-lista: ${passou} checagens OK`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
