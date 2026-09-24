/*
 * Crédito nunca grava sem cartão, em nenhuma entrada (decisão do autor,
 * 23/09/2026: "o lançamento não é feito até que isso ocorra").
 *
 *   node __tests__/credito-exige-cartao.cjs
 *
 * Módulos de produção transpilados em memória. Onde há escrita, o teste
 * afirma QUAIS chamadas ao banco aconteceram, não só o retorno.
 *
 *  1. Camada de dados (`lib/data.ts` + `lib/transaction-rules.ts`): inclusão,
 *     lote de importação, parcelamento e edição recusam crédito sem cartão
 *     ANTES de tocar o banco. O gatilho do Harbor (230400) só vê INSERT.
 *  2. Voz (`lib/voice-operations.ts`): a recusa `cartao_obrigatorio` do
 *     servidor vai para revisão ("Qual cartão?"), na hora e na fila offline,
 *     e a fila só larga o item depois de a revisão ser publicada.
 *  3. Núcleo da voz (`lib/widget-voz-task.ts`) com as heurísticas REAIS, nas
 *     duas entradas (app e widget, regra 13): estorno citando cartão não grava
 *     (antes virava COMPRA no cartão); a recusa do servidor vira "Qual cartão?".
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

/* Carrega `arquivo` de verdade. Import relativo de lib/ também é carregado de
   verdade, a menos que esteja em `dubles`. */
function carregar(arquivo, dubles = {}, cache = new Map()) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map,
    setTimeout, clearTimeout, AbortController,
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

/* ── 1. Camada de dados ─────────────────────────────────────────────────── */
async function camadaDeDados() {
  console.log('\nCamada de dados');
  const chamadas = [];
  const q = {};
  for (const m of ['insert', 'update', 'upsert', 'select', 'single', 'eq']) {
    q[m] = (...args) => { chamadas.push([m, ...args]); return q; };
  }
  q.then = (resolve) => resolve({ data: { id: 'novo' }, error: null });
  const supabase = {
    from: (t) => { chamadas.push(['from', t]); return q; },
    rpc: async (nome) => { chamadas.push(['rpc', nome]); return { data: [], error: null }; },
  };
  const data = carregar('lib/data.ts', {
    './supabase': { supabase },
    './cache-de-tela': { comCacheOffline: (_n, buscar) => buscar },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './paginacao': { buscarTodasAsPaginas: async () => [] },
    './types': { CATEGORIES: [] },
    './recorrencia': {},
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
  });
  const base = { type: 'out', description: 'Mercado', amount: 32, category: 'Alimentação', color: '#fff', occurred_on: '2026-09-23' };
  const semCartao = /precisa de um cartão/;

  chamadas.length = 0;
  await assert.rejects(data.addTransaction({ ...base, payment_method: 'credit', card_id: null }), semCartao);
  assert.deepEqual(chamadas, [], 'nada chega ao banco');
  ok('addTransaction: crédito sem cartão é recusado antes do banco');

  await data.addTransaction({ ...base, payment_method: 'credit', card_id: 'c6' });
  assert.ok(chamadas.some((c) => c[0] === 'insert'));
  ok('addTransaction: crédito com cartão grava');

  chamadas.length = 0;
  await assert.rejects(data.addTransactionsBatch([
    { ...base, payment_method: 'credit', card_id: 'c6' },
    { ...base, payment_method: 'credit', card_id: null },
  ]), semCartao);
  assert.deepEqual(chamadas, [], 'nem as linhas boas do lote entram');
  ok('addTransactionsBatch: uma linha sem cartão barra o lote inteiro, sem gravar nada');

  chamadas.length = 0;
  await assert.rejects(data.addInstallmentPurchase({
    description: 'TV', totalAmount: 1200, category: 'Casa', color: '#fff', occurred_on: '2026-09-23',
    installments: 10, payment_method: 'credit', card_id: null,
  }), semCartao);
  assert.deepEqual(chamadas, []);
  ok('addInstallmentPurchase: parcelado no crédito sem cartão não chama a RPC');

  chamadas.length = 0;
  await assert.rejects(data.updateTransaction('t1', { card_id: null }), semCartao);
  await assert.rejects(data.updateTransaction('t1', { payment_method: 'credit', card_id: '' }), semCartao);
  assert.deepEqual(chamadas, []);
  ok('updateTransaction: tirar o cartão de um crédito é recusado antes do banco');

  await data.updateTransaction('t1', { description: 'Outro nome' });
  await data.updateTransaction('t1', { payment_method: 'pix', card_id: null });
  assert.equal(chamadas.filter((c) => c[0] === 'update').length, 2);
  ok('updateTransaction: edição comum e troca para Pix continuam passando');
}

