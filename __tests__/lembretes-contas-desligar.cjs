/*
 * Desligar os lembretes de contas cancela sem rede e não volta (item 32,
 * achado do Compass, 10/11/2026).
 *
 *   node __tests__/lembretes-contas-desligar.cjs
 *
 * O Perfil salvava "desligado", esperava quatro consultas ao servidor
 * (contas, cartões, pagamentos, lançamentos) e só então cancelava os ids que
 * conseguia recalcular. Com uma consulta sem cache falhando, nada era
 * cancelado; fatura de ciclo fora do recorte ficava sempre. E um agendamento
 * já em curso (Contas, Crédito) repunha o lembrete depois do desligamento.
 *
 * Módulo REAL: `lib/notifications.ts` (preferências e agenda). Dublês: SDK de
 * notificações e AsyncStorage. Afirma o que ficou AGENDADO (regra 9).
 *
 * O desligamento é chamado como o Perfil chama. Na base, que não tem
 * `desligarLembretesDeContas`, o teste reproduz o fluxo antigo do Perfil
 * (`app/(app)/perfil.tsx`, HEAD 40d11e86): consultas em `Promise.all`, depois
 * `cancelBillReminders`/`cancelCardInvoiceReminders` pelos ids recalculados.
 */
require('./helpers/falha-com-duble-incompleto.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/* RAIZ_DO_MODULO: só para o RED de base, apontando para um `git archive` do HEAD anterior. */
const root = process.env.RAIZ_DO_MODULO || path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };

function montar() {
  const retidas = new Map();
  const armar = (nome) => retidas.set(nome, { armada: true, pendentes: [] });
  const reter = (nome, executar) => {
    const r = retidas.get(nome);
    if (!r || !r.armada) return executar();
    r.armada = false;
    return new Promise((resolver, rejeitar) => r.pendentes.push(() => executar().then(resolver, rejeitar)));
  };
  const soltar = async () => { for (const r of retidas.values()) { r.armada = false; for (const p of r.pendentes.splice(0)) p(); } await new Promise((r) => setTimeout(r, 30)); };

  const agendadas = new Map();
  const falhar = new Set();
  const disco = new Map();
  const avisos = [];
  const Notifications = {
    setNotificationHandler() {},
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: () => reter('permissao', async () => ({ status: 'granted' })),
    requestPermissionsAsync: async () => ({ status: 'granted' }),
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getAllScheduledNotificationsAsync: async () => {
      if (falhar.has('lista')) throw new Error('agenda ilegível (simulado)');
      return [...agendadas.values()];
    },
    scheduleNotificationAsync: async (req) => { agendadas.set(req.identifier, { identifier: req.identifier, content: req.content }); return req.identifier; },
    cancelScheduledNotificationAsync: async (id) => { agendadas.delete(id); },
  };
  const AsyncStorage = {
    getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
    setItem: async (k, v) => { disco.set(k, v); },
    removeItem: async (k) => { disco.delete(k); },
  };
  const dubles = {
    'react-native': { Platform: { OS: 'android' } },
    'expo-constants': { __esModule: true, default: { appOwnership: 'standalone' }, AppOwnership: { Expo: 'expo' } },
    'expo-notifications': Notifications,
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    './push-state': { pushRemotoAtivo: async () => false },
  };
  const cache = new Map();
  function carregar(arquivo) {
    const abs = path.join(root, arquivo);
    if (cache.has(abs)) return cache.get(abs);
    const exports = {};
    cache.set(abs, exports);
    const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(js, {
      exports, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
      console: { ...console, log() {}, warn: (...a) => avisos.push(a.map(String).join(' ')), error: (...a) => avisos.push(a.map(String).join(' ')) },
      setTimeout, clearTimeout,
      require: (id) => {
        if (id in dubles) return dubles[id];
        if (id.startsWith('./')) {
          const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
          if (fs.existsSync(path.join(root, alvo))) return carregar(alvo);
        }
        throw new Error('import nao simulado em ' + arquivo + ': ' + id);
      },
    }, { filename: arquivo });
    return exports;
  }
  return { api: carregar('lib/notifications.ts'), agendadas, falhar, armar, soltar, avisos };
}

/* Datas sempre no futuro, para o agendador não pular etapas. */
const futuro = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const conta = { id: 'b1', description: 'AUDIT Luz', due_date: futuro(20), status: 'pending', amount: 100 };
const CARTAO = '7a1c0b52-1111-4222-8333-944455556666';
const cartao = { id: CARTAO, name: 'AUDIT', due_day: 10, closing_day: 3 };
const ligado = { lembreteDiarioAtivo: true, horario: { hour: 20, minute: 30 }, lembretesContasAtivo: true, almocoAtivo: true };
const desligado = { ...ligado, lembretesContasAtivo: false };

