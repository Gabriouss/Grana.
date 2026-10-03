/*
 * Fila corrompida cujo backup FALHA: a gravação seguinte não pode sobrescrever
 * a única cópia do que a pessoa registrou sem rede.
 *
 *   node __tests__/fila-backup-falha.cjs
 *
 * Achado F1 (P1) do Watchtower, 02/10/2026: `lerFila` capturava a falha de
 * `setItem(...:corrompida)` e devolvia `[]`; `atualizarFila` gravava a fila
 * nova por cima do bruto ilegível, e nada ficava guardado.
 *
 * Módulos REAIS: lib/fila-pendente.ts (núcleo) e lib/offline-cache.ts (por
 * onde as janelas do app guardam sem rede). O disco é falso e registra QUAIS
 * escritas aconteceram. Para provar que o teste pega o defeito, rode contra o
 * fonte antigo: FILA_FONTE=<arquivo .ts> node __tests__/fila-backup-falha.cjs
 *
 * Paridade (regra 13): o lançamento por voz, no app e no widget, tem fila
 * própria (voz-pendente) e não passa por aqui; esta fila é a das janelas
 * (`atualizarFila`), e todas as entradas dela passam pelo mesmo `lerFila`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

const FILA = 'grana:queue:transactions-pendentes';
const BRUTO = '[{"localId":"AUDIT-antigo","input":{"description":"DINHEIRO"';
let aprovadas = 0;
const ok = (c, nome) => { assert.ok(c, nome); aprovadas++; console.log('  ok  ' + nome); };

function montar({ falhaBackup, falhaLeitura = false }) {
  const disco = new Map([[FILA, BRUTO]]);
  const escritas = [];
  const AsyncStorage = {
    async getItem(k) { if (falhaLeitura && k === FILA) throw new Error('AUDIT leitura'); return disco.has(k) ? disco.get(k) : null; },
    async setItem(k, v) {
      escritas.push(k);
      if (falhaBackup && k.startsWith(FILA + ':corrompida')) throw new Error('AUDIT falha ao preservar');
      disco.set(k, v);
    },
    async removeItem(k) { disco.delete(k); },
  };
  const cache = new Map();
  function carregar(arquivo, fonte) {
    const abs = path.join(root, arquivo);
    if (cache.has(abs)) return cache.get(abs);
    const exports = {};
    cache.set(abs, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(fonte || abs, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, {
      exports, console: { ...console, error() {} }, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Uint8Array,
      crypto: globalThis.crypto, setTimeout, clearTimeout,
      require: (id) => {
        if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: AsyncStorage };
        if (id === './sessao-offline') return { idDoUsuarioLocal: async () => 'u-1' };
        if (id === './fila-pendente') return carregar('lib/fila-pendente.ts', process.env.FILA_FONTE);
        if (id === './cache-de-tela') return { avisarDadoNovo() {}, guardarTela: async () => {}, isLikelyNetworkError: () => true, lancamentoGravado() {}, lerTela: async () => null };
        if (id === './data') return { addBill: async () => {}, addInstallmentPurchase: async () => {}, addTransaction: async () => { throw new Error('nao deveria enviar'); } };
        if (id === './goals') return { createGoal: async () => {}, metaJaGravada: async () => false };
        if (id === './lancamentos-alterados') return { marcarLancamentosAlterados() {} };
        throw new Error('import nao simulado em ' + arquivo + ': ' + id);
      },
    }, { filename: arquivo });
    return exports;
  }
  return { disco, escritas, fila: carregar('lib/fila-pendente.ts', process.env.FILA_FONTE), offline: carregar('lib/offline-cache.ts') };
}

(async () => {
  console.log('F1: backup da fila ilegível falha');
  {
    const { disco, escritas, fila } = montar({ falhaBackup: true });
    let erro = null;
    try { await fila.atualizarFila((f) => [...f, { localId: 'AUDIT-novo', input: {} }]); } catch (e) { erro = e; }
    ok(erro !== null, 'atualizarFila REJEITA (o salvamento sabe que não ficou guardado)');
    ok(disco.get(FILA) === BRUTO, 'o bruto ilegível continua intacto na chave da fila');
    ok(!escritas.includes(FILA), 'nenhuma escrita na chave da fila');
    ok(escritas.every((k) => k.startsWith(FILA + ':corrompida')), 'as únicas tentativas de escrita foram as do backup');
  }
  {
    const { disco, escritas, fila } = montar({ falhaBackup: true });
    const lida = await fila.getQueue();
    ok(Array.isArray(lida) && lida.length === 0, 'getQueue (só leitura) devolve vazio sem lançar');
    ok(disco.get(FILA) === BRUTO && !escritas.includes(FILA), 'e não grava nada na fila');
  }
  {
    /* Entrada das janelas do app: o erro chega a quem chama, e nada é gravado. */
    const { disco, escritas, offline } = montar({ falhaBackup: true });
    let erro = null;
    try {
      await offline.queuePendingTransaction({ type: 'out', description: 'AUDIT', amount: 1, category: 'x', color: '#fff', occurred_on: '2026-10-02' });
    } catch (e) { erro = e; }
    ok(erro !== null, 'queuePendingTransaction (janelas) rejeita em vez de fingir que guardou');
    ok(disco.get(FILA) === BRUTO && !escritas.includes(FILA), 'bruto intacto pelo caminho das janelas');
  }

  console.log('Controle: com o backup funcionando, nada muda');
  {
    const { disco, escritas, fila } = montar({ falhaBackup: false });
    const nova = await fila.atualizarFila((f) => [...f, { localId: 'AUDIT-novo', input: {} }]);
    ok(nova.length === 1 && nova[0].localId === 'AUDIT-novo', 'a fila nova é gravada');
    ok(disco.get(FILA + ':corrompida') === BRUTO, 'o bruto foi preservado à parte');
    ok(escritas[0] === FILA + ':corrompida' && escritas[1] === FILA, 'ordem das escritas: backup primeiro, fila depois');
  }
  console.log(`\n${aprovadas} checagens ok`);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