/* ── 2. Recusa do servidor na voz ───────────────────────────────────────── */
async function recusaNaVoz() {
  console.log('\nRecusa cartao_obrigatorio do servidor');
  const storage = new Map();
  let modo = 'recusa';
  const revisoes = [];
  let revisaoFalha = false;
  const recusa = { code: '23514', message: 'Lancamento no credito exige cartao', hint: 'cartao_obrigatorio' };
  const operacoes = carregar('lib/voice-operations.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async (k) => storage.get(k) ?? null,
      setItem: async (k, v) => storage.set(k, v),
      removeItem: async (k) => storage.delete(k),
      getAllKeys: async () => [...storage.keys()],
      multiGet: async (keys) => keys.map((k) => [k, storage.get(k)]),
    } },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
    './widget-voz-notificacoes': { notificarRevisao: async (titulo, texto) => {
      if (revisaoFalha) throw new Error('canal indisponivel');
      revisoes.push([titulo, texto]);
    } },
    './supabase': { supabase: { rpc: () => ({ abortSignal: async () => (
      modo === 'rede' ? { error: { message: 'Network request failed' } } : { error: recusa }
    ) }) } },
  });
  const payload = { kind: 'transaction', type: 'out', amount: 32, description: 'Mercado', category: 'Alimentação', color: '#fff', occurred_on: '2026-09-23', payment_method: 'credit', wallet_id: 'w' };

  assert.equal(operacoes.ehRecusaCartaoObrigatorio(recusa), true);
  assert.equal(operacoes.ehRecusaCartaoObrigatorio({ code: '23514', hint: 'outra' }), false);
  assert.equal(operacoes.ehRecusaCartaoObrigatorio({ code: '23503', hint: 'cartao_obrigatorio' }), false);
  ok('reconhece só 23514 com a hint cartao_obrigatorio');

  await assert.rejects(operacoes.registrarOperacaoVoz('r1', 'widget', payload, 'mercado 32 no crédito'), (e) => e.hint === 'cartao_obrigatorio');
  assert.equal(storage.size, 0, 'o payload recusado não fica em laço na fila');
  ok('envio direto: a recusa sobe para quem chama (que manda para revisão)');

  modo = 'rede';
  await operacoes.registrarOperacaoVoz('r2', 'widget', payload, 'mercado 32 no crédito');
  assert.equal(storage.size, 1);
  modo = 'recusa';
  revisaoFalha = true;
  const falhou = await operacoes.sincronizarOperacoesVoz();
  assert.equal(storage.size, 1, 'sem publicar a revisão, a fala fica na fila');
  assert.equal(falhou.falhas, 1);
  revisaoFalha = false;
  const resumo = await operacoes.sincronizarOperacoesVoz();
  assert.deepEqual(revisoes, [['Qual cartão?', 'mercado 32 no crédito']], 'a revisão leva a fala original');
  assert.equal(storage.size, 0, 'depois da revisão publicada, sai da fila');
  assert.match(resumo.mensagem, /sem cartão e não foi salvo/);
  ok('fila offline: recusa vira revisão com a fala original, e só então sai da fila');

  modo = 'rede';
  await operacoes.registrarOperacaoVoz('r3', 'widget', { ...payload, description: 'Farmácia', amount: 45.9 });
  modo = 'recusa';
  await operacoes.sincronizarOperacoesVoz();
  assert.deepEqual(revisoes.at(-1), ['Qual cartão?', 'Farmácia 45,9 reais no crédito']);
  ok('fila antiga sem transcrição: a revisão é montada a partir do payload');
}

