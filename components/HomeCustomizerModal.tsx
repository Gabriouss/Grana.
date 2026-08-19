import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, type } from '@/lib/theme';
import {
  HOME_BLOCK_DESCRIPTIONS,
  HOME_BLOCK_ICONS,
  HOME_BLOCK_LABELS,
  layoutDoPreset,
  type HomeBlockConfig,
  type HomePreset,
} from '@/lib/home-layout';
import AppPressable from './AppPressable';
import ToggleSwitch from './ToggleSwitch';
import Sheet from './Sheet';

const PRESETS: { key: HomePreset; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'completo', label: '🌟 Completo', icon: 'grid-outline' },
  { key: 'essencial', label: '⚡ Essencial', icon: 'flash-outline' },
  { key: 'metas', label: '🎯 Metas & Limites', icon: 'trophy-outline' },
];

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

  function aplicarPreset(preset: HomePreset) {
    const novoLayout = layoutDoPreset(preset);
    onChange(novoLayout);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Sheet>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Personalizar Início</Text>
            <Text style={styles.hint}>Escolha quais ferramentas exibir e a ordem do seu painel.</Text>
          </View>
          <AppPressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {/* Presets Rápidos de 1 Toque */}
        <View style={styles.presetSection}>
          <Text style={styles.presetTitle}>Modelos Rápidos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
            {PRESETS.map((p) => (
              <AppPressable
                key={p.key}
                style={styles.presetChip}
                onPress={() => aplicarPreset(p.key)}
              >
                <Text style={styles.presetChipText}>{p.label}</Text>
              </AppPressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
          {config.map((bloco, index) => {
            const iconName = HOME_BLOCK_ICONS[bloco.key] || 'grid-outline';
            const desc = HOME_BLOCK_DESCRIPTIONS[bloco.key] || '';

            return (
              <View key={bloco.key} style={[styles.card, !bloco.visible && styles.cardOff]}>
                {/* Reordenação com Setas */}
                <View style={styles.reorderCol}>
                  <AppPressable
                    onPress={() => mover(index, -1)}
                    disabled={index === 0}
                    hitSlop={6}
                    style={styles.arrowBtn}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={15}
                      color={index === 0 ? theme.rule : theme.inkFaint}
                    />
                  </AppPressable>
                  <AppPressable
                    onPress={() => mover(index, 1)}
                    disabled={index === config.length - 1}
                    hitSlop={6}
                    style={styles.arrowBtn}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={15}
                      color={index === config.length - 1 ? theme.rule : theme.inkFaint}
                    />
                  </AppPressable>
                </View>

                {/* Micro-Ícone do Bloco */}
                <View
                  style={[
                    styles.iconWrap,
                    bloco.visible ? styles.iconWrapActive : styles.iconWrapOff,
                  ]}
                >
                  <Ionicons
                    name={iconName}
                    size={18}
                    color={bloco.visible ? theme.accent2 : theme.inkFaint}
                  />
                </View>

                {/* Textos */}
                <View style={styles.textCol}>
                  <Text style={[styles.label, !bloco.visible && styles.labelOff]}>
                    {HOME_BLOCK_LABELS[bloco.key]}
                  </Text>
                  {desc ? (
                    <Text style={styles.desc} numberOfLines={2}>
                      {desc}
                    </Text>
                  ) : null}
                </View>

                {/* Switch Liga/Desliga */}
                <ToggleSwitch
                  value={bloco.visible}
                  onToggle={() => alternar(index)}
                  label={`Mostrar bloco ${HOME_BLOCK_LABELS[bloco.key]}`}
                />
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <AppPressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Concluir Personalização</Text>
          </AppPressable>
        </View>
      </Sheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  title: {
    color: theme.ink,
    fontSize: type.titulo,
    fontWeight: '700',
  },
  hint: {
    color: theme.inkFaint,
    fontSize: type.nota,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  presetSection: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  presetTitle: {
    color: theme.inkFaint,
    fontSize: type.legenda,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  presetChip: {
    backgroundColor: 'rgba(31,169,141,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(174,255,227,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  presetChipText: {
    color: theme.ink,
    fontSize: type.apoio,
    fontWeight: '500',
  },
  list: {
    maxHeight: 380,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  cardOff: {
    opacity: 0.5,
    backgroundColor: 'transparent',
  },
  reorderCol: {
    alignItems: 'center',
    gap: 2,
  },
  arrowBtn: {
    padding: 2,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(31,169,141,0.18)',
  },
  iconWrapOff: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: theme.ink,
    fontSize: type.apoio,
    fontWeight: '600',
  },
  labelOff: {
    color: theme.inkFaint,
  },
  desc: {
    color: theme.inkFaint,
    fontSize: type.legenda,
    lineHeight: 15,
  },
  footer: {
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  doneBtn: {
    backgroundColor: theme.accent2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#052229',
    fontSize: type.corpo,
    fontWeight: '700',
  },
});
