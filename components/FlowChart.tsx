import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { theme } from '@/lib/theme';
import type { Transaction } from '@/lib/types';

const CHART_X = [4, 48, 92, 136, 180, 224, 276];
const TOP = 14, BASE = 80;
// Comprimento de traço grande o bastante pra cobrir qualquer curva possível
// dentro do viewBox 280x96 — usado só pra "desenhar" a linha via
// strokeDashoffset, não precisa ser o comprimento exato do path.
const DASH_LEN = 900;

function smoothPath(points: number[][]) {
  let d = `M${points[0][0]},${points[0][1]} `;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0]},${p2[1]} `;
  }
  return d;
}

function last7Days() {
  const days: { year: number; month: number; day: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate() });
  }
  return days;
}

function dailyTotals(transactions: Transaction[], days: ReturnType<typeof last7Days>, type: 'in' | 'out') {
  return days.map((d) => {
    return transactions
      .filter((t) => {
        if (t.type !== type) return false;
        const [y, m, dd] = t.occurred_on.split('-').map(Number);
        return y === d.year && m - 1 === d.month && dd === d.day;
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);
  });
}

export default function FlowChart({ transactions }: { transactions: Transaction[] }) {
  const days = last7Days();
  const inTotals = dailyTotals(transactions, days, 'in');
  const outTotals = dailyTotals(transactions, days, 'out');
  const maxVal = Math.max(...inTotals, ...outTotals, 1);

  const toPoints = (totals: number[]) => totals.map((v, i) => [CHART_X[i], BASE - (v / maxVal) * (BASE - TOP)]);
  const inPoints = toPoints(inTotals);
  const outPoints = toPoints(outTotals);
  const d0 = days[0], d6 = days[6];
  const pad = (n: number) => String(n).padStart(2, '0');

  // Toda vez que os dados/seleção mudam, a linha "caminha" da esquerda pra
  // direita de novo (efeito de desenho via strokeDashoffset) em vez de só
  // trocar de forma instantaneamente. O progresso é lido via listener pra um
  // número comum de state — react-native-svg no navegador não sabe filtrar
  // a prop `collapsable` que o Animated.createAnimatedComponent injeta em
  // componentes que não são View, então em vez de <AnimatedPath>/<AnimatedCircle>
  // os elementos SVG recebem valores numéricos simples a cada frame.
  const progress = useRef(new Animated.Value(0)).current;
  const [t, setT] = useState(0);
  const signature = JSON.stringify([inPoints, outPoints]);

  useEffect(() => {
    const id = progress.addListener(({ value }) => setT(value));
    return () => progress.removeListener(id);
  }, []);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [signature]);

  const dashoffset = DASH_LEN - DASH_LEN * t;
  const outOpacity = t;
  const dotOpacity = t > 0.9 ? (t - 0.9) / 0.1 : 0;

  return (
    <View>
      <Svg width="100%" height={96} viewBox="0 0 280 96" style={{ overflow: 'visible' }}>
        <Line x1={0} y1={16} x2={280} y2={16} stroke={theme.rule} strokeWidth={1} />
        <Line x1={0} y1={48} x2={280} y2={48} stroke={theme.rule} strokeWidth={1} />
        <Line x1={0} y1={80} x2={280} y2={80} stroke={theme.rule} strokeWidth={1} />
        <Path
          d={smoothPath(inPoints)}
          fill="none"
          stroke={theme.ink}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={DASH_LEN}
          strokeDashoffset={dashoffset}
        />
        {/* A linha tracejada não dá pra "desenhar" com o mesmo truque de
            strokeDashoffset sem perder o próprio padrão de traços — em vez
            disso ela surge com um fade, acompanhando o mesmo ritmo. */}
        <Path
          d={smoothPath(outPoints)}
          fill="none"
          stroke={theme.inkFaint}
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={outOpacity}
        />
        <Circle cx={inPoints[6][0]} cy={inPoints[6][1]} r={3.2} fill={theme.ink} opacity={dotOpacity} />
        <Circle cx={outPoints[6][0]} cy={outPoints[6][1]} r={3.2} fill={theme.inkFaint} opacity={dotOpacity} />
        <SvgText x={4} y={94} fontSize={7.5} fill={theme.inkFaint}>
          {`${pad(d0.day)}/${pad(d0.month + 1)}`}
        </SvgText>
        <SvgText x={248} y={94} fontSize={7.5} fill={theme.inkFaint}>
          {`${pad(d6.day)}/${pad(d6.month + 1)}`}
        </SvgText>
      </Svg>
    </View>
  );
}
