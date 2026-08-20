import { useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import { ESPACO_ALCA } from './WidgetGrid';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { formatMoney, formatDateLabel, parseAmount, todayISO, formatMoneyInput } from '@/lib/format';
import { calcularLevelState } from '@/lib/gamification-infinite';
import { LIMITS } from '@/lib/limits';
import { PALETTE_30 } from '@/lib/theme';
import type { Goal } from '@/lib/types';
import AppPressable from './AppPressable';
import ColorGridPicker from './ColorGridPicker';
import DatePickerModal from './DatePickerModal';
import GoalDepositModal from './GoalDepositModal';
import PrivacyValue from './PrivacyValue';
import Sheet from './Sheet';

const ICONES: string[] = ['flag', 'airplane', 'car-sport', 'home', 'gift', 'shield-checkmark', 'school', 'heart'];

type NovaMeta = { title: string; target_amount: number; color: string; icon: string; deadline: string | null };

export default function GoalsCarousel({
  goals,
  lifetimeXp,
  onCreateGoal,
  onDeposit,
  onDeleteGoal,
}: {
  goals: Goal[];
  lifetimeXp: number;
  onCreateGoal: (input: NovaMeta) => Promise<void>;
  onDeposit: (goal: Goal, delta: number) => Promise<void>;
  onDeleteGoal: (goal: Goal) => Promise<void>;
}) {
  const level = calcularLevelState(lifetimeXp);

  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  function scrollByCards(dir: 1 | -1) {
    const delta = (CARD_WIDTH + spacing.sm) * 2 * dir;
    scrollRef.current?.scrollTo({ x: Math.max(0, scrollX.current + delta), animated: true });
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [color, setColor] = useState(PALETTE_30[0]);
  const [icon, setIcon] = useState(ICONES[0]);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [depositTarget, setDepositTarget] = useState<Goal | null>(null);
  const [depositing, setDepositing] = useState(false);

  function resetCreateForm() {
    setTitle('');
    setTargetAmount('');
    setColor(PALETTE_30[0]);
    setIcon(ICONES[0]);
    setDeadline(null);
  }

  async function handleCreate() {
    const parsed = parseAmount(targetAmount);
    if (!title.trim()) {
      Alert.alert('Dê um nome para a meta');
      return;
    }
    if (!parsed || parsed <= 0) {
      Alert.alert('Informe um valor alvo válido');
      return;
    }
    setCreating(true);
    try {
      await onCreateGoal({ title: title.trim(), target_amount: parsed, color, icon, deadline });
      resetCreateForm();
      setCreateOpen(false);
    } catch (e: any) {
      Alert.alert('Erro ao criar meta', e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeposit(delta: number) {
    if (!depositTarget) return;
    setDepositing(true);
    try {
      await onDeposit(depositTarget, delta);
      setDepositTarget(null);
    } catch (e: any) {
      Alert.alert('Erro ao movimentar cofrinho', e.message);
    } finally {
      setDepositing(false);
    }
  }

  function confirmDelete(goal: Goal) {
    Alert.alert('Excluir meta', `Remover "${goal.title}"? O valor guardado não volta sozinho para o saldo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          onDeleteGoal(goal).catch((e: any) => Alert.alert('Erro ao excluir', e.message));
        },
      },
    ]);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.headRow}>
        <Text style={styles.sectionLabel}>Cofrinhos & metas</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View style={styles.levelPill}>
            <Text style={styles.levelPillText}>
              {level.elo.emoji} Nível {level.level} · {level.elo.title}
            </Text>
          </View>
          {/* No toque (nativo e touch na web) arrastar a fileira já funciona
              sozinho — é o padrão de ScrollView. No mouse da web não existe
              gesto de "arrastar" nenhum, e um scrollbar do sistema por baixo
              da fileira ficava fora da identidade visual do app (relatado
              pelo autor) e sobrepunha as caixinhas. Duas setinhas, no mesmo
              estilo do MonthSelector, dão a mesma pista sem nenhuma das
              duas encrencas — só aparecem na web, onde o toque não existe. */}
          {Platform.OS === 'web' && (
            <View style={{ flexDirection: 'row', gap: 2 }}>
              <AppPressable
                style={({ hovered }) => [styles.carouselArrow, hovered && styles.carouselArrowHover]}
                onPress={() => scrollByCards(-1)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cofrinhos anteriores"
              >
                <Ionicons name="chevron-back" size={16} color={theme.inkSoft} />
              </AppPressable>
              <AppPressable
                style={({ hovered }) => [styles.carouselArrow, hovered && styles.carouselArrowHover]}
                onPress={() => scrollByCards(1)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Próximos cofrinhos"
              >
                <Ionicons name="chevron-forward" size={16} color={theme.inkSoft} />
              </AppPressable>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          scrollX.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={styles.row}
      >
        {goals.map((g) => {
          const atual = Number(g.current_amount);
          const alvo = Number(g.target_amount);
          const pct = alvo > 0 ? Math.min(100, Math.round((atual / alvo) * 100)) : 0;
          const batida = atual >= alvo;
          return (
            <AppPressable
              key={g.id}
              style={({ hovered }) => [styles.card, hovered && styles.cardHover]}
              onPress={() => setDepositTarget(g)}
              onLongPress={() => confirmDelete(g)}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconCircle, { backgroundColor: g.color + '30' }]}>
                  <Ionicons name={g.icon as any} size={18} color={g.color} />
                </View>
                {batida && <Ionicons name="checkmark-circle" size={16} color={theme.up} />}
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{g.title}</Text>
              <PrivacyValue>
                <Text style={styles.cardAmount}>{`R$ ${formatMoney(atual)}`}</Text>
              </PrivacyValue>
              <Text style={styles.cardTarget}>{`de R$ ${formatMoney(alvo)}`}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: g.color }]} />
              </View>
              <View style={styles.cardBottomRow}>
                <Text style={styles.cardPct}>{pct}%</Text>
                {g.deadline && <Text style={styles.cardDeadline}>{formatDateLabel(g.deadline)}</Text>}
              </View>
            </AppPressable>
          );
        })}

        <AppPressable
          style={({ hovered }) => [styles.card, styles.addCard, hovered && styles.cardHover]}
          onPress={() => setCreateOpen(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color={theme.inkSoft} />
          <Text style={styles.addCardText}>Nova meta</Text>
        </AppPressable>
      </ScrollView>

      {/* Sheet: Nova Meta */}
      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <Sheet onClose={() => setCreateOpen(false)}>
          <View style={styles.header}>
            <Text style={styles.sheetTitle}>Nova meta</Text>
            <AppPressable onPress={() => setCreateOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <TextInput
            maxLength={LIMITS.goalTitle}
            style={styles.descInput}
            placeholder="Nome da meta — ex: Reserva de emergência"
            placeholderTextColor={theme.inkFaint}
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>R$</Text>
            <TextInput
              maxLength={LIMITS.amount}
              style={styles.amountInput}
              placeholder="0,00"
              placeholderTextColor={theme.inkFaint}
              keyboardType="number-pad"
              value={targetAmount}
              onChangeText={(t) => setTargetAmount(formatMoneyInput(t))}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Ícone</Text>
            <View style={styles.iconRow}>
              {ICONES.map((i) => (
                <AppPressable
                  key={i}
                  onPress={() => setIcon(i)}
                  style={[styles.iconChip, icon === i && { borderColor: color, backgroundColor: color + '25' }]}
                >
                  <Ionicons name={i as any} size={18} color={icon === i ? color : theme.inkFaint} />
                </AppPressable>
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Cor</Text>
            <ColorGridPicker value={color} onChange={setColor} />
          </View>

          <AppPressable style={styles.fieldRow} onPress={() => setDatePickerOpen(true)}>
            <Text style={styles.fieldKey}>Prazo (opcional)</Text>
            <View style={styles.fieldVal}>
              <Text style={styles.fieldValText}>{deadline ? formatDateLabel(deadline) : 'Sem prazo'}</Text>
              <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
            </View>
          </AppPressable>
          {deadline && (
            <AppPressable onPress={() => setDeadline(null)}>
              <Text style={styles.removeDeadlineText}>Remover prazo</Text>
            </AppPressable>
          )}

          <AppPressable
            style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
            onPress={handleCreate}
            disabled={creating}
          >
            <Text style={styles.saveBtnText}>{creating ? 'Salvando...' : 'Criar meta'}</Text>
          </AppPressable>
        </Sheet>
      </Modal>

      <DatePickerModal
        visible={datePickerOpen}
        currentISO={deadline || todayISO()}
        title="Prazo da meta"
        onClose={() => setDatePickerOpen(false)}
        onSelectDate={(iso) => setDeadline(iso)}
      />

      <GoalDepositModal
        visible={!!depositTarget}
        goal={depositTarget}
        saving={depositing}
        onClose={() => setDepositTarget(null)}
        onSubmit={handleDeposit}
      />
    </View>
  );
}

const CARD_WIDTH = 152;

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...(Platform.OS === 'web' ? { paddingRight: ESPACO_ALCA } : null) },
  sectionLabel: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 0.5, fontFamily: fonts.light },
  levelPill: {
    backgroundColor: 'rgba(175,255,227,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  levelPillText: { color: theme.accent2, fontSize: type.legenda, fontFamily: fonts.regular },
  carouselArrow: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselArrowHover: { backgroundColor: theme.hover },
  row: { gap: spacing.sm, paddingVertical: 4, paddingRight: spacing.sm },
  card: {
    width: CARD_WIDTH,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.md,
    gap: 6,
  },
  cardHover: { borderColor: theme.ruleStrong },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  cardAmount: { color: theme.ink, fontSize: type.corpo, fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  cardTarget: { color: theme.inkFaint, fontSize: type.legenda, fontVariant: ['tabular-nums'], fontFamily: fonts.light },
  track: { height: 5, borderRadius: 3, backgroundColor: theme.paper, overflow: 'hidden', marginTop: 2 },
  fill: { height: '100%', borderRadius: 3 },
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPct: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  cardDeadline: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  addCard: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  addCardText: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: type.corpo, paddingVertical: 8, fontFamily: fonts.regular },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.valor, flex: 1, fontFamily: fonts.regular },
  fieldLabel: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.rule },
  fieldKey: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  fieldVal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValText: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  removeDeadlineText: { color: theme.inkFaint, fontSize: type.nota, paddingVertical: 2, fontFamily: fonts.light },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
});
