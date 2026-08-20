import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { useTabBarInset } from '@/lib/tab-bar';

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

  useEffect(() => {
    if (visible) {
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
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          bottom: tabBarTotal + spacing.sm,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="none"
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
});
