/*
 * A janela de lançamento tem de caber acima do teclado em QUALQUER aparelho.
 *
 * O defeito que originou este teste: no celular do autor o teclado não cobria
 * a janela, e no de um usuário, de tela menor e com a fonte do sistema
 * aumentada, cobria — o botão "Salvar lançamento" ficava atrás do teclado e
 * não havia como chegar nele. A janela era centralizada na TELA INTEIRA, então
 * metade dela nascia abaixo do meio, que é exatamente onde o teclado fica.
 *
 * Testa o MÓDULO REAL (`lib/breakpoints.ts`), transpilado em memória, e não
 * uma cópia da conta.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
require('./modais-regressao.cjs');

const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('lib/breakpoints.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  {
    exports: api,
    Math,
    require: (nome) => {
      // Só as constantes de tema importam para a conta; o resto do módulo usa
      // hooks que este teste não exercita.
      if (nome === './theme') return { radius: { xl: 20 }, spacing: { md: 12 } };
      if (nome === 'react') return { useCallback: (fn) => fn, useState: (v) => [v, () => {}] };
      if (nome === 'react-native') return { Platform: { OS: 'android' }, useWindowDimensions: () => ({}) };
      if (nome === './teclado') return { useKeyboardHeight: () => 0 };
      throw new Error('import inesperado: ' + nome);
    },
  }
);

const { medidasDeJanelaFlutuante } = api;

/* Cada caso é: nome, altura que o app pediu, altura que o sistema DEU, altura
   do teclado. A diferença entre pedido e recebido é o que o sistema já
   descontou sozinho. */
const casos = [
  // Android com a janela redimensionada pelo sistema: ele já tirou o teclado.
  ['android redimensiona, tela pequena', 592, 332, 260],
  ['android redimensiona, tela média', 800, 480, 320],
  ['android redimensiona, tela grande', 932, 592, 340],
  // iOS, ou Android configurado para empurrar: o sistema não tira nada.
  ['sistema não encolhe, tela pequena', 592, 592, 260],
  ['sistema não encolhe, tela grande', 932, 932, 340],
  // Meio-termo: o sistema tirou parte, o app reserva o resto.
  ['sistema encolhe pela metade', 800, 640, 320],
  // Teclado fechado, em qualquer sistema.
  ['teclado fechado', 800, 800, 0],
  // Patológicos.
  ['teclado maior que a tela', 592, 592, 700],
  ['medição ainda não chegou', 800, 0, 320],
];

let verificacoes = 0;
for (const [nome, pedida, recebida, teclado] of casos) {
  const { recuoInferior, tetoDeAltura } = medidasDeJanelaFlutuante(pedida, recebida, teclado);
  const espaco = recebida > 0 ? recebida : pedida;

  // A GARANTIA: a janela mais o que ela reserva cabem no espaço que existe.
  assert.ok(
    tetoDeAltura + recuoInferior <= espaco,
    `${nome}: passa do espaço (teto ${tetoDeAltura} + recuo ${recuoInferior} > ${espaco})`
  );
  verificacoes++;

  // Medida negativa faz o painel sumir e voltar, que é a piscada.
  assert.ok(tetoDeAltura >= 0 && recuoInferior >= 0, `${nome}: medida negativa`);
  verificacoes++;
}

/* O defeito que o autor viu e descreveu como "espaço vazio entre o teclado e a
   janela": quando o sistema JÁ encolheu a janela, reservar o teclado de novo
   abre um vão do tamanho dele. Com o desconto duplo, o recuo aqui seria 332. */
{
  const { recuoInferior } = medidasDeJanelaFlutuante(592, 332, 260);
  assert.equal(recuoInferior, 12, 'sistema que já encolheu não pode ser descontado de novo');
  verificacoes++;
}

/* E o inverso: onde o sistema não encolhe, o teclado PRECISA ser reservado,
   senão ele volta a cobrir o botão de salvar. */
{
  const { recuoInferior } = medidasDeJanelaFlutuante(592, 592, 260);
  assert.equal(recuoInferior, 272, 'sistema que não encolhe exige a reserva inteira');
  verificacoes++;
}

/* Meio-termo: reserva só o que faltou. */
{
  const { recuoInferior } = medidasDeJanelaFlutuante(800, 640, 320);
  assert.equal(recuoInferior, 12 + 160, 'reserva apenas a parte que o sistema não tirou');
  verificacoes++;
}

// A mesma tela e o mesmo teclado dão a MESMA janela útil, tenha o sistema
// encolhido ou não. É o que significa "adaptável ao aparelho".
{
  const encolhido = medidasDeJanelaFlutuante(592, 332, 260);
  const naoEncolhido = medidasDeJanelaFlutuante(592, 592, 260);
  assert.equal(
    encolhido.tetoDeAltura,
    naoEncolhido.tetoDeAltura,
    'a janela útil não pode depender de o sistema encolher ou não'
  );
  verificacoes++;
}

console.log(
  `OK janela acima do teclado: ${verificacoes} verificações em ${casos.length} combinações de aparelho e sistema — cabe no espaço real, sem desconto duplo e sem medida negativa.`
);
