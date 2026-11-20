/* Item 40 (20/11/2026): abas montadas e o tick de 15 s da faixa offline
   pediam a mesma chave do `comCacheOffline` com a primeira busca ainda em voo.
   Com rede lenta, a tela era servida do disco depois do prazo e cada novo tick
   abria OUTRA busca (cada histórico completo são várias páginas), empilhando
   requisições. Executa lib/cache-de-tela.ts REAL (ts.transpileModule + vm) com
   disco, sessão e relógio falsos e conta quantas vezes o buscador foi chamado.
   CACHE_DE_TELA_FONTE=<arquivo .ts> roda contra outra versão (baseline RED). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const FONTE = process.env.CACHE_DE_TELA_FONTE || path.join(__dirname, '..', 'lib', 'cache-de-tela.ts');
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const adiado = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };

function montar() {
  const disco = new Map();
  const AsyncStorage = {
    async getItem(k) { return disco.has(k) ? disco.get(k) : null; },
    async setItem(k, v) { disco.set(k, v); },
    async removeItem(k) { disco.delete(k); },
    async getAllKeys() { return [...disco.keys()]; },
    async multiRemove(ks) { ks.forEach((k) => disco.delete(k)); },
  };
  const api = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(FONTE, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: api, console: { ...console, error() {}, warn() {} }, Date, JSON, Set, Map, String, Promise, Array, Object, Error,
    // Os 4 s de produção viram 4 ms.
    setTimeout: (fn, ms) => setTimeout(fn, Math.max(0, Math.ceil((ms || 0) / 1000))), clearTimeout,
    require: (id) => {
      if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: AsyncStorage };
      if (id === './sessao-offline') return { idDoUsuarioLocal: async () => 'usuario-a', sessaoEstaTravada: () => false };
      throw Error(id);
    },
  });
  return { api, disco };
}

/** Buscador que fica pendurado até a resposta ser liberada à mão, e conta as chamadas. */
function buscador() {
  const b = { chamadas: 0, pendentes: [] };
  b.fn = (...args) => { b.chamadas++; const d = adiado(); b.pendentes.push({ args, ...d }); return d.p; };
  b.ultima = () => b.pendentes.at(-1);
  return b;
}

(async () => {
  // 1. Seis abas pedem a mesma chave com a primeira busca em voo: uma requisição só.
  {
    const { api } = montar();
    const b = buscador();
    const fetchTransactions = api.comCacheOffline('transacoes', b.fn);
    const abas = Array.from({ length: 6 }, () => fetchTransactions());
    await tick();
    check(b.chamadas === 1, `seis abas, uma busca em voo (${b.chamadas} chamadas)`);
    b.ultima().resolve(['t1', 't2']);
    const respostas = await Promise.all(abas);
    check(respostas.every((r) => JSON.stringify(r) === '["t1","t2"]'), 'todas as abas recebem a resposta completa');
    const outra = fetchTransactions(); await tick();
    check(b.chamadas === 2, 'depois da resposta, nova chamada busca de novo (sem cache permanente em memória)');
    b.ultima().resolve(['t1', 't2']); await outra;
  }

  // 2. Rede lenta: tela servida do disco depois do prazo, e o tick seguinte não abre outra busca.
  {
    const { api } = montar();
    const b = buscador();
    const fetchTransactions = api.comCacheOffline('transacoes', b.fn);
    const primeira = fetchTransactions(); await tick();
    b.ultima().resolve(['disco']); await primeira; // enche o disco
    const lenta = fetchTransactions(); await tick();
    check(b.chamadas === 2, 'segunda carga sai');
    const servida = await lenta; // estoura o prazo de 4 ms e serve o disco
    check(JSON.stringify(servida) === '["disco"]', 'rede lenta serve o disco depois do prazo');
    check(api.motivoDoModoOffline() === 'lento', 'faixa acesa como lenta');
    const tickDaFaixa = fetchTransactions(); await tick();
    check(b.chamadas === 2, `tick da faixa com a busca anterior ainda em voo não abre outra (${b.chamadas} chamadas)`);
    await tickDaFaixa;
    b.pendentes[1].resolve(['fresca']); await tick(); await pausa(300);
    const recarga = await fetchTransactions();
    check(JSON.stringify(recarga) === '["fresca"]', 'quando a resposta chega, a recarga mostra o dado fresco');
    check(api.motivoDoModoOffline() === null, 'faixa apagada');
  }

  // 3. Escrita durante o voo: a próxima chamada não reaproveita a busca de antes da escrita.
  {
    const { api } = montar();
    const b = buscador();
    const fetchTransactions = api.comCacheOffline('transacoes', b.fn);
    const antes = fetchTransactions(); await tick();
    api.lancamentoGravado();
    const depois = fetchTransactions(); await tick();
    check(b.chamadas === 2, `depois de gravar, nova busca mesmo com a anterior em voo (${b.chamadas} chamadas)`);
    b.pendentes[1].resolve(['com-o-novo']);
    check(JSON.stringify(await depois) === '["com-o-novo"]', 'quem pediu depois da escrita recebe o dado com o lançamento novo');
    b.pendentes[0].resolve(['sem-o-novo']); await antes;
  }

  // 4. Chaves diferentes não se misturam; erro compartilhado e nova tentativa depois.
  {
    const { api } = montar();
    const b = buscador();
    const fetchBills = api.comCacheOffline('contas', b.fn, (status) => status);
    const abertas = fetchBills('due'), pagas = fetchBills('paid'); await tick();
    check(b.chamadas === 2 && b.pendentes[0].args[0] === 'due' && b.pendentes[1].args[0] === 'paid', 'chaves diferentes buscam separado');
    b.pendentes[0].resolve(['a']); b.pendentes[1].resolve(['p']);
    check(JSON.stringify(await abertas) === '["a"]' && JSON.stringify(await pagas) === '["p"]', 'cada chave recebe a sua resposta');
    const x = fetchBills('due'), y = fetchBills('due'); await tick();
    check(b.chamadas === 3, 'mesma chave em voo, uma busca');
    const falha = Object.assign(new Error('permissão negada'), { code: '42501' });
    b.ultima().reject(falha);
    const erros = await Promise.allSettled([x, y]);
    check(erros.every((e) => e.status === 'rejected' && e.reason === falha), 'falha permanente chega a todos que esperavam');
    const nova = fetchBills('due'); await tick();
    check(b.chamadas === 4, 'depois da falha, nova chamada tenta de novo');
    b.ultima().resolve(['a2']); await nova;
  }

  console.log(`cache-de-tela-coalescencia: ${checks} verificações ok`);
})().catch((e) => { console.error(e); process.exit(1); });
