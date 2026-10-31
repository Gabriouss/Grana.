/*
 * Colar comprovante grava na data do texto (decisão do autor, 27/09/2026).
 *
 *   node __tests__/data-do-texto-colado.cjs
 *
 * Até aqui o Colar comprovante gravava sempre com a data de hoje: um Pix de
 * "26/09/2026 às 18:42" colado no dia 27 entrava no dia 27. Agora a data do
 * texto vale, e hoje só quando o texto não traz data. A leitura e as recusas
 * são as mesmas da foto da nota (`lib/nota-foto-parser.ts`): data impossível,
 * futura ou de mais de um ano é recusada, vai com hoje e a tela diz.
 *
 * Módulo REAL: lib/nota-foto-parser.ts (`dataDoTexto` e `extrairDetalhesDaNota`,
 * da foto). A tela é conferida no código: grava `dataDoComprovante`, só lê
 * data do texto colado (a revisão da voz segue hoje, como o widget, regra 13).
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };

function carregar(arquivo) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, console, JSON, Date, String, Object, Array, Error, RegExp, Number, Math, Set, Map,
    /* lib/heuristics.ts (descrição e valor reais) importa módulos irmãos. */
    require: (id) => {
      if (id.startsWith('./')) return carregar(path.join(path.dirname(arquivo), id.slice(2) + '.ts'));
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}
const { dataDoTexto, extrairDetalhesDaNota, semDatasDoTexto } = carregar('lib/nota-foto-parser.ts');
const heuristicas = carregar('lib/heuristics.ts');
const HOJE = '2026-09-27';

/* A3: metadado de versão não é a data do comprovante. Texto sintético,
   reproduzindo o contexto do Colar; não é comprovante coletado de um banco. */
for (const versao of ['Versao 1.5.26', 'Versão: 1.5.26']) {
  assert.deepEqual({ ...dataDoTexto(versao, HOJE) }, { data: null, recusada: false }, versao);
  for (const data of ['3/9/2026', '2026-09-03T18:42:00', '3 de setembro de 2026']) {
    for (const separador of ['\n', ' — ']) {
      const texto = `Comprovante de Pix\n${versao}${separador}Pagamento em ${data}\nValor R$ 45,00`;
      assert.deepEqual({ ...dataDoTexto(texto, HOJE) }, { data: '2026-09-03', recusada: false }, texto);
    }
  }
}
assert.deepEqual({ ...dataDoTexto('Pagamento em 1.5.26', HOJE) }, { data: '2026-05-01', recusada: false },
  'a data com pontos sem rótulo de versão continua válida');
ok('versão não vira data nem esconde a data real do comprovante');

/* ── 1. Datas que valem ─────────────────────────────────────────────────── */
for (const [texto, esperado] of [
  ['Pix enviado\nR$ 45,00\n26/09/2026 às 18:42\nPara Fulano', '2026-09-26'],
  ['Comprovante de transferência 26/09/2026 - 18:42:03 valor 45,00', '2026-09-26'],
  ['Pagamento de R$ 30,00 em 20.09.26', '2026-09-20'],
  ['Pix enviado em 3/9/2026 às 18:42', '2026-09-03'],
  ['Transferência em 03/9/26', '2026-09-03'],
  ['Compra aprovada em 2026-09-03T18:42:00', '2026-09-03'],
  ['Transferência enviada\n26 SET 2026 - 18:42:03\nR$ 45,00', '2026-09-26'],
  ['Você pagou R$ 12,90 em 3 de setembro de 2026', '2026-09-03'],
  ['Compra aprovada 15 ago. 2026 Loja X R$ 99,00', '2026-08-15'],
]) {
  assert.deepEqual({ ...dataDoTexto(texto, HOJE) }, { data: esperado, recusada: false }, texto);
}
ok('a data do texto vale: numérica, com hora, com ano curto e com mês por extenso');

/* ── 2. Sem data: hoje (a tela usa hoje quando `data` é nula) ───────────── */
assert.deepEqual({ ...dataDoTexto('Pix enviado R$ 45,00 para Fulano', HOJE) }, { data: null, recusada: false });
assert.deepEqual({ ...dataDoTexto('mercado 120 no pix', HOJE) }, { data: null, recusada: false });
ok('sem data no texto, nenhuma data lida (grava hoje)');

