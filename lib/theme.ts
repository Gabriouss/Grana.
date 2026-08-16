/* Paleta petróleo → ciano → verde-menta. O tema escuro grayscale anterior
   está preservado em lib/theme.classic-dark-backup.ts para reverter se
   necessário — basta copiar o objeto de lá pra cá. */
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
