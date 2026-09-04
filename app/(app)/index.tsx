import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppModal from '@/components/AppModal';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/lib/tab-bar';
import { supabase } from '@/lib/supabase';
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
import { theme, radius, spacing, screenRhythm, card as cardTokens, fonts, type, touchTarget, lh } from '@/lib/theme';
import { prepararFatias } from '@/lib/chart-colors';
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
import WidgetGrid, { ESPACO_ALCA } from '@/components/WidgetGrid';
import { useFlags } from '@/lib/feature-flags';
import { colunaConteudo } from '@/lib/breakpoints';
import { ehIntencaoBoleto, ehIntencaoCredito } from '@/lib/heuristics';
import PasteReceiptModal from '@/components/PasteReceiptModal';
import VoiceEntryButton from '@/components/VoiceEntryButton';
import ImportarExtratoModal from '@/components/ImportarExtratoModal';
import QrScannerModal from '@/components/QrScannerModal';
import MonthlyWrappedModal from '@/components/MonthlyWrappedModal';
import { calculateStreakAndWeek } from '@/lib/gamification';
import { carregarNotifPrefs, scheduleDailyHabitReminder, cancelDailyHabitReminder } from '@/lib/notifications';
import {
  gerarMonthlyWrapped,
  marcarWrappedVisto,
  wrappedJaVisto,
  type MonthlyWrapped,
} from '@/lib/monthly-wrapped';
import BudgetTemplatesModal from '@/components/BudgetTemplatesModal';
import OnboardingModal from '@/components/OnboardingModal';
import HomeTourOverlay, { type Rect } from '@/components/HomeTourOverlay';
import { HOME_TOUR_STEPS, homeTourJaVisto, marcarHomeTourVisto, type HomeTourStepId } from '@/lib/home-tour';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import ItemActionSheet from '@/components/ItemActionSheet';
import TransactionSheet, { type ValoresLancamento } from '@/components/TransactionSheet';
import WhatsappBotSheet, { jaViuExplicacaoDoBot, marcarExplicacaoDoBotVista } from '@/components/WhatsappBotSheet';
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
import ToggleSwitch from '@/components/ToggleSwitch';
import { isSameMonth, isCreditTx } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { DEMO_CREDIT_CARDS } from '@/lib/demo-data';
import type { CreditCard } from '@/lib/types';
import { useReducedMotion } from '@/lib/motion';


type ChartView = 'in' | 'out' | 'both';


