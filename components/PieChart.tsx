import { View, StyleSheet } from 'react-native';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { theme } from '@/lib/theme';

export type PieSlice = { name: string; color: string; value: number };

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx: number, cy: number, innerR: number, outerR: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0;
  const p1 = polarToXY(cx, cy, outerR, end);
  const p2 = polarToXY(cx, cy, outerR, start);
  const p3 = polarToXY(cx, cy, innerR, start);
  const p4 = polarToXY(cx, cy, innerR, end);
  return [
    `M${p1.x.toFixed(2)},${p1.y.toFixed(2)}`,
    `A${outerR},${outerR} 0 ${large} 0 ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    `L${p3.x.toFixed(2)},${p3.y.toFixed(2)}`,
    `A${innerR},${innerR} 0 ${large} 1 ${p4.x.toFixed(2)},${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** Donut "explodido" com rótulos de porcentagem sempre por fora do anel — mesma lógica do protótipo web. */
export default function PieChart({ data, size = 184 }: { data: PieSlice[]; size?: number }) {
  if (data.length === 0) return null;

  const cx = 50, cy = 50, innerR = 22, outerR = 40, labelR = outerR + 8;
  const GAP_DEG = 2.4, EXPLODE = 3;
  let angle = 0;

  const slices = data.map((seg) => {
    const span = (seg.value / 100) * 360;
    const start = angle + GAP_DEG / 2;
    const end = Math.max(angle + span - GAP_DEG / 2, start);
    const mid = (start + end) / 2;
    const dir = polarToXY(0, 0, 1, mid);
    const dx = EXPLODE * dir.x, dy = EXPLODE * dir.y;
    const labelPt = polarToXY(cx + dx, cy + dy, labelR, mid);
    const anchor: 'start' | 'end' | 'middle' = dir.x > 0.15 ? 'start' : dir.x < -0.15 ? 'end' : 'middle';
    const labelX = labelPt.x + (anchor === 'start' ? 1.5 : anchor === 'end' ? -1.5 : 0);
    angle += span;
    return {
      seg,
      d: donutSlicePath(cx + dx, cy + dy, innerR, outerR, start, end),
      labelX,
      labelY: labelPt.y,
      anchor,
    };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {slices.map(({ seg, d, labelX, labelY, anchor }) => (
          <G key={seg.name}>
            <Path d={d} fill={seg.color} />
            {seg.value > 0 && (
              <SvgText
                x={labelX}
                y={labelY}
                fontSize={7}
                fill={theme.ink}
                textAnchor={anchor}
                alignmentBaseline="central"
              >
                {seg.value}%
              </SvgText>
            )}
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({});
