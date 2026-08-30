import { View } from 'react-native';

type Props = {
  /** Sempre em rgba com o alfa já embutido — nunca opacity separado, porque
      opacity opacificaria o blur inteiro (inclusive a borda do círculo, que
      deve sumir gradualmente) em vez de só a cor. */
  cor: string;
  tamanho?: number;
  top?: number;
  left?: number | string;
  right?: number;
  bottom?: number;
};

/**
 * Um círculo de luz ambiente, borrado, atrás do conteúdo — a peça que tira a
 * página de "cor chapada com cards em cima" e coloca uma atmosfera por trás.
 * Web-only por natureza: `radial-gradient`/`filter: blur` não existem no
 * StyleSheet do React Native, só no CSS que o react-native-web gera —
 * mesmo raciocínio de `as any` já usado em RevealOnScroll e no cabeçalho
 * flutuante de _layout.tsx. Esta página inteira (app/index.tsx) só renderiza
 * na web, então não existe caminho nativo pra proteger aqui.
 */
export default function GlowOrb({ cor, tamanho = 640, top, left, right, bottom }: Props) {
  const estiloBase = {
    position: 'absolute',
    top,
    left,
    right,
    bottom,
    width: tamanho,
    height: tamanho,
    borderRadius: tamanho / 2,
    backgroundImage: `radial-gradient(circle, ${cor} 0%, transparent 70%)`,
    filter: 'blur(70px)',
    /* Sem `willChange: 'transform'`. O orb nunca anima — é um gradiente
       parado — então a dica não tinha transform nenhum pra otimizar, e o
       custo era real: `will-change` permanente promove cada orb a uma camada
       de composição própria, retida pela vida inteira da página, com um
       buffer offscreen do tamanho do blur de 70px. São três orbs. A regra
       do `will-change` é anunciar mudança que vai acontecer, não marcar
       elemento estático. `backfaceVisibility` fica: essa continua sendo a
       dica que evita o blur serrilhar em alguns navegadores. */
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  } as any;

  return <View style={[estiloBase, { pointerEvents: 'none' }]} />;
}
