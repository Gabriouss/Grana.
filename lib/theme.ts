import { Platform, type TextStyle } from 'react-native';
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

/* Papéis tipográficos semânticos calibrados por plataforma. iOS parte do
   corpo de 17pt e piso de 11pt; Android usa os equivalentes em sp; web sobe
   a densidade de leitura para a distância de monitor. Text continua com
   font scaling habilitado, portanto estes valores são base, não teto. */
export const type = Platform.select({
  ios: {
    micro: 11, legenda: 12, nota: 13, apoio: 15, corpo: 17,
    titulo: 20, destaque: 22, cabecalho: 24, marca: 28, valor: 32,
  },
  android: {
    micro: 12, legenda: 12, nota: 14, apoio: 14, corpo: 16,
    titulo: 20, destaque: 22, cabecalho: 24, marca: 28, valor: 32,
  },
  default: {
    micro: 12, legenda: 14, nota: 15, apoio: 16, corpo: 18,
    titulo: 20, destaque: 22, cabecalho: 24, marca: 28, valor: 32,
  },
})!;

/* A interface operacional usa a família do sistema: ela preserva Dynamic
   Type no iOS, os papéis Roboto/sp no Android e as métricas familiares do
   desktop. Neue Machina fica reservada para assinatura e títulos de marca. */
export const fonts = {
  regular: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' })!,
  light: Platform.select({ ios: 'System', android: 'sans-serif-light', default: 'system-ui' })!,
  medium: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'system-ui' })!,
  brandRegular: 'NeueMachina-Regular',
  brandLight: 'NeueMachina-Light',
};

/** Papéis completos para componentes-base; nomes descrevem função, não valor. */
export const textStyles = {
  metadata: { fontFamily: fonts.light, fontSize: type.nota, lineHeight: Math.round(type.nota * 1.4) },
  label: { fontFamily: fonts.medium, fontSize: type.apoio, lineHeight: Math.round(type.apoio * 1.35) },
  body: { fontFamily: fonts.regular, fontSize: type.corpo, lineHeight: Math.round(type.corpo * 1.45) },
  title: { fontFamily: fonts.brandRegular, fontSize: type.titulo, lineHeight: Math.round(type.titulo * 1.25) },
  headline: { fontFamily: fonts.brandRegular, fontSize: type.cabecalho, lineHeight: Math.round(type.cabecalho * 1.2) },
  amount: { fontFamily: fonts.medium, fontSize: type.valor, lineHeight: Math.round(type.valor * 1.15), fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/** Área física mínima dos controles, preservando a métrica de cada sistema. */
export const touchTarget = Platform.OS === 'android' ? 48 : 44;

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
