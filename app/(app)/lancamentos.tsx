import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppPressable from '@/components/AppPressable';
import PasteReceiptModal from '@/components/PasteReceiptModal';
import VoiceEntryButton from '@/components/VoiceEntryButton';
import CsvImportModal from '@/components/CsvImportModal';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import ItemActionSheet from '@/components/ItemActionSheet';
import Toast from '@/components/Toast';
import PrivacyValue from '@/components/PrivacyValue';
import Sheet from '@/components/Sheet';
import SegmentedTabs from '@/components/SegmentedTabs';
import FabButton from '@/components/FabButton';
import MonthSelector from '@/components/MonthSelector';
import { addInstallmentPurchase, addTransaction, deleteTransaction, fetchTransactions, updateTransaction } from '@/lib/data';
import {
  flushPendingQueue,
  getCachedTransactions,
  getPendingCount,
  isLikelyNetworkError,
  queuePendingTransaction,
  setCachedTransactions,
} from '@/lib/offline-cache';
import { hapticDelete } from '@/lib/haptics';
import { addMonthsToISO, formatDateLabel, formatMoney, isSameMonth, parseAmount, todayISO } from '@/lib/format';
import { theme, radius, spacing } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';
import { useDemo } from '@/lib/demo-context';
import { DEMO_TRANSACTIONS } from '@/lib/demo-data';
import type { Transaction, TxType } from '@/lib/types';
import { LIMITS } from '@/lib/limits';

