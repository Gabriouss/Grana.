/*
 * O ouvinte de troca de token não pode virar laço (17/10/2026).
 *
 *   node __tests__/push-token-sem-laco.cjs
 *
 * O `getDevicePushTokenAsync` nativo do expo-notifications 57 chama
 * `onNewToken` a cada sucesso, e isso dispara o `addPushTokenListener`. O
 * `app/_layout.tsx` reagia ao evento sincronizando, a sincronização pedia o
 * token de novo, e o evento voltava: ~2,5 POST por segundo em `push_tokens`
 * com o app aberto na 1.10.7. Módulo REAL (`lib/push-notifications.ts`); o
 * dublê de expo-notifications imita o nativo, reemitindo o token a cada
 * `getExpoPushTokenAsync`, e o banco conta os upserts.
 */
require('./helpers/falha-com-duble-incompleto.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

function montar() {
  const e = { upserts: 0, ouvintes: [], tokenAtual: 'ExponentPushToken[a]' };
  const emitir = () => e.ouvintes.slice().forEach((f) => f({ data: e.tokenAtual.replace('Exponent', 'fcm-') }));
  const Notifications = {
    addPushTokenListener: (f) => { e.ouvintes.push(f); return { remove() {} }; },
    getExpoPushTokenAsync: async () => { setTimeout(emitir, 0); return { data: e.tokenAtual }; },
  };
  const sub = {
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'p' } } } } },
    'react-native': { Platform: { OS: 'android' } },
    './supabase': { supabase: { from: () => ({
      upsert: async () => { e.upserts++; return { error: null }; },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }) } },
    './notifications': {
      cancelDailyHabitReminder: async () => {},
      getNotifications: () => Notifications,
      requestNotificationPermission: async () => true,
    },
    './push-state': { limparEstadoPush: async () => {}, pushRemotoAtivo: async () => true,
      salvarEstadoPush: async () => {}, tokenPushSalvo: async () => null },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/push-notifications.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, console, Intl, Date, Promise, String, setTimeout, require: (id) => {
    if (id in sub) return sub[id];
    throw new Error('import nao simulado: ' + id);
  } });
  return { e, emitir, push: exports };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const prefs = { lembreteDiarioAtivo: true, almocoAtivo: false, horario: { hour: 20, minute: 0 } };

(async () => {
  /* O mesmo arranjo do app/_layout.tsx: sincroniza na abertura e a cada evento. */
  const { e, emitir, push } = montar();
  let reacoes = 0;
  const sincronizar = () => { reacoes++; return push.sincronizarPushHabito('u1', prefs); };
  push.observarTrocaDeTokenPush(sincronizar);
  await sincronizar();
  await pausa(50);
  assert.equal(e.upserts, 1, 'a abertura grava o token uma vez, e o eco do próprio pedido não dispara outra');
  assert.equal(reacoes, 1, 'nenhuma reação ao eco');

  /* Token rodado de verdade pelo FCM: uma resincronização, e o eco dela para. */
  e.tokenAtual = 'ExponentPushToken[b]';
  emitir();
  await pausa(50);
  assert.equal(reacoes, 2, 'token novo resincroniza uma vez');
  assert.equal(e.upserts, 2, 'token novo grava uma vez');
  console.log('push-token-sem-laco: ok (4 checagens)');
})().catch((erro) => { console.error('FALHOU', erro); process.exit(1); });
