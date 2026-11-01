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
const areas = [
  { chave: 'a', topo: 0, altura: 100 },
  { chave: 'b', topo: 108, altura: 160 },
  { chave: 'c', topo: 276, altura: 100 },
];
const topoDaLista = 500;
assert.strictEqual(blocoSobOsDedos(areas, 550, topoDaLista, 0), 'a');
assert.strictEqual(blocoSobOsDedos(areas, 500 + 104, topoDaLista, 0), null, 'fresta entre cartões');
assert.strictEqual(blocoSobOsDedos(areas, 500 + 200, topoDaLista, 0), 'b');
// Rolando 150 px, o mesmo ponto da tela cai em outro cartão.
assert.strictEqual(blocoSobOsDedos(areas, 500 + 200, topoDaLista, 150), 'c');
assert.strictEqual(blocoSobOsDedos(areas, 10, topoDaLista, 0), null, 'acima da lista');

// Rolagem automática: zero no meio, sobe/desce perto das bordas, mais forte quanto mais perto.
const borda = 48, max = 14, alt = 800;
assert.strictEqual(passoDeRolagem(500 + 400, 500, alt, borda, max), 0);
assert.ok(passoDeRolagem(500 + 10, 500, alt, borda, max) < 0, 'perto de cima sobe');
assert.ok(passoDeRolagem(500 + alt - 10, 500, alt, borda, max) > 0, 'perto de baixo desce');
assert.ok(Math.abs(passoDeRolagem(500 + 2, 500, alt, borda, max)) > Math.abs(passoDeRolagem(500 + 40, 500, alt, borda, max)));
assert.strictEqual(passoDeRolagem(500 - 30, 500, alt, borda, max), -max, 'fora da lista, no máximo');
console.log('OK reordenar-blocos: troca de duas posições, cartão sob o dedo com a lista rolada e passo da rolagem automática.');
