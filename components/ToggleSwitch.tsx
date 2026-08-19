import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { theme } from '@/lib/theme';
import AppPressable from './AppPressable';

/** Switch on/off com a bolinha deslizando em spring e a trilha esmaecendo
    de cor — em vez de trocar de posição/cor instantaneamente. */
export default function ToggleSwitch({
  value,
  onToggle,
  hitSlop = 12,
  label,
}: {
  value: boolean;
  onToggle: () => void;
  hitSlop?: number;
  /** Anunciado por leitor de tela — a maioria dos usos já tem um rótulo de texto ao lado (ex.: "Modo privacidade"), então passe o mesmo texto aqui. */
  label?: string;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, { toValue: value ? 1 : 0, useNativeDriver: false, speed: 22, bounciness: 8 }).start();
  }, [value]);

  const trackColor = progress.interpolate({ inputRange: [0, 1], outputRange: [theme.ruleStrong, theme.ink] });
  const thumbTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });

  return (
    <AppPressable
      onPress={onToggle}
      hitSlop={hitSlop}
      scaleOnPress={false}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumb, { transform: [{ translateX: thumbTranslate }] }]} />
      </Animated.View>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 34, height: 20, borderRadius: 10, padding: 2 },
  thumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: theme.paperRaised },
});
