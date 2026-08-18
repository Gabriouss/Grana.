import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppPressable from '@/components/AppPressable';
import ScreenHeader from '@/components/ScreenHeader';
import WalletPickerModal from '@/components/WalletPickerModal';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import ItemActionSheet from '@/components/ItemActionSheet';
import Toast from '@/components/Toast';
import PrivacyValue from '@/components/PrivacyValue';
import Sheet from '@/components/Sheet';
import MonthSelector from '@/components/MonthSelector';
import { addBill, deleteBill, fetchBills, payBill, reopenBill, updateBill } from '@/lib/data';
import { scheduleBillReminders, cancelBillReminders } from '@/lib/notifications';
import { hapticSuccess, hapticTap, hapticDelete } from '@/lib/haptics';
import { addMonthsToISO, formatDateLabel, formatMoney, isSameMonth, parseAmount, todayISO } from '@/lib/format';
import { theme, radius, spacing } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';
import { useDemo } from '@/lib/demo-context';
import { useWallet } from '@/lib/wallet-context';
import { DEMO_BILLS } from '@/lib/demo-data';
import type { Bill, BillStatus } from '@/lib/types';
import { LIMITS } from '@/lib/limits';

export default function ContasScreen() {
  const { isDemoMode } = useDemo();
  const { activeWalletId, activeWallet, activeWalletName, activeWalletColor } = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);

  // Mês e Ano Selecionados (filtra as contas pelo vencimento, não pela criação)
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  // Bill Sheet State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[CATEGORIES.length - 1].name);
  const [catColor, setCatColor] = useState(CATEGORIES[CATEGORIES.length - 1].color);
  const [dueDate, setDueDate] = useState(todayISO());
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  // Aux Pickers & Sheets
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  function triggerToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  const load = useCallback(async () => {
    if (isDemoMode) {
      setBills(DEMO_BILLS);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const b = await fetchBills();
      setBills(b);
      /* Reagenda os lembretes de cada conta a cada carregamento — os ids são
         determinísticos, então isso só substitui o que já existia (ou
         cancela, se a conta estiver paga). Mantém os lembretes corretos
         mesmo depois de reinstalar o app ou editar uma conta fora desta tela. */
      b.forEach((bill) => { scheduleBillReminders(bill).catch(() => {}); });
    } catch (e: any) {
      Alert.alert('Erro ao carregar contas', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openNewModal() {
    setEditingBillId(null);
    setDesc('');
    setAmount('');
    const catObj = CATEGORIES[CATEGORIES.length - 1];
    setCategory(catObj.name);
    setCatColor(catObj.color);
    setDueDate(todayISO());
    setRecurring(false);
    setModalOpen(true);
  }

  function openEditModal(bill: Bill) {
    setEditingBillId(bill.id);
    setDesc(bill.description);
    setAmount(formatMoney(Number(bill.amount)));
    setCategory(bill.category);
    setCatColor(bill.color);
    setDueDate(bill.due_date);
    setRecurring(!!bill.recurring);
    setModalOpen(true);
  }

  function addOneMonth(iso: string): string {
    return addMonthsToISO(iso, 1);
  }

  async function handleSave() {
    const value = parseAmount(amount);
    if (!value || value <= 0) {
      Alert.alert('Informe um valor válido');
      return;
    }
    setSaving(true);
    try {
      if (editingBillId) {
        await updateBill(editingBillId, {
          description: desc.trim() || 'Sem descrição',
          amount: value,
          category,
          color: catColor,
          due_date: dueDate,
          recurring,
        });
        // updateBill não devolve a linha atualizada — remonta localmente pra reagendar os lembretes.
        const original = bills.find((b) => b.id === editingBillId);
        if (original) {
          scheduleBillReminders({
            ...original,
            description: desc.trim() || 'Sem descrição',
            amount: value,
            category,
            color: catColor,
            due_date: dueDate,
            recurring,
          }).catch(() => {});
        }
        triggerToast('Conta atualizada');
      } else {
        const created = await addBill({
          description: desc.trim() || 'Sem descrição',
          amount: value,
          category,
          color: catColor,
          due_date: dueDate,
          recurring,
          wallet_id: activeWallet?.id ?? null,
        });
        scheduleBillReminders(created).catch(() => {});
        triggerToast('Conta salva');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(bill: Bill) {
    const newStatus: BillStatus = bill.status === 'paid' ? 'due' : 'paid';
    /* Só gera a próxima fatura ao PAGAR uma conta recorrente — reabrir (paid
       -> due) é uma correção do usuário, não deveria duplicar a próxima. */
    const gerarProxima = newStatus === 'paid' && bill.recurring;
    const proximaData = gerarProxima ? addOneMonth(bill.due_date) : null;

    if (isDemoMode) {
      setBills((prev): Bill[] => {
        const atualizado: Bill[] = prev.map((b) => (b.id === bill.id ? { ...b, status: newStatus } : b));
        if (!proximaData) return atualizado;
        const proxima: Bill = {
          ...bill,
          id: `demo-local-${Date.now()}`,
          status: 'due',
          due_date: proximaData,
          paid_transaction_id: null,
          created_at: new Date().toISOString(),
        };
        return [...atualizado, proxima];
      });
      if (newStatus === 'paid') hapticSuccess(); else hapticTap();
      triggerToast(proximaData ? `Conta paga. Próxima fatura em ${formatDateLabel(proximaData)}` : newStatus === 'paid' ? 'Conta marcada como paga' : 'Conta reaberta');
      return;
    }

    try {
      if (newStatus === 'paid') {
        // payBill já lança a saída correspondente em transactions, na data de hoje.
        await payBill(bill, todayISO());
        if (proximaData) {
          await addBill({
            description: bill.description,
            amount: Number(bill.amount),
            category: bill.category,
            color: bill.color,
            due_date: proximaData,
            recurring: true,
            wallet_id: bill.wallet_id,
          });
        }
        hapticSuccess();
        triggerToast(
          proximaData
            ? `Conta paga. Próxima fatura em ${formatDateLabel(proximaData)}`
            : 'Conta paga — saída lançada em Lançamentos'
        );
      } else {
        // reopenBill desfaz a saída lançada quando a conta foi paga, se houver.
        await reopenBill(bill);
        hapticTap();
        triggerToast('Conta reaberta');
      }
      load();
    } catch (e: any) {
      Alert.alert('Erro ao atualizar', e.message);
    }
  }

  async function handleDeleteSelectedBill() {
    if (!selectedBill) return;
    if (isDemoMode) {
      setBills((prev) => prev.filter((b) => b.id !== selectedBill.id));
      hapticDelete();
      triggerToast('Conta excluída');
      return;
    }

    try {
      await deleteBill(selectedBill.id);
      // load() só resincroniza lembretes de contas que ainda existem — a excluída precisa ser cancelada à parte.
      cancelBillReminders(selectedBill.id).catch(() => {});
      hapticDelete();
      triggerToast('Conta excluída');
      load();
    } catch (e: any) {
      Alert.alert('Erro ao excluir', e.message);
    }
  }

  function statusInfo(bill: Bill): { text: string; style: object } {
    if (bill.status === 'paid') return { text: 'paga', style: styles.pillOk };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((new Date(bill.due_date + 'T00:00:00').getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) return { text: 'atrasada', style: styles.pillLate };
    if (diffDays === 0) return { text: 'vence hoje', style: styles.pillWarn };
    return { text: `vence em ${diffDays}d`, style: styles.pillWarn };
  }

  // Só a carteira ativa — "Total" mantém tudo. Mesmo filtro usado em index.tsx, lancamentos.tsx e graficos.tsx.
  const walletBills = activeWalletId === 'total' ? bills : bills.filter((b) => b.wallet_id === activeWalletId);

  // Contas cujo VENCIMENTO cai no mês selecionado — cada boleto pertence ao mês em que vence, não em que foi criado.
  const monthBills = walletBills.filter((b) => isSameMonth(b.due_date, selectedYear, selectedMonth));
  const openTotal = monthBills.filter((b) => b.status !== 'paid').reduce((s, b) => s + Number(b.amount), 0);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader
        eyebrow="pagamentos"
        title="Contas a pagar"
        right={
          <AppPressable onPress={() => setWalletModalOpen(true)} style={styles.walletPill}>
            <View style={[styles.walletPillDot, { backgroundColor: activeWalletColor }]} />
            <Text style={styles.walletPillText} numberOfLines={1}>
              {activeWalletName}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.inkFaint} />
          </AppPressable>
        }
      >
        <View style={styles.subtitleRow}>
          <PrivacyValue>
            <Text style={styles.subtitle}>{`R$ ${formatMoney(openTotal)}`}</Text>
          </PrivacyValue>
          <Text style={styles.subtitle}> em aberto</Text>
        </View>

        <MonthSelector
          year={selectedYear}
          month={selectedMonth}
          onChange={(y, m) => {
            setSelectedYear(y);
            setSelectedMonth(m);
          }}
        />
      </ScreenHeader>

      {loading ? (
        <ActivityIndicator color={theme.ink} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={monthBills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ink} />}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma conta vencendo neste mês. Toque no botão "+" para registrar.</Text>}
          renderItem={({ item }) => {
            const info = statusInfo(item);
            return (
              <AppPressable
                style={({ hovered }) => [styles.card, hovered && styles.cardHover]}
                onPress={() => toggleStatus(item)}
                onLongPress={() => {
                  setSelectedBill(item);
                  setActionSheetOpen(true);
                }}
              >
                <View style={styles.cardTop}>
                  <View>
                    <View style={styles.cardNameRow}>
                      <Text style={styles.cardName}>{item.description}</Text>
                      {item.recurring && (
                        <Ionicons name="repeat-outline" size={12} color={theme.inkFaint} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                    <Text style={styles.cardCat}>{item.category}</Text>
                  </View>
                  <View style={[styles.pill, info.style]}>
                    <Text style={[styles.pillText, info.style === styles.pillLate && styles.pillLateText]}>{info.text}</Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <PrivacyValue>
                    <Text style={styles.cardAmount}>{`R$ ${formatMoney(Number(item.amount))}`}</Text>
                  </PrivacyValue>
                  <Text style={styles.cardDue}>
                    {formatDateLabel(item.due_date)} · {item.status === 'paid' ? 'toque para reabrir' : 'toque para pagar'}
                  </Text>
                </View>
              </AppPressable>
            );
          }}
        />
      )}

      <AppPressable style={({ hovered }) => [styles.fab, hovered && styles.fabHover]} onPress={openNewModal}>
        <Ionicons name="add" size={24} color={theme.paper} />
      </AppPressable>

      {/* Sheet: Nova / Editar Conta */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Sheet>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingBillId ? 'Editar conta a pagar' : 'Nova conta a pagar'}</Text>
              <AppPressable onPress={() => setModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.inkFaint} />
              </AppPressable>
            </View>

            <TextInput maxLength={LIMITS.description}
              style={styles.descInput}
              placeholder="Descrição — ex: Energia"
              placeholderTextColor={theme.inkFaint}
              value={desc}
              onChangeText={setDesc}
            />

            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>R$</Text>
              <TextInput maxLength={LIMITS.amount}
                style={styles.amountInput}
                placeholder="0,00"
                placeholderTextColor={theme.inkFaint}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                autoFocus
              />
            </View>

            <AppPressable
              style={styles.fieldRow}
              onPress={() => setCatPickerOpen(true)}
            >
              <Text style={styles.fieldKey}>Categoria</Text>
              <View style={styles.fieldVal}>
                <View style={[styles.dot, { backgroundColor: catColor }]} />
                <Text style={styles.fieldValText}>{category}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
              </View>
            </AppPressable>

            <AppPressable
              style={styles.fieldRow}
              onPress={() => setDatePickerOpen(true)}
            >
              <Text style={styles.fieldKey}>Vencimento</Text>
              <View style={styles.fieldVal}>
                <Text style={styles.fieldValText}>{formatDateLabel(dueDate)}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
              </View>
            </AppPressable>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldKey}>Conta recorrente (todo mês)</Text>
              <AppPressable
                style={[styles.switchTrack, recurring && styles.switchTrackOn]}
                onPress={() => setRecurring((p) => !p)}
                hitSlop={12}
              >
                <View style={[styles.switchThumb, recurring && styles.switchThumbOn]} />
              </AppPressable>
            </View>

            <AppPressable
              style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>{editingBillId ? 'Salvar alterações' : 'Salvar conta'}</Text>}
            </AppPressable>
        </Sheet>
      </Modal>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={datePickerOpen}
        currentISO={dueDate}
        title="Vencimento da conta"
        onClose={() => setDatePickerOpen(false)}
        onSelectDate={(iso) => setDueDate(iso)}
      />

      {/* Category Picker Modal */}
      <CategoryPickerModal
        visible={catPickerOpen}
        currentCategory={category}
        onClose={() => setCatPickerOpen(false)}
        onSelectCategory={(cat) => {
          setCategory(cat.name);
          setCatColor(cat.color);
        }}
      />

      {/* Item Action Sheet (Editar / Excluir) */}
      <ItemActionSheet
        visible={actionSheetOpen}
        title="Conta a pagar"
        onClose={() => setActionSheetOpen(false)}
        onEdit={() => {
          if (selectedBill) openEditModal(selectedBill);
        }}
        onDelete={handleDeleteSelectedBill}
      />

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />

      <WalletPickerModal visible={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  subtitle: { color: theme.inkFaint, fontSize: 13 },
  subtitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 110,
  },
  walletPillDot: { width: 8, height: 8, borderRadius: 4 },
  walletPillText: { color: theme.ink, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: 100, gap: spacing.sm },
  emptyText: { color: theme.inkFaint, fontSize: 13, textAlign: 'center', marginTop: 30, lineHeight: 18 },
  card: { borderWidth: 1, borderColor: theme.rule, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  cardHover: { backgroundColor: theme.paperRaised, borderColor: theme.ruleStrong },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardNameRow: { flexDirection: 'row', alignItems: 'center' },
  cardName: { color: theme.ink, fontSize: 14 },
  cardCat: { color: theme.inkFaint, fontSize: 11, marginTop: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAmount: { color: theme.ink, fontSize: 15, fontVariant: ['tabular-nums'] },
  cardDue: { color: theme.inkFaint, fontSize: 11 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillOk: { backgroundColor: theme.rule },
  pillWarn: { borderWidth: 1, borderColor: theme.ruleStrong },
  pillLate: { backgroundColor: theme.ink },
  pillText: { color: theme.inkSoft, fontSize: 9, textTransform: 'uppercase' },
  // pillLate usa fundo claro (theme.ink) — precisa de texto escuro em vez do
  // pillText claro padrão, senão fica ilegível (claro sobre quase-branco).
  pillLateText: { color: theme.paper, fontWeight: '700' },
  /* bottom:112 pra ficar acima da barra flutuante (app/(app)/_layout.tsx) —
     mesma posição do FabButton usado nas outras telas (ver components/FabButton.tsx). */
  fab: { position: 'absolute', right: spacing.xl, bottom: 112, width: 52, height: 52, borderRadius: 26, backgroundColor: theme.ink, alignItems: 'center', justifyContent: 'center' },
  fabHover: { opacity: 0.85 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: 17, fontWeight: '500' },
  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: 14, paddingVertical: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: 20 },
  amountInput: { color: theme.ink, fontSize: 30, flex: 1 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.rule },
  fieldKey: { color: theme.inkFaint, fontSize: 13 },
  fieldVal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValText: { color: theme.ink, fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  switchTrack: { width: 34, height: 20, borderRadius: 10, backgroundColor: theme.ruleStrong, padding: 2 },
  switchTrackOn: { backgroundColor: theme.ink },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: theme.paperRaised },
  switchThumbOn: { transform: [{ translateX: 14 }] },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: 14, fontWeight: '600' },
});
