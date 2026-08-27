import { Animated, View } from 'react-native';

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
  /** Valor de rolagem em pixels (`Animated.Value`), da ScrollView que contém
      o orbe — presença opcional: sem ele o orbe fica parado, do jeito que
      sempre foi. */
  scrollY?: Animated.Value;
  /** Fração do deslocamento de rolagem que vira deslocamento do orbe — 0.1
      a 0.2 dá o efeito de profundidade (o brilho "atrasa" em relação ao
      conteúdo) sem o orbe se descolar visivelmente da faixa onde nasceu. */
  fatorParallax?: number;
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
export default function GlowOrb({ cor, tamanho = 640, top, left, right, bottom, scrollY, fatorParallax }: Props) {
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
    willChange: 'transform',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  } as any;

  if (!scrollY || !fatorParallax) {
    return <View pointerEvents="none" style={estiloBase} />;
  }

  // `translateY` é transform, não `top` — por isso convive com o `top`/`left`
  // absolutos acima sem precisar recalculá-los, e continua compatível com o
  // driver nativo de animação (RN só permite native driver em transform/opacity).
  const deslocamento = scrollY.interpolate({
    inputRange: [-1, 0, 3000],
    outputRange: [-1 * fatorParallax, 0, 3000 * fatorParallax],
    extrapolate: 'extend',
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[estiloBase, { transform: [{ translateY: deslocamento }] }]}
    />
  );
}
