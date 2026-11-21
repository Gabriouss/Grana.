import { memo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { theme, radius, spacing, type, fonts } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import PrivacyValue from './PrivacyValue';
import { usePrivacy } from '@/lib/privacy-context';
import type { BarColumn } from './StackedBarChart';
import { serieEntradas, serieSaidas, useLinhaFluxo, type SerieLinha } from './LinhaFluxo';

/** Coluna da tela Gráficos. `entradas` e `saidas` separam o total quando a
    aba mostra as duas linhas (Geral). */
export type LinhaColumn = BarColumn & { entradas?: number; saidas?: number };

/** O que a aba desenha: só saídas (Despesas), só entradas (Renda) ou as duas
    linhas, como o "Ambos" da Início (Geral, decisão do autor de 20/11/2026). */
export type ModoLinha = 'saidas' | 'entradas' | 'ambos';

/* Desenho idêntico ao gráfico da Início (item 53): o mesmo `useLinhaFluxo`
   de `LinhaFluxo.tsx`, com as mesmas cores por sentido. Entradas em
   `theme.up`, contínua, com degradê; saídas em `theme.down`, tracejada. Esta
   tela continua dona das colunas, do cabeçalho do ponto tocado e da
   composição por categoria logo abaixo. */
function LineAreaChart({
  columns,
  modo = 'saidas',
  height = 240,
  width,
  carregando = false,
  erro = null,
}: {
  columns: LinhaColumn[];
  modo?: ModoLinha;
  height?: number;
  /** Largura já calculada pela tela. Quando informada, pula a medição por
      `onLayout`, que dentro do ScrollView largo da versão web fica presa na
      primeira medição (estreita) e deixa o gráfico colado à esquerda. */
  width?: number;
  /** A tela ainda está buscando os lançamentos. Sem isto, `columns` vazio
      durante a carga desenhava "Sem dados suficientes para o período", uma
      afirmação falsa por alguns segundos a cada abertura (achado X1). */
  carregando?: boolean;
  /** A busca falhou e não havia nada guardado. Vazio por falha não é vazio
      por falta de lançamento, e o texto precisa dizer qual dos dois é. */
  erro?: string | null;
}) {
  const { hidden } = usePrivacy();
  const [selecionado, setSelecionado] = useState<number>(columns.length > 0 ? columns.length - 1 : 0);

  const entradas = columns.map((c) => (modo === 'ambos' ? c.entradas ?? 0 : c.total));
  const saidas = columns.map((c) => (modo === 'ambos' ? c.saidas ?? 0 : c.total));
  const series: SerieLinha[] =
    modo === 'ambos'
      ? [serieEntradas(entradas), serieSaidas(saidas)]
      : modo === 'entradas'
      ? [serieEntradas(entradas)]
      : [serieSaidas(saidas)];
  const corDaSerie = modo === 'entradas' ? theme.up : theme.down;

  /* Chamado antes do retorno de vazio: a ordem dos hooks não pode depender
     de haver coluna. */
  const desenho = useLinhaFluxo({
    series,
    selecionado,
    onSelecionar: setSelecionado,
    rotuloInicio: columns[0]?.label ?? '',
    rotuloFim: columns[columns.length - 1]?.label ?? '',
    rotuloToque: (i) => {
      const c = columns[i];
      if (hidden) return `${c?.label ?? ''}: ${modo === 'ambos' ? 'valores ocultos' : 'valor oculto'}`;
      return modo === 'ambos'
        ? `${c?.label ?? ''}: entradas R$ ${formatMoney(c?.entradas ?? 0)}, saídas R$ ${formatMoney(c?.saidas ?? 0)}`
        : `${c?.label ?? ''}: R$ ${formatMoney(c?.total ?? 0)}`;
    },
    assinatura: JSON.stringify([modo, columns.map((c) => [c.label, c.total, c.entradas, c.saidas])]),
    idDegrade: 'graficosAreaFill',
    largura: width,
    altura: height,
  });

  if (!columns || columns.length === 0) {
    /* Mesmo contêiner e mesma altura nos três casos, para o conteúdo abaixo
       não pular quando a carga termina. */
    return (
      <View style={[styles.emptyContainer, { height }]}>
        {carregando ? (
          <ActivityIndicator color={theme.inkFaint} accessibilityLabel="Carregando o gráfico" />
        ) : (
          <Text style={styles.emptyText} accessibilityRole={erro ? 'alert' : undefined}>
            {erro ?? 'Sem dados suficientes para o período.'}
          </Text>
        )}
      </View>
    );
  }

  const selectedCol = columns[Math.min(selecionado, columns.length - 1)];

  return (
    <View style={styles.container}>
      {selectedCol && (
        <View style={styles.selectionHeader}>
          <View>
            <Text style={styles.selectedLabel}>{selectedCol.label}</Text>
            {selectedCol.sublabel ? (
              <Text style={styles.selectedSublabel}>{selectedCol.sublabel}</Text>
            ) : null}
          </View>
          {modo === 'ambos' ? (
            /* Um PrivacyValue por <Text>: com valores ocultos ele troca os
               children do filho único pela máscara, e uma <View> no lugar do
               <Text> ficaria com texto solto (achado 53-A, 21/11/2026). */
            <View style={styles.selectedValores}>
              <PrivacyValue>
                <Text style={[styles.selectedTotal, { color: theme.up }]}>+ R$ {formatMoney(selectedCol.entradas ?? 0)}</Text>
              </PrivacyValue>
              <PrivacyValue>
                <Text style={[styles.selectedTotal, { color: theme.down }]}>− R$ {formatMoney(selectedCol.saidas ?? 0)}</Text>
              </PrivacyValue>
            </View>
          ) : (
            <PrivacyValue>
              <Text style={[styles.selectedTotal, { color: corDaSerie }]}>R$ {formatMoney(selectedCol.total)}</Text>
            </PrivacyValue>
          )}
        </View>
      )}

      {desenho}

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
  selectedValores: { alignItems: 'flex-end' },
  selectedTotal: {
    color: theme.down,
    fontSize: type.titulo, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
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
    fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
});

/* `memo`: Gráficos já passa `columns` memoizado, e redesenhar o path a cada
   render da tela é trabalho jogado fora. */
export default memo(LineAreaChart);
