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
vm.runInNewContext(js, { exports: mod.exports, module: mod, Number, Set, RegExp, String, Math });
const { extrairTotalDaFoto, textoPorFileira } = mod.exports;

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

/* Fileiras (26/09/2026). O ML Kit agrupa o cupom em blocos por COLUNA: os
   rótulos num bloco, os valores alinhados à direita noutro. Juntando bloco a
   bloco, "VALOR TOTAL R$" ficava longe do "18,75" e a nota inteira voltava sem
   total. Caixas no formato do ML Kit (top, left, height, width). */
const L = (text, top, left, height = 30) => ({ text, frame: { top, left, height, width: 200 } });
const padaria = [
  // bloco 1: cabeçalho e rótulos, coluna da esquerda
  L('PADARIA AUDIT', 30, 90), L('Qtd. total de itens', 255, 40), L('VALOR TOTAL R$', 300, 40),
  L('Cartao de Debito', 345, 40), L('Tributos Totais Incidentes', 400, 40),
  // bloco 2: valores da coluna da direita, levemente desalinhados como numa foto real
  L('2', 257, 620), L('18,75', 303, 610), L('18,75', 344, 610), L('2,10', 401, 620),
];
{
  const r = extrairTotalDaFoto(padaria.map((l) => l.text).join('\n'));
  assert.equal(r.valorTotal, null, 'bloco a bloco o rótulo fica sem valor: é o defeito que as fileiras corrigem');
  ok++; console.log('  ok  bloco a bloco, o cupom em colunas volta sem total (defeito reproduzido)');
}
{
  const linhas = textoPorFileira(padaria).split('\n');
  assert.ok(linhas.includes('VALOR TOTAL R$ 18,75'), 'rótulo e valor na mesma fileira: ' + linhas.join(' | '));
  assert.ok(linhas.includes('Qtd. total de itens 2'), linhas.join(' | '));
  ok++; console.log('  ok  por fileira, rótulo e valor da mesma altura viram uma linha, da esquerda para a direita');
}
caso('cupom em colunas: acha o total', textoPorFileira(padaria), 18.75, 'ok');
/* Com desconto, "VALOR TOTAL" (antes do desconto) e "Valor a Pagar" diferem.
   Até 26/09/2026 isso era "ambíguo" e o campo ficava em branco; o que saiu do
   bolso é o "a pagar", que agora tem nível próprio acima do "valor total". */
caso('cupom em colunas com desconto: vale o valor a pagar',
  textoPorFileira([
    L('VALOR TOTAL R$', 445, 40), L('Desconto R$', 490, 40), L('Valor a Pagar R$', 535, 40),
    L('52,40', 447, 600), L('6,50', 489, 610), L('45,90', 538, 600),
  ]), 45.9, 'ok');
caso('fileiras vizinhas não se misturam',
  textoPorFileira([L('TOTAL R$', 100, 40), L('9,99', 100, 600), L('TROCO', 140, 40), L('0,01', 141, 600)]), 9.99, 'ok');
{
  const semCaixa = [{ text: 'VALOR TOTAL R$' }, { text: '12,00' }];
  assert.equal(textoPorFileira(semCaixa), 'VALOR TOTAL R$\n12,00', 'sem caixa, mantém a ordem original');
  assert.equal(extrairTotalDaFoto(textoPorFileira(semCaixa)).valorTotal, 12);
  ok++; console.log('  ok  linha sem caixa: ordem original, e o valor da linha seguinte continua valendo');
}
{
  /* Foto muito torta: o valor fica mais de meia altura abaixo do rótulo e vai
     para a fileira seguinte, sozinho. O "valor na linha seguinte" o recupera;
     o que nunca pode sair é outro número. */
  const r = extrairTotalDaFoto(textoPorFileira([L('VALOR TOTAL R$', 300, 40), L('18,75', 330, 600), L('Cartao', 360, 40)]));
  assert.ok(r.valorTotal === null || r.valorTotal === 18.75, JSON.stringify(r));
  ok++; console.log('  ok  foto torta: ou acha o valor certo, ou deixa em branco');
}

console.log('\n' + ok + '/' + ok + ' checagens do parser da foto da nota passaram\n');
