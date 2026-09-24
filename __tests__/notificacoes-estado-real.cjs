/*
 * Lembretes locais partem do estado real e continuam verdadeiros depois
 * de agendados (auditoria de notificações, 24/09/2026).
 *
 *   node __tests__/notificacoes-estado-real.cjs
 *
 * Módulos de produção transpilados em memória; `expo-notifications` é um
 * agendador falso que guarda o que foi pedido, e o teste afirma sobre o que
 * ficou AGENDADO, não sobre o valor devolvido.
 *
 *  1. `lib/contexto-lembrete.ts`: parcela futura não zera a inatividade,
 *     parcela que cai hoje não conta como "já lançou", gasto de ontem
 *     registrado hoje conta.
 *  2. `lib/notifications.ts`, hábito: depois de voltar a lançar, nenhum
 *     lembrete de "uns dias sem registrar" sobra na janela; a sequência sai
 *     com o número atual; toda mensagem com dia marcado cai no dia dela.
 *  3. `lib/notifications.ts`, fatura: vencimento no dia 31 respeita o fim do
 *     mês, igual à tela Crédito (`lib/faturaCiclo.ts`).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

function carregar(arquivo, dubles = {}, cache = new Map()) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
    setTimeout, clearTimeout,
    require: (id) => {
      if (id in dubles) return dubles[id];
      if (id.startsWith('./')) {
        const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregar(alvo, dubles, cache);
      }
      throw new Error('import nao simulado em ' + arquivo + ': ' + id);
    },
  }, { filename: arquivo });
  return exports;
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasAtras = (n, base = new Date()) => new Date(base.getFullYear(), base.getMonth(), base.getDate() - n, 15, 0, 0);
function tx(occurred, criadoEm) {
  return { id: Math.random().toString(36).slice(2), type: 'out', description: 'AUDIT', amount: 1, category: 'Outros', color: '#fff',
    occurred_on: occurred, created_at: criadoEm ? criadoEm.toISOString() : undefined, recurring: false, parent_id: null };
}

/* ── 1. Contexto ────────────────────────────────────────────────────────── */
function contexto() {
  console.log('\nContexto do lembrete');
  const { contextoDoLembrete } = carregar('lib/contexto-lembrete.ts');
  const agora = new Date(2026, 8, 24, 19, 0, 0); // quinta

  /* Compra parcelada registrada há 5 dias: a última parcela, em 2027, fica no
     topo da lista (ordem por occurred_on). Antes: diasInativo negativo. */
  const parcelada = [tx('2027-02-19', diasAtras(5, agora)), tx('2026-10-19', diasAtras(5, agora)), tx('2026-09-19', diasAtras(5, agora))];
  let c = contextoDoLembrete(parcelada, agora);
  assert.equal(c.diasInativo, 5);
  assert.equal(c.jaLancouHoje, false);
  ok('parcela futura no topo não zera a inatividade (5 dias)');

  /* Parcela que cai hoje, de compra registrada há 10 dias. */
  c = contextoDoLembrete([tx(iso(agora), diasAtras(10, agora)), tx('2026-09-14', diasAtras(10, agora))], agora);
  assert.equal(c.jaLancouHoje, false);
  assert.equal(c.diasInativo, 10);
  ok('parcela que cai hoje não conta como "já lançou hoje"');

  /* Gasto de ontem registrado hoje. */
  c = contextoDoLembrete([tx(iso(diasAtras(1, agora)), new Date(2026, 8, 24, 9, 0, 0))], agora);
  assert.equal(c.jaLancouHoje, true);
  assert.equal(c.diasInativo, 0);
  ok('gasto de ontem registrado hoje conta como hoje');

  /* Registro às 22h30 de ontem: dia local, não UTC. */
  c = contextoDoLembrete([tx(iso(diasAtras(1, agora)), new Date(2026, 8, 23, 22, 30, 0))], agora);
  assert.equal(c.jaLancouHoje, false);
  assert.equal(c.diasInativo, 1);
  ok('registro de ontem à noite é ontem no horário local');

  assert.deepEqual({ ...contextoDoLembrete([], agora) }, { jaLancouHoje: false, streak: 0, diasInativo: 99 });
  ok('sem lançamento: 99 dias, sequência 0');

  /* Sequência coerente com a da gamificação: três dias seguidos até hoje. */
  c = contextoDoLembrete([0, 1, 2].map((n) => tx(iso(diasAtras(n, agora)), diasAtras(n, agora))), agora);
  assert.equal(c.streak, 3);
  assert.equal(c.jaLancouHoje, true);
  ok('sequência de 3 dias até hoje');
}

