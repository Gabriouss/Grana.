import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, type, fonts, touchTarget } from '@/lib/theme';
import AppPressable from './AppPressable';

/**
 * Botão de ação do cabeçalho — o par visual do WalletPill.
 *
 * Existe pelo mesmo motivo que o WalletPill: a linha do cabeçalho tem uma
 * gramática ("eyebrow + título à esquerda, ações em pílula à direita, carteira
 * por último") e, sem um componente, cada tela reinventava a pílula. Havia
 * quatro tratamentos para a mesma peça — Crédito e Lançamentos com pílula
 * completa, Gráficos com cantos quadrados sem fundo, e Início com o ícone
 * solto sem container nenhum. Mesma geometria do WalletPill de propósito:
 * lado a lado, os dois têm que parecer a mesma família.
 */
export default function HeaderAction({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Sem rótulo, o botão vira só o ícone num alvo quadrado — mesma altura. */
  label?: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <AppPressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ hovered }) => [
        styles.base,
        label ? styles.comRotulo : styles.soIcone,
        hovered && styles.hover,
      ]}
    >
      <Ionicons name={icon} size={16} color={theme.accent2} />
      {label ? <Text style={styles.texto}>{label}</Text> : null}
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
    minHeight: touchTarget,
    justifyContent: 'center',
  },
  /* Mesmo paddingVertical do WalletPill: as duas pílulas precisam fechar na
     mesma altura, senão a linha do cabeçalho fica desalinhada. */
  comRotulo: { paddingVertical: 6, paddingHorizontal: spacing.md },
  /* Sem rótulo o botão é um CÍRCULO, e círculo exige largura igual à altura.
     Antes eram só paddings de 6: o ícone de 16 dava 28 de largura, enquanto o
     `minHeight: touchTarget` do `base` esticava a altura para 44 — com
     `borderRadius: pill` o resultado era uma cápsula vertical de 28×44, não um
     círculo. Fixar os dois lados em `touchTarget` resolve a forma e o alvo de
     toque de uma vez; o padding sai porque `alignItems`/`justifyContent` do
     `base` já centralizam o ícone. */
  soIcone: { width: touchTarget, height: touchTarget, paddingVertical: 0, paddingHorizontal: 0 },
  hover: { borderColor: theme.accent2 },
  texto: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },
});
