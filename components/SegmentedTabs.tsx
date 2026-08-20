import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { theme, radius, fonts, type } from '@/lib/theme';
import AppPressable from './AppPressable';

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
    Animated.spring(translateX, { toValue: offsetFor(index), useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, [index, containerWidth]);

  function handleLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w === containerWidth) return;
    setContainerWidth(w);
    const nextSegW = Math.max((w - PAD * 2 - GAP * (n - 1)) / n, 0);
    translateX.setValue(index * (nextSegW + GAP));
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
  segmented: { flexDirection: 'row', backgroundColor: theme.paper, borderRadius: radius.sm, padding: PAD, gap: GAP },
  pill: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.sm - 2,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: radius.sm - 2, alignItems: 'center' },
  segmentBtnHover: { backgroundColor: theme.rule },
  segmentText: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  segmentTextOn: { color: theme.ink },
});
