// Tela Design System do painel local (Lumen).
//
// Mostra o sistema inteiro do Grana.: marca em todas as variantes, cores, tipografia,
// espaço e forma, elevação, movimento, componentes, tom de voz, regras de criativo,
// mockups e auditoria. Duas fontes:
//   1. design-system/tokens/tokens.json, lido do servidor local na hora (é a fonte
//      canônica da documentação, com a origem de cada token: extraído ou proposto);
//   2. APP, abaixo: espelho de lib/theme.ts, que é a tela no ar. O servidor não serve
//      lib/, então o espelho é escrito aqui; quando os dois divergem, vale theme.ts.
//      Conferido contra lib/theme.ts em 07/10/2026.
// Texto vindo de arquivo entra sempre por textContent (ctx.h) ou pelo markdown seguro.

const MARCA = '/design-system/marca/';

const APP = {
  cores: [
    ['paper', '#052229', 'Fundo de tela, trilhos e poços.'],
    ['paperRaised', '#0b2d35', 'Cartões, folhas, chips e menus.'],
    ['paperSelected', '#0c353e', 'Item selecionado numa lista de opções.'],
    ['mockupTela', '#02141a', 'Tela desligada dentro das molduras de aparelho.'],
    ['ink', '#effffa', 'Texto primário. Vira fundo nas superfícies invertidas (botão salvar, FAB, toast).'],
    ['inkSoft', '#a6d9ce', 'Links e ações textuais discretas.'],
    ['inkFaint', '#7fa9a0', 'Texto secundário, placeholder, ícone inativo. 5,6:1 sobre paperRaised.'],
    ['rule', 'rgba(174,255,227,0.14)', 'Bordas e divisórias em repouso. Menta com alfa, nunca cinza.'],
    ['ruleStrong', 'rgba(174,255,227,0.26)', 'Divisória com mais presença, campo de valor.'],
    ['hover', 'rgba(174,255,227,0.07)', 'Véu de hover, funciona sobre paper e paperRaised.'],
    ['superficieInativa', 'rgba(174,255,227,0.07)', 'Trilho vazio, conquista bloqueada.'],
    ['accent', '#1fa98d', 'Verde de trabalho. CTA da landing e preenchimentos ativos.'],
    ['accent2', '#aeffe3', 'Menta. Rara: marca, foco, valor em destaque.'],
    ['accentDeep', '#04475c', 'Fundo de círculos de ícone.'],
    ['up', '#74e291', 'Entrada de dinheiro.'],
    ['down', '#00a6ca', 'Saída de dinheiro. Ciano, porque gastar não é erro.'],
    ['danger', '#e08a7d', 'Só ação destrutiva e atraso. Nunca valor de gasto.'],
    ['entradaBorda', '#4f9483', 'Botão Entrada selecionado (fundo: mesma cor a 20%).'],
    ['saidaBorda', '#4f8894', 'Botão Saída selecionado (fundo: mesma cor a 20%).'],
  ],
  espaco: [['fio', 2, 'Entre rótulo e sub-rótulo.'], ['xs', 4], ['icone', 6, 'Entre ícone e texto.'], ['sm', 8], ['md', 12], ['lg', 16], ['xl', 20], ['xxl', 28]],
  raio: [['sm', 8], ['md', 12], ['lg', 16], ['xl', 22], ['pill', 999]],
  tipo: {
    // papel: [iOS, Android, web]
    micro: [11, 12, 12], legenda: [12, 12, 14], nota: [13, 14, 15], apoio: [15, 14, 16], corpo: [17, 16, 18],
    titulo: [20, 20, 20], destaque: [22, 22, 22], cabecalho: [24, 24, 24], marca: [28, 28, 28], valor: [32, 32, 32],
  },
  papeis: [
    ['metadata', 'Light', 'nota', 1.4, 'Subtítulo de linha e informação auxiliar.'],
    ['label', 'Regular', 'apoio', 1.35, 'Rótulos e controles.'],
    ['body', 'Regular', 'corpo', 1.45, 'Corpo, campo e botão.'],
    ['title', 'Regular', 'titulo', 1.25, 'Título de folha, modal ou cartão.'],
    ['headline', 'Regular', 'cabecalho', 1.2, 'Título principal de tela.'],
    ['amount', 'Regular', 'valor', 1.15, 'Valor monetário, sempre tabular.'],
  ],
  sombras: [
    ['menu', '0 6px 14px rgba(0,0,0,0.2)', 'Operar', 'Menu suspenso do FAB.'],
    ['flutuante', '0 6px 12px rgba(0,0,0,0.3)', 'Operar', 'O botão de ação flutuante.'],
    ['toast', '0 4px 10px rgba(0,0,0,0.25)', 'Operar', 'Notificação toast.'],
    ['barraAbas', '0 10px 30px -8px rgba(0,0,0,0.55)', 'Operar', 'Barra flutuante de navegação.'],
    ['abaCentral', '0 6px 18px -4px rgba(174,255,227,0.40), 0 3px 10px rgba(0,0,0,0.45)', 'Operar', 'A aba do Granabô, único glow de marca no app.'],
    ['conquista', '0 10px 28px -12px rgba(0,0,0,0.55)', 'Operar', 'Cartão de conquista desbloqueada.'],
    ['painelFlutuante', '0 18px 44px -14px rgba(0,0,0,0.65)', 'Operar', 'Granabô em tela e painel do menu da landing.'],
    ['cardPersuasao', '0 16px 40px -12px rgba(0,0,0,0.5)', 'Persuadir', 'Cartões de recurso, FAQ, Livre para Gastar na landing.'],
    ['cardHeroi', '0 32px 80px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(174,255,227,0.07)', 'Persuadir', 'Maior destaque de uma página persuasiva.'],
    ['navGatilho', '0 10px 30px -8px rgba(31,169,141,0.75)', 'Persuadir', 'Gatilho do menu flutuante da landing.'],
    ['ctaPrimario', '0 8px 22px -10px rgba(31,169,141,0.8)', 'Persuadir', 'CTA da landing.'],
    ['planoDestaque', '0 0 0 1px rgba(255,255,255,0.04), 0 10px 28px -12px rgba(174,255,227,0.65)', 'Persuadir', 'Plano em destaque na seção de preços.'],
  ],
};

