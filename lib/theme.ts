import { Platform } from 'react-native';
/* Paleta petróleo → ciano → verde-menta. Dois pontos de retorno existem:
   lib/theme.petroleo-backup.ts guarda esta mesma paleta antes da
   sincronização com o design system, e lib/theme.classic-dark-backup.ts
   guarda o tema escuro grayscale anterior a ela. Para reverter, copie o
   objeto `theme` do arquivo desejado pra cá. */
export const theme = {
  paper: '#052229',
  paperRaised: '#0b2d35',
  ink: '#effffa',
  inkSoft: '#a6d9ce',
  // ~5.6:1 contra paperRaised e ~6.4:1 contra paper — dentro do AA (4.5:1).
  inkFaint: '#7fa9a0',
  rule: 'rgba(175,255,227,0.14)',
  ruleStrong: 'rgba(175,255,227,0.26)',
  up: '#74e291',
  down: '#00a6ca',
  accent: '#1fa98d',
  accent2: '#aeffe3',
  accentDeep: '#04475c',
  /* Realce de hover, para superfícies. Um véu de menta a 7% funciona sobre
     `paper` E sobre `paperRaised`, o que uma cor sólida não faz: o
     `backgroundColor: paperRaised` que algumas linhas usavam era invisível
     quando a própria seção já era paperRaised, e pesado demais quando não
     era. Para botões, o padrão continua sendo `ruleStrong` na borda ou
     opacidade — hover não precisa ser fundo em tudo. */
  hover: 'rgba(174,255,227,0.07)',
  /* Cor de perigo/atenção — excluir conta, fatura atrasada, erro de
     reautenticação. Já era usada assim em `app/(app)/perfil.tsx` e
     `app/(app)/credito.tsx`, só nunca tinha virado token: cada tela
     escrevia o hex cru, e uma delas (o botão "Excluir conta") chegou a
     reaproveitar por engano a cor da categoria "Alimentação" pro mesmo
     papel. Valor já catalogado como "proposto" em
     design-system/tokens/tokens.json antes deste token existir de verdade. */
  danger: '#e08a7d',
  /* Tom do cartão de crédito selecionado em app/(app)/credito.tsx — mais
     claro que `paperRaised` de propósito, pra distinguir visualmente do
     estado não selecionado. Só usado ali; nomeado aqui pra não ficar como
     hex solto competindo com o resto da paleta de superfície. */
  paperSelected: '#0c353e',
};

/* Recorte de 30 cores da paleta "Refreshing Aqua Tones" (lib/demo-data.ts),
   escolhidas para variar de matiz numa progressão só — teal/azul, verde,
   dourado/terracota, vermelho, rosa, roxo — e caber numa grade fixa de 5
   colunas por 6 linhas no seletor de cor de categorias. */
export const PALETTE_30 = [
  '#0b4f6c', '#12a8de', '#4f9bab', '#4f8f8f', '#6f9a97',
  '#6ba398', '#5aa79b', '#339989', '#4f9483', '#5f9468',
  '#74a17c', '#93aa7e', '#7fdc8a', '#b0f7d4', '#d8c384',
  '#d3b869', '#c1a24c', '#d19a72', '#c1804e', '#c98a5e',
  '#a8534c', '#bb6b60', '#b3564f', '#cf7d8f', '#c66f8e',
  '#d087a0', '#a3566a', '#ab8bc2', '#8f6bb0', '#93739e',
];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/* Rítmica do corpo das telas principais (abaixo do ScreenHeader). Cada tela
   tinha escolhido seu próprio padding/gap numa sessão diferente — Início
   20/16, Lançamentos e Contas 12/8, Crédito e Desafios 16/12, Gráficos
   12/12 — e o resultado era visível: o mesmo seletor de mês pousava a
   distâncias diferentes do cabeçalho dependendo da aba. Crédito (16/12) foi
   escolhida como referência por já ser o padrão adotado pro próprio
   `ScreenHeader`. Import isto em vez de repetir os números. */
export const screenRhythm = {
  /** Distância da borda do cabeçalho até o primeiro card, e margem lateral do corpo. */
  padding: spacing.lg,
  /** Espaço entre um card/seção e o próximo. */
  gap: spacing.md,
};

