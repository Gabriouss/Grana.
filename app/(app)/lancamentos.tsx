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
import PasteReceiptModal from '@/components/PasteReceiptModal';
import CsvImportModal from '@/components/CsvImportModal';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import ItemActionSheet from '@/components/ItemActionSheet';
import Toast from '@/components/Toast';
import PrivacyValue from '@/components/PrivacyValue';
import SegmentedTabs from '@/components/SegmentedTabs';
import FabButton from '@/components/FabButton';
import { addTransaction, deleteTransaction, fetchTransactions, updateTransaction } from '@/lib/data';
import { formatDateLabel, formatMoney, parseAmount, todayISO } from '@/lib/format';
import { theme, radius, spacing } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';
import { useDemo } from '@/lib/demo-context';
import { DEMO_TRANSACTIONS } from '@/lib/demo-data';
import type { Transaction, TxType } from '@/lib/types';

export default function LancamentosScreen() {
  const { isDemoMode } = useDemo();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'tudo' | TxType>('tudo');

  // New / Edit Transaction Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [type, setType] = useState<TxType>('out');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].name);
  const [catColor, setCatColor] = useState(CATEGORIES[0].color);
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  // Aux Modals
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);

  // Action Sheet
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  function triggerToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  const load = useCallback(async () => {
    if (isDemoMode) {
      setTransactions(DEMO_TRANSACTIONS);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const tx = await fetchTransactions();
      setTransactions(tx);
    } catch (e: any) {
      Alert.alert('Erro ao carregar lançamentos', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openNewModal(kind: TxType, prefillCat?: string) {
    setEditingTxId(null);
    setType(kind);
    setDesc('');
    setAmount('');
    const cName = prefillCat || (kind === 'in' ? 'Salário' : CATEGORIES[0].name);
    const catObj = CATEGORIES.find((c) => c.name === cName) ?? CATEGORIES[0];
    setCategory(catObj.name);
    setCatColor(catObj.color);
    setOccurredOn(todayISO());
    setRecurring(false);
    setModalOpen(true);
  }

  function openEditModal(tx: Transaction) {
    setEditingTxId(tx.id);
    setType(tx.type);
    setDesc(tx.description);
    setAmount(formatMoney(Number(tx.amount)));
    setCategory(tx.category);
    setCatColor(tx.color);
    setOccurredOn(tx.occurred_on);
    setRecurring(!!tx.recurring);
    setModalOpen(true);
  }

  async function handleSave() {
    const value = parseAmount(amount);
    if (!value || value <= 0) {
      Alert.alert('Informe um valor válido');
      return;
    }

    if (isDemoMode) {
      // Modo de exemplo é só uma "lente" de exploração — nunca deve tocar o banco real.
      if (editingTxId) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editingTxId
              ? { ...t, type, description: desc.trim() || 'Sem descrição', amount: value, category, color: catColor, occurred_on: occurredOn, recurring }
              : t
          )
        );
        triggerToast('Lançamento atualizado (exemplo)');
      } else {
        setTransactions((prev) => [
          {
            id: `demo-local-${Date.now()}`,
            user_id: 'demo',
            type,
            description: desc.trim() || (type === 'in' ? 'Entrada' : 'Saída'),
            amount: value,
            category,
            color: catColor,
            occurred_on: occurredOn,
            recurring,
            parent_id: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        triggerToast('Lançamento salvo (exemplo)');
      }
      setModalOpen(false);
      return;
    }

    setSaving(true);
    try {
      if (editingTxId) {
        await updateTransaction(editingTxId, {
          type,
          description: desc.trim() || 'Sem descrição',
          amount: value,
          category,
          color: catColor,
          occurred_on: occurredOn,
          recurring,
        });
        triggerToast('Lançamento atualizado');
      } else {
        await addTransaction({
          type,
          description: desc.trim() || (type === 'in' ? 'Entrada' : 'Saída'),
          amount: value,
          category,
          color: catColor,
          occurred_on: occurredOn,
          recurring,
        });
        triggerToast('Lançamento salvo');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSelectedTx() {
    if (!selectedTx) return;
    if (isDemoMode) {
      setTransactions((prev) => prev.filter((t) => t.id !== selectedTx.id));
      triggerToast('Lançamento excluído (exemplo)');
      return;
    }
    try {
      await deleteTransaction(selectedTx.id);
      triggerToast('Lançamento excluído');
      load();
    } catch (e: any) {
      Alert.alert('Erro ao excluir', e.message);
    }
  }

  const visible = transactions.filter((t) => filter === 'tudo' || t.type === filter);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Lançamentos</Text>
          <View style={styles.headerActions}>
            <AppPressable
              style={({ hovered }) => [styles.headerBtn, hovered && styles.headerBtnHover]}
              onPress={() => setPasteModalOpen(true)}
              hitSlop={8}
            >
              <Ionicons name="clipboard-outline" size={18} color={theme.ink} />
            </AppPressable>
            <AppPressable
              style={({ hovered }) => [styles.headerBtn, hovered && styles.headerBtnHover]}
              onPress={() => setCsvModalOpen(true)}
              hitSlop={8}
            >
              <Ionicons name="document-text-outline" size={18} color={theme.ink} />
            </AppPressable>
          </View>
        </View>

        <SegmentedTabs
          options={[
            { key: 'tudo', label: 'Tudo' },
            { key: 'in', label: 'Entradas' },
            { key: 'out', label: 'Saídas' },
          ]}
          value={filter}
          onChange={(f) => setFilter(f as 'tudo' | TxType)}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.ink} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ink} />}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum lançamento ainda. Toque no "+" para registrar o primeiro ou use os botões acima para colar comprovante ou importar CSV.</Text>}
          renderItem={({ item }) => (
            <AppPressable
              style={({ hovered }) => [styles.row, hovered && styles.rowHover]}
              onPress={() => openEditModal(item)}
              onLongPress={() => {
                setSelectedTx(item);
                setActionSheetOpen(true);
              }}
            >
              <View style={[styles.icon, { backgroundColor: item.color + '30' }]}>
                <Text style={[styles.iconText, { color: item.color }]}>{item.category.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.category}</Text>
                <Text style={styles.rowSub}>
                  {item.description}
                  {item.recurring ? ' · recorrente' : ''} · {formatDateLabel(item.occurred_on)}
                </Text>
              </View>
              <View style={styles.rowAmountWrap}>
                <Text style={[styles.rowAmount, { color: item.type === 'in' ? theme.up : theme.down }]}>
                  {item.type === 'in' ? '+ ' : '− '}
                </Text>
                <PrivacyValue>
                  <Text style={[styles.rowAmount, { color: item.type === 'in' ? theme.up : theme.down }]}>
                    {`R$ ${formatMoney(Number(item.amount))}`}
                  </Text>
                </PrivacyValue>
              </View>
            </AppPressable>
          )}
        />
      )}

      {/* FAB — mesmo componente da Home, só sem a opção Boleto (isso fica em Contas) */}
      <FabButton onAddIncome={() => openNewModal('in')} onAddExpense={() => openNewModal('out')} />

      {/* Sheet: Novo / Editar Lançamento */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingTxId ? 'Editar lançamento' : type === 'in' ? 'Nova entrada' : 'Nova saída'}</Text>
              <AppPressable onPress={() => setModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.inkFaint} />
              </AppPressable>
            </View>

            <View style={styles.typeRow}>
              <AppPressable
                onPress={() => setType('out')}
                style={[styles.typeBtn, type === 'out' && styles.typeBtnOut]}
              >
                <Text style={[styles.typeText, type === 'out' && styles.typeTextOn]}>Saída</Text>
              </AppPressable>
              <AppPressable
                onPress={() => setType('in')}
                style={[styles.typeBtn, type === 'in' && styles.typeBtnIn]}
              >
                <Text style={[styles.typeText, type === 'in' && styles.typeTextOn]}>Entrada</Text>
              </AppPressable>
            </View>

            <TextInput
              style={styles.descInput}
              placeholder="Descrição"
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
              <Text style={styles.fieldKey}>Data</Text>
              <View style={styles.fieldVal}>
                <Text style={styles.fieldValText}>{formatDateLabel(occurredOn)}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
              </View>
            </AppPressable>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldKey}>Repetir mensalmente</Text>
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
              {saving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>{editingTxId ? 'Salvar alterações' : 'Salvar lançamento'}</Text>}
            </AppPressable>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={datePickerOpen}
        currentISO={occurredOn}
        title="Data do lançamento"
        onClose={() => setDatePickerOpen(false)}
        onSelectDate={(iso) => setOccurredOn(iso)}
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
        title="Lançamento"
        onClose={() => setActionSheetOpen(false)}
        onEdit={() => {
          if (selectedTx) openEditModal(selectedTx);
        }}
        onDelete={handleDeleteSelectedTx}
      />

      {/* Paste Receipt Modal */}
      <PasteReceiptModal
        visible={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        onSuccess={() => {
          triggerToast('Lançamento salvo');
          load();
        }}
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        visible={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onSuccess={() => {
          triggerToast('Lançamentos importados');
          load();
        }}
      />

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  header: { padding: spacing.xl, paddingBottom: spacing.md, gap: spacing.md },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    padding: 8,
    borderRadius: radius.pill,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  headerBtnHover: { borderColor: theme.ruleStrong },
  title: { color: theme.ink, fontSize: 22 },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: 100 },
  emptyText: { color: theme.inkFaint, fontSize: 12.5, textAlign: 'center', marginTop: 30, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.xs, borderRadius: radius.sm, borderBottomWidth: 1, borderBottomColor: theme.rule },
  rowHover: { backgroundColor: theme.paperRaised },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 11 },
  rowTitle: { color: theme.ink, fontSize: 13 },
  rowSub: { color: theme.inkFaint, fontSize: 10.5, marginTop: 2 },
  rowAmount: { fontSize: 13, fontVariant: ['tabular-nums'] },
  rowAmountWrap: { flexDirection: 'row', alignItems: 'baseline' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.paperRaised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.md, maxHeight: '88%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: 17 },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: theme.paper },
  typeBtnOut: { backgroundColor: '#bb6b6033', borderWidth: 1, borderColor: '#bb6b60' },
  typeBtnIn: { backgroundColor: '#4f948333', borderWidth: 1, borderColor: '#4f9483' },
  typeText: { color: theme.inkFaint, fontSize: 12 },
  typeTextOn: { color: theme.ink, fontWeight: '500' },
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
