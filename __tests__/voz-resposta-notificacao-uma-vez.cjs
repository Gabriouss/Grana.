/*
 * O mesmo toque na notificação de voz é tratado uma vez só (item 50, achado
 * S10 do Sentinel, 10/11/2026).
 *
 *   node __tests__/voz-resposta-notificacao-uma-vez.cjs
 *
 * `components/RespostaVozWidget.tsx` escuta duas fontes: a última resposta
 * (`getLastNotificationResponseAsync`, app aberto PELA notificação) e o
 * listener vivo. As duas podiam entregar o mesmo toque, e uma remontagem
 * relia a última resposta: a revisão abria duas vezes, e o "Desfazer" rodava
 * duas vezes. A falha ao abrir a revisão pelo getter virava rejeição sem dono.
 *
 * Componente REAL, executado com um React mínimo (efeitos rodam na montagem,
 * a limpeza na desmontagem). Dublês: SDK de notificações, roteador, decisão de
 * destino e desfazer. Afirma QUANTAS navegações e desfazeres aconteceram
 * (regra 9), com recibos de fala do app e do widget (regra 13).
 */
require('./helpers/falha-com-duble-incompleto.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/* RAIZ_DO_MODULO: só para o RED de base, apontando para a cópia do HEAD anterior. */
const root = process.env.RAIZ_DO_MODULO || path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };
const semDono = [];
process.on('unhandledRejection', (erro) => { semDono.push(String(erro?.message ?? erro)); });

const DEFAULT = 'expo.modules.notifications.actions.DEFAULT';
function montar() {
  const e = { pushes: [], desfeitos: [], ouvintes: [], ultima: null, limpezas: 0, erros: [], destinoFalha: false, alertas: [] };
  const Notifications = {
    getLastNotificationResponseAsync: async () => e.ultima,
    addNotificationResponseReceivedListener: (f) => { e.ouvintes.push(f); return { remove: () => { e.ouvintes = e.ouvintes.filter((g) => g !== f); } }; },
    clearLastNotificationResponse: () => { e.limpezas++; e.ultima = null; },
  };
  const router = { push: (rota) => { e.pushes.push(JSON.parse(JSON.stringify(rota))); } };
  let limpezasDoEfeito = [];
  const dubles = {
    react: { useEffect: (fn) => { const l = fn(); if (typeof l === 'function') limpezasDoEfeito.push(l); } },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'android' } },
    'expo-router': { useRouter: () => router },
    '@/lib/alerta': { Alert: { alert: (titulo, texto, botoes) => { e.alertas.push({ titulo, texto, botoes: botoes ?? [] }); } } },
    '@/lib/data': { deleteBill: async () => {}, deleteTransaction: async () => {} },
    '@/lib/destino-da-fala-referencias': { destinoDaFalaComReferencias: async () => { if (e.destinoFalha) throw new Error('destino indisponível (simulado)'); return 'inicio'; } },
    '@/lib/notifications': { getNotifications: () => Notifications },
    '@/lib/voice-operations': { desfazerOperacaoVoz: async (id) => { e.desfeitos.push(id); } },
    '@/lib/widget-voz-notificacoes': { ACAO_DESFAZER: 'desfazer', podeNotificar: async () => true, tirarDaBandeja: async () => {} },
    '@/lib/sessao-offline': { idDoUsuarioLocal: async () => null },
    '@/lib/data-da-fala': { referenciaDaFala: () => undefined, referenciaParaParametros: () => ({}) },
    '@/lib/format': { todayISO: () => '2026-11-20' },
    '@/lib/voz-recibos-da-fila': { listarRecibosDaFila: async () => [], observarRecibosDaFila: () => () => {}, removerReciboDaFila: async () => {} },
    '@/modules/grana-voice-widget': { definirEstado() {}, estadoAtual: () => 'ocioso', widgetDisponivel: false },
  };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'components/RespostaVozWidget.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, JSON, Object, Array, String, Error, Promise, Set, Map, Math, Date, setTimeout, clearTimeout,
    console: { ...console, log() {}, warn: (...a) => e.erros.push(a.map(String).join(' ')), error: (...a) => e.erros.push(a.map(String).join(' ')) },
    require: (id) => { if (id in dubles) return dubles[id]; throw new Error('import nao simulado: ' + id); },
  }, { filename: 'components/RespostaVozWidget.tsx' });
  const Componente = exports.default;
  return {
    e,
    montar: () => Componente(),
    desmontar: () => { limpezasDoEfeito.forEach((l) => l()); limpezasDoEfeito = []; },
    tocar: (resposta) => e.ouvintes.slice().forEach((f) => f(resposta)),
  };
}
const espera = () => new Promise((r) => setTimeout(r, 20));
const resposta = (identifier, data, actionIdentifier = DEFAULT) => ({ actionIdentifier, notification: { request: { identifier, content: { data } } } });

const falhas = [];
async function caso(nome, corpo) {
  try { await corpo(montar()); }
  catch (erro) { falhas.push(`${nome}: ${erro.message}`); console.log('  FALHOU  ' + nome + '\n          ' + erro.message); }
}

