import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
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
import { addCreditCard, addInstallmentPurchase, addTransaction, deleteCreditCard, deleteTransaction, fetchCreditCards, fetchTransactions } from '@/lib/data';
import { formatDateLabel, formatMoney, isSameMonth, parseAmount, todayISO } from '@/lib/format';
import { hapticDelete, hapticSuccess, hapticTap } from '@/lib/haptics';
import { fonts, radius, spacing, theme } from '@/lib/theme';
import { BANKS, CATEGORIES, type BankInfo, type CreditCard, type Transaction } from '@/lib/types';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { DEMO_CREDIT_CARDS, DEMO_TRANSACTIONS } from '@/lib/demo-data';
import { LIMITS } from '@/lib/limits';
import AppPressable from '@/components/AppPressable';
import PrivacyValue from '@/components/PrivacyValue';
import MonthSelector from '@/components/MonthSelector';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import DatePickerModal from '@/components/DatePickerModal';
import Toast from '@/components/Toast';
import Sheet from '@/components/Sheet';
import FadeIn from '@/components/FadeIn';

export default function CreditoScreen() {
  const router = useRouter();
  const { hidden } = usePrivacy();
  const { isDemoMode } = useDemo();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | 'all'>('all');

  // Mês e Ano Selecionados
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  function triggerToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  // Modais de Cadastro de Cartão
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardBank, setCardBank] = useState<string>(BANKS[0].id);
  const [cardDigits, setCardDigits] = useState('');
  const [cardLimit, setCardLimit] = useState('');
  const [cardClosingDay, setCardClosingDay] = useState('15');
  const [cardDueDay, setCardDueDay] = useState('22');
  const [cardSaving, setCardSaving] = useState(false);

  // Modais de Lançamento no Crédito
  const [newTxOpen, setNewTxOpen] = useState(false);
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCardId, setTxCardId] = useState<string>('');
  const [txCategory, setTxCategory] = useState(CATEGORIES[0].name);
  const [txCatColor, setTxCatColor] = useState(CATEGORIES[0].color);
  const [txDate, setTxDate] = useState(todayISO());
  const [txInstallments, setTxInstallments] = useState('1');
  const [txSaving, setTxSaving] = useState(false);

  // Pickers auxiliares
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (isDemoMode) {
      setCards(DEMO_CREDIT_CARDS);
      setTransactions(DEMO_TRANSACTIONS);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [c, t] = await Promise.all([fetchCreditCards(), fetchTransactions()]);
      setCards(c);
      setTransactions(t);
    } catch {
      // Falha graciosa
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Filtra compras no cartão no mês selecionado
  const creditTransactions = transactions.filter((t) => {
    const isCredit = t.payment_method === 'credit' || t.card_id;
    const sameMonth = isSameMonth(t.occurred_on, selectedYear, selectedMonth);
    const cardMatch = selectedCardId === 'all' || t.card_id === selectedCardId;
    return isCredit && sameMonth && cardMatch;
  });

  const totalInvoice = creditTransactions.reduce((s, t) => s + Number(t.amount), 0);

  // Salvar novo cartão
  async function handleSaveCard() {
    if (!cardName.trim()) {
      Alert.alert('Nome obrigatório', 'Dê um nome para identificar o cartão.');
      return;
    }
    const limit = parseAmount(cardLimit);
    if (!limit || limit <= 0) {
      Alert.alert('Limite inválido', 'Informe o limite total do cartão.');
      return;
    }

    const bankObj = BANKS.find((b) => b.id === cardBank) || BANKS[0];

    setCardSaving(true);
    try {
      if (isDemoMode) {
        const fakeCard: CreditCard = {
          id: `card-${Date.now()}`,
          user_id: 'demo',
          name: cardName.trim(),
          bank: cardBank,
          color: bankObj.color,
          last_digits: cardDigits.trim() || undefined,
          limit_amount: limit,
          closing_day: Number(cardClosingDay) || 15,
          due_day: Number(cardDueDay) || 22,
          created_at: new Date().toISOString(),
        };
        setCards((prev) => [...prev, fakeCard]);
      } else {
        await addCreditCard({
          name: cardName.trim(),
          bank: cardBank,
          color: bankObj.color,
          last_digits: cardDigits.trim() || undefined,
          limit_amount: limit,
          closing_day: Number(cardClosingDay) || 15,
          due_day: Number(cardDueDay) || 22,
        });
        await loadData();
      }
      hapticSuccess();
      triggerToast('Cartão cadastrado com sucesso');
      setNewCardOpen(false);
      setCardName('');
      setCardDigits('');
      setCardLimit('');
    } catch (e: any) {
      Alert.alert('Erro ao salvar cartão', e.message);
    } finally {
      setCardSaving(false);
    }
  }

  // Salvar compra no cartão
  async function handleSaveCreditTx() {
    if (!txDesc.trim()) {
      Alert.alert('Descrição obrigatória', 'Informe onde o gasto foi feito.');
      return;
    }
    const amount = parseAmount(txAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Valor inválido', 'Informe o valor da compra.');
      return;
    }

    const targetCard = cards.find((c) => c.id === txCardId) || cards[0];
    const totalInst = Math.max(1, parseInt(txInstallments, 10) || 1);

    setTxSaving(true);
    try {
      if (isDemoMode) {
        /* Mesmo critério do caminho real: parcelado vira N lançamentos, um
           por mês, cada um com a fração do valor — senão a fatura do mês da
           compra mostraria o valor total de uma compra de 10x inteiro. */
        const n = Math.max(1, totalInst);
        const base = Math.round((amount / n) * 100) / 100;
        const lastAmount = Math.round((amount - base * (n - 1)) * 100) / 100;
        const fakeRows: Transaction[] = Array.from({ length: n }, (_, i) => {
          const d = new Date(txDate + 'T00:00:00');
          d.setMonth(d.getMonth() + i);
          const pad = (v: number) => String(v).padStart(2, '0');
          return {
            id: `tx-${Date.now()}-${i}`,
            user_id: 'demo',
            type: 'out',
            description: n > 1 ? `${txDesc.trim()} (${i + 1}/${n})` : txDesc.trim(),
            amount: i === n - 1 ? lastAmount : base,
            category: txCategory,
            color: txCatColor,
            occurred_on: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            recurring: false,
            parent_id: null,
            payment_method: 'credit',
            bank: targetCard?.bank || 'outro',
            card_id: targetCard?.id,
            installment_current: i + 1,
            installment_total: n,
            created_at: new Date().toISOString(),
          };
        });
        setTransactions((prev) => [...fakeRows, ...prev]);
      } else if (totalInst > 1) {
        await addInstallmentPurchase({
          description: txDesc.trim(),
          totalAmount: amount,
          category: txCategory,
          color: txCatColor,
          occurred_on: txDate,
          installments: totalInst,
          payment_method: 'credit',
          bank: targetCard?.bank || 'outro',
          card_id: targetCard?.id,
        });
        await loadData();
      } else {
        await addTransaction({
          type: 'out',
          description: txDesc.trim(),
          amount,
          category: txCategory,
          color: txCatColor,
          occurred_on: txDate,
          recurring: false,
          payment_method: 'credit',
          bank: targetCard?.bank || 'outro',
          card_id: targetCard?.id,
          installment_current: 1,
          installment_total: 1,
        });
        await loadData();
      }
      hapticSuccess();
      triggerToast('Gasto no crédito registrado');
      setNewTxOpen(false);
      setTxDesc('');
      setTxAmount('');
      setTxInstallments('1');
    } catch (e: any) {
      Alert.alert('Erro ao salvar compra', e.message);
    } finally {
      setTxSaving(false);
    }
  }

  function confirmDeleteCard(card: CreditCard) {
    Alert.alert('Excluir cartão', `Remover "${card.name}"? Os lançamentos já feitos nele continuam no histórico, só perdem o vínculo com o cartão.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          if (isDemoMode) {
            setCards((prev) => prev.filter((c) => c.id !== card.id));
            if (selectedCardId === card.id) setSelectedCardId('all');
            triggerToast('Cartão removido (exemplo)');
            return;
          }
          try {
            await deleteCreditCard(card.id);
            if (selectedCardId === card.id) setSelectedCardId('all');
            triggerToast('Cartão removido');
            await loadData();
          } catch (e: any) {
            Alert.alert('Erro ao excluir cartão', e.message);
          }
        },
      },
    ]);
  }

  function confirmDeleteTx(tx: Transaction) {
    Alert.alert('Excluir lançamento', `Remover "${tx.description}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          if (isDemoMode) {
            setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
            hapticDelete();
            triggerToast('Lançamento excluído (exemplo)');
            return;
          }
          try {
            await deleteTransaction(tx.id);
            hapticDelete();
            triggerToast('Lançamento excluído');
            await loadData();
          } catch (e: any) {
            Alert.alert('Erro ao excluir', e.message);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.ink} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {/* Header Fixo */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>cartões & faturas</Text>
          <Text style={styles.title}>Crédito</Text>
        </View>
        <AppPressable
          style={({ hovered }) => [styles.addCardBtn, hovered && styles.addCardBtnHover]}
          onPress={() => {
            hapticTap();
            setNewCardOpen(true);
          }}
        >
          <Ionicons name="card-outline" size={16} color={theme.accent2} />
          <Text style={styles.addCardBtnText}>+ Cartão</Text>
        </AppPressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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
        {/* Seletor de Mês */}
        <MonthSelector
          year={selectedYear}
          month={selectedMonth}
          onChange={(y, m) => {
            setSelectedYear(y);
            setSelectedMonth(m);
          }}
        />

        {/* Carrossel de Cartões */}
        {cards.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {cards.map((card) => {
              const bankObj = BANKS.find((b) => b.id === card.bank);
              const cardSpent = transactions
                .filter((t) => t.card_id === card.id && isSameMonth(t.occurred_on, selectedYear, selectedMonth))
                .reduce((s, t) => s + Number(t.amount), 0);
              const limitPct = Math.min(1, cardSpent / (card.limit_amount || 1));

              return (
                <AppPressable
                  key={card.id}
                  style={[
                    styles.creditCard,
                    { borderColor: card.color || theme.rule },
                    selectedCardId === card.id && styles.creditCardSelected,
                  ]}
                  onPress={() => {
                    hapticTap();
                    setSelectedCardId((curr) => (curr === card.id ? 'all' : card.id));
                  }}
                  onLongPress={() => confirmDeleteCard(card)}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardBankTag}>
                      <View style={[styles.bankDot, { backgroundColor: card.color }]} />
                      <Text style={styles.cardBankName}>{card.name}</Text>
                    </View>
                    <Text style={styles.cardDigits}>{card.last_digits ? `•••• ${card.last_digits}` : ''}</Text>
                  </View>

                  <View style={styles.cardMidRow}>
                    <Text style={styles.cardInvoiceLabel}>Fatura atual</Text>
                    <PrivacyValue>
                      <Text style={styles.cardInvoiceValue}>{`R$ ${formatMoney(cardSpent)}`}</Text>
                    </PrivacyValue>
                  </View>

                  <View style={styles.cardBottomRow}>
                    <View style={styles.cardLimitRow}>
                      <Text style={styles.cardLimitText}>{`Limite: R$ ${formatMoney(card.limit_amount)}`}</Text>
                      <Text style={styles.cardLimitPct}>{`${Math.round(limitPct * 100)}%`}</Text>
                    </View>
                    <View style={styles.limitTrack}>
                      <View style={[styles.limitFill, { width: `${limitPct * 100}%`, backgroundColor: card.color }]} />
                    </View>
                  </View>
                </AppPressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptyCardsCard}>
            <Ionicons name="card-outline" size={32} color={theme.inkFaint} />
            <Text style={styles.emptyCardsTitle}>Nenhum cartão cadastrado</Text>
            <Text style={styles.emptyCardsSub}>
              Cadastre seus cartões (Nubank, Itaú, Inter, etc.) para acompanhar faturas e limites em tempo real.
            </Text>
            <AppPressable
              style={styles.emptyCardActionBtn}
              onPress={() => setNewCardOpen(true)}
            >
              <Text style={styles.emptyCardActionText}>+ Cadastrar primeiro cartão</Text>
            </AppPressable>
          </View>
        )}

        {/* Resumo da Fatura Consolidada */}
        <View style={styles.invoiceSummaryCard}>
          <View style={styles.invoiceHeadRow}>
            <View>
              <Text style={styles.invoiceLabel}>
                {selectedCardId === 'all' ? 'Total em Faturas (Todos os Cartões)' : 'Fatura do Cartão Selecionado'}
              </Text>
              <PrivacyValue>
                <Text style={styles.invoiceTotal}>{`R$ ${formatMoney(totalInvoice)}`}</Text>
              </PrivacyValue>
            </View>
            <AppPressable
              style={styles.addPurchaseBtn}
              onPress={() => {
                hapticTap();
                if (cards.length > 0) setTxCardId(cards[0].id);
                setNewTxOpen(true);
              }}
            >
              <Ionicons name="add" size={18} color="#052229" />
              <Text style={styles.addPurchaseBtnText}>Lançar no Crédito</Text>
            </AppPressable>
          </View>
        </View>

        {/* Lista de Compras no Crédito */}
        <Text style={styles.sectionLabel}>Lançamentos da Fatura · segure para excluir</Text>
        {creditTransactions.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma compra no crédito neste mês.</Text>
        ) : (
          creditTransactions.map((tx) => (
            <AppPressable
              key={tx.id}
              style={({ hovered }) => [styles.txRow, hovered && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
              onLongPress={() => confirmDeleteTx(tx)}
            >
              <View style={styles.txInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.txDesc}>{tx.description}</Text>
                  {tx.installment_total && tx.installment_total > 1 ? (
                    <View style={styles.instBadge}>
                      <Text style={styles.instBadgeText}>{`${tx.installment_current || 1}/${tx.installment_total}x`}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.txDate}>{`${formatDateLabel(tx.occurred_on)} • ${tx.category}`}</Text>
              </View>
              <PrivacyValue>
                <Text style={styles.txAmount}>{`− R$ ${formatMoney(Number(tx.amount))}`}</Text>
              </PrivacyValue>
            </AppPressable>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal: Novo Cartão de Crédito */}
      <Modal visible={newCardOpen} animationType="slide" transparent onRequestClose={() => setNewCardOpen(false)}>
        <Sheet>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Novo Cartão de Crédito</Text>
            <AppPressable onPress={() => setNewCardOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <TextInput
            maxLength={LIMITS.description}
            style={styles.input}
            placeholder="Nome do cartão (ex: Nubank Black)"
            placeholderTextColor={theme.inkFaint}
            value={cardName}
            onChangeText={setCardName}
          />

          <Text style={styles.inputLabel}>Banco Emissor</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banksRow}>
            {BANKS.map((b) => (
              <AppPressable
                key={b.id}
                style={[
                  styles.bankChip,
                  cardBank === b.id && { borderColor: b.color, backgroundColor: 'rgba(255,255,255,0.08)' },
                ]}
                onPress={() => setCardBank(b.id)}
              >
                <View style={[styles.bankDot, { backgroundColor: b.color }]} />
                <Text style={[styles.bankChipText, cardBank === b.id && { color: theme.ink, fontWeight: '700' }]}>
                  {b.name}
                </Text>
              </AppPressable>
            ))}
          </ScrollView>

          <View style={styles.row2Cols}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Últimos 4 dígitos</Text>
              <TextInput
                maxLength={4}
                style={styles.input}
                placeholder="4092"
                placeholderTextColor={theme.inkFaint}
                keyboardType="number-pad"
                value={cardDigits}
                onChangeText={setCardDigits}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Limite Total (R$)</Text>
              <TextInput
                maxLength={LIMITS.amount}
                style={styles.input}
                placeholder="5.000,00"
                placeholderTextColor={theme.inkFaint}
                keyboardType="decimal-pad"
                value={cardLimit}
                onChangeText={setCardLimit}
              />
            </View>
          </View>

          <AppPressable
            style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
            onPress={handleSaveCard}
            disabled={cardSaving}
          >
            {cardSaving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>Salvar Cartão</Text>}
          </AppPressable>
        </Sheet>
      </Modal>

      {/* Modal: Nova Compra no Crédito */}
      <Modal visible={newTxOpen} animationType="slide" transparent onRequestClose={() => setNewTxOpen(false)}>
        <Sheet>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Lançar Compra no Crédito</Text>
            <AppPressable onPress={() => setNewTxOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <TextInput
            maxLength={LIMITS.description}
            style={styles.input}
            placeholder="Descrição — ex: Supermercado"
            placeholderTextColor={theme.inkFaint}
            value={txDesc}
            onChangeText={setTxDesc}
          />

          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>R$</Text>
            <TextInput
              maxLength={LIMITS.amount}
              style={styles.amountInput}
              placeholder="0,00"
              placeholderTextColor={theme.inkFaint}
              keyboardType="decimal-pad"
              value={txAmount}
              onChangeText={setTxAmount}
            />
          </View>

          {/* Seletor de Cartão */}
          {cards.length > 0 && (
            <View style={{ gap: 4, marginTop: 4 }}>
              <Text style={styles.inputLabel}>Cartão / Banco</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banksRow}>
                {cards.map((c) => (
                  <AppPressable
                    key={c.id}
                    style={[
                      styles.bankChip,
                      txCardId === c.id && { borderColor: c.color, backgroundColor: 'rgba(255,255,255,0.08)' },
                    ]}
                    onPress={() => setTxCardId(c.id)}
                  >
                    <View style={[styles.bankDot, { backgroundColor: c.color }]} />
                    <Text style={[styles.bankChipText, txCardId === c.id && { color: theme.ink, fontWeight: '700' }]}>
                      {c.name}
                    </Text>
                  </AppPressable>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.row2Cols}>
            <AppPressable
              style={styles.fieldRow}
              onPress={() => setCatPickerOpen(true)}
            >
              <Text style={styles.fieldKey}>Categoria</Text>
              <View style={styles.fieldVal}>
                <View style={[styles.bankDot, { backgroundColor: txCatColor }]} />
                <Text style={styles.fieldValText}>{txCategory}</Text>
              </View>
            </AppPressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.fieldKey}>Parcelas</Text>
              <TextInput
                maxLength={2}
                style={[styles.input, { paddingVertical: 4 }]}
                placeholder="1"
                placeholderTextColor={theme.inkFaint}
                keyboardType="number-pad"
                value={txInstallments}
                onChangeText={setTxInstallments}
              />
            </View>
          </View>

          <AppPressable
            style={styles.fieldRow}
            onPress={() => setDatePickerOpen(true)}
          >
            <Text style={styles.fieldKey}>Data da Compra</Text>
            <Text style={styles.fieldValText}>{formatDateLabel(txDate)}</Text>
          </AppPressable>

          <AppPressable
            style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
            onPress={handleSaveCreditTx}
            disabled={txSaving}
          >
            {txSaving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>Confirmar Gasto no Crédito</Text>}
          </AppPressable>
        </Sheet>
      </Modal>

      {/* Pickers */}
      <CategoryPickerModal
        visible={catPickerOpen}
        currentCategory={txCategory}
        onClose={() => setCatPickerOpen(false)}
        onSelectCategory={(cat) => {
          setTxCategory(cat.name);
          setTxCatColor(cat.color);
          setCatPickerOpen(false);
        }}
      />

      <DatePickerModal
        visible={datePickerOpen}
        currentISO={txDate}
        title="Data da compra"
        onClose={() => setDatePickerOpen(false)}
        onSelectDate={(iso) => {
          setTxDate(iso);
          setDatePickerOpen(false);
        }}
      />

      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
    fontSize: 22,
    fontWeight: '700',
    color: theme.ink,
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(174,255,227,0.1)',
    borderWidth: 1,
    borderColor: theme.rule,
  },
  addCardBtnHover: {
    borderColor: theme.accent2,
  },
  addCardBtnText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    fontWeight: '700',
    color: theme.accent2,
  },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  cardsRow: { gap: spacing.md, paddingVertical: 4 },
  creditCard: {
    width: 240,
    borderRadius: radius.lg,
    backgroundColor: theme.paperRaised,
    padding: spacing.md,
    borderWidth: 1.5,
    gap: spacing.sm,
  },
  creditCardSelected: {
    backgroundColor: '#0c353e',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBankTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bankDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardBankName: {
    fontFamily: fonts.regular,
    fontSize: 12,
    fontWeight: '700',
    color: theme.ink,
  },
  cardDigits: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: theme.inkFaint,
  },
  cardMidRow: { gap: 2, marginVertical: 4 },
  cardInvoiceLabel: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: theme.inkFaint,
    textTransform: 'uppercase',
  },
  cardInvoiceValue: {
    fontFamily: fonts.regular,
    fontSize: 18,
    fontWeight: '700',
    color: theme.down,
  },
  cardBottomRow: { gap: 4 },
  cardLimitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLimitText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: theme.inkFaint,
  },
  cardLimitPct: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: theme.accent2,
    fontWeight: '600',
  },
  limitTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  limitFill: {
    height: '100%',
    borderRadius: 2,
  },
  emptyCardsCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  emptyCardsTitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    fontWeight: '700',
    color: theme.ink,
  },
  emptyCardsSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkFaint,
    textAlign: 'center',
    lineHeight: 16,
  },
  emptyCardActionBtn: {
    marginTop: 4,
    backgroundColor: 'rgba(174,255,227,0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  emptyCardActionText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    fontWeight: '700',
    color: theme.accent2,
  },
  invoiceSummaryCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  invoiceHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  invoiceLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkFaint,
  },
  invoiceTotal: {
    fontFamily: fonts.regular,
    fontSize: 20,
    fontWeight: '700',
    color: theme.down,
  },
  addPurchaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.accent2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addPurchaseBtnText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    fontWeight: '700',
    color: '#052229',
  },
  sectionLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: theme.inkFaint,
    paddingVertical: spacing.md,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  txInfo: { flex: 1, gap: 2 },
  txDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    fontWeight: '600',
    color: theme.ink,
  },
  instBadge: {
    backgroundColor: 'rgba(174,255,227,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  instBadgeText: {
    fontFamily: fonts.regular,
    fontSize: 9,
    fontWeight: '700',
    color: theme.accent2,
  },
  txDate: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkFaint,
  },
  txAmount: {
    fontFamily: fonts.regular,
    fontSize: 13,
    fontWeight: '700',
    color: theme.down,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    fontFamily: fonts.regular,
    fontSize: 17,
    fontWeight: '700',
    color: theme.ink,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    color: theme.ink,
    fontSize: 13,
    paddingVertical: 8,
    fontFamily: fonts.regular,
  },
  inputLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkFaint,
    marginTop: spacing.xs,
  },
  banksRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  bankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  bankChipText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkSoft,
  },
  row2Cols: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.ruleStrong,
    paddingBottom: 6,
  },
  amountPrefix: {
    color: theme.inkFaint,
    fontSize: 20,
    fontFamily: fonts.regular,
  },
  amountInput: {
    color: theme.ink,
    fontSize: 28,
    flex: 1,
    fontFamily: fonts.regular,
  },
  fieldRow: {
    flex: 1,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    gap: 2,
  },
  fieldKey: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: theme.inkFaint,
  },
  fieldVal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fieldValText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: theme.ink,
  },
  saveBtn: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveBtnHover: {
    opacity: 0.88,
  },
  saveBtnText: {
    color: theme.paper,
    fontFamily: fonts.regular,
    fontSize: 13,
    fontWeight: '700',
  },
});
