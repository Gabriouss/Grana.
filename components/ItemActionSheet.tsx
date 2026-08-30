import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppModal from './AppModal';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { useSheetFlutuante } from '@/lib/breakpoints';
import AppPressable from './AppPressable';
import AccessibleModalPanel from './AccessibleModalPanel';

export default function ItemActionSheet({
  visible,
  title,
  onClose,
  onEdit,
  onDelete,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { scrimStyle, sheetStyle } = useSheetFlutuante();
  return (
    <AppModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.modalScrim, scrimStyle]} onPress={onClose}>
        <AccessibleModalPanel ativo={visible} style={[styles.sheet, sheetStyle]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <AppPressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <AppPressable
            style={({ hovered }) => [styles.actionBtn, hovered && styles.actionBtnHover]}
            onPress={() => {
              onClose();
              onEdit();
            }}
          >
            <Ionicons name="create-outline" size={20} color={theme.ink} />
            <Text style={styles.actionText}>Editar</Text>
          </AppPressable>

          <AppPressable
            style={({ hovered }) => [styles.actionBtn, hovered && styles.actionBtnHover]}
            onPress={() => {
              onClose();
              onDelete();
            }}
          >
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
            {/* `theme.danger`, não o hex cru que estava aqui. `#bb6b60` é a cor
                da categoria Alimentação e também o `saidaBorda` do seletor, e
                dava 3,74:1 sobre esta superfície, abaixo do AA. O token de
                perigo entrega 5,62:1 e existe exatamente para este papel: o
                comentário que o criou em lib/theme.ts conta que ele nasceu
                porque uma tela já tinha cometido esta mesma troca. */}
            <Text style={[styles.actionText, { color: theme.danger }]}>Excluir</Text>
          </AppPressable>
        </AccessibleModalPanel>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.paperRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  actionBtnHover: { backgroundColor: theme.paper },
  actionText: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
});
