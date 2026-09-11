const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
let task, permission = true, cards = [], matched = null, saved = [], revisions = [], cleaned = 0, pending = [];
const deps = {
  './voz-confiabilidade': { precisaRevisarValorVoz: () => false },
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { task = factory(); } } },
  './offline-cache': { isLikelyNetworkError: () => false },
  '@/modules/grana-voice-widget': { definirEstado: () => {} },
  './voz': { transcreverAudio: async () => ({ ok: true, transcript: 'mercado 32 no crédito' }) },
  './widget-voz-notificacoes': { podeNotificar: async () => permission,
    notificarRevisao: async (titulo) => { revisions.push(titulo); }, notificarFalha: async () => { throw new Error('Falha inesperada'); }, notificarPendenteOffline: async () => { revisions.push('Lançamento aguardando conexão'); }, notificarSucesso: async () => {} },
  './heuristics': { guessAmountFromText: () => 32, guessCategoryFromText: () => ({ name: 'Alimentação', color: '#fff' }),
    guessTypeFromText: () => 'out', guessDescFromText: () => 'mercado', ehIntencaoBoleto: () => false,
    ehIntencaoCredito: () => true, matchCardByText: () => matched, matchWalletByText: () => null,
    limparReferenciaCarteira: (t) => t, limparReferenciaCartao: (t) => t, parseParcelas: () => 1, parseRecorrencia: () => false },
  './data': { fetchCreditCards: async () => cards, fetchCategories: async () => [] },
  './wallets': { fetchWallets: async () => [{ id: 'wallet', name: 'Pessoal', is_default: true }] },
  './voice-operations': { registrarOperacaoVoz: async (_, __, input) => { saved.push(input); return { ids: ['tx'], operationId: 'op' }; } },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: { user: { id: 'qa-user' } } } }) } } },
  /* Dono da fila lido pelo aparelho desde 11/09/2026. Sem este dublê o
     `import('./sessao-offline')` estourava dentro do caminho de permissão
     negada, a exceção caía no `catch` geral da tarefa e o áudio era APAGADO —
     o oposto do que este arquivo verifica logo abaixo. */
  './sessao-offline': {
    idDoUsuarioLocal: async () => 'qa-user',
    lerSessaoDoDisco: async () => ({ access_token: 'jwt', refresh_token: 'r', user: { id: 'qa-user' } }),
  },
  './widget-voz-pendentes': { adicionarVozPendente: async (item) => { pending.push(item); }, listarVozesPendentes: async () => pending, removerVozPendente: async () => {} },
  './widgets-home-sync': {}, '@react-native-async-storage/async-storage': {},
  'expo-file-system/legacy': { deleteAsync: async () => { cleaned++; } },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/widget-voz-task.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: {}, require: (id) => { if (!(id in deps)) throw new Error(id); return deps[id]; }, console, setTimeout, clearTimeout });
(async () => {
  cards = [{ id: 'c6', name: 'QA C6', wallet_id: 'wallet' }, { id: 'nubank', name: 'QA Nubank', wallet_id: 'wallet' }];
  await task({ caminho: '/qa.m4a', requestId: '1' });
  assert.equal(saved.length, 0); assert.deepEqual(revisions, ['Qual cartão?']);
  matched = cards[1]; await task({ caminho: '/qa.m4a', requestId: '2' });
  assert.equal(saved[0].card_id, 'nubank'); assert.equal(saved[0].amount, 32);
  cards = [cards[0]]; matched = null; await task({ caminho: '/qa.m4a', requestId: '3' });
  assert.equal(saved[1].card_id, 'c6');
  permission = false; await task({ caminho: '/qa.m4a', requestId: '4' });
  /* Sem permissão de notificação o widget NÃO grava — a regra de que sem
     como avisar não se mexe no dinheiro continua valendo. O que mudou em
     11/09/2026 é o destino do áudio: antes ele era apagado, agora, havendo
     sessão, vai para a fila de pendentes e é preservado. A pessoa pode
     conceder a permissão depois e a fala dela não se perdeu. Por isso
     `cleaned` para em 3 e a fila ganha uma entrada. */
  assert.equal(saved.length, 2);
  assert.equal(cleaned, 3, 'audio preservado em vez de apagado quando falta permissao');
  assert.equal(pending.length, 1, 'a fala sem permissao vai para a fila de pendentes');
  permission = true;
  permission = false;
  await task({ caminho: '/voz-pendente/app.m4a', requestId: 'app-sem-permissao', source: 'app' });
  assert.equal(cleaned, 3, 'retomada do app sem notificações conserva o áudio');
  permission = true;
  deps['./voz'].transcreverAudio = async () => ({ ok: false, codigo: 'sem_rede' });
  await task({ caminho: '/qa-offline.m4a', requestId: '5' });
  /* Duas entradas agora, não uma: a primeira veio da permissão negada, que
     desde 11/09/2026 preserva o áudio em vez de apagá-lo, e esta é a do
     offline. A asserção olha a última para não depender da ordem. */
  assert.equal(pending.length, 2);
  assert.equal(pending[pending.length - 1].userId, 'qa-user');
  assert.equal(cleaned, 3, 'áudio offline fica preservado para a fila');
  console.log('OK tarefa real: cartão ambíguo vai à revisão; cartão citado é usado; único cartão funciona; sem notificação não grava; áudio offline fica na fila; erros não apagam o áudio pendente.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
