/*
 * Token e agenda pendurados não prendem o lembrete (item 31, achado S6 do
 * Sentinel, 10/11/2026).
 *
 *   node __tests__/push-intencao-pendurada.cjs
 *
 * `sincronizarPushHabito` encadeava toda tentativa numa fila global; com
 * `getExpoPushTokenAsync` pendurado, novos foregrounds, o Perfil e a saída
 * da conta ficavam atrás dele, e o fallback local nunca era decidido. A fila
 * do lembrete local (`lib/notifications.ts`) tinha o mesmo efeito com
 * `getAllScheduledNotificationsAsync` ou `scheduleNotificationAsync`
 * pendurados. E um token que respondesse tarde gravava no servidor o
 * contexto antigo (outra preferência, outro dono).
 *
 * Afirma QUAIS escritas chegaram ao banco (regra 9): upserts com dono e
 * horário, nunca de uma intenção superada, inclusive quando a resposta
 * pendurada chega depois.
 *
 * Módulos REAIS: `lib/push-notifications.ts`, `lib/notifications.ts`,
 * `lib/push-state.ts` e o que eles importam. Dublês: SDK de notificações,
 * AsyncStorage e Supabase. Relógio do sandbox encurtado (ms/200); os prazos
 * de produção não mudam. Cada caso monta um ambiente novo.
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
const setTimeoutCurto = (fn, ms, ...a) => setTimeout(fn, Math.max(0, Math.ceil((ms ?? 0) / 200)), ...a);

function montar({ pushJaAtivo = false } = {}) {
  /* Etapas seguráveis: a PRIMEIRA chamada armada fica pendurada até `soltar`. */
  const retidas = new Map();
  const armar = (nome) => retidas.set(nome, { armada: true, pendentes: [] });
  const reter = (nome, executar) => {
    const r = retidas.get(nome);
    if (!r || !r.armada) return executar();
    r.armada = false;
    return new Promise((resolver, rejeitar) => r.pendentes.push(() => executar().then(resolver, rejeitar)));
  };
  const soltar = () => { for (const r of retidas.values()) { r.armada = false; for (const p of r.pendentes.splice(0)) p(); } };

  const e = { upserts: [], deletes: [], agendadas: new Map(), tokenAtual: 'ExponentPushToken[a]', avisos: [] };
  const disco = new Map(pushJaAtivo ? [['@grana_push_habito_ativo', '1'], ['@grana_expo_push_token', 'ExponentPushToken[a]']] : []);
  const AsyncStorage = {
    getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
    setItem: async (k, v) => { disco.set(k, v); },
    removeItem: async (k) => { disco.delete(k); },
    multiSet: async (pares) => { for (const [k, v] of pares) disco.set(k, v); },
    multiRemove: async (ks) => { for (const k of ks) disco.delete(k); },
  };
  const expoNotifications = {
    setNotificationHandler() {},
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ status: 'granted' }),
    requestPermissionsAsync: async () => ({ status: 'granted' }),
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    addPushTokenListener: () => ({ remove() {} }),
    getExpoPushTokenAsync: () => reter('token', async () => ({ data: e.tokenAtual })),
    getAllScheduledNotificationsAsync: () => reter('lista', async () => [...e.agendadas.values()]),
    scheduleNotificationAsync: (req) => reter('agendar', async () => { e.agendadas.set(req.identifier, JSON.parse(JSON.stringify(req))); return req.identifier; }),
    cancelScheduledNotificationAsync: async (id) => { e.agendadas.delete(id); },
  };
  const supabase = {
    from: (tabela) => {
      assert.equal(tabela, 'push_tokens');
      return {
        upsert: async (linha) => { e.upserts.push({ user_id: linha.user_id, hora: linha.horario_hora, ativo: linha.ativo }); return { error: null }; },
        delete: () => ({ eq: async (_c, token) => { e.deletes.push(token); return { error: null }; } }),
      };
    },
  };
  const dubles = {
    'react-native': { Platform: { OS: 'android' } },
    'expo-constants': { __esModule: true, default: { appOwnership: 'standalone', expoConfig: { extra: { eas: { projectId: 'p' } } } }, AppOwnership: { Expo: 'expo' } },
    'expo-notifications': expoNotifications,
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    './supabase': { supabase },
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
      console: { ...console, log() {}, warn: (...a) => e.avisos.push(a.map(String).join(' ')), error: (...a) => e.avisos.push(a.map(String).join(' ')) },
      setTimeout: setTimeoutCurto, clearTimeout,
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
  const push = carregar('lib/push-notifications.ts');
  const notif = carregar('lib/notifications.ts');
  return { e, disco, armar, soltar, push, notif };
}

const ligado = { lembreteDiarioAtivo: true, almocoAtivo: false, lembretesContasAtivo: true, horario: { hour: 20, minute: 0 } };
/** Menos que o prazo do token (75 ms aqui): o primeiro pedido já saiu e ainda espera. */
const pedindoToken = () => new Promise((r) => setTimeout(r, 10));
const tique = () => new Promise((r) => setTimeout(r, 150));
function comLimite(promessa, oQue) {
  let corte;
  return Promise.race([
    promessa,
    new Promise((_, rejeitar) => { corte = setTimeout(() => rejeitar(new assert.AssertionError({ message: `${oQue}: ficou preso na etapa segurada, sem desfecho` })), 1_500); }),
  ]).finally(() => clearTimeout(corte));
}
const habito = (e) => [...e.agendadas.values()].filter((r) => r.content?.data?.tipo === 'habito-diario');

