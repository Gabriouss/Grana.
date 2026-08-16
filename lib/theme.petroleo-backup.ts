/* Backup da paleta petróleo/ciano/verde-menta como estava ANTES da
   sincronização com o design system (16/08/2026).

   O que mudou depois deste ponto:
     - `paperRaised` passou de #0c333c para #0b2d35 (o "Surface Card" da
       especificação). Contraste de `inkFaint` sobre ele subiu de 5.20:1
       para 5.61:1, então a nota de acessibilidade continua válida.
     - Entraram os tokens de marca (`brand`): o gradiente oficial e o menta
       do ponto, que antes não existiam em código.

   Este arquivo não é importado por nenhuma tela — existe só como ponto de
   retorno. Para reverter: copie o objeto `theme` abaixo de volta para
   lib/theme.ts. O tema escuro grayscale, anterior a toda a paleta petróleo,
   continua em lib/theme.classic-dark-backup.ts. */
export const theme = {
  paper: '#052229',
  paperRaised: '#0c333c',
  ink: '#effffa',
  inkSoft: '#a6d9ce',
  // ~5.2:1 contra paperRaised e ~6.6:1 contra paper — dentro do AA (4.5:1).
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

export const fonts = {
  regular: 'NeueMachina-Regular',
  light: 'NeueMachina-Light',
};
