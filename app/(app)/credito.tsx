import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/lib/tab-bar';
import { colunaConteudo } from '@/lib/breakpoints';
import { Ionicons } from '@expo/vector-icons';
import {
  addCreditCard,
  addInstallmentPurchase,
  addTransaction,
  deleteCreditCard,
  deleteTransaction,
  fetchCreditCards,
  fetchTransactions,
  fetchCardInvoicePayments,
  payCardInvoice,
  reopenCardInvoice,
  updateTransaction,
} from '@/lib/data';
import { formatDateLabel, formatMoney, formatMonthYear, isSameMonth, parseAmount, todayISO, formatMoneyInput } from '@/lib/format';
import { hapticDelete, hapticSuccess, hapticTap } from '@/lib/haptics';
import { scheduleCardInvoiceReminders, cancelCardInvoiceReminders, carregarNotifPrefs } from '@/lib/notifications';
import { fonts, radius, spacing, theme, screenRhythm, card as cardTokens, type } from '@/lib/theme';
import { BANKS, CATEGORIES, type BankInfo, type CreditCard, type CreditCardInvoicePayment, type Transaction } from '@/lib/types';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { useWallet } from '@/lib/wallet-context';
import { DEMO_CREDIT_CARDS, DEMO_TRANSACTIONS } from '@/lib/demo-data';
import { LIMITS } from '@/lib/limits';
import AppPressable from '@/components/AppPressable';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderAction from '@/components/HeaderAction';
import WalletPickerModal from '@/components/WalletPickerModal';
import WalletPill from '@/components/WalletPill';
import PrivacyValue from '@/components/PrivacyValue';
import MonthSelector from '@/components/MonthSelector';
import DatePickerModal from '@/components/DatePickerModal';
import TransactionSheet, { type ValoresLancamento } from '@/components/TransactionSheet';
import Toast from '@/components/Toast';
import Sheet from '@/components/Sheet';
import FadeIn from '@/components/FadeIn';