export default function InicioScreen() {
  const { ligado } = useFlags();
  const { paddingConteudo } = useTabBarInset();
  const router = useRouter();
  const { hidden, toggle } = usePrivacy();
  const reduzirMovimento = useReducedMotion();
  const { isDemoMode } = useDemo();
  const { session } = useSession();
  const { activeWalletId, activeWallet, activeWalletName, activeWalletColor, updateSaldosComTransacoes, refreshSaldos } = useWallet();
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
  /* Atalho pro bot de WhatsApp, no cabeçalho. O sheet é quem decide o destino
     pelo estado do vínculo — aqui só se controla se ele está aberto e se a
     explicação de estreia já foi lida. */
  const [whatsappSheetOpen, setWhatsappSheetOpen] = useState(false);
  const [explicacaoWhatsappVista, setExplicacaoWhatsappVista] = useState(true);

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
  // conta — a flag fica em user_metadata do Supabase Auth (não AsyncStorage
  // local), então não repete depois que a pessoa já respondeu ou fechou uma
  // vez, em NENHUM aparelho/navegador da mesma conta.
  const userId = session?.user.id;
  useEffect(() => {
    if (isDemoMode || !userId) return;
    if (session?.user.user_metadata?.onboarding_seen !== true) setOnboardingOpen(true);
  }, [userId, isDemoMode, session]);

  function markOnboardingSeen() {
    supabase.auth.updateUser({ data: { onboarding_seen: true } });
  }

  // Tour essencial da Início: 5 pontos tocáveis sobre elementos reais da
  // tela. Nunca simultâneo com o OnboardingModal — só considera abrir depois
  // que onboarding_seen já é true, o que também cobre o caso de acabar de
  // fechar o onboarding nesta mesma sessão: markOnboardingSeen() dispara
  // USER_UPDATED, o listener em lib/auth-context.tsx atualiza `session`, e
  // este efeito roda de novo com a flag já true.
  const [tourOpen, setTourOpen] = useState(false);
  const [tourTargets, setTourTargets] = useState<Partial<Record<HomeTourStepId, Rect>>>({});
  const tourRefs = useRef<Partial<Record<HomeTourStepId, View | null>>>({});

  function medirUmTour(id: HomeTourStepId): Promise<void> {
    return new Promise((resolve) => {
      const node = tourRefs.current[id];
      if (!node) return resolve();
      node.measureInWindow((x, y, width, height) => {
        setTourTargets((prev) => ({ ...prev, [id]: { x, y, width, height } }));
        resolve();
      });
    });
  }

  function medirTour(): Promise<void> {
    return Promise.all(HOME_TOUR_STEPS.map((s) => medirUmTour(s.id))).then(() => undefined);
  }

  /* Rola até o alvo do passo atual ficar visível, e remede depois. Sem isso,
     um alvo abaixo da dobra (comum em tela de celular, onde a Início é bem
     mais alta que a viewport) deixava o destaque E O PRÓPRIO TOOLTIP fora da
     área visível — os botões Pular/Concluir ficavam atrás da barra de
     navegação, sem jeito de tocar. HomeTourOverlay também tem um clamp de
     segurança pra esse caso, mas rolar até o alvo é a correção de verdade —
     o clamp só evita a pior consequência se o scroll não rolar a tempo.
     Só web: `scrollIntoView` é DOM puro, e é onde o problema foi visto (o
     relato foi "no navegador do celular"). Sem guarda equivalente no app
     nativo, o clamp do overlay é quem segura a peteca lá. */
  function aoMudarPassoTour(id: HomeTourStepId) {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const no = tourRefs.current[id] as unknown as HTMLElement | null;
    if (!no) return;
    no.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // A rolagem é suave (animada) — remedir cedo demais pegaria a posição de
    // antes de rolar. 400ms cobre a duração típica do scrollIntoView.
    setTimeout(() => {
      medirUmTour(id);
    }, 400);
  }

  useEffect(() => {
    if (isDemoMode || !userId || loading || onboardingOpen) return;
    if (session?.user.user_metadata?.onboarding_seen !== true) return;
    homeTourJaVisto().then((visto) => {
      if (visto) return;
      // Espera o próximo frame pra medir depois que a grade de widgets já
      // fez o primeiro layout — mesmo raciocínio de medirTudo() em
      // components/WidgetGrid.tsx.
      requestAnimationFrame(() => {
        medirTour().then(() => setTourOpen(true));
      });
    });
  }, [isDemoMode, userId, loading, onboardingOpen, session]);

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

      // Reagenda o lembrete diário de hábito toda vez que a Home ganha foco
      // (inclusive ao abrir o app) — mesmo padrão de "reagenda tudo a cada
      // load" que contas.tsx/credito.tsx já usam pros próprios lembretes.
      carregarNotifPrefs().then((prefs) => {
        if (!prefs.lembreteDiarioAtivo) {
          cancelDailyHabitReminder().catch(() => {});
          return;
        }
        const { streak } = calculateStreakAndWeek(tx);
        const jaLancouHoje = tx.some((t) => t.occurred_on === todayISO());
        const ultimaData = tx[0]?.occurred_on;
        const diasInativo = ultimaData
          ? Math.floor((Date.now() - new Date(`${ultimaData}T00:00:00`).getTime()) / 86400000)
          : 99;
        scheduleDailyHabitReminder({ ...prefs.horario, jaLancouHoje, streak, diasInativo }).catch(() => {});
      });

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
    colarTexto?: string;
  }>();

  /* Fala vinda do widget que o próprio widget se recusou a salvar sozinho
     (sem valor, categoria incerta): abre a mesma revisão do botão de voz, com
     a transcrição preenchida, pra ninguém ter que repetir o que já falou. */
  useEffect(() => {
    if (!params.colarTexto) return;
    setVoiceText(params.colarTexto);
    setPasteModalOpen(true);
    router.replace('/(app)/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.colarTexto]);

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

  /* Saldo por carteira depois de cada mudança nas transações.
   *
   * No app real quem soma é o banco (`saldos_por_carteira()`), e o cliente
   * recebe uma linha por carteira. Antes a soma percorria a lista baixada, o
   * que ficava errado assim que o histórico passasse das 1000 linhas que o
   * PostgREST devolve por requisição.
   *
   * O modo de exemplo continua somando em memória: ali os dados são fictícios
   * e não existe banco para consultar. */
  useEffect(() => {
    if (isDemoMode) {
      updateSaldosComTransacoes(transactions);
      return;
    }
    void refreshSaldos();
  }, [transactions, isDemoMode, updateSaldosComTransacoes, refreshSaldos]);

  // Entrada animada do gráfico de pizza toda vez que a aba Início ganha
  // foco (abrir o app ou tocar na tab), não só na primeira montagem.
  const pieAnim = useRef(new Animated.Value(0)).current;

  const quickChipsScrollRef = useRef<ScrollView>(null);
  const quickChipsScrollX = useRef(0);
  function scrollQuickChips(dir: 1 | -1) {
    const delta = 220 * dir;
    quickChipsScrollRef.current?.scrollTo({ x: Math.max(0, quickChipsScrollX.current + delta), animated: true });
  }

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
      if (reduzirMovimento) {
        pieAnim.setValue(1);
        return;
      }
      Animated.spring(pieAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 7 }).start();
    }, [load, pieAnim, reduzirMovimento])
  );

  /* ── Valores derivados ──────────────────────────────────────────────────
     Ficam ANTES do `if (loading)` porque agora são `useMemo`, e hook não
     pode ficar depois de um return antecipado. Antes eram consts soltas aqui
     embaixo, recalculadas a cada render — inclusive a cada tecla digitada num
     campo de modal, sobre o histórico de lançamentos INTEIRO (a busca desta
     tela não pagina; ver IMPECCABLE_AUDIT.md). Com 5 anos de uso importados
     de outro app, isso é a diferença entre a tela responder e engasgar.
     `graficos.tsx` já fazia assim; esta tela era a exceção. */

  // Views da Home respeitam a carteira ativa — "Total" mostra tudo, uma
  // carteira específica filtra pelo wallet_id gravado no lançamento/conta.
  // Mesmo filtro que app/(app)/graficos.tsx já usa.
  const walletTransactions = useMemo(
    () => (activeWalletId === 'total' ? transactions : transactions.filter((t) => t.wallet_id === activeWalletId)),
    [activeWalletId, transactions]
  );
  const walletBills = useMemo(
    () => (activeWalletId === 'total' ? bills : bills.filter((b) => b.wallet_id === activeWalletId)),
    [activeWalletId, bills]
  );
  // `createGoal` (mais abaixo) já grava o `wallet_id` da carteira ativa no
  // momento da criação — os cofrinhos são pensados como algo por carteira,
  // igual lançamento/conta/cartão. Sem este filtro, o "Livre para Gastar" de
  // uma carteira descontava o valor guardado em cofrinhos de OUTRA carteira.
  const walletGoals = useMemo(
    () => (activeWalletId === 'total' ? goals : goals.filter((g) => g.wallet_id === activeWalletId)),
    [activeWalletId, goals]
  );
  // Compra no crédito só vira saída de caixa quando a fatura é paga — some
  // do saldo/fluxo/orçamento até lá (ver lib/wallets.ts::calcularSaldosWallets).
  // walletTransactions continua com tudo, inclusive crédito, pro CreditSummaryCard.
  const walletCashTransactions = useMemo(
    () => walletTransactions.filter((t) => !isCreditTx(t)),
    [walletTransactions]
  );

  const safeToSpend = useMemo(
    () => calcularSafeToSpend(walletCashTransactions, walletBills, walletGoals),
    [walletCashTransactions, walletBills, walletGoals]
  );
  // `walletTransactions`, não `walletCashTransactions`: uma parcela de
  // compra no crédito É um comprometimento futuro de verdade (a fatura vai
  // vencer), mesmo não sendo saída de caixa HOJE — só essa projeção (e não o
  // saldo atual) precisa enxergar o crédito, por isso não reaproveita a
  // mesma lista "só caixa" usada acima.
  const comprometimentoFuturo = useMemo(
    () => projetarComprometimentoFuturo(walletTransactions, walletBills),
    [walletTransactions, walletBills]
  );
  const sugestaoEvolucao = useMemo(
    () =>
      diagnostico
        ? sugerirEvolucaoArquetipo(walletCashTransactions, walletBills, budgets, diagnostico.arquetipo.id)
        : null,
    [diagnostico, walletCashTransactions, walletBills, budgets]
  );
  const arquetipoSugerido = sugestaoEvolucao?.mudou ? ARQUETIPOS[sugestaoEvolucao.sugeridoId] : null;

  // Transações estritamente do mês selecionado
  const monthTransactions = useMemo(
    () => walletCashTransactions.filter((t) => isSameMonth(t.occurred_on, selectedYear, selectedMonth)),
    [walletCashTransactions, selectedYear, selectedMonth]
  );
  const { totalIn, totalOut } = useMemo(
    () => ({
      totalIn: monthTransactions.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0),
      totalOut: monthTransactions.filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0),
    }),
    [monthTransactions]
  );
  const flowSummary =
    chartView === 'in'
      ? { text: `+ R$ ${formatMoney(totalIn)}`, color: theme.up }
      : chartView === 'out'
      ? { text: `− R$ ${formatMoney(totalOut)}`, color: theme.down }
      : { text: `saldo ${totalIn - totalOut >= 0 ? '+' : '−'} R$ ${formatMoney(Math.abs(totalIn - totalOut))}`, color: theme.inkFaint };

  /* `today` entra no memo em vez de ser recalculado a cada render: a tela
     recarrega `bills` a cada foco (useFocusEffect → load()), então a virada
     de dia sempre chega junto com dado novo. */
  const dueThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return walletBills
      .filter((b) => {
        if (b.status === 'paid') return false;
        const diffDays = Math.round((new Date(b.due_date + 'T00:00:00').getTime() - today.getTime()) / 86400000);
        return diffDays >= 0 && diffDays <= 6;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [walletBills]);

  /* Gasto por categoria do mês. Alimenta DUAS seções — o donut e a barra de
     progresso de cada orçamento —, por isso é memo próprio em vez de ficar
     dentro do cálculo do donut. */
  const byCategory = useMemo(() => {
    const acc: Record<string, { amount: number; color: string }> = {};
    monthTransactions
      .filter((t) => t.type === 'out')
      .forEach((t) => {
        if (!acc[t.category]) acc[t.category] = { amount: 0, color: t.color };
        acc[t.category].amount += Number(t.amount);
      });
    return acc;
  }, [monthTransactions]);

  /* Mesmo tratamento do donut de Gráficos: paleta validada por nome de
     categoria e cauda dobrada em "Outros", com teto de seis fatias. */
  const pieData: PieSlice[] = useMemo(
    () =>
      prepararFatias(
        Object.entries(byCategory).map(([name, info]) => ({
          name,
          color: info.color,
          value: totalOut ? Math.round((info.amount / totalOut) * 100) : 0,
        }))
      ),
    [byCategory, totalOut]
  );

  // Quick categories ordered by usage
  const quickCategories = useMemo(() => {
    const expenseCounts: Record<string, number> = {};
    transactions.filter((t) => t.type === 'out').forEach((t) => {
      expenseCounts[t.category] = (expenseCounts[t.category] || 0) + 1;
    });
    return CATEGORIES.filter((c) => c.name !== 'Salário')
      .slice()
      .sort((a, b) => (expenseCounts[b.name] || 0) - (expenseCounts[a.name] || 0));
  }, [transactions]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.ink} />
      </View>
    );
  }

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


  /* Lê o sinalizador antes de abrir, e não na montagem da tela: assim a
     explicação some já na segunda vez, sem depender de recarregar a Home. */
  async function abrirWhatsappBot() {
    setExplicacaoWhatsappVista(await jaViuExplicacaoDoBot());
    setWhatsappSheetOpen(true);
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

  async function handleSaveTx(v: ValoresLancamento) {
    const val = parseAmount(v.amount);
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
              ? { ...t, type: v.type, description: v.description.trim() || 'Sem descrição', amount: val, category: v.category, color: v.color, occurred_on: v.occurred_on, recurring: v.recurring }
              : t
          )
        );
        triggerToast('Lançamento atualizado (exemplo)');
      } else {
        setTransactions((prev) => [
          {
            id: `demo-local-${Date.now()}`,
            user_id: 'demo',
            type: v.type,
            description: v.description.trim() || (v.type === 'in' ? 'Entrada' : 'Saída'),
            amount: val,
            category: v.category,
            color: v.color,
            occurred_on: v.occurred_on,
            recurring: v.recurring,
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
          type: v.type,
          description: v.description.trim() || 'Sem descrição',
          amount: val,
          category: v.category,
          color: v.color,
          occurred_on: v.occurred_on,
          recurring: v.recurring,
        });
        triggerToast('Lançamento atualizado');
      } else {
        await addTransaction({
          type: v.type,
          description: v.description.trim() || (v.type === 'in' ? 'Entrada' : 'Saída'),
          amount: val,
          category: v.category,
          color: v.color,
          occurred_on: v.occurred_on,
          recurring: v.recurring,
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

  /* Arraste na grade da web. Recebe só as chaves VISÍVEIS na nova ordem; os
     blocos ocultos são reinseridos depois, preservados, porque a lista salva
     guarda a posição deles para quando forem reativados (ver
     lib/home-layout.ts). Grava no mesmo lugar que o customizador, então as
     duas formas de reordenar convergem para um estado só. */
  function reordenarBlocos(chavesVisiveis: string[]) {
    const visiveis = chavesVisiveis
      .map((k) => homeLayout.find((b) => b.key === k))
      .filter((b): b is HomeBlockConfig => !!b);
    const ocultos = homeLayout.filter((b) => !b.visible);
    handleLayoutChange([...visiveis, ...ocultos]);
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
    saldo: (
      <View
        ref={(n) => {
          tourRefs.current.saldo = n;
        }}
        collapsable={false}
      >
        <SafeToSpendCard data={safeToSpend} sugestaoArquetipo={arquetipoSugerido} />
      </View>
    ),
    cofrinhos: (
      <GoalsCarousel
        goals={walletGoals}
        lifetimeXp={lifetimeXp}
        onCreateGoal={handleCreateGoal}
        onDeposit={handleDepositGoal}
        onDeleteGoal={handleDeleteGoal}
      />
    ),
    atalhos: (
      <>
        <View style={styles.quickChipsHeadRow}>
          <Text style={styles.sectionLabel}>Lançamento rápido</Text>
          {/* Mesma solução do carrossel de cofrinhos: sem scrollbar do
              sistema (fora da identidade visual), setinhas só na web, onde
              não existe gesto de arrastar com o mouse. */}
          {Platform.OS === 'web' && (
            <View style={{ flexDirection: 'row', gap: 2 }}>
              <AppPressable
                style={({ hovered }) => [styles.carouselArrow, hovered && styles.carouselArrowHover]}
                onPress={() => scrollQuickChips(-1)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Categorias anteriores"
              >
                <Ionicons name="chevron-back" size={16} color={theme.inkSoft} />
              </AppPressable>
              <AppPressable
                style={({ hovered }) => [styles.carouselArrow, hovered && styles.carouselArrowHover]}
                onPress={() => scrollQuickChips(1)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Próximas categorias"
              >
                <Ionicons name="chevron-forward" size={16} color={theme.inkSoft} />
              </AppPressable>
            </View>
          )}
        </View>
        <ScrollView
          ref={quickChipsScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => { quickChipsScrollX.current = e.nativeEvent.contentOffset.x; }}
          scrollEventThrottle={16}
          contentContainerStyle={styles.quickChipsRow}
        >
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
              ? walletCashTransactions.filter((t) => t.type === 'in')
              : chartView === 'out'
              ? walletCashTransactions.filter((t) => t.type === 'out')
              : walletCashTransactions
          }
          period={chartPeriod}
          year={selectedYear}
          month={selectedMonth}
        />
      </View>
    ),
    categoria: (
      <View
        style={styles.card}
        ref={(n) => {
          tourRefs.current.graficos = n;
        }}
        collapsable={false}
      >
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
      <View
        ref={(n) => {
          tourRefs.current.credito = n;
        }}
        collapsable={false}
      >
        <CreditSummaryCard
          cards={activeWalletId === 'total' ? creditCards : creditCards.filter((c) => c.wallet_id === activeWalletId)}
          transactions={walletTransactions}
          year={selectedYear}
          month={selectedMonth}
          onPress={() => router.push('/credito')}
        />
      </View>
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
        {walletCashTransactions.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum lançamento ainda.</Text>
        ) : (
          walletCashTransactions.slice(0, 5).map((t) => (
            <AppPressable
              key={t.id}
              style={({ hovered }) => [styles.recentRow, hovered && styles.recentRowHover]}
              /* Ver o comentário equivalente em lancamentos.tsx: o toque longo
                 sozinho deixava editar e excluir fora do alcance de leitor de
                 tela e de teclado. */
              onPress={() => {
                setSelectedTx(t);
                setActionSheetOpen(true);
              }}
              onLongPress={() => {
                setSelectedTx(t);
                setActionSheetOpen(true);
              }}
              accessibilityHint="Abre as opções de editar e excluir este lançamento."
            >
              <View style={[styles.recentIcon, { backgroundColor: t.color + '25' }]}>
                <Text style={styles.recentIconText}>{t.category.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recentRowTitle} numberOfLines={1}>
                  {t.description && t.description.trim() ? t.description : t.category}
                </Text>
                {/* Nome da categoria em cor de tinta, não na cor da categoria.
                    Medido: a cor da categoria em 12px sobre esta superfície dá
                    de 3,60:1 (Moradia) a 4,21:1 (Lazer), abaixo dos 4,5:1 da
                    WCAG AA, e reprovava em sete das nove categorias. Quem
                    carrega a identidade da categoria na linha é o avatar
                    colorido à esquerda, que não depende de leitura. */}
                <Text style={styles.recentRowSub}>
                  {t.category} · {formatDateLabel(t.occurred_on)}
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
        eyebrow="Início"
        eyebrowBadges={
          <>
            {isDemoMode && <Text style={styles.demoFlag}>exemplo</Text>}
            {hidden && <Text style={styles.demoFlag}>oculto</Text>}
          </>
        }
        title={saudacaoDoDia(nomeExibicao)}
        left={
          <AppPressable onPress={() => router.push('/perfil')} hitSlop={10} style={styles.avatarBtn} accessibilityLabel="Abrir perfil">
            {perfil?.fotoUrl ? (
              <Image source={{ uri: perfil.fotoUrl }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person-circle-outline" size={44} color={theme.inkFaint} />
            )}
          </AppPressable>
        }
        right={
          <>
            <View
              ref={(n) => {
                tourRefs.current.whatsapp = n;
              }}
              collapsable={false}
            >
              {/* Some quando o interruptor remoto desliga o WhatsApp. No
                  cabeçalho é botão de ícone sem rótulo: desabilitado ele
                  viraria um enfeite cinza sem explicação nenhuma, então
                  esconder é mais honesto que mostrar quebrado. A explicação
                  aparece no Perfil, onde a linha tem texto, e no pop-up. */}
              {ligado('whatsapp') && (
                <HeaderAction
                  icon="logo-whatsapp"
                  onPress={abrirWhatsappBot}
                  accessibilityLabel="Lançar gastos pelo WhatsApp"
                />
              )}
            </View>
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
        contentContainerStyle={[styles.content, colunaConteudo, { paddingBottom: paddingConteudo }]}
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
          <View
            ref={(n) => {
              tourRefs.current.lancar = n;
            }}
            collapsable={false}
          >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.smartActionsRow}
          >
          {ligado('colar_comprovante') && (
            <AppPressable
              style={({ hovered }) => [styles.smartActionBtn, hovered && styles.smartActionBtnHover]}
              onPress={() => setPasteModalOpen(true)}
            >
              <Ionicons name="clipboard-outline" size={16} color={theme.ink} />
              <Text style={styles.smartActionText}>Colar comprovante</Text>
            </AppPressable>
          )}
          {ligado('importar_extrato') && (
            <AppPressable
              style={({ hovered }) => [styles.smartActionBtn, hovered && styles.smartActionBtnHover]}
              onPress={() => setCsvModalOpen(true)}
            >
              <Ionicons name="document-text-outline" size={16} color={theme.ink} />
              <Text style={styles.smartActionText}>Importar extrato</Text>
            </AppPressable>
          )}
          {ligado('qr_nota') && (
            <AppPressable
              style={({ hovered }) => [styles.smartActionBtn, hovered && styles.smartActionBtnHover]}
              onPress={() => setQrModalOpen(true)}
            >
              <Ionicons name="qr-code-outline" size={16} color={theme.ink} />
              <Text style={styles.smartActionText}>Escanear nota</Text>
            </AppPressable>
          )}
          {ligado('lancamento_voz') && (
          <VoiceEntryButton
            label="Lançamento por voz"
            textStyle={styles.smartActionText}
            /* Os três vizinhos desta fileira usam theme.ink no ícone — aqui a
               vizinhança não é a do cabeçalho, é esta. */
            iconColor={theme.ink}
            iconSize={16}
            style={styles.smartActionBtn}
            hoverStyle={styles.smartActionBtnHover}
            onTranscribed={(text) => {
              if (ehIntencaoBoleto(text)) {
                router.push({ pathname: '/(app)/contas', params: { novaConta: '1', texto: text } });
                return;
              }
              if (ehIntencaoCredito(text)) {
                router.push({ pathname: '/(app)/credito', params: { novaCompra: '1', texto: text } });
                return;
              }
              setVoiceText(text);
              setPasteModalOpen(true);
            }}
          />
          )}
          </ScrollView>
          </View>
        </FadeIn>

        {/* Blocos personalizáveis da Home — ordem e visibilidade vêm de
            lib/home-layout.ts, editáveis pelo botão "Personalizar Início"
            no rodapé. Ver HOME_BLOCOS logo acima do return(). */}
        <WidgetGrid
          widgets={homeLayout
            .filter((b) => b.visible)
            .map((b) => ({
              chave: b.key,
              /* Estes quatro são seção com rótulo solto, não card com moldura:
                 o texto começa no topo do bloco, então a alça sobe para a
                 linha do rótulo. Ver `alcaTopo` em WidgetGrid. */
              alcaTopo: (['cofrinhos', 'boletos', 'lancamentos', 'atalhos'] as const).includes(b.key as never)
                ? -2
                : undefined,
              conteudo: (
                <FadeIn delay={60} style={b.key === 'atalhos' ? styles.quickChipsSection : undefined}>
                  {HOME_BLOCOS[b.key]}
                </FadeIn>
              ),
            }))}
          onReordenar={reordenarBlocos}
        />

        {/* Personalizar Início */}
        <AppPressable style={styles.customizeBtn} onPress={() => setCustomizerOpen(true)}>
          <Ionicons name="options-outline" size={14} color={theme.inkSoft} />
          <Text style={styles.customizeBtnText}>Personalizar Início</Text>
        </AppPressable>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Button.

          Todo item leva para a tela dona daquele tipo de lançamento e abre o
          formulário lá, em vez de abrir um sheet aqui na Início. É o
          comportamento que o Crédito já tinha: além de ficar consistente, a
          pessoa termina o lançamento já olhando a lista onde ele acabou de
          entrar, e não numa tela que não mostra o resultado.

          Entrada e Saída vão para Movimentações (débito e Pix), Boleto para
          Contas, Crédito para Cartões. Cada destino lê o parâmetro e abre o
          próprio formulário — ver o efeito de trava única em cada tela. */}
      <FabButton
        onAddIncome={() => router.push('/(app)/lancamentos?novoLancamento=in')}
        onAddExpense={() => router.push('/(app)/lancamentos?novoLancamento=out')}
        onAddBill={() => router.push('/(app)/contas?novaConta=1')}
        onAddCredit={() => router.push('/(app)/credito?novaCompra=1')}
      />

      <WhatsappBotSheet
        visible={whatsappSheetOpen}
        onClose={() => setWhatsappSheetOpen(false)}
        explicar={!explicacaoWhatsappVista}
        onExplicacaoVista={() => {
          setExplicacaoWhatsappVista(true);
          marcarExplicacaoDoBotVista();
        }}
      />

      {/* Sheet de lançamento — mesmo componente das telas de Lançamentos e Crédito. */}
      <TransactionSheet
        visible={txSheetOpen}
        onClose={() => setTxSheetOpen(false)}
        modo="carteira"
        editando={!!editingTxId}
        salvando={txSaving}
        inicial={{
          type: txType,
          description: txDesc,
          amount: txAmount,
          category: txCategory,
          color: txCatColor,
          occurred_on: txDate,
          recurring: txRecurring,
          installments: 1,
          card_id: null,
        }}
        onSalvar={handleSaveTx}
      />

      {/* Sheet: Novo Boleto */}
      <AppModal visible={billSheetOpen} animationType="slide" transparent onRequestClose={() => setBillSheetOpen(false)}>
        <Sheet onClose={() => setBillSheetOpen(false)}>
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
              <ToggleSwitch
                value={billRecurring}
                onToggle={() => setBillRecurring((p) => !p)}
                label="Conta recorrente"
              />
            </View>

            <AppPressable
              style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
              onPress={handleSaveBill}
              disabled={billSaving}
            >
              {billSaving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>Salvar conta</Text>}
            </AppPressable>
        </Sheet>
      </AppModal>

      {/* Modal de Orçamento */}
      <AppModal visible={budgetModalOpen} animationType="slide" transparent onRequestClose={() => setBudgetModalOpen(false)}>
        <Sheet onClose={() => setBudgetModalOpen(false)}>
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
      </AppModal>

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
        /* Para o PDF do último capítulo. A retrospectiva é gerada a partir da
           lista sem filtro de carteira (ver gerarMonthlyWrapped acima), então o
           documento também sai como Total: os dois precisam falar do mesmo
           recorte, senão o PDF contradiz a história que a pessoa acabou de ler. */
        transactions={transactions}
        bills={bills}
        carteira="Total"
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
      <ImportarExtratoModal
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

      <HomeTourOverlay
        visible={tourOpen}
        steps={HOME_TOUR_STEPS}
        targets={tourTargets}
        onStepChange={aoMudarPassoTour}
        onFinish={() => {
          setTourOpen(false);
          marcarHomeTourVisto();
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
    /* Era `fontFamily: 'monospace'` — a única violação da Only-Font Rule em
       todo o repositório, e VIVA: estes são os badges "exemplo" e "oculto" do
       cabeçalho da Início. A largura tabular da monoespaçada não fazia falta
       aqui: são duas palavras fixas, não número que atualiza.

       Esta correção já foi feita uma vez e se perdeu: um `git checkout --`
       para desfazer um script de entrelinha bugado levou junto a troca da
       fonte, e o relatório saiu afirmando que estava resolvido. Se for
       revertida de novo, a checagem que a pega está no corpus. */
    fontFamily: fonts.regular,
    fontSize: type.micro,
    lineHeight: lh(type.micro, 'apoio'),
    letterSpacing: 0.5,
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
  customizeBtnText: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },
  avatarBtn: { padding: 2 },
  /* 44, não 34: a foto é a identidade da pessoa na tela e estava menor que
     os botões de ação ao lado. Passa a ser o maior elemento circular do
     cabeçalho, com os botões de ícone em 36. */
  avatarImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.rule },
  errorText: { color: theme.danger, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  quickChipsSection: { gap: 6 },
  quickChipsHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Recuo pra alça de arrastar do WidgetGrid (aparece no hover em modo de
    // edição) não cair em cima das setinhas — mesmo ajuste do GoalsCarousel.
    ...(Platform.OS === 'web' ? { paddingRight: ESPACO_ALCA } : null),
  },
  carouselArrow: { width: touchTarget, height: touchTarget, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  carouselArrowHover: { backgroundColor: theme.hover },
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
  quickChipHover: { backgroundColor: theme.hover },
  quickChipText: { color: theme.ink, fontSize: type.nota,
  lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.regular },
  /* Sem `flexWrap`: a fileira desliza, não empilha. Um passe de auditoria
     (b34be61) trocou isto por `flexWrap: 'wrap'` e os quatro botões viraram
     duas fileiras empilhadas, empurrando todo o resto da Início para baixo —
     revertido a pedido do autor. O `paddingRight` é o respiro do fim da
     rolagem, pra o último botão não colar na borda da tela. */
  smartActionsRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  smartActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget,
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  smartActionBtnHover: { borderColor: theme.ruleStrong },
  smartActionText: { color: theme.ink, fontSize: type.nota, fontFamily: fonts.regular },
  card: { backgroundColor: theme.paperRaised, borderRadius: cardTokens.radius, borderWidth: cardTokens.borderWidth, borderColor: theme.rule, padding: cardTokens.padding, gap: spacing.md },
  /* paddingRight na web: a alça de arraste (components/WidgetGrid.tsx) pousa
     no canto superior direito do card, e é exatamente onde estes cabeçalhos
     colocam o "Ver todos", o "+ Definir" e os totais. Abrir o recuo aqui é o
     que faz a alça caber AO LADO do controle em vez de por cima dele. */
  cardHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { paddingRight: ESPACO_ALCA } : null),
  },
  cardLabel: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  flowValue: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  emptyText: { color: theme.inkFaint, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.light },

  pieWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.rule },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: { color: theme.ink, fontSize: type.nota,
  lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.regular },
  categoryAmount: { color: theme.inkFaint, fontSize: type.nota,
  lineHeight: lh(type.nota, 'valor'), fontVariant: ['tabular-nums'], fontFamily: fonts.light },
  templateBudgetText: { color: theme.inkFaint, fontSize: type.nota,
  lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },
  addBudgetText: { color: theme.inkSoft, fontSize: type.nota,
  lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },
  budgetRow: { gap: 6, paddingVertical: 8, borderRadius: radius.sm },
  budgetRowHover: { backgroundColor: theme.hover },
  budgetTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  budgetAmountRow: { flexDirection: 'row', alignItems: 'baseline' },
  budgetTrack: { height: 6, borderRadius: 3, backgroundColor: theme.paper, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 3 },
  sectionLabel: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), letterSpacing: 0.5, marginTop: spacing.sm, fontFamily: fonts.light },
  seeAllText: { color: theme.inkSoft, fontSize: type.nota,
  lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderBottomWidth: 1, borderBottomColor: theme.rule },
  recentRowHover: { backgroundColor: theme.hover },
  recentIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentIconText: { color: theme.ink, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.regular },
  recentRowTitle: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  recentRowSub: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'corpo'), marginTop: 2, fontFamily: fonts.light },
  recentRowAmount: { fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'valor'), fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  recentAmountRow: { flexDirection: 'row', alignItems: 'baseline' },
  dueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.rule },
  dueName: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  dueDate: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), marginTop: 2, fontFamily: fonts.light },
  dueAmount: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'valor'), fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo,
  lineHeight: lh(type.titulo, 'titulo'), fontFamily: fonts.regular },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: theme.paper },
  typeBtnOut: { backgroundColor: theme.saidaFundo, borderWidth: 1, borderColor: theme.saidaBorda },
  typeBtnIn: { backgroundColor: theme.entradaFundo, borderWidth: 1, borderColor: theme.entradaBorda },
  typeText: { color: theme.inkFaint, fontSize: type.nota,
  lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },
  typeTextOn: { color: theme.ink},
  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: type.corpo, paddingVertical: 8, fontFamily: fonts.regular },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.valor, flex: 1, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.rule },
  fieldKey: { color: theme.inkFaint, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  fieldVal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValText: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  removeBudgetText: { color: theme.inkFaint, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), textAlign: 'center', paddingVertical: 6, fontFamily: fonts.light },
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
  dateQuickText: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.light },
  dateQuickTextActive: { color: theme.ink},
});

