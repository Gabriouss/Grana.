import { Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  icone: keyof typeof Ionicons.glyphMap;
  tamanho?: number;
  /** Sempre com o alfa embutido (ex. `theme.accent2 + '14'`) — textura de
      fundo, não um ícone de verdade, então a opacidade fica bem baixa. */
  cor: string;
  top?: number;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  rotacao?: string;
  /** Mesmo contrato de paralaxe do GlowOrb — presença opcional, sem ele o
      ícone fica parado. */
  scrollY?: Animated.Value;
  fatorParallax?: number;
};

/**
 * Um ícone do domínio (moeda, recibo) flutuando bem apagado atrás do
 * conteúdo — puro reforço temático, nunca compete com card/CTA em destaque.
 * Modelado exatamente em GlowOrb: mesma mecânica de paralaxe transform-only
 * (compatível com native driver), mesmo `pointerEvents="none"`, mesma regra
 * de cor-com-alfa-embutido em vez de `opacity` separado (aqui não tem blur
 * pra proteger, mas mantém os dois componentes com a mesma forma de prop).
 */
export default function FloatingIcon({
  icone,
  tamanho = 28,
  cor,
  top,
  left,
  right,
  bottom,
  rotacao,
  scrollY,
  fatorParallax,
}: Props) {
  const estiloBase = {
    position: 'absolute',
    top,
    left,
    right,
    bottom,
    transform: rotacao ? [{ rotate: rotacao }] : undefined,
  } as any;

  if (!scrollY || !fatorParallax) {
    return (
      <View pointerEvents="none" style={estiloBase}>
        <Ionicons name={icone} size={tamanho} color={cor} />
      </View>
    );
  }

  const deslocamento = scrollY.interpolate({
    inputRange: [-1, 0, 3000],
    outputRange: [-1 * fatorParallax, 0, 3000 * fatorParallax],
    extrapolate: 'extend',
  });

  const transformParallax = rotacao
    ? [{ rotate: rotacao }, { translateY: deslocamento }]
    : [{ translateY: deslocamento }];

  return (
    <Animated.View pointerEvents="none" style={[estiloBase, { transform: transformParallax }]}>
      <Ionicons name={icone} size={tamanho} color={cor} />
    </Animated.View>
  );
}
