import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/lib/tab-bar';
import { colunaConteudo } from '@/lib/breakpoints';
import { Ionicons } from '@expo/vector-icons';
import { fetchBills, fetchBudgets, fetchGamificationHistoricalSummary, fetchTransactions } from '@/lib/data';
import { getGamificationState, type BadgeCategory, type GamificationState } from '@/lib/gamification';
import { fetchGamification } from '@/lib/goals';
import { calcularLevelState, type LevelState } from '@/lib/gamification-infinite';
import { hapticTap } from '@/lib/haptics';
import { fonts, radius, spacing, theme, screenRhythm, card as cardTokens, type } from '@/lib/theme';
import { useDemo } from '@/lib/demo-context';
import { DEMO_BILLS, DEMO_BUDGETS, DEMO_LIFETIME_XP, DEMO_TRANSACTIONS } from '@/lib/demo-data';
import BadgeCard from '@/components/BadgeCard';
import SegmentedTabs from '@/components/SegmentedTabs';
import AppPressable from '@/components/AppPressable';
import ScreenHeader from '@/components/ScreenHeader';
import WalletPickerModal from '@/components/WalletPickerModal';
import WalletPill from '@/components/WalletPill';

type FilterType = 'all' | 'unlocked' | 'locked';

export default function DesafiosScreen() {
  const { paddingConteudo } = useTabBarInset();
  const { isDemoMode } = useDemo();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<GamificationState | null>(null);
  const [level, setLevel] = useState<LevelState>(calcularLevelState(0));
  const [filter, setFilter] = useState<FilterType>('all');
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (isDemoMode) {
      const gState = getGamificationState(DEMO_TRANSACTIONS, DEMO_BILLS, DEMO_BUDGETS);
      setState(gState);
      setLevel(calcularLevelState(DEMO_LIFETIME_XP));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [tx, b, bg, historical] = await Promise.all([
        fetchTransactions({ sinceDays: 45 }),
        fetchBills({ status: 'due' }),
        fetchBudgets(),
        fetchGamificationHistoricalSummary().catch(() => null),
      ]);
      if (historical) {
        setState(getGamificationState(tx, b, bg, historical));
      } else {
        // Compatibilidade temporária com bancos ainda sem a função nova.
        const [allTx, allBills] = await Promise.all([fetchTransactions(), fetchBills()]);
        setState(getGamificationState(allTx, allBills, bg));
      }
    } catch {
      // Falha graciosa
    }

    // Separado do bloco acima de propósito: user_gamification é uma tabela
    // mais nova que pode ainda não existir num banco que não rodou o SQL
    // mais recente — se isso lançasse dentro do mesmo try, o catch pegaria
    // o erro antes de `setState` rodar e a tela ficaria presa no spinner
    // pra sempre (loading só sai do true quando `state` deixa de ser null).
    try {
      setLevel(calcularLevelState((await fetchGamification()).lifetime_xp));
    } catch {
      setLevel(calcularLevelState(0));
    }

    setLoading(false);
    setRefreshing(false);
  }, [isDemoMode]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  if (loading || !state) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.ink} />
      </View>
    );
  }

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
    if (filter === 'unlocked') return b.unlocked;
    if (filter === 'locked') return !b.unlocked;
    return true;
  });

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        eyebrow="Saúde & consistência"
        title="Desafios"
        right={<WalletPill onPress={() => setWalletModalOpen(true)} />}
      />

      <WalletPickerModal visible={walletModalOpen} onClose={() => setWalletModalOpen(false)} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, colunaConteudo, { paddingBottom: paddingConteudo }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={theme.ink}
          />
        }
      >
        {/* Card Principal de Score & Nível */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.scoreCircle}>
              <Text style={styles.scorePoints}>{score}</Text>
              <Text style={styles.scorePointsLabel}>pontos</Text>
            </View>
            <View style={styles.heroInfo}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>FAIXA {mastery.level}</Text>
              </View>
              <Text style={styles.masteryTitle}>{mastery.title}</Text>
              <Text style={styles.masteryDesc}>{mastery.description}</Text>
            </View>
          </View>

          {/* Barra de Progresso */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>
                {nextMastery ? `Rumo a ${nextMastery.title}` : 'Nível Máximo Alcançado!'}
              </Text>
              <Text style={styles.progressPct}>{Math.round(masteryProgress * 100)}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.round(masteryProgress * 100)}%` }]} />
            </View>
            {nextMastery && (
              <Text style={styles.remainingText}>
                Faltam {nextMastery.minScore - score} pontos para a Faixa {nextMastery.level}
              </Text>
            )}
          </View>
        </View>

        {/* Level Up Infinito (XP vitalício, separado do Score 0-1000 acima) */}
        <View style={styles.card}>
          <View style={styles.cardHeadRow}>
            <View style={styles.titleWithIcon}>
              <Text style={styles.fireEmoji}>{level.elo.emoji}</Text>
              <Text style={styles.cardTitle}>Progresso de metas</Text>
            </View>
            <Text style={styles.scoreTotalLabel}>{`${level.xp} XP`}</Text>
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>
              Nível {level.level} · {level.elo.title}
            </Text>
            <Text style={styles.progressPct}>{Math.round(level.progressoLevel * 100)}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.round(level.progressoLevel * 100)}%` }]} />
          </View>
          {level.nextElo && (
            <Text style={styles.remainingText}>{`Rumo ao elo ${level.nextElo.title}`}</Text>
          )}
          <Text style={styles.levelHint}>Este nível é separado da saúde financeira acima. O XP vem de criar cofrinhos, guardar dinheiro e bater metas — nunca diminui.</Text>
        </View>

        {/* Ritmo Semanal */}
        <View style={styles.card}>
          <View style={styles.cardHeadRow}>
            <View style={styles.titleWithIcon}>
              <Text style={styles.fireEmoji}>🔥</Text>
              <Text style={styles.cardTitle}>Ritmo da Semana</Text>
            </View>
            <Text style={styles.streakBadgeText}>
              {streak} {streak === 1 ? 'dia ativo' : 'dias em dia'}
            </Text>
          </View>

          <View style={styles.weekRow}>
            {weekActivity.map((day, idx) => (
              <View key={idx} style={styles.dayCol}>
                <View
                  style={[
                    styles.dayCircle,
                    day.active && styles.dayCircleActive,
                    day.isToday && styles.dayCircleToday,
                  ]}
                >
                  {day.active ? (
                    <Ionicons name="checkmark" size={12} color={theme.paper} />
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
        </View>

        {/* Fatores do Score */}
        <View style={styles.card}>
          <View style={styles.cardHeadRow}>
            <View style={styles.titleWithIcon}>
              <Text style={styles.fireEmoji}>📊</Text>
              <Text style={styles.cardTitle}>Composição do seu Score</Text>
            </View>
            <Text style={styles.scoreTotalLabel}>{score}/1000 pts</Text>
          </View>

          <View style={styles.factorsList}>
            {factors.map((f, i) => (
              <View key={i} style={styles.factorItem}>
                <View style={styles.factorTop}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  <Text style={styles.factorPoints}>{`${f.points}/${f.maxPoints} pts`}</Text>
                </View>
                <View style={styles.factorBarBg}>
                  <View
                    style={[
                      styles.factorBarFill,
                      {
                        width: `${Math.round((f.points / f.maxPoints) * 100)}%`,
                        backgroundColor:
                          f.status === 'positive' ? theme.up : f.status === 'neutral' ? theme.accent2 : theme.down,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.factorDesc}>{f.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Mural de Conquistas */}
        <View style={styles.card}>
          <View style={styles.cardHeadRow}>
            <View style={styles.titleWithIcon}>
              <Text style={styles.fireEmoji}>🏆</Text>
              <Text style={styles.cardTitle}>Mural de Conquistas</Text>
            </View>
            <Text style={styles.badgeRatioText}>{`${unlockedBadgesCount} de ${totalBadgesCount}`}</Text>
          </View>

          <View style={{ marginBottom: spacing.sm }}>
            <SegmentedTabs
              options={[
                { key: 'all', label: `Todas (${totalBadgesCount})` },
                { key: 'unlocked', label: `Obtidas (${unlockedBadgesCount})` },
                { key: 'locked', label: `Pendentes (${totalBadgesCount - unlockedBadgesCount})` },
              ]}
              value={filter}
              onChange={(v) => {
                hapticTap();
                setFilter(v as FilterType);
              }}
            />
          </View>

          <View style={styles.badgesGrid}>
            {filteredBadges.map((b) => (
              <View key={b.id} style={styles.badgeWrapper}>
                <BadgeCard badge={b} />
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.paper },
  scroll: { flex: 1 },
  content: { padding: screenRhythm.padding, gap: screenRhythm.gap },
  heroCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: cardTokens.radius,
    padding: cardTokens.padding,
    borderWidth: cardTokens.borderWidth,
    borderColor: 'rgba(174,255,227,0.25)',
    gap: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scoreCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(174,255,227,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.accent2,
  },
  scorePoints: {
    fontFamily: fonts.regular,
    fontSize: type.destaque,
    color: theme.accent2,
  },
  scorePointsLabel: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    color: theme.inkSoft,
  },
  heroInfo: { flex: 1, gap: 2 },
  levelBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(174,255,227,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  levelBadgeText: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    color: theme.accent2,
  },
  masteryTitle: {
    fontFamily: fonts.regular,
    fontSize: type.titulo,
    color: theme.ink,
  },
  masteryDesc: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkFaint,
    lineHeight: 15,
  },
  progressSection: {
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.rule,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkSoft,
  },
  progressPct: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.accent2,
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
  remainingText: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    color: theme.inkFaint,
  },
  levelHint: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    color: theme.inkFaint,
    lineHeight: 14,
    marginTop: 2,
  },
  card: {
    backgroundColor: theme.paperRaised,
    borderRadius: cardTokens.radius,
    padding: cardTokens.padding,
    borderWidth: cardTokens.borderWidth,
    borderColor: theme.rule,
    gap: spacing.md,
  },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fireEmoji: { fontSize: type.titulo, fontFamily: fonts.regular },
  cardTitle: {
    fontFamily: fonts.regular,
    fontSize: type.corpo,
    color: theme.ink,
  },
  streakBadgeText: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.accent2,
    backgroundColor: 'rgba(174,255,227,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  scoreTotalLabel: {
    fontFamily: fonts.regular,
    fontSize: type.nota,
    color: theme.accent2,
  },
  badgeRatioText: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkSoft,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: { alignItems: 'center', gap: 6 },
  dayCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
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
  dayName: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    color: theme.inkFaint,
  },
  dayNameActive: {
    color: theme.accent2,
  },
  dayNameToday: {
    color: theme.ink,
  },
  factorsList: { gap: spacing.md },
  factorItem: { gap: 3 },
  factorTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  factorLabel: {
    fontFamily: fonts.regular,
    fontSize: type.nota,
    color: theme.ink,
  },
  factorPoints: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkSoft,
  },
  factorBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  factorBarFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  factorDesc: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
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
