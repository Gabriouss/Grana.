import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { theme, radius, fonts, type, touchTarget } from '@/lib/theme';
import AppPressable from './AppPressable';
import { useReducedMotion } from '@/lib/motion';

/* Recuo interno do trilho e espaço entre os botões. Ficam aqui como
   constantes (e não soltos no StyleSheet) porque a posição da pílula é
   calculada a partir deles — se os dois valores saírem de sincronia, a
   pílula deixa de coincidir com o botão. */
const PAD = 3;
const GAP = 3;

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
  const reduzirMovimento = useReducedMotion();

  /* A largura que o onLayout devolve inclui o padding do trilho, e os botões
     ainda dividem entre si o espaço que sobra depois dos gaps. A pílula
     precisa seguir exatamente essa mesma conta: usar containerWidth/n
     deixava ela larga demais e, no último item, ultrapassando a borda
     direita — que era o recuo sumindo em "Ambos". */
  const n = options.length;
  const segW = Math.max((containerWidth - PAD * 2 - GAP * (n - 1)) / n, 0);
  const offsetFor = (i: number) => i * (segW + GAP);

  useEffect(() => {
    if (containerWidth === 0) return;
    if (reduzirMovimento) {
      translateX.setValue(offsetFor(index));
      return;
    }
    Animated.spring(translateX, { toValue: offsetFor(index), useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, [containerWidth, index, reduzirMovimento, translateX]);

  function handleLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w === containerWidth) return;
    setContainerWidth(w);
    const nextSegW = Math.max((w - PAD * 2 - GAP * (n - 1)) / n, 0);
    translateX.setValue(index * (nextSegW + GAP));
  }

  return (
    <View style={[styles.segmented, Platform.OS === 'android' && styles.segmentedAndroid, style]} onLayout={handleLayout}>
      {containerWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, Platform.OS === 'android' && styles.pillAndroid, { width: segW, transform: [{ translateX }] }]}
        />
      )}
      {options.map((opt) => (
        <AppPressable
          key={opt.key}
          scaleOnPress={false}
          onPress={() => onChange(opt.key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === opt.key }}
          android_ripple={{ color: theme.hover, borderless: false }}
          style={({ hovered }) => [styles.segmentBtn, Platform.OS === 'android' && styles.segmentBtnAndroid, hovered && value !== opt.key && styles.segmentBtnHover]}
        >
          <Text style={[styles.segmentText, value === opt.key && styles.segmentTextOn]}>{opt.label}</Text>
        </AppPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', backgroundColor: theme.paper, borderRadius: radius.sm, padding: PAD, gap: GAP },
  segmentedAndroid: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.ruleStrong, borderRadius: radius.pill },
  pill: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.sm - 2,
  },
  pillAndroid: { borderRadius: radius.pill, backgroundColor: 'rgba(174,255,227,0.16)' },
  segmentBtn: { flex: 1, minHeight: touchTarget, paddingVertical: 7, borderRadius: radius.sm - 2, alignItems: 'center', justifyContent: 'center' },
  segmentBtnAndroid: { borderRadius: radius.pill },
  segmentBtnHover: { backgroundColor: theme.rule },
  segmentText: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  segmentTextOn: { color: theme.ink },
});
