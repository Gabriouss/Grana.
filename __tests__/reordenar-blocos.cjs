// Regras puras do arrastar da janela "Personalizar Início" (lib/reordenar-blocos.ts),
// executadas no módulo real: troca das duas posições, busca do cartão sob o dedo
// (com a lista rolada) e passo da rolagem automática nas bordas.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const ts = require('typescript');

const saida = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/reordenar-blocos.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: saida, console });
const { trocarPosicoes, blocoSobOsDedos, passoDeRolagem } = saida;

// Troca: só os dois índices mudam (não "tira e insere").
const lista = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, visible: true }));
const trocada = trocarPosicoes(lista, 'a', 'd');
assert.deepStrictEqual(trocada.map((i) => i.key), ['d', 'b', 'c', 'a', 'e']);
assert.deepStrictEqual(lista.map((i) => i.key), ['a', 'b', 'c', 'd', 'e'], 'não altera a lista original');
assert.strictEqual(trocarPosicoes(lista, 'b', 'b'), lista, 'mesma chave: nada muda');
assert.strictEqual(trocarPosicoes(lista, 'a', 'zzz'), lista, 'chave inexistente: nada muda');
// Primeiro com último, o caso da rolagem automática.
assert.deepStrictEqual(trocarPosicoes(lista, 'e', 'a').map((i) => i.key), ['e', 'b', 'c', 'd', 'a']);

// Cartão sob o dedo: alturas diferentes, frestas entre eles, lista rolada.
// y é medido a partir do topo da parte visível da lista (altura 400 aqui).
const areas = [
  { chave: 'a', topo: 0, altura: 100 },
  { chave: 'b', topo: 108, altura: 160 },
  { chave: 'c', topo: 276, altura: 100 },
];
const visivel = 400;
assert.strictEqual(blocoSobOsDedos(areas, 50, 0, visivel), 'a');
assert.strictEqual(blocoSobOsDedos(areas, 104, 0, visivel), null, 'fresta entre cartões');
assert.strictEqual(blocoSobOsDedos(areas, 200, 0, visivel), 'b');
// Rolando 150 px, o mesmo ponto da tela cai em outro cartão.
assert.strictEqual(blocoSobOsDedos(areas, 200, 150, visivel), 'c');
// Dedo fora da parte visível (cabeçalho acima, "Concluir" abaixo): nunca troca
// com um cartão escondido, mesmo que haja um cartão naquela posição do conteúdo.
assert.strictEqual(blocoSobOsDedos(areas, -10, 150, visivel), null, 'acima da lista');
assert.strictEqual(blocoSobOsDedos(areas, -1, 0, visivel), null);
assert.strictEqual(blocoSobOsDedos(areas, visivel + 20, 0, 350), null, 'abaixo da lista, com cartão c escondido');
assert.strictEqual(blocoSobOsDedos(areas, 330, 0, 300), null, 'fora da altura visível');

// Rolagem automática: zero no meio, sobe/desce perto das bordas, mais forte quanto mais perto.
const borda = 48, max = 14, alt = 800;
assert.strictEqual(passoDeRolagem(500 + 400, 500, alt, borda, max), 0);
assert.ok(passoDeRolagem(500 + 10, 500, alt, borda, max) < 0, 'perto de cima sobe');
assert.ok(passoDeRolagem(500 + alt - 10, 500, alt, borda, max) > 0, 'perto de baixo desce');
assert.ok(Math.abs(passoDeRolagem(500 + 2, 500, alt, borda, max)) > Math.abs(passoDeRolagem(500 + 40, 500, alt, borda, max)));
assert.strictEqual(passoDeRolagem(500 - 30, 500, alt, borda, max), -max, 'fora da lista, no máximo');
console.log('OK reordenar-blocos: troca de duas posições, cartão sob o dedo com a lista rolada e passo da rolagem automática.');
