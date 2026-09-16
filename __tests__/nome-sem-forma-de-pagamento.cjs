/*
 * O nome do lançamento não carrega a forma de pagamento.
 *
 * Em 16/09/2026 o autor mostrou a fatura do C6 com três nomes errados:
 * "Almoço crédito C6" e "Transporte no crédito C6", lançados por voz, e
 * "Energético no crédito", lançado pelo chat do Granabô. "No crédito C6" serve
 * para escolher COMO e ONDE lançar — nunca para batizar o gasto.
 *
 * A causa era a ORDEM das chamadas. `limparReferenciaCartao` troca "crédito
 * C6" pela palavra "crédito", de propósito, porque é essa palavra solta que
 * `guessDescFromText` sabe apagar. A voz extraía o nome e nunca limpava; o chat
 * limpava depois de extrair, e sobrava a palavra que a própria limpeza pôs.
 * `descricaoDoLancamento` fixa a ordem num lugar só.
 *
 * Regra 13 do AGENTS.md: a correção vale para as DUAS entradas de voz, e este
 * teste passa cada frase pelo núcleo REAL do widget com `source: 'app'` e
 * `source: 'widget'`, conferindo o que chega para ser gravado — e confere a
 * tela de revisão que as duas abrem quando precisam de confirmação. O chat roda
 * em Deno e usa a cópia sincronizada do interpretador; a paridade com ele é
 * conferida contra essa cópia real, não contra uma reimplementação.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { montarWidget, heuristics } = require('./voz-auditoria-rodada6.cjs');

let passou = 0;
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); passou++; };
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };

/* Carrega a cópia Deno com os imports relativos de verdade — a mesma cadeia
   que a Edge Function importa. */
const cache = new Map();
function carregarDeno(arquivo) {
  const abs = path.resolve(arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, RegExp, Number, Math, Set, Map,
    require: (id) => carregarDeno(path.resolve(path.dirname(abs), id)),
  }, { filename: arquivo });
  return exports;
}
const interpChat = carregarDeno('supabase/functions/_shared/interpretar-lancamento.ts');

const C6 = { id: 'c6', name: 'C6', bank: 'c6', wallet_id: null };

/* Frase como chegou → nome que deve ser gravado. As três primeiras são as da
   fatura do autor; as demais cobrem as outras posições da mesma informação. */
const NO_CREDITO = [
  ['almoço 20 reais crédito C6', 'Almoço'],
  ['transporte 7,60 no crédito C6', 'Transporte'],
  ['almoço 20 reais no crédito C6', 'Almoço'],
  ['almoço crédito C6 20 reais', 'Almoço'],
  ['transporte no crédito C6 7,60', 'Transporte'],
  ['almoço de 20 reais no cartão de crédito C6', 'Almoço'],
  ['almoço 20 reais no crédito do C6', 'Almoço'],
  ['crédito C6 almoço 20 reais', 'Almoço'],
  ['farmácia 45 reais no cartão C6', 'Farmácia'],
];