/* ── 3. Recusadas: futura, impossível, mais de um ano ───────────────────── */
for (const texto of [
  'Pix 45,00 em 28/09/2026', 'Pix 45,00 em 31/02/2026', 'Pix 45,00 em 10/09/2024',
  'Pix 45,00 em 28/9/2026', 'Pix 45,00 em 31/2/2026', 'Pix 45,00 em 10/9/2024',
  'Pix 45,00 em 2026-09-28', 'Pix 45,00 em 2026-02-31', 'Pix 45,00 em 2024-09-10',
  'Pix 45,00 em 30 set 2026',
]) {
  assert.deepEqual({ ...dataDoTexto(texto, HOJE) }, { data: null, recusada: true }, texto);
}
ok('data futura, impossível ou de mais de um ano é recusada (vai com hoje, e a tela diz)');

/* ── 4. A foto da nota continua lendo a data como antes ─────────────────── */
{
  const d = extrairDetalhesDaNota('MERCADO BOM PRECO\nCNPJ 00.000.000/0001-00\nEMISSAO 25/09/2026 10:11\nTOTAL R$ 30,00', HOJE);
  assert.equal(d.data, '2026-09-25');
  assert.equal(extrairDetalhesDaNota('MERCADO\nTOTAL 30,00\n01/10/2026', HOJE).dataRecusada, true, 'futura recusada na foto também');
  assert.equal(extrairDetalhesDaNota('MERCADO\nTOTAL 30,00\n3/9/2026', HOJE).data, null, 'foto preserva o formato de cupom');
}
ok('a foto da nota lê a data como antes (mesma função de prazo)');

/* ── 4b. Descrição sem o resto da data (achado do P2, 30/09/2026) ──────────
   A data sai inteira, com o conectivo e a hora ligados a ela, nos formatos
   que dataDoTexto lê; o que não casa inteiro fica inteiro; parcela e valor
   nunca são tocados. Plano R2 aprovado pelo Forge. */
{
  const limpo = (t) => semDatasDoTexto(t);
  const desc = (t) => heuristicas.guessDescFromText(limpo(t), 'out');
  /* Os três exemplos da triagem do Lynx. */
  assert.equal(desc('AUDIT Pix recebido em 29/09/2026 R$ 500,00'), 'AUDIT Pix recebido');
  assert.equal(desc('AUDIT Mercado em 2026-09-03T18:00 R$ 30,00'), 'AUDIT Mercado');
  assert.equal(desc('Mercado 30,00 03/09/2026'), 'Mercado');
  /* Hora, "às", ISO completo com fração e offset, mês por extenso. */
  assert.equal(limpo('Transferência realizada 26/09/2026 às 18:42 R$ 45,90 para Restaurante'), 'Transferência realizada R$ 45,90 para Restaurante');
  assert.equal(limpo('Loja 2026-09-03T18:00:00.123-03:00 R$ 10,00'), 'Loja R$ 10,00');
  assert.equal(limpo('Loja 2026-09-03T18:00:00Z R$ 10,00'), 'Loja R$ 10,00');
  assert.equal(limpo('Mercado 26 de setembro de 2026 R$ 10'), 'Mercado R$ 10');
  assert.equal(limpo('Mercado 26 SET 2026 R$ 10'), 'Mercado R$ 10');
  assert.equal(limpo('Mercado em 26/09/2026. R$ 10'), 'Mercado. R$ 10');
  /* Inteiro ou nada: sufixo estranho, ISO sem minuto, dd/mm sem ano e sem
     sinal de data e sequência maior ficam como estão (sem prefixo limpo pela
     metade). "Loja 03/09" continua aqui por decisão de 30/10/2026: sem "em",
     "dia", "data" ou hora, ele tem a mesma forma da parcela "TV 03/12", e o
     lado escolhido é o que não inventa data (seção 4c). */
  for (const t of ['Loja 2026-09-03T18:00Zx R$ 10,00', 'Loja 2026-09-03T18 R$ 10', 'Loja 03/09 R$ 10', 'Loja 1203/09/20260 R$ 10', 'Loja a/03/09/2026/b R$ 10']) {
    assert.equal(limpo(t), t, `"${t}" fica inteiro`);
  }
  /* Conectivo sem data fica; parcela e valor ficam. */
  assert.equal(limpo('Pix recebido em Mercado R$ 10'), 'Pix recebido em Mercado R$ 10');
  for (const t of ['TV parcela 2/12 R$ 100,00', 'TV 2/12 parcelas R$ 100,00', 'TV em 12x de R$ 1.250,50', 'Mercado R$ 12,09']) {
    assert.equal(limpo(t), t, `"${t}" fica inteiro`);
  }
  assert.equal(limpo('Mercado parcela 1/3 em 26/09/2026 R$ 10'), 'Mercado parcela 1/3 R$ 10', 'a parcela fica, a data sai');
  assert.equal(heuristicas.guessAmountFromText(limpo('AUDIT Pix recebido em 29/09/2026 R$ 500,00')), 500, 'o valor continua lido');
  /* A data em si continua lida do texto original. */
  assert.equal(dataDoTexto('AUDIT Pix recebido em 29/09/2026 R$ 500,00', '2026-09-30').data, '2026-09-29');
}
ok('descrição do Colar sem o resto da data: inteiro ou nada, parcela e valor intactos');

