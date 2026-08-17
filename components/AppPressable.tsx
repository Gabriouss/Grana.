import { useRef, useState } from 'react';
import { Animated, Platform, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type HoverState = { pressed: boolean; hovered: boolean };

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: HoverState) => StyleProp<ViewStyle>);
  /** Ativa o leve "encolher" de toque (padrão true). Desative se o alvo não pode oscilar de tamanho. */
  scaleOnPress?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * No navegador, Pressable sozinho não dá nenhuma pista visual ao passar o
 * mouse por cima — só existe feedback de "pressed" (clique/toque). Este
 * wrapper acrescenta um estado "hovered" real via onHoverIn/onHoverOut
 * (eventos que só disparam com mouse; inofensivos e ignorados em toque
 * ou nativo) para as telas poderem estilizar o hover. No iOS/Android,
 * "hovered" nunca vira true, então o visual e o comportamento continuam
 * idênticos a um Pressable comum.
 *
 * Também aplica um encolher sutil (1 -> 0.96) no press-in/press-out em
 * todo o app pro toque parecer "premium" em vez de trocar de estilo sem
 * transição nenhuma. No nativo isso usa Animated (spring). Na web, em vez
 * de embrulhar o Pressable com Animated.createAnimatedComponent — o que
 * faz o react-native-web vazar a prop interna `collapsable` do Animated
 * pra um atributo DOM inválido e disparar um erro visível na tela — a
 * escala é uma transform estática ligada ao estado `pressed`, suavizada
 * por uma transição CSS (`transitionProperty`), que o react-native-web
 * já traduz nativamente.
 */
export default function AppPressable({ style, onHoverIn, onHoverOut, onPressIn, onPressOut, scaleOnPress = true, ...rest }: Props) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const merged: HoverState = { pressed, hovered: Platform.OS === 'web' && hovered };
  const resolvedStyle = typeof style === 'function' ? style(merged) : style;

  function handleHoverIn(e: any) {
    setHovered(true);
    onHoverIn?.(e);
  }
  function handleHoverOut(e: any) {
    setHovered(false);
    onHoverOut?.(e);
  }
  function handlePressIn(e: GestureResponderEvent) {
    setPressed(true);
    if (scaleOnPress && Platform.OS !== 'web') {
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
    }
    onPressIn?.(e);
  }
  function handlePressOut(e: GestureResponderEvent) {
    setPressed(false);
    if (scaleOnPress && Platform.OS !== 'web') {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
    }
    onPressOut?.(e);
  }

  if (Platform.OS === 'web') {
    const webTransition: any = scaleOnPress
      ? {
          transform: [{ scale: pressed ? 0.96 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: '150ms',
          transitionTimingFunction: 'ease-out',
        }
      : null;
    return (
      <Pressable
        {...rest}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[resolvedStyle, webTransition]}
      />
    );
  }

  return (
    <AnimatedPressable
      {...rest}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolvedStyle, { transform: [{ scale }] }]}
    />
  );
}
