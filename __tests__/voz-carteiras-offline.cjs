const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
let userId = 'a', failure = null, rows = [], queries = 0;
const storage = new Map();
const deps = {
  './format': { isCreditTx: () => false },
  '@react-native-async-storage/async-storage': { __esModule: true, default: {
    getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => storage.set(k, v),
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
const exportsVoz = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/wallets.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsVoz, require: id => { assert.ok(id in deps, id); return deps[id]; }, console });
(async () => {
  rows = [{ id: 'uuid-real', user_id: 'a', name: 'Pessoal', is_default: true }];
  assert.equal((await exportsVoz.fetchWallets())[0].id, 'uuid-real');
  failure = { message: 'Network request failed' };
  assert.equal((await exportsVoz.fetchWallets())[0].id, 'uuid-real', 'offline conserva carteira real');
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
