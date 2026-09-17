import type { PropsWithChildren } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { EASE_REVEAL } from '@/lib/motion';

/**
 * Cada variante é uma FORMA de entrada diferente, não só um número trocado —
 * achado da auditoria de 02/09/2026: as 25+ chamadas deste componente usavam
 * a mesma forma para título de seção, card secundário e prova ao vivo do
 * produto, o que achata a hierarquia visual da página inteira num só gesto.
 *
 * - `padrao`: conteúdo de apoio (texto corrido, itens de lista).
 * - `titulo`: deslocamento maior. Reservado ao título/eyebrow de cada seção.
 * - `card`: leve escala junto do fade+subida, para grades de card.
 * - `prova`: escala mais perceptível, deslocamento mínimo — o produto
 *   ganhando presença (ConversaGranabo, MolduraCelular…).
 */
type Variante = 'padrao' | 'titulo' | 'card' | 'prova';

const RECEITAS: Record<Variante, { deslocamento: number; escala: number }> = {
  padrao: { deslocamento: 16, escala: 1 },
  titulo: { deslocamento: 30, escala: 1 },
  card: { deslocamento: 18, escala: 0.96 },
  prova: { deslocamento: 10, escala: 0.94 },
};

/* Os atrasos das grades são 45 a 90 ms por item. Na rolagem, atraso vira
   distância: cada passo de 45 ms empurra o fim da entrada 15px mais para
   dentro da tela. O teto cobre a maior cascata da página. */
const MS_POR_PASSO = 45;
const PX_POR_PASSO = 15;
const PASSOS = 14;
const passoDoAtraso = (atraso: number) => Math.min(PASSOS, Math.max(0, Math.round(atraso / MS_POR_PASSO)));

/**
 * A entrada é CSS puro, presa à posição da rolagem (`animation-timeline:
 * view()`), e o conteúdo nasce VISÍVEL.
 *
 * Até 17/09/2026 isto era um `IntersectionObserver`: o conteúdo nascia com
 * opacidade 0 e só aparecia quando o observador avisava que o elemento tinha
 * entrado na tela. Se o aviso não chegasse, a seção ficava em branco para
 * sempre — o autor mostrou três telas assim, só com a grade de fundo. O
 * aviso depende de o navegador rodar a atualização de quadro; num navegador
 * automatizado ele não chegou para rolagem feita por código até o primeiro
 * evento de mouse, e cada visualizador embutido tem regras próprias.
 *
 * Agora nada espera evento: o navegador calcula o estado a partir da posição
 * da rolagem no próprio estilo. Onde `animation-timeline` não existe
 * (Firefox) ou com `prefers-reduced-motion`, a regra não se aplica e o
 * conteúdo aparece direto. No nativo, `dataSet` é ignorado.
 *
 * A entrada termina com 40% da faixa de entrada percorrida (regra da skill
 * de rolagem: terminar dentro da tela). Com o encaixe (`scroll-snap`) das
 * dobras, o que para no pé da tela já chega inteiro ou quase.
 */
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('reveal-on-scroll')) {
  const regrasVariante = (Object.keys(RECEITAS) as Variante[])
    .map((v) => {
      const { deslocamento, escala } = RECEITAS[v];
      return `
        @keyframes reveal-${v} { from { opacity: 0; transform: translateY(${deslocamento}px) scale(${escala}); } }
        [data-reveal="${v}"] { animation-name: reveal-${v}; }`;
    })
    .join('');
  const regrasAtraso = Array.from({ length: PASSOS + 1 }, (_, p) =>
    `[data-reveal-passo="${p}"] { animation-range: entry ${p * PX_POR_PASSO}px entry calc(40% + ${p * PX_POR_PASSO}px); }`
  ).join('\n');
  const tag = document.createElement('style');
  tag.id = 'reveal-on-scroll';
  tag.textContent = `
    @media (prefers-reduced-motion: no-preference) {
      @supports (animation-timeline: view()) {
        [data-reveal] {
          animation-duration: auto;
          animation-fill-mode: both;
          animation-timing-function: ${EASE_REVEAL};
          animation-timeline: view();
        }
        ${regrasVariante}
        ${regrasAtraso}
      }
    }`;
  document.head.appendChild(tag);
}

type Props = PropsWithChildren<{
  /** Cascata em ms entre itens de uma grade; na rolagem vira distância. */
  atraso?: number;
  variante?: Variante;
  /** Repassado ao `View` que envolve o conteúdo — necessário quando este
      componente é filho direto de um `flexWrap`/grade, porque `flexBasis` só
      funciona no filho DIRETO do container flex. */
  style?: StyleProp<ViewStyle>;
}>;

export default function RevealOnScroll({ children, atraso = 0, variante = 'padrao', style }: Props) {
  return (
    <View
      // @ts-expect-error — atributo web puro (vira `data-reveal`); o tipo do RN não declara `dataSet`.
      dataSet={{ reveal: variante, revealPasso: passoDoAtraso(atraso) }}
      style={style}
    >
      {children}
    </View>
  );
}
