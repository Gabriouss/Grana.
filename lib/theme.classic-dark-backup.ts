/* Backup do tema escuro "clássico" (grayscale) usado antes da troca para a
   paleta petróleo/ciano/verde-menta. Este arquivo não é importado por
   nenhuma tela — existe só como ponto de retorno caso a nova identidade
   visual precise ser desfeita. Para reverter: copie o objeto `theme`
   abaixo de volta para lib/theme.ts (mantendo `spacing`/`radius` como
   estão, eles não mudaram). */
export const theme = {
  paper: '#121212',
  paperRaised: '#1a1a1a',
  ink: '#f0f0ee',
  inkSoft: '#a8a8a6',
  inkFaint: '#888888',
  rule: 'rgba(255,255,255,0.14)',
  ruleStrong: 'rgba(255,255,255,0.26)',
  up: '#f0f0ee',
  down: '#a8a8a6',
};
