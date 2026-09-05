import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, theme, type, textStyles } from '@/lib/theme';

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
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <View style={styles.leftCol}>
          {left}
          <View style={styles.texts}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              {eyebrowBadges}
            </View>
            {/* Duas linhas, não uma. Com o teto em 1, "Lançamentos" virava
                "Lança..." assim que a direita do cabeçalho enchia — a palavra
                era mutilada mesmo havendo altura de sobra logo abaixo. Com 2,
                o título continua numa linha só onde cabe (nada muda em tela
                folgada) e QUEBRA em vez de truncar onde aperta. Reticências
                voltam a ser o último recurso, não o primeiro. */}
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </View>
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
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
  /* Regra dura, não negociável: o seletor de carteira e os botões de ação
     NUNCA encolhem e NUNCA saem da tela — só o título/saudação cede espaço,
     até truncar com reticências se precisar. Por isso `right` tem
     `flexShrink: 0` (nem tenta encolher, então nunca corre risco de perder a
     briga por espaço e ficar cortado) e só `leftCol`/`texts` têm
     `flexShrink: 1`.

     `minWidth: 0` em `leftCol`/`texts` é o que faz esse encolhimento
     funcionar de verdade na web: sem ele, o padrão do CSS flexbox é um item
     nunca encolher abaixo do tamanho intrínseco do próprio conteúdo (aqui, o
     texto do título por extenso) — `flexShrink: 1` sozinho não é suficiente,
     e é exatamente essa lacuna que fazia a pílula de carteira estourar a
     borda da tela em celular grande antes desta correção. */
  leftCol: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1, minWidth: 0 },
  texts: { flexShrink: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  eyebrow: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.accent2,
    letterSpacing: 0.5,
  },
  /* Era textStyles.headline (24) — grande demais pro papel que essa linha
     cumpre (é uma saudação/rótulo de tela, não um valor em destaque), e ficava
     ainda mais evidente ao lado dos ícones e da pílula de carteira, que são
     pequenos por design. textStyles.title (20) já existe pra esse papel
     intermediário — reaproveitado em vez de inventar um tamanho novo. */
  title: {
    ...textStyles.title,
    color: theme.ink,
  },
});
