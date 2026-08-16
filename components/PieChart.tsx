import { View, StyleSheet } from 'react-native';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { theme } from '@/lib/theme';

export type PieSlice = { name: string; color: string; value: number };

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const CORNER_R = 1.6; // ~3px de arredondamento no tamanho renderizado padrão (184px)

function donutSlicePath(cx: number, cy: number, innerR: number, outerR: number, start: number, end: number) {
  const spanDeg = end - start;
  const large = spanDeg > 180 ? 1 : 0;

  // Raio de canto seguro: nunca maior que metade da espessura do anel nem
  // metade do comprimento de arco da fatia (fatias muito finas/estreitas
  // ficam com cantos proporcionalmente menores em vez de se deformar).
  const ringHalf = (outerR - innerR) / 2 - 0.15;
  const outerArcLen = ((spanDeg * Math.PI) / 180) * outerR;
  const innerArcLen = ((spanDeg * Math.PI) / 180) * innerR;
  const arcHalf = Math.min(outerArcLen, innerArcLen) / 2 - 0.15;
  const r = Math.max(0, Math.min(CORNER_R, ringHalf, arcHalf));

  if (r < 0.1) {
    // Fatia estreita demais pro arredondamento valer a pena — cantos retos.
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

  // Ângulo (graus) que corresponde a um comprimento de arco = r, em cada raio.
  const dOuter = (r / outerR) * (180 / Math.PI);
  const dInner = (r / innerR) * (180 / Math.PI);

  const p1 = polarToXY(cx, cy, outerR, end - dOuter); // início do arco externo (canto "end" já arredondado)
  const p2 = polarToXY(cx, cy, outerR, start + dOuter); // fim do arco externo
  const p2r = polarToXY(cx, cy, outerR - r, start); // após o filete, entrando na linha radial
  const p3La = polarToXY(cx, cy, innerR + r, start); // fim da linha radial, antes do filete
  const p3 = polarToXY(cx, cy, innerR, start + dInner); // início do arco interno
  const p4 = polarToXY(cx, cy, innerR, end - dInner); // fim do arco interno
  const p4La = polarToXY(cx, cy, innerR + r, end); // após o filete, entrando na linha radial de fechamento
  const p1r = polarToXY(cx, cy, outerR - r, end); // fim da linha de fechamento, antes do filete final

  const f = (p: { x: number; y: number }) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

  return [
    `M${f(p1)}`,
    `A${outerR},${outerR} 0 ${large} 0 ${f(p2)}`,
    `A${r},${r} 0 0 0 ${f(p2r)}`,
    `L${f(p3La)}`,
    `A${r},${r} 0 0 0 ${f(p3)}`,
    `A${innerR},${innerR} 0 ${large} 1 ${f(p4)}`,
    `A${r},${r} 0 0 0 ${f(p4La)}`,
    `L${f(p1r)}`,
    `A${r},${r} 0 0 0 ${f(p1)}`,
    'Z',
  ].join(' ');
}

/* Os rótulos ficam por fora do anel, então parte deles cai além do quadrado
   0..100 do desenho. `overflow: visible` resolveria isso na web, mas no
   Android o react-native-svg sempre recorta no limite da view — era por isso
   que as porcentagens de cima e da esquerda apareciam cortadas no aparelho.
   A correção que funciona nas duas plataformas é ampliar o próprio viewBox,
   de forma que os rótulos passem a estar *dentro* da área de desenho.

   Alcance máximo de um rótulo a partir do centro (50,50):
     labelR (48) + EXPLODE (3) + recuo do texto (1.5) + largura de "50%" (~13)
   ou seja ~115.5 — daí a margem de 16 unidades em volta. */
const VIEW_MARGIN = 16;
const VIEW_BOX = `${-VIEW_MARGIN} ${-VIEW_MARGIN} ${100 + VIEW_MARGIN * 2} ${100 + VIEW_MARGIN * 2}`;

/** Donut "explodido" com rótulos de porcentagem sempre por fora do anel — mesma lógica do protótipo web. */
export default function PieChart({ data, size = 216 }: { data: PieSlice[]; size?: number }) {
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
      <Svg width={size} height={size} viewBox={VIEW_BOX}>
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
