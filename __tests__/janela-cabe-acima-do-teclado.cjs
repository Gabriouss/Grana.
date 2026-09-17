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
      if (nome === 'react') return { useCallback: (fn) => fn, useState: (v) => [v, () => {}] };
      if (nome === 'react-native') return { Platform: { OS: 'android' }, useWindowDimensions: () => ({}) };
      if (nome === './teclado') return { useKeyboardHeight: () => 0 };
      throw new Error('import inesperado: ' + nome);
    },
  }
);

const { medidasDeJanelaFlutuante, geometriaDaConversa } = api;

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

/* ── Granachat: a janela cabe e fica parada em qualquer tela ─────────────
 *
 * Três defeitos originaram esta parte, os três vistos em aparelho em
 * 16/09/2026:
 *
 * 1. o cabeçalho da conversa sumia pelo topo e sobrava um vão antes do
 *    teclado — a conta usava insets que valem ZERO dentro do fundo;
 * 2. a primeira correção (`90a3469`) mediu a área interna do fundo e usou a
 *    medida para decidir o recuo do próprio fundo. A conta virou um espelho,
 *    e no aparelho do autor a janela pulava entre duas posições várias vezes
 *    por segundo, com o campo sumindo atrás do teclado;
 * 3. nenhuma das duas sabia que o Android roda em DOIS modos, e que o mesmo
 *    aparelho troca de um para o outro.
 *
 * Os números abaixo NÃO são inventados: são as leituras da sonda instalada no
 * Granachat durante a auditoria, uma por configuração de tela do emulador
 * (tamanho, densidade, navegação por gestos ou por 3 botões, paisagem,
 * tablet). `fundo` é o `measureInWindow` do fundo; `janela` é
 * `useWindowDimensions`; `teclado` é `endCoordinates.height`; `topoTeclado` é
 * o `screenY` do evento convertido para as mesmas coordenadas (conferido
 * contra `janela - teclado` em todas); `reserva` é a barra medida. */
{
  const MARGEM = 12;
  const RAZAO = 3 / 4;
  const LARGURA_MAXIMA = 510;

  const aparelhos = [
    // [nome, fundo {x,y,largura,altura} fechado, fundo aberto, janela {largura, altura}, teclado, reserva]
    ['ponta a ponta 1080x2400', [0, -50.3, 411.4, 914.3], [0, -50.3, 411.4, 914.3], [411.4, 840], 312.4, 117],
    ['ponta a ponta 1080x2388 (resolução do autor)', [0, -49.9, 411.4, 909.7], [0, -49.9, 411.4, 909.7], [411.4, 835.8], 312.4, 117],
    ['encolhe 720x1280 @320', [0, 0, 360, 581], [0, 0, 360, 306], [360, 581], 275, 117],
    ['encolhe 1440x3120 @560', [0, 0, 411.4, 818.3], [0, 0, 411.4, 506.3], [411.4, 818.3], 312, 117],
    ['encolhe 1080x2400 @480', [0, 0, 360, 732], [0, 0, 360, 453], [360, 732], 279, 117],
    ['encolhe tela baixa 1080x1700', [0, 0, 411.4, 587.8], [0, 0, 411.4, 279.6], [411.4, 587.8], 308.2, 117],
    ['encolhe navegação de 3 botões', [0, 0, 411.4, 816], [0, 0, 411.4, 527.6], [411.4, 816], 288.4, 117],
    ['ponta a ponta paisagem 2400x1080', [0, -28.2, 914.3, 411.4], [0, -28.2, 914.3, 411.4], [914.3, 335.2], 0, 127],
    ['ponta a ponta tablet 1600x2560 (lateral)', [0, -70.5, 800, 1280], [0, -70.5, 800, 1280], [800, 1149.5], 325, 0],
    ['ponta a ponta tablet deitado (lateral)', [0, -44, 1280, 800], [0, -44, 1280, 800], [1280, 696], 279, 0],
  ];

  const ret = ([x, y, largura, altura]) => ({ x, y, largura, altura });
  const calcular = (fundo, janela, teclado, reserva) =>
    geometriaDaConversa({
      fundo: ret(fundo),
      janela: { largura: janela[0], altura: janela[1] },
      teclado,
      reservaDaBarra: reserva,
      topoSeguro: 0,
      margem: MARGEM,
      razao: RAZAO,
      larguraMaxima: LARGURA_MAXIMA,
    });
  // Converte a geometria (local ao fundo) para as coordenadas da janela.
  const naJanela = (g, fundo) => ({
    topo: g.top + fundo[1],
    base: g.top + fundo[1] + g.altura,
    esquerda: g.left + fundo[0],
    direita: g.left + fundo[0] + g.largura,
  });
  const perto = (a, b) => Math.abs(a - b) < 0.01;
  const mesmaJanela = (a, b, msg) => {
    for (const k of Object.keys(b)) assert.ok(perto(a[k], b[k]), `${msg} (${k}: ${a[k]} x ${b[k]})`);
  };

  for (const [nome, fundoFechado, fundoAberto, janela, teclado, reserva] of aparelhos) {
    const fechado = calcular(fundoFechado, janela, 0, reserva);
    const f = naJanela(fechado, fundoFechado);
    const baseDaTela = Math.max(fundoFechado[1] + fundoFechado[3], janela[1]);

    // Nada negativo, nada fora da faixa: topo abaixo da barra de status (a
    // origem das coordenadas), base acima da barra de abas e da navegação.
    assert.ok(fechado.largura > 0 && fechado.altura > 0, `${nome}: janela sumiu com o teclado fechado`);
    assert.ok(f.topo >= MARGEM - 0.01, `${nome}: topo invade a barra de status (${f.topo})`);
    assert.ok(f.base <= janela[1] - MARGEM + 0.01, `${nome}: base invade a navegação do sistema`);
    assert.ok(f.base <= baseDaTela - reserva - MARGEM + 0.01, `${nome}: base invade a barra de abas`);
    assert.ok(f.esquerda >= MARGEM - 0.01 && f.direita <= janela[0] - MARGEM + 0.01, `${nome}: sai pelos lados`);
    // Com espaço sobrando, flutua no meio da faixa.
    const cima = MARGEM;
    const baixo = Math.min(baseDaTela, janela[1], baseDaTela - reserva) - MARGEM;
    assert.ok(perto(f.topo - cima, baixo - f.base), `${nome}: fechado deveria estar centralizado`);
    verificacoes += 6;

    if (teclado > 0) {
      const aberto = calcular(fundoAberto, janela, teclado, reserva);
      const a = naJanela(aberto, fundoAberto);
      const topoTeclado = janela[1] - teclado;
      assert.ok(aberto.altura > 0, `${nome}: janela sumiu com o teclado aberto`);
      assert.ok(a.topo >= MARGEM - 0.01, `${nome}: com teclado, topo invade a barra de status (${a.topo})`);
      // O defeito do vão: a janela POUSA no teclado, a exatamente uma margem.
      assert.ok(perto(a.base, topoTeclado - MARGEM), `${nome}: com teclado, base em ${a.base}, esperado ${topoTeclado - MARGEM}`);
      verificacoes += 3;

      /* A ordem entre o evento do teclado e a medição nova do fundo não é
         garantida quando o sistema encolhe a tela. As duas leituras
         intermediárias precisam dar a MESMA janela que a leitura final — é o
         que impede um quadro errado na transição. */
      const abrindoComFundoVelho = calcular(fundoFechado, janela, teclado, reserva);
      mesmaJanela(
        naJanela(abrindoComFundoVelho, fundoFechado),
        a,
        `${nome}: ao abrir, fundo ainda sem encolher não pode mudar a janela`
      );
      const fechandoComFundoVelho = calcular(fundoAberto, janela, 0, reserva);
      mesmaJanela(
        naJanela(fechandoComFundoVelho, fundoAberto),
        f,
        `${nome}: ao fechar, fundo ainda encolhido não pode encolher a janela`
      );
      verificacoes += 2;
    }
  }

  /* Os dois modos, lado a lado, com a MESMA tela e o MESMO teclado: a janela
     tem de ficar no mesmo lugar da tela. É isto que "adaptável" quer dizer —
     a conta não pode depender de o sistema encolher a tela ou não. */
  {
    const janela = [411.4, 840];
    const ponta = naJanela(calcular([0, -50.3, 411.4, 914.3], janela, 312.4, 117), [0, -50.3, 411.4, 914.3]);
    const encolhe = naJanela(calcular([0, 0, 411.4, 527.6], janela, 312.4, 117), [0, 0, 411.4, 527.6]);
    mesmaJanela(ponta, encolhe, 'ponta a ponta e tela que encolhe precisam dar a mesma janela');
    verificacoes++;
  }

  /* O laço de `90a3469`: com a conta antiga, a leitura seguinte dependia da
     anterior. Aqui, a mesma entrada dá sempre a mesma saída, e a saída não é
     entrada de nada — rodar mil vezes seguidas não pode mover a janela. */
  {
    const entrada = [[0, -49.9, 411.4, 909.7], [411.4, 835.8], 312.4, 117];
    const primeira = calcular(...entrada);
    for (let i = 0; i < 1000; i++) assert.deepEqual(calcular(...entrada), primeira);
    verificacoes++;
  }

  /* Tablet com teclado: a janela 3:4 é menor que a faixa e pousa no teclado,
     sem vão (a versão centralizada deixava 92dp entre os dois). */
  {
    const g = calcular([0, -70.5, 800, 1280], [800, 1149.5], 325, 0);
    assert.equal(g.largura, LARGURA_MAXIMA);
    assert.ok(perto(g.altura, LARGURA_MAXIMA / RAZAO), 'no tablet sobra espaço, então vale a proporção 3:4');
    assert.ok(perto(g.top + -70.5 + g.altura, 1149.5 - 325 - MARGEM), 'e pousa no teclado');
    verificacoes += 3;
  }

  /* Faixa baixa (paisagem): a janela fica LARGA e baixa, nunca estreita. */
  {
    const g = calcular([0, -28.2, 914.3, 411.4], [914.3, 335.2], 0, 127);
    assert.equal(g.largura, LARGURA_MAXIMA, 'em paisagem usa a largura de leitura inteira');
    assert.ok(g.altura < g.largura / RAZAO, 'e a altura cede à faixa');
    verificacoes += 2;
  }

  /* Degenerados: teclado maior que a janela, fundo zerado. Nada negativo. */
  for (const [nome, fundo, janela, teclado] of [
    ['teclado maior que a janela', [0, 0, 400, 800], [400, 800], 900],
    ['fundo zerado', [0, 0, 0, 0], [0, 0], 0],
  ]) {
    const g = calcular(fundo, janela, teclado, 117);
    assert.ok(g.largura >= 0 && g.altura >= 0, `${nome}: medida negativa`);
    verificacoes++;
  }

  /* E o componente precisa usar a conta do jeito que ela exige: medindo o
     FUNDO, sem recuo nele, com a janela posicionada pela geometria, e sem as
     leituras que já enganaram (insets, altura da barra copiada). */
  {
    const chat = fs.readFileSync('components/Granachat.tsx', 'utf8');
    const layout = fs.readFileSync('app/(app)/_layout.tsx', 'utf8');
    assert.ok(/ref=\{fundoRef\}\s+onLayout=\{medirFundo\}\s+style=\{styles\.fundo\}/.test(chat), 'o fundo é medido e não recebe estilo calculado');
    assert.ok(!/paddingBottom:\s*recuo/.test(chat) && !/styles\.fundo,\s*\{/.test(chat), 'o fundo não pode receber recuo calculado — era o laço');
    const estiloFundo = chat.slice(chat.indexOf('  fundo: {'), chat.indexOf('},', chat.indexOf('  fundo: {')));
    assert.ok(!/padding/.test(estiloFundo), 'nem recuo fixo no estilo do fundo');
    assert.ok(/geometriaDaConversa\(/.test(chat) && /top: geometria\.top/.test(chat), 'a janela é posicionada pela geometria');
    assert.ok(!/useSafeAreaInsets|useTabBarInset|medidasDeJanelaFlutuante|TAB_BAR_ALTURA/.test(chat), 'sem insets, sem altura de barra copiada');
    assert.ok(/reservaDaBarra=\{temBarraLateral \? 0 : reservaDaBarra\}/.test(layout), 'a reserva da barra vem medida pelo layout');
    assert.ok(/measureInWindow/.test(layout) && /onMedirReserva=\{aoMedirReserva\}/.test(layout), 'e a barra se mede sozinha');
    verificacoes += 7;
  }
}

console.log(
  `OK janela acima do teclado: ${verificacoes} verificações — janelas flutuantes em ${casos.length} combinações de sistema, e o Granachat em 10 telas medidas nos dois modos do Android, sem desconto duplo, sem vão, sem laço e sem medida negativa.`
);