const ARQUIVOS_MARCA = [
  // [arquivo, fundo do palco, rótulo, observação]
  ['logotipo-gradiente.svg', 'escuro', 'Logotipo em gradiente', 'Versão oficial. O ponto entra na rampa.'],
  ['logotipo-branco.svg', 'escuro', 'Logotipo branco', 'Ponto menta.'],
  ['logotipo-menta.svg', 'escuro', 'Logotipo menta', 'Ponto escuro.'],
  ['logotipo-escuro.svg', 'claro', 'Logotipo escuro', 'Ponto menta.'],
  ['simbolo-gradiente.svg', 'escuro', 'Símbolo em gradiente', 'Anel na rampa, ponto menta chapado.'],
  ['simbolo-branco.svg', 'escuro', 'Símbolo branco', ''],
  ['simbolo-escuro.svg', 'claro', 'Símbolo escuro', ''],
  ['simbolo-menta-sem-ponto.svg', 'escuro', 'Anel menta, sem ponto', 'Incompleto: não usar como símbolo.'],
  ['simbolo-ciano-sem-ponto.svg', 'escuro', 'Anel ciano, sem ponto', 'Incompleto: não usar como símbolo.'],
  ['icone-circular.svg', 'escuro', 'Ícone circular', 'Ícone do app e avatar de perfil.'],
  ['icone-fundo-escuro.svg', 'escuro', 'Ícone, fundo escuro', 'G em gradiente, ponto menta.'],
  ['icone-fundo-gradiente-escuro.svg', 'escuro', 'Ícone, fundo gradiente e G escuro', ''],
  ['icone-fundo-gradiente-branco.svg', 'escuro', 'Ícone, fundo gradiente e G branco', ''],
  ['texto-menta.svg', 'escuro', '"rana" menta', 'Só faz sentido ao lado do símbolo.'],
  ['texto-ciano.svg', 'escuro', '"rana" ciano', 'Só faz sentido ao lado do símbolo.'],
  ['texto-escuro.svg', 'claro', '"rana" escuro', 'Só faz sentido ao lado do símbolo.'],
];

const PREVIEWS = [
  ['marca.html', 'Marca'], ['cores.html', 'Cores'], ['tipografia.html', 'Tipografia'], ['espaco-e-forma.html', 'Espaço e forma'],
  ['movimento.html', 'Movimento'], ['componentes-acoes.html', 'Componentes: ações'], ['componentes-formulario.html', 'Componentes: formulário'],
  ['componentes-conteudo.html', 'Componentes: conteúdo'], ['auditoria.html', 'Auditoria (11 inconsistências)'],
];

const SECOES = [
  ['ds-marca', 'Marca'], ['ds-mascote', 'Mascote Granabô'], ['ds-cores', 'Cores'], ['ds-tipografia', 'Tipografia'], ['ds-espaco', 'Espaço e forma'],
  ['ds-elevacao', 'Elevação'], ['ds-movimento', 'Movimento'], ['ds-componentes', 'Componentes'], ['ds-voz', 'Tom de voz'],
  ['ds-criativo', 'Criativo e mockups'], ['ds-referencias', 'Referências e auditoria'],
];

// ---------------------------------------------------------------------------

export async function montar(raiz, ctx) {
  const h = ctx.h;
  ctx.cabecalho(raiz, 'Design System', 'Tudo o que define o visual e a voz do Grana., lido dos arquivos de design-system/ e do tema do app.');

  const corpo = h('div', { class: 'ds-corpo' });
  const indice = h('nav', { class: 'ds-indice', 'aria-label': 'Seções do design system' },
    SECOES.map(([id, nome]) => h('a', { href: `#${id}`, texto: nome, onclick: (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ block: 'start' }); } })));
  raiz.appendChild(h('div', { class: 'ds' }, indice, corpo));

  const carregando = ctx.estado.bloco ? ctx.estado.bloco.carregando('Lendo tokens.json…') : null;
  if (carregando) corpo.appendChild(carregando);

  let tokens = null;
  let erroTokens = null;
  try {
    tokens = await lerJson('/design-system/tokens/tokens.json');
  } catch (err) {
    erroTokens = err;
  }
  if (ctx.obsoleta && ctx.obsoleta()) return undefined;
  if (carregando) carregando.remove();
  if (erroTokens) {
    corpo.appendChild(h('div', { class: 'alerta alerta-atencao', role: 'note' },
      h('p', { texto: `Não consegui ler design-system/tokens/tokens.json (${erroTokens.message}). A página segue com o espelho do tema do app; as marcações de origem dos tokens ficam de fora.` })));
  }

  const limpezas = [];
  corpo.append(
    secaoMarca(h, tokens),
    secaoMascote(h),
    secaoCores(h, tokens),
    secaoTipografia(h, tokens),
    secaoEspaco(h),
    secaoElevacao(h),
    secaoMovimento(h, tokens, limpezas),
    secaoComponentes(h, ctx),
    await secaoVoz(h, ctx),
    secaoCriativo(h),
    secaoReferencias(h, tokens),
  );
  return () => limpezas.forEach((f) => f());
}

