import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type, touchTarget } from '@/lib/theme';
import { formatMonthYear } from '@/lib/format';
import AppPressable from './AppPressable';

type MonthSelectorProps = {
  year: number;
  month: number; // 0-11
  onChange: (year: number, month: number) => void;
};

export default function MonthSelector({ year, month, onChange }: MonthSelectorProps) {
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  function handlePrev() {
    if (month === 0) {
      onChange(year - 1, 11);
    } else {
      onChange(year, month - 1);
    }
  }

  function handleNext() {
    if (month === 11) {
      onChange(year + 1, 0);
    } else {
      onChange(year, month + 1);
    }
  }

  function handleResetCurrent() {
    onChange(now.getFullYear(), now.getMonth());
  }

  return (
    <View style={styles.container}>
      <AppPressable
        style={({ hovered }) => [styles.arrowBtn, hovered && styles.btnHover]}
        onPress={handlePrev}
        hitSlop={12}
        accessibilityLabel="Mês anterior"
      >
        <Ionicons name="chevron-back" size={20} color={theme.ink} />
      </AppPressable>

      <AppPressable
        style={({ hovered }) => [styles.centerPill, hovered && styles.btnHover]}
        onPress={handleResetCurrent}
        accessibilityLabel={`${formatMonthYear(year, month)}. Voltar para o mês atual`}
      >
        <Text style={styles.monthText}>{formatMonthYear(year, month)}</Text>
        {isCurrentMonth ? (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Atual</Text>
          </View>
        ) : (
          <Ionicons name="refresh-outline" size={14} color={theme.inkFaint} style={{ marginLeft: 6 }} />
        )}
      </AppPressable>

      <AppPressable
        style={({ hovered }) => [styles.arrowBtn, hovered && styles.btnHover]}
        onPress={handleNext}
        hitSlop={12}
        accessibilityLabel="Próximo mês"
      >
        <Ionicons name="chevron-forward" size={20} color={theme.ink} />
      </AppPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.paperRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.rule,
    marginBottom: spacing.md,
  },
  arrowBtn: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  btnHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  monthText: {
    color: theme.ink,
    fontSize: type.corpo,
    letterSpacing: 0.3, fontFamily: fonts.regular },
  currentBadge: {
    backgroundColor: theme.accent + '25',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  currentBadgeText: {
    color: theme.accent,
    fontSize: type.micro, fontFamily: fonts.regular },
});