/* ── 3. Núcleo da voz, nas duas entradas ────────────────────────────────── */
async function nucleoDaVoz() {
  console.log('\nNúcleo da voz (app e widget), heurísticas reais');
  let transcricao = '';
  let recusarNoServidor = false;
  const gravados = [];
  const revisoes = [];
  const cartoes = [{ id: 'c6', name: 'C6', bank: 'c6', wallet_id: 'w' }, { id: 'nu', name: 'Nubank', bank: 'nubank', wallet_id: 'w' }];
  let tarefa;
  const recusa = { code: '23514', message: 'Lancamento no credito exige cartao', hint: 'cartao_obrigatorio' };
  const dubles = {
    './voz-confiabilidade': { precisaRevisarValorVoz: () => false, transcricaoPareceLancamentoVoz: () => true },
    'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { tarefa = factory(); } } },
    './offline-cache': { isLikelyNetworkError: () => false },
    '@/modules/grana-voice-widget': { definirEstado: () => {} },
    './voz': { transcreverAudio: async () => ({ ok: true, transcript: transcricao }) },
    './widget-voz-notificacoes': {
      podeNotificar: async () => true,
      notificarRevisao: async (titulo, texto) => { revisoes.push([titulo, texto]); },
      notificarFalha: async () => {}, notificarPendenteOffline: async () => {}, notificarSucesso: async () => {}, notificarSalvoLocal: async () => {},
    },
    './data': { fetchCreditCards: async () => cartoes, fetchCategories: async () => [] },
    './wallets': { fetchWallets: async () => [{ id: 'w', name: 'Pessoal', is_default: true }] },
    './voice-operations': {
      ehRecusaCartaoObrigatorio: (e) => e?.code === '23514' && e?.hint === 'cartao_obrigatorio',
      registrarOperacaoVoz: async (_id, fonte, entrada) => {
        if (recusarNoServidor) throw recusa;
        gravados.push({ fonte, ...entrada });
        return { status: 'committed', ids: ['tx'], operationId: 'op' };
      },
    },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } } },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1', lerSessaoDoDisco: async () => null },
    './widget-voz-pendentes': { adicionarVozPendente: async () => {}, listarVozesPendentes: async () => [], removerVozPendente: async () => {} },
    './widgets-home-sync': { sincronizarResumoDosWidgets: async () => {} },
    './limits': { LIMITS: { maxAmount: 1e9, maxInstallments: 36, minInstallments: 2, descricao: 120 } },
    '@react-native-async-storage/async-storage': {},
    'expo-file-system/legacy': { deleteAsync: async () => {} },
  };
  const limitesReais = path.join(root, 'lib/limits.ts');
  if (fs.existsSync(limitesReais)) delete dubles['./limits'];
  carregar('lib/widget-voz-task.ts', dubles);

  for (const fonte of ['app', 'widget']) {
    gravados.length = 0; revisoes.length = 0;

    for (const frase of ['estorno de 50 no crédito do C6', 'estorno de 50 do mercado no crédito do C6', 'devolução de 80 no cartão C6']) {
      transcricao = frase;
      await tarefa({ caminho: '/v.m4a', requestId: fonte + '-1-' + frase, source: fonte });
      assert.deepEqual(gravados, [], fonte + ': estorno citando cartão não grava: ' + frase);
      assert.equal(revisoes.at(-1)?.[0], 'Estorno no cartão?', frase);
    }
    ok(fonte + ': "estorno de 50 no crédito do C6" vai para revisão (antes virava COMPRA no cartão)');

    transcricao = 'recebi um crédito de 500 do salário';
    await tarefa({ caminho: '/v.m4a', requestId: fonte + '-2', source: fonte });
    assert.equal(gravados.length, 1);
    assert.equal(gravados[0].type, 'in');
    assert.equal(gravados[0].card_id, undefined, fonte + ': sem cartão citado continua entrada na conta');
    ok(fonte + ': "recebi um crédito de 500 do salário" continua entrada na conta');

    transcricao = 'mercado 32 no crédito do C6';
    await tarefa({ caminho: '/v.m4a', requestId: fonte + '-3', source: fonte });
    assert.equal(gravados.at(-1).card_id, 'c6');
    assert.equal(gravados.at(-1).payment_method, 'credit');
    ok(fonte + ': compra no crédito com cartão citado grava no cartão');

    transcricao = 'mercado 32 no crédito';
    await tarefa({ caminho: '/v.m4a', requestId: fonte + '-4', source: fonte });
    assert.equal(gravados.length, 2, fonte + ': dois cartões e nenhum citado não grava');
    assert.equal(revisoes.at(-1)?.[0], 'Qual cartão?');
    ok(fonte + ': crédito sem cartão identificado vai para "Qual cartão?"');

    recusarNoServidor = true;
    transcricao = 'mercado 32 no crédito do C6';
    await tarefa({ caminho: '/v.m4a', requestId: fonte + '-5', source: fonte });
    recusarNoServidor = false;
    assert.equal(gravados.length, 2);
    assert.deepEqual(revisoes.at(-1), ['Qual cartão?', 'mercado 32 no crédito do C6']);
    ok(fonte + ': recusa cartao_obrigatorio do servidor vira "Qual cartão?" com a fala');
  }
}

