import { useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { theme, radius, spacing, type, fonts } from '@/lib/theme';
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
  /* O teto de largura acompanha quantas colunas existem. Com 48px fixos, um
     único período virava um traço de 48px perdido no meio de um card de mais
     de mil pixels — parecia defeito, não dado. Com poucas colunas há espaço
     de sobra e a barra pode ocupá-lo; com muitas, 48px continua sendo o que
     mantém o conjunto legível. */
  const tetoLargura = columns.length === 1 ? 120 : columns.length <= 3 ? 72 : 48;
  const columnWidth = Math.min(Math.max(availableWidth / columns.length - 12, 18), tetoLargura);
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
        {/* O desenho em si é decorativo pro leitor de tela: quem carrega a
            informação são os botões de coluna (logo abaixo) e a lista de
            categorias. Sem esconder, o SVG anuncia nós soltos de eixo e
            rótulo no meio da navegação. */}
        <Svg
          width={containerWidth}
          height={height}
          accessibilityElementsHidden
          // Só nativo — na web a `react-native-svg` não traduz essa prop
          // pro DOM, e ela vaza como atributo cru que o React acusa em
          // dev ("does not recognize the `importantForAccessibility`
          // prop"). `accessibilityElementsHidden` sozinho já basta pra
          // web (e continua também no nativo, sem mudança de comportamento).
          {...(Platform.OS !== 'web' ? { importantForAccessibility: 'no-hide-descendants' as const } : {})}
        >
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
                  fontSize={type.legenda}
                  fontFamily={isSelected ? fonts.regular : fonts.light}
                  textAnchor="middle"
                >
                  {col.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {/* Áreas de Toque Transparentes por Cima das Colunas.
            São a ÚNICA forma de selecionar um período, e estavam sem nome
            nenhum: no leitor de tela viravam alvos anônimos, impossíveis de
            distinguir. O rótulo NÃO inclui o valor de propósito — quem
            anuncia dinheiro é a lista abaixo, que passa por `PrivacyValue` e
            respeita o modo privacidade; repetir o total aqui vazaria o valor
            justamente pelo canal que o modo privacidade fecha. */}
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
          {columns.map((col, idx) => (
            <AppPressable
              key={`touch-${idx}`}
              style={{ flex: 1 }}
              onPress={() => setSelectedColumnIndex(idx)}
              accessibilityRole="button"
              accessibilityLabel={col.sublabel ? `${col.label}, ${col.sublabel}` : col.label}
              accessibilityHint="Mostra o detalhamento por categoria deste período."
              accessibilityState={{ selected: selectedColumnIndex === idx }}
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
