/*
 * A data do gasto dita na fala, no módulo puro `lib/data-da-fala.ts`
 * (spec "data na voz", 30/09/2026, casos 1 a 25 e 32).
 *
 *   node __tests__/voz-data-da-fala.cjs
 *
 * Módulos REAIS: `lib/data-da-fala.ts`, `lib/heuristics.ts` (valor e
 * descrição lidos do texto SEM a data) e a `normalizarTextoTranscrito` do
 * servidor (supabase/functions/_shared/finance-command.ts), pela qual a fala
 * transcrita passa. O mapa de números por extenso é conferido pela AST contra
 * o de `parseDiaVencimento`. Referência padrão: quarta, 30/09/2026.
 * A paridade app × widget, pela tarefa real, está em voz-data-paridade.cjs.
 */
process.env.TZ = 'America/Sao_Paulo';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };

const cache = new Map();
function carregar(arquivo) {
  if (cache.has(arquivo)) return cache.get(arquivo);
  const exports = {};
  cache.set(arquivo, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
    require: (id) => {
      if (id.startsWith('./')) return carregar(path.join(path.dirname(arquivo), id.slice(2) + '.ts').replace(/\\/g, '/'));
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}
const { dataDaFala } = carregar('lib/data-da-fala.ts');
const h = carregar('lib/heuristics.ts');
const { normalizarTextoTranscrito } = carregar('supabase/functions/_shared/finance-command.ts');

const REF = '2026-09-30';
function caso(nome, fala, esperado, referencia = REF, opcoes = {}) {
  const r = dataDaFala(fala, { referencia, ...opcoes });
  if (esperado.revisao) {
    assert.ok(r.revisao, `${nome}: revisão`);
    assert.equal(r.revisao.titulo, esperado.revisao, `${nome}: título da revisão`);
    if ('dica' in esperado) assert.equal(r.revisao.dica, esperado.dica, `${nome}: dica`);
    if ('proposta' in esperado) assert.equal(r.revisao.proposta, esperado.proposta, `${nome}: proposta`);
  } else {
    assert.equal(r.revisao, null, `${nome}: sem revisão (${JSON.stringify(r.revisao)})`);
    assert.equal(r.data, esperado.data, `${nome}: data`);
  }
  if ('valor' in esperado) assert.equal(h.guessAmountFromText(r.textoSemData), esperado.valor, `${nome}: valor lido sem a data ("${r.textoSemData}")`);
  if ('sem' in esperado) assert.ok(!new RegExp(esperado.sem, 'i').test(r.textoSemData), `${nome}: "${esperado.sem}" saiu do texto ("${r.textoSemData}")`);
  if ('fica' in esperado) assert.ok(new RegExp(esperado.fica, 'i').test(r.textoSemData), `${nome}: "${esperado.fica}" continua no texto`);
  ok(`${nome}: "${fala}" (ref ${referencia})`);
  return r;
}

/* ── Casos da spec ─────────────────────────────────────────────────────── */
caso('1', 'mercado 30 reais', { data: REF, valor: 30 });
caso('2', 'mercado 30 reais hoje', { data: REF, valor: 30, sem: 'hoje' });
caso('3', 'almoço ontem 25 reais', { data: '2026-09-29', valor: 25, sem: 'ontem' });
caso('4', 'uber anteontem 18', { data: '2026-09-28', valor: 18, sem: 'anteontem' });
caso('5', 'almoço ontem 25 reais', { data: '2026-09-30', valor: 25 }, '2026-10-01');
caso('6', 'padaria na sexta 12 reais', { data: '2026-09-25', valor: 12, sem: 'sexta' });
caso('6b', 'padaria sexta 12 reais', { data: REF, valor: 12, fica: 'sexta' });
caso('7', 'padaria na sexta 12 reais', { data: '2026-09-25', valor: 12 }, '2026-09-25');
caso('8', 'padaria sexta passada 12', { data: '2026-09-18', valor: 12, sem: 'passada' }, '2026-09-25');
caso('9', 'farmácia dia 12 40 reais', { data: '2026-09-12', valor: 40, sem: 'dia 12' });
caso('10', 'farmácia dia 12 40 reais', { revisao: 'Confirme a data', dica: 'Você disse dia 12. Entendi 12/09.', proposta: '2026-09-12', valor: 40 }, '2026-10-05');
caso('11', 'mercado 12/09 50 reais', { data: '2026-09-12', valor: 50, sem: '12/09' });
caso('12', 'mercado 12 de setembro 50', { data: '2026-09-12', valor: 50, sem: 'setembro' });
caso('13a', 'mercado dia 12 50', { data: '2026-09-12', valor: 50 });
caso('13b', 'mercado dia doze 50', { data: '2026-09-12', valor: 50, sem: 'doze' });
/* 13c: a mesma fala depois da normalização REAL do servidor. Se ela juntar
   os numerais, o resultado tem de ser revisão, nunca um valor errado. */
{
  const normalizada = normalizarTextoTranscrito('mercado dia doze cinquenta reais');
  const r = dataDaFala(normalizada, { referencia: REF });
  const valor = h.guessAmountFromText(r.textoSemData);
  assert.ok((r.revisao === null && r.data === '2026-09-12' && valor === 50) || r.revisao !== null,
    `13c: "${normalizada}" dá 12/09 e 50, ou revisão (deu ${r.data}, ${valor}, ${JSON.stringify(r.revisao)})`);
  /* Hoje a normalização junta os dois numerais ("dia 12,50"), e isso pode ser
     o dia e o valor ou R$ 12,50: tem de ser revisão, sem valor escolhido. */
  if (/dia 12,50/.test(normalizada)) {
    assert.equal(r.revisao?.titulo, 'Qual foi a data?', '13c: "dia 12,50" é ambíguo e vai para revisão');
  }
  caso('13c-direto', 'mercado dia 12,50 reais', { revisao: 'Qual foi a data?', dica: 'A data da fala não ficou clara. Escolha a data.' });
  ok(`13c: "mercado dia doze cinquenta reais" → normalização real "${normalizada}" → ${r.revisao ? 'revisão' : `${r.data}, R$ ${valor}`}`);
}
caso('14', 'cinema amanhã 40', { revisao: 'Confirme a data', dica: 'Você disse 01/10, que ainda não chegou.', proposta: '2026-10-01', valor: 40 });
caso('15', 'mercado 15/10 30', { revisao: 'Confirme a data', dica: 'Você disse 15/10, que ainda não chegou.', proposta: '2026-10-15', valor: 30 });
caso('16', 'mercado dia 30 de fevereiro 20', { revisao: 'Qual foi a data?', dica: 'Você disse 30/02, que não existe.', proposta: null, valor: 20 });
caso('17', 'mercado 10/07 20', { revisao: 'Qual foi a data?', dica: 'Você disse 10/07. Datas antes de agosto precisam ser escolhidas aqui.', proposta: '2026-07-10', valor: 20 });
caso('18', 'mercado semana passada 20', { revisao: 'Qual foi a data?', dica: 'A data da fala não ficou clara. Escolha a data.', proposta: null, valor: 20 });
caso('19', 'ontem, dia 12, mercado 20', { revisao: 'Qual foi a data?', dica: 'A data da fala não ficou clara. Escolha a data.', valor: 20 });
caso('20', 'netflix 40 todo dia 10', { data: REF, valor: 40, fica: 'todo dia 10' });
caso('20b', 'aluguel 1500 todo mês dia 5', { data: REF, valor: 1500, fica: 'todo mês dia 5' });
/* 21: conta a pagar não passa por aqui; o chamador pula (ehIntencaoBoleto). */
assert.equal(h.ehIntencaoBoleto('boleto de luz 120 vence dia 10'), true);
ok('21: "boleto de luz 120 vence dia 10" é conta; a data do gasto não é lida (o chamador pula)');
caso('22', 'tênis 300 em 12x no crédito C6 ontem', { data: '2026-09-29', fica: '12x' });
caso('25', 'Sexta Feira Bar 50 reais', { data: REF, valor: 50, fica: 'Sexta Feira Bar' });
caso('32', 'padaria sexta passada 12', { data: '2026-09-18' }, '2026-09-25');
caso('32b', 'padaria na última sexta 12', { data: '2026-09-18', valor: 12 }, '2026-09-25');

/* ── Mais limites ──────────────────────────────────────────────────────── */
caso('parcelas', 'tv 1200 em 12 vezes', { data: REF, valor: 1200, fica: '12 vezes' });
caso('centavos', 'mercado R$ 12,09', { data: REF, valor: 12.09 });
caso('mesma data duas vezes', 'hoje, dia 30, mercado 20', { data: REF, valor: 20 });
caso('dia 31 em 30/09 é do mês anterior', 'mercado dia 31 20', { revisao: 'Confirme a data', dica: 'Você disse dia 31. Entendi 31/08.', proposta: '2026-08-31', valor: 20 });
caso('dia inexistente no mês anterior', 'mercado dia 30 20', { revisao: 'Qual foi a data?', dica: 'Você disse 30/02, que não existe.', proposta: null, valor: 20 }, '2026-03-15');
caso('número colado', 'mercado dia 1250', { revisao: 'Qual foi a data?', dica: 'A data da fala não ficou clara. Escolha a data.' });
caso('outro ano', 'mercado 30/12/2025 20', { revisao: 'Qual foi a data?', dica: 'Você disse 30/12/2025. Datas antes de agosto precisam ser escolhidas aqui.' });
caso('virada do ano', 'mercado ontem 20', { data: '2025-12-31', valor: 20 }, '2026-01-01');
caso('janeiro, dia N de dezembro', 'mercado dia 20 30', { revisao: 'Confirme a data', dica: 'Você disse dia 20. Entendi 20/12/2025.', proposta: '2025-12-20' }, '2026-01-05');
caso('dia da semana no fim', 'almoço 30 reais sexta', { data: '2026-09-25', valor: 30 });
caso('segunda parcela não é data', 'paguei a segunda parcela 100', { data: REF, valor: 100, fica: 'segunda parcela' });
caso('descrição sem a data', 'almoço ontem 25 reais', { data: '2026-09-29', fica: 'almoço' });
/* O começo da expressão não pode comer o fim da palavra anterior: o "o" de
   "mercado" virava "o 12/09" ("mercad"), e com a flag u o \b é ASCII, então
   "pão dia 12" virava "pã". Achado pela tarefa real (voz-data-paridade). */
for (const [fala, nome] of [['mercado 12/09 50 reais', 'mercado'], ['mercado 12 de setembro 50', 'mercado'], ['pão dia 12 10 reais', 'pão'],
  ['limão no dia 12 20', 'limão'], ['feijão na sexta 12 reais', 'feijão'], ['sabão sexta passada 12', 'sabão'], ['cartão na última sexta 12', 'cartão']]) {
  const r = dataDaFala(fala, { referencia: REF });
  assert.equal(r.textoSemData.split(' ')[0], nome, `"${fala}": o nome continua "${nome}" (deu "${r.textoSemData}")`);
}
ok('a expressão de data não come o fim da palavra anterior (mercado, pão, limão, feijão, sabão, cartão)');
assert.equal(h.descricaoDoLancamento ? typeof h.descricaoDoLancamento : 'function', 'function');

/* Referência aproximada (fala antiga, sem a data da captura): relativa vai
   para revisão com a proposta; absoluta e sem expressão seguem normais. */
caso('aprox: ontem', 'almoço ontem 25', { revisao: 'Confirme a data', dica: 'Você disse ontem. Entendi 29/09.', proposta: '2026-09-29' }, REF, { aproximada: true });
caso('aprox: na sexta', 'padaria na sexta 12', { revisao: 'Confirme a data', dica: 'Você disse na sexta. Entendi 25/09.', proposta: '2026-09-25' }, REF, { aproximada: true });
/* r2 do Forge: "hoje" também depende da referência; aproximada, revisa. */
caso('aprox: hoje', 'mercado 50 hoje', { revisao: 'Confirme a data', dica: 'Você disse hoje. Entendi 30/09.', proposta: REF }, REF, { aproximada: true });
caso('exata: hoje', 'mercado 50 hoje', { data: REF }, REF, { aproximada: false });
caso('aprox: 12/09', 'mercado 12/09 50', { data: '2026-09-12' }, REF, { aproximada: true });
caso('aprox: sem data', 'mercado 50', { data: REF }, REF, { aproximada: true });

/* A revisão recebe a dica e a proposta, e o campo começa vazio (r2 do Forge). */
{
  const { dataInicialDaRevisao } = require('./data-da-fala-real.cjs');
  for (const [fala, ref, dica, proposta] of [
    ['almoço ontem 30', { referencia: REF, aproximada: true }, 'Você disse ontem. Entendi 29/09.', '2026-09-29'],
    ['cinema amanhã 40', { referencia: REF, aproximada: false }, 'Você disse 01/10, que ainda não chegou.', '2026-10-01'],
    ['mercado dia 30 de fevereiro 20', { referencia: REF, aproximada: false }, 'Você disse 30/02, que não existe.', null],
    ['mercado semana passada 20', { referencia: REF, aproximada: false }, 'A data da fala não ficou clara. Escolha a data.', null],
  ]) {
    const r = JSON.parse(JSON.stringify(dataInicialDaRevisao(fala, ref)));
    assert.deepEqual({ data: r.data, dica: r.dica, proposta: r.proposta }, { data: null, dica, proposta }, `"${fala}": campo vazio, dica e proposta`);
  }
  ok('revisão: campo vazio, com a dica e a proposta do núcleo (futura, impossível, vaga e referência aproximada)');
}

/* ── Mapa de extenso igual ao de parseDiaVencimento (AST) ──────────────── */
{
  function mapa(arquivo, funcao) {
    const fonte = ts.createSourceFile(arquivo, fs.readFileSync(path.join(root, arquivo), 'utf8'), ts.ScriptTarget.ES2022, true);
    let achado = null;
    const visitar = (no, dentro) => {
      if (ts.isFunctionDeclaration(no) && no.name?.text === funcao) dentro = true;
      if (ts.isVariableDeclaration(no) && no.name.getText() === 'palavras' && (dentro || !funcao) && no.initializer && ts.isObjectLiteralExpression(no.initializer)) {
        achado = JSON.parse(JSON.stringify(vm.runInNewContext('(' + no.initializer.getText() + ')')));
      }
      ts.forEachChild(no, (f) => visitar(f, dentro));
    };
    visitar(fonte, false);
    assert.ok(achado, `mapa "palavras" não encontrado em ${arquivo}`);
    return achado;
  }
  assert.deepEqual(mapa('lib/data-da-fala.ts', null), mapa('lib/heuristics.ts', 'parseDiaVencimento'),
    'o mapa de extenso da data da fala é o mesmo de parseDiaVencimento');
  ok('mapa de números por extenso igual ao de parseDiaVencimento (AST)');
}

console.log(`\n${checagens} checagens da data da fala passaram — 0 falhas`);