/* ── 4. Telas: nenhuma escolhe o cartão sozinha ───────────────────────────
   São telas grandes (sem vm); a guarda é no fonte. E a premissa do modal de
   comprovante: ele só grava a forma de `parseFormaPagamento`, que nunca
   devolve crédito. Se um dia devolver, o modal passa a gravar crédito sem
   seletor de cartão, e este teste quebra antes. */
function telas() {
  console.log('\nTelas');
  const importar = fs.readFileSync(path.join(root, 'components/ImportarExtratoModal.tsx'), 'utf8');
  assert.ok(importar.includes('if (ehCartao && !cartaoEscolhido) {'), 'importação barra fatura sem cartão');
  assert.ok(importar.indexOf('if (ehCartao && !cartaoEscolhido) {') < importar.indexOf('setImportando(true);'), 'antes de começar a importar');
  assert.ok(!/lista\[0\]\?\.id/.test(importar),'importação não escolhe o primeiro cartão');
  ok('importação: fatura de cartão sem cartão escolhido não importa nada');
  const credito = fs.readFileSync(path.join(root, 'app/(app)/credito.tsx'), 'utf8');
  assert.ok(!/walletCards\[0\]\?\.id/.test(credito),'formulário não cai no primeiro cartão');
  ok('Crédito: formulário não preenche o primeiro cartão quando há escolha');
  const h = carregar('lib/heuristics.ts', {});
  for (const frase of ['mercado 32 no crédito', 'paguei no cartão de crédito', 'uber 20 crédito C6', 'mercado 50 no débito']) {
    assert.notEqual(h.parseFormaPagamento(frase), 'credit', frase);
  }
  ok('comprovante: parseFormaPagamento nunca devolve crédito');
}

(async () => {
  telas();
  await camadaDeDados();
  await recusaNaVoz();
  await nucleoDaVoz();
  console.log(`\nOK crédito exige cartão: ${aprovadas} verificações (dados, recusa do servidor, voz no app e no widget).`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