/** Como o Perfil desliga. `consultas`: as quatro fontes do fluxo antigo. */
async function desligarComoOPerfil(api, consultas) {
  // Consulta que ninguém espera (o desligamento novo não consulta) não vira rejeição sem dono.
  consultas.forEach((p) => p.catch(() => {}));
  await api.salvarNotifPrefs(desligado);
  if (typeof api.desligarLembretesDeContas === 'function') return api.desligarLembretesDeContas();
  // Fluxo antigo (base): sem as quatro consultas, nada é cancelado.
  const [bills] = await Promise.all(consultas);
  bills.forEach((b) => { api.cancelBillReminders(b.id).catch(() => {}); });
  return 0;
}
const semRede = () => [Promise.resolve([conta]), Promise.reject(new Error('Network request failed (simulado)')), Promise.resolve([]), Promise.resolve([])];
const comRede = () => [Promise.resolve([conta]), Promise.resolve([cartao]), Promise.resolve([]), Promise.resolve([])];
const deContas = (agendadas) => [...agendadas.keys()].filter((id) => /^(conta|fatura)-/.test(id)).sort();

const falhas = [];
async function caso(nome, corpo) {
  try { await corpo(montar()); }
  catch (erro) { falhas.push(`${nome}: ${erro.message}`); console.log('  FALHOU  ' + nome + '\n          ' + erro.message); }
}

(async () => {
  await caso('desligar sem rede', async ({ api, agendadas }) => {
    await api.salvarNotifPrefs(ligado);
    await api.scheduleBillReminders(conta);
    await api.scheduleCardInvoiceReminders(cartao, 2026, 12, 300);
    /* Fatura de um ciclo que o recorte de 35 dias não calcula mais. */
    agendadas.set(`fatura-${CARTAO}-2026-3-atraso`, { identifier: `fatura-${CARTAO}-2026-3-atraso` });
    agendadas.set('habito-2026-11-21-noite', { identifier: 'habito-2026-11-21-noite' });
    agendadas.set('assinatura-u1-vence', { identifier: 'assinatura-u1-vence' });
    assert.ok(deContas(agendadas).length >= 3, 'preparo: há lembretes de conta e fatura agendados');
    await desligarComoOPerfil(api, semRede()).catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(deContas(agendadas), [], 'desligado sem rede: nenhum lembrete de conta ou fatura sobra, nem de ciclo antigo');
    assert.ok(agendadas.has('habito-2026-11-21-noite') && agendadas.has('assinatura-u1-vence'), 'hábito e assinatura ficam intocados');
    ok('desligar sem rede cancela todos os lembretes de conta e fatura, e só eles');
  });

  await caso('agendamento em curso não repõe o desligado', async ({ api, agendadas, armar, soltar }) => {
    await api.salvarNotifPrefs(ligado);
    armar('permissao');
    const emCurso = [api.scheduleBillReminders(conta)];
    await new Promise((r) => setTimeout(r, 10));
    await desligarComoOPerfil(api, comRede());
    await soltar();
    await Promise.all(emCurso);
    assert.deepEqual(deContas(agendadas), [], 'o agendamento que estava esperando a permissão não volta a agendar depois de desligar');
    ok('agendamento em curso (Contas/Crédito) não repõe lembretes depois de desligar');
  });

  await caso('conta criada com o toggle desligado', async ({ api, agendadas }) => {
    await api.salvarNotifPrefs(desligado);
    await api.scheduleBillReminders(conta);
    assert.deepEqual(deContas(agendadas), [], 'com lembretes de contas desligados, nenhuma conta agenda');
    ok('com o toggle desligado, criar ou editar conta não agenda lembrete');
  });

  await caso('agenda ilegível dá recibo', async ({ api, falhar }) => {
    assert.equal(typeof api.desligarLembretesDeContas, 'function', 'existe um desligamento que não depende do servidor');
    falhar.add('lista');
    await assert.rejects(desligarComoOPerfil(api, comRede()), /agend/i, 'falha nativa ao ler a agenda chega à tela');
    ok('agenda ilegível: o desligamento rejeita e o Perfil mostra o recibo');
  });

  await caso('religar volta a agendar', async ({ api, agendadas }) => {
    await desligarComoOPerfil(api, comRede());
    await api.salvarNotifPrefs(ligado);
    await api.scheduleBillReminders(conta);
    assert.ok(deContas(agendadas).some((id) => id.startsWith('conta-b1-')), 'depois de religar, a conta volta a ter lembrete');
    ok('religar os lembretes volta a agendar normalmente');
  });

  if (falhas.length) {
    console.log(`\n${falhas.length} caso(s) falharam:\n- ${falhas.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`\nlembretes-contas-desligar: ${checagens} checagens ok`);
  process.exit(0);
})().catch((erro) => { console.error(erro); process.exit(1); });
