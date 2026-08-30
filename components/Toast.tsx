import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text } from 'react-native';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { useTabBarInset } from '@/lib/tab-bar';
import { useReducedMotion } from '@/lib/motion';

export default function Toast({
  message,
  visible,
  onHide,
}: {
  message: string;
  visible: boolean;
  onHide: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const { total: tabBarTotal } = useTabBarInset();
  const reduzirMovimento = useReducedMotion();

  /* O toast some sozinho em 2 segundos. Sem anúncio, confirmações de
     sincronização, salvamento e alteração passavam despercebidas por quem usa
     leitor de tela: o `Animated.View` não tinha região viva, papel de status
     nem chamada de anúncio.
     Na web quem faz o trabalho é o `role="status"` da própria caixa, abaixo.
     No nativo o anúncio é explícito, porque o componente é desmontado e
     remontado a cada mensagem e a região viva nem sempre é relida. */
  useEffect(() => {
    if (!visible || !message || Platform.OS === 'web') return;
    AccessibilityInfo.announceForAccessibility(message);
  }, [visible, message]);

  useEffect(() => {
    if (visible) {
      if (reduzirMovimento) {
        opacity.setValue(1);
        translateY.setValue(0);
        const timer = setTimeout(onHide, 2000);
        return () => clearTimeout(timer);
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 20, duration: 250, useNativeDriver: true }),
        ]).start(() => onHide());
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [onHide, opacity, reduzirMovimento, translateY, visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          bottom: tabBarTotal + spacing.sm,
          opacity,
          transform: [{ translateY }],
          pointerEvents: 'none',
        },
      ]}
      role="status"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    /* `bottom` vem do useTabBarInset() no JSX: com 90 fixo o toast aparecia
       por cima da barra flutuante (que começa a ~98px do fundo). */
    alignSelf: 'center',
    backgroundColor: theme.ink,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    zIndex: 99,
    ...({ boxShadow: '0 4px 10px rgba(0,0,0,0.25)' } as any),
  },
  toastText: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
});
