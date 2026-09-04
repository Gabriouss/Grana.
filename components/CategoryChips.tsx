import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES } from '@/lib/types';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';

export default function CategoryChips({
  value,
  onChange,
  extras = [],
}: {
  value: string;
  onChange: (name: string) => void;
  /** Categorias criadas pela pessoa (fora das 9 padrão). Sem passar isto, uma
   *  categoria custom RECONHECIDA no texto — por voz ou por comprovante
   *  colado — ficava selecionada sem chip nenhum na tela pra mostrar qual era,
   *  e tocar em qualquer outra apagava a escolha sem jeito de voltar. */
  extras?: { name: string; color: string }[];
}) {
  /* As 9 fixas primeiro, na ordem de sempre; as da pessoa depois. Uma custom
     com nome repetido de padrão não duplica o chip. */
  const nomesPadrao = new Set(CATEGORIES.map((c) => c.name));
  const lista = [...CATEGORIES, ...extras.filter((c) => !nomesPadrao.has(c.name))];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {lista.map((c) => {
        const selected = c.name === value;
        return (
          <AppPressable
            key={c.name}
            onPress={() => onChange(c.name)}
            style={({ hovered }) => [
              styles.chip,
              selected && { borderColor: theme.ink, backgroundColor: theme.paperRaised },
              hovered && !selected && styles.chipHover,
            ]}
          >
            <View style={[styles.dot, { backgroundColor: c.color }]} />
            <Text style={[styles.label, selected && { color: theme.ink }]}>{c.name}</Text>
          </AppPressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  chipHover: { backgroundColor: theme.paperRaised, borderColor: theme.ruleStrong },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
});
