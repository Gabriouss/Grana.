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
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/* Neue Machina (extraída de grana-prototype.html, que já trazia a fonte
   embutida em base64) carregada via expo-font em app/_layout.tsx. Regular
   é o padrão global de todo <Text>; Light fica pra uso pontual em texto
   grande/de marca, como o "Grana." dos cabeçalhos. */
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
