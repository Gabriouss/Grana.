import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing } from '@/lib/theme';
import { HOME_BLOCK_LABELS, type HomeBlockConfig } from '@/lib/home-layout';
import AppPressable from './AppPressable';
import ToggleSwitch from './ToggleSwitch';
import Sheet from './Sheet';

/**
 * Liga/desliga e reordena os blocos customizáveis da Home. Reordenação por
 * setas (sem biblioteca de drag-and-drop) — simples e sem dependência nova.
 * `config` já vem na ordem de exibição; `onChange` recebe a lista inteira
 * a cada alteração, e quem chama decide quando persistir.
 */
export default function HomeCustomizerModal({
  visible,
  config,
  onChange,
  onClose,
}: {
  visible: boolean;
  config: HomeBlockConfig[];
  onChange: (novo: HomeBlockConfig[]) => void;
  onClose: () => void;
}) {
  function mover(index: number, direcao: -1 | 1) {
    const alvo = index + direcao;
    if (alvo < 0 || alvo >= config.length) return;
    const novo = config.slice();
    [novo[index], novo[alvo]] = [novo[alvo], novo[index]];
    onChange(novo);
  }

  function alternar(index: number) {
    const novo = config.slice();
    novo[index] = { ...novo[index], visible: !novo[index].visible };
    onChange(novo);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Sheet>
        <View style={styles.header}>
          <Text style={styles.title}>Personalizar Início</Text>
          <AppPressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>
        <Text style={styles.hint}>Ligue, desligue e reordene os blocos que aparecem na tela inicial.</Text>

        <View style={{ gap: 8 }}>
          {config.map((bloco, index) => (
            <View key={bloco.key} style={[styles.row, !bloco.visible && styles.rowOff]}>
              <View style={styles.arrows}>
                <AppPressable onPress={() => mover(index, -1)} disabled={index === 0} hitSlop={8}>
                  <Ionicons name="chevron-up" size={16} color={index === 0 ? theme.rule : theme.inkFaint} />
                </AppPressable>
                <AppPressable onPress={() => mover(index, 1)} disabled={index === config.length - 1} hitSlop={8}>
                  <Ionicons name="chevron-down" size={16} color={index === config.length - 1 ? theme.rule : theme.inkFaint} />
                </AppPressable>
              </View>
              <Text style={[styles.rowLabel, !bloco.visible && styles.rowLabelOff]} numberOfLines={2}>
                {HOME_BLOCK_LABELS[bloco.key]}
              </Text>
              <ToggleSwitch value={bloco.visible} onToggle={() => alternar(index)} />
            </View>
          ))}
        </View>
      </Sheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.ink, fontSize: 17 },
  hint: { color: theme.inkFaint, fontSize: 12, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.sm,
  },
  rowOff: { opacity: 0.55 },
  arrows: { gap: 2 },
  rowLabel: { flex: 1, color: theme.ink, fontSize: 12.5 },
  rowLabelOff: { color: theme.inkFaint },
});
