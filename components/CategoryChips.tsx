import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES } from '@/lib/types';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';

export default function CategoryChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {CATEGORIES.map((c) => {
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
