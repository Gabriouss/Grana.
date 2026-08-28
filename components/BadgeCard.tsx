import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AppPressable from './AppPressable';
import { fonts, radius, spacing, theme, type } from '@/lib/theme';
import type { Badge } from '@/lib/gamification';

type Props = {
  badge: Badge;
  onPress?: () => void;
};

export default function BadgeCard({ badge, onPress }: Props) {
  const { title, description, emoji, unlocked, progress, progressLabel } = badge;

  return (
    <AppPressable
      style={({ hovered }) => [
        styles.card,
        unlocked ? styles.cardUnlocked : styles.cardLocked,
        hovered && styles.cardHover,
      ]}
      onPress={onPress}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconContainer, unlocked ? styles.iconUnlocked : styles.iconLocked]}>
          <Text style={[styles.emoji, !unlocked && styles.emojiLocked]}>{emoji}</Text>
        </View>
        <View style={styles.badgeStatus}>
          <Text style={[styles.statusText, unlocked ? styles.statusUnlocked : styles.statusLocked]}>
            {unlocked ? 'Conquistado' : progressLabel}
          </Text>
        </View>
      </View>

      <Text style={[styles.title, !unlocked && styles.titleLocked]} numberOfLines={1}>
        {title}
      </Text>

      <Text style={styles.description} numberOfLines={2}>
        {description}
      </Text>

      {!unlocked && (
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      )}
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    gap: 6,
    flex: 1,
    minWidth: 150,
  },
  cardUnlocked: {
    borderColor: 'rgba(174,255,227,0.3)',
    backgroundColor: theme.paperSelected,
  },
  cardLocked: {
    borderColor: theme.rule,
    opacity: 0.8,
  },
  cardHover: {
    borderColor: theme.accent2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnlocked: {
    backgroundColor: 'rgba(174,255,227,0.15)',
  },
  iconLocked: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  emoji: {
    fontSize: type.titulo, fontFamily: fonts.regular },
  emojiLocked: {
    opacity: 0.4,
  },
  badgeStatus: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  statusText: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
  },
  statusUnlocked: {
    color: theme.accent2,
  },
  statusLocked: {
    color: theme.inkFaint,
  },
  title: {
    fontFamily: fonts.regular,
    fontSize: type.apoio,
    color: theme.ink,
  },
  titleLocked: {
    color: theme.inkSoft,
  },
  description: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkFaint,
    lineHeight: 15,
  },
  progressBarBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.accent2,
    borderRadius: radius.pill,
  },
});
