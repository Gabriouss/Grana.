import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { EASE_REVEAL, useEntradaNaTela } from '@/lib/motion';

/**
 * Cada variante é uma FORMA de entrada diferente, não só um número trocado —
 * achado da auditoria de 02/09/2026: as 25+ chamadas deste componente usavam
 * a mesma forma (fade + 16px + 600ms) para título de seção, card secundário
 * e prova ao vivo do produto, o que achata a hierarquia visual da página
 * inteira num só gesto repetido.
 *
 * - `padrao`: conteúdo de apoio (texto corrido, itens de lista).
 * - `titulo`: deslocamento maior e mais lento. Reservado ao título/eyebrow
 *   de cada seção, o elemento que assina a dobra.
 * - `card`: leve escala junto do fade+subida, para grades de card, onde o
 *   `atraso` já faz a cascata.
 * - `prova`: escala mais perceptível, deslocamento mínimo — o produto
 *   ganhando presença (ConversaGranachat, MolduraCelular…), não subindo.
 */
type Variante = 'padrao' | 'titulo' | 'card' | 'prova';

const RECEITAS: Record<Variante, { deslocamento: number; escala: number; duracao: number }> = {
  padrao: { deslocamento: 16, escala: 1, duracao: 600 },
  titulo: { deslocamento: 30, escala: 1, duracao: 780 },
  card: { deslocamento: 18, escala: 0.96, duracao: 560 },
  prova: { deslocamento: 10, escala: 0.94, duracao: 700 },
};

type Props = PropsWithChildren<{
  /** Espera extra antes de aparecer, em ms: é o que faz uma fileira de cards
      revelar em cascata em vez de todos ao mesmo tempo. */
  atraso?: number;
  variante?: Variante;
  /** Repassado ao `View` que envolve o conteúdo — necessário quando este
      componente é filho direto de um `flexWrap`/grade, porque `flexBasis` só
      funciona no filho DIRETO do container flex. */
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Revela o bloco com fade e leve subida quando ele entra na tela.
 *
 * Quem decide o momento é `useEntradaNaTela`, compartilhado com as
 * encenações de `TrilhaPassos` e `BentoFerramentas`: o conteúdo nasce
 * visível e só é escondido quando o observador confirma que o bloco está
 * fora da tela. Sem isso, um aviso que não chega deixava a seção em branco
 * para sempre — o defeito que o autor mostrou em 17/09/2026.
 *
 * A transição só é declarada no sentido de MOSTRAR. Declarada sempre, o
 * instante de esconder também animaria, e um bloco que já estava na tela
 * piscaria antes de entrar.
 *
 * Entre 17/09 e esta versão a entrada foi tentada em CSS puro preso à
 * rolagem (`animation-timeline: view()`). Não funciona nesta página: os
 * blocos ficam dentro de contêineres com `overflow: hidden` que não rolam, e
 * o navegador resolve a linha do tempo contra ESSE contêiner — a animação
 * nasce terminada e nada se move. Medido no navegador: `ViewTimeline` com
 * `source` de 848×848 e estado `finished`. Foi o autor quem viu ("os motions
 * não estão funcionando"), porque a conferência daquela rodada só checou se
 * algum bloco ficava apagado, não se a animação acontecia.
 */
export default function RevealOnScroll({ children, atraso = 0, variante = 'padrao', style }: Props) {
  const { ref, ativo, instantaneo } = useEntradaNaTela('0px 0px 15% 0px');
  const { deslocamento, escala, duracao } = RECEITAS[variante];

  /* Propriedades de transição não existem no tipo `ViewStyle` do RN — só o
     react-native-web as reconhece, e esta tela é só web. */
  const estiloWeb = {
    opacity: ativo ? 1 : 0,
    transform: [{ translateY: ativo ? 0 : deslocamento }, { scale: ativo ? 1 : escala }],
    ...(ativo && !instantaneo
      ? {
          transitionProperty: 'opacity, transform',
          transitionDuration: `${duracao}ms`,
          transitionDelay: `${atraso}ms`,
          transitionTimingFunction: EASE_REVEAL,
        }
      : null),
  } as any;

  return (
    <View ref={ref} style={[style, estiloWeb]}>
      {children}
    </View>
  );
}
