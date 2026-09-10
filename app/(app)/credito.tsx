import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { registrarOperacaoVoz } from '@/lib/voice-operations';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAberturaPorParametro } from '@/lib/abertura-por-parametro';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppModal from '@/components/AppModal';
import FaixaOffline from '@/components/FaixaOffline';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/lib/tab-bar';
import { colunaConteudo, useBreakpoint } from '@/lib/breakpoints';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  addCreditCard,
  addInstallmentPurchase,
  addTransaction,
  deleteCreditCard,
  updateCreditCard,
  deleteTransaction,
  fetchCreditTransactionsForMonth,
  fetchCreditCards,
  fetchCategories,
  fetchRecurrenceContext,
  fetchCardInvoicePayments,
  payCardInvoice,
  reopenCardInvoice,
  updateTransaction,
  criarOcorrenciasRecorrentes,
} from '@/lib/data';
import { formatDateLabel, formatMoney, formatMonthYear, parseAmount, todayISO, formatMoneyInput } from '@/lib/format';
import { mesFaturaDoLancamento, dataVencimentoFatura, rotuloPeriodoFatura } from '@/lib/faturaCiclo';
import { agruparLancamentosPorCartao, filtrarLancamentosDaFatura } from '@/lib/creditoFaturas';
import { guessAmountFromText, guessCategoryFromText, guessDescFromText, matchCardByText, matchWalletByText, limparReferenciaCarteira, parseParcelas, parseRecorrencia } from '@/lib/heuristics';
import { ocorrenciasFaltantes } from '@/lib/recorrencia';
import { hapticDelete, hapticSuccess, hapticTap } from '@/lib/haptics';
import { scheduleCardInvoiceReminders, cancelCardInvoiceReminders, carregarNotifPrefs } from '@/lib/notifications';
import { fonts, radius, spacing, theme, screenRhythm, card as cardTokens, type, touchTarget, lh } from '@/lib/theme';
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
import ItemActionSheet from '@/components/ItemActionSheet';
import BotaoOpcoesItem from '@/components/BotaoOpcoesItem';
import Toast from '@/components/Toast';
import Sheet from '@/components/Sheet';
import FadeIn from '@/components/FadeIn';

