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
    require: (id) => { throw new Error(`import não simulado em ${arquivo}: ${id}`); },
  }, { filename: arquivo });
  return exports;
}
const { dataDoTexto, extrairDetalhesDaNota } = carregar('lib/nota-foto-parser.ts');
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

/* ── 5. A tela: grava na data lida, só no texto colado ──────────────────── */
{
  const tela = fs.readFileSync(path.join(root, 'components/PasteReceiptModal.tsx'), 'utf8');
  assert.match(tela, /occurred_on: dataDoComprovante \?\? todayISO\(\)/, 'grava na data do texto, hoje só sem ela');
  assert.match(tela, /const lida = origemVoz \? \{ data: null, recusada: false \} : dataDoTexto\(text, todayISO\(\)\);/,
    'só o texto colado tem a data lida; a revisão da voz segue hoje, como o widget');
  assert.match(tela, /dataRecusada \? 'data do texto ignorada, vai com a de hoje' : null/, 'data recusada deixa recibo na tela');
  assert.match(tela, /dataDoComprovante \? `data \$\{dataDoComprovante\.split\('-'\)\.reverse\(\)\.join\('\/'\)\}` : null/,
    'a data lida aparece na confirmação');
  const qr = fs.readFileSync(path.join(root, 'components/QrScannerModal.tsx'), 'utf8');
  assert.match(qr, /occurred_on: nota\.dataEmissao/, 'QR: grava na data de emissão lida do QR');
  const foto = fs.readFileSync(path.join(root, 'components/FotoNotaModal.tsx'), 'utf8');
  assert.match(foto, /setData\(detalhes\.data \?\? todayISO\(\)\)/, 'foto: data lida do cupom, hoje só sem ela');
}
ok('Colar grava na data do texto; QR e foto já gravavam na data do documento');

console.log(`\n${checagens} checagens da data do texto colado passaram — 0 falhas`);