async function lerJson(caminho) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(caminho, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`o servidor respondeu ${r.status}`);
    return await r.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('demorou mais de 15 segundos');
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function lerTexto(caminho) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(caminho, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') || '';
    if (tipo.includes('text/html')) return null; // o servidor devolveu a casca, não o arquivo
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function secao(h, id, titulo, intro, ...filhos) {
  return h('section', { class: 'ds-secao', id, 'aria-labelledby': `${id}-t` },
    h('h2', { id: `${id}-t`, texto: titulo }),
    intro ? h('p', { texto: intro }) : null,
    filhos);
}

function sub(h, texto) { return h('h3', { class: 'ds-sub', texto }); }

function origem(h, valor) {
  if (!valor) return null;
  const mapa = { extraido: ['selo-ok', 'Extraído do app'], proposto: ['selo-alerta', 'Proposto'], estimado: ['selo-neutro', 'Estimado'] };
  const [classe, rotulo] = mapa[valor] || ['selo-neutro', valor];
  return h('span', { class: `selo ${classe} ds-origem`, texto: rotulo });
}

function amostraCor(h, nome, valor, uso, orig) {
  const amostra = h('div', { class: 'ds-cor-amostra' });
  amostra.style.setProperty('background', valor);
  return h('div', { class: 'ds-cor' }, amostra,
    h('div', { class: 'ds-cor-info' },
      h('span', { class: 'ds-cor-nome', texto: nome }),
      h('span', { class: 'ds-cor-valor mono', texto: valor }),
      uso ? h('span', { class: 'ds-cor-uso', texto: uso }) : null,
      origem(h, orig)));
}

// ---------------------------------------------------------------------------
// Marca

function secaoMarca(h, tokens) {
  const id = tokens && tokens.identidade;
  const destaque = h('figure', { class: 'ds-marca ds-marca-destaque' },
    h('div', { class: 'ds-marca-palco' }, h('img', { src: `${MARCA}logotipo-gradiente.svg`, alt: 'Logotipo Grana. em gradiente', loading: 'lazy' })),
    h('figcaption', null, h('span', { texto: 'Logotipo oficial em gradiente. É o que vai em toda peça (regra 23).' }), h('span', { class: 'mono', texto: 'design-system/marca/logotipo-gradiente.svg' })));

  const grade = h('div', { class: 'ds-marcas' }, ARQUIVOS_MARCA.map(([arq, fundo, rotulo, obs]) => h('figure', { class: 'ds-marca' },
    h('div', { class: 'ds-marca-palco', dados: { fundo } }, h('img', { src: MARCA + arq, alt: rotulo, loading: 'lazy' })),
    h('figcaption', null, h('span', { texto: rotulo }), obs ? h('span', { class: 'fraco', texto: obs }) : null, h('span', { class: 'mono', texto: arq })))));

  const grad = id && id.gradiente && id.gradiente.principal;
  const de = grad ? grad.de : '#b0f7c9';
  const para = grad ? grad.para : '#22a1c1';
  const gradiente = h('div', { class: 'ds-gradiente' }, h('span', { class: 'mono', texto: de }), h('span', { texto: 'Gradiente oficial, 45° descendente' }), h('span', { class: 'mono', texto: para }));

  const coresMarca = id && id.cor
    ? h('div', { class: 'ds-cores' }, Object.entries(id.cor).map(([nome, t]) => amostraCor(h, nome, t.valor, t.uso, t.origem)))
    : null;

  const regras = h('ul', { class: 'ds-regras' },
    regra(h, 'O símbolo é "G."', 'Anel mais ponto. O anel sozinho é peça incompleta. No logotipo, o G é o próprio símbolo, nunca uma letra digitada.'),
    regra(h, 'O gradiente atravessa a peça inteira', 'Uma rampa só, como objeto único. Em SVG: gradientUnits="userSpaceOnUse" com as coordenadas do arquivo; nunca objectBoundingBox, que reinicia a rampa em cada letra.'),
    regra(h, 'O ponto é sempre o contraste', 'Texto escuro ou branco leva ponto menta (#a9f8c8). Texto menta leva ponto escuro. No gradiente, o ponto entra na rampa.'),
    regra(h, 'Gradiente só na marca', 'A interface é toda de cores chapadas. Fundo de componente com gradiente é exceção única: o widget de voz no Android.'),
    regra(h, 'Ícone circular é o avatar', 'Perfil, favicon e foto de conta usam icone-circular.svg. O raio do ícone quadrado (18,65% do lado) é forma de marca, não raio de interface.'),
    regra(h, 'Peças de campanha', 'Logotipo sempre o gradiente oficial. Celular e notebook inteiros, com margem segura, nunca cortados na borda.'));

  return secao(h, 'ds-marca', 'Marca', 'Vetores originais de design-system/marca/, cada um sobre o fundo para o qual foi desenhado.',
    destaque, gradiente, sub(h, 'Todas as variantes'), grade,
    coresMarca ? sub(h, 'Cores da identidade (dos vetores)') : null, coresMarca,
    sub(h, 'Regras'), regras);
}

function regra(h, titulo, texto) {
  return h('li', null, h('strong', { texto: titulo }), texto);
}

// ---------------------------------------------------------------------------
// Mascote
// Espelha a seção "Mascote Granabô" de design-system/pagina/design-system.src.html.

function secaoMascote(h) {
  const legenda = 'Prancha escolhida, quatro vistas (0°, 45°, 90° e 180°), câmera ortográfica.';
  const img = h('img', { src: '/design-system/previews-img/granabo-prancha-w3.webp', alt: 'Prancha do Granabô com as quatro vistas: 0, 45, 90 e 180 graus', loading: 'lazy' });
  // a prancha é larga (1100×402): inteira, sem o recorte 16:9 dos aparelhos vazios
  img.style.setProperty('aspect-ratio', '1100 / 402');
  img.style.setProperty('object-fit', 'contain');
  const prancha = h('div', { class: 'ds-mockups' },
    h('figure', null, img,
      h('figcaption', null, legenda, h('br'), h('span', { class: 'mono fraco', texto: 'docs/mascote/granabo-prancha-w3.png' }))));
  // A animação do Blender (animar.py) só existe renderizada dentro desta prévia: os quadros soltos ficam fora do git.
  const video = h('video', { src: '/docs/marketing/reels-granabo/granabo-reels-previa.mp4#t=0.1', controls: true, preload: 'metadata', playsinline: true, 'aria-label': 'Prévia de Reels com o Granabô animado no Blender, 25 segundos' });
  video.style.setProperty('width', '100%');
  video.style.setProperty('max-width', '320px');
  video.style.setProperty('aspect-ratio', '9 / 16');
  video.style.setProperty('border-radius', 'var(--r-lg)');
  video.style.setProperty('background', 'var(--paper-deep)');
  const movimento = h('div', { class: 'ds-mockups' },
    h('figure', null, video,
      h('figcaption', null, 'Animação feita no Blender (giro, olhos ligando, piscada, flutuação), montada numa prévia de Reels de 25 s. É prévia, sem aceite e sem publicação.',
        h('br'), h('span', { class: 'mono fraco', texto: 'docs/marketing/reels-granabo/granabo-reels-previa.mp4 · docs/mascote/blender/animar.py' }))));
  return secao(h, 'ds-mascote', 'Mascote Granabô', 'O Granabô é o "G." da marca em volume: uma esfera com a carcaça do G oficial, olhos e um sorriso gravado na barra. É um modelo 3D feito por código, então todas as vistas são coerentes entre si. A fonte é a única verdade; as imagens são renders dela.',
    prancha,
    sub(h, 'Versão escolhida pelo autor'),
    h('ul', { class: 'ds-regras' },
      regra(h, 'W3', 'Ponta de cima do G girada 14° para abrir a faixa dos olhos, olhos grandes e ovais, bordas arredondadas, menta leitoso.'),
      regra(h, 'L3', 'Sorriso em arco, pontas arredondadas, gravado na barra do G.'),
      regra(h, 'Cor', 'Menta leitoso sobre o petróleo do app. Segue as cores da marca; não há cor nova fora dos tokens.')),
    sub(h, 'Pode'),
    h('ul', { class: 'ds-regras' },
      regra(h, 'Inteiro', 'Aparecer inteiro, com margem segura, em fundo escuro como o app.'),
      regra(h, 'Referência de desenho', 'Usar as vistas da prancha como referência.'),
      regra(h, 'Novas poses pelo modelo', 'Gerar poses novas por docs/mascote/blender/construir.py e animar.py.')),
    sub(h, 'Não pode'),
    h('ul', { class: 'ds-regras' },
      regra(h, 'IA generativa', 'Ser redesenhado ou regenerado por IA.'),
      regra(h, 'Trocar a carcaça', 'O G vem de logo-g.png; mexer nele muda todas as vistas.'),
      regra(h, 'Substituir o logotipo', 'O logotipo continua sendo o gradiente oficial.'),
      regra(h, 'Cortado', 'Aparecer cortado na borda de peça estática.')),
    h('p', { class: 'ds-nota', texto: 'Limitação conhecida: leve ondulação na parte de baixo da ponta superior do G, na vista frontal. É limite do render. A prancha é referência, e a arte final sai do modelo.' }),
    sub(h, 'Em movimento'),
    movimento,
    h('p', { class: 'ds-nota', texto: 'Fonte: docs/mascote/ (modelo em Python, pranchas e histórico das escolhas) e docs/mascote/blender/. Para gerar a prancha: python docs/mascote/gerar_prancha.py.' }));
}

// ---------------------------------------------------------------------------
// Cores

function secaoCores(h, tokens) {
  const cor = tokens && tokens.cor;
  const origemDe = (codigo) => {
    if (!cor) return null;
    for (const grupo of Object.values(cor)) {
      if (!grupo || typeof grupo !== 'object') continue;
      for (const t of Object.values(grupo)) if (t && t.codigo === `theme.${codigo}`) return t.origem;
    }
    return null;
  };
  const grupos = [
    ['Superfície', ['paper', 'paperRaised', 'paperSelected', 'mockupTela']],
    ['Tinta', ['ink', 'inkSoft', 'inkFaint']],
    ['Traço e véus', ['rule', 'ruleStrong', 'hover', 'superficieInativa']],
    ['Acentos', ['accent', 'accent2', 'accentDeep']],
    ['Dinheiro e estado', ['up', 'down', 'danger', 'entradaBorda', 'saidaBorda']],
  ];
  const porNome = Object.fromEntries(APP.cores.map((c) => [c[0], c]));
  const blocos = grupos.map(([titulo, nomes]) => [sub(h, titulo),
    h('div', { class: 'ds-cores' }, nomes.map((n) => { const c = porNome[n]; return amostraCor(h, `theme.${c[0]}`, c[1], c[2], origemDe(c[0]) || 'extraido'); }))]);

  const categorias = cor && cor.categoria
    ? h('div', { class: 'ds-cores' }, Object.entries(cor.categoria).filter(([k]) => !k.startsWith('$')).map(([nome, t]) => amostraCor(h, nome, t.valor, null, t.origem)))
    : null;
  const paleta = cor && cor.paletaCategoriaExpandida
    ? h('div', { class: 'ds-paleta', role: 'img', 'aria-label': 'Paleta de 30 cores para categorias' },
      cor.paletaCategoriaExpandida.valores.map((v) => { const s = h('span', { title: v }); s.style.setProperty('background', v); return s; }))
    : null;

  const contraste = h('div', { class: 'ds-contraste' },
    parContraste(h, '#effffa', '#052229', 'ink sobre paper'),
    parContraste(h, '#a6d9ce', '#052229', 'inkSoft sobre paper'),
    parContraste(h, '#7fa9a0', '#0b2d35', 'inkFaint sobre paperRaised'),
    parContraste(h, '#e08a7d', '#052229', 'danger sobre paper'),
    parContraste(h, '#00a6ca', '#052229', 'down sobre paper'),
    parContraste(h, '#052229', '#effffa', 'paper sobre ink (invertido)'));

  return secao(h, 'ds-cores', 'Cores', 'Duas famílias: água escura para a superfície, menta e ciano para o que pede atenção. Sem cinza neutro e sem vermelho em dado financeiro.',
    blocos,
    sub(h, 'Contraste medido'), contraste,
    categorias ? sub(h, 'Categorias (lib/types.ts)') : null, categorias,
    paleta ? sub(h, 'Paleta de 30 para categorias criadas pela pessoa') : null, paleta,
    h('ul', { class: 'ds-regras' },
      regra(h, 'Sem vermelho para gasto', 'Saída de dinheiro é ciano. O app nunca trata "você gastou" como alarme.'),
      regra(h, 'Menta é rara', 'Aparece na marca, no foco e no valor em destaque. Em mais de dois lugares na mesma tela, algo silencioso está gritando.'),
      regra(h, 'Danger tem fronteira', 'Salmão dessaturado só para destruir algo ou para o que já venceu. Nunca em valor de gasto.')));
}

function luminancia(hex) {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function razao(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function parContraste(h, frente, fundo, rotulo) {
  const r = razao(frente, fundo);
  const el = h('div', null, h('span', { texto: rotulo }),
    h('span', { class: `selo ${r >= 4.5 ? 'selo-ok' : 'selo-alerta'} num`, texto: `${r.toFixed(1).replace('.', ',')}:1 ${r >= 4.5 ? 'AA' : 'abaixo de AA'}` }));
  el.style.setProperty('background', fundo);
  el.style.setProperty('color', frente);
  return el;
}

// ---------------------------------------------------------------------------
// Tipografia

function secaoTipografia(h, tokens) {
  const pesos = h('div', { class: 'ds-pesos' },
    [['Light', 300, 'NeueMachina-Light.otf'], ['Regular', 400, 'NeueMachina-Regular.otf']].map(([nome, peso, arq]) => {
      const letra = h('p', { class: 'ds-peso-letra', texto: 'Aa' });
      const alfa = h('p', { class: 'ds-peso-alfabeto', texto: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 R$ 1.234,56' });
      letra.style.setProperty('font-weight', String(peso));
      alfa.style.setProperty('font-weight', String(peso));
      return h('div', { class: 'ds-peso' }, letra, alfa,
        h('p', { class: 'fraco', texto: `Neue Machina ${nome} · peso ${peso} · ${arq}` }));
    }));

  const amostras = {
    micro: 'SELO · 12 DIAS', legenda: 'Gastos por categoria', nota: 'Mercado · Débito', apoio: 'Nenhum lançamento hoje ainda.',
    corpo: 'Falei "gastei 32 no almoço" e já está lançado.', titulo: 'Novo lançamento', destaque: 'R$', cabecalho: 'Lançamentos',
    marca: 'Grana.', valor: 'R$ 1.284,90',
  };
  const escala = h('div', { class: 'ds-tipos' }, Object.entries(APP.tipo).map(([papel, [ios, android, web]]) => {
    const amostra = h('p', { class: `ds-tipo-amostra${papel === 'valor' ? ' num' : ''}`, texto: amostras[papel] });
    amostra.style.setProperty('font-size', `${web}px`);
    amostra.style.setProperty('line-height', papel === 'valor' ? '1.15' : '1.3');
    if (papel === 'marca' || papel === 'micro') amostra.style.setProperty('font-weight', '300');
    if (papel === 'micro') amostra.style.setProperty('letter-spacing', '0.06em');
    return h('div', { class: 'ds-tipo' },
      h('div', { class: 'ds-tipo-meta' }, h('b', { texto: `type.${papel}` }), h('span', { class: 'num', texto: `web ${web} · iOS ${ios} · Android ${android}` })),
      amostra);
  }));

  const papeis = ctxTabela(h, ['Papel', 'Peso', 'Tamanho', 'Entrelinha', 'Uso'],
    APP.papeis.map(([n, peso, t, lh, uso]) => [`textStyles.${n}`, peso, `type.${t}`, String(lh).replace('.', ','), uso]));

  const trat = tokens && tokens.tipografia && tokens.tipografia.tratamento;
  return secao(h, 'ds-tipografia', 'Tipografia', 'Neue Machina é a única fonte do produto, em todo papel e em toda plataforma. Existem só dois pesos, Light e Regular.',
    pesos,
    sub(h, 'Escala (lib/theme.ts → type)'), escala,
    sub(h, 'Papéis completos'), papeis,
    h('ul', { class: 'ds-regras' },
      regra(h, 'Nunca fontWeight', 'Não há arquivo bold. O nativo ignora e a web sintetiza um negrito falso. Ênfase sai de tamanho, cor e espaço.'),
      regra(h, 'Números tabulares', 'Todo valor monetário usa tabular-nums. Sem isso os dígitos dançam a cada atualização.'),
      regra(h, 'Piso de leitura', 'Metadado em Light não desce de 11pt no iOS e 12sp no Android. Nada interativo abaixo desse piso.'),
      trat ? regra(h, 'Rótulo de seção', `Caixa alta, ${trat.rotuloSecao.tamanho}px, entreletras ${trat.rotuloSecao.entreletras}, cor inkFaint. Só em rótulo curto.`) : null));
}

function ctxTabela(h, cabecas, linhas) {
  return h('div', { class: 'tabela-rolagem', tabindex: '0', role: 'region', 'aria-label': cabecas.join(', ') },
    h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, cabecas.map((c) => h('th', { scope: 'col', texto: c })))),
      h('tbody', null, linhas.map((l) => h('tr', null, l.map((c, i) => h('td', { class: i === 0 ? 'mono' : undefined, texto: c })))))));
}

// ---------------------------------------------------------------------------
// Espaço e forma

function secaoEspaco(h) {
  const espaco = h('div', { class: 'ds-escala' }, APP.espaco.map(([n, v, uso]) => {
    const barra = h('div', { class: 'ds-escala-barra' });
    barra.style.setProperty('width', `${v * 4}px`);
    return h('div', { class: 'ds-escala-linha' },
      h('span', { class: 'mono', texto: `spacing.${n}` }), h('span', { class: 'num', texto: `${v}px` }),
      h('div', { class: 'fileira' }, barra, uso ? h('span', { class: 'fraco', texto: uso }) : null));
  }));
  const raios = h('div', { class: 'ds-raios' }, APP.raio.map(([n, v]) => {
    const forma = h('div');
    forma.style.setProperty('border-radius', `${Math.min(v, 48)}px`);
    return h('div', { class: 'ds-raio' }, forma, h('span', { class: 'mono', texto: `radius.${n} · ${v}px` }));
  }));
  return secao(h, 'ds-espaco', 'Espaço e forma', 'Escala de espaço em degraus de 4, mais dois papéis nomeados (fio e ícone). Cinco raios; o aninhado desconta 2px do raio do pai.',
    sub(h, 'Espaçamento'), espaco,
    sub(h, 'Raio'), raios,
    h('ul', { class: 'ds-regras' },
      regra(h, 'Ritmo de tela', 'screenRhythm: padding 16px do corpo e 12px entre cartões, igual em toda aba.'),
      regra(h, 'Cartão de destaque', 'Raio 16, padding 16, borda 1px em rule. Destaque maior (Livre para gastar) usa raio 22 e padding 20.'),
      regra(h, 'Botão por modo', 'No app, raio 12 (md). Na landing, o CTA é pílula. Modos diferentes, forma diferente.'),
      regra(h, 'Alvo de toque', '44pt no iOS e 48dp no Android. Desenho menor completa a área com hitSlop.')));
}

// ---------------------------------------------------------------------------
// Elevação

function secaoElevacao(h) {
  const grade = h('div', { class: 'ds-sombras' }, APP.sombras.map(([n, v, modo, uso]) => {
    const caixa = h('div');
    caixa.style.setProperty('box-shadow', v);
    return h('div', { class: 'ds-sombra' }, caixa,
      h('span', { texto: `sombras.${n}` }), h('span', { class: 'ds-modo', texto: `${modo} · ${uso}` }), h('span', { class: 'mono', texto: v }));
  }));
  return secao(h, 'ds-elevacao', 'Elevação', 'No app (Operar) a superfície é chapada e a sombra só existe no que flutua sobre o conteúdo. Na landing (Persuadir) ela pode pesar e ter cor.',
    grade,
    h('p', { class: 'ds-nota', texto: 'As receitas moram em lib/theme.ts (sombras) e __tests__/corpus-design-system.ts recusa boxShadow escrito à mão fora de lá. Receita nova pede uma linha no tema, não um valor solto na tela.' }));
}

// ---------------------------------------------------------------------------
// Movimento

function secaoMovimento(h, tokens, limpezas) {
  const mov = tokens && tokens.movimento;
  const springs = mov ? Object.entries(mov.spring).filter(([k]) => !k.startsWith('$')) : [];
  const duracoes = mov ? Object.entries(mov.duracao).filter(([k]) => !k.startsWith('$')) : [];

  // aproximação CSS de spring: bounciness alto vira um overshoot discreto
  const curvaSpring = (b) => `cubic-bezier(0.34, ${(1 + b / 40).toFixed(2)}, 0.64, 1)`;
  const durSpring = (speed) => Math.round(Math.max(180, Math.min(600, 5200 / speed)));

  const cartoes = [
    ...springs.map(([n, t]) => ({ nome: `spring.${n}`, detalhe: `speed ${t.speed} · bounciness ${t.bounciness}`, uso: t.uso, dur: durSpring(t.speed), curva: curvaSpring(t.bounciness) })),
    ...duracoes.map(([n, t]) => ({ nome: `duracao.${n}`, detalhe: `${t.valor} ms${t.curva ? ` · ${t.curva}` : ''}`, uso: t.uso, dur: n === 'permanenciaToast' ? 300 : t.valor, curva: 'cubic-bezier(0.22, 1, 0.36, 1)' })),
  ];

  const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)');
  const aviso = h('p', { class: 'ds-nota' });
  const atualizarAviso = () => {
    aviso.textContent = reduzido.matches
      ? 'Movimento reduzido está ligado neste computador, então as demonstrações pulam direto para o fim, como o app faz. Sessão de acesso remoto do Windows liga essa preferência sozinha.'
      : 'Clique numa demonstração para ver a curva. Com movimento reduzido ligado no sistema, elas pulam direto para o fim, como no app.';
  };
  atualizarAviso();
  reduzido.addEventListener('change', atualizarAviso);
  limpezas.push(() => reduzido.removeEventListener('change', atualizarAviso));

  const grade = h('div', { class: 'ds-movs' }, cartoes.map((c) => {
    const pista = h('span', { class: 'ds-mov-pista' }, h('span', { class: 'ds-mov-bola' }));
    const el = h('button', { class: 'ds-mov', type: 'button', 'aria-pressed': 'false', 'aria-label': `Demonstrar ${c.nome}` },
      h('b', { texto: c.nome }), h('span', { class: 'num', texto: c.detalhe }), pista, c.uso ? h('span', { class: 'fraco', texto: c.uso }) : null);
    el.style.setProperty('--ds-dur', `${c.dur}ms`);
    el.style.setProperty('--ds-curva', c.curva);
    el.addEventListener('click', () => {
      el.style.setProperty('--ds-pista', `${pista.clientWidth}px`);
      const ativo = !el.classList.contains('ativo');
      el.classList.toggle('ativo', ativo);
      el.setAttribute('aria-pressed', String(ativo));
    });
    return el;
  }));

  return secao(h, 'ds-movimento', 'Movimento', 'Springs do Animated (speed e bounciness) e durações curtas. Sair é mais rápido que entrar. No painel, as curvas são aproximações em CSS.',
    mov ? grade : h('p', { class: 'ds-nota', texto: 'Sem tokens.json, os valores de movimento não puderam ser lidos.' }),
    aviso,
    h('ul', { class: 'ds-regras' },
      regra(h, 'Toque', 'Press-in encolhe para 0,96 rápido (speed 40). Press-out volta mais devagar (speed 20).'),
      regra(h, 'Movimento reduzido', 'prefers-reduced-motion desliga quase todo o motion do Grana.: conteúdo nasce visível, sem trajeto.'),
      regra(h, 'Confira o valor mudando', 'Animação se valida vendo a propriedade mudar quadro a quadro, não só o estado final.')));
}

// ---------------------------------------------------------------------------
// Componentes

function secaoComponentes(h, ctx) {
  const vitrine = (legenda, ...filhos) => [h('div', { class: 'ds-vitrine' }, filhos), h('p', { class: 'ds-legenda', texto: legenda })];

  const segmento = h('div', { class: 'ds-segmento', role: 'group', 'aria-label': 'Período' },
    ['Semana', 'Mês', 'Ano'].map((t, i) => h('button', { type: 'button', 'aria-pressed': String(i === 1), texto: t })));
  segmento.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of segmento.children) x.setAttribute('aria-pressed', String(x === b));
  });

  const sw = h('button', { class: 'ds-switch', type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': 'Lembrete diário' });
  sw.addEventListener('click', () => sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true')));

  const par = h('div', { class: 'ds-tipo-par', role: 'group', 'aria-label': 'Tipo de lançamento' },
    h('button', { type: 'button', dados: { tipo: 'entrada' }, 'aria-pressed': 'false', texto: 'Entrada' }),
    h('button', { type: 'button', dados: { tipo: 'saida' }, 'aria-pressed': 'true', texto: 'Saída' }));
  par.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of par.children) x.setAttribute('aria-pressed', String(x === b));
  });

  const linhas = h('div', null,
    linhaLanc(h, 'Mercado', 'Alimentação · Débito', '− R$ 86,40', 'down'),
    linhaLanc(h, 'Salário', 'Salário · Conta principal', '+ R$ 4.200,00', 'up'),
    linhaLanc(h, 'Streaming', 'Assinaturas · Crédito', '− R$ 39,90', 'down'));

  const livre = h('div', { class: 'ds-cartao-livre' },
    h('span', { class: 'cartao-titulo', texto: 'Livre para gastar hoje' }),
    h('span', { class: 'cartao-valor', texto: 'R$ 74,20' }),
    h('span', { class: 'cartao-detalhe', texto: 'Saldo do mês menos cofrinhos, dividido por 18 dias' }),
    h('div', { class: 'ds-barra', 'aria-hidden': 'true' }, h('span')));

  const fab = h('button', { class: 'ds-fab', type: 'button', 'aria-label': 'Novo lançamento' }, icone('mais'));
  const toast = h('div', { class: 'ds-toast' }, h('span', { texto: 'Lançamento salvo' }));

  return secao(h, 'ds-componentes', 'Componentes', 'Reconstruções em HTML dos componentes do app, com os mesmos tokens. A fonte de verdade continua sendo o código em components/.',
    sub(h, 'Ações'),
    vitrine('Primário invertido (salvar), secundário com contorno, perigo só para destruir, fantasma para ação textual. Altura mínima de 44px.',
      h('button', { class: 'botao botao-primario', type: 'button', texto: 'Salvar lançamento' }),
      h('button', { class: 'botao', type: 'button', texto: 'Escanear nota' }),
      h('button', { class: 'botao botao-perigo', type: 'button', texto: 'Excluir cartão' }),
      h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Ver todos' }),
      h('button', { class: 'botao', type: 'button', disabled: true, texto: 'Indisponível' })),
    vitrine('FAB (sombra flutuante), CTA da landing em pílula com glow verde, o único botão com sombra de cor.',
      fab, h('button', { class: 'ds-cta', type: 'button', texto: 'Assinar por R$ 9,90/mês' })),
    sub(h, 'Formulário'),
    vitrine('Par Entrada/Saída com tons próprios de botão (iguais em luminosidade), campo de valor com R$ separado, segmentado e switch.',
      par,
      h('div', { class: 'ds-valor-campo' }, h('span', { texto: 'R$' }), h('b', { texto: '32,00' })),
      segmento, sw),
    vitrine('Campo com linha inferior e foco menta. A caixa completa fica só para texto livre.',
      h('div', { class: 'campo' }, h('label', { for: 'ds-campo-desc', texto: 'Descrição' }), h('input', { id: 'ds-campo-desc', type: 'text', placeholder: 'Ex.: almoço com a equipe' }))),
    sub(h, 'Conteúdo'),
    vitrine('Linha de lançamento: selo de ícone em accentDeep, valor tabular em verde (entrada) ou ciano (saída).', linhas),
    vitrine('Cartão de destaque (raio 22, padding 20) com o valor em menta, o lugar onde a menta faz sentido.', livre),
    vitrine('Selos de status, chips de filtro e toast em superfície invertida.',
      ctx.selo('ok', 'Pago'), ctx.selo('alerta', 'Vence amanhã'), ctx.selo('erro', 'Atrasada'), ctx.selo('ausente', 'Sem data'),
      h('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', texto: 'Este mês' }),
      h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', texto: 'Crédito' }),
      toast),
    vitrine('Estados com texto, sempre: vazio, carregando, erro.',
      h('div', { class: 'estado estado-vazio' }, h('p', { class: 'estado-texto', texto: 'Nenhum lançamento hoje. Fale "gastei 20 no café" e ele aparece aqui.' }))));
}

