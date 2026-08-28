import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/lib/motion';

/** Entrada suave (fade + leve subida) usada para dar acabamento "premium" ao
    montar a tela — em vez dos cards aparecerem todos de uma vez, "crus". */
export default function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    if (reduzirMovimento) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 340, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 340, delay, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [delay, opacity, reduzirMovimento, translateY]);

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
