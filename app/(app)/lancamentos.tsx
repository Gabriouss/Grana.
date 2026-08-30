import { memo, useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAberturaPorParametro } from '@/lib/abertura-por-parametro';
import {
  ActivityIndicator,
  AppState,
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
import AppPressable from '@/components/AppPressable';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderAction from '@/components/HeaderAction';
import ExportPdfButton from '@/components/ExportPdfButton';
import WalletPickerModal from '@/components/WalletPickerModal';
import WalletPill from '@/components/WalletPill';
import PasteReceiptModal from '@/components/PasteReceiptModal';
import VoiceEntryButton from '@/components/VoiceEntryButton';
import ImportarExtratoModal from '@/components/ImportarExtratoModal';
import ItemActionSheet from '@/components/ItemActionSheet';
import Toast from '@/components/Toast';
import PrivacyValue from '@/components/PrivacyValue';
import { usePrivacy } from '@/lib/privacy-context';
import Sheet from '@/components/Sheet';
import TransactionSheet, { type ValoresLancamento } from '@/components/TransactionSheet';
import SegmentedTabs from '@/components/SegmentedTabs';
import FabButton from '@/components/FabButton';
import MonthSelector from '@/components/MonthSelector';
import {
  addInstallmentPurchase,
  addTransaction,
  criarOcorrenciasRecorrentes,
  deleteTransaction,
  fetchRecurrenceContext,
  fetchTransactionsDoPeriodo,
  updateTransaction,
} from '@/lib/data';
import { ocorrenciasFaltantes } from '@/lib/recorrencia';
import {
  flushPendingQueue,
  getCachedTransactions,
  getPendingCount,
  isLikelyNetworkError,
  queuePendingTransaction,
  setCachedTransactions,
} from '@/lib/offline-cache';
import { hapticDelete } from '@/lib/haptics';
import { addMonthsToISO, formatDateLabel, formatMoney, isSameMonth, isCreditTx, parseAmount, todayISO } from '@/lib/format';
import { theme, radius, spacing, screenRhythm, fonts, type, lh } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';
import { useDemo } from '@/lib/demo-context';
import { useWallet } from '@/lib/wallet-context';
import { DEMO_TRANSACTIONS } from '@/lib/demo-data';
import type { Transaction, TxType } from '@/lib/types';

/**
 * Uma linha da lista, memorizada.
 *
 * O `renderItem` era uma função criada dentro do render, na mesma tela onde
 * moram `search` e `categoryFilter`. Cada caractere digitado na busca
 * recriava a função e redesenhava TODAS as linhas montadas, num aparelho
 * modesto com histórico grande. Com a linha memorizada e o `renderItem`
 * estável, só as linhas cujo lançamento mudou são redesenhadas.
 */
const LinhaLancamento = memo(function LinhaLancamento({
  item,
  aoAbrirAcoes,
}: {
  item: Transaction;
  aoAbrirAcoes: (tx: Transaction) => void;
}) {
  const abrir = () => aoAbrirAcoes(item);
  return (
    <AppPressable
      style={({ hovered }) => [styles.row, hovered && styles.rowHover]}
      /* Toque simples abre a folha, e o toque longo continua como atalho.
         Antes só existia o toque longo: um gesto que leitor de tela não expõe,
         teclado não alcança e, no computador, ninguém descobre. Editar ou
         apagar um lançamento errado é tarefa central deste app, não pode morar
         num gesto invisível. */
      onPress={abrir}
      onLongPress={abrir}
      accessibilityHint="Abre as opções de editar e excluir este lançamento."
    >
      <View style={[styles.icon, { backgroundColor: item.color + '25' }]}>
        <Text style={styles.iconText}>{item.category.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {/* Nome do lançamento em destaque principal */}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.description && item.description.trim() ? item.description : item.category}
        </Text>
        {/* Ver o comentário equivalente na Início: a cor da categoria
            reprovava no contraste AA como texto de 12px, então o nome fica em
            cor de tinta e quem carrega a identidade é o avatar. */}
        <Text style={styles.rowSub}>
          {item.category}
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
  );
});

export default function LancamentosScreen() {
  const router = useRouter();
  const { novoLancamento } = useLocalSearchParams<{ novoLancamento?: string }>();
  const { paddingConteudo } = useTabBarInset();
  const { isDemoMode } = useDemo();
  const { activeWalletId, activeWallet, activeWalletName } = useWallet();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
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

  /* Limites do mês visível, no formato de data do banco. `0` no dia do mês
     seguinte devolve o último dia deste — inclusive em fevereiro bissexto. */
  const pad = (n: number) => String(n).padStart(2, '0');
  const inicioDoMes = `${selectedYear}-${pad(selectedMonth + 1)}-01`;
  const fimDoMes = `${selectedYear}-${pad(selectedMonth + 1)}-${pad(new Date(selectedYear, selectedMonth + 1, 0).getDate())}`;

  /* O cache é a UNIÃO dos meses já baixados, não só o último. Sem isso,
     navegar para outro mês apagaria da memória offline o mês anterior. */
  const guardarNoCache = useCallback(async (doMes: Transaction[]) => {
    const anterior = (await getCachedTransactions()) ?? [];
    const porId = new Map(anterior.map((t) => [t.id, t]));
    /* O mês recém-baixado é a verdade para o período dele: remove o que sumiu
       (excluído em outro aparelho) antes de reinserir o que veio agora. */
    for (const t of anterior) {
      if (t.occurred_on >= inicioDoMes && t.occurred_on <= fimDoMes) porId.delete(t.id);
    }
    for (const t of doMes) porId.set(t.id, t);
    await setCachedTransactions([...porId.values()]);
  }, [inicioDoMes, fimDoMes]);

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
      /* Só o mês visível. A tela deriva TUDO de `monthTransactions`: totais,
         chips de categoria, busca e filtro. Baixar o histórico inteiro para
         mostrar trinta dias era trabalho jogado fora que crescia sem teto. */
      let tx = await fetchTransactionsDoPeriodo(inicioDoMes, fimDoMes);
      setOffline(false);
      await guardarNoCache(tx);

      // A rede respondeu — aproveita pra tentar sincronizar o que ficou pendente offline.
      const { synced } = await flushPendingQueue();
      if (synced > 0) {
        tx = await fetchTransactionsDoPeriodo(inicioDoMes, fimDoMes);
        await guardarNoCache(tx);
        triggerToast(synced === 1 ? '1 lançamento sincronizado' : `${synced} lançamentos sincronizados`);
      }

      /* Assinaturas ("repetir mensalmente") só existem no mês seguinte se
         alguém as criar — é aqui que isso acontece.
 
         O contexto vem de `fetchRecurrenceContext()`, e NÃO do mês carregado
         acima: a decisão de criar compara os meses já ocupados de cada série,
         então alimentar isto com um recorte faria todo mês ausente parecer um
         mês a preencher, e o estrago seria lançamento duplicado no extrato.
         `__tests__/corpus-recorrencia.ts` guarda exatamente esse caso. */
      const faltantes = ocorrenciasFaltantes(await fetchRecurrenceContext(), todayISO());
      if (faltantes.length > 0) {
        await criarOcorrenciasRecorrentes(faltantes);
        tx = await fetchTransactionsDoPeriodo(inicioDoMes, fimDoMes);
        await guardarNoCache(tx);
      }

      setTransactions(tx);
      setPendingCount(await getPendingCount());
    } catch (e: any) {
      const cached = await getCachedTransactions();
      if (cached) {
        /* O cache guarda a união dos meses já visitados, então offline ainda
           dá para navegar entre os meses que a pessoa abriu com rede. */
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
  }, [isDemoMode, inicioDoMes, fimDoMes, guardarNoCache]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /* Estáveis entre renders: é o que permite ao `memo` da linha funcionar. */
  const abrirAcoesDoLancamento = useCallback((tx: Transaction) => {
    setSelectedTx(tx);
    setActionSheetOpen(true);
  }, []);
  const renderizarLinha = useCallback(
    ({ item }: { item: Transaction }) => <LinhaLancamento item={item} aoAbrirAcoes={abrirAcoesDoLancamento} />,
    [abrirAcoesDoLancamento]
  );

  /* Chegando pelo FAB da Início (?novoLancamento=in|out): abre o mesmo
     formulário do "+" desta tela, já com o tipo escolhido lá. Ver o hook para
     as duas armadilhas que ele resolve. */
  useAberturaPorParametro(novoLancamento === 'in' || novoLancamento === 'out', () => {
    openNewModal(novoLancamento as TxType);
    router.setParams({ novoLancamento: undefined });
  });

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

  async function handleSave(v: ValoresLancamento) {
    const value = parseAmount(v.amount);
    if (!value || value <= 0) {
      Alert.alert('Informe um valor válido');
      return;
    }

    // Só faz sentido parcelar uma saída nova (não uma edição, nem uma entrada).
    const parcelas = Math.max(2, v.installments);
    const isInstallmentSave = v.installments > 1 && !editingTxId && v.type === 'out';

    if (isDemoMode) {
      // Modo de exemplo é só uma "lente" de exploração — nunca deve tocar o banco real.
      if (editingTxId) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editingTxId
              ? { ...t, type: v.type, description: v.description.trim() || 'Sem descrição', amount: value, category: v.category, color: v.color, occurred_on: v.occurred_on, recurring: v.recurring }
              : t
          )
        );
        triggerToast('Lançamento atualizado (exemplo)');
      } else if (isInstallmentSave) {
        const baseDesc = v.description.trim() || 'Compra parcelada';
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
            category: v.category,
            color: v.color,
            occurred_on: addMonthsToISO(v.occurred_on, i),
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
            type: v.type,
            description: v.description.trim() || (v.type === 'in' ? 'Entrada' : 'Saída'),
            amount: value,
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
      setModalOpen(false);
      return;
    }

    setSaving(true);
    try {
      if (editingTxId) {
        await updateTransaction(editingTxId, {
          type: v.type,
          description: v.description.trim() || 'Sem descrição',
          amount: value,
          category: v.category,
          color: v.color,
          occurred_on: v.occurred_on,
          recurring: v.recurring,
        });
        triggerToast('Lançamento atualizado');
      } else if (isInstallmentSave) {
        await addInstallmentPurchase({
          description: v.description.trim(),
          totalAmount: value,
          category: v.category,
          color: v.color,
          occurred_on: v.occurred_on,
          installments: parcelas,
          wallet_id: activeWallet?.id ?? null,
        });
        triggerToast(`Compra parcelada em ${parcelas}x`);
      } else {
        const input = {
          type: v.type,
          description: v.description.trim() || (v.type === 'in' ? 'Entrada' : 'Saída'),
          amount: value,
          category: v.category,
          color: v.color,
          occurred_on: v.occurred_on,
          recurring: v.recurring,
          wallet_id: activeWallet?.id ?? null,
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

  // Só a carteira ativa — "Total" mantém tudo. Mesmo filtro usado em index.tsx e graficos.tsx.
  // Compra no crédito não aparece aqui — só na aba Crédito — até a fatura ser
  // paga, quando vira uma saída de caixa de verdade (ver lib/data.ts::payCardInvoice).
  const walletTransactions =
    (activeWalletId === 'total' ? transactions : transactions.filter((t) => t.wallet_id === activeWalletId)).filter(
      (t) => !isCreditTx(t)
    );

  // Transações estritamente do mês selecionado
  const monthTransactions = walletTransactions.filter((t) => isSameMonth(t.occurred_on, selectedYear, selectedMonth));
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
      <ScreenHeader
        eyebrow="Movimentações"
        title="Lançamentos"
        right={
          <>
            <HeaderAction
              icon="clipboard-outline"
              onPress={() => setPasteModalOpen(true)}
              accessibilityLabel="Colar comprovante"
            />
            <HeaderAction
              icon="document-text-outline"
              onPress={() => setCsvModalOpen(true)}
              accessibilityLabel="Importar extrato"
            />
            {/* Sem `style`: a geometria do círculo mora no próprio
                VoiceEntryButton (styles.iconBtn), igual à do HeaderAction.
                O `headerBtn` local existia pra replicar essa geometria à mão
                e só servia pra ela sair de sincronia. */}
            <VoiceEntryButton
              iconSize={16}
              onTranscribed={(text) => {
                setVoiceText(text);
                setPasteModalOpen(true);
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

      {/* Filtros, resumo e seletor de mês ficam ABAIXO da borda do cabeçalho,
          não dentro dele. O cabeçalho é só eyebrow + título + ações — mesmo
          arranjo de Crédito, que é o padrão das telas. */}
      <View style={[styles.filtrosWrap, colunaConteudo]}>
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
            <AppPressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Limpar busca">
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
          contentContainerStyle={[styles.listContent, colunaConteudo, { paddingBottom: paddingConteudo }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ink} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {search || categoryFilter
                ? 'Nenhum lançamento encontrado com esse filtro.'
                : 'Nenhum lançamento ainda. Toque no "+" para registrar o primeiro ou use os botões acima para colar comprovante ou importar CSV.'}
            </Text>
          }
          renderItem={renderizarLinha}
          ListFooterComponent={
            monthTransactions.length > 0 ? (
              <View style={styles.exportWrap}>
                <ExportPdfButton
                  ano={selectedYear}
                  mes={selectedMonth}
                  transactions={monthTransactions}
                  carteira={activeWalletName}
                />
              </View>
            ) : null
          }
        />
      )}


      {/* FAB — mesmo componente da Home, só sem a opção Boleto (isso fica em Contas) */}
      <FabButton onAddIncome={() => openNewModal('in')} onAddExpense={() => openNewModal('out')} />

      {/* Sheet de lançamento — mesmo componente da tela de Crédito. */}
      <TransactionSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        modo="carteira"
        editando={!!editingTxId}
        salvando={saving}
        inicial={{
          type,
          description: desc,
          amount,
          category,
          color: catColor,
          occurred_on: occurredOn,
          recurring,
          installments: installment ? Math.max(2, Math.round(Number(installmentCount) || 2)) : 1,
          card_id: null,
        }}
        onSalvar={handleSave}

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
      <ImportarExtratoModal
        visible={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onSuccess={() => {
          triggerToast('Lançamentos importados');
          load();
        }}
      />

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />

      <WalletPickerModal visible={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  /* Bloco de filtros do corpo da tela: reproduz o espaçamento que o
     ScreenHeader dava quando eles moravam dentro dele. */
  filtrosWrap: { paddingHorizontal: screenRhythm.padding, paddingTop: screenRhythm.padding, gap: screenRhythm.gap },
  /* paddingBottom vem do useTabBarInset() no JSX — depende da barra flutuante. */
  listContent: { paddingHorizontal: screenRhythm.padding, paddingTop: screenRhythm.gap },
  exportWrap: { marginTop: spacing.xl },
  emptyText: { color: theme.inkFaint, fontSize: type.apoio, textAlign: 'center', marginTop: 30, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.light },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.xs, borderRadius: radius.sm, borderBottomWidth: 1, borderBottomColor: theme.rule },
  rowHover: { backgroundColor: theme.paperRaised },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: theme.ink, fontSize: type.legenda, fontFamily: fonts.regular },
  /* `lineHeight` explícito: sem ele a Neue Machina entrega o leading
     intrínseco dela, curto, e a descendente do título encostava na linha de
     baixo — o que fazia a lista inteira parecer emendada. */
  rowTitle: { color: theme.ink, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  rowSub: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), marginTop: 2, fontFamily: fonts.light },
  rowAmount: { fontSize: type.apoio, fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  rowAmountWrap: { flexDirection: 'row', alignItems: 'baseline' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: theme.paper },
  typeBtnOut: { backgroundColor: theme.saidaFundo, borderWidth: 1, borderColor: theme.saidaBorda },
  typeBtnIn: { backgroundColor: theme.entradaFundo, borderWidth: 1, borderColor: theme.entradaBorda },
  typeText: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  typeTextOn: { color: theme.ink},
  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: type.corpo, paddingVertical: 8, fontFamily: fonts.regular },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.valor, flex: 1, fontFamily: fonts.regular },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.rule },
  fieldKey: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  fieldVal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValText: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  dot: { width: 8, height: 8, borderRadius: 4 },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
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
  monthSummaryLabel: { color: theme.inkFaint, fontSize: type.legenda, marginBottom: 2, letterSpacing: 0.5, fontFamily: fonts.light },
  monthSummaryVal: { fontSize: type.apoio, fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
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
  dateQuickText: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  dateQuickTextActive: { color: theme.ink},
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
  offlineBannerText: { color: theme.inkFaint, fontSize: type.legenda, flexShrink: 1, fontFamily: fonts.light },
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
  searchInput: { flex: 1, color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
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
  categoryChipText: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  categoryChipTextActive: { color: theme.ink},
});