function linhaLanc(h, titulo, meta, valor, tom) {
  const v = h('span', { class: 'num', texto: valor });
  v.style.setProperty('color', tom === 'up' ? '#74e291' : '#00a6ca');
  return h('div', { class: 'ds-linha-lanc' },
    h('span', { class: 'ds-linha-icone', 'aria-hidden': 'true' }, icone(tom === 'up' ? 'entrada' : 'saida')),
    h('span', null, titulo, h('small', { texto: meta })),
    v);
}

// Ícones desenhados (traço 1,75, mesma família visual dos Ionicons outline do app)
function icone(nome) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const caminhos = {
    mais: ['M12 5v14', 'M5 12h14'],
    entrada: ['M12 19V5', 'M6 11l6-6 6 6'],
    saida: ['M12 5v14', 'M6 13l6 6 6-6'],
  }[nome] || [];
  for (const d of caminhos) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

// ---------------------------------------------------------------------------
// Tom de voz

async function secaoVoz(h, ctx) {
  const pares = [
    ['Parceiro e cúmplice', 'Fiscal de gastos'], ['Simples e transparente', 'Formal e burocrático'],
    ['Espirituoso e acolhedor', 'Infantilizado'], ['Encorajador', 'Punitivo ou alarmista'],
  ];
  const notifs = [
    ['Psst... tudo bem por aí?', 'Aquele Pix de R$ 3 da água no sinal também conta, viu? Bora registrar antes de esquecer! 👀'],
    ['Não deixa o fogo apagar! 🔥', 'Você já está com 12 dias seguidos de controle. Registre 1 gasto pra manter a chama viva!'],
    ['Sabia que dá pra lançar por voz? 🎙️', 'Tá na correria? Toque no microfone no app e fale "Gastei 30 no mercado" que a mágica acontece!'],
    ['Não precisa ser perfeito, só consistente 🌱', 'Esqueceu de anotar ontem? Não tem problema, o importante é retomar hoje.'],
  ];

  const bloco = [
    h('ul', { class: 'ds-regras' },
      regra(h, 'Humana e conversacional', 'Frases curtas, como gente fala. Emoji com propósito.'),
      regra(h, 'Empática e sem culpa', 'Nunca repreende por gastar. Ajuda a registrar com clareza.'),
      regra(h, 'Leve e bem-humorada', 'Humor e cumplicidade para quebrar a preguiça de mexer com dinheiro.'),
      regra(h, 'Direta e eficiente', 'Texto de interface se entende em menos de 5 segundos.')),
    sub(h, 'O Grana. é · nunca é'),
    h('div', { class: 'ds-voz' }, pares.map(([sim, nao]) => h('div', { class: 'ds-voz-par' }, h('div', { texto: sim }), h('div', { texto: nao })))),
    sub(h, 'Microcopy'),
    ctxTabela(h, ['Situação', 'Como escrever', 'Exemplo'], [
      ['Botão', 'Verbo no infinitivo', 'Salvar cartão · Lançar no crédito · Pagar fatura'],
      ['Sucesso', 'Rápido e afirmativo', 'Lançamento salvo · Fatura marcada como paga ✓'],
      ['Erro', 'O que houve e como resolver, sem culpa', 'Informe o valor da compra'],
    ]),
    h('ul', { class: 'ds-regras' },
      regra(h, 'Sem travessão', 'Vale para todo texto do Grana.: app, landing, legenda e anúncio. Vírgula, ponto ou dois-pontos fazem o trabalho.'),
      regra(h, 'Sem a fórmula de contraste', 'Nada de "não é X, é Y". Diga o que o Grana. faz, direto.'),
      regra(h, 'Sem prometer o que não está no ar', 'Função só entra em peça depois de build pública e QA.')),
    sub(h, 'Notificações (amostra do catálogo de 40)'),
    h('div', { class: 'ds-voz' }, notifs.map(([t, c]) => h('div', { class: 'ds-notif' },
      h('div', { class: 'ds-notif-topo' }, h('img', { src: `${MARCA}icone-circular.svg`, alt: '' }), h('span', { texto: 'Grana. · agora' })),
      h('b', { texto: t }), h('p', { texto: c })))),
  ];

  // o documento inteiro, se o servidor entregar o arquivo
  const texto = await lerTexto('/design-system/TOM_DE_VOZ.md');
  if (texto && ctx.markdown) {
    const det = h('details', { class: 'cartao' },
      h('summary', { class: 'cartao-titulo', texto: 'Ler o TOM_DE_VOZ.md inteiro (catálogo completo e regra de rotação)' }));
    det.appendChild(ctx.markdown(texto));
    bloco.push(det);
  } else {
    bloco.push(h('p', { class: 'ds-nota fraco', texto: 'O documento completo está em design-system/TOM_DE_VOZ.md. O servidor local não liberou esse arquivo para leitura aqui.' }));
  }
  return secao(h, 'ds-voz', 'Tom de voz', 'Dinheiro como parte natural da vida: sem tabu, sem jargão de banco e sem terrorismo financeiro.', bloco);
}

