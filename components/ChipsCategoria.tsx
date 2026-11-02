import { ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';
import AppPressable from './AppPressable';
import { fonts, radius, spacing, theme, type, lh } from '@/lib/theme';

export default function ChipsCategoria({ opcoes, selecionada, onSelect, onTodas, keyboardShouldPersistTaps }: {
  opcoes: ReadonlyArray<readonly [string, string]>; selecionada: string | null;
  onSelect: (categoria: string | null) => void; onTodas?: () => void;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
}) {
  if (!opcoes.length) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChipsRow} keyboardShouldPersistTaps={keyboardShouldPersistTaps}>
    <AppPressable onPress={onTodas ?? (() => onSelect(null))} hitSlop={{ top: 7, bottom: 7 }} style={[styles.categoryChip, !selecionada && styles.categoryChipActive]}>
      <Text style={[styles.categoryChipText, !selecionada && styles.categoryChipTextActive]}>Todas</Text>
    </AppPressable>
    {opcoes.map(([name, color]) => {
      const active = selecionada === name;
      return <AppPressable key={name} onPress={() => onSelect(active ? null : name)} hitSlop={{ top: 7, bottom: 7 }} style={[styles.categoryChip, active && styles.categoryChipActive]}>
        <View style={[styles.categoryChipDot, { backgroundColor: color }]} />
        <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{name}</Text>
      </AppPressable>;
    })}
  </ScrollView>;
}
const styles = StyleSheet.create({
  categoryChipsRow: { gap: spacing.icone },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.icone, paddingHorizontal: 10,
    paddingVertical: spacing.icone, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.rule },
  categoryChipActive: { borderColor: theme.ink, backgroundColor: theme.paperRaised },
  categoryChipDot: { width: 7, height: 7, borderRadius: 3.5 },
  categoryChipText: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },
  categoryChipTextActive: { color: theme.ink },
});
