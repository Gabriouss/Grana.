import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { theme, radius, spacing, type } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import AppPressable from './AppPressable';
import PrivacyValue from './PrivacyValue';

export type BarSegment = {
  category: string;
  amount: number;
  color: string;
};

export type BarColumn = {
  label: string; // ex: "2024", "2025", "2026" ou "Jan", "Fev"
  sublabel?: string;
  total: number;
  segments: BarSegment[];
};

export default function StackedBarChart({
  columns,
  height = 220,
}: {
  columns: BarColumn[];
  height?: number;
}) {
  const [containerWidth, setContainerWidth] = useState(320);
  const [selectedColumnIndex, setSelectedColumnIndex] = useState<number | null>(
    columns.length > 0 ? columns.length - 1 : null
  );

  function handleLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w);
  }

  if (!columns || columns.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>Sem dados suficientes para o período.</Text>
      </View>
    );
  }

  const maxTotal = Math.max(...columns.map((c) => c.total), 1);
  const chartHeight = height - 40; // reserva para labels do eixo X
  const paddingX = 16;
  const availableWidth = Math.max(containerWidth - paddingX * 2, 100);
  const columnWidth = Math.min(Math.max(availableWidth / columns.length - 12, 18), 48);
  const gap = (availableWidth - columnWidth * columns.length) / Math.max(columns.length - 1, 1);

  const selectedCol =
    selectedColumnIndex !== null && columns[selectedColumnIndex]
      ? columns[selectedColumnIndex]
      : null;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Detalhe da coluna selecionada */}
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

      {/* SVG Canvas com Barras */}
      <View style={{ height, width: '100%' }}>
        <Svg width={containerWidth} height={height}>
          {/* Linha guia de base */}
          <Line
            x1={paddingX}
            y1={chartHeight}
            x2={containerWidth - paddingX}
            y2={chartHeight}
            stroke={theme.rule}
            strokeWidth={1}
          />

          {columns.map((col, idx) => {
            const x =
              columns.length === 1
                ? containerWidth / 2 - columnWidth / 2
                : paddingX + idx * (columnWidth + gap);

            const isSelected = selectedColumnIndex === idx;
            const barTotalHeight = (col.total / maxTotal) * (chartHeight - 24);

            let currentY = chartHeight;

            return (
              <G key={`col-${idx}`}>
                {/* Fatias Empilhadas da Barra */}
                {col.segments.map((seg, sIdx) => {
                  const segHeight = col.total > 0 ? (seg.amount / col.total) * barTotalHeight : 0;
                  currentY -= segHeight;

                  if (segHeight <= 0) return null;

                  return (
                    <Rect
                      key={`seg-${sIdx}`}
                      x={x}
                      y={currentY}
                      width={columnWidth}
                      height={segHeight}
                      fill={seg.color}
                      opacity={isSelected ? 1 : 0.75}
                      rx={sIdx === col.segments.length - 1 ? 4 : 0}
                      ry={sIdx === col.segments.length - 1 ? 4 : 0}
                    />
                  );
                })}

                {/* Se a coluna não tiver segmentos mas tiver total */}
                {col.segments.length === 0 && col.total > 0 && (
                  <Rect
                    x={x}
                    y={chartHeight - barTotalHeight}
                    width={columnWidth}
                    height={barTotalHeight}
                    fill={theme.accent2}
                    opacity={isSelected ? 1 : 0.75}
                    rx={4}
                    ry={4}
                  />
                )}

                {/* Rótulo do Eixo X */}
                <SvgText
                  x={x + columnWidth / 2}
                  y={chartHeight + 18}
                  fill={isSelected ? theme.accent2 : theme.inkFaint}
                  fontSize={11}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  textAnchor="middle"
                >
                  {col.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {/* Áreas de Toque Transparentes por Cima das Colunas */}
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
          {columns.map((_, idx) => (
            <AppPressable
              key={`touch-${idx}`}
              style={{ flex: 1 }}
              onPress={() => setSelectedColumnIndex(idx)}
            />
          ))}
        </View>
      </View>

      {/* Lista de Categorias Empilhadas da Coluna Selecionada */}
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
    padding: spacing.md,
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
    fontSize: type.corpo,
  },
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
    fontSize: type.corpo,
    fontWeight: '700',
  },
  selectedSublabel: {
    color: theme.inkFaint,
    fontSize: type.nota,
  },
  selectedTotal: {
    color: theme.accent2,
    fontSize: type.titulo,
    fontWeight: '700',
  },
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
    fontSize: type.apoio,
  },
  breakdownVal: {
    color: theme.ink,
    fontSize: type.apoio,
    fontWeight: '600',
  },
});
