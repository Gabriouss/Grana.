import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { theme, spacing, type, fonts } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import type { Transaction } from '@/lib/types';
import AppPressable from './AppPressable';

export type ChartPeriod = 'month' | '7days' | 'year';

/* Mesma proporção/leitura do LineAreaChart (tela Gráficos): eixo Y com folga
   à esquerda pros rótulos de valor, canvas mais alto que o antigo 280×96
   (que deixava tudo espremido), 5 linhas-guia em vez de 3.

   A largura do desenho é a largura REAL do card, medida por `onLayout` —
   antes o viewBox era fixo em 280 e esticava até a largura do card via
   `preserveAspectRatio="none"`, que preenchia a borda certinho mas
   deformava tudo que não era uma linha: os círculos dos marcadores viravam
   oval. Com coordenadas 1:1 (viewBox = pixels reais) não existe mais essa
   distorção, e ainda preenche o card de ponta a ponta porque o próprio
   valor medido JÁ É a largura toda.

   AXIS_LEFT é só espaço reservado dentro do desenho — os NÚMEROS do eixo Y
   não vivem mais dentro do Svg (ver <Text> abaixo): mais legível que
   <SvgText>, e sem risco de herdar qualquer distorção do desenho. 78px (não
   58px) porque a caixa do rótulo ("R$ 1,4 mil") precisa de espaço pra caber
   numa linha só — com menos que isso o texto quebrava em duas linhas e
   invadia a linha guia de baixo. */
const AXIS_LEFT = 78;
const PAD_RIGHT = 6;
const VIEW_H = 160;
const TOP = 18, BASE = 128;
const DASH_LEN = 900;

/** Mesmo formato compacto do eixo Y da tela de Gráficos ("R$ 3 mil"). */
function formatEixo(n: number): string {
  if (n <= 0) return 'R$ 0';
  if (n >= 1000) {
    const mil = n / 1000;
    return `R$ ${(mil % 1 === 0 ? mil.toFixed(0) : mil.toFixed(1)).replace('.', ',')} mil`;
  }
  return `R$ ${Math.round(n)}`;
}

/* Linha reta entre os baldes, de propósito: uma curva suave (mesmo a
   monótona que nunca ultrapassa os pontos vizinhos) ainda interpola um
   crescimento gradual ao longo do segmento inteiro entre um balde zerado e
   um balde com valor — e a maioria dos meses tem só 1 balde real (o dia do
   salário) cercado de zeros. Isso desenhava uma "colina" suave que nenhum
   lançamento sustentava. Reta mostra o degrau como ele é. */
