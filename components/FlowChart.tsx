import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { theme } from '@/lib/theme';
import type { Transaction } from '@/lib/types';

export type ChartPeriod = 'month' | '7days' | 'year';

const CHART_X = [4, 48, 92, 136, 180, 224, 276];
const TOP = 14, BASE = 80;
const DASH_LEN = 900;

function smoothPath(points: number[][]) {
  if (!points || points.length === 0) return '';
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

type Bucket = {
  labelStart: string;
  labelEnd: string;
  matches: (txDate: string) => boolean;
};

function generateBuckets(period: ChartPeriod, year: number, month: number): Bucket[] {
  const pad = (n: number) => String(n).padStart(2, '0');

  if (period === 'year') {
    // 7 marcos ao longo dos 12 meses do ano
    const monthPairs = [
      { mStart: 0, mEnd: 1, name: 'Jan-Fev' },
      { mStart: 2, mEnd: 3, name: 'Mar-Abr' },
      { mStart: 4, mEnd: 5, name: 'Mai-Jun' },
      { mStart: 6, mEnd: 7, name: 'Jul-Ago' },
      { mStart: 8, mEnd: 9, name: 'Set-Out' },
      { mStart: 10, mEnd: 10, name: 'Nov' },
      { mStart: 11, mEnd: 11, name: 'Dez' },
    ];
    return monthPairs.map((p) => ({
      labelStart: 'Jan',
      labelEnd: 'Dez',
      matches: (txDate: string) => {
        const [y, m] = txDate.split('-').map(Number);
        return y === year && m - 1 >= p.mStart && m - 1 <= p.mEnd;
      },
    }));
  }

  if (period === '7days') {
    // 7 dias consecutivos (usando a semana atual ou início do mês selecionado)
    const now = new Date();
    const isCurrent = now.getFullYear() === year && now.getMonth() === month;
    const refDay = isCurrent ? now.getDate() : Math.min(28, new Date(year, month + 1, 0).getDate());
    const buckets: Bucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(year, month, refDay - i);
      const targetStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      buckets.push({
        labelStart: `${pad(new Date(year, month, refDay - 6).getDate())}/${pad(month + 1)}`,
        labelEnd: `${pad(new Date(year, month, refDay).getDate())}/${pad(month + 1)}`,
        matches: (txDate: string) => txDate === targetStr,
      });
    }
    return buckets;
  }

  // Padrão: 'month' (7 períodos bem distribuídos ao longo de todo o mês selecionado)
  const lastDay = new Date(year, month + 1, 0).getDate();
  const step = lastDay / 6;
  const dayRanges = [
    { start: 1, end: Math.round(step) },
    { start: Math.round(step) + 1, end: Math.round(step * 2) },
    { start: Math.round(step * 2) + 1, end: Math.round(step * 3) },
    { start: Math.round(step * 3) + 1, end: Math.round(step * 4) },
    { start: Math.round(step * 4) + 1, end: Math.round(step * 5) },
    { start: Math.round(step * 5) + 1, end: Math.round(step * 5.5) },
    { start: Math.round(step * 5.5) + 1, end: lastDay },
  ];

  return dayRanges.map((r) => ({
    labelStart: `01/${pad(month + 1)}`,
    labelEnd: `${pad(lastDay)}/${pad(month + 1)}`,
    matches: (txDate: string) => {
      const [y, m, d] = txDate.split('-').map(Number);
      return y === year && m - 1 === month && d >= r.start && d <= r.end;
    },
  }));
}

export default function FlowChart({
  transactions,
  period = 'month',
  year,
  month,
}: {
  transactions: Transaction[];
  period?: ChartPeriod;
  year?: number;
  month?: number;
}) {
  const currentYear = year ?? new Date().getFullYear();
  const currentMonth = month ?? new Date().getMonth();

  const buckets = generateBuckets(period, currentYear, currentMonth);

  const inTotals = buckets.map((b) =>
    transactions
      .filter((t) => t.type === 'in' && b.matches(t.occurred_on))
      .reduce((sum, t) => sum + Number(t.amount), 0)
  );

  const outTotals = buckets.map((b) =>
    transactions
      .filter((t) => t.type === 'out' && b.matches(t.occurred_on))
      .reduce((sum, t) => sum + Number(t.amount), 0)
  );

  const maxVal = Math.max(...inTotals, ...outTotals, 1);

  const toPoints = (totals: number[]) =>
    totals.map((v, i) => [CHART_X[i], BASE - (v / maxVal) * (BASE - TOP)]);
  
  const inPoints = toPoints(inTotals);
  const outPoints = toPoints(outTotals);

  const startLabel = buckets[0]?.labelStart || '';
  const endLabel = buckets[buckets.length - 1]?.labelEnd || '';

  const progress = useRef(new Animated.Value(0)).current;
  const [t, setT] = useState(0);
  const signature = JSON.stringify([inPoints, outPoints, period, currentYear, currentMonth]);

  useEffect(() => {
    const id = progress.addListener(({ value }) => setT(value));
    return () => progress.removeListener(id);
  }, []);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 1200,
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
        
        {/* Linha de Entradas */}
        <Path
          d={smoothPath(inPoints)}
          fill="none"
          stroke={theme.up}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={DASH_LEN}
          strokeDashoffset={dashoffset}
        />
        
        {/* Linha de Saídas */}
        <Path
          d={smoothPath(outPoints)}
          fill="none"
          stroke={theme.down}
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={outOpacity}
        />

        <Circle cx={inPoints[6][0]} cy={inPoints[6][1]} r={3.2} fill={theme.up} opacity={dotOpacity} />
        <Circle cx={outPoints[6][0]} cy={outPoints[6][1]} r={3.2} fill={theme.down} opacity={dotOpacity} />

        <SvgText x={4} y={94} fontSize={8} fill={theme.inkFaint}>
          {startLabel}
        </SvgText>
        <SvgText x={period === 'year' ? 255 : 242} y={94} fontSize={8} fill={theme.inkFaint}>
          {endLabel}
        </SvgText>
      </Svg>
    </View>
  );
}
