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
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import ItemActionSheet from '@/components/ItemActionSheet';
import Toast from '@/components/Toast';
import PrivacyValue from '@/components/PrivacyValue';
import Sheet from '@/components/Sheet';
import { addBill, deleteBill, fetchBills, setBillStatus, updateBill } from '@/lib/data';
import { formatDateLabel, formatMoney, parseAmount, todayISO } from '@/lib/format';
import { theme, radius, spacing } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';
import { useDemo } from '@/lib/demo-context';
import { DEMO_BILLS } from '@/lib/demo-data';
import type { Bill } from '@/lib/types';

export default function ContasScreen() {
  const { isDemoMode } = useDemo();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);

  // Bill Sheet State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[CATEGORIES.length - 1].name);
  const [catColor, setCatColor] = useState(CATEGORIES[CATEGORIES.length - 1].color);
  const [dueDate, setDueDate] = useState(todayISO());
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
    setModalOpen(true);
  }

  function openEditModal(bill: Bill) {
    setEditingBillId(bill.id);
    setDesc(bill.description);
    setAmount(formatMoney(Number(bill.amount)));
    setCategory(bill.category);
    setCatColor(bill.color);
    setDueDate(bill.due_date);
    setModalOpen(true);
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
        });
        triggerToast('Conta atualizada');
      } else {
        await addBill({
          description: desc.trim() || 'Sem descrição',
          amount: value,
          category,
          color: catColor,
          due_date: dueDate,
        });
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
    const newStatus = bill.status === 'paid' ? 'due' : 'paid';
    if (isDemoMode) {
      setBills((prev) =>
        prev.map((b) => (b.id === bill.id ? { ...b, status: newStatus } : b))
      );
      triggerToast(newStatus === 'paid' ? 'Conta marcada como paga' : 'Conta reaberta');
      return;
    }

    try {
      await setBillStatus(bill.id, newStatus);
      triggerToast(newStatus === 'paid' ? 'Conta marcada como paga' : 'Conta reaberta');
      load();
    } catch (e: any) {
      Alert.alert('Erro ao atualizar', e.message);
    }
  }

  async function handleDeleteSelectedBill() {
    if (!selectedBill) return;
    if (isDemoMode) {
      setBills((prev) => prev.filter((b) => b.id !== selectedBill.id));
      triggerToast('Conta excluída');
      return;
    }

    try {
      await deleteBill(selectedBill.id);
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

  const openTotal = bills.filter((b) => b.status !== 'paid').reduce((s, b) => s + Number(b.amount), 0);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Contas a pagar</Text>
        <View style={styles.subtitleRow}>
          <PrivacyValue>
            <Text style={styles.subtitle}>{`R$ ${formatMoney(openTotal)}`}</Text>
          </PrivacyValue>
          <Text style={styles.subtitle}> em aberto</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.ink} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ink} />}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma conta cadastrada ainda. Toque no botão "+" para registrar.</Text>}
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
                    <Text style={styles.cardName}>{item.description}</Text>
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

            <TextInput
              style={styles.descInput}
              placeholder="Descrição — ex: Energia"
              placeholderTextColor={theme.inkFaint}
              value={desc}
              onChangeText={setDesc}
            />

            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>R$</Text>
              <TextInput
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  header: { padding: spacing.xl, paddingBottom: spacing.md, gap: 2 },
  title: { color: theme.ink, fontSize: 22 },
  subtitle: { color: theme.inkFaint, fontSize: 12.5 },
  subtitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: 100, gap: spacing.sm },
  emptyText: { color: theme.inkFaint, fontSize: 12.5, textAlign: 'center', marginTop: 30, lineHeight: 18 },
  card: { borderWidth: 1, borderColor: theme.rule, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  cardHover: { backgroundColor: theme.paperRaised, borderColor: theme.ruleStrong },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardName: { color: theme.ink, fontSize: 13.5 },
  cardCat: { color: theme.inkFaint, fontSize: 10.5, marginTop: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAmount: { color: theme.ink, fontSize: 15, fontVariant: ['tabular-nums'] },
  cardDue: { color: theme.inkFaint, fontSize: 10.5 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillOk: { backgroundColor: theme.rule },
  pillWarn: { borderWidth: 1, borderColor: theme.ruleStrong },
  pillLate: { backgroundColor: theme.ink },
  pillText: { color: theme.inkSoft, fontSize: 9.5, textTransform: 'uppercase' },
  // pillLate usa fundo claro (theme.ink) — precisa de texto escuro em vez do
  // pillText claro padrão, senão fica ilegível (claro sobre quase-branco).
  pillLateText: { color: theme.paper, fontWeight: '700' },
  fab: { position: 'absolute', right: spacing.xl, bottom: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: theme.ink, alignItems: 'center', justifyContent: 'center' },
  fabHover: { opacity: 0.85 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: 17 },
  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: 14, paddingVertical: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: 20 },
  amountInput: { color: theme.ink, fontSize: 30, flex: 1 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.rule },
  fieldKey: { color: theme.inkFaint, fontSize: 13 },
  fieldVal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValText: { color: theme.ink, fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: 14, fontWeight: '600' },
});