/* Card de destaque em largura cheia (um por seção da tela — "Fluxo
   financeiro", "Gastos por categoria", "Level Up Infinito" etc.). Achei o
   mesmo desenho reimplementado com dois paddings diferentes (16 em algumas
   telas, 12 em outras) — o resultado é visível: o card de Crédito ficava
   "mais apertado" que o de mesmo tipo na Início. Não cobre cards menores de
   item de lista (uma conta, um lançamento) nem cards de carrossel horizontal
   (uma meta, um cartão) — esses têm densidade própria de propósito. */
export const card = {
  radius: radius.lg,
  padding: spacing.lg,
  borderWidth: 1,
};

/* Escala tipográfica, extraída de design-system/tokens/tokens.json
   (tipografia.escala). Consolida os 12 tamanhos decididos caso a caso que o
   app usava (9; 10,5; 11; 11,5; 12; 12,5; 13; 14; 17; 20; 26; 30) em 9
   degraus nomeados, cada um o inteiro mais próximo do que já se usava — a
   mudança visual é mínima, o vocabulário passa a existir. `cabecalho` (22) é
   o degrau que faltava no token original: os cabeçalhos das telas
   convergiram nele de forma independente antes de qualquer padronização. */
/**
 * A escala inteira sobe 2pt na web.
 *
 * Os tamanhos foram calibrados para um celular, onde a tela fica a uns 30cm
 * dos olhos. Um monitor fica a 60–70cm, e o mesmo corpo de 11pt que é
 * confortável na mão vira letra miúda a essa distância — foi o que o autor
 * relatou ao ler a tela de Desafios no desktop.
 *
 * Subir na escala, e não em cada estilo, mantém as proporções entre os
 * degraus intactas: o que era hierarquia continua sendo hierarquia, só que
 * legível de longe. E o app nativo não muda, porque o acréscimo é zero fora
 * da web.
 */
const ACRESCIMO_WEB = Platform.OS === 'web' ? 2 : 0;

export const type = {
  micro: 9 + ACRESCIMO_WEB,
  legenda: 11 + ACRESCIMO_WEB,
  nota: 12 + ACRESCIMO_WEB,
  apoio: 13 + ACRESCIMO_WEB,
  corpo: 14 + ACRESCIMO_WEB,
  titulo: 17 + ACRESCIMO_WEB,
  destaque: 20 + ACRESCIMO_WEB,
  cabecalho: 22 + ACRESCIMO_WEB,
  marca: 26 + ACRESCIMO_WEB,
  valor: 30 + ACRESCIMO_WEB,
};

/* Neue Machina, carregada via expo-font em app/_layout.tsx.
   São os DOIS únicos pesos do app — não existe arquivo bold, e `fontWeight`
   não deve ser usado em lugar nenhum: o React Native o ignora para família
   customizada sem o arquivo correspondente, enquanto o navegador sintetiza um
   falso negrito, e o mesmo texto saía diferente em cada plataforma.
   A hierarquia é: Regular para o que tem peso, Light para texto secundário. */
export const fonts = {
  regular: 'NeueMachina-Regular',
  light: 'NeueMachina-Light',
};

/* Tokens da marca, extraídos dos vetores de design-system/marca/.
   Valem para peças de marca — ícone, splash, logotipo — e não para a
   interface: a UI é inteiramente de cores chapadas, e o gradiente ser
   exclusivo da marca é o que o mantém como assinatura.

   O gradiente atravessa a peça inteira como um objeto único, a 45°
   descendente. Em SVG isso significa `gradientUnits="userSpaceOnUse"` com as
   coordenadas do vetor original — nunca `objectBoundingBox`, que reinicia a
   rampa no bounding box de cada elemento e quebra a continuidade. */
export const brand = {
  gradient: { from: '#b0f7c9', to: '#22a1c1', angle: 45 },
  /* O ponto do "Grana." — sólido, nunca dentro da rampa quando o texto é
     chapado. Contra `ink` (off-white) o ponto é menta; a regra geral é que
     ele seja sempre o contraste do texto. */
  dot: '#a9f8c8',
  dark: '#052229',
};
