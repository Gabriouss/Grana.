import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './theme';
import { useBreakpoint } from './breakpoints';

/**
 * Medidas da barra de abas flutuante (`app/(app)/_layout.tsx`).
 *
 * Por que existe: a barra é `position: absolute`, então o React Navigation não
 * reserva espaço nenhum para ela — a tela inteira fica sob a barra e cada
 * conteúdo rolável precisa reservar esse espaço no fim por conta própria. Até
 * aqui isso era feito com números cravados espalhados pelo app (100 nas
 * listas, 112 nos FABs, 90 no toast, 60 no perfil), cada um chutado numa
 * sessão diferente — resultado: metade das telas tinha o último item escondido
 * atrás da barra. Centralizar aqui faz o número existir num lugar só, e mudar
 * a altura da barra deixa de exigir uma caçada por magic numbers.
 */
export const TAB_BAR_ALTURA = 68;

/** Folga mínima entre a barra e o fundo da tela, quando não há gesture bar. */
const MARGEM_MINIMA = 46;

export function useTabBarInset() {
  const insets = useSafeAreaInsets();
  const { temBarraLateral } = useBreakpoint();

  /* Em janela larga (desktop e tablet nativo) a navegação vira lateral e a
     barra flutuante deixa de existir — não há nada no rodapé para desviar.
     Reservar os ~118px mesmo assim abriria um vão morto no fim de todas as
     telas. Como as oito telas já leem daqui, zerar neste ponto resolve todas
     de uma vez. Sobra só a folga de respiro, que continua fazendo sentido. */
  if (temBarraLateral) {
    return { margem: 0, total: 0, paddingConteudo: spacing.xl };
  }

  /* `floatWrap` ancora em bottom:0, que no modo edge-to-edge é a borda física
     da tela — por baixo da navegação do sistema. Com gesture bar (~24dp) a
     margem fixa de 30 dava conta por acidente; com navegação de 3 botões
     (~48dp) a barra ficava parcialmente atrás dos botões do Android. */
  const margem = Math.max(MARGEM_MINIMA, insets.bottom + spacing.sm);

  return {
    /** Margem inferior da própria barra. */
    margem,
    /** Espaço total que a barra ocupa a partir do fundo da tela. */
    total: TAB_BAR_ALTURA + margem,
    /** Reserva para conteúdo rolável: a barra mais uma folga de respiro. */
    paddingConteudo: TAB_BAR_ALTURA + margem + spacing.lg,
  };
}
