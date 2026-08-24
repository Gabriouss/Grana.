import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

type Props = PropsWithChildren<{
  /** Milissegundos de espera antes de começar — o que faz os elementos do
      herói entrarem em sequência, não todos de uma vez. */
  atraso?: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Um elemento do herói nasce um pouco abaixo e transparente, e sobe até o
 * lugar dele quando a página carrega — a orquestração de entrada que dá o
 * primeiro sinal de "isto foi desenhado", antes de qualquer rolagem
 * acontecer. `RevealOnScroll` cobre o resto da página (dispara ao rolar);
 * este componente é só pro que já está visível no primeiro frame, onde
 * esperar uma rolagem nunca aconteceria.
 */
export default function EntradaEscalonada({ atraso = 0, style, children }: Props) {
  const progresso = useRef(new Animated.Value(0)).current;
  const [reduzirMovimento, setReduzirMovimento] = useState(false);

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => ativo && setReduzirMovimento(v))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (reduzirMovimento) {
      progresso.setValue(1);
      return;
    }
    Animated.timing(progresso, {
      toValue: 1,
      duration: 700,
      delay: atraso,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progresso, atraso, reduzirMovimento]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progresso,
          transform: [{ translateY: progresso.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