// ---------------------------------------------------------------------------
// Criativo

function secaoCriativo(h) {
  const mockups = h('div', { class: 'ds-mockups' },
    [['celular-vazio.png', 'Celular vazio, frontal. Em uso na landing desde 17/09/2026.'], ['notebook-vazio.png', 'Notebook vazio, tela virada para a esquerda.']]
      .map(([arq, leg]) => h('figure', null,
        h('img', { src: `/design-system/marketing-mockups/${arq}`, alt: leg, loading: 'lazy' }),
        h('figcaption', null, leg, h('br'), h('span', { class: 'mono fraco', texto: `design-system/marketing-mockups/${arq}` })))));
  return secao(h, 'ds-criativo', 'Criativo e mockups', 'Regras permanentes das peças de campanha (regras 23 e 24 do AGENTS.md).',
    h('ul', { class: 'ds-regras' },
      regra(h, 'Aparelho inteiro', 'Celular e notebook nunca cortados na borda. Sempre com margem segura.'),
      regra(h, 'Mockup por foto', 'Foto de aparelho vazio com o print real colado por homografia, respeitando os cantos arredondados. CSS 3D foi reprovado. Tela do app nunca é gerada por IA.'),
      regra(h, 'Arte limpa', 'Sem contador de página e sem aviso de exemplo dentro da arte. O aviso de dado fictício vai na legenda.'),
      regra(h, 'Vídeo de referência', 'grana-motion-desistiu-foto-da-nota.mp4, na raiz de Gabriel/Grana do vault, é o estilo de edição e motion de todo vídeo novo.'),
      regra(h, 'Dado inventado', 'Print de marketing nunca sai de conta real, nem em modo demo.'),
      regra(h, 'Custo com aval', 'Nenhuma geração na ElevenLabs sem o "sim" do autor antes, com o custo estimado em reais.')),
    sub(h, 'Aparelhos vazios aprovados'), mockups);
}

