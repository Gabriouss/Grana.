import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, radius, spacing, theme, touchTarget, type } from '@/lib/theme';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import Sheet from './Sheet';

/** Confirmação ou aviso curto, com o mesmo painel acessível das outras janelas. */
export default function AppDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = false,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm?: () => void;
  onClose: () => void;
  destructive?: boolean;
}) {
  function confirmar() {
    onClose();
    onConfirm?.();
  }

  return (
    <AppModal visible={visible} transparent onRequestClose={onClose}>
      <Sheet centered onClose={onClose}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <AppPressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          {onConfirm && (
            <AppPressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancelar</Text>
            </AppPressable>
          )}
          <AppPressable
            style={[styles.confirm, destructive && styles.danger]}
            onPress={confirmar}
            accessibilityRole="button"
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </AppPressable>
        </View>
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, minWidth: 0, color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  closeBtn: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  message: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, padding: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  cancelText: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.regular },
  confirm: { flexGrow: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: theme.ink, alignItems: 'center' },
  danger: { backgroundColor: theme.danger },
  confirmText: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
});
