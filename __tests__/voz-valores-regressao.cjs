const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const cache = new Map();
function carregar(file, deps = {}) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Date, setTimeout, clearTimeout, require(id) {
    if (id in deps) return deps[id];
    return carregar(path.resolve(path.dirname(absolute), id + (id.endsWith('.ts') ? '' : '.ts')));
  } }, { filename: file });
  return exports;
}
const h = carregar('lib/heuristics.ts');
const server = carregar('supabase/functions/_shared/finance-command.ts');
const { precisaRevisarValorVoz, valorSeguroParaRevisaoVoz } = carregar('lib/voz-confiabilidade.ts');
let checks = 0;
for (const reais of [0, 1, 5, 10, 18, 34, 57, 99, 100, 143, 999, 1000, 1899, 12000, 999999]) {
  for (let centavos = 0; centavos < 100; centavos++) {
    if (reais === 0 && centavos === 0) continue;
    const decimal = String(centavos).padStart(2, '0');
    const esperado = Number(`${reais}.${decimal}`);
    for (const frase of [
      `Mercado ${reais} e ${centavos}`,
      `Mercado ${reais} reais e ${centavos} centavos`,
      `Mercado ${reais},${decimal}`,
      `Mercado ${reais}.${decimal}`,
      `Mercado ${reais} vírgula ${decimal}`,
    ]) {
      assert.equal(h.guessAmountFromText(frase), esperado, frase);
      assert.equal(h.guessAmountFromText(server.normalizarTextoTranscrito(frase)), esperado, 'servidor: ' + frase);
      assert.equal(precisaRevisarValorVoz(frase), false, 'valor explícito: ' + frase);
      checks += 3;
    }
  }
}
for (const frase of ['Energético 18 e 99', 'Energético dezoito e noventa e nove', 'Energético dezoito vírgula noventa e nove']) {
  assert.equal(h.guessAmountFromText(frase), 18.99);
}
assert.equal(h.guessAmountFromText('Mercado 18,9'), 18.9);
for (const frase of ['Mercado 1899', 'Mercado 50', 'Mercado 1.899', 'Mercado 99999999', 'Mercado 57quenta e sete reais', 'Mercado 18,999', 'Mercado 12,50 e farmácia 24,90']) {
  assert.equal(precisaRevisarValorVoz(frase), true, 'não salva automaticamente: ' + frase);
}

/* Valor cheio dito com a palavra "reais" lança sozinho (14/09/2026).
   Até aqui QUALQUER inteiro em dígitos ia para revisão, o que barrava o uso
   comum — "almoço 20 reais" chegava na tela de confirmação com R$ 0,00 e
   obrigava a digitar o que já tinha sido entendido. A palavra "reais" é a
   prova que faltava: ela só sobra quando não há centavos ditos, porque
   `normalizarTexto` reconstrói o separador ("dezoito e noventa e nove reais"
   vira "18,99 reais") ANTES desta decisão. O extenso entra pela mesma porta.
   O par de baixo é o que não pode afrouxar junto: inteiro solto continua em
   revisão, e é nessa forma que a colagem de reais e centavos aparece. */
for (const [frase, esperado] of [
  ['Almoço 20 reais', 20],
  ['Café 7 reais', 7],
  ['Gasolina 100 reais', 100],
  ['Mercado 150 reais', 150],
  ['Pão um real', 1],
  ['Almoço vinte reais', 20],
  ['Mercado cento e vinte reais', 120],
]) {
  assert.equal(precisaRevisarValorVoz(frase), false, 'valor cheio lança sozinho: ' + frase);
  // A tela de revisão do app lê por aqui: sem isto o campo voltaria a R$ 0,00.
  assert.equal(valorSeguroParaRevisaoVoz(frase), esperado, 'valor sugerido: ' + frase);
  checks += 2;
}
for (const frase of [
  'Almoço 20', 'Gasolina 100', 'Mercado 1899', 'Notebook 2500',
  // Multiplicador falado: quem expande é a normalização, e "45 mil" já virou
  // R$ 1.000 neste repositório. A palavra "reais" não redime a família.
  'Carro 45 mil reais', 'Aluguel mil e quinhentos reais',
  // Duas quantias na mesma fala: escolher uma pelo "primeiro número" é palpite.
  'carteira Reserva 2,50 mercado 18 reais', 'Mercado 12,50 e farmácia 20 reais',
]) {
  assert.equal(precisaRevisarValorVoz(frase), true, 'inteiro solto continua em revisão: ' + frase);
  assert.equal(valorSeguroParaRevisaoVoz(frase), null, 'e não sugere valor: ' + frase);
  checks += 2;
}