(async () => {
  for (const source of ['app', 'widget']) {
    await caso(`revisão pelos dois canais (${source})`, async ({ e, montar, tocar }) => {
      const r = resposta(`voz-req-${source}`, { origem: 'voz', resultado: 'revisar', transcricao: 'Mercado R$ 1899' });
      e.ultima = r;
      montar();
      tocar(r); // o listener entrega o mesmo toque
      await espera();
      assert.equal(e.pushes.length, 1, 'getter e listener com o mesmo toque: uma navegação só');
      assert.equal(e.pushes[0].params.colarTexto, 'Mercado R$ 1899');
      ok(`revisão de fala do ${source}: getter e listener abrem a revisão uma vez`);
    });
  }

  await caso('Desfazer pelos dois canais', async ({ e, montar, tocar }) => {
    const r = resposta('voz-req-salvo', { origem: 'voz', resultado: 'salvo', tipo: 'transaction', ids: ['t1'], operationId: 'op-1' }, 'desfazer');
    e.ultima = r;
    montar();
    tocar(r);
    await espera();
    assert.deepEqual(e.desfeitos, ['op-1'], 'o mesmo Desfazer, pelos dois canais, desfaz uma vez');
    ok('Desfazer entregue pelo getter e pelo listener desfaz uma vez só');
  });

  await caso('remontagem relê a última resposta', async ({ e, montar, desmontar }) => {
    const r = resposta('voz-req-remonta', { origem: 'voz', resultado: 'revisar', transcricao: 'Café R$ 7' });
    e.ultima = r;
    montar();
    await espera();
    desmontar();
    if (e.ultima === null) e.ultima = r; // o SDK que não limpa devolveria o mesmo toque
    montar();
    await espera();
    assert.equal(e.pushes.length, 1, 'remontar não reabre a revisão já aberta');
    ok('remontagem não reabre a mesma revisão');
  });

  await caso('a última resposta é limpa depois de tratada', async ({ e, montar }) => {
    e.ultima = resposta('voz-req-limpa', { origem: 'voz', resultado: 'revisar', transcricao: 'Pão R$ 5' });
    montar();
    await espera();
    assert.ok(e.limpezas >= 1 && e.ultima === null, 'a próxima abertura do app não relê o toque já tratado');
    ok('a última resposta do SDK é limpa depois de tratada');
  });

  await caso('falha ao abrir a revisão', async ({ e, montar }) => {
    e.destinoFalha = true;
    e.ultima = resposta('voz-req-falha', { origem: 'voz', resultado: 'revisar', transcricao: 'Luz R$ 90' });
    const antes = semDono.length;
    montar();
    await espera();
    assert.equal(semDono.length, antes, 'a falha de abertura não vira rejeição sem dono');
    assert.ok(e.erros.some((x) => /toque na notificação não foi tratado/.test(x)), 'e deixa log');
    ok('falha ao abrir a revisão pelo getter deixa log, sem rejeição sem dono');
  });

  /* L2 (revisão do Lynx, 21/11; regra 9): a revisão que não abre deixa recibo
     visível, uma vez, com a fala; "Tentar de novo" abre a MESMA fala. */
  await caso('revisão que não abre deixa recibo e segunda chance', async ({ e, montar, tocar }) => {
    e.destinoFalha = true;
    const r = resposta('voz-req-recibo', { origem: 'voz', resultado: 'revisar', transcricao: 'Gás R$ 120' });
    e.ultima = r;
    montar();
    await espera();
    tocar(r);
    await espera();
    assert.equal(e.alertas.length, 1, 'um recibo só, mesmo com getter e listener');
    assert.ok(e.alertas[0].texto.includes('Gás R$ 120'), 'o recibo mostra a fala');
    assert.equal(e.pushes.length, 0, 'nada abriu ainda');
    const tentar = e.alertas[0].botoes.find((b) => b.text === 'Tentar de novo');
    assert.ok(tentar, 'o recibo oferece Tentar de novo');
    e.destinoFalha = false;
    tentar.onPress();
    await espera();
    assert.equal(e.pushes.length, 1, 'Tentar de novo abre a revisão uma vez');
    assert.equal(e.pushes[0].params.colarTexto, 'Gás R$ 120', 'com a mesma fala');
    ok('revisão que não abre deixa recibo uma vez e Tentar de novo abre a mesma fala');
  });

  await caso('corpo e Desfazer do mesmo recibo são toques distintos', async ({ e, montar, tocar }) => {
    montar();
    const dados = { origem: 'voz', resultado: 'salvo', tipo: 'transaction', ids: ['t2'], operationId: 'op-2' };
    tocar(resposta('voz-req-dois', dados));
    tocar(resposta('voz-req-dois', dados, 'desfazer'));
    await espera();
    assert.equal(e.pushes.length, 1, 'o toque no corpo navega');
    assert.deepEqual(e.desfeitos, ['op-2'], 'e o Desfazer do mesmo recibo continua funcionando');
    ok('corpo e Desfazer do mesmo recibo continuam sendo tratados, cada um uma vez');
  });

  await espera();
  if (falhas.length) {
    console.log(`\n${falhas.length} caso(s) falharam:\n- ${falhas.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`\nvoz-resposta-notificacao-uma-vez: ${checagens} checagens ok`);
  process.exit(0);
})().catch((erro) => { console.error(erro); process.exit(1); });