export default function CreditoScreen() {
  const { paddingConteudo } = useTabBarInset();
  const router = useRouter();
  const { novaCompra } = useLocalSearchParams<{ novaCompra?: string }>();
  const { hidden } = usePrivacy();
  const { isDemoMode } = useDemo();
  const { activeWalletId, activeWallet, wallets } = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

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
  /* Mesmo sheet serve pra criar e pra editar — quando isto tem id, o salvar
     atualiza aquele lançamento em vez de criar um novo. */
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCardId, setTxCardId] = useState<string>('');
  const [txCategory, setTxCategory] = useState(CATEGORIES[0].name);
  const [txCatColor, setTxCatColor] = useState(CATEGORIES[0].color);
  const [txDate, setTxDate] = useState(todayISO());
  const [txInstallments, setTxInstallments] = useState('1');
  const [txSaving, setTxSaving] = useState(false);


  // Pagamento de fatura
  const [invoicePayments, setInvoicePayments] = useState<CreditCardInvoicePayment[]>([]);
  const [payInvoiceOpen, setPayInvoiceOpen] = useState(false);
  const [payWalletId, setPayWalletId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [payDatePickerOpen, setPayDatePickerOpen] = useState(false);
  const [paySaving, setPaySaving] = useState(false);

  const loadData = useCallback(async () => {
    if (isDemoMode) {
      setCards(DEMO_CREDIT_CARDS);
      setTransactions(DEMO_TRANSACTIONS);
      setInvoicePayments([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [c, t, p] = await Promise.all([fetchCreditCards(), fetchTransactions(), fetchCardInvoicePayments()]);
      setCards(c);
      setTransactions(t);
      setInvoicePayments(p);

      // Lembretes de vencimento da fatura do mês corrente real (não o mês
      // navegado na tela) — mesmo padrão de "reagenda tudo a cada load" que
      // app/(app)/contas.tsx já usa para boletos.
      const hoje = new Date();
      const anoAtual = hoje.getFullYear();
      const mesAtual = hoje.getMonth();
      const { lembretesContasAtivo } = await carregarNotifPrefs();
      for (const card of c) {
        const valorFatura = t
          .filter(
            (tx) =>
              (tx.payment_method === 'credit' || tx.card_id) &&
              tx.card_id === card.id &&
              isSameMonth(tx.occurred_on, anoAtual, mesAtual)
          )
          .reduce((s, tx) => s + Number(tx.amount), 0);
        const jaPaga = p.some((inv) => inv.card_id === card.id && inv.year === anoAtual && inv.month === mesAtual);
        if (lembretesContasAtivo && !jaPaga && valorFatura > 0) {
          scheduleCardInvoiceReminders(card, anoAtual, mesAtual, valorFatura).catch(() => {});
        } else {
          cancelCardInvoiceReminders(card.id, anoAtual, mesAtual).catch(() => {});
        }
      }
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

  // Só a carteira ativa — "Total" mantém tudo. Mesmo filtro usado nas outras telas principais.
  const walletCards = activeWalletId === 'total' ? cards : cards.filter((c) => c.wallet_id === activeWalletId);
  const walletTransactions =
    activeWalletId === 'total' ? transactions : transactions.filter((t) => t.wallet_id === activeWalletId);

  /* Chegando aqui via FabButton da Início (?novaCompra=1): abre o mesmo
     modal do botão "Lançar no Crédito" — mas só depois que os cartões
     carregarem, senão o seletor de cartão do modal abriria vazio.
     `router.setParams` limpa o parâmetro depois de abrir, pra não reabrir
     sozinho numa navegação de volta a esta tela. */
  useEffect(() => {
    if (novaCompra !== '1' || loading || newTxOpen) return;
    abrirNovaCompra();
    router.setParams({ novaCompra: undefined });
  }, [novaCompra, loading, newTxOpen, walletCards]);

  // Filtra compras no cartão no mês selecionado
  const creditTransactions = walletTransactions.filter((t) => {
    const isCredit = t.payment_method === 'credit' || t.card_id;
    const sameMonth = isSameMonth(t.occurred_on, selectedYear, selectedMonth);
    const cardMatch = selectedCardId === 'all' || t.card_id === selectedCardId;
    return isCredit && sameMonth && cardMatch;
  });

  const totalInvoice = creditTransactions.reduce((s, t) => s + Number(t.amount), 0);

  // Vencimento/status só fazem sentido para um cartão específico — "Total"
  // agrega cartões com dias de vencimento diferentes.
  const selectedCard = selectedCardId === 'all' ? null : walletCards.find((c) => c.id === selectedCardId) ?? null;
  const currentInvoicePayment = selectedCard
    ? invoicePayments.find(
        (inv) => inv.card_id === selectedCard.id && inv.year === selectedYear && inv.month === selectedMonth
      ) ?? null
    : null;
  const invoiceDueDate = selectedCard
    ? (() => {
        const mesVencimento = selectedCard.due_day >= selectedCard.closing_day ? selectedMonth : selectedMonth + 1;
        return new Date(selectedYear, mesVencimento, selectedCard.due_day);
      })()
    : null;
  const invoiceStatus: 'paga' | 'atrasada' | 'vence-hoje' | 'aberta' | null = !selectedCard
    ? null
    : currentInvoicePayment
    ? 'paga'
    : (() => {
        if (!invoiceDueDate) return 'aberta';
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const venc = new Date(invoiceDueDate);
        venc.setHours(0, 0, 0, 0);
        if (venc.getTime() === hoje.getTime()) return 'vence-hoje';
        if (venc.getTime() < hoje.getTime()) return 'atrasada';
        return 'aberta';
      })();
  const INVOICE_STATUS_LABEL: Record<'paga' | 'atrasada' | 'vence-hoje' | 'aberta', { texto: string; cor: string }> = {
    paga: { texto: 'Paga ✓', cor: theme.up },
    atrasada: { texto: 'Atrasada', cor: '#e08a7d' },
    'vence-hoje': { texto: 'Vence hoje', cor: theme.accent2 },
    aberta: { texto: 'Aberta', cor: theme.inkFaint },
  };

  function abrirPagarFatura() {
    if (!selectedCard) return;
    hapticTap();
    setPayWalletId(selectedCard.wallet_id ?? activeWallet?.id ?? wallets[0]?.id ?? null);
    setPayAmount(formatMoney(totalInvoice));
    setPayDate(todayISO());
    setPayInvoiceOpen(true);
  }

  async function handlePayInvoice() {
    if (!selectedCard) return;
    const amount = parseAmount(payAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Valor inválido', 'Informe o valor pago da fatura.');
      return;
    }
    setPaySaving(true);
    try {
      if (isDemoMode) {
        const fakeTx: Transaction = {
          id: `tx-${Date.now()}`,
          user_id: 'demo',
          type: 'out',
          description: `Pagamento fatura — ${selectedCard.name} (${formatMonthYear(selectedYear, selectedMonth)})`,
          amount,
          category: 'Cartão de crédito',
          color: selectedCard.color,
          occurred_on: payDate,
          recurring: false,
          parent_id: null,
          wallet_id: payWalletId,
          created_at: new Date().toISOString(),
        };
        const fakePayment: CreditCardInvoicePayment = {
          id: `inv-${Date.now()}`,
          user_id: 'demo',
          card_id: selectedCard.id,
          year: selectedYear,
          month: selectedMonth,
          amount,
          paid_on: payDate,
          wallet_id: payWalletId,
          paid_transaction_id: fakeTx.id,
          created_at: new Date().toISOString(),
        };
        setTransactions((prev) => [fakeTx, ...prev]);
        setInvoicePayments((prev) => [...prev, fakePayment]);
      } else {
        await payCardInvoice({
          card: selectedCard,
          year: selectedYear,
          month: selectedMonth,
          amount,
          paid_on: payDate,
          wallet_id: payWalletId,
        });
        await loadData();
      }
      hapticSuccess();
      triggerToast('Fatura paga');
      setPayInvoiceOpen(false);
    } catch (e: any) {
      Alert.alert('Erro ao pagar fatura', e.message);
    } finally {
      setPaySaving(false);
    }
  }

  function confirmReopenInvoice() {
    if (!currentInvoicePayment) return;
    Alert.alert('Desfazer pagamento', 'A saída lançada para essa fatura será removida.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desfazer',
        style: 'destructive',
        onPress: async () => {
          if (isDemoMode) {
            setTransactions((prev) => prev.filter((t) => t.id !== currentInvoicePayment.paid_transaction_id));
            setInvoicePayments((prev) => prev.filter((inv) => inv.id !== currentInvoicePayment.id));
            triggerToast('Pagamento desfeito (exemplo)');
            return;
          }
          try {
            await reopenCardInvoice(currentInvoicePayment);
            triggerToast('Pagamento desfeito');
            await loadData();
          } catch (e: any) {
            Alert.alert('Erro ao desfazer pagamento', e.message);
          }
        },
      },
    ]);
  }

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
          wallet_id: activeWallet?.id ?? null,
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

  /* Abrir o sheet em branco. Precisa limpar campo por campo porque o mesmo
     sheet pode ter acabado de ser usado pra editar — sem isto, "Lançar no
     Crédito" abriria com os dados do último lançamento aberto. */
  function abrirNovaCompra() {
    setEditingTxId(null);
    setTxDesc('');
    setTxAmount('');
    setTxInstallments('1');
    setTxDate(todayISO());
    setTxCategory(CATEGORIES[0].name);
    setTxCatColor(CATEGORIES[0].color);
    if (walletCards.length > 0) setTxCardId(walletCards[0].id);
    setNewTxOpen(true);
  }

  /* Abrir o sheet já preenchido com um lançamento existente. */
  function abrirEdicaoCompra(tx: Transaction) {
    setEditingTxId(tx.id);
    setTxDesc(tx.description);
    setTxAmount(formatMoney(Number(tx.amount)));
    setTxCardId(tx.card_id || walletCards[0]?.id || '');
    setTxCategory(tx.category);
    setTxCatColor(tx.color);
    setTxDate(tx.occurred_on);
    setTxInstallments('1');
    setNewTxOpen(true);
  }

  // Salvar compra no cartão (criação ou edição — o sheet devolve os valores)
  async function handleSaveCreditTx(valores: ValoresLancamento) {
    if (!valores.description.trim()) {
      Alert.alert('Descrição obrigatória', 'Informe onde o gasto foi feito.');
      return;
    }
    const amount = parseAmount(valores.amount);
    if (!amount || amount <= 0) {
      Alert.alert('Valor inválido', 'Informe o valor da compra.');
      return;
    }


    const targetCard = walletCards.find((c) => c.id === valores.card_id) || walletCards[0];
    const totalInst = Math.max(1, valores.installments);

    setTxSaving(true);
    try {
      if (editingTxId) {
        /* Editar não mexe em parcelamento: alterar o número de parcelas de
           uma compra já lançada significaria apagar e recriar N linhas, e
           cada parcela é uma transação própria. Aqui edita-se só a linha
           aberta — mesma regra que o Lançamentos já aplica. */
        const alteracoes = {
          description: valores.description.trim(),
          amount,
          category: valores.category,
          color: valores.color,
          occurred_on: valores.occurred_on,
          card_id: targetCard?.id,
          bank: targetCard?.bank || 'outro',
        };
        if (isDemoMode) {
          setTransactions((prev) =>
            prev.map((t) => (t.id === editingTxId ? { ...t, ...alteracoes } : t))
          );
        } else {
          await updateTransaction(editingTxId, alteracoes);
          await loadData();
        }
        hapticSuccess();
        triggerToast('Lançamento atualizado');
        setNewTxOpen(false);
        setEditingTxId(null);
        setTxDesc('');
        setTxAmount('');
        setTxInstallments('1');
        return;
      }

      if (isDemoMode) {
        /* Mesmo critério do caminho real: parcelado vira N lançamentos, um
           por mês, cada um com a fração do valor — senão a fatura do mês da
           compra mostraria o valor total de uma compra de 10x inteiro. */
        const n = Math.max(1, totalInst);
        const base = Math.round((amount / n) * 100) / 100;
        const lastAmount = Math.round((amount - base * (n - 1)) * 100) / 100;
        const fakeRows: Transaction[] = Array.from({ length: n }, (_, i) => {
          const d = new Date(valores.occurred_on + 'T00:00:00');
          d.setMonth(d.getMonth() + i);
          const pad = (v: number) => String(v).padStart(2, '0');
          return {
            id: `tx-${Date.now()}-${i}`,
            user_id: 'demo',
            type: 'out',
            description: n > 1 ? `${valores.description.trim()} (${i + 1}/${n})` : valores.description.trim(),
            amount: i === n - 1 ? lastAmount : base,
            category: valores.category,
            color: valores.color,
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
          description: valores.description.trim(),
          totalAmount: amount,
          category: valores.category,
          color: valores.color,
          occurred_on: valores.occurred_on,
          installments: totalInst,
          payment_method: 'credit',
          bank: targetCard?.bank || 'outro',
          card_id: targetCard?.id,
          wallet_id: targetCard?.wallet_id ?? activeWallet?.id ?? null,
        });
        await loadData();
      } else {
        await addTransaction({
          type: 'out',
          description: valores.description.trim(),
          amount,
          category: valores.category,
          color: valores.color,
          occurred_on: valores.occurred_on,
          recurring: false,
          payment_method: 'credit',
          bank: targetCard?.bank || 'outro',
          card_id: targetCard?.id,
          installment_current: 1,
          installment_total: 1,
          wallet_id: targetCard?.wallet_id ?? activeWallet?.id ?? null,
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
      <ScreenHeader
        eyebrow="Cartões & faturas"
        title="Crédito"
        right={
          <>
            <HeaderAction
              icon="card-outline"
              label="+ Cartão"
              onPress={() => {
                hapticTap();
                setNewCardOpen(true);
              }}
            />
            <WalletPill onPress={() => setWalletModalOpen(true)} />
          </>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, colunaConteudo, { paddingBottom: paddingConteudo }]}
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
        {walletCards.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardsRow}>
            {walletCards.map((card) => {
              const bankObj = BANKS.find((b) => b.id === card.bank);
              const cardSpent = walletTransactions
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
                  {/* Dígitos EMBAIXO do apelido, não ao lado. Lado a lado, um
                      apelido longo ("Itaú Personalité Black") empurrava até
                      encostar nos números e os dois viravam uma palavra só —
                      e o cartão do carrossel é estreito demais para caber os
                      dois na mesma linha com folga confiável. */}
                  <View style={styles.cardTopRow}>
                    <View style={[styles.bankDot, { backgroundColor: card.color }]} />
                    <View style={styles.cardIdentidade}>
                      <Text style={styles.cardBankName} numberOfLines={1}>{card.name}</Text>
                      {card.last_digits ? (
                        <Text style={styles.cardDigits}>{`•••• ${card.last_digits}`}</Text>
                      ) : null}
                    </View>
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
              {selectedCard && invoiceDueDate && invoiceStatus && (
                <View style={styles.invoiceStatusRow}>
                  <Text style={styles.invoiceDueText}>{`Vence em ${formatDateLabel(
                    `${invoiceDueDate.getFullYear()}-${String(invoiceDueDate.getMonth() + 1).padStart(2, '0')}-${String(
                      invoiceDueDate.getDate()
                    ).padStart(2, '0')}`
                  )}`}</Text>
                  <View style={[styles.invoiceStatusBadge, { borderColor: INVOICE_STATUS_LABEL[invoiceStatus].cor }]}>
                    <Text style={[styles.invoiceStatusText, { color: INVOICE_STATUS_LABEL[invoiceStatus].cor }]}>
                      {INVOICE_STATUS_LABEL[invoiceStatus].texto}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            <AppPressable
              style={styles.addPurchaseBtn}
              onPress={() => {
                hapticTap();
                abrirNovaCompra();
              }}
            >
              <Ionicons name="add" size={18} color="#052229" />
              <Text style={styles.addPurchaseBtnText}>Lançar no Crédito</Text>
            </AppPressable>
          </View>

          {selectedCard && totalInvoice > 0 && (
            invoiceStatus === 'paga' ? (
              <AppPressable style={styles.undoPayBtn} onPress={confirmReopenInvoice}>
                <Text style={styles.undoPayBtnText}>Desfazer pagamento</Text>
              </AppPressable>
            ) : (
              <AppPressable style={styles.payInvoiceBtn} onPress={abrirPagarFatura}>
                <Ionicons name="checkmark-circle-outline" size={16} color={theme.paper} />
                <Text style={styles.payInvoiceBtnText}>Pagar Fatura</Text>
              </AppPressable>
            )
          )}
        </View>

        {/* Lista de Compras no Crédito */}
        <Text style={styles.sectionLabel}>Lançamentos da Fatura · toque para editar, segure para excluir</Text>
        {creditTransactions.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma compra no crédito neste mês.</Text>
        ) : (
          creditTransactions.map((tx) => (
            <AppPressable
              key={tx.id}
              style={({ hovered }) => [styles.txRow, hovered && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
              onPress={() => abrirEdicaoCompra(tx)}
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
        <Sheet onClose={() => setNewCardOpen(false)}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Novo Cartão de Crédito</Text>
            <AppPressable onPress={() => setNewCardOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
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
                <Text style={[styles.bankChipText, cardBank === b.id && { color: theme.ink}]}>
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
                keyboardType="number-pad"
                value={cardLimit}
                onChangeText={(t) => setCardLimit(formatMoneyInput(t))}
              />
            </View>
          </View>

          <View style={styles.row2Cols}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Fechamento (dia)</Text>
              <TextInput
                maxLength={2}
                style={styles.input}
                placeholder="15"
                placeholderTextColor={theme.inkFaint}
                keyboardType="number-pad"
                value={cardClosingDay}
                onChangeText={setCardClosingDay}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Vencimento (dia)</Text>
              <TextInput
                maxLength={2}
                style={styles.input}
                placeholder="22"
                placeholderTextColor={theme.inkFaint}
                keyboardType="number-pad"
                value={cardDueDay}
                onChangeText={setCardDueDay}
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

      {/* Sheet de lançamento — mesmo componente da tela de Lançamentos. */}
      <TransactionSheet
        visible={newTxOpen}
        onClose={() => setNewTxOpen(false)}
        modo="credito"
        editando={!!editingTxId}
        cartoes={walletCards}
        salvando={txSaving}
        inicial={{
          type: 'out',
          description: txDesc,
          amount: txAmount,
          category: txCategory,
          color: txCatColor,
          occurred_on: txDate,
          recurring: false,
          installments: Math.max(1, parseInt(txInstallments, 10) || 1),
          card_id: txCardId || walletCards[0]?.id || null,
        }}
        onSalvar={handleSaveCreditTx}
      />

      {/* Modal: Pagar Fatura */}
      <Modal visible={payInvoiceOpen} animationType="slide" transparent onRequestClose={() => setPayInvoiceOpen(false)}>
        <Sheet onClose={() => setPayInvoiceOpen(false)}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Pagar Fatura</Text>
            <AppPressable onPress={() => setPayInvoiceOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          {selectedCard && (
            <Text style={styles.inputLabel}>
              {`${selectedCard.name} — ${formatMonthYear(selectedYear, selectedMonth)}`}
            </Text>
          )}

          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>R$</Text>
            <TextInput
              maxLength={LIMITS.amount}
              style={styles.amountInput}
              placeholder="0,00"
              placeholderTextColor={theme.inkFaint}
              keyboardType="number-pad"
              value={payAmount}
              onChangeText={(t) => setPayAmount(formatMoneyInput(t))}
            />
          </View>

          {wallets.length > 0 && (
            <View style={{ gap: 4, marginTop: 4 }}>
              <Text style={styles.inputLabel}>Pagar com a carteira</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banksRow}>
                {wallets.map((w) => (
                  <AppPressable
                    key={w.id}
                    style={[
                      styles.bankChip,
                      payWalletId === w.id && { borderColor: w.color, backgroundColor: 'rgba(255,255,255,0.08)' },
                    ]}
                    onPress={() => setPayWalletId(w.id)}
                  >
                    <View style={[styles.bankDot, { backgroundColor: w.color }]} />
                    <Text style={[styles.bankChipText, payWalletId === w.id && { color: theme.ink}]}>
                      {w.name}
                    </Text>
                  </AppPressable>
                ))}
              </ScrollView>
            </View>
          )}

          <AppPressable style={styles.fieldRow} onPress={() => setPayDatePickerOpen(true)}>
            <Text style={styles.fieldKey}>Data do Pagamento</Text>
            <Text style={styles.fieldValText}>{formatDateLabel(payDate)}</Text>
          </AppPressable>

          <AppPressable
            style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
            onPress={handlePayInvoice}
            disabled={paySaving}
          >
            {paySaving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>Confirmar Pagamento</Text>}
          </AppPressable>
        </Sheet>
      </Modal>

      <DatePickerModal
        visible={payDatePickerOpen}
        currentISO={payDate}
        title="Data do pagamento"
        onClose={() => setPayDatePickerOpen(false)}
        onSelectDate={(iso) => {
          setPayDate(iso);
          setPayDatePickerOpen(false);
        }}
      />

      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />

      <WalletPickerModal visible={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.paper },
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
    fontSize: type.legenda,
    color: theme.accent2,
  },
  scroll: { flex: 1 },
  content: { padding: screenRhythm.padding, gap: screenRhythm.gap },
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
    /* flex-start, e não center: a coluna ao lado tem duas linhas (apelido e
       dígitos), então centralizar deixaria a bolinha flutuando entre elas em
       vez de marcar o início. */
    alignItems: 'flex-start',
    gap: 6,
  },
  cardIdentidade: { flexShrink: 1, gap: 2 },
  cardBankTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bankDot: {
    marginTop: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardBankName: {
    fontFamily: fonts.regular,
    fontSize: type.nota,
    color: theme.ink,
  },
  cardDigits: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    color: theme.inkFaint,
  },
  cardMidRow: { gap: 2, marginVertical: 4 },
  cardInvoiceLabel: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    color: theme.inkFaint,
  },
  cardInvoiceValue: {
    fontFamily: fonts.regular,
    fontSize: type.titulo,
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
    fontSize: type.micro,
    color: theme.inkFaint,
  },
  cardLimitPct: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    color: theme.accent2,
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
    borderRadius: cardTokens.radius,
    padding: cardTokens.padding,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: cardTokens.borderWidth,
    borderColor: theme.rule,
  },
  emptyCardsTitle: {
    fontFamily: fonts.regular,
    fontSize: type.corpo,
    color: theme.ink,
  },
  emptyCardsSub: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
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
    fontSize: type.legenda,
    color: theme.accent2,
  },
  invoiceSummaryCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: cardTokens.radius,
    padding: cardTokens.padding,
    borderWidth: cardTokens.borderWidth,
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
    fontSize: type.legenda,
    color: theme.inkFaint,
  },
  invoiceTotal: {
    fontFamily: fonts.regular,
    fontSize: type.destaque,
    color: theme.down,
  },
  invoiceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  invoiceDueText: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkFaint,
  },
  invoiceStatusBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  invoiceStatusText: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
  },
  payInvoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 11,
    marginTop: spacing.sm,
  },
  payInvoiceBtnText: {
    fontFamily: fonts.regular,
    fontSize: type.apoio,
    color: theme.paper,
  },
  undoPayBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: spacing.sm,
  },
  undoPayBtnText: {
    fontFamily: fonts.regular,
    fontSize: type.nota,
    color: theme.inkFaint,
    textDecorationLine: 'underline',
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
    fontSize: type.legenda,
    color: '#052229',
  },
  sectionLabel: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkFaint,
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: type.nota,
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
    fontSize: type.apoio,
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
    fontSize: type.micro,
    color: theme.accent2,
  },
  txDate: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkFaint,
  },
  txAmount: {
    fontFamily: fonts.regular,
    fontSize: type.apoio,
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
    fontSize: type.titulo,
    color: theme.ink,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    color: theme.ink,
    fontSize: type.apoio,
    paddingVertical: 8,
    fontFamily: fonts.regular,
  },
  inputLabel: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
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
    fontSize: type.legenda,
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
    fontSize: type.destaque,
    fontFamily: fonts.regular,
  },
  amountInput: {
    color: theme.ink,
    fontSize: type.marca,
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
    fontSize: type.legenda,
    color: theme.inkFaint,
  },
  fieldVal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fieldValText: {
    fontFamily: fonts.regular,
    fontSize: type.nota,
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
    fontSize: type.apoio,
  },
});
