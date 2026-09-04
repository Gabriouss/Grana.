import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAberturaPorParametro } from '@/lib/abertura-por-parametro';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
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
import AppPressable from '@/components/AppPressable';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderAction from '@/components/HeaderAction';
import WalletPickerModal from '@/components/WalletPickerModal';
import WalletPill from '@/components/WalletPill';
import { usePrivacy } from '@/lib/privacy-context';
import ItemActionSheet from '@/components/ItemActionSheet';
import BotaoOpcoesItem from '@/components/BotaoOpcoesItem';
import TransactionSheet, { type ValoresLancamento } from '@/components/TransactionSheet';
import Toast from '@/components/Toast';
import PrivacyValue from '@/components/PrivacyValue';
import Sheet from '@/components/Sheet';
import MonthSelector from '@/components/MonthSelector';
import { addBill, deleteBill, fetchBills, fetchCategories, payBill, reopenBill, updateBill } from '@/lib/data';
import { guessAmountFromText, guessCategoryFromText, guessDescFromText, parseDiaVencimento, parseRecorrencia } from '@/lib/heuristics';
import { scheduleBillReminders, cancelBillReminders, carregarNotifPrefs } from '@/lib/notifications';
import { hapticSuccess, hapticTap, hapticDelete } from '@/lib/haptics';
import { addMonthsToISO, formatDateLabel, formatMoney, isSameMonth, parseAmount, todayISO, formatMoneyInput } from '@/lib/format';
import { theme, radius, spacing, screenRhythm, fonts, type, lh } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';
import { useDemo } from '@/lib/demo-context';
import { useWallet } from '@/lib/wallet-context';
import { DEMO_BILLS } from '@/lib/demo-data';
import type { Bill, BillStatus } from '@/lib/types';
import { LIMITS } from '@/lib/limits';

