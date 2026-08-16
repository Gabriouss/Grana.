import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { theme, radius } from '@/lib/theme';
import AppPressable from './AppPressable';

/** Segmentado com uma "pílula" que desliza suavemente até a opção
    selecionada, em vez de só trocar o estilo do botão na hora. */
export default function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const index = Math.max(options.findIndex((o) => o.key === value), 0);
  const segW = containerWidth / options.length;

  useEffect(() => {
    if (containerWidth === 0) return;
    Animated.spring(translateX, { toValue: index * segW, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, [index, containerWidth]);

  function handleLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    setContainerWidth(w);
    translateX.setValue(index * (w / options.length));
  }

  return (
    <View style={[styles.segmented, style]} onLayout={handleLayout}>
      {containerWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { width: segW, transform: [{ translateX }] }]}
        />
      )}
      {options.map((opt) => (
        <AppPressable
          key={opt.key}
          scaleOnPress={false}
          onPress={() => onChange(opt.key)}
          style={({ hovered }) => [styles.segmentBtn, hovered && value !== opt.key && styles.segmentBtnHover]}
        >
          <Text style={[styles.segmentText, value === opt.key && styles.segmentTextOn]}>{opt.label}</Text>
        </AppPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', backgroundColor: theme.paper, borderRadius: radius.sm, padding: 3, gap: 3 },
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.sm - 2,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: radius.sm - 2, alignItems: 'center' },
  segmentBtnHover: { backgroundColor: theme.rule },
  segmentText: { color: theme.inkFaint, fontSize: 11 },
  segmentTextOn: { color: theme.ink },
});
