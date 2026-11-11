// Executar somente em janela de RAM autorizada.
// --baseline prova o laço no blob original 8ab, sem checkout/alterar a árvore.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');

async function filho() {
  const ts = require('typescript');
  const cache = new Map(), disco = new Map(), agendadas = [], canceladas = [];
  let remoto = false, permitido = true;
  const expo = {
    setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
    AndroidImportance: { HIGH: 4 }, SchedulableTriggerInputTypes: { DATE: 'date' },
    getPermissionsAsync: async () => ({ status: permitido ? 'granted' : 'denied' }),
    requestPermissionsAsync: async () => ({ status: 'denied' }),
    getAllScheduledNotificationsAsync: async () => [],
    scheduleNotificationAsync: async req => { agendadas.push(req); return req.identifier; },
    cancelScheduledNotificationAsync: async id => { canceladas.push(id); },
  };
  const stubs = {
    'react-native': { Platform: { OS: 'android' } },
    'expo-constants': { __esModule: true, default: { appOwnership: 'standalone' }, AppOwnership: { Expo: 'expo' } },
    'expo-notifications': expo,
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async k => disco.get(k) ?? null,
      setItem: async (k, v) => { disco.set(k, v); }, removeItem: async k => { disco.delete(k); },
    } },
    './push-state': { pushRemotoAtivo: async () => remoto },
    './notification-messages': { obterProximaMensagem: async (_, janela) => ({ id: janela, titulo: 'Fixture', texto: 'Fixture', categoria: 'fixture' }) },
    './format': {}, './faturaCiclo': {}, './aviso-assinatura': {},
  };
  function carregar(file) {
    if (cache.has(file)) return cache.get(file);
    const fonte = baseline
      ? cp.execFileSync('git', ['--no-optional-locks', '-C', root, 'show', '8ab466cb9217800eb87f001e9b5dc89392d1c778:' + file], { encoding: 'utf8', windowsHide: true })
      : fs.readFileSync(path.join(root, file), 'utf8');
    const api = {}; cache.set(file, api);
    vm.runInNewContext(ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
      exports: api, Date, console, setTimeout, clearTimeout,
      require(id) {
        if (id in stubs) return stubs[id];
        if (id.startsWith('.')) return carregar(path.posix.join(path.posix.dirname(file), id + '.ts'));
        throw Error('Import não simulado: ' + id);
      },
    }, { filename: file });
    return api;
  }
  const api = carregar('lib/notifications.ts');
  const { planejarLembretesHabito: planejar } = carregar('lib/notification-schedule.ts');
  process.send({ pronto: true });
  const base = { agora: new Date(2026, 10, 11, 8), hour: 20, minute: 30, jaLancouHoje: false };
  if (baseline) {
    disco.set('@grana_notif_prefs', JSON.stringify({ horario: { hour: 21 } }));
    const prefs = await api.carregarNotifPrefs();
    // O módulo original recebe minute undefined e trava aqui. Watchdog está NO PAI.
    planejar({ ...base, ...prefs.horario, minute: prefs.horario.minute });
    throw Error('Baseline retornou sem reproduzir o laço esperado');
  }
  const invalidos = [
    { hour: undefined }, { minute: undefined }, { hour: NaN }, { minute: Infinity },
    { hour: -1 }, { hour: 24 }, { hour: 2.5 }, { hour: '20' }, { minute: -1 }, { minute: 60 }, { minute: null },
    { agora: new Date(NaN) }, { agora: null }, { agora: '2026-11-11' },
    ...[NaN, Infinity, -1, 0.5, 8, '7'].map(quantidade => ({ quantidade })), { janela: 'invalida' },
  ];
  for (const delta of invalidos) assert.throws(() => planejar({ ...base, ...delta }), /inválid/);
  assert.throws(() => planejar({ ...base, agora: new Date(8640000000000000), jaLancouHoje: true }), /intervalo|janela/);
  assert.equal(planejar({ ...base, quantidade: 0 }).length, 0);
  for (const janela of ['noite', 'almoco', 'meio_dia_finde']) {
    const plano = planejar({ ...base, janela, jaLancouHoje: true });
    assert.equal(plano.length, 7);
    assert.equal(new Set(plano.map(p => p.id)).size, 7);
    assert.ok(plano.every(p => p.diasDesdeHoje > 0 && p.quando > base.agora));
    if (janela !== 'noite') assert.ok(plano.every(p => [0, 6].includes(p.quando.getDay()) === (janela === 'meio_dia_finde')));
  }
  for (const [horario, esperado] of [
    [{ hour: 21 }, [21, 30]], [{ minute: 5 }, [20, 5]], [null, [20, 30]],
    [{ hour: 0, minute: 0 }, [0, 0]], [{ hour: 24, minute: 60 }, [20, 30]],
    [{ hour: '20', minute: 2.5 }, [20, 30]],
  ]) {
    disco.set('@grana_notif_prefs', JSON.stringify({ horario, almocoAtivo: false }));
    const prefs = await api.carregarNotifPrefs();
    assert.deepEqual([prefs.horario.hour, prefs.horario.minute], esperado);
    assert.equal(prefs.almocoAtivo, false);
    await api.salvarNotifPrefs({ ...prefs, horario });
    const salvo = JSON.parse(disco.get('@grana_notif_prefs'));
    assert.deepEqual([salvo.horario.hour, salvo.horario.minute], esperado);
  }
  const opt = { hour: 21, jaLancouHoje: true, streak: 1, diasInativo: 0 };
  await api.scheduleDailyHabitReminder(opt);
  assert.equal(agendadas.length, 21);
  const noite = agendadas.filter(r => r.content.data.janela === 'noite');
  assert.equal(noite.length, 7);
  assert.ok(noite.every(r => r.trigger.date.getHours() === 21 && r.trigger.date.getMinutes() === 30));
  for (const r of agendadas.filter(r => r.content.data.janela !== 'noite')) {
    assert.equal(r.trigger.date.getHours(), 12);
    assert.equal(r.trigger.date.getMinutes(), 0);
    assert.equal([0, 6].includes(r.trigger.date.getDay()), r.content.data.janela === 'meio_dia_finde');
  }
  agendadas.length = 0;
  await api.scheduleDailyHabitReminder({ ...opt, almocoAtivo: false });
  assert.equal(agendadas.length, 7);
  agendadas.length = 0; remoto = true;
  await api.scheduleDailyHabitReminder({ ...opt, hour: NaN });
  assert.equal(agendadas.length, 0, 'push remoto mantém precedência');
  assert.ok(canceladas.includes('habito-diario'));
  remoto = false; permitido = false;
  await api.scheduleDailyHabitReminder(opt);
  assert.equal(agendadas.length, 0, 'permissão negada não agenda');
  console.log('S1: módulos reais, preferências por campo, plano finito, três janelas e push preservados.');
}

if (process.argv.includes('--child')) {
  filho().then(() => { process.disconnect(); }, e => { console.error(e); process.exitCode = 1; process.disconnect(); });
} else {
  const child = cp.spawn(process.execPath, [__filename, '--child', ...(baseline ? ['--baseline'] : [])], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  let pronto = false, expirou = false;
  const timeout = () => { expirou = true; child.kill(); };
  let watchdog = setTimeout(timeout, 20000);
  child.on('message', msg => {
    if (!msg.pronto) return;
    pronto = true; clearTimeout(watchdog); watchdog = setTimeout(timeout, 3000);
  });
  child.on('error', e => { clearTimeout(watchdog); console.error(e); process.exitCode = 1; });
  child.on('exit', code => {
    clearTimeout(watchdog);
    if (baseline && pronto && expirou) console.log('S1 baseline 8ab: laço reproduzido no módulo original; watchdog externo encerrou só o filho próprio.');
    else if (expirou || code !== 0) { console.error('S1 falhou: timeout externo ou erro do subprocesso', { pronto, expirou, code }); process.exitCode = 1; }
  });
}
