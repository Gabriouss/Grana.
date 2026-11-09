// Serviço e CSV reais; fronteiras de sessão, disco e compartilhamento sintéticas.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const watchdog = setTimeout(() => { console.error('CSV: teste não concluiu'); process.exit(1); }, 10_000);
function carregar(op = {}) {
  const ctx = { session: { user: { id: 'a' }, access_token: 'fixture' }, calls: [], files: new Map(), shares: [], clicks: 0, unsub: 0 };
  const tx = i => ({ id: String(i), user_id: 'a', occurred_on: '2026-11-08', type: 'out', amount: 12.5, category: 'Café', description: 'Ação; café', wallet_id: 'p', payment_method: 'pix' });
  const dados = { transactions: Array.from({ length: op.total ?? 1001 }, (_, i) => tx(i)), wallets: [{ id: 'p', user_id: 'a', name: 'Principal', is_default: true }], credit_cards: [] };
  if (op.foreign) dados.wallets[0].user_id = 'b';
  const supabase = { auth: {
    getSession: async () => ({ data: { session: ctx.session }, error: null }),
    getUser: async token => { assert.equal(token, 'fixture'); return { data: { user: { id: 'a' } }, error: null }; },
    onAuthStateChange: fn => { ctx.listener = fn; return { data: { subscription: { unsubscribe: () => { ctx.unsub++; } } } }; },
  }, rpc(name) { assert.equal(name, 'obter_estado_acesso'); return { setHeader() { return Promise.resolve({ data: { allowed: op.allowed !== false, enforced: !!op.expired, access_until: op.expired ? '2020-01-01T00:00:00Z' : null }, error: null }); } }; },
  from(table) {
    const call = { table, filters: [], order: [] }; ctx.calls.push(call);
    const q = { select() { return q; }, eq(k, v) { call.filters.push([k, v]); return q; }, gte(k,v) { call.start = [k,v]; return q; }, lt(k,v) { call.end = [k,v]; return q; },
      order(k) { call.order.push(k); return q; }, range(a,b) { call.range = [a,b]; return q; }, setHeader(k,v) { assert.equal(k, 'Authorization'); assert.equal(v, 'Bearer fixture'); call.fixed = true; return q; },
      then(ok, fail) { return Promise.resolve().then(async () => {
        assert.equal(call.fixed, true); assert.deepEqual(call.filters, [['user_id','a']]); assert.deepEqual(call.order, ['id']);
        await op.page?.(ctx, call);
        if(op.fail) return { data: null, error: { code: 'FIXTURE' } };
        return { data: dados[table].slice(call.range[0], call.range[1]+1), error: null };
      }).then(ok,fail); } }; return q;
  } };
  const cache = new Map();
  function real(f) { f = path.resolve(f); if(cache.has(f)) return cache.get(f); const api = {}; cache.set(f,api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports: api, console: { warn(){} }, setTimeout: fn => fn(), Date, Blob,
        URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} }, document: { createElement: () => ({ click: () => {ctx.clicks++;} }) },
        require(id) {
          if(id === './supabase') return { supabase };
          if(id === 'react-native') return { Platform: { OS: op.os ?? 'android' } };
          if(id === 'expo-crypto') return { randomUUID: () => 'unique-fixture' };
          if(id === 'expo-sharing') return { isAvailableAsync: async () => { await op.available?.(ctx); return op.availableValue !== false; }, shareAsync: async (uri,opts) => {ctx.shares.push({uri,opts}); if(op.shareFail) throw Error('fixture');} };
          if(id === 'expo-file-system') return { Paths: { cache: 'cache' }, File: class { constructor(...parts) {this.uri=parts.join('/');} get exists(){return ctx.files.has(this.uri);} create(){ctx.files.set(this.uri,'');} write(s){ctx.files.set(this.uri,s); op.write?.(ctx);} delete(){ctx.files.delete(this.uri);} } };
          if(id.startsWith('.')) return real(path.resolve(path.dirname(f),id+'.ts'));
          throw Error('fronteira inesperada '+id);
        } }, { filename:f }); return api;
  }
  ctx.run = args => real('lib/exportar-lancamentos.ts').exportarLancamentosCsv({ userId: 'a', carteiraId: 'p', periodo: '2026-11', ...args });
  return ctx;
}
(async () => {
  const a = carregar(); const r = await a.run(); assert.equal(r.quantidade,1001); assert.equal(a.shares.length,1); assert.equal(a.unsub,1);
  assert.equal(a.calls.filter(c=>c.table==='transactions').length,2); assert.ok(a.calls.every(c=>c.fixed));
  assert.deepEqual(a.calls[0].start,['occurred_on','2026-11-01']); assert.deepEqual(a.calls[0].end,['occurred_on','2026-12-01']);
  assert.equal(a.shares[0].opts.mimeType,'text/csv'); assert.match([...a.files.values()][0],/^\uFEFFData;Descrição/);
  const b=carregar({os:'web', total:0}); assert.equal((await b.run({periodo:'tudo'})).quantidade,0); assert.equal(b.clicks,1); assert.equal(b.shares.length,0); assert.equal(b.calls[0].start,undefined);
  for(const change of ['page','available','write']) { const c=carregar({[change]:ctx=>{ctx.session={user:{id:'b'},access_token:'changed'};ctx.listener?.('SIGNED_IN',ctx.session);}});
    await assert.rejects(c.run(),/conta|sessão|login/i); assert.equal(c.shares.length,0); assert.equal(c.files.size,0); assert.equal(c.unsub,1); }
  for(const opts of [{allowed:false},{expired:true},{foreign:true},{fail:true},{availableValue:false},{shareFail:true}]) { const c=carregar(opts); await assert.rejects(c.run()); assert.equal(c.files.size,0); assert.equal(c.clicks,0); assert.equal(c.unsub,1);
    if(opts.allowed===false||opts.expired)assert.equal(c.calls.length,0); }
  const dec=carregar({total:0});await dec.run({periodo:'2026-12'});assert.deepEqual(dec.calls[0].end,['occurred_on','2027-01-01']);
  const c=carregar(); await assert.rejects(c.run({periodo:'2026-99'}),/Período/); assert.equal(c.calls.length,0);
  console.log('CSV efeitos: paginação 1001, período/tudo/vazio, token fixo, conta tardia, acesso/consulta/share/limpeza reais OK');
})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