/* ── 4c. dd/mm sem ano (decisão de 30/10/2026) ─────────────────────────────
   Ano corrente; no futuro, ano anterior. Só com sinal de data (conectivo antes
   ou hora depois), porque a forma sozinha é a mesma da parcela. */
{
  const OUT = '2026-10-30';
  const lida = (t, hoje = OUT) => ({ ...dataDoTexto(t, hoje) });
  const limpo = (t) => semDatasDoTexto(t);
  const desc = (t) => heuristicas.guessDescFromText(limpo(t), 'out');

  /* O defeito reproduzido. */
  /* "no debito" na cauda também sai: forma de pagamento não é nome. */
  assert.equal(desc('Mercado no debito em 08/10 R$ 829,00'), 'Mercado');
  assert.deepEqual(lida('Mercado no debito em 08/10 R$ 829,00'), { data: '2026-10-08', recusada: false });
  assert.equal(heuristicas.guessAmountFromText(limpo('Mercado no debito em 08/10 R$ 829,00')), 829);
  assert.equal(desc('Pix enviado em 05/10 R$ 50,00'), 'Pix enviado');
  assert.deepEqual(lida('Pix enviado em 05/10 R$ 50,00'), { data: '2026-10-05', recusada: false });
  ok('dd/mm com "em": data do ano corrente e descrição sem resto');

  /* Os outros sinais. */
  for (const [t, data, resto] of [
    ['Mercado dia 08/10 R$ 10,00', '2026-10-08', 'Mercado R$ 10,00'],
    ['Mercado no dia 8/10 R$ 10,00', '2026-10-08', 'Mercado R$ 10,00'],
    ['Mercado data: 08/10 R$ 10,00', '2026-10-08', 'Mercado R$ 10,00'],
    ['Pix 08/10 às 18:42 R$ 10,00', '2026-10-08', 'Pix R$ 10,00'],
    ['Pix 08/10 18:42 R$ 10,00', '2026-10-08', 'Pix R$ 10,00'],
    ['Pix em 08/10 14h30 R$ 10,00', '2026-10-08', 'Pix R$ 10,00'],
    ['Mercado em 08/10. R$ 10', '2026-10-08', 'Mercado. R$ 10'],
    ['MERCADO EM 08/10 R$ 10,00', '2026-10-08', 'MERCADO R$ 10,00'],
    ['Mercado parcela 1/3 em 08/10 R$ 10', '2026-10-08', 'Mercado parcela 1/3 R$ 10'],
  ]) {
    assert.deepEqual(lida(t), { data, recusada: false }, t);
    assert.equal(limpo(t), resto, t);
  }
  ok('conectivo ou hora marcam a data, e a parcela ao lado fica');

  /* Futuro vira ano anterior; hoje continua no ano corrente. */
  assert.equal(lida('Pix em 30/10 R$ 1').data, '2026-10-30', 'hoje é do ano corrente');
  assert.equal(lida('Pix em 31/10 R$ 1').data, '2025-10-31', 'amanhã é do ano anterior');
  assert.equal(lida('Pix em 28/12 R$ 1', '2027-01-05').data, '2026-12-28', 'virada de ano');
  assert.equal(lida('Pix em 05/01 R$ 1', '2027-01-05').data, '2027-01-05');
  assert.equal(lida('Pix em 06/01 R$ 1', '2027-01-05').data, '2026-01-06');
  ok('no futuro é do ano anterior, inclusive na virada do ano');

  /* Data impossível: não vira data válida, não rola de mês, sai da descrição
     e recebe a mesma recusa da data com ano (o campo pede a escolha). */
  for (const t of ['Mercado em 32/01 R$ 10,00', 'Mercado em 31/02 R$ 10,00', 'Mercado em 00/10 R$ 10,00',
    'Mercado em 10/13 R$ 10,00', 'Mercado em 10/00 R$ 10,00', 'Mercado em 29/02 R$ 10,00']) {
    assert.deepEqual(lida(t), { data: null, recusada: true }, t);
    assert.equal(desc(t), 'Mercado', t);
  }
  assert.deepEqual(lida('Mercado em 31/02/2026 R$ 10,00'), { data: null, recusada: true }, 'com ano, a mesma recusa');
  ok('data impossível é recusada, sem rolar para outro mês');

  /* 29/02: vale só no ano bissexto, sem cair em 28/02 nem 01/03. */
  assert.deepEqual(lida('Pix em 29/02 R$ 1', '2028-03-01'), { data: '2028-02-29', recusada: false });
  assert.deepEqual(lida('Pix em 29/02 R$ 1', '2028-01-15'), { data: null, recusada: true }, '2028 no futuro, 2027 não é bissexto');
  ok('29/02 só em ano bissexto');

  /* Parcela: não vira data nem some do texto. */
  for (const t of ['TV 03/12 R$ 100,00', 'TV 3/12 R$ 100,00', 'TV parcela 03/12 R$ 100,00', 'TV parcela em 03/12 R$ 100,00',
    'TV parcelado 03/12 às 18:42 R$ 100,00', 'TV 2/3 R$ 100,00', 'TV em 10x de R$ 100,00', 'TV em 3/12 parcelas R$ 100,00',
    'TV 2/12 parcelas R$ 100,00', 'TV de 03/12 R$ 100,00']) {
    assert.deepEqual(lida(t), { data: null, recusada: false }, t);
    assert.equal(limpo(t), t, t);
  }
  ok('parcela não vira data nem some do texto');

  /* Hora, valor, cartão, código e vencimento não são a data do pagamento. */
  for (const t of ['Pix as 18:42 R$ 10,00', 'Mercado R$ 12,10', 'Mercado em 12,10', 'Mercado em 12.10', 'Mercado em 12-10',
    'Cartao final 1234 R$ 12,10', 'Cartao 5500 0000 0000 0004 R$ 1,00', 'Validade 12/28 R$ 1,00', 'Doc em 123/45 R$ 1,00',
    'Doc em 12/345 R$ 1,00', 'item 08/10 R$ 1,00', 'Boleto vence em 05/11 R$ 100,00', 'Vencimento em 05/11 R$ 100,00', 'Loja 32/01 R$ 10']) {
    assert.deepEqual(lida(t), { data: null, recusada: false }, t);
    assert.equal(limpo(t), t, t);
  }
  ok('hora, valor, cartão, código e vencimento não viram data');

  /* A data com ano não muda, nem a recusa dela, e tem prioridade. */
  assert.deepEqual(lida('Mercado em 26/09/2026 R$ 10,00'), { data: '2026-09-26', recusada: false });
  assert.equal(desc('Mercado em 26/09/2026 R$ 10,00'), 'Mercado');
  for (const t of ['Pix em 31/10/2026', 'Pix em 10/09/2024', 'Pix em 32/01/2026']) {
    assert.deepEqual(lida(t), { data: null, recusada: true }, t);
  }
  assert.equal(lida('Pix em 08/10 pago em 26/09/2026').data, '2026-09-26', 'a data com ano vence a sem ano');
  assert.equal(lida('Pix em 08/10 pago em 26 de setembro de 2026').data, '2026-09-26', 'por extenso também');
  ok('dd/mm/aaaa continua igual, inclusive a recusa');

  /* Regra 13: a voz não passa por aqui. Valores medidos ANTES desta mudança. */
  const dataDaFala = carregar('lib/data-da-fala.ts');
  for (const [t, data, texto] of [
    ['Mercado no debito em 08/10 R$ 829,00', '2026-10-08', 'Mercado no debito em R$ 829,00'],
    ['Pix enviado em 05/10 R$ 50,00', '2026-10-05', 'Pix enviado em R$ 50,00'],
    ['TV 03/12 R$ 100,00', null, 'TV R$ 100,00'],
    ['mercado 50 reais dia 8 de outubro', '2026-10-08', 'mercado 50 reais'],
    ['mercado 50 reais ontem', '2026-10-29', 'mercado 50 reais'],
  ]) {
    const r = dataDaFala.dataInicialDaRevisao(t, { referencia: OUT, aproximada: false });
    assert.deepEqual([r.data, r.textoSemData], [data, texto], t);
  }
  for (const a of ['lib/data-da-fala.ts', 'lib/heuristics.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, a), 'utf8'), /nota-foto-parser/, a + ' não usa as funções do Colar');
  }
  ok('a voz não muda (regra 13): mesmo resultado do núcleo dela, sem depender do Colar');

  /* Barra solta na descrição (ordem de 30/10/2026). Quem sai é o número com
     barra inteiro, em guessDescFromText, e a barra escrita pela pessoa fica.
     As duas entradas chegam à mesma descrição, cada uma pelo módulo real. */
  const REF = { referencia: OUT, aproximada: false };
  const colarDesc = (t) => desc(t);
  const vozDesc = (t) => heuristicas.descricaoDoLancamento(dataDaFala.dataDaFala(t, REF).textoSemData, 'out');
  for (const [t, esperado] of [
    ['TV 03/12 R$ 100,00', 'TV'],
    ['Loja 03/09 R$ 10', 'Loja'],
    ['TV 2/3 R$ 100,00', 'TV'],
    ['academia 24/7 R$ 80,00', 'Academia'],
    ['comprei 3/12 parcelas 50 reais', 'Parcelas'],
    ['Mercado / Padaria R$ 10', 'Mercado / Padaria'],
  ]) {
    assert.equal(colarDesc(t), esperado, `Colar: ${t}`);
    assert.equal(vozDesc(t), esperado, `voz: ${t}`);
  }
  ok('sem barra solta, com a mesma descrição no Colar e na voz');

  const cru = (t) => heuristicas.guessDescFromText(t, 'out');
  assert.equal(cru('TV parcela 03/12 R$ 100,00'), 'TV parcela', 'só o número sai; a palavra parcela fica');
  assert.equal(cru('Conta 03/09/2026 R$ 10,00'), 'Conta', 'data inteira também não deixa barra');
  assert.equal(cru('Plano 100/mes'), 'Plano /mes', 'barra ligada a palavra continua como antes');
  assert.equal(cru('TCP/IP R$ 10,00'), 'TCP/IP', 'barra entre letras fica');
  assert.equal(heuristicas.guessAmountFromText('TV 03/12 R$ 100,00'), 100, 'o valor continua lido');
  ok('barra escrita pela pessoa e o valor continuam iguais');
}

/* ── 5. A tela: grava na data lida, só no texto colado ──────────────────── */
{
  const tela = fs.readFileSync(path.join(root, 'components/PasteReceiptModal.tsx'), 'utf8');
  /* A data gravada, o campo editável e a recusa são provados EXECUTANDO a
     tela em __tests__/data-da-compra-colar.cjs (30/09/2026). Aqui fica o que
     é de fonte: a revisão da voz não lê a data do texto colado. */
  assert.match(tela, /const lida = origemVoz \? \{ data: null, recusada: false \} : dataDoTexto\(text, todayISO\(\)\);/,
    'só o texto colado tem a data lida; a revisão da voz segue hoje, como o widget');
  /* 4c (Flare e Beacon, 30/09/2026) e campo de data (30/09): a data saiu dos
     chips de "Também reconhecido"; recusada, ela vira a dica do campo. */
  assert.doesNotMatch(tela, /data do texto ignorada|vai com a de hoje/, 'nenhum chip de data recusada');
  assert.match(tela, /'A data do texto não foi usada\. Escolha a data\.'/, 'a recusa vira a dica do campo');
  const foto = fs.readFileSync(path.join(root, 'components/FotoNotaModal.tsx'), 'utf8');
  assert.match(foto, /setData\(detalhes\.data \?\? todayISO\(\)\)/, 'foto: data lida do cupom, hoje só sem ela');
}
ok('Colar grava na data do texto; foto já gravava na data do documento');

console.log(`\n${checagens} checagens da data do texto colado passaram — 0 falhas`);