const falhas = [];
async function caso(nome, corpo) {
  const amb = montar(corpo.opcoes);
  try { await corpo(amb); }
  catch (erro) { falhas.push(`${nome}: ${erro.message}`); console.log('  FALHOU  ' + nome + '\n          ' + erro.message); }
  finally { amb.soltar(); await tique(); }
}

(async () => {
  await caso('dois foregrounds com o token pendurado', async ({ e, armar, soltar, push }) => {
    armar('token');
    const p1 = push.sincronizarPushHabito('u1', ligado);
    await pedindoToken(); // o primeiro já está esperando o token
    const p2 = push.sincronizarPushHabito('u1', ligado);
    const [r1, r2] = await comLimite(Promise.all([p1, p2]), 'dois foregrounds');
    assert.equal(r1, 'superada', 'o primeiro foreground cede ao mais novo');
    assert.equal(r2, 'push', 'o mais novo registra o push');
    soltar();
    await tique();
    assert.deepEqual(e.upserts, [{ user_id: 'u1', hora: 20, ativo: true }], 'um upsert só, mesmo depois de o token pendurado responder');
    ok('dois foregrounds com o token pendurado: a fila anda, um upsert só');
  });

  await caso('desligar durante o token', async ({ e, disco, armar, soltar, push }) => {
    armar('token');
    const p1 = push.sincronizarPushHabito('u1', ligado);
    await pedindoToken(); // o primeiro já está esperando o token
    const p2 = push.sincronizarPushHabito('u1', { ...ligado, lembreteDiarioAtivo: false });
    const [r1, r2] = await comLimite(Promise.all([p1, p2]), 'desligar');
    assert.equal(r1, 'superada');
    assert.equal(r2, 'desativado');
    soltar();
    await tique();
    assert.deepEqual(e.upserts, [], 'o token que chega depois de desligar não grava o lembrete no servidor');
    assert.equal(disco.get('@grana_push_habito_ativo'), undefined, 'estado local: push desligado');
    ok('desligar durante o token: desativado, sem upsert tardio');
  });

  await caso('troca de dono durante o token', async ({ e, armar, soltar, push }) => {
    armar('token');
    const p1 = push.sincronizarPushHabito('u1', ligado);
    await pedindoToken(); // o primeiro já está esperando o token
    const saida = push.removerPushHabitoAntesDeSair();
    const p2 = push.sincronizarPushHabito('u2', { ...ligado, horario: { hour: 7, minute: 30 } });
    const [r1, , r2] = await comLimite(Promise.all([p1, saida, p2]), 'troca de dono');
    assert.equal(r1, 'superada');
    assert.equal(r2, 'push');
    soltar();
    await tique();
    assert.deepEqual(e.upserts, [{ user_id: 'u2', hora: 7, ativo: true }], 'só o novo dono, com as preferências dele; nada da conta que saiu');
    ok('troca de dono durante o token: nenhum upsert com o contexto antigo');
  });

  for (const pushJaAtivo of [false, true]) {
    const nome = `token pendurado com push ${pushJaAtivo ? 'já ativo' : 'novo'}`;
    const corpo = async ({ e, armar, push, notif }) => {
      armar('token');
      const resultado = await comLimite(push.sincronizarPushHabito('u1', ligado), nome);
      assert.equal(resultado, pushJaAtivo ? 'push' : 'fallback-local', 'estouro do token segue o mesmo caminho de um token que falhou');
      assert.deepEqual(e.upserts, []);
      assert.ok(e.avisos.some((a) => /token/i.test(a)), 'e deixa log');
      if (!pushJaAtivo) {
        await comLimite(notif.scheduleDailyHabitReminder({ hour: 20, minute: 0, jaLancouHoje: false, streak: 0, diasInativo: 0, almocoAtivo: false }), nome + ' (agendar local)');
        assert.ok(habito(e).length > 0, 'o fallback local agenda os lembretes');
      }
      ok(`${nome}: desfecho ${pushJaAtivo ? '"push" preservado' : '"fallback-local" e lembrete local agendado'}`);
    };
    corpo.opcoes = { pushJaAtivo };
    await caso(nome, corpo);
  }

  for (const etapa of ['lista', 'agendar']) {
    await caso(`agendador: ${etapa} pendurado`, async ({ e, armar, soltar, push, notif }) => {
      armar(etapa);
      const opts = { hour: 20, minute: 0, jaLancouHoje: false, streak: 0, diasInativo: 0, almocoAtivo: false };
      await comLimite(notif.scheduleDailyHabitReminder(opts), etapa);
      // A fila do hábito andou: o cancelamento que o push espera não fica atrás.
      await comLimite(notif.cancelDailyHabitReminder(), etapa + ' (cancelar depois)');
      assert.equal(habito(e).length, 0, 'o cancelamento seguinte rodou e limpou a janela');
      const r = await comLimite(push.sincronizarPushHabito('u1', ligado), etapa + ' (push depois)');
      assert.equal(r, 'push');
      soltar();
      await tique();
      assert.ok(e.avisos.some((a) => /no prazo/.test(a)), 'e deixa log do agendador que não respondeu');
      ok(`agendador com ${etapa} pendurado: a fila do lembrete anda e o push não fica preso`);
    });
  }

  if (falhas.length) {
    console.log(`\n${falhas.length} caso(s) falharam:\n- ${falhas.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`\npush-intencao-pendurada: ${checagens} checagens ok`);
  process.exit(0);
})().catch((erro) => { console.error(erro); process.exit(1); });