function caminhoReto(pts: number[][]): string {
  if (pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
}

type Bucket = {
  labelStart: string;
  labelEnd: string;
  /** Identifica ESTE balde (não a série inteira) — mostrado ao tocar no
      ponto, pra conferir onde está o valor que não aparece óbvio na curva
      (um balde pequeno perto de um pico gigante fica visualmente achatado
      perto de zero, mas o valor continua ali). */
  label: string;
  matches: (txDate: string) => boolean;
};

function generateBuckets(period: ChartPeriod, year: number, month: number): Bucket[] {
  const pad = (n: number) => String(n).padStart(2, '0');

  if (period === 'year') {
    // 12 pontos, um por mês do ano — cada ponto é o lançamento de 1 mês só,
    // não uma soma de dois meses (isso inventava um valor que nenhum mês
    // isolado teve de verdade quando exibido ao tocar no ponto).
    const nomesMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return nomesMes.map((nome, mIndex) => ({
      labelStart: 'Jan',
      labelEnd: 'Dez',
      label: nome,
      matches: (txDate: string) => {
        const [y, m] = txDate.split('-').map(Number);
        return y === year && m - 1 === mIndex;
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
        label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
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
    label: r.start === r.end ? `${pad(r.start)}/${pad(month + 1)}` : `${pad(r.start)}–${pad(r.end)}/${pad(month + 1)}`,
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
  const [viewW, setViewW] = useState(280);
  function handleLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setViewW(w);
  }

  const currentYear = year ?? new Date().getFullYear();
  const currentMonth = month ?? new Date().getMonth();

  const buckets = generateBuckets(period, currentYear, currentMonth);
  const [selecionado, setSelecionado] = useState(buckets.length - 1);
  // Número de pontos varia por período (12 no ano, 7 no mês/7 dias) — a
  // posição de cada um no eixo X precisa acompanhar essa contagem, não um
  // "6" fixo que só valia enquanto todo período tinha 7 marcos.
  const chartX = buckets.map(
    (_, i) => AXIS_LEFT + (i / (buckets.length - 1 || 1)) * (viewW - AXIS_LEFT - PAD_RIGHT)
  );

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
    totals.map((v, i) => [chartX[i], BASE - (v / maxVal) * (BASE - TOP)]);

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
    setSelecionado(buckets.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, currentYear, currentMonth]);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 4000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [signature]);


  const dashoffset = DASH_LEN - DASH_LEN * t;
  const outOpacity = t;
  const dotOpacity = t > 0.9 ? (t - 0.9) / 0.1 : 0;

  const inPath = caminhoReto(inPoints);
  const outPath = caminhoReto(outPoints);
  const areaPath = `${inPath} L${inPoints[inPoints.length - 1][0]},${BASE} L${inPoints[0][0]},${BASE} Z`;

  const gridLines = [0, 1, 2, 3, 4].map((i) => ({
    y: BASE - (i / 4) * (BASE - TOP),
    valor: (maxVal / 4) * i,
  }));

  const inSelecionado = inTotals[selecionado] ?? 0;
  const outSelecionado = outTotals[selecionado] ?? 0;
  const labelSelecionado = buckets[selecionado]?.label ?? '';

  return (
    <View>
      {/* Cabeçalho de detalhe do balde tocado — mesmo padrão de seleção do
          LineAreaChart (tela Gráficos). Existe porque um balde pequeno perto
          de um pico gigante fica visualmente achatado perto de zero na
          curva, mas o valor continua ali: tocando dá pra conferir onde está
          a diferença entre a soma do topo do card e o pico do eixo. */}
      {labelSelecionado ? (
        <View style={styles.selectionHeader}>
          <Text style={styles.selectionLabel}>{labelSelecionado}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {inSelecionado > 0 && (
              <Text style={[styles.selectionValor, { color: theme.up }]}>+ R$ {formatMoney(inSelecionado)}</Text>
            )}
            {outSelecionado > 0 && (
              <Text style={[styles.selectionValor, { color: theme.down }]}>− R$ {formatMoney(outSelecionado)}</Text>
            )}
            {inSelecionado === 0 && outSelecionado === 0 && (
              <Text style={[styles.selectionValor, { color: theme.inkFaint }]}>Sem movimentação</Text>
            )}
          </View>
        </View>
      ) : null}

    <View style={{ position: 'relative' }} onLayout={handleLayout}>
      <Svg width={viewW} height={VIEW_H} viewBox={`0 0 ${viewW} ${VIEW_H}`} style={{ overflow: 'visible' }}>
        <Defs>
          <LinearGradient id="fluxoAreaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.up} stopOpacity={0.3} />
            <Stop offset="1" stopColor={theme.up} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {gridLines.map(({ y, valor }, i) => (
          <Line key={`grid-${i}`} x1={AXIS_LEFT} y1={y} x2={viewW - PAD_RIGHT} y2={y} stroke={theme.rule} strokeWidth={1} opacity={0.6} />
        ))}

        {/* Preenchimento em degradê sob a linha de Entradas — mesma
            linguagem visual do gráfico de Gráficos, sem herdar a animação de
            traço (que não se aplica a uma área): só some/aparece com `t`. */}
        <Path d={areaPath} fill="url(#fluxoAreaFill)" opacity={outOpacity} />

        {/* Linha de Entradas */}
        <Path
          d={inPath}
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
          d={outPath}
          fill="none"
          stroke={theme.down}
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={outOpacity}
        />

        {/* Marcador em cada balde real — reforça que são 7 somas discretas.
            O balde tocado (`selecionado`) fica maior, mesma linguagem do
            LineAreaChart. */}
        {inPoints.map((p, i) => (
          <Circle
            key={`in-${i}`}
            cx={p[0]}
            cy={p[1]}
            r={i === selecionado ? 4 : 2.5}
            fill={theme.up}
            opacity={i === selecionado ? dotOpacity : dotOpacity * 0.8}
          />
        ))}
        {outPoints.map((p, i) => (
          <Circle
            key={`out-${i}`}
            cx={p[0]}
            cy={p[1]}
            r={i === selecionado ? 4 : 2.5}
            fill={theme.down}
            opacity={i === selecionado ? outOpacity * dotOpacity : outOpacity * dotOpacity * 0.8}
          />
        ))}
      </Svg>

      {/* Rótulos por cima do Svg, em <Text> real do RN — não em <SvgText>
          dentro do desenho esticado (`preserveAspectRatio="none"`), que
          alarga as letras junto com a linha em vez de só aumentar o
          tamanho. `top`/`y` continuam batendo com as linhas-guia porque só
          o eixo horizontal é esticado; a altura do Svg é fixa (VIEW_H, em
          pixels reais) e nunca muda. */}
      {gridLines.map(({ y, valor }, i) => (
        <Text key={`ylabel-${i}`} style={[styles.axisLabel, { top: y - 8 }]} numberOfLines={1}>
          {formatEixo(valor)}
        </Text>
      ))}
      {/* left/right alinhados com AXIS_LEFT/PAD_RIGHT — onde a linha do
          gráfico REALMENTE começa e termina, não a borda do card. Com
          `left: 0` puro, "01/08" ficava embaixo dos números do eixo Y, não
          embaixo do início de fato da linha. */}
      <Text style={[styles.dateLabel, { left: AXIS_LEFT }]}>{startLabel}</Text>
      <Text style={[styles.dateLabel, { right: PAD_RIGHT, textAlign: 'right' }]}>{endLabel}</Text>

      {/* Áreas de toque — o limite entre duas faixas cai exatamente no meio
          dos dois pontos vizinhos, não numa divisão igual da largura toda.
          `chartX` reserva AXIS_LEFT à esquerda pros números do eixo Y, então
          os baldes não ficam espaçados uniformemente pelo card inteiro —
          uma divisão igual (flex:1 por balde) jogava o centro de cada faixa
          fora do ponto real, e tocar bem em cima de um ponto selecionava o
          vizinho. */}
      <View style={StyleSheet.absoluteFill}>
        {chartX.map((x, i) => {
          const anterior = chartX[i - 1];
          const proximo = chartX[i + 1];
          const inicio = anterior !== undefined ? (anterior + x) / 2 : 0;
          const fim = proximo !== undefined ? (x + proximo) / 2 : viewW;
          return (
            <AppPressable
              key={`touch-${i}`}
              style={{ position: 'absolute', left: inicio, width: fim - inicio, top: 0, bottom: 0 }}
              onPress={() => setSelecionado(i)}
            />
          );
        })}
      </View>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  selectionLabel: {
    color: theme.ink,
    fontSize: type.nota,
    fontFamily: fonts.regular,
  },
  selectionValor: {
    fontSize: type.nota,
    fontFamily: fonts.regular,
  },
  axisLabel: {
    position: 'absolute',
    left: 0,
    // Largura travada (não solto com só `left: 0`, que deixava o texto
    // quebrar em duas linhas dependendo do valor). textAlign 'left' começa
    // todo rótulo no mesmo x — pedido explícito de alinhar à esquerda,
    // igual ao eixo Y do LineAreaChart (tela Gráficos).
    width: AXIS_LEFT - 8,
    textAlign: 'left',
    color: theme.inkFaint,
    fontSize: type.legenda,
    fontFamily: fonts.light,
  },
  dateLabel: {
    position: 'absolute',
    bottom: 0,
    color: theme.inkFaint,
    fontSize: type.legenda,
    fontFamily: fonts.light,
  },
});
