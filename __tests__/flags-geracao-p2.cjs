// FlagsProvider, flags-cache e regras REAIS; React/storage/rede controlados.
// --baseline lê as duas fontes originais externas sem checkout ou mutação.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ambiente, flush, pendente } = require('./helpers/providers-controlados.cjs');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const baseDir = process.env.FLAGS_BASELINE_DIR ?? path.resolve(root, '../../2026-11-11-retomada/baseline-CodexPH-flags-P2-7ed40986');
const chaveCache = 'grana:cache:flags', chaveFlag = 'lancamento_voz';
const fontes = baseline ? {
  provider: path.join(baseDir, 'feature-flags.tsx'), cache: path.join(baseDir, 'flags-cache.ts'),
} : { provider: 'lib/feature-flags.tsx', cache: 'lib/flags-cache.ts' };
if (baseline) {
  for (const [file, esperado] of [
    [fontes.provider, 'a600d7781f66cb902fd1c603f01268aa31d5dc563a13df9d2a37778e3ffb6ca3'],
    [fontes.cache, '93cf5356305d835a2529c1c10118e56ef3e0d97f091096a33d6b9b7323196d39'],
  ]) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), esperado, 'baseline externa precisa ser a fonte preservada');
}
const linha = (enabled, key = chaveFlag) => ({ key, enabled, titulo: 'Aviso de teste', mensagem: 'Mensagem de teste', severidade: 'info', reativa_em: null, aviso_versao: 1, plataformas: null, versao_min: null, versao_max: null });
const mapa = enabled => ({ [chaveFlag]: linha(enabled) });
function montar(options = {}) {
  const c = { session: { user: { id: 'A' } }, pedidos: [], escritas: [], disco: new Map(), listeners: new Set(), leituras: 0 };
  const primeiraEscrita = pendente();
  if (options.cache) c.disco.set(chaveCache, JSON.stringify(options.cache));
  const store = {
    getItem: async key => { c.leituras++; return options.ler ? options.ler(key) : c.disco.get(key) ?? null; },
    setItem: async (key, raw) => {
      const numero = c.escritas.length;
      c.escritas.push({ key, mapa: JSON.parse(raw) });
      if (numero === 0 && options.primeiraPendente) await primeiraEscrita.promise;
      c.disco.set(key, raw);
    },
  };
  const mocks = {
    './auth-context': { useSession: () => ({ session: c.session }) },
    './supabase': { supabase: { from(tabela) {
      assert.equal(tabela, 'feature_flags');
      return { select(colunas) { const p = pendente(); p.colunas = colunas; c.pedidos.push(p); return p.promise; } };
    } } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: store },
    'expo-constants': { __esModule: true, default: { expoConfig: { version: '1.10.12' } } },
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener(_, fn) { c.listeners.add(fn); return { remove: () => c.listeners.delete(fn) }; } } },
  };
  const a = ambiente(mocks);
  mocks['./feature-flags-regras'] = a.load('lib/feature-flags-regras.ts');
  const cache = a.load(fontes.cache);
  mocks['./flags-cache'] = cache;
  const p = a.mount(a.load(fontes.provider).FlagsProvider);
  return { ...a, c, p, cache, primeiraEscrita, valor: (effects = true) => p.render(effects).props.value,
    responder(i, rows, error = null) { assert.ok(c.pedidos[i], 'consulta real precisa existir'); c.pedidos[i].resolve({ data: rows, error }); },
    dono(id) { c.session = id ? { user: { id } } : null; },
    async foreground() { for (const fn of c.listeners) fn('active'); await flush(); },
  };
}
const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);
caso('B desliga; resposta A antiga posterior não religa nem substitui cache', async () => {
  const a = montar(); a.valor(); await flush();
  const nova = a.valor().recarregar(); await flush();
  a.responder(1, [linha(false)]); await nova; await flush();
  assert.equal(a.valor().ligado(chaveFlag), false);
  a.responder(0, [linha(true)]); await flush();
  assert.equal(a.valor().ligado(chaveFlag), false, 'último pedido vence na tela');
  assert.equal(a.c.escritas.length, 1, 'resposta antiga não inicia gravação');
  assert.equal((await a.cache.lerFlagsGuardadas())[chaveFlag].enabled, false, 'cache final também permanece desligado'); a.p.unmount();
});
caso('troca de dono invalida resposta e callback antigos, inclusive A→B→A', async () => {
  const a = montar(); const antigo = a.valor(); await flush();
  a.dono('B'); a.valor(); await flush(); a.responder(1, [linha(false)]); await flush();
  a.responder(0, [linha(true)]); await flush(); assert.equal(a.valor().ligado(chaveFlag), false);
  a.dono('A'); a.valor(); await flush();
  const n = a.c.pedidos.length, obsoleto = antigo.recarregar(); await flush();
  assert.equal(a.c.pedidos.length, n, 'callback do primeiro ciclo A não emite consulta no novo A'); await obsoleto;
  a.responder(2, [linha(false)]); await flush();
  assert.equal((await a.cache.lerFlagsGuardadas())[chaveFlag].enabled, false); a.p.unmount();
});
caso('gravação A pendente não pode terminar depois de B e deixar cache antigo', async () => {
  const a = montar({ primeiraPendente: true }); a.valor(); await flush(); a.responder(0, [linha(true)]); await flush();
  assert.equal(a.c.escritas.length, 1);
  const nova = a.valor().recarregar(); a.responder(1, [linha(false)]); await nova; await flush();
  assert.equal(a.valor().ligado(chaveFlag), false, 'storage pendente não segura a publicação atual');
  assert.equal(a.c.escritas.length, 1, 'B espera A no storage');
  a.primeiraEscrita.resolve(); await flush();
  assert.equal(a.c.escritas.length, 2); assert.equal((await a.cache.lerFlagsGuardadas())[chaveFlag].enabled, false); a.p.unmount();
});
caso('cache pendente não ressuscita configuração depois de resposta vazia confirmada', async () => {
  const leitura = pendente(), a = montar({ ler: () => leitura.promise }); a.valor(); await flush();
  a.responder(0, []); await flush(); leitura.resolve(JSON.stringify(mapa(false))); await flush();
  assert.equal(a.valor().flag(chaveFlag), null, 'mapa vazio do servidor continua sendo a configuração confirmada');
  assert.equal(a.valor().ligado(chaveFlag), true, 'regra aberta para desconhecida permanece'); a.p.unmount();
});
caso('controle: cache pendente também não substitui B desligado não vazio', async () => {
  const leitura = pendente(), a = montar({ ler: () => leitura.promise }); a.valor(); await flush();
  a.responder(0, [linha(false)]); await flush(); leitura.resolve(JSON.stringify(mapa(true))); await flush();
  assert.equal(a.valor().ligado(chaveFlag), false); a.p.unmount();
});
caso('rejeição de gravação A deixa recibo e não envenena a gravação B', async () => {
  const a = montar({ primeiraPendente: true }); a.valor(); await flush(); a.responder(0, [linha(true)]); await flush();
  const nova = a.valor().recarregar(); a.responder(1, [linha(false)]); await nova; await flush();
  a.primeiraEscrita.reject(new Error('storage de teste indisponível')); await flush();
  assert.equal(a.c.escritas.length, 2); assert.equal((await a.cache.lerFlagsGuardadas())[chaveFlag].enabled, false);
  assert.ok(a.logs.some(log => String(log[0]).includes('não foi possível guardar'))); a.p.unmount();
});
caso('cache real captura snapshot antes de esperar a escrita anterior', async () => {
  const a = montar({ primeiraPendente: true });
  const primeira = a.cache.guardarFlags(mapa(true)); await flush();
  const mutavel = mapa(false), segunda = a.cache.guardarFlags(mutavel); mutavel[chaveFlag].enabled = true;
  assert.equal(a.c.escritas.length, 1); a.primeiraEscrita.resolve(); await Promise.all([primeira, segunda]);
  assert.equal((await a.cache.lerFlagsGuardadas())[chaveFlag].enabled, false, 'snapshot B não muda durante a fila');
});
caso('desmontar invalida resposta em voo antes de publicar ou gravar', async () => {
  const a = montar(); a.valor(); await flush(); a.p.unmount(); a.responder(0, [linha(false)]); await flush();
  assert.equal(a.c.escritas.length, 0, 'provider desmontado não grava resposta atrasada');
});
caso('controle: offline conserva mapa público e desconhecida ligada, sem aviso WhatsApp', async () => {
  const a = montar({ cache: { ...mapa(false), whatsapp: linha(false, 'whatsapp') } }); a.valor(); await flush();
  a.responder(0, null, { code: 'NETWORK', message: 'falha sintética' }); await flush();
  const v = a.valor(); assert.equal(v.ligado(chaveFlag), false); assert.equal(v.ligado('chave_desconhecida_audit'), true);
  assert.deepEqual(Array.from(v.avisosAtivos, f => f.key), [chaveFlag]); assert.equal(a.c.escritas.length, 0); a.p.unmount();
  const novo = montar(); novo.valor(); await flush(); novo.responder(0, null, { code: 'NETWORK' }); await flush(); assert.equal(novo.valor().ligado(chaveFlag), true); novo.p.unmount();
});
caso('mesmo dono com outro objeto de sessão não inicia recarga redundante', async () => {
  const a = montar(); a.valor(); await flush(); a.responder(0, [linha(false)]); await flush();
  a.dono('A'); a.valor(); await flush(); assert.equal(a.c.pedidos.length, 1); assert.equal(a.valor().ligado(chaveFlag), false); a.p.unmount();
});
caso('controle: retorno ao primeiro plano mantém consulta real e regra de aviso', async () => {
  const a = montar(); a.valor(); await flush(); a.responder(0, [linha(true)]); await flush();
  await a.foreground(); assert.equal(a.c.pedidos.length, 2); a.responder(1, [linha(false)]); await flush();
  assert.equal(a.valor().ligado(chaveFlag), false); assert.equal(a.valor().avisosAtivos.length, 1); a.p.unmount();
});
const rejeicoes = [];
process.on('unhandledRejection', e => rejeicoes.push(e));
const watchdog = setTimeout(() => { console.error('FALHA: regressão de flags não concluiu'); process.exit(1); }, 45_000);
(async () => {
  let falhas = 0;
  for (const [nome, fn] of casos) {
    try { await fn(); console.log('OK ' + nome); }
    catch (e) { falhas++; console.error('FALHA ' + nome + ': ' + e.stack); }
  }
  await new Promise(setImmediate);
  if (rejeicoes.length) { falhas++; console.error('FALHA: rejeição sem dono', rejeicoes.map(e => e?.name)); }
  clearTimeout(watchdog);
  console.log(`${casos.length - falhas}/${casos.length} grupos flags ${baseline ? 'BASELINE EXTERNA' : 'WIP'}`);
  process.exitCode = falhas ? 1 : 0;
})();
