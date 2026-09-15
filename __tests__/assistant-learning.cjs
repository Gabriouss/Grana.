// Executa o mesmo módulo da Edge Function, usando TypeScript já instalado.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const file = path.resolve(__dirname, '../supabase/functions/_shared/assistant-learning.ts');
const loaded = new Module(file, module);
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const {
  conduzirConversa,
  exemploElegivel,
  feedbackExplicito,
  respostaFundamentada,
  fallbackSeguro,
  respostaFinalSegura,
  textoLancamentoConfiavel,
} = loaded.exports;
const cycleFile = path.resolve(__dirname, '../supabase/functions/_shared/fatura-ciclo.ts');
const cycleModule = new Module(cycleFile, module);
cycleModule._compile(ts.transpileModule(fs.readFileSync(cycleFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, cycleFile);
const { cicloRelativo, deslocamentoPedido } = cycleModule.exports;
const tools = ['consulta', 'ensinarApelido'].map((name) => ({ function: { name,
  parameters: { type: 'object', properties: { categoria: { type: 'string' } }, required: ['categoria'] },
} }));
const call = (nome, args, id = '1') => ({ role: 'assistant', content: null,
  tool_calls: [{ id, function: { name: nome, arguments: JSON.stringify(args) } }],
});
let checks = 0;
async function scenario(name, fn) { await fn(); checks++; console.log('OK', name); }
async function run(respostas, executar, customTools = tools) {
  let chamadas = 0;
  const output = await conduzirConversa({ messages: [{ role: 'user', content: 'Quanto gastei?' }], tools: customTools,
    chamar: async () => { chamadas++; const next = respostas.shift(); if (next instanceof Error) throw next; return next; }, executar });
  return { ...output, chamadas };
}
(async () => {
  await scenario('fatura anterior usa fechamento real, inclusive virada do ano', async () => {
    assert.deepEqual(cicloRelativo('2026-09-06', 15, -1), { year: 2026, month: 7 });
    assert.deepEqual(cicloRelativo('2026-09-20', 15, 0), { year: 2026, month: 9 });
    assert.deepEqual(cicloRelativo('2026-09-20', 25, 0), { year: 2026, month: 8 });
    assert.deepEqual(cicloRelativo('2026-01-06', 15, -1), { year: 2025, month: 11 });
    assert.equal(deslocamentoPedido('Alimentação na fatura passada do C6?'), -1);
    assert.equal(deslocamentoPedido('E na fatura atual?'), 0);
    assert.equal(deslocamentoPedido('Compare a fatura passada e a atual'), undefined);
  });
  await scenario('corrige categoria sem exigir nova mensagem e aprende consulta corrigida', async () => {
    const r = await run([call('consulta', { categoria: 'comida' }), call('consulta', { categoria: 'Alimentação' }),
      { content: 'Você gastou R$ 130,00 em Alimentação.' }], async (_, args) => args.categoria === 'comida'
      ? 'Não existe categoria chamada comida. As categorias são Alimentação.' : 'Você gastou R$ 130,00 em Alimentação.');
    assert.equal(r.chamadas, 3); assert.equal(exemploElegivel(r.resposta, r.registros), true);
  });
  await scenario('aprende apelido e consulta na mesma conversa', async () => {
    const exec = [];
    const r = await run([call('ensinarApelido', { categoria: 'mercado' }), call('consulta', { categoria: 'Alimentação' }),
      { content: 'R$ 10,00 em Alimentação.' }], async (nome) => { exec.push(nome); return nome === 'consulta' ? 'R$ 10,00' : 'Apelido gravado'; });
    assert.deepEqual(exec, ['ensinarApelido', 'consulta']); assert.equal(r.recuperado, false);
  });
  await scenario('não executa JSON malformado nem parâmetros desconhecidos', async () => {
    let exec = 0;
    const malformed = call('consulta', {}); malformed.tool_calls[0].function.arguments = '{';
    const r = await run([malformed, call('consulta', { categoria: 'x', user_id: 'outra-conta' }),
      { content: 'Pode confirmar a categoria?' }], async () => { exec++; return 'R$ 10,00'; });
    assert.equal(exec, 0); assert.equal(exemploElegivel(r.resposta, r.registros), false);
  });
  await scenario('falha de redação preserva resultado verificado', async () => {
    const r = await run([call('consulta', { categoria: 'x' }), new Error('503')], async () => 'O usuário gastou R$ 130,00. Cite o ciclo da fatura na resposta.');
    assert.equal(r.resposta, 'Você gastou R$ 130,00.'); assert.equal(r.recuperado, true);
  });
  await scenario('limita loops e não repete execução idêntica', async () => {
    let exec = 0;
    const r = await run(Array.from({ length: 4 }, () => call('consulta', { categoria: 'x' })), async () => { exec++; return 'R$ 1,00'; });
    assert.equal(exec, 1); assert.equal(r.chamadas, 4);
  });
  await scenario('não aprende falha nem valor inventado', async () => {
    const registro = { nome: 'consulta', args: {}, ok: true, consulta: true, resultado: 'R$ 130,00' };
    assert.equal(respostaFundamentada('R$ 131,00', [registro]), false);
    assert.equal(respostaFundamentada('R$ 0,00', []), false);
    assert.equal(exemploElegivel('Não consegui responder', [registro]), false);
    assert.equal(exemploElegivel('R$ 130,00', [{ ...registro, ok: false }]), false);
    assert.equal(exemploElegivel('R$ 130,00', [registro]), true);
  });
  await scenario('não vaza instruções internas do naoConsegui no fallback', async () => {
    assert.equal(fallbackSeguro([{ nome: 'naoConsegui', resultado: 'Motivo interno: segredo', ok: false, consulta: false, args: {} }]).includes('segredo'), false);
  });
  await scenario('cartão ausente não autoriza responder com total de outros lançamentos', async () => {
    const catalogo = [
      { function: { name: 'credito', parameters: { properties: { cartao: { type: 'string' } } } } },
      { function: { name: 'geral', parameters: { properties: {} } } },
    ];
    let consultasGerais = 0;
    const r = await run([call('credito', { cartao: 'C6' }), call('geral', {}), { content: 'R$ 280,00' }, { content: 'R$ 280,00' }],
      async (nome) => { if (nome === 'geral') consultasGerais++; return 'O usuário não tem nenhum cartão de crédito cadastrado.'; }, catalogo);
    assert.equal(consultasGerais, 0);
    assert.equal(r.resposta.includes('R$'), false);
    assert.match(r.resposta, /Não encontrei nenhum cartão/);
    assert.equal(exemploElegivel(r.resposta, r.registros), false);
  });
  await scenario('rejeição tem precedência e confirmação precisa ser explícita', async () => {
    assert.equal(feedbackExplicito('Certo, mas está errado'), 'negativo');
    assert.equal(feedbackExplicito('Agora sim!'), 'positivo');
    assert.equal(feedbackExplicito('E na fatura atual?'), null);
    assert.equal(feedbackExplicito('Obrigado'), null);
  });
  await scenario('lançamento usa números do usuário e confirmação determinística', async () => {
    const original = 'Joguei uma compra de R$ 283,72 em 8x no crédito';
    const historico = [
      { papel: 'usuario', texto: original },
      { papel: 'assistente', texto: 'Qual cartão você usou?' },
    ];
    const fonte = textoLancamentoConfiavel('C6', historico);
    assert.equal(fonte, `${original} C6`);
    assert.equal(textoLancamentoConfiavel(original, []), original);

    const catalogo = [{ function: {
      name: 'criarLancamento',
      parameters: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
    } }];
    let recebido = null;
    let rodada = 0;
    const confirmado = 'Lançamento registrado: R$ 283,72 em 8x no cartão C6.';
    const r = await conduzirConversa({
      messages: [{ role: 'user', content: 'C6' }],
      tools: catalogo,
      prepararArgs: (nome, args) => {
        if (nome === 'criarLancamento') args.texto = textoLancamentoConfiavel('C6', historico);
      },
      chamar: async () => ++rodada === 1
        ? call('criarLancamento', { texto: 'iPhone 283.728 em 86x no crédito C6' })
        : { content: 'Registrei R$ 283,72 parcelado em 86x.' },
      executar: async (_, args) => { recebido = args.texto; return confirmado; },
    });
    assert.equal(recebido, fonte, 'a ferramenta não recebe o texto numérico reescrito pelo modelo');
    assert.equal(r.registros[0].args.texto, fonte, 'a chave de deduplicação usa o texto confiável');
    assert.equal(respostaFinalSegura('Registrei R$ 283,72 parcelado em 86x.', r.registros), confirmado,
      'a confirmação não pode inventar quantidade de parcelas');
  });
  console.log(`${checks} cenários passaram.`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
