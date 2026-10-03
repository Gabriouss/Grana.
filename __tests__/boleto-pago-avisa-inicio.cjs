/*
 * Pagar ou reabrir boleto marca os lancamentos como alterados, para a Inicio
 * recarregar as transacoes e o Saldo atual nao ficar velho (achado P1 da
 * auditoria de 03/10/2026). O modulo e o real (`lib/data.ts`); so Supabase e
 * dependencias sao dubles. Falha do rpc NAO marca (nada mudou no banco).
 *
 *   node __tests__/boleto-pago-avisa-inicio.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

function carregar(erro) {
  const marcas = { n: 0 };
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/data.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const resposta = { data: { id: 'b' }, error: erro, count: 0 };
  const q = new Proxy(function () {}, { get: (_a, p) => (p === 'then' ? (r) => r(resposta) : () => q) });
  const deps = {
    './supabase': { supabase: { from: () => q, rpc: () => Promise.resolve(resposta) } },
    './cache-de-tela': { comCacheOffline: (_n, f) => f, invalidarRespostasAtrasadas() {} },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './lancamentos-alterados': { marcarLancamentosAlterados() { marcas.n++; } },
    './fila-pendente': { juntarPendentes: async (l) => l },
    './voz-pendente-na-lista': { juntarVozPendente: async (l) => l },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './transaction-rules': {},
    './paginacao': { buscarTodasAsPaginas: async () => [] },
    './types': { CATEGORIES: [] },
    './recorrencia': {},
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
  };
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Map, Set,
    require: (id) => { if (id in deps) return deps[id]; throw new Error('import nao simulado: ' + id); },
  }, { filename: 'lib/data.ts' });
  return { data: exports, marcas };
}

(async () => {
  for (const [nome, rodar] of [
    ['payBill', (m) => m.data.payBill({ id: 'b' }, '2026-10-03')],
    ['reopenBill', (m) => m.data.reopenBill({ id: 'b' })],
  ]) {
    const bom = carregar(null);
    await rodar(bom);
    assert.equal(bom.marcas.n, 1, nome + ' nao marcou os lancamentos como alterados');
    const ruim = carregar({ code: '42501', message: 'negado' });
    await assert.rejects(rodar(ruim));
    assert.equal(ruim.marcas.n, 0, nome + ' marcou mesmo com o rpc recusado');
    console.log('  ok  ' + nome);
  }
})().catch((e) => { console.error('FALHOU', e.message); process.exit(1); });
