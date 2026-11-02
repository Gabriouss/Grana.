import { StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppPressable from './AppPressable';
import { fonts, radius, spacing, theme, type, hitSlopPara } from '@/lib/theme';

export default function CampoBusca({ value, onChangeText }: { value: string; onChangeText: (texto: string) => void }) {
  return <View style={styles.searchRow}>
    <Ionicons name="search-outline" size={16} color={theme.inkFaint} />
    <TextInput accessibilityLabel="Buscar lançamentos" style={styles.searchInput}
      placeholder="Buscar por descrição ou categoria" placeholderTextColor={theme.inkFaint}
      value={value} onChangeText={onChangeText} returnKeyType="search" />
    {value.length > 0 && <AppPressable onPress={() => onChangeText('')} hitSlop={hitSlopPara(16)} accessibilityLabel="Limpar busca">
      <Ionicons name="close-circle" size={16} color={theme.inkFaint} />
    </AppPressable>}
  </View>;
}
const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: theme.paperRaised,
    borderRadius: radius.md, borderWidth: 1, borderColor: theme.rule, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  searchInput: { flex: 1, color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
});
