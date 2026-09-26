const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
let userId = 'a', failure = null, rows = [], queries = 0;
const storage = new Map();
const deps = {
  /* O `cache-de-tela.ts` REAL, carregado abaixo. Até 26/09/2026 este teste
     usava a identidade aqui, porque quem servia o disco sem rede era um
     segundo cache dentro de `buscar_fetchWallets`. Esse segundo cache era a
     causa raiz do N1 e saiu; as promessas deste teste (lista offline para a
     voz, isolamento por conta, falha permanente visível) continuam as mesmas,
     agora cumpridas por `comCacheOffline`. */
  './cache-de-tela': null,
  /* Quem é o dono do aparelho passou a ser lido por aqui (11/09/2026), e não
     mais só por `getSession()`: sem rede e com o token vencido o cliente
     devolve vazio, e a lista de carteiras — de que o lançamento por voz
     offline depende — ficava inalcançável. O dublê espelha o mesmo `userId`
     que o dublê do Supabase logo abaixo usa. */
  './sessao-offline': { idDoUsuarioLocal: async () => userId ?? null },
  './format': { isCreditTx: () => false },
  '@react-native-async-storage/async-storage': { __esModule: true, default: {
    getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => storage.set(k, v),
    removeItem: async k => storage.delete(k), getAllKeys: async () => [...storage.keys()], multiRemove: async ks => ks.forEach(k => storage.delete(k)),
  } },
  './supabase': { supabase: {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }),
      getUser: () => assert.fail('carteiras offline não podem exigir autenticação remota') },
    from: () => {
      queries++;
      const q = { select: () => q, eq: (_field, id) => { assert.equal(id, userId); return q; }, order: () => q,
        then: (resolve, reject) => Promise.resolve({ data: rows, error: failure }).then(resolve, reject) };
      return q;
    },
  } },
};
const compilar = (arq) => ts.transpileModule(fs.readFileSync(arq, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const cacheDeTela = {};
vm.runInNewContext(compilar('lib/cache-de-tela.ts'), {
  exports: cacheDeTela, console, JSON, Date, Promise, String, Map, Set, setTimeout, clearTimeout,
  require: id => { assert.ok(id in deps, id); return deps[id]; },
});
deps['./cache-de-tela'] = cacheDeTela;
const exportsVoz = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/wallets.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsVoz, require: id => { assert.ok(id in deps, id); return deps[id]; }, console });
(async () => {
  rows = [{ id: 'uuid-real', user_id: 'a', name: 'Pessoal', is_default: true }];
  assert.equal((await exportsVoz.fetchWallets())[0].id, 'uuid-real');
  failure = { message: 'Network request failed' };
  assert.equal((await exportsVoz.fetchWallets())[0].id, 'uuid-real', 'offline conserva carteira real');
  assert.ok(cacheDeTela.estaServindoDoCache(), 'e avisa que é dado guardado (faixa offline)');
  userId = 'b';
  await assert.rejects(exportsVoz.fetchWallets(), e => e === failure, 'outra conta não acessa cache alheio');
  userId = 'a'; failure = { code: '42501', message: 'permission denied' };
  await assert.rejects(exportsVoz.fetchWallets(), e => e === failure, 'recusa permanente não vira cache benigno');
  userId = null;
  const antes = queries;
  await assert.rejects(exportsVoz.fetchWallets(), /Entre na conta/);
  assert.equal(queries, antes);
  console.log('OK carteiras offline: sessão local, UUID real, isolamento por conta e falha permanente visível.');
})().catch(e => { console.error(e); process.exitCode = 1; });
