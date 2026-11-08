// Hook, serviço, armazenamento e sincronizador REAIS; só React, relógio e I/O são dublês.
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
assert.equal(new Date('2026-12-01T03:00:01Z').getTimezoneOffset(), 180, 'fixture exige horário de São Paulo');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

module.exports = async function testarCicloDaSobra() {
  const watchdog = setTimeout(() => {
    console.error('sobra-ciclo-de-vida: prazo excedido antes de concluir a suíte');
    process.exit(1);
  }, 3000);
  try {
  let instante = '2026-11-07T12:00:00-03:00', usuario = 'A', corrente, foco = true;
  let discoLento = false, gravarLento = false;
  const disco = new Map(), consultas = [], escritas = [], leituras = [], timers = new Map(), eventos = new Set(), snapshots = [];
  const DateReal = Date;
  class Relogio extends DateReal {
    constructor(...args) { super(...(args.length ? args : [instante])); }
    static now() { return new DateReal(instante).getTime(); }
  }
  const igual = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const React = {
    useState(ini) {
      const ctx = corrente, i = ctx.cursor++;
      if (!(i in ctx.slots)) ctx.slots[i] = typeof ini === 'function' ? ini() : ini;
      return [ctx.slots[i], v => { ctx.slots[i] = typeof v === 'function' ? v(ctx.slots[i]) : v; }];
    },
    useRef: ini => React.useState(() => ({ current: ini }))[0],
    useCallback(fn, deps) {
      const ctx = corrente, i = ctx.cursor++, antes = ctx.slots[i];
      if (!antes || !igual(antes.deps, deps)) ctx.slots[i] = { deps, fn };
      return ctx.slots[i].fn;
    },
  };
  function useFocusEffect(fn) {
    const ctx = corrente, i = ctx.cursor++, antes = ctx.slots[i];
    if (!antes || antes.fn !== fn || antes.foco !== foco) {
      if (antes?.limpar) antes.limpar();
      const slot = { fn, foco, limpar: null }; ctx.slots[i] = slot;
      if (foco) ctx.efeitos.push(() => { slot.limpar = fn(); });
    }
  }
  const supabase = { from(tabela) {
    const filtro = {};
    const q = {
      select() { return q; }, eq(k, v) { filtro[k] = v; return q; },
      maybeSingle() { return new Promise(resolve => consultas.push({ tabela, filtro, resolve })); },
      upsert(linha) {
        return new Promise(resolve => {
          escritas.push({ linha, resolve }); if (!gravarLento) resolve({ error: null });
        });
      },
    }; return q;
  } };
  const stubs = {
    react: React, 'expo-router': { useFocusEffect },
    'react-native': { AppState: { addEventListener: (_, fn) => { eventos.add(fn); return { remove: () => eventos.delete(fn) }; } } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: k => discoLento ? new Promise(resolve => leituras.push({ k, resolve })) : Promise.resolve(disco.get(k) ?? null),
      setItem: async (k, v) => { disco.set(k, v); },
    } },
    './supabase': { supabase }, './sessao-offline': { idDoUsuarioLocal: async () => usuario },
    './data': { fetchTransactions: async () => [], fetchBills: async () => [], fetchCreditCards: async () => [], fetchCardInvoicePayments: async () => [] },
    './goals': { fetchGoals: async () => [] },
    '@/modules/grana-voice-widget': { widgetDisponivel: true, atualizarSnapshot: s => snapshots.push(s), garantirUsuario() {}, definirPrivacidade() {}, limparSnapshot() {} },
  };
  const cache = new Map(); let timerId = 0;
  function real(rel) {
    const file = path.resolve(root, rel);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(js, { exports, Date: Relogio, console: { error() {}, warn() {} },
      setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
      require(id) {
        if (id in stubs) return stubs[id];
        if (id.startsWith('.')) return real(path.resolve(path.dirname(file), id + '.ts'));
        throw Error('Import inesperado: ' + id);
      },
    }, { filename: file }); return exports;
  }
  const hook = real('lib/use-sobra-do-mes.ts').useSobraDoMes;
  const servico = real('lib/sobra-do-mes.ts');
  const ctx = { slots: [], cursor: 0, efeitos: [] }; let resultado;
  function render() {
    corrente = ctx; ctx.cursor = 0;
    resultado = hook(usuario, true); ctx.efeitos.splice(0).forEach(fn => fn()); return resultado;
  }
  const tick = () => new Promise(resolve => setImmediate(resolve));
  async function consultar(valor = null) {
    await tick(); const q = consultas.shift(); assert.ok(q, 'consulta real aconteceu');
    assert.equal(q.filtro.user_id, usuario); assert.equal(q.filtro.mes, instante.slice(0, 7));
    q.resolve({ data: valor === null ? null : { valor }, error: null }); await tick(); return render();
  }
  const valor = () => servico.sobraParaOLivre(resultado.sobraDoMes, usuario, resultado.hoje.slice(0, 7));
  const retomar = () => eventos.forEach(fn => fn('active'));
  function desfocar() { foco = false; render(); }
  function focar() { foco = true; render(); }

  render(); await consultar();
  assert.equal(resultado.sobraAdiada, false);
  resultado.adiar(); render(); assert.equal(resultado.sobraAdiada, true); assert.equal(escritas.length, 0);
  retomar(); await consultar(); assert.equal(resultado.sobraAdiada, true, 'mesmo dia não pergunta');
  instante = '2026-11-08T12:00:00-03:00'; retomar(); await consultar();
  assert.equal(resultado.sobraAdiada, false, 'retorno sem remount revalida o dia');
  resultado.adiar(); render(); desfocar(); instante = '2026-11-09T12:00:00-03:00'; focar(); await consultar();
  assert.equal(resultado.sobraAdiada, false, 'foco também revalida');

  retomar(); await tick(); consultas.shift().resolve({ data: null, error: { code: '08006' } });
  await tick(); render(); assert.equal(resultado.erro, true);
  resultado.recarregar(); render(); await consultar();
  assert.equal(resultado.erro, false, 'atualização manual recupera a fonte com erro');

  // Leituras sobrepostas de adiamento e dado financeiro não ultrapassam geração/usuário.
  discoLento = true; retomar(); await tick();
  const antiga = consultas.shift(), adiamentoAntigo = leituras.shift();
  usuario = 'B'; discoLento = false; render();
  assert.equal(resultado.sobraDoMes, null, 'troca de usuário esconde o estado anterior imediatamente');
  await consultar();
  antiga.resolve({ data: { valor: 900 }, error: null }); adiamentoAntigo.resolve('2026-11-09'); await tick(); render();
  assert.equal(resultado.sobraAdiada, false); assert.equal(valor(), 0);

  // Uma resposta anterior ao toque em Agora não não desfaz o adiamento.
  const adiarCapturado = resultado.adiar;
  retomar(); await tick(); const anteriorAoToque = consultas.shift();
  adiarCapturado(); anteriorAoToque.resolve({ data: null, error: null }); await tick(); render();
  assert.equal(resultado.sobraAdiada, true);

  // Confirmação corrente realmente escreve no dono/mês certos.
  await resultado.confirmar(80); render(); assert.equal(valor(), 80);
  assert.equal(escritas.at(-1).linha.user_id, 'B'); assert.equal(escritas.at(-1).linha.mes, '2026-11');
  retomar(); await consultar(80); assert.equal(valor(), 80);
  retomar(); await tick(); const leituraNovembro = consultas.shift();
  instante = '2026-12-01T00:00:01-03:00'; render();
  assert.equal(valor(), 0, 'novembro nunca financia dezembro, mesmo antes da releitura');
  const timer = [...timers.values()][0]; timers.clear(); timer(); await consultar();
  assert.equal(resultado.sobraDoMes.mes, '2026-12'); assert.equal(resultado.sobraAdiada, false);
  leituraNovembro.resolve({ data: { valor: 999 }, error: null }); await tick(); render();
  assert.equal(valor(), 0, 'resposta tardia de novembro não substitui dezembro');

  // Pergunta antiga e identidade antiga são recusadas antes de qualquer escrita.
  const dezembro = resultado.confirmar, antes = escritas.length;
  instante = '2027-01-01T00:00:01-03:00';
  await assert.rejects(() => dezembro(500), /conta ou o mês mudou/);
  render(); retomar(); await consultar();
  const contaB = resultado.confirmar; usuario = 'C'; render(); await consultar();
  await assert.rejects(() => contaB(500), /conta ou o mês mudou/);
  assert.equal(escritas.length, antes);

  // Uma gravação já enviada pode terminar, mas nunca publicar estado na nova conta/mês.
  gravarLento = true; const lenta = resultado.confirmar(50); const rejeitada = assert.rejects(lenta, /conta ou o mês mudou/);
  await tick(); usuario = 'D'; render(); await consultar();
  escritas.at(-1).resolve({ error: null }); await rejeitada; render();
  assert.equal(valor(), 0); assert.equal(resultado.sobraDoMes.userId, 'D');

  // Limpeza de foco invalida leituras que terminam depois de sair da tela.
  retomar(); await tick(); const fora = consultas.shift(); desfocar();
  fora.resolve({ data: { valor: 777 }, error: null }); await tick(); render(); assert.equal(valor(), 0);
  assert.equal(eventos.size, 0); assert.equal(timers.size, 0);

  // Widget real: a mesma validação de dono/mês e descarte de busca que cruza a virada.
  const sync = real('lib/widgets-home-sync.ts');
  instante = '2026-11-30T23:59:59-03:00'; usuario = 'A';
  const widgetAntigo = sync.sincronizarWidgetsHome('A', false); await tick(); const qAntiga = consultas.shift();
  instante = '2026-12-01T00:00:01-03:00'; qAntiga.resolve({ data: { valor: 1000 }, error: null });
  assert.equal(await widgetAntigo, false); assert.equal(snapshots.length, 0);
  const widgetNovo = sync.sincronizarWidgetsHome('A', false); await tick();
  consultas.shift().resolve({ data: null, error: null }); assert.equal(await widgetNovo, true);
  assert.equal(snapshots[0].safeToSpend.livreTotal, 0);
  const widgetA = sync.sincronizarWidgetsHome('A', false); await tick(); const qA = consultas.shift();
  usuario = 'B'; const widgetB = sync.sincronizarWidgetsHome('B', false); await tick(); const qB = consultas.shift();
  qB.resolve({ data: null, error: null }); assert.equal(await widgetB, true);
  qA.resolve({ data: { valor: 900 }, error: null }); assert.equal(await widgetA, false);
  assert.equal(snapshots.at(-1).userId, 'B'); assert.equal(snapshots.length, 2);
  console.log('sobra-ciclo-de-vida: módulos reais, dia/foco/foreground, novembro-dezembro, usuário, leituras/escritas atrasadas e widget ok');
  } finally {
    clearTimeout(watchdog);
  }
};

if (require.main === module) module.exports().catch(e => { console.error(e); process.exitCode = 1; });
