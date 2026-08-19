import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/lib/tab-bar';
import { Ionicons } from '@expo/vector-icons';
import { addBill, addTransaction, deleteBudget, deleteTransaction, fetchBills, fetchBudgets, fetchCreditCards, fetchTransactions, updateTransaction, upsertBudget } from '@/lib/data';
import { carregarLayoutHome, salvarLayoutHome, type HomeBlockConfig } from '@/lib/home-layout';
import { createGoal, deleteGoal, depositToGoal, fetchGamification, fetchGoals } from '@/lib/goals';
import { calcularSafeToSpend, projetarComprometimentoFuturo, sugerirEvolucaoArquetipo } from '@/lib/projections';
import { ARQUETIPOS, carregarDiagnostico, type DiagnosticoCarregado } from '@/lib/diagnostico';
import { formatMoney, formatDateLabel, parseAmount, saudacaoDoDia, todayISO, formatMoneyInput } from '@/lib/format';
import { hapticDelete } from '@/lib/haptics';
import { carregarPerfil, nomeDeExibicao, type Perfil } from '@/lib/profile';
import PrivacyValue from '@/components/PrivacyValue';
import { theme, radius, spacing, screenRhythm, card as cardTokens } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { useSession } from '@/lib/auth-context';
import { useWallet } from '@/lib/wallet-context';
import { DEMO_BILLS, DEMO_BUDGETS, DEMO_GOALS, DEMO_LIFETIME_XP, DEMO_TRANSACTIONS } from '@/lib/demo-data';
import type { Bill, Budget, Goal, Transaction, TxType } from '@/lib/types';
import PieChart, { type PieSlice } from '@/components/PieChart';
import FlowChart, { ChartPeriod } from '@/components/FlowChart';
import CategoryChips from '@/components/CategoryChips';
import AppPressable from '@/components/AppPressable';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderAction from '@/components/HeaderAction';
import WalletPickerModal from '@/components/WalletPickerModal';
import WalletPill from '@/components/WalletPill';
import PasteReceiptModal from '@/components/PasteReceiptModal';
import VoiceEntryButton from '@/components/VoiceEntryButton';
import CsvImportModal from '@/components/CsvImportModal';
import QrScannerModal from '@/components/QrScannerModal';
import MonthlyWrappedModal from '@/components/MonthlyWrappedModal';
import {
  gerarMonthlyWrapped,
  marcarWrappedVisto,
  wrappedJaVisto,
  type MonthlyWrapped,
} from '@/lib/monthly-wrapped';
import BudgetTemplatesModal from '@/components/BudgetTemplatesModal';
import OnboardingModal from '@/components/OnboardingModal';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import ItemActionSheet from '@/components/ItemActionSheet';
import Toast from '@/components/Toast';
import FabButton from '@/components/FabButton';
import FadeIn from '@/components/FadeIn';
import Sheet from '@/components/Sheet';
import SegmentedTabs from '@/components/SegmentedTabs';
import MonthSelector from '@/components/MonthSelector';
import GoalsCarousel from '@/components/GoalsCarousel';
import SafeToSpendCard from '@/components/SafeToSpendCard';
import FutureTimelineChart from '@/components/FutureTimelineChart';
import CreditSummaryCard from '@/components/CreditSummaryCard';
import HomeCustomizerModal from '@/components/HomeCustomizerModal';
import { isSameMonth } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { DEMO_CREDIT_CARDS } from '@/lib/demo-data';
import type { CreditCard } from '@/lib/types';


type ChartView = 'in' | 'out' | 'both';


