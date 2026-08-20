import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { theme, radius, spacing, type, fonts } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import AppPressable from './AppPressable';
import PrivacyValue from './PrivacyValue';
import type { BarColumn } from './StackedBarChart';

/* Rótulo compacto do eixo Y ("R$ 3 mil" em vez de "R$ 3.000,00") — o valor
   cheio já aparece no cabeçalho de seleção e nas fatias abaixo; aqui, ao
   lado de 4-5 linhas-guia, o formato completo brigaria por espaço com o
   próprio desenho. */
function formatEixo(n: number): string {
  if (n === 0) return 'R$ 0';
  if (n >= 1000) {
    const mil = n / 1000;
    return `R$ ${(mil % 1 === 0 ? mil.toFixed(0) : mil.toFixed(1)).replace('.', ',')} mil`;
  }
  return `R$ ${Math.round(n)}`;
}

/* Passo "redondo" pra cima (1/2/5 × potência de 10) — sem isso as linhas-guia
   caem em valores como "R$ 1.847" em vez de "R$ 2 mil". */
function passoRedondo(maxValor: number, divisoes: number): number {
  if (maxValor <= 0) return 1;
  const bruto = maxValor / divisoes;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / pot;
  const passo = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return passo * pot;
}

export default function LineAreaChart({
  columns,
  height = 240,
  width,
}: {
  columns: BarColumn[];
  height?: number;
  /** Largura já calculada pela tela (mesmo padrão do `size` do PieChart).
      Quando informada, pula a medição por `onLayout` — que, dentro do
      ScrollView largo da versão web, fica presa na primeira medição
      (estreita) e nunca acompanha o card real, deixando o gráfico "colado"
      à esquerda de um card muito mais largo. */
  width?: number;
}) {
  const [medida, setMedida] = useState(320);
  const containerWidth = width ?? medida;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    columns.length > 0 ? columns.length - 1 : null
  );

  function handleLayout(e: LayoutChangeEvent) {
    if (width !== undefined) return;
    const w = e.nativeEvent.layout.width;
    if (w > 0) setMedida(w);
  }

  if (!columns || columns.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>Sem dados suficientes para o período.</Text>
      </View>
    );
  }

  const maxTotalBruto = Math.max(...columns.map((c) => c.total), 1);
  const passo = passoRedondo(maxTotalBruto, 4);
  const maxEixo = Math.max(Math.ceil(maxTotalBruto / passo) * passo, passo);
  const gridLines = [0, 1, 2, 3, 4].map((i) => (maxEixo / 4) * i);

  /* 112px reserva espaço pro rótulo mais largo do eixo, tipo "R$ 11,5 mil"
     (~80px em Neue Machina 13px), MAIS uma folga visível até o início do
     desenho — com 88px o texto encostava quase direto na linha/grade,
     sem respiro nenhum entre o número e o gráfico. */
  const padLeft = 112;
  /* O último rótulo do eixo X ("Ago/26" etc.) é centralizado (textAnchor
     "middle") sobre o último ponto, que fica exatamente na borda direita do
     desenho — metade do texto sempre cairia fora do Svg sem essa folga. */
  const padRight = 26;
  const padTop = 16;
  const padBottom = 34;
  const plotWidth = Math.max(containerWidth - padLeft - padRight, 40);
  const plotHeight = Math.max(height - padTop - padBottom, 40);

  const pontos = columns.map((col, i) => {
    const x = columns.length === 1
      ? padLeft + plotWidth / 2
      : padLeft + (plotWidth * i) / (columns.length - 1);
    const y = padTop + plotHeight - (col.total / maxEixo) * plotHeight;
    return { x, y, col };
  });

  /* Interpolação cúbica MONÓTONA (Fritsch-Carlson, igual ao curveMonotoneX
     do d3) — não um Catmull-Rom comum. Um Catmull-Rom pode "estourar" acima
     ou abaixo dos dois pontos vizinhos ao suavizar a curva, desenhando um
     pico ou vale que nenhum balde de dados teve de verdade. A versão
     monótona fica igualmente suave mas nunca ultrapassa o valor dos pontos
     vizinhos entre um balde e outro. */
  function caminhoSuave(pts: typeof pontos): string {
    const n = pts.length;
    if (n === 0) return '';
    if (n === 1) return `M${pts[0].x},${pts[0].y}`;

    const dxSeg: number[] = [];
    const slope: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const deltaX = pts[i + 1].x - pts[i].x;
      const deltaY = pts[i + 1].y - pts[i].y;
      dxSeg.push(deltaX);
      slope.push(deltaX === 0 ? 0 : deltaY / deltaX);
    }

    const m: number[] = new Array(n);
    m[0] = slope[0];
    m[n - 1] = slope[n - 2];
    for (let i = 1; i < n - 1; i++) {
      m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (slope[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const a = m[i] / slope[i];
      const b = m[i + 1] / slope[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * slope[i];
        m[i + 1] = t * b * slope[i];
      }
    }

    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const seg = dxSeg[i];
      const c1x = p1.x + seg / 3;
      const c1y = p1.y + (m[i] * seg) / 3;
      const c2x = p2.x - seg / 3;
      const c2y = p2.y - (m[i + 1] * seg) / 3;
      d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
    }
    return d;
  }

  const linhaPath = caminhoSuave(pontos);
  const baseY = padTop + plotHeight;
  const areaPath = `${linhaPath} L${pontos[pontos.length - 1].x},${baseY} L${pontos[0].x},${baseY} Z`;

  const selectedCol = selectedIndex !== null ? columns[selectedIndex] : null;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {selectedCol && (
        <View style={styles.selectionHeader}>
          <View>
            <Text style={styles.selectedLabel}>{selectedCol.label}</Text>
            {selectedCol.sublabel ? (
              <Text style={styles.selectedSublabel}>{selectedCol.sublabel}</Text>
            ) : null}
          </View>
          <PrivacyValue>
            <Text style={styles.selectedTotal}>R$ {formatMoney(selectedCol.total)}</Text>
          </PrivacyValue>
        </View>
      )}

      <View style={{ height, width: '100%' }}>
        <Svg width={containerWidth} height={height}>
          <Defs>
            <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={theme.accent2} stopOpacity={0.35} />
              <Stop offset="1" stopColor={theme.accent2} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {gridLines.map((val, i) => {
            const y = padTop + plotHeight - (val / maxEixo) * plotHeight;
            return (
              <G key={`grid-${i}`}>
                <Line
                  x1={padLeft}
                  y1={y}
                  x2={containerWidth - padRight}
                  y2={y}
                  stroke={theme.rule}
                  strokeWidth={1}
                  opacity={0.6}
                />
                {/* Ancorado no início (não no fim) e todos na mesma
                    coordenada x: rótulos com "end" ficavam com a borda
                    esquerda em zigue-zague, cada um numa posição diferente
                    conforme o comprimento do próprio texto — pedido
                    explícito pra alinhar à esquerda, igual ao cabeçalho de
                    seleção acima. */}
                <SvgText
                  x={0}
                  y={y + 3}
                  fill={theme.inkFaint}
                  fontSize={type.legenda}
                  fontFamily={fonts.light}
                  textAnchor="start"
                >
                  {formatEixo(val)}
                </SvgText>
              </G>
            );
          })}

          <Path d={areaPath} fill="url(#areaFill)" />
          <Path d={linhaPath} stroke={theme.accent2} strokeWidth={2.5} fill="none" strokeLinecap="round" />

          {pontos.map(({ x, y }, i) => {
            const isSelected = selectedIndex === i;
            return (
              <Circle
                key={`pt-${i}`}
                cx={x}
                cy={y}
                r={isSelected ? 5 : 3}
                fill={isSelected ? theme.accent2 : theme.paper}
                stroke={theme.accent2}
                strokeWidth={isSelected ? 0 : 2}
              />
            );
          })}

          {columns.map((col, i) => (
            <SvgText
              key={`label-${i}`}
              x={pontos[i].x}
              y={height - 10}
              fill={selectedIndex === i ? theme.accent2 : theme.inkFaint}
              fontSize={type.legenda}
              fontFamily={selectedIndex === i ? fonts.regular : fonts.light}
              textAnchor="middle"
            >
              {col.label}
            </SvgText>
          ))}
        </Svg>

        {/* Áreas de toque — uma faixa vertical por ponto, com o limite entre
            duas faixas exatamente no meio dos dois pontos vizinhos (não uma
            divisão igual do card em N fatias). Os pontos NÃO são espaçados
            uniformemente pela largura toda: `padLeft` reserva espaço à
            esquerda pro rótulo do eixo Y, então uma divisão igual jogava o
            centro de cada faixa fora do ponto real — tocar bem em cima de
            um ponto selecionava o vizinho. */}
        <View style={StyleSheet.absoluteFill}>
          {pontos.map((p, idx) => {
            const anterior = pontos[idx - 1];
            const proximo = pontos[idx + 1];
            const inicio = anterior ? (anterior.x + p.x) / 2 : 0;
            const fim = proximo ? (p.x + proximo.x) / 2 : containerWidth;
            return (
              <AppPressable
                key={`touch-${idx}`}
                style={{ position: 'absolute', left: inicio, width: fim - inicio, top: 0, bottom: 0 }}
                onPress={() => setSelectedIndex(idx)}
              />
            );
          })}
        </View>
      </View>

      {selectedCol && selectedCol.segments.length > 0 && (
        <View style={styles.breakdownList}>
          {selectedCol.segments.map((seg, i) => (
            <View key={i} style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: seg.color }]} />
              <Text style={styles.breakdownCat} numberOfLines={1}>
                {seg.category}
              </Text>
              <PrivacyValue>
                <Text style={styles.breakdownVal}>R$ {formatMoney(seg.amount)}</Text>
              </PrivacyValue>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyContainer: {
    backgroundColor: theme.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  emptyText: {
    color: theme.inkFaint,
    fontSize: type.corpo, fontFamily: fonts.light },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  selectedLabel: {
    color: theme.ink,
    fontSize: type.corpo, fontFamily: fonts.regular },
  selectedSublabel: {
    color: theme.inkFaint,
    fontSize: type.nota, fontFamily: fonts.light },
  selectedTotal: {
    color: theme.accent2,
    fontSize: type.titulo, fontFamily: fonts.regular },
  breakdownList: {
    gap: 6,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownCat: {
    flex: 1,
    color: theme.ink,
    fontSize: type.apoio, fontFamily: fonts.regular },
  breakdownVal: {
    color: theme.ink,
    fontSize: type.apoio, fontFamily: fonts.regular },
});
