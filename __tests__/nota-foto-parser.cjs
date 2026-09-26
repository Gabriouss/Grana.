// Parser do valor total lido de uma FOTO de nota fiscal (lib/nota-foto-parser.ts).
// Roda o módulo real, transpilado; o texto simula o que o OCR devolve, com o
// ruído típico de cupom térmico: "R$" lido como "RS", rótulo e valor em linhas
// separadas, rodapé de tributos e de itens.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const js = ts.transpileModule(fs.readFileSync('lib/nota-foto-parser.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { exports: mod.exports, module: mod, Number, Set, RegExp, String });
const { extrairTotalDaFoto } = mod.exports;

let ok = 0;
function caso(nome, texto, valorTotal, motivo) {
  const r = extrairTotalDaFoto(texto);
  assert.equal(r.valorTotal, valorTotal, nome + ': valor ' + JSON.stringify(r));
  assert.equal(r.motivo, motivo, nome + ': motivo ' + JSON.stringify(r));
  ok++;
  console.log('  ok  ' + nome);
}

caso('NFC-e comum, rótulo e valor na mesma linha',
  'SUPERMERCADO BOM PRECO\nCNPJ 12.345.678/0001-90\nARROZ 5KG 1 UN 28,90\nFEIJAO 1KG 1 UN 8,49\nQTD. TOTAL DE ITENS 2\nVALOR TOTAL R$ 37,39\nCARTAO DE CREDITO 37,39',
  37.39, 'ok');

caso('rótulo numa linha e valor na seguinte',
  'PADARIA\nPAO FRANCES 0,300 KG 5,97\nVALOR TOTAL\nR$ 5,97',
  5.97, 'ok');

caso('milhar com ponto', 'LOJA\nTOTAL A PAGAR R$ 1.234,56', 1234.56, 'ok');

caso('R$ lido como RS e zero lido como O no rótulo',
  'FARMACIA\nT0TAL RS 89,90', 89.9, 'ok');

caso('SUBTOTAL, desconto e troco não são o total',
  'ITEM A 50,00\nSUBTOTAL 50,00\nDESCONTO 5,00\nTOTAL 45,00\nDINHEIRO 50,00\nTROCO 5,00',
  45, 'ok');

caso('tributos aproximados no rodapé não viram total',
  'TOTAL R$ 120,00\nTributos Totais Aproximados R$ 21,36',
  120, 'ok');

caso('mesmo total repetido não é ambiguidade',
  'VALOR TOTAL R$ 15,00\nTOTAL 15,00', 15, 'ok');

caso('dois totais diferentes: ambíguo, campo em branco',
  'VALOR TOTAL R$ 15,00\nVALOR TOTAL R$ 18,00', null, 'ambiguo');

caso('sem rótulo de total, nunca chuta o maior valor',
  'ARROZ 28,90\nFEIJAO 8,49\nCARNE 42,10', null, 'sem_total');

caso('texto vazio', '', null, 'sem_total');

caso('total zerado não vale', 'VALOR TOTAL R$ 0,00', null, 'sem_total');

caso('número sem centavos não é valor', 'TOTAL DE ITENS 12\nVALOR TOTAL R$ 12', null, 'sem_total');

console.log('\n' + ok + '/' + ok + ' checagens do parser da foto da nota passaram\n');
