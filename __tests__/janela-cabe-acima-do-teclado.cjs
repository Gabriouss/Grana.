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
      if (nome === 'react-native') return { Platform: { OS: 'android' }, useWindowDimensions: () => ({}) };
      if (nome === './teclado') return { useKeyboardHeight: () => 0 };
      throw new Error('import inesperado: ' + nome);
    },
  }
);

const { medidasDeJanelaFlutuante } = api;

/* Aparelhos reais, em pontos (dp), do menor ao maior. O teclado numérico do
   Android fica entre 35% e 50% da altura, e cresce junto com a fonte do
   sistema — por isso os casos extremos. */
const aparelhos = [
  ['tela pequena, teclado fechado', 592, 0],
  ['tela pequena, teclado numérico', 592, 260],
  ['tela pequena, fonte aumentada e teclado alto', 592, 300],
  ['tela média, teclado numérico', 800, 320],
  ['tela grande, teclado numérico', 932, 340],
  ['tablet, teclado alto', 1180, 420],
  ['caso patológico: teclado maior que a tela', 592, 700],
  ['caso patológico: altura zero durante a rotação', 0, 0],
];

let verificacoes = 0;
for (const [nome, altura, teclado] of aparelhos) {
  const { recuoInferior, tetoDeAltura } = medidasDeJanelaFlutuante(altura, teclado);

  // A GARANTIA: a janela inteira, mais o espaço reservado ao teclado, cabe na
  // tela. É isto que impede o teclado de cobrir o botão de salvar.
  assert.ok(
    tetoDeAltura + recuoInferior <= altura || altura === 0,
    `${nome}: a janela passa da tela (teto ${tetoDeAltura} + recuo ${recuoInferior} > altura ${altura})`
  );
  verificacoes++;

  // Nada de medida negativa, que faz o painel sumir e voltar — a piscada.
  assert.ok(tetoDeAltura >= 0, `${nome}: teto negativo`);
  assert.ok(recuoInferior >= 0, `${nome}: recuo negativo`);
  verificacoes += 2;

  /* O recuo reserva o teclado inteiro, senão ele volta a cobrir a janela. A
     exceção é o teclado reportado maior que a própria tela: aí reservar tudo
     empurraria o painel para fora, e cabe na tela tem prioridade sobre
     reservar o teclado. */
  assert.ok(
    recuoInferior >= Math.min(teclado, altura),
    `${nome}: o recuo não reserva o teclado nem o que a tela permite`
  );
  verificacoes++;
}

// Abrir o teclado só pode ENCOLHER a janela, nunca aumentá-la. Era o defeito
// da versão antiga: o painel crescia pela altura do teclado, ficando maior
// justamente quando a tela disponível diminuiu.
const fechado = medidasDeJanelaFlutuante(800, 0);
const aberto = medidasDeJanelaFlutuante(800, 320);
assert.ok(aberto.tetoDeAltura < fechado.tetoDeAltura, 'abrir o teclado deveria encolher a janela');
assert.equal(fechado.tetoDeAltura - aberto.tetoDeAltura, 320, 'a janela encolhe exatamente o tamanho do teclado');
verificacoes += 2;

// Teclado maior que a tela não pode virar janela de altura negativa.
assert.equal(medidasDeJanelaFlutuante(592, 700).tetoDeAltura, 0, 'teclado gigante zera o teto, não inverte');
verificacoes++;

// Altura de teclado inválida (negativa) é tratada como zero.
assert.deepEqual(
  medidasDeJanelaFlutuante(800, -50),
  medidasDeJanelaFlutuante(800, 0),
  'altura de teclado negativa vale como fechada'
);
verificacoes++;

console.log(
  `OK janela acima do teclado: ${verificacoes} verificações em ${aparelhos.length} aparelhos — cabe na tela, nunca negativa, e encolhe com o teclado.`
);