/* ── Notificações com agendador falso ───────────────────────────────────── */
function montarNotificacoes() {
  const agendadas = new Map();
  const disco = new Map();
  const expoNotifications = {
    setNotificationHandler() {},
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ status: 'granted' }),
    requestPermissionsAsync: async () => ({ status: 'granted' }),
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getAllScheduledNotificationsAsync: async () => [...agendadas.values()],
    scheduleNotificationAsync: async (req) => { agendadas.set(req.identifier, JSON.parse(JSON.stringify(req))); return req.identifier; },
    cancelScheduledNotificationAsync: async (id) => { agendadas.delete(id); },
  };
  const AsyncStorage = {
    getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
    setItem: async (k, v) => { disco.set(k, v); },
    removeItem: async (k) => { disco.delete(k); },
  };
  const api = carregar('lib/notifications.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-constants': { __esModule: true, default: { appOwnership: 'standalone' }, AppOwnership: { Expo: 'expo' } },
    'expo-notifications': expoNotifications,
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    './push-state': { pushRemotoAtivo: async () => false },
  });
  return { api, agendadas };
}

/* ── 2. Hábito ──────────────────────────────────────────────────────────── */
async function habito() {
  console.log('\nLembrete de hábito');
  const { MENSAGENS } = carregar('lib/notification-catalog.ts');
  const porId = new Map(MENSAGENS.map((m) => [m.id, m]));
  const { api, agendadas } = montarNotificacoes();
  const habitos = () => [...agendadas.values()].filter((r) => r.content.data?.tipo === 'habito-diario');
  const base = { hour: 23, minute: 59, almocoAtivo: true };

  /* Parado há 5 dias: a janela inteira é de "uns dias sem registrar". */
  await api.scheduleDailyHabitReminder({ ...base, jaLancouHoje: false, streak: 0, diasInativo: 5 });
  const antes = habitos();
  assert.ok(antes.length >= 7, 'janela agendada');
  /* Oito mensagens de retomada para 14 lembretes: o que sobra cai no sorteio
     geral por desenho (evitar repetir), nunca na sequência. */
  const deRetomada = antes.filter((r) => r.content.data.categoria === 'saudade').length;
  assert.ok(deRetomada >= 7, `retomada: ${deRetomada}`);
  assert.ok(antes.every((r) => r.content.data.categoria !== 'streak_protecao'));
  ok(`parado há 5 dias: ${deRetomada} de ${antes.length} lembretes de retomada, nenhum de sequência`);

  /* Voltou a lançar hoje, com sequência de 1. */
  await api.scheduleDailyHabitReminder({ ...base, jaLancouHoje: true, streak: 1, diasInativo: 0 });
  const depois = habitos();
  for (const r of depois) {
    const quando = new Date(r.trigger.date);
    const k = Math.round((new Date(quando.getFullYear(), quando.getMonth(), quando.getDate()) - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000);
    if (r.content.data.categoria === 'saudade') {
      assert.ok(k >= 2, `${r.identifier}: saudade a ${k} dia(s) de quem lançou hoje`);
    }
  }
  assert.ok(depois.some((r) => r.content.data.categoria !== 'saudade'), 'amanhã deixa de ser saudade');
  ok('depois de voltar a lançar, retomada só a partir de 2 dias sem registro');

  /* Sequência muda: nenhum lembrete fica com o número velho. */
  await api.scheduleDailyHabitReminder({ ...base, jaLancouHoje: true, streak: 4, diasInativo: 0 });
  await api.scheduleDailyHabitReminder({ ...base, jaLancouHoje: true, streak: 5, diasInativo: 0 });
  for (const r of habitos()) {
    if (r.content.data.categoria !== 'streak_protecao') continue;
    assert.equal(r.content.data.streak, 5, r.identifier);
    assert.ok(!/\b4 dias\b/.test(r.content.body), r.content.body);
  }
  ok('sequência sai com o número atual');

  /* Dia citado confere com o dia do disparo, em tudo que ficou agendado. */
  for (const r of habitos()) {
    const m = porId.get(r.content.data.mensagemId);
    assert.ok(m, r.content.data.mensagemId);
    const dia = new Date(r.trigger.date).getDay();
    if (m.dias) assert.ok(m.dias.includes(dia), `${m.id} no dia ${dia}`);
    if (r.content.data.janela === 'almoco') assert.ok(dia !== 0 && dia !== 6, 'almoço em fim de semana');
  }
  ok('mensagem com dia marcado cai no dia dela; almoço só em dia útil');

  /* Estado igual: nada é sorteado de novo (a rotação não é gasta). */
  const ids = JSON.stringify(habitos().map((r) => [r.identifier, r.content.data.mensagemId]).sort());
  await api.scheduleDailyHabitReminder({ ...base, jaLancouHoje: true, streak: 5, diasInativo: 0 });
  assert.equal(JSON.stringify(habitos().map((r) => [r.identifier, r.content.data.mensagemId]).sort()), ids);
  ok('com o mesmo estado, a janela fica como estava');

  /* Lembrete de versão anterior (sem categoria gravada) é refeito uma vez. */
  const umId = habitos()[0].identifier;
  const velho = agendadas.get(umId);
  velho.content.data = { tipo: 'habito-diario', mensagemId: 'noturno-1', janela: velho.content.data.janela };
  await api.scheduleDailyHabitReminder({ ...base, jaLancouHoje: true, streak: 5, diasInativo: 0 });
  assert.equal(typeof agendadas.get(umId).content.data.categoria, 'string');
  ok('lembrete antigo, sem estado gravado, é refeito');
}

/* ── 3. Fatura ──────────────────────────────────────────────────────────── */
async function fatura() {
  console.log('\nLembrete de fatura');
  const { api, agendadas } = montarNotificacoes();
  /* Fevereiro de 2027, fecha 25 e vence 31: vence em 28/02. */
  await api.scheduleCardInvoiceReminders({ id: 'c1', name: 'AUDIT', closing_day: 25, due_day: 31 }, 2027, 1, 100);
  const datas = [...agendadas.values()].map((r) => [r.identifier.split('-').pop(), iso(new Date(r.trigger.date)), new Date(r.trigger.date).getHours()]);
  assert.deepEqual(datas.sort(), [['3d', '2027-02-25', 9], ['atraso', '2027-03-01', 9], ['venc', '2027-02-28', 9]]);
  ok('vencimento dia 31 em fevereiro: 25/02, 28/02 e 01/03, às 9h');

  agendadas.clear();
  await api.scheduleCardInvoiceReminders({ id: 'c2', name: 'AUDIT', closing_day: 3, due_day: 10 }, 2027, 0, 100);
  assert.deepEqual([...agendadas.values()].map((r) => iso(new Date(r.trigger.date))).sort(), ['2027-01-07', '2027-01-10', '2027-01-11']);
  ok('caso comum (fecha 3, vence 10) segue igual');
}

(async () => {
  contexto();
  await habito();
  await fatura();
  console.log(`\n${aprovadas} checagens de notificação pelo estado real passaram — 0 falhas`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