export default function ContasScreen() {
  const router = useRouter();
  const { novaConta, texto } = useLocalSearchParams<{ novaConta?: string; texto?: string }>();
  const { paddingConteudo, total: tabBarTotal } = useTabBarInset();
  const { isDemoMode } = useDemo();
  const { activeWalletId, activeWallet } = useWallet();
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
  /* Categorias criadas pela pessoa. Só servem ao caminho de VOZ desta tela —
     sem elas, "boleto do pet shop 80, categoria Pet" caía em "Outros",
     enquanto a mesma frase pelo WhatsApp acertava. */
  const [categoriasExtras, setCategoriasExtras] = useState<{ name: string; color: string }[]>([]);

  // Aux Pickers & Sheets
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const { hidden, toggle: togglePrivacy } = usePrivacy();

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
      const { lembretesContasAtivo } = await carregarNotifPrefs();
      b.forEach((bill) => {
        if (lembretesContasAtivo) scheduleBillReminders(bill).catch(() => {});
        else cancelBillReminders(bill.id).catch(() => {});
      });
    } catch (e: any) {
      Alert.alert('Erro ao carregar contas', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (isDemoMode) return;
    fetchCategories()
      .then((cats) => setCategoriasExtras(cats.filter((c) => !c.is_default)))
      .catch(() => {});
  }, [isDemoMode]);

  /* Chegando pelo FAB da Início (?novaConta=1): abre o mesmo formulário do
     "+" desta tela. Ver o hook para as duas armadilhas que ele resolve. */
  useAberturaPorParametro(novaConta === '1', () => {
    if (texto) {
      abrirNovaContaDoTexto(texto);
    } else {
      openNewModal();
    }
    router.setParams({ novaConta: undefined, texto: undefined });
  });

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

  /* Abrir o sheet preenchido a partir de uma fala reconhecida por voz (Início
     ou Lançamentos, quando ehIntencaoBoleto detecta "boleto"/"vence dia
     X"/"conta a pagar" e navega pra cá em vez de abrir o modal de colar
     comprovante ou a caixa do crédito). Mesmo extrator do modal de crédito
     pra valor/descrição/categoria; a data de vencimento vem de
     parseDiaVencimento — mesmo motor do bot do WhatsApp. */
  function abrirNovaContaDoTexto(texto: string) {
    setEditingBillId(null);
    const guessedAmount = guessAmountFromText(texto);
    const guessedCat = guessCategoryFromText(texto, categoriasExtras);
    const guessedDesc = guessDescFromText(texto, 'out');
    setDesc(guessedDesc);
    setAmount(guessedAmount > 0 ? formatMoney(guessedAmount) : '');
    setCategory(guessedCat.name);
    setCatColor(guessedCat.color);
    setDueDate(parseDiaVencimento(texto));
    /* Era `false` fixo: "internet 99 vence dia 15 todo mês" virava um boleto
       único, e no mês seguinte a conta não existia mais. */
    setRecurring(parseRecorrencia(texto));
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

  async function handleSave(v: ValoresLancamento) {
    const value = parseAmount(v.amount);
    if (!value || value <= 0) {
      Alert.alert('Informe um valor válido');
      return;
    }
    setSaving(true);
    try {
      if (editingBillId) {
        await updateBill(editingBillId, {
          description: v.description.trim() || 'Sem descrição',
          amount: value,
          category: v.category,
          color: v.color,
          due_date: v.occurred_on,
          recurring: v.recurring,
        });
        // updateBill não devolve a linha atualizada — remonta localmente pra reagendar os lembretes.
        const original = bills.find((b) => b.id === editingBillId);
        if (original) {
          scheduleBillReminders({
            ...original,
            description: v.description.trim() || 'Sem descrição',
            amount: value,
            category: v.category,
            color: v.color,
            due_date: v.occurred_on,
            recurring: v.recurring,
          }).catch(() => {});
        }
        triggerToast('Conta atualizada');
      } else {
        const created = await addBill({
          description: v.description.trim() || 'Sem descrição',
          amount: value,
          category: v.category,
          color: v.color,
          due_date: v.occurred_on,
          recurring: v.recurring,
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
  const walletBills = useMemo(
    () => (activeWalletId === 'total' ? bills : bills.filter((b) => b.wallet_id === activeWalletId)),
    [activeWalletId, bills]
  );

  // Contas cujo VENCIMENTO cai no mês selecionado — cada boleto pertence ao mês em que vence, não em que foi criado.
  const monthBills = useMemo(
    () => walletBills.filter((b) => isSameMonth(b.due_date, selectedYear, selectedMonth)),
    [selectedMonth, selectedYear, walletBills]
  );
  /* Uma passada só, em vez de filter + reduce encadeados: a lista já é
     percorrida por inteiro nas duas versões, mas a anterior alocava um array
     intermediário a cada render só pra somar. */
  const openTotal = useMemo(
    () => monthBills.reduce((s, b) => (b.status !== 'paid' ? s + Number(b.amount) : s), 0),
    [monthBills]
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScreenHeader
        eyebrow="Pagamentos"
        title="Contas a pagar"
        right={
          <>
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

      {/* Resumo e seletor de mês ficam ABAIXO da borda do cabeçalho, não
          dentro dele — mesmo arranjo de Crédito, que é o padrão das telas. */}
      <View style={[styles.filtrosWrap, colunaConteudo]}>
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
      </View>

      {loading ? (
        <ActivityIndicator color={theme.ink} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={monthBills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={[styles.listContent, colunaConteudo, { paddingBottom: paddingConteudo }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ink} />}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma conta vencendo neste mês. Toque no botão "+" para registrar.</Text>}
          renderItem={({ item }) => {
            const info = statusInfo(item);
            return (
              // `position:'relative'` aqui, não na própria AppPressable: o botão de
              // opções precisa ser IRMÃO do card na árvore do DOM, nunca filho dele.
              // O `AppPressable` (com onPress) vira um `<button>` de verdade na web
              // (react-native-web mapeia accessibilityRole="button" pra a tag nativa,
              // não um `<div role="button">` como um comentário antigo achava) — um
              // `BotaoOpcoesItem` (também `<button>`) dentro dele seria
              // `<button><button>...` inválido, e o navegador conserta a árvore
              // fechando o botão de fora antes da hora, quebrando o toque de verdade,
              // não só um aviso no console.
              <View style={{ position: 'relative' }}>
                <AppPressable
                  style={({ hovered }) => [styles.card, hovered && styles.cardHover]}
                  onPress={() => toggleStatus(item)}
                  accessibilityHint="Alterna entre paga e em aberto. Para editar ou excluir, use o botão de opções."
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
                          <Ionicons name="repeat-outline" size={12} color={theme.inkFaint} style={{ marginLeft: spacing.xs }} />
                        )}
                      </View>
                      <Text style={styles.cardCat}>{item.category}</Text>
                    </View>
                    <View style={styles.cardTopAcoes}>
                      <View style={[styles.pill, info.style]}>
                        <Text style={[styles.pillText, info.style === styles.pillLate && styles.pillLateText]}>{info.text}</Text>
                      </View>
                      {/* Espaço reservado do mesmo tamanho do botão real (28×28,
                          ver `BotaoOpcoesItem`), só pra a pílula não esticar pro
                          lugar que o botão flutuante por cima vai ocupar. */}
                      <View style={{ width: 28, height: 28 }} />
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
                {/* `box-none`: a própria View não captura toque nenhum, só o
                    `BotaoOpcoesItem` dentro dela — o resto da área do card continua
                    chegando à `AppPressable` por baixo normalmente. */}
                <View style={styles.botaoOpcoesFlutuante}>
                  <BotaoOpcoesItem
                    accessibilityLabel={`Opções de ${item.description}`}
                    onPress={() => {
                      setSelectedBill(item);
                      setActionSheetOpen(true);
                    }}
                  />
                </View>
              </View>
            );
          }}
        />
      )}

      <AppPressable
        style={({ hovered }) => [styles.fab, { bottom: tabBarTotal + spacing.md }, hovered && styles.fabHover]}
        onPress={openNewModal}
        accessibilityLabel="Nova conta a pagar"
      >
        <Ionicons name="add" size={24} color={theme.paper} />
      </AppPressable>

      {/* Sheet da conta a pagar — mesmo componente das outras telas. */}
      <TransactionSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        modo="boleto"
        editando={!!editingBillId}
        salvando={saving}
        inicial={{
          type: 'out',
          description: desc,
          amount,
          category,
          color: catColor,
          occurred_on: dueDate,
          recurring,
          installments: 1,
          card_id: null,
        }}
        onSalvar={handleSave}
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
  subtitle: { color: theme.inkFaint, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.light },
  subtitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  /* Bloco do corpo da tela: reproduz o espaçamento que o ScreenHeader dava
     quando o resumo e o seletor de mês moravam dentro dele. */
  filtrosWrap: { paddingHorizontal: screenRhythm.padding, paddingTop: screenRhythm.padding, gap: screenRhythm.gap },
  /* paddingBottom vem do useTabBarInset() no JSX — depende da barra flutuante. */
  listContent: { paddingHorizontal: screenRhythm.padding, paddingTop: screenRhythm.gap, gap: screenRhythm.gap },
  emptyText: { color: theme.inkFaint, fontSize: type.apoio, textAlign: 'center', marginTop: spacing.xxl, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.light },
  /* Sem marginBottom aqui: o espaço entre itens já vem do `gap` de
     styles.listContent — somar os dois dobraria a distância entre um card e
     o próximo em relação à distância do primeiro card até o filtro acima. */
  card: { borderWidth: 1, borderColor: theme.rule, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardHover: { backgroundColor: theme.paperRaised, borderColor: theme.ruleStrong },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardNameRow: { flexDirection: 'row', alignItems: 'center' },
  /* Pílula de status e botão de opções na mesma coluna direita do card. */
  cardTopAcoes: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // Mesma posição visual que o botão sempre teve dentro de `cardTopAcoes`
  // (canto superior direito do card, respeitando o padding do card) — só que
  // agora fora da árvore da `AppPressable`, ver comentário acima do card.
  botaoOpcoesFlutuante: { position: 'absolute', top: spacing.md, right: spacing.md, pointerEvents: 'box-none' },
  cardName: { color: theme.ink, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  cardCat: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), marginTop: spacing.fio, fontFamily: fonts.light },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAmount: { color: theme.ink, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'valor'), fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  cardDue: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.light },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pillOk: { backgroundColor: theme.rule },
  pillWarn: { borderWidth: 1, borderColor: theme.ruleStrong },
  pillLate: { backgroundColor: theme.ink },
  pillText: { color: theme.inkSoft, fontSize: type.micro,
  lineHeight: lh(type.micro, 'apoio'), fontFamily: fonts.light },
  // pillLate usa fundo claro (theme.ink) — precisa de texto escuro em vez do
  // pillText claro padrão, senão fica ilegível (claro sobre quase-branco).
  pillLateText: { color: theme.paper},
  /* `bottom` vem do useTabBarInset() no JSX, pra ficar acima da barra
     flutuante — mesma posição do FabButton usado nas outras telas. */
  fab: { position: 'absolute', right: spacing.xl, width: 52, height: 52, borderRadius: 26, backgroundColor: theme.ink, alignItems: 'center', justifyContent: 'center' },
  fabHover: { opacity: 0.85 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo,
  lineHeight: lh(type.titulo, 'titulo'), fontFamily: fonts.regular },
  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: type.corpo, paddingVertical: spacing.sm, fontFamily: fonts.regular },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.icone, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.valor, flex: 1, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.rule },
  fieldKey: { color: theme.inkFaint, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  fieldVal: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldValText: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  dot: { width: 8, height: 8, borderRadius: 4 },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
});