export default function CreditoScreen() {
  const operacaoVoz = useRef<string | null>(null);
  const { paddingConteudoComFab } = useTabBarInset();
  const { ehCompacto } = useBreakpoint();
  const router = useRouter();
  const { novaCompra, texto } = useLocalSearchParams<{ novaCompra?: string; texto?: string }>();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { isDemoMode } = useDemo();
  const { activeWalletId, activeWallet, wallets } = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | 'all'>('all');

  // Mês e ano de FECHAMENTO selecionados na visão Total. Cada lançamento é
  // resolvido pelo ciclo do próprio cartão antes de entrar nesse agrupamento.
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  /* Cursor de fatura, só quando um cartão específico está selecionado — eixo
     DIFERENTE do mês civil acima, nunca reciclado de um pro outro (ver
     efeito abaixo, perto de `walletCards`). `null` até o efeito rodar pela
     primeira vez; nesse meio-tempo `viewYear`/`viewMonth` caem no mês civil,
     o que não chega a aparecer porque `selectedCardId` só sai de 'all'
     depois de um toque do usuário, e o efeito já roda antes do próximo
     paint. */
  const [faturaCardYear, setFaturaCardYear] = useState<number | null>(null);
  const [faturaCardMonth, setFaturaCardMonth] = useState<number | null>(null);

  /* O que está de fato navegado agora: mês de fechamento agregado na visão
     Total ou ciclo de fatura daquele cartão quando um está selecionado. */
  const viewYear = selectedCardId === 'all' ? selectedYear : faturaCardYear ?? selectedYear;
  const viewMonth = selectedCardId === 'all' ? selectedMonth : faturaCardMonth ?? selectedMonth;

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  function triggerToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  // Modais de Cadastro de Cartão
  const [newCardOpen, setNewCardOpen] = useState(false);
  /* Mesmo sheet serve pra criar e pra editar — quando isto tem id, o salvar
     atualiza aquele cartão em vez de criar um novo. Mesmo padrão do sheet de
     lançamento (editingTxId) e do de carteira. */
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardName, setCardName] = useState('');
  const [cardBank, setCardBank] = useState<string>(BANKS[0].id);
  const [cardDigits, setCardDigits] = useState('');
  const [cardLimit, setCardLimit] = useState('');
  const [cardClosingDay, setCardClosingDay] = useState('15');
  const [cardDueDay, setCardDueDay] = useState('22');
  const [cardSaving, setCardSaving] = useState(false);
  const [cardFormError, setCardFormError] = useState<string | null>(null);

  // Menu de ação do cartão (Editar/Excluir) — mesmo componente e gesto dos
  // lançamentos: toque no botão de opções ou toque longo no card abrem o
  // mesmo menu.
  const [cardActionSheetOpen, setCardActionSheetOpen] = useState(false);
  const [selectedCardForAction, setSelectedCardForAction] = useState<CreditCard | null>(null);

  // Modais de Lançamento no Crédito
  const [newTxOpen, setNewTxOpen] = useState(false);
  /* Mesmo sheet serve pra criar e pra editar — quando isto tem id, o salvar
     atualiza aquele lançamento em vez de criar um novo. */
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCardId, setTxCardId] = useState<string>('');
  const [txWalletId, setTxWalletId] = useState<string>('');
  const [txCategory, setTxCategory] = useState(CATEGORIES[0].name);
  const [txCatColor, setTxCatColor] = useState(CATEGORIES[0].color);
  const [txDate, setTxDate] = useState(todayISO());
  const [txInstallments, setTxInstallments] = useState('1');
  const [txRecurring, setTxRecurring] = useState(false);
  /* Categorias criadas pela pessoa. Só servem ao caminho de VOZ desta tela —
     sem elas, "ração 80 no crédito, categoria Pet" caía em "Outros", enquanto
     a mesma frase pelo WhatsApp acertava. O seletor da tela já enxerga as
     custom sozinho (CategoryPickerModal lê do banco); quem não enxergava era
     o reconhecimento do texto. */
  const [categoriasExtras, setCategoriasExtras] = useState<{ name: string; color: string }[]>([]);

  useEffect(() => {
    if (isDemoMode) return;
    fetchCategories()
      .then((cats) => setCategoriasExtras(cats.filter((c) => !c.is_default)))
      .catch(() => {});
  }, [isDemoMode]);

  /* Menu de ação da linha — mesmo componente e mesmo gesto das outras telas:
     tocar edita, segurar abre "Editar / Excluir". Antes daqui, segurar
     excluía direto, sem passar por menu nenhum. */
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
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
      /* Uma fatura nunca cobre mais que o mês civil dela mesma e o anterior
         (ver lib/faturaCiclo.ts — o corte é sempre um dia dentro desse par),
         então 2 meses civis bastam pra cobrir qualquer closing_day de 1 a
         31, seja qual for o cartão. Busca os dois pares — o mês NAVEGADO e
         o mês de HOJE — porque o carrossel mostra "Fatura atual" de TODOS
         os cartões ao mesmo tempo, não só do selecionado: sem o par de
         hoje, um cartão que não é o navegado ficaria com a fatura atual
         incompleta sempre que a tela estivesse navegada pra outro mês/
         fatura. Os dois pares se sobrepõem no caso comum (navegando perto
         de hoje) — dedup por id abaixo. */
      const [c, recurrenceContext, mesNavegado, mesAnteriorAoNavegado, mesAtualTx, mesAnteriorTx, p] =
        await Promise.all([
          fetchCreditCards(),
          fetchRecurrenceContext(),
          fetchCreditTransactionsForMonth(viewYear, viewMonth),
          fetchCreditTransactionsForMonth(viewYear, viewMonth - 1),
          fetchCreditTransactionsForMonth(now.getFullYear(), now.getMonth()),
          fetchCreditTransactionsForMonth(now.getFullYear(), now.getMonth() - 1),
          fetchCardInvoicePayments(),
        ]);

      const dedup = (txs: Transaction[]) => Array.from(new Map(txs.map((t) => [t.id, t])).values());

      /* Assinaturas no cartão ("repete a cada mês") só entram na fatura do mês
         novo se alguém criar a ocorrência — é aqui que isso acontece, tanto
         pras compras no crédito quanto pras saídas da carteira. */
      let selectedTransactions = dedup([...mesNavegado, ...mesAnteriorAoNavegado, ...mesAtualTx, ...mesAnteriorTx]);
      const faltantes = ocorrenciasFaltantes(recurrenceContext, todayISO());
      if (faltantes.length > 0) {
        await criarOcorrenciasRecorrentes(faltantes);
        const [a, b, d1, d2] = await Promise.all([
          fetchCreditTransactionsForMonth(viewYear, viewMonth),
          fetchCreditTransactionsForMonth(viewYear, viewMonth - 1),
          fetchCreditTransactionsForMonth(now.getFullYear(), now.getMonth()),
          fetchCreditTransactionsForMonth(now.getFullYear(), now.getMonth() - 1),
        ]);
        selectedTransactions = dedup([...a, ...b, ...d1, ...d2]);
      }

      setCards(c);
      setTransactions(selectedTransactions);
      setInvoicePayments(p);

      /* Lembretes de vencimento da fatura EM ABERTO agora, cartão por
         cartão — não do mês navegado na tela, e não mais do mês civil
         corrente (uma fatura que fechou dia 19 e ainda não venceu continua
         "em aberto" mesmo depois do calendário virar de mês). O par de mês
         de hoje já buscado acima cobre qualquer cartão. */
      const { lembretesContasAtivo } = await carregarNotifPrefs();
      const hoje = todayISO();
      for (const card of c) {
        const cicloAberto = mesFaturaDoLancamento(hoje, card.closing_day);
        const valorFatura = filtrarLancamentosDaFatura(
          selectedTransactions,
          c,
          card.id,
          cicloAberto.year,
          cicloAberto.month
        )
          .reduce((s, tx) => s + Number(tx.amount), 0);
        const jaPaga = p.some(
          (inv) => inv.card_id === card.id && inv.year === cicloAberto.year && inv.month === cicloAberto.month
        );
        if (lembretesContasAtivo && !jaPaga && valorFatura > 0) {
          scheduleCardInvoiceReminders(card, cicloAberto.year, cicloAberto.month, valorFatura).catch(() => {});
        } else {
          cancelCardInvoiceReminders(card.id, cicloAberto.year, cicloAberto.month).catch(() => {});
        }
      }
    } catch {
      // Falha graciosa
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode, viewYear, viewMonth]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Só a carteira ativa — "Total" mantém tudo. Mesmo filtro usado nas outras telas principais.
  const walletCards = useMemo(
    () => (activeWalletId === 'total' ? cards : cards.filter((c) => c.wallet_id === activeWalletId)),
    [activeWalletId, cards]
  );
  const walletTransactions = useMemo(
    () => (activeWalletId === 'total' ? transactions : transactions.filter((t) => t.wallet_id === activeWalletId)),
    [activeWalletId, transactions]
  );

  /* Ref só pra ler `walletCards` de dentro do efeito abaixo sem TRIGGAR ele —
     ver o motivo no próprio efeito. */
  const walletCardsRef = useRef(walletCards);
  walletCardsRef.current = walletCards;

  /* "Trocar de 'Total' para um cartão abre direto na fatura em aberto agora
     (calculada a partir de hoje), não recicla o índice do mês civil que
     estava selecionado" — decisão do design. Roda em toda TROCA de cartão
     selecionado, inclusive de um cartão pra outro direto.

     Deps só `[selectedCardId]` de propósito: se `walletCards` entrasse aqui,
     todo `loadData()` (que troca a referência de `cards`) reabriria a fatura
     em aberto e descartaria a navegação manual do usuário pra uma fatura
     passada — o efeito existe pra reagir à SELEÇÃO, não a toda atualização
     de dado. */
  useEffect(() => {
    if (selectedCardId === 'all') return;
    const card = walletCardsRef.current.find((c) => c.id === selectedCardId);
    if (!card) return;
    const ciclo = mesFaturaDoLancamento(todayISO(), card.closing_day);
    setFaturaCardYear(ciclo.year);
    setFaturaCardMonth(ciclo.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCardId]);

  /* Chegando aqui via FabButton da Início (?novaCompra=1): abre o mesmo
     modal do botão "Lançar no Crédito" — mas só depois que os cartões
     carregarem, senão o seletor de cartão do modal abriria vazio.
     `router.setParams` limpa o parâmetro depois de abrir, pra não reabrir
     sozinho numa navegação de volta a esta tela. */
  /* Chegando pelo FAB da Início (?novaCompra=1). Espera `loading` acabar
     porque, diferente das outras duas telas, aqui o formulário tem um seletor
     de cartão que abriria vazio antes dos cartões chegarem. Ver o hook para as
     duas armadilhas que ele resolve. */
  useAberturaPorParametro(novaCompra === '1' && !loading, () => {
    if (texto) {
      abrirNovaCompraDoTexto(texto);
    } else {
      abrirNovaCompra();
    }
    router.setParams({ novaCompra: undefined, texto: undefined });
  });

  /* Esta tela renderiza um carrossel de cartões e uma FlatList de compras;
     qualquer toque que mexa em estado (selecionar cartão, abrir folha, digitar
     no modal) refazia esta cadeia inteira sobre o histórico. Ela só muda de
     verdade quando muda a carteira, o mês ou o cartão selecionado. */
  // Vencimento/status só fazem sentido para um cartão específico — "Total"
  // agrega cartões com dias de vencimento diferentes.
  const selectedCard = selectedCardId === 'all' ? null : walletCards.find((c) => c.id === selectedCardId) ?? null;

  const creditTransactions = useMemo(
    () => filtrarLancamentosDaFatura(walletTransactions, walletCards, selectedCardId, viewYear, viewMonth),
    [walletTransactions, walletCards, selectedCardId, viewYear, viewMonth]
  );

  const secoesDeLancamentos = useMemo(() => {
    if (selectedCardId === 'all') return agruparLancamentosPorCartao(creditTransactions, walletCards);
    if (!selectedCard || creditTransactions.length === 0) return [];
    return [{
      chave: selectedCard.id,
      titulo: selectedCard.name,
      cor: selectedCard.color,
      cartao: selectedCard,
      data: creditTransactions,
      subtotal: creditTransactions.reduce((soma, transacao) => soma + Number(transacao.amount), 0),
    }];
  }, [selectedCardId, selectedCard, creditTransactions, walletCards]);

  const totalInvoice = useMemo(
    () => creditTransactions.reduce((s, t) => s + Number(t.amount), 0),
    [creditTransactions]
  );

  const currentInvoicePayment = selectedCard
    ? invoicePayments.find(
        (inv) => inv.card_id === selectedCard.id && inv.year === viewYear && inv.month === viewMonth
      ) ?? null
    : null;
  const invoiceDueDate = selectedCard
    ? dataVencimentoFatura(viewYear, viewMonth, selectedCard.due_day, selectedCard.closing_day)
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
    atrasada: { texto: 'Atrasada', cor: theme.danger },
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
          description: `Pagamento fatura — ${selectedCard.name} (${formatMonthYear(viewYear, viewMonth)})`,
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
          year: viewYear,
          month: viewMonth,
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
          year: viewYear,
          month: viewMonth,
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

  /* Abre o sheet em branco, pra criar. Limpa campo por campo porque o mesmo
     sheet pode ter acabado de servir pra editar um cartão existente. */
  function abrirNovoCartao() {
    setEditingCardId(null);
    setCardName('');
    setCardBank(BANKS[0].id);
    setCardDigits('');
    setCardLimit('');
    setCardClosingDay('15');
    setCardDueDay('22');
    setCardFormError(null);
    setNewCardOpen(true);
  }

  /* Abre o sheet preenchido com um cartão já cadastrado. */
  function abrirEdicaoCartao(card: CreditCard) {
    setEditingCardId(card.id);
    setCardName(card.name);
    setCardBank(card.bank);
    setCardDigits(card.last_digits ?? '');
    setCardLimit(formatMoneyInput(String(Math.round(Number(card.limit_amount || 0) * 100))));
    setCardClosingDay(String(card.closing_day));
    setCardDueDay(String(card.due_day));
    setCardFormError(null);
    setNewCardOpen(true);
  }

  // Salvar cartão (criação ou edição)
  async function handleSaveCard() {
    if (!cardName.trim()) {
      setCardFormError('Informe um nome para identificar o cartão.');
      return;
    }
    const limit = parseAmount(cardLimit);
    if (!limit || limit <= 0) {
      setCardFormError('Informe um limite total maior que zero.');
      return;
    }
    setCardFormError(null);

    const bankObj = BANKS.find((b) => b.id === cardBank) || BANKS[0];

    setCardSaving(true);
    try {
      if (editingCardId) {
        const alteracoes = {
          name: cardName.trim(),
          bank: cardBank,
          color: bankObj.color,
          last_digits: cardDigits.trim() || undefined,
          limit_amount: limit,
          closing_day: Number(cardClosingDay) || 15,
          due_day: Number(cardDueDay) || 22,
        };
        if (isDemoMode) {
          setCards((prev) => prev.map((c) => (c.id === editingCardId ? { ...c, ...alteracoes } : c)));
        } else {
          await updateCreditCard(editingCardId, alteracoes);
          await loadData();
        }
        hapticSuccess();
        triggerToast('Cartão atualizado');
      } else if (isDemoMode) {
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
        hapticSuccess();
        triggerToast('Cartão cadastrado com sucesso');
      } else {
        await addCreditCard({
          name: cardName.trim(),
          bank: cardBank,
          color: bankObj.color,
          last_digits: cardDigits.trim() || undefined,
          limit_amount: limit,
          closing_day: Number(cardClosingDay) || 15,
          due_day: Number(cardDueDay) || 22,
          wallet_id: activeWallet?.id ?? wallets.find((w) => w.is_default)?.id ?? wallets[0]?.id ?? null,
        });
        await loadData();
        hapticSuccess();
        triggerToast('Cartão cadastrado com sucesso');
      }
      setNewCardOpen(false);
      setEditingCardId(null);
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
    operacaoVoz.current = null;
    setEditingTxId(null);
    setTxDesc('');
    setTxAmount('');
    setTxInstallments('1');
    setTxRecurring(false);
    setTxDate(todayISO());
    setTxCategory(CATEGORIES[0].name);
    setTxCatColor(CATEGORIES[0].color);
    if (walletCards.length > 0) setTxCardId(walletCards[0].id);
    setNewTxOpen(true);
  }

  /* Abrir o sheet preenchido a partir de uma fala reconhecida por voz (Início
     ou Lançamentos, quando ehIntencaoCredito detecta "no crédito"/parcelamento
     e navega pra cá em vez de abrir o modal de colar comprovante). Mesmo
     extrator do modal (valor/descrição/categoria); o cartão é casado pelo
     nome/banco citado, com o primeiro cartão da carteira como reserva —
     mesmo critério do bot do WhatsApp (matchCardByText). */
  function abrirNovaCompraDoTexto(texto: string) {
    operacaoVoz.current = randomUUID();
    setEditingTxId(null);
    const carteiraCasada = matchWalletByText(texto, wallets);
    const textoFinanceiro = carteiraCasada ? limparReferenciaCarteira(texto, carteiraCasada.name) : texto;
    if (/\bparcel(?:as?|ado|ada|ei|ar)\b|\b\d+\s*(?:x|vezes)\b/i.test(textoFinanceiro) && parseParcelas(textoFinanceiro) === null) {
      Alert.alert('Confirme o parcelamento', 'Não reconheci uma quantidade válida de 2 a 36 parcelas. Repita o lançamento com a quantidade correta.');
      return;
    }
    const guessedAmount = guessAmountFromText(textoFinanceiro);
    const guessedCat = guessCategoryFromText(textoFinanceiro, categoriasExtras);
    const guessedDesc = guessDescFromText(textoFinanceiro, 'out');
    const cartoesElegiveis = carteiraCasada ? cards.filter((c) => c.wallet_id === carteiraCasada.id) : walletCards;
    const cartaoCasado = matchCardByText(textoFinanceiro, cartoesElegiveis);
    const carteiraMencionada = /\b(?:carteira|conta)\s+[\p{L}\d]/iu.test(texto);
    setTxWalletId(carteiraCasada?.id ?? (carteiraMencionada ? '' : activeWallet?.id ?? wallets.find((w) => w.is_default)?.id ?? wallets[0]?.id ?? ''));
    setTxDesc(guessedDesc);
    setTxAmount(guessedAmount > 0 ? formatMoney(guessedAmount) : '');
    setTxCategory(guessedCat.name);
    setTxCatColor(guessedCat.color);
    setTxCardId(cartaoCasado?.id || '');
    setTxInstallments(String(parseParcelas(textoFinanceiro) ?? 1));
    /* Era `false` fixo: "Netflix 39,90 no crédito todo mês" abria como compra
       avulsa e a assinatura sumia do mês seguinte. `parseRecorrencia` já
       devolve false sozinha quando há parcelamento na frase — as duas coisas
       são contraditórias e o parcelamento vence. */
    setTxRecurring(parseRecorrencia(textoFinanceiro));
    setTxDate(todayISO());
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
    setTxRecurring(!!tx.recurring);
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


    const targetCard = cards.find((c) => c.id === valores.card_id);
    if (!targetCard || (targetCard.wallet_id && targetCard.wallet_id !== valores.wallet_id)) {
      Alert.alert('Escolha o cartão', 'Selecione um cartão da carteira escolhida.');
      return;
    }
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
          /* Desligar aqui encerra a série: a geração olha `recurring` da
             cabeça, então o mês que vem simplesmente não nasce — sem apagar
             nada do que já foi cobrado. */
          recurring: valores.recurring,
          wallet_id: valores.wallet_id,
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
            recurring: n > 1 ? false : valores.recurring,
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
      } else if (operacaoVoz.current && targetCard) {
        const base = {
          type: 'out' as const, description: valores.description.trim(), amount,
          category: valores.category, color: valores.color,
          occurred_on: valores.occurred_on, payment_method: 'credit' as const,
          card_id: targetCard.id,
          wallet_id: valores.wallet_id,
        };
        const resultado = await registrarOperacaoVoz(operacaoVoz.current, 'app',
          totalInst > 1 ? { ...base, kind: 'installment', installments: totalInst }
            : { ...base, kind: 'transaction', recurring: valores.recurring });
        if (resultado.status === 'pending') Alert.alert('Salvo no aparelho', 'A compra será sincronizada quando houver conexão.');
        operacaoVoz.current = null;
        if (resultado.status !== 'pending') await loadData();
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
          wallet_id: valores.wallet_id,
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
          recurring: valores.recurring,
          payment_method: 'credit',
          bank: targetCard?.bank || 'outro',
          card_id: targetCard?.id,
          installment_current: 1,
          installment_total: 1,
          wallet_id: valores.wallet_id,
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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
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
                abrirNovoCartao();
              }}
            />
            <HeaderAction
              icon={hidden ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => {
                togglePrivacy();
                triggerToast(hidden ? 'Valores visíveis' : 'Valores ocultos');
              }}
              accessibilityLabel={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            />
            <WalletPill onPress={() => setWalletModalOpen(true)} />
          </>
        }
      />
      <FaixaOffline estilo={[colunaConteudo, { marginTop: spacing.sm }]} />

      <SectionList
        style={styles.scroll}
        sections={secoesDeLancamentos}
        keyExtractor={(tx) => tx.id}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item }) => (
          <CreditTransactionRow
            tx={item}
            onLongPress={() => {
              setSelectedTx(item);
              setActionSheetOpen(true);
            }}
          />
        )}
        renderSectionHeader={({ section }) => selectedCardId === 'all' ? (
          <View style={styles.cardSectionHeader}>
            <View style={styles.cardSectionIdentity}>
              <View style={[styles.cardSectionDot, { backgroundColor: section.cor ?? theme.inkFaint }]} />
              <View style={styles.cardSectionText}>
                <Text style={styles.cardSectionTitle}>{section.titulo}</Text>
                <Text style={styles.cardSectionPeriod}>
                  {section.cartao
                    ? `Ciclo ${rotuloPeriodoFatura(viewYear, viewMonth, section.cartao.closing_day)}`
                    : 'Sem ciclo definido'}
                </Text>
              </View>
            </View>
            <PrivacyValue>
              <Text style={styles.cardSectionSubtotal}>{`R$ ${formatMoney(section.subtotal)}`}</Text>
            </PrivacyValue>
          </View>
        ) : null}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.content, colunaConteudo, { paddingBottom: paddingConteudoComFab }]}
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
        ListHeaderComponent={
          <>
        {/* Seletor do mês de fechamento — agregado na visão Total e fatura a
            fatura quando um cartão está selecionado. */}
        <MonthSelector
          year={viewYear}
          month={viewMonth}
          mode="invoice"
          currentYear={selectedCard ? mesFaturaDoLancamento(todayISO(), selectedCard.closing_day).year : undefined}
          currentMonth={selectedCard ? mesFaturaDoLancamento(todayISO(), selectedCard.closing_day).month : undefined}
          onChange={(y, m) => {
            if (selectedCardId === 'all') {
              setSelectedYear(y);
              setSelectedMonth(m);
            } else {
              setFaturaCardYear(y);
              setFaturaCardMonth(m);
            }
          }}
        />

        {/* Carrossel de Cartões */}
        {walletCards.length > 0 ? (
          <FlatList
            horizontal
            data={walletCards}
            keyExtractor={(card) => card.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsRow}
            initialNumToRender={4}
            windowSize={5}
            renderItem={({ item: card }) => {
              const bankObj = BANKS.find((b) => b.id === card.bank);
              /* "Fatura atual" de CADA cartão do carrossel, sempre pelo ciclo
                 DAQUELE cartão (mesFaturaDoLancamento com o closing_day dele)
                 — nunca por mês civil, senão um lançamento no fim do ciclo
                 (ex.: dia 25 com fechamento dia 20) contava no mês civil
                 errado e parecia não ter "se juntado" com o resto da fatura.
                 O cartão que está com o painel de detalhe aberto embaixo
                 acompanha o ciclo NAVEGADO ali (evita a pílula do carrossel
                 mostrar um valor e o painel de baixo mostrar outro pro mesmo
                 cartão); os demais mostram a fatura REAL em aberto agora. */
              const cicloDoCard =
                selectedCardId === card.id
                  ? { year: viewYear, month: viewMonth }
                  : mesFaturaDoLancamento(todayISO(), card.closing_day);
              const cardSpent = filtrarLancamentosDaFatura(
                walletTransactions,
                walletCards,
                card.id,
                cicloDoCard.year,
                cicloDoCard.month
              )
                .reduce((s, t) => s + Number(t.amount), 0);
              const limitPct = Math.min(1, cardSpent / (card.limit_amount || 1));

              return (
                // Mesmo motivo do card de conta em contas.tsx: `BotaoOpcoesItem`
                // é `<button>` de verdade na web (react-native-web mapeia
                // accessibilityRole="button" pra a tag nativa), e não pode
                // morar DENTRO de outro `<button>` (esta `AppPressable` do
                // cartão). Vira irmão, posicionado por cima.
                <View key={card.id} style={{ position: 'relative', width: 240 }}>
                  <AppPressable
                    style={[
                      styles.creditCard,
                      { borderColor: card.color || theme.rule },
                      selectedCardId === card.id && styles.creditCardSelected,
                    ]}
                    onPress={() => {
                      hapticTap();
                      setSelectedCardId((curr) => (curr === card.id ? 'all' : card.id));
                    }}
                    accessibilityHint="Filtra os lançamentos por este cartão. Toque de novo para ver todos."
                    onLongPress={() => {
                      setSelectedCardForAction(card);
                      setCardActionSheetOpen(true);
                    }}
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
                      {/* Espaço reservado do tamanho do botão real (28×28),
                          que agora fica fora desta árvore — ver abaixo. */}
                      <View style={{ width: 28, height: 28 }} />
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
                  {/* Editar/excluir moravam só no toque longo (e excluir
                      direto, sem menu nenhum) — o mesmo defeito das linhas de
                      lançamento, com agravante: era a ÚNICA forma de mexer
                      num cartão já cadastrado em todo o app. Gesto invisível
                      pra leitor de tela e teclado. Agora abre o mesmo menu
                      Editar/Excluir que lançamentos e contas já usam. */}
                  <View style={styles.botaoOpcoesFlutuanteCartao}>
                    <BotaoOpcoesItem
                      accessibilityLabel={`Opções de ${card.name}`}
                      onPress={() => {
                        setSelectedCardForAction(card);
                        setCardActionSheetOpen(true);
                      }}
                    />
                  </View>
                </View>
              );
            }}
          />
        ) : (
          <View style={styles.emptyCardsCard}>
            <Ionicons name="card-outline" size={32} color={theme.inkFaint} />
            <Text style={styles.emptyCardsTitle}>Nenhum cartão cadastrado</Text>
            <Text style={styles.emptyCardsSub}>
              Cadastre seus cartões (Nubank, Itaú, Inter, etc.) para acompanhar faturas e limites em tempo real.
            </Text>
            <AppPressable
              style={styles.emptyCardActionBtn}
              onPress={() => abrirNovoCartao()}
            >
              <Text style={styles.emptyCardActionText}>+ Cadastrar primeiro cartão</Text>
            </AppPressable>
          </View>
        )}

        {/* Resumo da Fatura Consolidada */}
        <View style={styles.invoiceSummaryCard}>
          <View style={[styles.invoiceHeadRow, ehCompacto && styles.invoiceHeadRowCompact]}>
            <View style={[styles.invoiceInfo, ehCompacto && styles.invoiceInfoCompact]}>
              <Text style={styles.invoiceLabel}>
                {selectedCardId === 'all' ? 'Total em Faturas (Todos os Cartões)' : 'Fatura do Cartão Selecionado'}
              </Text>
              <PrivacyValue>
                <Text style={styles.invoiceTotal}>{`R$ ${formatMoney(totalInvoice)}`}</Text>
              </PrivacyValue>
              {selectedCard && invoiceDueDate && invoiceStatus && (
                <>
                  {/* Linha própria, fora da fileira com o selo: colada no
                      "Vence em" (que já tinha marcado o limite de largura
                      certo pro selo ao lado), "Fecha dia X · Vence em ..."
                      ficava comprida demais em telas estreitas, quebrava
                      linha e o selo sobrepunha o texto. Sem isso, "Setembro
                      2026" no seletor de mês acima parece mês civil por
                      engano — é o mês de FECHAMENTO da fatura, que pode ter
                      começado em agosto se o cartão fecha depois do dia 1. */}
                  <Text style={styles.invoiceClosingText}>
                    {`Ciclo ${rotuloPeriodoFatura(viewYear, viewMonth, selectedCard.closing_day)} · fecha dia ${selectedCard.closing_day}`}
                  </Text>
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
                </>
              )}
            </View>
            <AppPressable
              style={[styles.addPurchaseBtn, ehCompacto && styles.addPurchaseBtnCompact]}
              onPress={() => {
                hapticTap();
                abrirNovaCompra();
              }}
            >
              <Ionicons name="add" size={18} color={theme.paper} />
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
        <Text style={styles.sectionLabel}>
          {selectedCardId === 'all'
            ? 'Lançamentos por cartão · segure para editar ou excluir'
            : 'Lançamentos da fatura · segure para editar ou excluir'}
        </Text>
        {creditTransactions.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma compra no crédito nesta fatura.</Text>
        ) : null}
          </>
        }
        ListFooterComponent={<View style={{ height: 100 }} />}
      />

      {/* Modal: Novo/Editar Cartão de Crédito */}
      <AppModal visible={newCardOpen} animationType="slide" transparent onRequestClose={() => setNewCardOpen(false)}>
        <Sheet onClose={() => setNewCardOpen(false)}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{editingCardId ? 'Editar Cartão de Crédito' : 'Novo Cartão de Crédito'}</Text>
            <AppPressable onPress={() => setNewCardOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <TextInput
            accessibilityLabel="Nome do cartão"
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
                  cardBank === b.id && { borderColor: b.color, backgroundColor: theme.paperSelected },
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
                accessibilityLabel="Últimos 4 dígitos do cartão"
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
                accessibilityLabel="Limite total do cartão em reais"
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
                accessibilityLabel="Dia de fechamento da fatura"
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
                accessibilityLabel="Dia de vencimento da fatura"
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
            {cardSaving ? (
              <ActivityIndicator color={theme.paper} />
            ) : (
              <Text style={styles.saveBtnText}>{editingCardId ? 'Salvar Alterações' : 'Salvar Cartão'}</Text>
            )}
          </AppPressable>
          {cardFormError && (
            <Text style={styles.formError} role="alert" accessibilityLiveRegion="assertive">
              {cardFormError}
            </Text>
          )}
        </Sheet>
      </AppModal>

      <ItemActionSheet
        visible={actionSheetOpen}
        title="Lançamento"
        onClose={() => setActionSheetOpen(false)}
        onEdit={() => {
          if (selectedTx) abrirEdicaoCompra(selectedTx);
        }}
        /* Excluir daqui mantém a confirmação que a tela já tinha: o menu
           aproxima os dois botões, então a pergunta continua valendo. */
        onDelete={() => {
          if (selectedTx) confirmDeleteTx(selectedTx);
        }}
      />

      <ItemActionSheet
        visible={cardActionSheetOpen}
        title="Cartão"
        onClose={() => setCardActionSheetOpen(false)}
        onEdit={() => {
          if (selectedCardForAction) abrirEdicaoCartao(selectedCardForAction);
        }}
        onDelete={() => {
          if (selectedCardForAction) confirmDeleteCard(selectedCardForAction);
        }}
      />

      {/* Sheet de lançamento — mesmo componente da tela de Lançamentos. */}
      <TransactionSheet
        visible={newTxOpen}
        onClose={() => setNewTxOpen(false)}
        modo="credito"
        editando={!!editingTxId}
        cartoes={cards}
        carteiras={wallets}
        salvando={txSaving}
        inicial={{
          type: 'out',
          description: txDesc,
          amount: txAmount,
          category: txCategory,
          color: txCatColor,
          occurred_on: txDate,
          recurring: txRecurring,
          installments: Math.max(1, parseInt(txInstallments, 10) || 1),
          card_id: txCardId || walletCards[0]?.id || null,
          wallet_id: txWalletId || cards.find((c) => c.id === txCardId)?.wallet_id || activeWallet?.id || wallets.find((w) => w.is_default)?.id || wallets[0]?.id || '',
        }}
        onSalvar={handleSaveCreditTx}
      />

      {/* Modal: Pagar Fatura */}
      <AppModal visible={payInvoiceOpen} animationType="slide" transparent onRequestClose={() => setPayInvoiceOpen(false)}>
        <Sheet centered onClose={() => setPayInvoiceOpen(false)}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Pagar Fatura</Text>
            <AppPressable onPress={() => setPayInvoiceOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          {selectedCard && (
            <Text style={styles.inputLabel}>
              {`${selectedCard.name} — ${formatMonthYear(viewYear, viewMonth)}`}
            </Text>
          )}

          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>R$</Text>
            <TextInput
              accessibilityLabel="Valor do pagamento da fatura em reais"
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
            <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
              <Text style={styles.inputLabel}>Pagar com a carteira</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banksRow}>
                {wallets.map((w) => (
                  <AppPressable
                    key={w.id}
                    style={[
                      styles.bankChip,
                      payWalletId === w.id && { borderColor: w.color, backgroundColor: theme.paperSelected },
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
      </AppModal>

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

const CreditTransactionRow = memo(function CreditTransactionRow({
  tx,
  onLongPress,
}: {
  tx: Transaction;
  /** Abre a folha de ações do lançamento. Ligada ao toque simples E ao longo:
   *  o gesto longo sozinho não é exposto a leitor de tela nem ao teclado. */
  onLongPress: () => void;
}) {
  return (
    <AppPressable
      style={({ hovered }) => [styles.txRow, hovered && { backgroundColor: theme.hover }]}
      onPress={onLongPress}
      onLongPress={onLongPress}
    >
      <View style={styles.txInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.icone }}>
          <Text style={styles.txDesc}>{tx.description}</Text>
          {tx.installment_total && tx.installment_total > 1 ? (
            <View style={styles.instBadge}>
              <Text style={styles.instBadgeText}>{`${tx.installment_current || 1}/${tx.installment_total}x`}</Text>
            </View>
          ) : null}
          {tx.recurring ? (
            <Ionicons name="repeat" size={13} color={theme.inkFaint} accessibilityLabel="Cobrança recorrente" />
          ) : null}
        </View>
        <Text style={styles.txDate}>{`${formatDateLabel(tx.occurred_on)} • ${tx.category}`}</Text>
      </View>
      <PrivacyValue>
        <Text style={styles.txAmount}>{`− R$ ${formatMoney(Number(tx.amount))}`}</Text>
      </PrivacyValue>
    </AppPressable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.paper },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: spacing.icone,
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
  /* `paddingVertical` maior que o resto das seções de propósito. O ritmo
     padrão (`screenRhythm.gap`, 12) separa bem um rótulo de um card, mas aqui
     o vizinho de baixo é OUTRO card, e o de cima pode estar com a borda de
     seleção acesa — dois blocos sólidos a 12+4 de distância leem como
     encostados, que foi o "espaçamento quase zero" relatado. Com 12 aqui, a
     folga real abaixo do carrossel vira 24. */
  cardsRow: { gap: spacing.md, paddingVertical: spacing.md },
  creditCard: {
    width: 240,
    borderRadius: radius.lg,
    backgroundColor: theme.paperRaised,
    padding: spacing.md,
    borderWidth: 1.5,
    gap: spacing.sm,
  },
  creditCardSelected: {
    backgroundColor: theme.paperSelected,
  },
  botaoOpcoesFlutuanteCartao: { position: 'absolute', top: spacing.md, right: spacing.md, pointerEvents: 'box-none' },
  cardTopRow: {
    flexDirection: 'row',
    /* flex-start, e não center: a coluna ao lado tem duas linhas (apelido e
       dígitos), então centralizar deixaria a bolinha flutuando entre elas em
       vez de marcar o início. */
    alignItems: 'flex-start',
    gap: spacing.icone,
  },
  cardIdentidade: { flexShrink: 1, gap: spacing.fio },
  cardBankTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
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
    lineHeight: lh(type.nota, 'apoio'),
    color: theme.ink,
  },
  cardDigits: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    lineHeight: lh(type.micro, 'apoio'),
    color: theme.inkFaint,
  },
  cardMidRow: { gap: spacing.fio, marginVertical: spacing.xs },
  cardInvoiceLabel: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    lineHeight: lh(type.micro, 'apoio'),
    color: theme.inkFaint,
  },
  cardInvoiceValue: {
    fontFamily: fonts.regular,
    fontSize: type.titulo,
    lineHeight: lh(type.titulo, 'valor'),
    color: theme.down,
  },
  cardBottomRow: { gap: spacing.xs },
  /* Cartão do carrossel tem só 240px de largura fixa — "Limite: R$
     12.345,67" cresce com o valor real cadastrado e colidia com a
     porcentagem ao lado sem espaço nenhum pra ceder. */
  cardLimitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: 2,
  },
  cardLimitText: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    lineHeight: lh(type.micro, 'apoio'),
    color: theme.inkFaint,
    flexShrink: 1,
  },
  cardLimitPct: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    lineHeight: lh(type.micro, 'apoio'),
    color: theme.accent2,
  },
  limitTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.superficieInativa,
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
    lineHeight: lh(type.corpo, 'corpo'),
    color: theme.ink,
  },
  emptyCardsSub: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.inkFaint,
    textAlign: 'center',
    /* Texto de estado vazio quebra em duas linhas de verdade — entra em
       `corpo`, não em `apoio`. Era `16` fixo, que na web (legenda = 14) dava
       1,14×. */
    lineHeight: lh(type.legenda, 'corpo'),
  },
  emptyCardActionBtn: {
    marginTop: spacing.xs,
    backgroundColor: 'rgba(174,255,227,0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  invoiceHeadRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  /* `gap` porque o rótulo e o valor estavam encostados: "Total em Faturas
     (Todos os Cartões)" quebra em duas linhas e a segunda ficava colada no
     "R$ 0,00" logo abaixo. Todo outro bloco empilhado da tela já tem folga
     (cardIdentidade 2, cardMidRow 2, cardBottomRow 4); este era o único sem. */
  invoiceInfo: { flex: 1, minWidth: 168, gap: spacing.fio },
  invoiceInfoCompact: { width: '100%', minWidth: 0 },
  invoiceLabel: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'corpo'),
    color: theme.inkFaint,
  },
  invoiceTotal: {
    fontFamily: fonts.regular,
    fontSize: type.destaque,
    lineHeight: lh(type.destaque, 'valor'),
    color: theme.down,
  },
  invoiceClosingText: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'),
    color: theme.inkFaint,
    marginTop: spacing.xs,
  },
  invoiceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
    marginTop: spacing.fio,
  },
  invoiceDueText: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'),
    color: theme.inkFaint,
  },
  invoiceStatusBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.fio,
  },
  invoiceStatusText: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    lineHeight: lh(type.micro, 'apoio'),
  },
  payInvoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.icone,
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
    gap: spacing.xs,
    backgroundColor: theme.accent2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    justifyContent: 'center',
    flexGrow: 1,
    minHeight: touchTarget,
  },
  addPurchaseBtnCompact: { width: '100%', flexGrow: 0 },
  addPurchaseBtnText: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    color: theme.paper,
  },
  sectionLabel: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'corpo'),
    color: theme.inkFaint,
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  cardSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.ruleStrong,
  },
  cardSectionIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
    flexShrink: 1,
  },
  cardSectionText: {
    flexShrink: 1,
    gap: spacing.fio,
  },
  cardSectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardSectionTitle: {
    fontFamily: fonts.regular,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'titulo'),
    color: theme.ink,
    flexShrink: 1,
  },
  cardSectionPeriod: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    lineHeight: lh(type.micro, 'apoio'),
    color: theme.inkFaint,
  },
  cardSectionSubtotal: {
    fontFamily: fonts.regular,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'valor'),
    fontVariant: ['tabular-nums'],
    color: theme.down,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: type.nota,
    lineHeight: lh(type.nota, 'corpo'),
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
  txInfo: { flex: 1, gap: spacing.fio },
  txDesc: {
    fontFamily: fonts.regular,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'corpo'),
    color: theme.ink,
  },
  instBadge: {
    backgroundColor: 'rgba(174,255,227,0.12)',
    paddingHorizontal: spacing.icone,
    paddingVertical: 1,
    borderRadius: 4,
  },
  instBadgeText: {
    fontFamily: fonts.regular,
    fontSize: type.micro,
    lineHeight: lh(type.micro, 'apoio'),
    color: theme.accent2,
  },
  txDate: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'),
    color: theme.inkFaint,
  },
  txAmount: {
    fontFamily: fonts.regular,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'valor'),
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
    lineHeight: lh(type.titulo, 'titulo'),
    color: theme.ink,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    color: theme.ink,
    fontSize: type.apoio,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
  },
  inputLabel: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'),
    color: theme.inkFaint,
    marginTop: spacing.xs,
  },
  banksRow: {
    flexDirection: 'row',
    gap: spacing.icone,
    paddingVertical: spacing.xs,
  },
  bankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
    paddingHorizontal: 10,
    paddingVertical: spacing.icone,
    borderRadius: radius.pill,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  bankChipText: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'),
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
    gap: spacing.icone,
    borderBottomWidth: 1,
    borderBottomColor: theme.ruleStrong,
    paddingBottom: spacing.icone,
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
    fontVariant: ['tabular-nums'],
  },
  fieldRow: {
    flex: 1,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    gap: spacing.fio,
  },
  fieldKey: {
    fontFamily: fonts.regular,
    fontSize: type.legenda,
    lineHeight: lh(type.legenda, 'apoio'),
    color: theme.inkFaint,
  },
  fieldVal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
  },
  fieldValText: {
    fontFamily: fonts.regular,
    fontSize: type.nota,
    lineHeight: lh(type.nota, 'apoio'),
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
  formError: { color: theme.danger, fontFamily: fonts.regular, fontSize: type.legenda, marginTop: spacing.xs },
});
