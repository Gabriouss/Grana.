import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, theme, type, textStyles } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';

/**
 * Cabeçalho padrão das telas principais. Antes cada tela tinha seu próprio
 * padding, borda, peso e família de fonte para a mesma dupla eyebrow+título —
 * quatro variações para a mesma peça. `children` recebe conteúdo extra que
 * fica abaixo da linha eyebrow/título (ex.: o resumo e o MonthSelector de
 * Contas), sem herdar o `alignItems: center` da linha de cima.
 */
export default function ScreenHeader({
  left,
  eyebrow,
  eyebrowBadges,
  title,
  right,
  children,
}: {
  left?: ReactNode;
  eyebrow: string;
  /** Selos curtos ("exemplo", "oculto") ao lado do eyebrow — ex.: modo demo na Início. */
  eyebrowBadges?: ReactNode;
  title: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  /* Era um limiar próprio (`width < 480`), diferente do resto do app — que
     usa 768 (lib/breakpoints.ts) pra decidir o que vira "uma coluna,
     empilhado". Num celular grande com zoom/densidade de tela reduzida (comum
     em aparelhos Android maiores), a largura CSS relatada passa de 480 sem
     chegar a 768: o cabeçalho ficava no modo "linha única" achando que tinha
     tela de tablet, e o seletor de carteira estourava a borda direita da
     tela — reportado por usuário via print. Unificado com o mesmo corte que
     toda folha, sidebar e navegação do app já usa. */
  const { ehCompacto: compacto } = useBreakpoint();

  return (
    <View style={styles.header}>
      <View style={[styles.row, compacto && styles.rowCompacta]}>
        <View style={[styles.leftCol, compacto && styles.leftColCompacta]}>
          {left}
          <View style={styles.texts}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              {eyebrowBadges}
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </View>
        </View>
        {right ? <View style={[styles.right, compacto && styles.rightCompacta]}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  leftCol: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  texts: { flexShrink: 1 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /* `flexShrink` nos dois lados, e nunca `flexWrap`: a regra do cabeçalho é
     que os botões da tela e o seletor de carteira fiquem SEMPRE na mesma linha
     do título, à direita. Com wrap, telas com muitos botões (Lançamentos tem
     três mais a carteira) jogavam o seletor para uma segunda linha. Deixando
     os dois lados encolherem, quem cede espaço primeiro é o título — que já
     tem numberOfLines={1} e corta com reticências. */
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  rowCompacta: { flexWrap: 'wrap', alignItems: 'stretch' },
  leftColCompacta: { width: '100%' },
  rightCompacta: { width: '100%', justifyContent: 'flex-end', flexShrink: 0 },
  eyebrow: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.accent2,
    letterSpacing: 0.5,
  },
  title: {
    ...textStyles.headline,
    color: theme.ink,
  },
});