// Fluxo REAL do widget + parser REAL: assere payload, recibo e ausência de RPC.
let task, texto = '', writes = [], revisoes = [];
carregar('lib/widget-voz-task.ts', {
  'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_, factory) => { task = factory(); } } },
  './offline-cache': { isLikelyNetworkError: () => false },
  '@/modules/grana-voice-widget': { definirEstado() {} },
  './voz': { transcreverAudio: async () => ({ ok: true, transcript: texto }) },
  './heuristics': h,
  './voz-confiabilidade': { precisaRevisarValorVoz },
  './data': { fetchCategories: async () => [], fetchCreditCards: async () => [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'pessoal' }] },
  './wallets': { fetchWallets: async () => [{ id: 'pessoal', name: 'Pessoal', is_default: true }] },
  './voice-operations': { registrarOperacaoVoz: async (_id, _source, payload) => { writes.push(payload); return { status: 'committed', ids: ['tx'], operationId: 'op' }; } },
  './widget-voz-notificacoes': { podeNotificar: async () => true, notificarRevisao: async titulo => revisoes.push(titulo), notificarSucesso: async () => {}, notificarFalha: async () => assert.fail('falha inesperada') },
  './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } },
  './widgets-home-sync': {}, '@react-native-async-storage/async-storage': {},
  './widget-voz-pendentes': { removerVozPendente: async () => {} },
  './creditLimitAlert': { checarLimiteCartao: async () => {} },
  'expo-file-system/legacy': { deleteAsync: async () => {} },
});
(async () => {
  for (const frase of ['Mercado 18 e 99 no pix', 'Mercado 34,57 no crédito C6 carteira pessoal', 'Internet 89,90 boleto recorrente']) {
    texto = frase;
    await task({ caminho: '/teste.m4a', requestId: frase });
  }
  assert.equal(writes.length, 3);
  assert.equal(writes[0].amount, 18.99);
  assert.equal(writes[0].payment_method, 'pix');
  assert.equal(writes[1].amount, 34.57);
  assert.equal(writes[1].card_id, 'c6');
  assert.equal(writes[2].kind, 'bill');
  assert.equal(writes[2].recurring, true);
  texto = 'Mercado 1899';
  await task({ caminho: '/teste.m4a', requestId: 'ambiguo' });
  assert.equal(writes.length, 3, 'dígitos colados não alcançam a RPC');
  assert.equal(revisoes.at(-1), 'Confirme o valor que ouvi');
  texto = 'Mercado 18,99';
  await task({ caminho: '/teste.m4a', requestId: 'app-pendente', source: 'app' });
  assert.equal(writes.length, 4, 'áudio confiável do app usa a mesma decisão do widget (regra 13)');
  assert.equal(writes[3].amount, 18.99);

  /* O caso relatado em 14/09/2026, exercitado no fluxo REAL, nas duas
     entradas: o valor cheio precisa ATRAVESSAR até a gravação, não só passar
     na função de confiança. O widget e o app compartilham `executarTarefa`,
     então a paridade da regra 13 se prova rodando os dois. */
  texto = 'Almoço 20 reais';
  await task({ caminho: '/teste.m4a', requestId: 'widget-cheio' });
  assert.equal(writes.length, 5, 'valor cheio do widget chega à gravação');
  assert.equal(writes[4].amount, 20);
  assert.equal(writes[4].kind, 'transaction');

  texto = 'Almoço 20 reais';
  await task({ caminho: '/teste.m4a', requestId: 'app-cheio', source: 'app' });
  assert.equal(writes.length, 6, 'e o app grava o mesmo valor, pela mesma decisão');
  assert.equal(writes[5].amount, 20);

  const revisoesAntes = revisoes.length;
  texto = 'Almoço 20';
  await task({ caminho: '/teste.m4a', requestId: 'sem-palavra' });
  assert.equal(writes.length, 6, 'sem a palavra "reais" o inteiro solto não grava');
  assert.equal(revisoes.length, revisoesAntes + 1, 'e deixa recibo de revisão');
  console.log(`OK: ${checks} verificações de valores + fluxo real do widget, cartão, boleto e revisão.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
