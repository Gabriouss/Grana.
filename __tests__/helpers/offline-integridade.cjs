const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '../..');
const fontes = new Map();
const FILA = 'grana:queue:transactions-pendentes';
const REVISAO = 'grana:queue:precisa-de-revisao';
const JOURNAL = 'grana:queue:movimento';
const TELA = 'grana:cache:tela:teste';
const turno = () => new Promise(resolve => setImmediate(resolve));
function promessa() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
async function ate(condicao) {
  for (let i = 0; i < 100; i++) { if (condicao()) return; await turno(); }
  throw new Error('O módulo não chegou à etapa controlada.');
}
function montar(disco = new Map()) {
  const estado = { usuario: 'A', disco, chamadas: [], escritas: [], timers: [], erros: [], morto: false, corte: 0 };
  const instancias = new Map();
  const storage = {
    async getItem(k) {
      if (estado.morto) throw new Error('processo interrompido');
      const valor = disco.get(k) ?? null;
      if (estado.antesDeLer) await estado.antesDeLer(k);
      return valor;
    },
    async setItem(k, v) {
      if (estado.morto) throw new Error('processo interrompido');
      if (estado.antesDeGravar) await estado.antesDeGravar(k, v);
      disco.set(k, v); registrar(k);
    },
    async removeItem(k) {
      if (estado.morto) throw new Error('processo interrompido');
      disco.delete(k); registrar(k);
    },
    async getAllKeys() { return [...disco.keys()]; },
    async multiRemove(ks) { for (const k of ks) disco.delete(k); },
  };
  function registrar(k) {
    estado.escritas.push(k);
    if (estado.corte && estado.escritas.length === estado.corte) {
      estado.morto = true;
      throw new Error('processo interrompido depois da escrita durável');
    }
  }
  const enviar = tipo => async (input, dono) => {
    estado.chamadas.push({ tipo, input, dono });
    if (estado.enviar) return estado.enviar(tipo, input, dono);
    const linha = { id: 'real', user_id: dono, ...input };
    return tipo === 'parcela' ? [linha] : linha;
  };
  function carregar(nome) {
    if (instancias.has(nome)) return instancias.get(nome);
    const caminho = process.env.OFFLINE_INTEGRIDADE_BASE
      ? path.join(process.env.OFFLINE_INTEGRIDADE_BASE, nome + '.ts') : path.join(raiz, 'lib', nome + '.ts');
    if (!fontes.has(caminho)) fontes.set(caminho, ts.transpileModule(fs.readFileSync(caminho, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText);
    const exports = {};
    instancias.set(nome, exports);
    vm.runInNewContext(fontes.get(caminho), {
      exports, console: { ...console, error: (...args) => estado.erros.push(args), warn() {} },
      setTimeout: (fn, ms) => { const t = { fn, ms, ativo: true, unref() {} }; estado.timers.push(t); return t; },
      clearTimeout: t => { if (t) t.ativo = false; },
      require: id => {
        if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
        if (id === './sessao-offline') return {
          idDoUsuarioLocal: async () => estado.lerDono ? estado.lerDono() : estado.usuario,
          sessaoEstaTravada: () => false,
        };
        if (id === './data') return { addTransaction: enviar('transacao'), addInstallmentPurchase: enviar('parcela'), addBill: enviar('boleto') };
        if (id === './goals') return { createGoal: enviar('meta'), metaJaGravada: async () => !!estado.metaNoBanco };
        if (id === './lancamentos-alterados') return { marcarLancamentosAlterados() {} };
        if (id === './notifications') return { getNotifications: () => ({ scheduleNotificationAsync: async () => {} }) };
        if (['./fila-pendente', './offline-cache', './cache-de-tela'].includes(id)) return carregar(id.slice(2));
        throw new Error('Import não simulado: ' + id);
      },
    }, { filename: nome + '.ts' });
    return exports;
  }
  return { estado, carregar, ler: k => JSON.parse(disco.get(k) || '[]'), disparar: ms => {
    const t = estado.timers.find(t => t.ativo && t.ms === ms);
    if (!t) throw new Error('Timer ausente: ' + ms);
    t.ativo = false; t.fn();
  } };
}
const input = { type: 'out', description: 'sintético', amount: 12, category: 'teste', color: '#fff', occurred_on: '2026-11-11', installments: 2 };
const item = (localId = 'x', tipo = 'transacao') => ({ localId, tipo, input, userId: 'A', clientRequestId: 'chave-' + localId, tentadoEm: '2026-11-10T12:00:00Z' });
const revisao = i => ({ ...i, motivo: { code: '23514', message: 'sintético' }, revisaoDesde: '2026-11-10T12:00:00Z' });
module.exports = { montar, promessa, ate, turno, input, item, revisao, FILA, REVISAO, JOURNAL, TELA };
