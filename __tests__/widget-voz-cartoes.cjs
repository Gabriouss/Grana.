const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
let task, permission = true, cards = [], matched = null, saved = [], revisions = [], cleaned = 0;
const deps = {
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { task = factory(); } } },
  '@/modules/grana-voice-widget': { definirEstado: () => {} },
  './voz': { transcreverAudio: async () => ({ ok: true, transcript: 'mercado 32 no crédito' }) },
  './widget-voz-notificacoes': { podeNotificar: async () => permission,
    notificarRevisao: async (titulo) => { revisions.push(titulo); }, notificarFalha: async () => { throw new Error('Falha inesperada'); }, notificarSucesso: async () => {} },
  './heuristics': { guessAmountFromText: () => 32, guessCategoryFromText: () => ({ name: 'Alimentação', color: '#fff' }),
    guessTypeFromText: () => 'out', guessDescFromText: () => 'mercado', ehIntencaoBoleto: () => false,
    ehIntencaoCredito: () => true, matchCardByText: () => matched, parseParcelas: () => 1, parseRecorrencia: () => false },
  './data': { fetchCreditCards: async () => cards, fetchCategories: async () => [] },
  './voice-operations': { registrarOperacaoVoz: async (_, __, input) => { saved.push(input); return { ids: ['tx'], operationId: 'op' }; } },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } },
  './widgets-home-sync': {}, '@react-native-async-storage/async-storage': {},
  'expo-file-system/legacy': { deleteAsync: async () => { cleaned++; } },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/widget-voz-task.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: {}, require: (id) => { if (!(id in deps)) throw new Error(id); return deps[id]; }, console });
(async () => {
  cards = [{ id: 'c6', name: 'QA C6' }, { id: 'nubank', name: 'QA Nubank' }];
  await task({ caminho: '/qa.m4a', requestId: '1' });
  assert.equal(saved.length, 0); assert.deepEqual(revisions, ['Qual cartão?']);
  matched = cards[1]; await task({ caminho: '/qa.m4a', requestId: '2' });
  assert.equal(saved[0].card_id, 'nubank'); assert.equal(saved[0].amount, 32);
  cards = [cards[0]]; matched = null; await task({ caminho: '/qa.m4a', requestId: '3' });
  assert.equal(saved[1].card_id, 'c6');
  permission = false; await task({ caminho: '/qa.m4a', requestId: '4' });
  assert.equal(saved.length, 2); assert.equal(cleaned, 4);
  console.log('OK tarefa real: cartão ambíguo vai à revisão; cartão citado é usado; único cartão funciona; sem notificação não grava; áudio é removido.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
