import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppPressable from './AppPressable';
import { fonts, radius, spacing, theme } from '@/lib/theme';
import type { GamificationState } from '@/lib/gamification';

type Props = {
  state: GamificationState;
  onPress: () => void;
};

export default function StreakBanner({ state, onPress }: Props) {
  const { streak, score, mastery, weekActivity } = state;

  return (
    <AppPressable
      style={({ hovered }) => [styles.container, hovered && styles.containerHover]}
      onPress={onPress}
    >
      <View style={styles.topRow}>
        {/* Lado Esquerdo: Streak e Score */}
        <View style={styles.streakCol}>
          <View style={styles.streakBadge}>
            <Text style={styles.fireEmoji}>🔥</Text>
            <Text style={styles.streakNumber}>{streak}</Text>
            <Text style={styles.streakLabel}>{streak === 1 ? 'dia ativo' : 'dias em dia'}</Text>
          </View>
          <Text style={styles.masteryText} numberOfLines={1}>
            {mastery.title} • <Text style={styles.scoreText}>{score} pts</Text>
          </Text>
        </View>

        {/* Lado Direito: Acesso e Chevron */}
        <View style={styles.actionCol}>
          <Text style={styles.actionText}>Maestria</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.accent2} />
        </View>
      </View>

      {/* Linha dos 7 Dias da Semana Atual */}
      <View style={styles.weekRow}>
        {weekActivity.map((day, idx) => (
          <View key={idx} style={styles.dayItem}>
            <View
              style={[
                styles.dayCircle,
                day.active && styles.dayCircleActive,
                day.isToday && styles.dayCircleToday,
              ]}
            >
              {day.active ? (
                <Ionicons name="checkmark" size={12} color="#052229" />
              ) : (
                <View style={[styles.dayDot, day.isToday && styles.dayDotToday]} />
              )}
            </View>
            <Text
              style={[
                styles.dayName,
                day.active && styles.dayNameActive,
                day.isToday && styles.dayNameToday,
              ]}
            >
              {day.dayName}
            </Text>
          </View>
        ))}
      </View>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.rule,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  containerHover: {
    borderColor: theme.ruleStrong,
    backgroundColor: '#0f3842',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakCol: {
    gap: 2,
    flex: 1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fireEmoji: {
    fontSize: 16,
  },
  streakNumber: {
    fontFamily: fonts.regular,
    fontSize: 15,
    fontWeight: '700',
    color: theme.accent2,
  },
  streakLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: theme.inkSoft,
  },
  masteryText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkFaint,
  },
  scoreText: {
    color: theme.accent2,
    fontWeight: '600',
  },
  actionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(175,255,227,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 2,
  },
  actionText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.accent2,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.rule,
  },
  dayItem: {
    alignItems: 'center',
    gap: 4,
  },
  dayCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(175,255,227,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCircleActive: {
    backgroundColor: theme.accent2,
    borderColor: theme.accent2,
  },
  dayCircleToday: {
    borderColor: theme.accent2,
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.inkFaint,
    opacity: 0.5,
  },
  dayDotToday: {
    backgroundColor: theme.accent2,
    opacity: 1,
  },
  dayName: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: theme.inkFaint,
  },
  dayNameActive: {
    color: theme.accent2,
    fontWeight: '600',
  },
  dayNameToday: {
    color: theme.ink,
    fontWeight: '700',
  },
});