(async () => {
  /* ── 1. Núcleo real de voz, nas duas entradas ─────────────────────────── */
  for (const source of ['app', 'widget']) {
    for (const [frase, esperado] of NO_CREDITO) {
      const gravados = [];
      const { task, reg } = montarWidget({
        transcrever: async () => ({ ok: true, transcript: frase }),
        cartoes: [C6],
        registrar: async (_id, _origem, payload) => {
          gravados.push(payload);
          return { status: 'committed', ids: ['t1'], operationId: 'op1' };
        },
      });
      await task({ caminho: '/cache/a.m4a', requestId: 'r1', source });
      igual(gravados.length, 1, `${source}: "${frase}" é gravado, sem cair em revisão (${JSON.stringify(reg.notificacoes)})`);
      igual(gravados[0].payment_method, 'credit', `${source}: "${frase}" continua indo para o crédito`);
      igual(gravados[0].card_id, 'c6', `${source}: "${frase}" continua no C6`);
      igual(gravados[0].description, esperado, `${source}: "${frase}" grava o nome "${esperado}"`);
    }
  }

  /* Fora do crédito, a mesma regra: a forma de pagamento no começo não batiza. */
  for (const source of ['app', 'widget']) {
    const gravados = [];
    const { task } = montarWidget({
      transcrever: async () => ({ ok: true, transcript: 'pix mercado 50 reais' }),
      registrar: async (_id, _origem, payload) => {
        gravados.push(payload);
        return { status: 'committed', ids: ['t1'], operationId: 'op1' };
      },
    });
    await task({ caminho: '/cache/a.m4a', requestId: 'r2', source });
    igual(gravados.map((g) => g.description), ['Mercado'], `${source}: "pix mercado 50 reais" grava "Mercado"`);
  }

  /* ── 2. A tela de revisão (aba Crédito) ───────────────────────────────── */
  /* Quando o núcleo pede confirmação, o botão do app e a notificação do widget
     levam a frase para `abrirNovaCompraDoTexto`, que abre o formulário já com
     o nome preenchido — quem só confere e toca em salvar grava esse nome.
     "Crédito Almoço 20 reais" é o caso típico: sem nome de cartão, o núcleo não
     sabe se "Almoço" é um cartão e pergunta qual, nas DUAS entradas. */
  for (const source of ['app', 'widget']) {
    const gravados = [];
    const { task, reg } = montarWidget({
      transcrever: async () => ({ ok: true, transcript: 'Crédito Almoço 20 reais' }),
      cartoes: [C6],
      registrar: async (_id, _origem, payload) => {
        gravados.push(payload);
        return { status: 'committed', ids: ['t1'], operationId: 'op1' };
      },
    });
    await task({ caminho: '/cache/a.m4a', requestId: 'r3', source });
    igual(gravados.length, 0, `${source}: "Crédito Almoço 20 reais" não grava sem confirmar`);
    igual(reg.notificacoes, [['revisao', 'Qual cartão?']], `${source}: "Crédito Almoço 20 reais" pede o cartão`);
  }
  /* A tela é React Native e não roda aqui; o que ela calcula é conferido em
     duas metades: o código dela chama exatamente esta composição, e a
     composição com as funções reais dá o nome certo. */
  const tela = fs.readFileSync('app/(app)/credito.tsx', 'utf8');
  const posCasamento = tela.indexOf('const cartaoCasado = matchCardByText(textoFinanceiro');
  const posNome = tela.indexOf("const guessedDesc = descricaoDoLancamento(textoFinanceiro, 'out', cartaoCasado);");
  ok(posCasamento > 0 && posNome > posCasamento, 'a revisão casa o cartão ANTES de extrair o nome, e usa o cartão casado');
  const REVISAO = [...NO_CREDITO, ['Crédito Almoço 20 reais', 'Almoço']];
  for (const [frase, esperado] of REVISAO) {
    const cartao = heuristics.matchCardByText(frase, [C6]);
    igual(heuristics.descricaoDoLancamento(frase, 'out', cartao), esperado, `revisão: "${frase}" abre com o nome "${esperado}"`);
  }

  /* ── 3. Paridade com o chat: a cópia Deno decide igual ao app ─────────── */
  const SO_NA_FUNCAO = [['Crédito Almoço 20 reais', 'Almoço'], ['débito farmácia 30 reais', 'Farmácia']];
  for (const [frase, esperado] of [...NO_CREDITO, ...SO_NA_FUNCAO]) {
    igual(interpChat.descricaoDoLancamento(frase, 'out', C6), esperado, `chat: "${frase}" vira "${esperado}"`);
    igual(
      interpChat.descricaoDoLancamento(frase, 'out', C6),
      heuristics.descricaoDoLancamento(frase, 'out', C6),
      `chat e app concordam em "${frase}"`
    );
  }

  /* O chat não pode voltar à ordem antiga — limpar a descrição JÁ extraída. */
  const chat = fs.readFileSync('supabase/functions/assistente-financeiro/index.ts', 'utf8');
  ok(!/limparReferenciaCartao\(\s*descricao\b/.test(chat), 'o chat não limpa mais a descrição já extraída');
  ok(/descricaoDoLancamento\(financeiro,\s*tipo,\s*achado\)/.test(chat), 'o chat extrai o nome com o cartão conhecido');

  /* ── 4. O que NÃO pode ser apagado ─────────────────────────────────────── */
  const PRESERVAR = [
    // A palavra seguinte é preposição: a forma de pagamento faz parte do nome.
    ['crédito do celular 20 reais', 'Crédito do celular'],
    // O nome da loja solto nunca sai, mesmo parecendo o do cartão.
    ['mercado C6 compras 50 reais no crédito C6', 'Mercado C6 compras'],
  ];
  for (const [frase, esperado] of PRESERVAR) {
    igual(heuristics.descricaoDoLancamento(frase, 'out', C6), esperado, `app preserva "${esperado}"`);
    igual(interpChat.descricaoDoLancamento(frase, 'out', C6), esperado, `chat preserva "${esperado}"`);
  }
  // Sem cartão resolvido, a função é só guessDescFromText (mais a forma no começo).
  igual(
    heuristics.descricaoDoLancamento('almoço 20 reais no pix', 'out'),
    heuristics.guessDescFromText('almoço 20 reais no pix', 'out'),
    'sem cartão, o resultado de sempre continua igual'
  );

  console.log(`nome-sem-forma-de-pagamento: ${passou} verificacoes OK`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