// ---------------------------------------------------------------------------
// Referências

function secaoReferencias(h, tokens) {
  const versao = tokens && tokens.$meta ? `Versão ${tokens.$meta.versao} dos tokens.` : '';
  return secao(h, 'ds-referencias', 'Referências e auditoria', `${versao} As páginas abaixo abrem em outra aba. Elas são as fontes HTML do design system; sem o build, aparecem com a fonte de fallback.`.trim(),
    h('div', { class: 'ds-arquivos' },
      h('a', { class: 'botao botao-primario', href: '/design-system/pagina/design-system.src.html', target: '_blank', rel: 'noopener', texto: 'Abrir a página do design system' }),
      PREVIEWS.map(([arq, nome]) => h('a', { class: 'botao', href: `/design-system/previews/${arq}`, target: '_blank', rel: 'noopener', texto: nome })),
      h('a', { class: 'botao botao-fantasma', href: '/design-system/tokens/tokens.json', target: '_blank', rel: 'noopener', texto: 'tokens.json' }),
      h('a', { class: 'botao botao-fantasma', href: '/design-system/tokens/tokens.css', target: '_blank', rel: 'noopener', texto: 'tokens.css' })),
    h('div', { class: 'alerta alerta-info', role: 'note' },
      h('p', { texto: 'O que o app já tem e a documentação ainda não registra: AlertaHost, JanelaFlutuante, faixa-topo e os componentes novos de 02/10. A auditoria do design system lista 11 inconsistências; 10 seguem abertas. Esta tela mostra a defasagem e não a resolve.' })));
}