export default function InicioScreen() {
  const { paddingConteudo } = useTabBarInset();
  const router = useRouter();
  const { hidden, toggle } = usePrivacy();
  const { isDemoMode } = useDemo();
  const { session } = useSession();
  const { activeWalletId, activeWallet, activeWalletName, activeWalletColor, updateSaldosComTransacoes } = useWallet();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [lifetimeXp, setLifetimeXp] = useState(0);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCarregado | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [homeLayout, setHomeLayout] = useState<HomeBlockConfig[]>([]);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nomeExibicao, setNomeExibicao] = useState('');
  const [chartView, setChartView] = useState<ChartView>('in');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('month');

  // Mês e Ano Selecionados (inicializa com o mês atual)
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());


  // Modals state
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState(CATEGORIES[0].name);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);

  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [voiceText, setVoiceText] = useState<string | undefined>(undefined);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [wrapped, setWrapped] = useState<MonthlyWrapped | null>(null);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // New Transaction Sheet
  const [txSheetOpen, setTxSheetOpen] = useState(false);
  const [txType, setTxType] = useState<TxType>('out');
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState(CATEGORIES[0].name);
  const [txCatColor, setTxCatColor] = useState(CATEGORIES[0].color);
  const [txDate, setTxDate] = useState(todayISO());
  const [txRecurring, setTxRecurring] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [txSaving, setTxSaving] = useState(false);

  // New Bill Sheet
  const [billSheetOpen, setBillSheetOpen] = useState(false);
  const [billDesc, setBillDesc] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState(CATEGORIES[CATEGORIES.length - 1].name);
  const [billCatColor, setBillCatColor] = useState(CATEGORIES[CATEGORIES.length - 1].color);
  const [billDueDate, setBillDueDate] = useState(todayISO());
  const [billRecurring, setBillRecurring] = useState(false);
  const [billSaving, setBillSaving] = useState(false);

  // Date and Category pickers
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'tx' | 'bill'>('tx');
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [catPickerTarget, setCatPickerTarget] = useState<'tx' | 'bill' | 'budget'>('tx');

  // Item Long Press Action Sheet
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  function triggerToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  // Diagnóstico inicial (onboarding) abre sozinho no primeiro login de cada
  // conta neste aparelho — a flag fica salva localmente por usuário, então
  // não repete depois que a pessoa já respondeu ou fechou uma vez.
  const userId = session?.user.id;
  useEffect(() => {
    if (isDemoMode || !userId) return;
    (async () => {
      const seen = await AsyncStorage.getItem(`grana_onboarding_seen_${userId}`);
      if (!seen) setOnboardingOpen(true);
    })();
  }, [userId, isDemoMode]);

  function markOnboardingSeen() {
    if (userId) AsyncStorage.setItem(`grana_onboarding_seen_${userId}`, '1');
  }

  const load = useCallback(async () => {
    if (isDemoMode) {
      setTransactions(DEMO_TRANSACTIONS);
      setBills(DEMO_BILLS);
      setBudgets(DEMO_BUDGETS);
      setGoals(DEMO_GOALS);
      setLifetimeXp(DEMO_LIFETIME_XP);
      setCreditCards(DEMO_CREDIT_CARDS);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      // Cofrinhos e XP vitalício (goals/user_gamification) são tabelas mais
      // novas que podem ainda não existir num banco que não rodou o SQL
      // mais recente. Buscados fora do Promise.all principal para que uma
      // falha ali (tabela ausente, RLS não aplicada) nunca derrube os dados
      // já estabelecidos — sem isso, um `throw` num `fetchGoals` zerava a
      // Home inteira, inclusive lançamentos que já estavam funcionando.
      const [tx, b, bg, cc] = await Promise.all([
        fetchTransactions(),
        fetchBills(),
        fetchBudgets(),
        fetchCreditCards(),
      ]);
      setTransactions(tx);
      setBills(b);
      setBudgets(bg);
      setCreditCards(cc);
      setError(null);

      try {
        setGoals(await fetchGoals());
      } catch {
        setGoals([]);
      }
      try {
        setLifetimeXp((await fetchGamification()).lifetime_xp);
      } catch {
        setLifetimeXp(0);
      }
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar dados');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode]);

  /* Atalhos por deep link (grana://add-tx, scan-qr, safe-to-spend). O
     roteamento acontece em app/(app)/_layout.tsx, que empurra a ação para cá
     como query param; aqui só executamos. Os params são limpos logo em
     seguida com replace — sem isso, voltar para a Home reabriria o mesmo
     modal, porque a rota continuaria carregando o parâmetro. */
  const params = useLocalSearchParams<{
    acao?: string; amount?: string; desc?: string; type?: string; category?: string;
  }>();

  useEffect(() => {
    if (!params.acao) return;

    if (params.acao === 'add-tx') {
      openTxModal(params.type === 'in' ? 'in' : 'out', params.category);
      if (params.amount) setTxAmount(params.amount);
      if (params.desc) setTxDesc(params.desc);
    } else if (params.acao === 'scan-qr') {
      setQrModalOpen(true);
    }
    // 'safe-to-spend' já cumpriu o papel só de trazer o usuário para a Home,
    // onde o card "Livre para gastar" mora.

    router.replace('/(app)/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.acao, params.amount, params.desc, params.type, params.category]);

  /* Retrospectiva do mês fechado: monta a partir dos dados já carregados e
     abre uma vez só por mês. Espera `loading` terminar para não gerar um
     "resumo" de listas ainda vazias, e nunca abre no modo de exemplo — um
     wrapped de dados fictícios não diz nada sobre o mês da pessoa. */
  useEffect(() => {
    if (loading || isDemoMode || onboardingOpen) return;
    const w = gerarMonthlyWrapped(transactions, bills, budgets, lifetimeXp);
    if (w.vazio) return;
    let cancelado = false;
    wrappedJaVisto(w.chave).then((visto) => {
      if (cancelado || visto) return;
      setWrapped(w);
      setWrappedOpen(true);
    });
    return () => {
      cancelado = true;
    };
  }, [loading, isDemoMode, onboardingOpen, transactions, bills, budgets, lifetimeXp]);

  // Recalcula o saldo por carteira sempre que as transações mudam — o
  // WalletProvider guarda a lista de carteiras, mas não recalcula saldo
  // sozinho, então quem tem os dados de transação precisa empurrar.
  useEffect(() => {
    updateSaldosComTransacoes(transactions);
  }, [transactions, updateSaldosComTransacoes]);

  // Entrada animada do gráfico de pizza toda vez que a aba Início ganha
  // foco (abrir o app ou tocar na tab), não só na primeira montagem.
  const pieAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      load();
      carregarPerfil().then((p) => {
        setPerfil(p);
        setNomeExibicao(nomeDeExibicao(p));
      });
      carregarDiagnostico().then(setDiagnostico);
      carregarLayoutHome().then(setHomeLayout);
      pieAnim.setValue(0);
      Animated.spring(pieAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 7 }).start();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.ink} />
      </View>
    );
  }

  // Views da Home respeitam a carteira ativa — "Total" mostra tudo, uma
  // carteira específica filtra pelo wallet_id gravado no lançamento/conta.
  // Mesmo filtro que app/(app)/graficos.tsx já usa.
  const walletTransactions =
    activeWalletId === 'total' ? transactions : transactions.filter((t) => t.wallet_id === activeWalletId);
  const walletBills = activeWalletId === 'total' ? bills : bills.filter((b) => b.wallet_id === activeWalletId);

  const safeToSpend = calcularSafeToSpend(walletTransactions, walletBills, goals);
  const comprometimentoFuturo = projetarComprometimentoFuturo(walletTransactions, walletBills);
  const sugestaoEvolucao = diagnostico
    ? sugerirEvolucaoArquetipo(walletTransactions, walletBills, budgets, diagnostico.arquetipo.id)
    : null;
  const arquetipoSugerido = sugestaoEvolucao?.mudou ? ARQUETIPOS[sugestaoEvolucao.sugeridoId] : null;

  // Transações estritamente do mês selecionado
  const monthTransactions = walletTransactions.filter((t) => isSameMonth(t.occurred_on, selectedYear, selectedMonth));
  const totalIn = monthTransactions.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = monthTransactions.filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);
  const flowSummary =
    chartView === 'in'
      ? { text: `+ R$ ${formatMoney(totalIn)}`, color: theme.up }
      : chartView === 'out'
      ? { text: `− R$ ${formatMoney(totalOut)}`, color: theme.down }
      : { text: `saldo ${totalIn - totalOut >= 0 ? '+' : '−'} R$ ${formatMoney(Math.abs(totalIn - totalOut))}`, color: theme.inkFaint };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueThisWeek = walletBills
    .filter((b) => {
      if (b.status === 'paid') return false;
      const diffDays = Math.round((new Date(b.due_date + 'T00:00:00').getTime() - today.getTime()) / 86400000);
      return diffDays >= 0 && diffDays <= 6;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const byCategory: Record<string, { amount: number; color: string }> = {};
  monthTransactions
    .filter((t) => t.type === 'out')
    .forEach((t) => {
      if (!byCategory[t.category]) byCategory[t.category] = { amount: 0, color: t.color };
      byCategory[t.category].amount += Number(t.amount);
    });
  const pieData: PieSlice[] = Object.entries(byCategory)
    .map(([name, info]) => ({ name, color: info.color, value: totalOut ? Math.round((info.amount / totalOut) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);


  // Quick categories ordered by usage
  const expenseCounts: Record<string, number> = {};
  transactions.filter((t) => t.type === 'out').forEach((t) => {
    expenseCounts[t.category] = (expenseCounts[t.category] || 0) + 1;
  });
  const quickCategories = CATEGORIES.filter((c) => c.name !== 'Salário')
    .slice()
    .sort((a, b) => (expenseCounts[b.name] || 0) - (expenseCounts[a.name] || 0));

  function openTxModal(type: TxType, prefillCat?: string) {
    setEditingTxId(null);
    setTxType(type);
    setTxDesc('');
    setTxAmount('');
    const cName = prefillCat || (type === 'in' ? 'Salário' : CATEGORIES[0].name);
    const catObj = CATEGORIES.find((c) => c.name === cName) ?? CATEGORIES[0];
    setTxCategory(catObj.name);
    setTxCatColor(catObj.color);

    const isCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const initialDate = isCurrent ? todayISO() : `${selectedYear}-${pad(selectedMonth + 1)}-01`;
    setTxDate(initialDate);

    setTxRecurring(false);
    setTxSheetOpen(true);
  }


  function openTxEdit(tx: Transaction) {
    setEditingTxId(tx.id);
    setTxType(tx.type);
    setTxDesc(tx.description);
    setTxAmount(formatMoney(Number(tx.amount)));
    setTxCategory(tx.category);
    setTxCatColor(tx.color);
    setTxDate(tx.occurred_on);
    setTxRecurring(!!tx.recurring);
    setTxSheetOpen(true);
  }

  function openBillModal() {
    setBillDesc('');
    setBillAmount('');
    const catObj = CATEGORIES[CATEGORIES.length - 1];
    setBillCategory(catObj.name);
    setBillCatColor(catObj.color);
    setBillDueDate(todayISO());
    setBillRecurring(false);
    setBillSheetOpen(true);
  }

  async function handleSaveTx() {
    const val = parseAmount(txAmount);
    if (!val || val <= 0) {
      Alert.alert('Informe um valor válido');
      return;
    }

    if (isDemoMode) {
      // Modo de exemplo é só uma "lente" de exploração — nunca deve tocar o banco real.
      if (editingTxId) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editingTxId
              ? { ...t, type: txType, description: txDesc.trim() || 'Sem descrição', amount: val, category: txCategory, color: txCatColor, occurred_on: txDate, recurring: txRecurring }
              : t
          )
        );
        triggerToast('Lançamento atualizado (exemplo)');
      } else {
        setTransactions((prev) => [
          {
            id: `demo-local-${Date.now()}`,
            user_id: 'demo',
            type: txType,
            description: txDesc.trim() || (txType === 'in' ? 'Entrada' : 'Saída'),
            amount: val,
            category: txCategory,
            color: txCatColor,
            occurred_on: txDate,
            recurring: txRecurring,
            parent_id: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        triggerToast('Lançamento salvo (exemplo)');
      }
      setTxSheetOpen(false);
      return;
    }

    setTxSaving(true);
    try {
      if (editingTxId) {
        await updateTransaction(editingTxId, {
          type: txType,
          description: txDesc.trim() || 'Sem descrição',
          amount: val,
          category: txCategory,
          color: txCatColor,
          occurred_on: txDate,
          recurring: txRecurring,
        });
        triggerToast('Lançamento atualizado');
      } else {
        await addTransaction({
          type: txType,
          description: txDesc.trim() || (txType === 'in' ? 'Entrada' : 'Saída'),
          amount: val,
          category: txCategory,
          color: txCatColor,
          occurred_on: txDate,
          recurring: txRecurring,
          wallet_id: activeWallet?.id ?? null,
        });
        triggerToast('Lançamento salvo');
      }
      setTxSheetOpen(false);
      load();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setTxSaving(false);
    }
  }

  async function handleSaveBill() {
    const val = parseAmount(billAmount);
    if (!val || val <= 0) {
      Alert.alert('Informe um valor válido');
      return;
    }

    if (isDemoMode) {
      setBills((prev) => [
        {
          id: `demo-local-${Date.now()}`,
          user_id: 'demo',
          description: billDesc.trim() || 'Sem descrição',
          amount: val,
          category: billCategory,
          color: billCatColor,
          due_date: billDueDate,
          status: 'due',
          recurring: billRecurring,
          paid_transaction_id: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setBillSheetOpen(false);
      triggerToast('Boleto / Conta salva (exemplo)');
      return;
    }

    setBillSaving(true);
    try {
      await addBill({
        description: billDesc.trim() || 'Sem descrição',
        amount: val,
        category: billCategory,
        color: billCatColor,
        due_date: billDueDate,
        recurring: billRecurring,
        wallet_id: activeWallet?.id ?? null,
      });
      setBillSheetOpen(false);
      triggerToast('Boleto / Conta salva');
      load();
    } catch (e: any) {
      Alert.alert('Erro ao salvar conta', e.message);
    } finally {
      setBillSaving(false);
    }
  }

  function openBudgetModal(existing?: Budget) {
    setEditingBudget(!!existing);
    setBudgetCategory(existing?.category ?? CATEGORIES[0].name);
    setBudgetAmount(existing ? formatMoney(Number(existing.amount)) : '');
    setBudgetModalOpen(true);
  }

  async function handleSaveBudget() {
    const value = parseAmount(budgetAmount);
    if (!value || value <= 0) {
      Alert.alert('Informe um valor maior que zero');
      return;
    }
    const catObj = CATEGORIES.find((c) => c.name === budgetCategory) ?? CATEGORIES[0];

    if (isDemoMode) {
      setBudgets((prev) => {
        const rest = prev.filter((b) => b.category !== catObj.name);
        return [...rest, { user_id: 'demo', category: catObj.name, amount: value, color: catObj.color, updated_at: new Date().toISOString() }];
      });
      setBudgetModalOpen(false);
      triggerToast('Orçamento salvo (exemplo)');
      return;
    }

    setBudgetSaving(true);
    try {
      await upsertBudget(catObj.name, value, catObj.color);
      setBudgetModalOpen(false);
      triggerToast('Orçamento salvo');
      load();
    } catch (e: any) {
      Alert.alert('Erro ao salvar orçamento', e.message);
    } finally {
      setBudgetSaving(false);
    }
  }

  async function handleRemoveBudget() {
    if (isDemoMode) {
      setBudgets((prev) => prev.filter((b) => b.category !== budgetCategory));
      setBudgetModalOpen(false);
      triggerToast('Orçamento removido (exemplo)');
      return;
    }
    try {
      await deleteBudget(budgetCategory);
      setBudgetModalOpen(false);
      triggerToast('Orçamento removido');
      load();
    } catch (e: any) {
      Alert.alert('Erro ao remover orçamento', e.message);
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

  async function handleCreateGoal(input: { title: string; target_amount: number; color: string; icon: string; deadline: string | null }) {
    if (isDemoMode) {
      setGoals((prev) => [
        ...prev,
        {
          id: `demo-goal-${Date.now()}`,
          user_id: 'demo',
          current_amount: 0,
          created_at: new Date().toISOString(),
          ...input,
        },
      ]);
      triggerToast('Meta criada (exemplo)');
      return;
    }
    const novaMeta = await createGoal({ ...input, wallet_id: activeWallet?.id ?? null });
    setGoals((prev) => [...prev, novaMeta]);
    triggerToast('Meta criada');
  }

  async function handleDepositGoal(goal: Goal, delta: number) {
    if (isDemoMode) {
      setGoals((prev) =>
        prev.map((g) => (g.id === goal.id ? { ...g, current_amount: Math.max(0, Number(g.current_amount) + delta) } : g))
      );
      triggerToast(delta >= 0 ? 'Guardado no cofrinho (exemplo)' : 'Resgatado do cofrinho (exemplo)');
      return;
    }
    await depositToGoal(goal, delta);
    triggerToast(delta >= 0 ? 'Guardado no cofrinho' : 'Resgatado do cofrinho');
    load();
  }

  function handleLayoutChange(novo: HomeBlockConfig[]) {
    setHomeLayout(novo);
    salvarLayoutHome(novo);
  }

  async function handleDeleteGoal(goal: Goal) {
    if (isDemoMode) {
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
      triggerToast('Meta removida (exemplo)');
      return;
    }
    await deleteGoal(goal.id);
    triggerToast('Meta removida');
    load();
  }

  /* Conteúdo de cada bloco personalizável da Home (lib/home-layout.ts) —
     um objeto em vez de um switch porque a ordem de exibição já vem pronta
     de `homeLayout`; este objeto só precisa saber traduzir chave -> JSX. */
  const HOME_BLOCOS: Record<HomeBlockConfig['key'], React.ReactNode> = {
    saldo: <SafeToSpendCard data={safeToSpend} sugestaoArquetipo={arquetipoSugerido} />,
    cofrinhos: (
      <GoalsCarousel
        goals={goals}
        lifetimeXp={lifetimeXp}
        onCreateGoal={handleCreateGoal}
        onDeposit={handleDepositGoal}
        onDeleteGoal={handleDeleteGoal}
      />
    ),
    atalhos: (
      <>
        <Text style={styles.sectionLabel}>Lançamento rápido</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipsRow}>
          {quickCategories.map((c) => (
            <AppPressable
              key={c.name}
              style={({ hovered }) => [styles.quickChip, hovered && styles.quickChipHover]}
              onPress={() => openTxModal('out', c.name)}
            >
              <View style={[styles.dot, { backgroundColor: c.color }]} />
              <Text style={styles.quickChipText}>{c.name}</Text>
            </AppPressable>
          ))}
        </ScrollView>
      </>
    ),
    fluxo: (
      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardLabel}>Fluxo financeiro</Text>
          <PrivacyValue>
            <Text style={[styles.flowValue, { color: flowSummary.color }]}>{flowSummary.text}</Text>
          </PrivacyValue>
        </View>

        <View style={{ gap: 8 }}>
          <SegmentedTabs
            options={[
              { key: 'month', label: 'Mês' },
              { key: '7days', label: '7 Dias' },
              { key: 'year', label: 'Ano' },
            ]}
            value={chartPeriod}
            onChange={(p) => setChartPeriod(p as ChartPeriod)}
          />

          <SegmentedTabs
            options={[
              { key: 'in', label: 'Entradas' },
              { key: 'out', label: 'Saídas' },
              { key: 'both', label: 'Ambos' },
            ]}
            value={chartView}
            onChange={(v) => setChartView(v as ChartView)}
          />
        </View>

        <FlowChart
          transactions={
            chartView === 'in'
              ? walletTransactions.filter((t) => t.type === 'in')
              : chartView === 'out'
              ? walletTransactions.filter((t) => t.type === 'out')
              : walletTransactions
          }
          period={chartPeriod}
          year={selectedYear}
          month={selectedMonth}
        />
      </View>
    ),
    categoria: (
      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardLabel}>Gastos por categoria</Text>
          <PrivacyValue>
            <Text style={[styles.flowValue, { color: theme.down }]}>{`− R$ ${formatMoney(totalOut)}`}</Text>
          </PrivacyValue>
        </View>

        {pieData.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum gasto registrado ainda.</Text>
        ) : (
          <>
            <Animated.View
              style={[
                styles.pieWrap,
                {
                  opacity: pieAnim,
                  transform: [{ scale: pieAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                },
              ]}
            >
              <PieChart data={pieData} />
            </Animated.View>
            <View style={styles.chipWrap}>
              {pieData.map((seg) => (
                <View key={seg.name} style={styles.legendChip}>
                  <View style={[styles.dot, { backgroundColor: seg.color }]} />
                  <Text style={styles.categoryName}>{seg.name}</Text>
                  <Text style={styles.categoryAmount}>{seg.value}%</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    ),
    orcamento: (
      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardLabel}>Orçamento do mês</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <AppPressable onPress={() => setTemplatesModalOpen(true)}>
              <Text style={styles.templateBudgetText}>Templates</Text>
            </AppPressable>
            <AppPressable onPress={() => openBudgetModal()}>
              <Text style={styles.addBudgetText}>+ Definir</Text>
            </AppPressable>
          </View>
        </View>
        {budgets.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum orçamento definido. Toque em "+ Definir" ou escolha "Templates".</Text>
        ) : (
          budgets.map((b) => {
            const spent = byCategory[b.category]?.amount ?? 0;
            const pct = Math.min((spent / Number(b.amount)) * 100, 100);
            const over = spent > Number(b.amount);
            const spentFormatted = `R$ ${formatMoney(spent)}`;
            const limitFormatted = `R$ ${formatMoney(Number(b.amount))}`;
            return (
              <AppPressable
                key={b.category}
                style={({ hovered }) => [styles.budgetRow, hovered && styles.budgetRowHover]}
                onPress={() => openBudgetModal(b)}
              >
                <View style={styles.budgetTopLine}>
                  <View style={styles.categoryLeft}>
                    <View style={[styles.dot, { backgroundColor: b.color }]} />
                    <Text style={styles.categoryName}>{b.category}</Text>
                  </View>
                  <View style={styles.budgetAmountRow}>
                    <PrivacyValue>
                      <Text style={[styles.categoryAmount, over && { color: theme.ink }]}>{spentFormatted}</Text>
                    </PrivacyValue>
                    <Text style={[styles.categoryAmount, over && { color: theme.ink }]}> de </Text>
                    <PrivacyValue>
                      <Text style={[styles.categoryAmount, over && { color: theme.ink }]}>{limitFormatted}</Text>
                    </PrivacyValue>
                    {over && <Text style={[styles.categoryAmount, { color: theme.ink }]}> · excedido</Text>}
                  </View>
                </View>
                <View style={styles.budgetTrack}>
                  <View style={[styles.budgetFill, { width: `${pct}%`, backgroundColor: b.color }]} />
                </View>
              </AppPressable>
            );
          })
        )}
      </View>
    ),
    credito: (
      <CreditSummaryCard
        cards={activeWalletId === 'total' ? creditCards : creditCards.filter((c) => c.wallet_id === activeWalletId)}
        transactions={walletTransactions}
        year={selectedYear}
        month={selectedMonth}
        onPress={() => router.push('/credito')}
      />
    ),
    boletos: (
      <View style={{ gap: spacing.sm }}>
        <Text style={styles.sectionLabel}>Vence esta semana</Text>
        {dueThisWeek.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma conta a vencer.</Text>
        ) : (
          dueThisWeek.map((b) => (
            <View key={b.id} style={styles.dueRow}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.dueName}>{b.description}</Text>
                  {b.recurring && (
                    <Ionicons name="repeat-outline" size={11} color={theme.inkFaint} style={{ marginLeft: 4 }} />
                  )}
                </View>
                <Text style={styles.dueDate}>vence {formatDateLabel(b.due_date)}</Text>
              </View>
              <PrivacyValue>
                <Text style={styles.dueAmount}>{`R$ ${formatMoney(Number(b.amount))}`}</Text>
              </PrivacyValue>
            </View>
          ))
        )}
      </View>
    ),
    timeline: (
      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardLabel}>Comprometimento futuro</Text>
        </View>
        <FutureTimelineChart meses={comprometimentoFuturo} />
      </View>
    ),
    lancamentos: (
      <View style={{ gap: spacing.sm }}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.sectionLabel}>Últimos lançamentos</Text>
          <AppPressable onPress={() => router.push('/lancamentos')} hitSlop={8}>
            <Text style={styles.seeAllText}>Ver todos</Text>
          </AppPressable>
        </View>
        {walletTransactions.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum lançamento ainda.</Text>
        ) : (
          walletTransactions.slice(0, 5).map((t) => (
            <AppPressable
              key={t.id}
              style={({ hovered }) => [styles.recentRow, hovered && styles.recentRowHover]}
              onPress={() => openTxEdit(t)}
              onLongPress={() => {
                setSelectedTx(t);
                setActionSheetOpen(true);
              }}
            >
              <View style={[styles.recentIcon, { backgroundColor: t.color + '25' }]}>
                <Text style={[styles.recentIconText, { color: t.color }]}>{t.category.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentRowTitle} numberOfLines={1}>
                  {t.description && t.description.trim() ? t.description : t.category}
                </Text>
                <Text style={styles.recentRowSub}>
                  <Text style={{ color: t.color, fontWeight: '600' }}>{t.category}</Text> · {formatDateLabel(t.occurred_on)}
                </Text>
              </View>
              <View style={styles.recentAmountRow}>
                <Text style={[styles.recentRowAmount, { color: t.type === 'in' ? theme.up : theme.down }]}>
                  {t.type === 'in' ? '+ ' : '− '}
                </Text>
                <PrivacyValue>
                  <Text style={[styles.recentRowAmount, { color: t.type === 'in' ? theme.up : theme.down }]}>
                    {`R$ ${formatMoney(Number(t.amount))}`}
                  </Text>
                </PrivacyValue>
              </View>
            </AppPressable>
          ))
        )}
      </View>
    ),
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.paper }}>
      {/* Fora do ScrollView de propósito: a marca fica fixa na tela em vez de
          rolar junto com o conteúdo, para reforçar a identidade visual. */}
      <ScreenHeader
        eyebrow="início"
        eyebrowBadges={
          <>
            {isDemoMode && <Text style={styles.demoFlag}>exemplo</Text>}
            {hidden && <Text style={styles.demoFlag}>oculto</Text>}
          </>
        }
        title={saudacaoDoDia(nomeExibicao)}
        left={
          <AppPressable onPress={() => router.push('/perfil')} hitSlop={10} style={styles.avatarBtn}>
            {perfil?.fotoUrl ? (
              <Image source={{ uri: perfil.fotoUrl }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person-circle-outline" size={34} color={theme.inkFaint} />
            )}
          </AppPressable>
        }
        right={
          <>
            <HeaderAction
              icon={hidden ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => {
                toggle();
                triggerToast(hidden ? 'Valores visíveis' : 'Valores ocultos');
              }}
              accessibilityLabel={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            />
            <WalletPill onPress={() => setWalletModalOpen(true)} />
          </>
        }
      />

      <WalletPickerModal visible={walletModalOpen} onClose={() => setWalletModalOpen(false)} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: paddingConteudo }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ink} />}
      >
        {/* Seletor Mês a Mês */}
        <FadeIn delay={30}>
          <MonthSelector
            year={selectedYear}
            month={selectedMonth}
            onChange={(y, m) => {
              setSelectedYear(y);
              setSelectedMonth(m);
            }}
          />
        </FadeIn>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Ações Inteligentes: Colar Comprovante, CSV, Nota Fiscal e Voz.
            Rolagem horizontal em vez de `flex: 1` dividindo a largura: com o
            quarto botão (escanear nota) os rótulos passaram a quebrar em duas
            linhas e a fileira ficou espremida. Assim cada botão ocupa a
            largura do próprio texto e a fileira desliza quando não couber —
            mesmo padrão dos chips de categoria logo abaixo. */}
        <FadeIn delay={40}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.smartActionsRow}
          >
          <AppPressable
            style={({ hovered }) => [styles.smartActionBtn, hovered && styles.smartActionBtnHover]}
            onPress={() => setPasteModalOpen(true)}
          >
            <Ionicons name="clipboard-outline" size={16} color={theme.ink} />
            <Text style={styles.smartActionText}>Colar comprovante</Text>
          </AppPressable>
          <AppPressable
            style={({ hovered }) => [styles.smartActionBtn, hovered && styles.smartActionBtnHover]}
            onPress={() => setCsvModalOpen(true)}
          >
            <Ionicons name="document-text-outline" size={16} color={theme.ink} />
            <Text style={styles.smartActionText}>Importar CSV</Text>
          </AppPressable>
          <AppPressable
            style={({ hovered }) => [styles.smartActionBtn, hovered && styles.smartActionBtnHover]}
            onPress={() => setQrModalOpen(true)}
          >
            <Ionicons name="qr-code-outline" size={16} color={theme.ink} />
            <Text style={styles.smartActionText}>Escanear nota</Text>
          </AppPressable>
          <VoiceEntryButton
            label="Lançamento por voz"
            textStyle={styles.smartActionText}
            style={styles.smartActionBtn}
            hoverStyle={styles.smartActionBtnHover}
            onTranscribed={(text) => {
              setVoiceText(text);
              setPasteModalOpen(true);
            }}
          />
          </ScrollView>
        </FadeIn>

        {/* Blocos personalizáveis da Home — ordem e visibilidade vêm de
            lib/home-layout.ts, editáveis pelo botão "Personalizar Início"
            no rodapé. Ver HOME_BLOCOS logo acima do return(). */}
        {homeLayout.filter((b) => b.visible).map((b) => (
          <FadeIn key={b.key} delay={60} style={b.key === 'atalhos' ? styles.quickChipsSection : undefined}>
            {HOME_BLOCOS[b.key]}
          </FadeIn>
        ))}

        {/* Personalizar Início */}
        <AppPressable style={styles.customizeBtn} onPress={() => setCustomizerOpen(true)}>
          <Ionicons name="options-outline" size={14} color={theme.inkSoft} />
          <Text style={styles.customizeBtnText}>Personalizar Início</Text>
        </AppPressable>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <FabButton
        onAddIncome={() => openTxModal('in')}
        onAddExpense={() => openTxModal('out')}
        onAddBill={openBillModal}
        onScanNota={() => setQrModalOpen(true)}
      />

      {/* Sheet: Novo / Editar Lançamento */}
      <Modal visible={txSheetOpen} animationType="slide" transparent onRequestClose={() => setTxSheetOpen(false)}>
        <Sheet>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editingTxId ? 'Editar lançamento' : 'Novo lançamento'}</Text>
              <AppPressable onPress={() => setTxSheetOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
                <Ionicons name="close" size={22} color={theme.inkFaint} />
              </AppPressable>
            </View>

            <View style={styles.typeRow}>
              <AppPressable
                onPress={() => setTxType('out')}
                style={[styles.typeBtn, txType === 'out' && styles.typeBtnOut]}
              >
                <Text style={[styles.typeText, txType === 'out' && styles.typeTextOn]}>Saída</Text>
              </AppPressable>
              <AppPressable
                onPress={() => setTxType('in')}
                style={[styles.typeBtn, txType === 'in' && styles.typeBtnIn]}
              >
                <Text style={[styles.typeText, txType === 'in' && styles.typeTextOn]}>Entrada</Text>
              </AppPressable>
            </View>

            <TextInput maxLength={LIMITS.description}
              style={styles.descInput}
              placeholder="Descrição — ex: Supermercado"
              placeholderTextColor={theme.inkFaint}
              value={txDesc}
              onChangeText={setTxDesc}
            />

            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>R$</Text>
              <TextInput maxLength={LIMITS.amount}
                style={styles.amountInput}
                placeholder="0,00"
                placeholderTextColor={theme.inkFaint}
                keyboardType="number-pad"
                value={txAmount}
                onChangeText={(t) => setTxAmount(formatMoneyInput(t))}
                autoFocus
              />
            </View>

            <AppPressable
              style={styles.fieldRow}
              onPress={() => {
                setCatPickerTarget('tx');
                setCatPickerOpen(true);
              }}
            >
              <Text style={styles.fieldKey}>Categoria</Text>
              <View style={styles.fieldVal}>
                <View style={[styles.dot, { backgroundColor: txCatColor }]} />
                <Text style={styles.fieldValText}>{txCategory}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
              </View>
            </AppPressable>

            <View style={{ gap: 6 }}>
              <AppPressable
                style={styles.fieldRow}
                onPress={() => {
                  setDatePickerTarget('tx');
                  setDatePickerOpen(true);
                }}
              >
                <Text style={styles.fieldKey}>Data do lançamento</Text>
                <View style={styles.fieldVal}>
                  <Text style={styles.fieldValText}>{formatDateLabel(txDate)}</Text>
                  <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
                </View>
              </AppPressable>

              <View style={styles.dateQuickRow}>
                <AppPressable
                  style={[styles.dateQuickChip, txDate === todayISO() && styles.dateQuickChipActive]}
                  onPress={() => setTxDate(todayISO())}
                >
                  <Text style={[styles.dateQuickText, txDate === todayISO() && styles.dateQuickTextActive]}>Hoje</Text>
                </AppPressable>
                {(() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const yISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  const isCustom = txDate !== todayISO() && txDate !== yISO;
                  return (
                    <>
                      <AppPressable
                        style={[styles.dateQuickChip, txDate === yISO && styles.dateQuickChipActive]}
                        onPress={() => setTxDate(yISO)}
                      >
                        <Text style={[styles.dateQuickText, txDate === yISO && styles.dateQuickTextActive]}>Ontem</Text>
                      </AppPressable>
                      <AppPressable
                        style={[styles.dateQuickChip, isCustom && styles.dateQuickChipActive]}
                        onPress={() => {
                          setDatePickerTarget('tx');
                          setDatePickerOpen(true);
                        }}
                      >
                        <Text style={[styles.dateQuickText, isCustom && styles.dateQuickTextActive]}>Calendário</Text>
                      </AppPressable>
                    </>
                  );
                })()}
              </View>
            </View>



            <View style={styles.fieldRow}>
              <Text style={styles.fieldKey}>Repetir mensalmente</Text>
              <AppPressable
                style={[styles.switchTrack, txRecurring && styles.switchTrackOn]}
                onPress={() => setTxRecurring((p) => !p)}
                hitSlop={12}
                accessibilityRole="switch"
                accessibilityState={{ checked: txRecurring }}
                accessibilityLabel="Repetir mensalmente"
              >
                <View style={[styles.switchThumb, txRecurring && styles.switchThumbOn]} />
              </AppPressable>
            </View>

            <AppPressable
              style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
              onPress={handleSaveTx}
              disabled={txSaving}
            >
              {txSaving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>{editingTxId ? 'Salvar alterações' : 'Salvar lançamento'}</Text>}
            </AppPressable>
        </Sheet>
      </Modal>

      {/* Sheet: Novo Boleto */}
      <Modal visible={billSheetOpen} animationType="slide" transparent onRequestClose={() => setBillSheetOpen(false)}>
        <Sheet>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Nova conta a pagar</Text>
              <AppPressable onPress={() => setBillSheetOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
                <Ionicons name="close" size={22} color={theme.inkFaint} />
              </AppPressable>
            </View>

            <TextInput maxLength={LIMITS.description}
              style={styles.descInput}
              placeholder="Descrição — ex: Energia"
              placeholderTextColor={theme.inkFaint}
              value={billDesc}
              onChangeText={setBillDesc}
            />

            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>R$</Text>
              <TextInput maxLength={LIMITS.amount}
                style={styles.amountInput}
                placeholder="0,00"
                placeholderTextColor={theme.inkFaint}
                keyboardType="number-pad"
                value={billAmount}
                onChangeText={(t) => setBillAmount(formatMoneyInput(t))}
              />
            </View>


            <AppPressable
              style={styles.fieldRow}
              onPress={() => {
                setCatPickerTarget('bill');
                setCatPickerOpen(true);
              }}
            >
              <Text style={styles.fieldKey}>Categoria</Text>
              <View style={styles.fieldVal}>
                <View style={[styles.dot, { backgroundColor: billCatColor }]} />
                <Text style={styles.fieldValText}>{billCategory}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
              </View>
            </AppPressable>

            <AppPressable
              style={styles.fieldRow}
              onPress={() => {
                setDatePickerTarget('bill');
                setDatePickerOpen(true);
              }}
            >
              <Text style={styles.fieldKey}>Vencimento</Text>
              <View style={styles.fieldVal}>
                <Text style={styles.fieldValText}>{formatDateLabel(billDueDate)}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
              </View>
            </AppPressable>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldKey}>Conta recorrente (todo mês)</Text>
              <AppPressable
                style={[styles.switchTrack, billRecurring && styles.switchTrackOn]}
                onPress={() => setBillRecurring((p) => !p)}
                hitSlop={12}
                accessibilityRole="switch"
                accessibilityState={{ checked: billRecurring }}
                accessibilityLabel="Conta recorrente"
              >
                <View style={[styles.switchThumb, billRecurring && styles.switchThumbOn]} />
              </AppPressable>
            </View>

            <AppPressable
              style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
              onPress={handleSaveBill}
              disabled={billSaving}
            >
              {billSaving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>Salvar conta</Text>}
            </AppPressable>
        </Sheet>
      </Modal>

      {/* Modal de Orçamento */}
      <Modal visible={budgetModalOpen} animationType="slide" transparent onRequestClose={() => setBudgetModalOpen(false)}>
        <Sheet>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Orçamento — {budgetCategory}</Text>
              <AppPressable onPress={() => setBudgetModalOpen(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
                <Ionicons name="close" size={22} color={theme.inkFaint} />
              </AppPressable>
            </View>

            {!editingBudget && <CategoryChips value={budgetCategory} onChange={setBudgetCategory} />}

            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>R$</Text>
              <TextInput maxLength={LIMITS.amount}
                style={styles.amountInput}
                placeholder="0,00"
                placeholderTextColor={theme.inkFaint}
                keyboardType="number-pad"
                value={budgetAmount}
                onChangeText={(t) => setBudgetAmount(formatMoneyInput(t))}
              />
            </View>

            <AppPressable
              style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
              onPress={handleSaveBudget}
              disabled={budgetSaving}
            >
              {budgetSaving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>Salvar orçamento</Text>}
            </AppPressable>

            {editingBudget && (
              <AppPressable onPress={handleRemoveBudget}>
                <Text style={styles.removeBudgetText}>Remover orçamento</Text>
              </AppPressable>
            )}
        </Sheet>
      </Modal>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={datePickerOpen}
        currentISO={datePickerTarget === 'tx' ? txDate : billDueDate}
        title={datePickerTarget === 'tx' ? 'Data do lançamento' : 'Vencimento da conta'}
        onClose={() => setDatePickerOpen(false)}
        onSelectDate={(iso) => {
          if (datePickerTarget === 'tx') setTxDate(iso);
          else setBillDueDate(iso);
        }}
      />

      {/* Category Picker Modal */}
      <CategoryPickerModal
        visible={catPickerOpen}
        currentCategory={catPickerTarget === 'tx' ? txCategory : catPickerTarget === 'bill' ? billCategory : budgetCategory}
        onClose={() => setCatPickerOpen(false)}
        onSelectCategory={(cat) => {
          if (catPickerTarget === 'tx') {
            setTxCategory(cat.name);
            setTxCatColor(cat.color);
          } else if (catPickerTarget === 'bill') {
            setBillCategory(cat.name);
            setBillCatColor(cat.color);
          } else {
            setBudgetCategory(cat.name);
          }
        }}
      />

      {/* Item Action Sheet (Editar / Excluir) */}
      <ItemActionSheet
        visible={actionSheetOpen}
        title="Lançamento"
        onClose={() => setActionSheetOpen(false)}
        onEdit={() => {
          if (selectedTx) openTxEdit(selectedTx);
        }}
        onDelete={handleDeleteSelectedTx}
      />

      {/* Paste Receipt Modal (também recebe a transcrição do lançamento por voz) */}
      <PasteReceiptModal
        visible={pasteModalOpen}
        initialText={voiceText}
        onClose={() => { setPasteModalOpen(false); setVoiceText(undefined); }}
        onSuccess={() => {
          triggerToast('Lançamento reconhecido e salvo');
          setVoiceText(undefined);
          load();
        }}
      />

      {/* Retrospectiva do mês fechado (abre sozinha uma vez por mês) */}
      <MonthlyWrappedModal
        visible={wrappedOpen}
        wrapped={wrapped}
        onClose={() => {
          setWrappedOpen(false);
          if (wrapped) marcarWrappedVisto(wrapped.chave);
        }}
      />

      {/* Leitor de QR Code de nota fiscal (NFC-e) */}
      <QrScannerModal
        visible={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        onSuccess={() => {
          triggerToast('Nota fiscal lançada');
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

      {/* Budget Templates Modal */}
      <BudgetTemplatesModal
        visible={templatesModalOpen}
        onClose={() => setTemplatesModalOpen(false)}
        onSuccess={() => {
          triggerToast('Orçamento sugerido aplicado');
          load();
        }}
      />

      {/* Onboarding Diagnostic Modal */}
      <OnboardingModal
        visible={onboardingOpen}
        onClose={() => {
          setOnboardingOpen(false);
          markOnboardingSeen();
        }}
        onFinished={() => {
          triggerToast('Diagnóstico concluído');
          load();
          carregarLayoutHome().then(setHomeLayout);
          markOnboardingSeen();
        }}
      />

      {/* Personalizar Início */}
      <HomeCustomizerModal
        visible={customizerOpen}
        config={homeLayout}
        onChange={handleLayoutChange}
        onClose={() => setCustomizerOpen(false)}
      />

      {/* Floating Animated Toast */}
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  content: { padding: screenRhythm.padding, gap: screenRhythm.gap },
  center: { flex: 1, backgroundColor: theme.paper, alignItems: 'center', justifyContent: 'center' },
  demoFlag: {
    fontFamily: 'monospace',
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.inkFaint,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: spacing.sm,
  },
  customizeBtnText: { color: theme.inkSoft, fontSize: 12 },
  avatarBtn: { padding: 2 },
  avatarImg: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: theme.rule },
  errorText: { color: '#e08a7d', fontSize: 13 },
  quickChipsSection: { gap: 6 },
  quickChipsRow: { gap: 8, paddingVertical: 4 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  quickChipHover: { backgroundColor: theme.ruleStrong },
  quickChipText: { color: theme.ink, fontSize: 12 },
  smartActionsRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  smartActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  smartActionBtnHover: { borderColor: theme.ruleStrong },
  smartActionText: { color: theme.ink, fontSize: 12, fontWeight: '500' },
  card: { backgroundColor: theme.paperRaised, borderRadius: cardTokens.radius, borderWidth: cardTokens.borderWidth, borderColor: theme.rule, padding: cardTokens.padding, gap: spacing.md },
  cardHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: theme.ink, fontSize: 13 },
  flowValue: { color: theme.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  emptyText: { color: theme.inkFaint, fontSize: 13, lineHeight: 18 },

  pieWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.rule },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: { color: theme.ink, fontSize: 12 },
  categoryAmount: { color: theme.inkFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
  templateBudgetText: { color: theme.inkFaint, fontSize: 12 },
  addBudgetText: { color: theme.inkSoft, fontSize: 12 },
  budgetRow: { gap: 6, paddingVertical: 8, borderRadius: radius.sm },
  budgetRowHover: { backgroundColor: theme.paper },
  budgetTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  budgetAmountRow: { flexDirection: 'row', alignItems: 'baseline' },
  budgetTrack: { height: 6, borderRadius: 3, backgroundColor: theme.paper, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 3 },
  sectionLabel: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  seeAllText: { color: theme.inkSoft, fontSize: 12 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.xs, borderRadius: radius.sm, borderBottomWidth: 1, borderBottomColor: theme.rule },
  recentRowHover: { backgroundColor: theme.paperRaised },
  recentIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentIconText: { fontSize: 11 },
  recentRowTitle: { color: theme.ink, fontSize: 13 },
  recentRowSub: { color: theme.inkFaint, fontSize: 11, marginTop: 2 },
  recentRowAmount: { fontSize: 13, fontVariant: ['tabular-nums'] },
  recentAmountRow: { flexDirection: 'row', alignItems: 'baseline' },
  dueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.rule },
  dueName: { color: theme.ink, fontSize: 13 },
  dueDate: { color: theme.inkFaint, fontSize: 11, marginTop: 2 },
  dueAmount: { color: theme.ink, fontSize: 13, fontVariant: ['tabular-nums'] },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: 17, fontWeight: '500' },
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
  switchTrack: { width: 34, height: 20, borderRadius: 10, backgroundColor: theme.ruleStrong, padding: 2 },
  switchTrackOn: { backgroundColor: theme.ink },
  switchThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: theme.paperRaised },
  switchThumbOn: { transform: [{ translateX: 14 }] },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: 14, fontWeight: '600' },
  removeBudgetText: { color: theme.inkFaint, fontSize: 13, textAlign: 'center', paddingVertical: 6 },
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
});

