// Providers/helper reais + builder PostgREST e fetchWithAuth INSTALADOS.
// Somente a fronteira do transporte é falsa. Não há rede ou credencial real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PostgrestClient } = require('@supabase/postgrest-js');
const { ambiente, flush, pendente } = require('./helpers/providers-controlados.cjs');
const raiz = path.resolve(__dirname, '..');
const tokenA = 'credencial-sintetica-A', tokenB = 'credencial-sintetica-B';
const ativacaoA = 'ativacao-sintetica-A';
const acesso = { enforced: true, allowed: true, active: true, status: 'active', access_until: '2099-01-01', grace_until: null };
const sessoes = dono => ({ user: { id: dono }, access_token: dono === 'A' ? tokenA : tokenB });

function fetchDoSdk() {
  const exports = {};
  const file = path.join(raiz, 'node_modules/@supabase/supabase-js/src/lib/fetch.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { exports, Headers, URL, console: { warn() {} }, require(id) {
    // Tracing desligado neste teste; a seleção de Authorization é a REAL.
    if (id === '@supabase/tracing' || id === './tracingRegistry') return {};
    throw Error('Import do SDK sem dublê: ' + id);
  } }, { filename: file });
  return exports.fetchWithAuth;
}

function montar() {
  const c = { tokenGlobal: tokenA, session: sessoes('A'), esperandoToken: [], enviados: [], efeitos: { A: 0, B: 0 }, remocoes: 0, gravacoes: [] };
  const autorizado = fetchDoSdk()('anon-sintetica', 'https://sdk-audit.invalid', async () => {
    const espera = pendente();
    c.esperandoToken.push(espera);
    await espera.promise;
    return c.tokenGlobal;
  }, async (url, init) => {
    const header = init.headers.get('Authorization');
    const dono = header === `Bearer ${tokenA}` ? 'A' : header === `Bearer ${tokenB}` ? 'B' : null;
    const nome = new URL(url).pathname.split('/').at(-1);
    const cancelado = init.signal?.aborted === true;
    c.enviados.push({ dono, nome, cancelado, ativacao: JSON.parse(init.body ?? '{}').p_token });
    if (cancelado) throw Object.assign(new Error('pedido cancelado'), { name: 'AbortError' });
    assert.ok(dono, 'o transporte precisa de uma autorização de sessão explícita');
    c.efeitos[dono]++;
    const data = nome === 'obter_estado_acesso' ? acesso : nome === 'vincular_assinatura_por_token' ? true : null;
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const banco = new PostgrestClient('https://sdk-audit.invalid/rest/v1', { fetch: autorizado });
  const store = {
    getItem: async key => key === '@grana_token_ativacao_pendente' ? ativacaoA : null,
    setItem: async (_, raw) => c.gravacoes.push(JSON.parse(raw).userId),
    removeItem: async () => { c.remocoes++; },
  };
  const a = ambiente({
    './supabase': { supabase: { rpc: (...args) => banco.rpc(...args) } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: store },
    './auth-context': { useSession: () => ({ session: c.session, isLoading: false, sessaoNaoConfirmada: false, emRecuperacao: false }) },
    './offline-cache': { isLikelyNetworkError: () => false }, './modo-teste': { MODO_TESTE: false },
    './notifications': { sincronizarAvisosAssinatura: async () => {} },
    './cache-de-tela': { assinarLeituraEsvaziou: () => () => {} },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  });
  async function aguardarPedido(indice) {
    for (let i = 0; i < 6 && !c.esperandoToken[indice]; i++) { await flush(); await new Promise(setImmediate); }
    assert.ok(c.esperandoToken[indice], 'o pedido deve chegar à espera REAL de getAccessToken');
  }
  async function soltar(indice) {
    await aguardarPedido(indice);
    c.esperandoToken[indice].resolve();
    await flush(); await new Promise(setImmediate);
  }
  return { ...a, c, soltar, aguardarPedido };
}

const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);
caso('helper real fixa A nas duas RPCs mesmo com SDK global B e contexto alterado após iniciar', async () => {
  const a = montar(), controle = new AbortController();
  const contexto = { dono: 'A', tokenDeAcesso: tokenA, geracao: {}, podeContinuar: () => true, sinal: controle.signal, fim: Date.parse('2026-11-11T12:00:00Z') + 12_000 };
  const promessa = a.load('lib/assinatura.ts').vincularAssinaturasPendentes(contexto);
  await a.aguardarPedido(0);
  assert.equal(a.c.enviados.length, 0, 'SDK realmente aguarda a seleção de token antes do fetch');
  a.c.tokenGlobal = tokenB;
  // O helper precisa ter copiado os campos primitivos antes de qualquer await.
  contexto.dono = 'B'; contexto.tokenDeAcesso = tokenB;
  await a.soltar(0); await a.soltar(1);
  assert.equal((await promessa).houveFalha, false);
  assert.deepEqual(a.c.enviados.map(p => p.nome), ['vincular_assinatura_automatica', 'vincular_assinatura_por_token']);
  assert.ok(a.c.enviados.every(p => p.dono === 'A'), 'ambas as RPCs mantêm Authorization da origem');
  assert.ok(a.c.enviados[1].ativacao === ativacaoA, 'o token de ativação também é o da origem');
  assert.equal(a.c.efeitos.B, 0);
});
caso('provider/helper reais fixam A em TODAS as RPCs do ciclo antes de React renderizar B', async () => {
  const a = montar();
  const p = a.mount(a.load('lib/entitlement-context.tsx').EntitlementProvider);
  p.render(); await a.aguardarPedido(0);
  a.c.tokenGlobal = tokenB; a.c.session = sessoes('B');
  await a.soltar(0); await a.soltar(1); await a.soltar(2);
  assert.deepEqual(a.c.enviados.map(p => p.nome), ['vincular_assinatura_automatica', 'vincular_assinatura_por_token', 'obter_estado_acesso']);
  assert.ok(a.c.enviados.every(p => p.dono === 'A'), 'inclusive obter_estado_acesso fixa o Bearer capturado');
  assert.equal(a.c.efeitos.B, 0); assert.deepEqual(a.c.gravacoes, ['A']);
  const primeiraB = p.render(false).props.value;
  assert.equal(primeiraB.estado, null, 'a próxima pintura continua mascarando o estado A');
  p.unmount();
});
caso('troca renderizada durante getAccessToken aborta token A sem enviar efeito para B', async () => {
  const a = montar();
  const p = a.mount(a.load('lib/entitlement-context.tsx').EntitlementProvider);
  p.render(); await a.soltar(0); await a.aguardarPedido(1);
  a.c.tokenGlobal = tokenB; a.c.session = sessoes('B');
  assert.equal(p.render().props.value.estado, null); p.unmount();
  await a.soltar(1);
  assert.ok(a.c.enviados.every(p => p.dono === 'A'), 'mesmo pedido cancelado conserva Authorization da origem');
  assert.ok(a.c.enviados.some(p => p.nome === 'vincular_assinatura_por_token' && p.cancelado));
  assert.equal(a.c.efeitos.B, 0); assert.equal(a.c.efeitos.A, 1);
  assert.equal(a.c.remocoes, 0); assert.equal(a.c.gravacoes.length, 0);
});

const rejeicoes = [];
process.on('unhandledRejection', e => rejeicoes.push(e));
const watchdog = setTimeout(() => { console.error('FALHA: regressão de autorização não concluiu'); process.exit(1); }, 45_000);
(async () => {
  let falhas = 0;
  for (const [nome, fn] of casos) {
    try { await fn(); console.log('OK ' + nome); }
    catch (e) { falhas++; console.error('FALHA ' + nome + ': ' + e.stack); }
  }
  await new Promise(setImmediate);
  if (rejeicoes.length) { falhas++; console.error('FALHA: rejeição sem dono', rejeicoes.map(e => e?.name)); }
  clearTimeout(watchdog);
  console.log(`${casos.length - falhas}/${casos.length} grupos de autorização de origem`);
  process.exitCode = falhas ? 1 : 0;
})();
