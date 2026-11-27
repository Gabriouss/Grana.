require('./helpers/falha-com-duble-incompleto.cjs');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
let task, permission = true, cards = [], matched = null, saved = [], revisions = [], cleaned = 0, pending = [];
const armazenamento = new Map();
const deps = {
  './voz-confiabilidade': {
    precisaRevisarValorVoz: () => false,
    transcricaoPareceLancamentoVoz: () => true,
    valorDaFalaVoz: () => 32,
  },
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (nome, factory) => { if (nome === 'GranaVoiceTask') task = factory(); } } },
  './offline-cache': { isLikelyNetworkError: () => false },
  '@/modules/grana-voice-widget': { definirEstado: () => {} },
  './voz': { transcreverAudio: async () => ({ ok: true, transcript: 'mercado 32 no crédito' }) },
  './widget-voz-notificacoes': { podeNotificar: async () => permission,
    notificarConferenciaVoz: async (titulo) => { revisions.push(titulo); }, notificarFalha: async () => { throw new Error('Falha inesperada'); }, notificarPendenteOffline: async () => { revisions.push('Lançamento aguardando conexão'); }, notificarSucesso: async () => {} },
  /* O dublê acompanha o que a tarefa chama: sem `descricaoDoLancamento` (16/09/2026)
     a tarefa quebrava e toda fala caía em "Não consegui salvar". */
  './heuristics': { guessAmountFromText: () => 32, guessCategoryFromText: () => ({ name: 'Alimentação', color: '#fff' }),
    guessTypeFromText: () => 'out', descricaoDoLancamento: () => 'mercado', semNomeDaCategoria: (nome) => nome, ehIntencaoBoleto: () => false,
    tipoMencionadoNaFala: () => undefined, parseFormaPagamento: () => 'credit',
    textoDaCategoria: (t) => t, decidirCategoria: () => ({ categoria: { name: 'Alimentação', color: '#fff' }, doApelido: false }),
    ehIntencaoCredito: () => true, matchCardByText: () => matched, matchWalletByText: () => null,
    /* Tipo 'out' acima: compra, então não é entrada com intenção de crédito. */
    entradaComIntencaoDeCredito: () => false,
    citaCarteira: () => false,
    limparReferenciaCarteira: (t) => t, limparReferenciaCartao: (t) => t, parseParcelas: () => 1, parseRecorrencia: () => false },
  './data': { fetchCreditCards: async () => cards, fetchApelidosCategoria: async () => [], fetchCategories: async () => [] },
  './wallets': { fetchWallets: async () => [{ id: 'wallet', name: 'Pessoal', is_default: true }] },
  './voice-operations': { desfechoDaOperacaoVoz: require('./desfecho-voz-real.cjs'), registrarOperacaoVoz: async (_, __, input) => { saved.push(input); return { ids: ['tx'], operationId: 'op' }; } },
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
  './widget-voz-pendentes': { adicionarVozPendente: async (item) => { pending.push(item); }, listarVozesPendentes: async () => pending, removerVozPendente: async () => {}, reservarFalaEmAndamento: async () => false, liberarFalaEmAndamento: async () => {} },
  /* A reserva devolve false de propósito: este teste trava o caminho SEM reserva (sem dono local ou reserva que falhou),
     em que o áudio da captura fica preservado. O caminho com reserva é do widget-voz-segundo-plano.cjs. */
  './widgets-home-sync': {}, '@react-native-async-storage/async-storage': {
    __esModule: true,
    default: {
      getItem: async (chave) => armazenamento.get(chave) ?? null,
      setItem: async (chave, valor) => armazenamento.set(chave, valor),
    },
  },
  'expo-file-system/legacy': { deleteAsync: async () => { cleaned++; } },
};
/* Use the real confidence guard; the rest of this test keeps controlled
   card heuristics and only needs accent folding for its transcript. */
const confiabilidadeReal = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/voz-confiabilidade.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: confiabilidadeReal,
  require: (id) => id === './heuristics'
    ? { ...deps['./heuristics'], normalizarTexto: (texto) => String(texto).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() }
    : (() => { throw new Error(`import not stubbed in voice reliability: ${id}`); })(),
});
deps['./voz-confiabilidade'].transcricaoServeParaRevisaoVoz = confiabilidadeReal.transcricaoServeParaRevisaoVoz;
deps['./voz-confiabilidade'].transcricaoTemNomeInformativo = confiabilidadeReal.transcricaoTemNomeInformativo;
deps['./voz-confiabilidade'].textoVozSemDicaDeCategoria = confiabilidadeReal.textoVozSemDicaDeCategoria;
const operacoesReais = require('./desfecho-voz-real.cjs');
Object.assign(deps['./voice-operations'], {
  desfechoDoErroVoz: operacoesReais.desfechoDoErroVoz,
  ehRecusaCartaoObrigatorio: operacoesReais.ehRecusaCartaoObrigatorio,
});
const puros = require('./modulos-puros-reais.cjs');
const cache = new Map();
function carregar(arquivo) {
  if (cache.has(arquivo)) return cache.get(arquivo);
  const exports = {};
  cache.set(arquivo, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, AbortController, console, setTimeout, clearTimeout, require(id) {
    if (id in puros) return puros[id];
    if (id in deps) return deps[id];
    if (id.startsWith('.')) {
      const relativo = path.posix.join(path.posix.dirname(arquivo), id);
      const diretoDeLib = './' + path.posix.relative('lib', relativo);
      if (diretoDeLib in deps) return deps[diretoDeLib];
      return carregar(relativo + '.ts');
    }
    throw Error('Import sem dublê: ' + id);
  } }, { filename: arquivo });
  return exports;
}
carregar('lib/widget-voz-task.ts');
(async () => {
  cards = [{ id: 'c6', name: 'QA C6', wallet_id: 'wallet' }, { id: 'nubank', name: 'QA Nubank', wallet_id: 'wallet' }];
  await task({ caminho: '/qa.m4a', requestId: '1' });
  assert.equal(saved.length, 0); assert.deepEqual(revisions, ['Qual cartão?']);
  const caixa = carregar('lib/avisos-banco/caixa-voz.ts');
  assert.equal((await caixa.listarRevisoesVoz('qa-user'))[0].titulo, 'Qual cartão?');
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
  await task({ caminho: '/voz-pendente/app.m4a', requestId: 'app-sem-permissao', source: 'app' });
  assert.equal(cleaned, 3, 'retomada do app sem notificações conserva o áudio');
  permission = true;
  deps['./voz'].transcreverAudio = async () => ({ ok: false, codigo: 'sem_rede' });
  await task({ caminho: '/qa-offline.m4a', requestId: '5' });
  assert.deepEqual(pending.map((item) => item.requestId), ['4', 'app-sem-permissao', '5']);
  assert.equal(pending[pending.length - 1].userId, 'qa-user');
  assert.equal(cleaned, 3, 'áudio offline fica preservado para a fila');
  console.log('OK tarefa real: cartão ambíguo vai à revisão; cartão citado é usado; único cartão funciona; sem notificação não grava; áudio offline fica na fila; erros não apagam o áudio pendente.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
