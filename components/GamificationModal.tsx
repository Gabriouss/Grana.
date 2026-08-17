import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radius, spacing, theme } from '@/lib/theme';
import type { BadgeCategory, GamificationState } from '@/lib/gamification';
import AppPressable from './AppPressable';
import BadgeCard from './BadgeCard';
import SegmentedTabs from './SegmentedTabs';
import { hapticSuccess } from '@/lib/haptics';

type Props = {
  visible: boolean;
  onClose: () => void;
  state: GamificationState;
};

type FilterType = 'all' | 'unlocked' | 'locked';

export default function GamificationModal({ visible, onClose, state }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedCategory, setSelectedCategory] = useState<BadgeCategory | 'all'>('all');

  const {
    streak,
    score,
    mastery,
    nextMastery,
    masteryProgress,
    factors,
    weekActivity,
    badges,
    unlockedBadgesCount,
    totalBadgesCount,
  } = state;

  const filteredBadges = badges.filter((b) => {
    if (filter === 'unlocked' && !b.unlocked) return false;
    if (filter === 'locked' && b.unlocked) return false;
    if (selectedCategory !== 'all' && b.category !== selectedCategory) return false;
    return true;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>saúde & progresso</Text>
              <Text style={styles.title}>Maestria Financeira</Text>
            </View>
            <AppPressable
              onPress={() => {
                hapticSuccess();
                onClose();
              }}
              style={({ hovered }) => [styles.closeBtn, hovered && styles.closeBtnHover]}
            >
              <Ionicons name="close" size={20} color={theme.ink} />
            </AppPressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Card Principal de Score & Nível */}
            <View style={styles.scoreHeroCard}>
              <View style={styles.scoreHeroTop}>
                <View style={styles.scoreCircle}>
                  <Text style={styles.scorePoints}>{score}</Text>
                  <Text style={styles.scorePointsLabel}>pontos</Text>
                </View>
                <View style={styles.scoreHeroInfo}>
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelBadgeText}>NÍVEL {mastery.level}</Text>
                  </View>
                  <Text style={styles.masteryTitle}>{mastery.title}</Text>
                  <Text style={styles.masteryDesc}>{mastery.description}</Text>
                </View>
              </View>

              {/* Barra de Progresso do Nível */}
              <View style={styles.levelProgressSection}>
                <View style={styles.levelProgressLabels}>
                  <Text style={styles.levelProgressLabel}>
                    {nextMastery ? `Rumo a ${nextMastery.title}` : 'Nível Máximo Alcançado!'}
                  </Text>
                  <Text style={styles.levelProgressPct}>{Math.round(masteryProgress * 100)}%</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.round(masteryProgress * 100)}%` }]} />
                </View>
                {nextMastery && (
                  <Text style={styles.nextLevelRemaining}>
                    Faltam {nextMastery.minScore - score} pontos para o Nível {nextMastery.level}
                  </Text>
                )}
              </View>
            </View>

            {/* Ritmo Semanal */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionEmoji}>🔥</Text>
                  <Text style={styles.sectionTitle}>Ritmo da Semana</Text>
                </View>
                <Text style={styles.streakCountBadge}>
                  {streak} {streak === 1 ? 'dia ativo' : 'dias em dia'}
                </Text>
              </View>

              <View style={styles.weekGrid}>
                {weekActivity.map((day, idx) => (
                  <View key={idx} style={styles.dayGridCol}>
                    <View
                      style={[
                        styles.dayCircle,
                        day.active && styles.dayCircleActive,
                        day.isToday && styles.dayCircleToday,
                      ]}
                    >
                      {day.active ? (
                        <Ionicons name="checkmark" size={14} color="#052229" />
                      ) : (
                        <View style={[styles.dayDot, day.isToday && styles.dayDotToday]} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.dayLabel,
                        day.active && styles.dayLabelActive,
                        day.isToday && styles.dayLabelToday,
                      ]}
                    >
                      {day.dayName}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Fatores do Score */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionEmoji}>📊</Text>
                  <Text style={styles.sectionTitle}>Composição do seu Score</Text>
                </View>
                <Text style={styles.scoreTotalLabel}>{score}/1000 pts</Text>
              </View>

              <View style={styles.factorsList}>
                {factors.map((factor, index) => (
                  <View key={index} style={styles.factorItem}>
                    <View style={styles.factorTopRow}>
                      <Text style={styles.factorLabel}>{factor.label}</Text>
                      <Text style={styles.factorPoints}>
                        {factor.points}/{factor.maxPoints} pts
                      </Text>
                    </View>
                    <View style={styles.factorProgressBarBg}>
                      <View
                        style={[
                          styles.factorProgressBarFill,
                          {
                            width: `${Math.round((factor.points / factor.maxPoints) * 100)}%`,
                            backgroundColor:
                              factor.status === 'positive'
                                ? theme.up
                                : factor.status === 'neutral'
                                ? theme.accent2
                                : theme.down,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.factorDesc}>{factor.description}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Mural de Conquistas */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionEmoji}>🏆</Text>
                  <Text style={styles.sectionTitle}>Mural de Conquistas</Text>
                </View>
                <Text style={styles.badgeCountBadge}>
                  {unlockedBadgesCount} de {totalBadgesCount}
                </Text>
              </View>

              {/* Filtro de Status */}
              <View style={{ marginBottom: spacing.md }}>
                <SegmentedTabs
                  options={[
                    { key: 'all', label: `Todas (${totalBadgesCount})` },
                    { key: 'unlocked', label: `Obtidas (${unlockedBadgesCount})` },
                    { key: 'locked', label: `Pendentes (${totalBadgesCount - unlockedBadgesCount})` },
                  ]}
                  value={filter}
                  onChange={(v) => setFilter(v as FilterType)}
                />
              </View>

              {/* Grade de Conquistas */}
              <View style={styles.badgesGrid}>
                {filteredBadges.map((badge) => (
                  <View key={badge.id} style={styles.badgeWrapper}>
                    <BadgeCard badge={badge} />
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    minHeight: '60%',
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  eyebrow: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.accent2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.regular,
    fontSize: 20,
    fontWeight: '700',
    color: theme.ink,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.rule,
  },
  closeBtnHover: {
    borderColor: theme.ruleStrong,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  scoreHeroCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(174,255,227,0.25)',
    gap: spacing.md,
  },
  scoreHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(174,255,227,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.accent2,
  },
  scorePoints: {
    fontFamily: fonts.regular,
    fontSize: 22,
    fontWeight: '700',
    color: theme.accent2,
  },
  scorePointsLabel: {
    fontFamily: fonts.regular,
    fontSize: 9,
    color: theme.inkSoft,
    textTransform: 'uppercase',
  },
  scoreHeroInfo: {
    flex: 1,
    gap: 2,
  },
  levelBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(174,255,227,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  levelBadgeText: {
    fontFamily: fonts.regular,
    fontSize: 9,
    fontWeight: '700',
    color: theme.accent2,
  },
  masteryTitle: {
    fontFamily: fonts.regular,
    fontSize: 18,
    fontWeight: '700',
    color: theme.ink,
  },
  masteryDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: theme.inkFaint,
    lineHeight: 16,
  },
  levelProgressSection: {
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.rule,
  },
  levelProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelProgressLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkSoft,
    fontWeight: '600',
  },
  levelProgressPct: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.accent2,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.accent2,
    borderRadius: radius.pill,
  },
  nextLevelRemaining: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: theme.inkFaint,
  },
  sectionCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.rule,
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionEmoji: {
    fontSize: 16,
  },
  sectionTitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    fontWeight: '700',
    color: theme.ink,
  },
  streakCountBadge: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.accent2,
    fontWeight: '600',
    backgroundColor: 'rgba(174,255,227,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeCountBadge: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkSoft,
    fontWeight: '600',
  },
  scoreTotalLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: theme.accent2,
    fontWeight: '700',
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayGridCol: {
    alignItems: 'center',
    gap: 6,
  },
  dayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(174,255,227,0.06)',
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
  dayLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkFaint,
  },
  dayLabelActive: {
    color: theme.accent2,
    fontWeight: '700',
  },
  dayLabelToday: {
    color: theme.ink,
    fontWeight: '700',
  },
  factorsList: {
    gap: spacing.md,
  },
  factorItem: {
    gap: 4,
  },
  factorTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  factorLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: theme.ink,
    fontWeight: '600',
  },
  factorPoints: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkSoft,
  },
  factorProgressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  factorProgressBarFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  factorDesc: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: theme.inkFaint,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeWrapper: {
    width: '48%',
    flexGrow: 1,
  },
});