export default function LancamentosScreen() {
  const { isDemoMode } = useDemo();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'tudo' | TxType>('tudo');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Cache offline: true quando a última tentativa de buscar caiu pra cache local.
  const [offline, setOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Mês e Ano Selecionados (inicializa com o mês atual)
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());


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
  const [installment, setInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState('2');
  const [saving, setSaving] = useState(false);

  // Aux Modals
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [voiceText, setVoiceText] = useState<string | undefined>(undefined);
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
      setOffline(false);
      setPendingCount(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      let tx = await fetchTransactions();
      setOffline(false);
      await setCachedTransactions(tx);

      // A rede respondeu — aproveita pra tentar sincronizar o que ficou pendente offline.
      const { synced } = await flushPendingQueue();
      if (synced > 0) {
        tx = await fetchTransactions();
        await setCachedTransactions(tx);
        triggerToast(synced === 1 ? '1 lançamento sincronizado' : `${synced} lançamentos sincronizados`);
      }
      setTransactions(tx);
      setPendingCount(await getPendingCount());
    } catch (e: any) {
      const cached = await getCachedTransactions();
      if (cached) {
        setTransactions(cached);
        setOffline(true);
        setPendingCount(await getPendingCount());
      } else {
        Alert.alert('Erro ao carregar lançamentos', e.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Sem um detector de conectividade nativo, reagir a "voltar ao app" (ex: depois
  // de reconectar o Wi-Fi em segundo plano) é o gatilho mais próximo disponível
  // de uma sincronização automática assim que a rede volta.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  function openNewModal(kind: TxType, prefillCat?: string) {
    setEditingTxId(null);
    setType(kind);
    setDesc('');
    setAmount('');
    const cName = prefillCat || (kind === 'in' ? 'Salário' : CATEGORIES[0].name);
    const catObj = CATEGORIES.find((c) => c.name === cName) ?? CATEGORIES[0];
    setCategory(catObj.name);
    setCatColor(catObj.color);

    const isCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const initialDate = isCurrent ? todayISO() : `${selectedYear}-${pad(selectedMonth + 1)}-01`;
    setOccurredOn(initialDate);

    setRecurring(false);
    setInstallment(false);
    setInstallmentCount('2');
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
    // Parcelamento só se aplica à criação — editar uma parcela já existente edita só ela mesma.
    setInstallment(false);
    setInstallmentCount('2');
    setModalOpen(true);
  }

  async function handleSave() {
    const value = parseAmount(amount);
    if (!value || value <= 0) {
      Alert.alert('Informe um valor válido');
      return;
    }

    // Só faz sentido parcelar uma saída nova (não uma edição, nem uma entrada).
    const parcelas = Math.max(2, Math.round(Number(installmentCount) || 2));
    const isInstallmentSave = installment && !editingTxId && type === 'out';

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
      } else if (isInstallmentSave) {
        const baseDesc = desc.trim() || 'Compra parcelada';
        const base = Math.round((value / parcelas) * 100) / 100;
        const last = Math.round((value - base * (parcelas - 1)) * 100) / 100;
        let parentId: string | null = null;
        const novas: Transaction[] = [];
        for (let i = 0; i < parcelas; i++) {
          const id = `demo-local-${Date.now()}-${i}`;
          if (i === 0) parentId = id;
          novas.push({
            id,
            user_id: 'demo',
            type: 'out',
            description: `${baseDesc} (${i + 1}/${parcelas})`,
            amount: i === parcelas - 1 ? last : base,
            category,
            color: catColor,
            occurred_on: addMonthsToISO(occurredOn, i),
            recurring: false,
            parent_id: i === 0 ? null : parentId,
            created_at: new Date().toISOString(),
          });
        }
        setTransactions((prev) => [...novas, ...prev]);
        triggerToast(`Compra parcelada em ${parcelas}x (exemplo)`);
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
      } else if (isInstallmentSave) {
        await addInstallmentPurchase({
          description: desc.trim(),
          totalAmount: value,
          category,
          color: catColor,
          occurred_on: occurredOn,
          installments: parcelas,
        });
        triggerToast(`Compra parcelada em ${parcelas}x`);
      } else {
        const input = {
          type,
          description: desc.trim() || (type === 'in' ? 'Entrada' : 'Saída'),
          amount: value,
          category,
          color: catColor,
          occurred_on: occurredOn,
          recurring,
        };
        try {
          await addTransaction(input);
          triggerToast('Lançamento salvo');
        } catch (innerErr) {
          // Sem rede: guarda localmente em vez de perder o lançamento — sincroniza sozinho no próximo load() com sucesso.
          if (!isLikelyNetworkError(innerErr)) throw innerErr;
          await queuePendingTransaction(input);
          setPendingCount(await getPendingCount());
          triggerToast('Sem conexão — lançamento salvo localmente');
        }
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
      hapticDelete();
      triggerToast('Lançamento excluído (exemplo)');
      return;
    }
    try {
      await deleteTransaction(selectedTx.id);
      hapticDelete();
      triggerToast('Lançamento excluído');
      load();
    } catch (e: any) {
      Alert.alert('Erro ao excluir', e.message);
    }
  }

  // Transações estritamente do mês selecionado
  const monthTransactions = transactions.filter((t) => isSameMonth(t.occurred_on, selectedYear, selectedMonth));
  const monthIn = monthTransactions.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const monthOut = monthTransactions.filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);
  const monthBalance = monthIn - monthOut;

  // Categorias presentes no mês selecionado, pro filtro por categoria (cada uma com a cor do próprio lançamento).
  const categoryOptions = Array.from(
    monthTransactions.reduce((map, t) => (map.has(t.category) ? map : map.set(t.category, t.color)), new Map<string, string>())
  ).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

  // Filtrado por tipo, categoria e busca textual (descrição ou categoria) — todos dentro do mês selecionado.
  const searchQuery = search.trim().toLowerCase();
  const visible = monthTransactions.filter((t) => {
    if (filter !== 'tudo' && t.type !== filter) return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (searchQuery && !t.description.toLowerCase().includes(searchQuery) && !t.category.toLowerCase().includes(searchQuery)) return false;
    return true;
  });

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
            <VoiceEntryButton
              style={styles.headerBtn}
              iconSize={18}
              onTranscribed={(text) => {
                setVoiceText(text);
                setPasteModalOpen(true);
              }}
            />
          </View>
        </View>

        {(offline || pendingCount > 0) && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={13} color={theme.inkFaint} />
            <Text style={styles.offlineBannerText} numberOfLines={1}>
              {offline
                ? 'Sem conexão — mostrando dados salvos no aparelho'
                : `${pendingCount} lançamento${pendingCount > 1 ? 's' : ''} aguardando conexão para sincronizar`}
            </Text>
          </View>
        )}

        <MonthSelector
          year={selectedYear}
          month={selectedMonth}
          onChange={(y, m) => {
            setSelectedYear(y);
            setSelectedMonth(m);
            setCategoryFilter(null);
          }}
        />

        {/* Resumo Rápido do Mês Selecionado */}
        <View style={styles.monthSummaryCard}>
          <View style={styles.monthSummaryCol}>
            <Text style={styles.monthSummaryLabel}>Entradas</Text>
            <PrivacyValue style={{ alignItems: 'center' }}>
              <Text style={[styles.monthSummaryVal, { color: theme.up }]}>+ R$ {formatMoney(monthIn)}</Text>
            </PrivacyValue>
          </View>
          <View style={styles.monthSummaryDivider} />
          <View style={styles.monthSummaryCol}>
            <Text style={styles.monthSummaryLabel}>Saídas</Text>
            <PrivacyValue style={{ alignItems: 'center' }}>
              <Text style={[styles.monthSummaryVal, { color: theme.down }]}>− R$ {formatMoney(monthOut)}</Text>
            </PrivacyValue>
          </View>
          <View style={styles.monthSummaryDivider} />
          <View style={styles.monthSummaryCol}>
            <Text style={styles.monthSummaryLabel}>Saldo</Text>
            <PrivacyValue style={{ alignItems: 'center' }}>
              <Text style={[styles.monthSummaryVal, { color: monthBalance >= 0 ? theme.ink : theme.down }]}>
                {monthBalance >= 0 ? '+' : '−'} R$ {formatMoney(Math.abs(monthBalance))}
              </Text>
            </PrivacyValue>
          </View>
        </View>

        <SegmentedTabs
          options={[
            { key: 'tudo', label: `Tudo (${monthTransactions.length})` },
            { key: 'in', label: 'Entradas' },
            { key: 'out', label: 'Saídas' },
          ]}
          value={filter}
          onChange={(f) => setFilter(f as 'tudo' | TxType)}
        />

        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={theme.inkFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por descrição ou categoria"
            placeholderTextColor={theme.inkFaint}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <AppPressable onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={theme.inkFaint} />
            </AppPressable>
          )}
        </View>

        {categoryOptions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChipsRow}>
            <AppPressable
              onPress={() => setCategoryFilter(null)}
              style={[styles.categoryChip, !categoryFilter && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryChipText, !categoryFilter && styles.categoryChipTextActive]}>Todas</Text>
            </AppPressable>
            {categoryOptions.map(([name, color]) => {
              const active = categoryFilter === name;
              return (
                <AppPressable
                  key={name}
                  onPress={() => setCategoryFilter(active ? null : name)}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                >
                  <View style={[styles.categoryChipDot, { backgroundColor: color }]} />
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{name}</Text>
                </AppPressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.ink} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ink} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {search || categoryFilter
                ? 'Nenhum lançamento encontrado com esse filtro.'
                : 'Nenhum lançamento ainda. Toque no "+" para registrar o primeiro ou use os botões acima para colar comprovante ou importar CSV.'}
            </Text>
          }
          renderItem={({ item }) => (
            <AppPressable
              style={({ hovered }) => [styles.row, hovered && styles.rowHover]}
              onPress={() => openEditModal(item)}
              onLongPress={() => {
                setSelectedTx(item);
                setActionSheetOpen(true);
              }}
            >
              <View style={[styles.icon, { backgroundColor: item.color + '25' }]}>
                <Text style={[styles.iconText, { color: item.color }]}>{item.category.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                {/* Nome do lançamento em destaque principal */}
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.description && item.description.trim() ? item.description : item.category}
                </Text>
                {/* Categoria em hierarquia mais baixa com a cor correspondente */}
                <Text style={styles.rowSub}>
                  <Text style={{ color: item.color, fontWeight: '600' }}>{item.category}</Text>
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
        <Sheet>
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

            <TextInput maxLength={LIMITS.description}
              style={styles.descInput}
              placeholder="Descrição"
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

            <View style={{ gap: 6 }}>
              <AppPressable
                style={styles.fieldRow}
                onPress={() => setDatePickerOpen(true)}
              >
                <Text style={styles.fieldKey}>Data do lançamento</Text>
                <View style={styles.fieldVal}>
                  <Text style={styles.fieldValText}>{formatDateLabel(occurredOn)}</Text>
                  <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
                </View>
              </AppPressable>

              <View style={styles.dateQuickRow}>
                <AppPressable
                  style={[styles.dateQuickChip, occurredOn === todayISO() && styles.dateQuickChipActive]}
                  onPress={() => setOccurredOn(todayISO())}
                >
                  <Text style={[styles.dateQuickText, occurredOn === todayISO() && styles.dateQuickTextActive]}>Hoje</Text>
                </AppPressable>
                {(() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const yISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  const isCustom = occurredOn !== todayISO() && occurredOn !== yISO;
                  return (
                    <>
                      <AppPressable
                        style={[styles.dateQuickChip, occurredOn === yISO && styles.dateQuickChipActive]}
                        onPress={() => setOccurredOn(yISO)}
                      >
                        <Text style={[styles.dateQuickText, occurredOn === yISO && styles.dateQuickTextActive]}>Ontem</Text>
                      </AppPressable>
                      <AppPressable
                        style={[styles.dateQuickChip, isCustom && styles.dateQuickChipActive]}
                        onPress={() => setDatePickerOpen(true)}
                      >
                        <Text style={[styles.dateQuickText, isCustom && styles.dateQuickTextActive]}>Calendário</Text>
                      </AppPressable>
                    </>
                  );
                })()}
              </View>
            </View>



            {!installment && (
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
            )}

            {/* Parcelamento só faz sentido pra uma saída sendo criada — não pra edição nem pra entrada. */}
            {!editingTxId && type === 'out' && !recurring && (
              <View style={{ gap: 6 }}>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldKey}>Compra parcelada</Text>
                  <AppPressable
                    style={[styles.switchTrack, installment && styles.switchTrackOn]}
                    onPress={() => setInstallment((p) => !p)}
                    hitSlop={12}
                  >
                    <View style={[styles.switchThumb, installment && styles.switchThumbOn]} />
                  </AppPressable>
                </View>

                {installment && (
                  <View style={styles.installmentRow}>
                    <Text style={styles.fieldKey}>Em quantas vezes</Text>
                    <View style={styles.stepper}>
                      <AppPressable
                        style={styles.stepperBtn}
                        onPress={() => setInstallmentCount((c) => String(Math.max(2, (Number(c) || 2) - 1)))}
                        hitSlop={8}
                      >
                        <Ionicons name="remove" size={16} color={theme.ink} />
                      </AppPressable>
                      <Text style={styles.stepperVal}>{Math.max(2, Math.round(Number(installmentCount) || 2))}x</Text>
                      <AppPressable
                        style={styles.stepperBtn}
                        onPress={() => setInstallmentCount((c) => String(Math.min(60, (Number(c) || 2) + 1)))}
                        hitSlop={8}
                      >
                        <Ionicons name="add" size={16} color={theme.ink} />
                      </AppPressable>
                    </View>
                  </View>
                )}

                {installment && !!parseAmount(amount) && (
                  <Text style={styles.installmentHint}>
                    {Math.max(2, Math.round(Number(installmentCount) || 2))}x de R${' '}
                    {formatMoney(parseAmount(amount) / Math.max(2, Math.round(Number(installmentCount) || 2)))}
                  </Text>
                )}
              </View>
            )}

            <AppPressable
              style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>{editingTxId ? 'Salvar alterações' : 'Salvar lançamento'}</Text>}
            </AppPressable>
        </Sheet>
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

      {/* Paste Receipt Modal (também recebe a transcrição do lançamento por voz) */}
      <PasteReceiptModal
        visible={pasteModalOpen}
        initialText={voiceText}
        onClose={() => { setPasteModalOpen(false); setVoiceText(undefined); }}
        onSuccess={() => {
          triggerToast('Lançamento salvo');
          setVoiceText(undefined);
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
  monthSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.paperRaised,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  monthSummaryCol: { flex: 1, alignItems: 'center' },
  monthSummaryLabel: { color: theme.inkFaint, fontSize: 10.5, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  monthSummaryVal: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  monthSummaryDivider: { width: 1, height: 24, backgroundColor: theme.rule },
  dateQuickRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  dateQuickChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  dateQuickChipActive: {
    backgroundColor: theme.ink + '15',
    borderColor: theme.ink,
  },
  dateQuickText: { color: theme.inkFaint, fontSize: 11, fontWeight: '500' },
  dateQuickTextActive: { color: theme.ink, fontWeight: '600' },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  offlineBannerText: { color: theme.inkFaint, fontSize: 10.5, flexShrink: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, color: theme.ink, fontSize: 13 },
  categoryChipsRow: { gap: 6 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  categoryChipActive: { borderColor: theme.ink, backgroundColor: theme.paperRaised },
  categoryChipDot: { width: 7, height: 7, borderRadius: 3.5 },
  categoryChipText: { color: theme.inkFaint, fontSize: 11.5 },
  categoryChipTextActive: { color: theme.ink, fontWeight: '600' },
  installmentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  stepperVal: { color: theme.ink, fontSize: 13, fontWeight: '600', minWidth: 26, textAlign: 'center' },
  installmentHint: { color: theme.inkFaint, fontSize: 11, marginTop: 2 },
});



