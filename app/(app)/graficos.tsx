import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '@/components/ScreenHeader';
import AppPressable from '@/components/AppPressable';
import StackedBarChart, { type BarColumn } from '@/components/StackedBarChart';
import PieChart, { type PieSlice } from '@/components/PieChart';
import PrivacyValue from '@/components/PrivacyValue';
import WalletPickerModal from '@/components/WalletPickerModal';
import ExportPdfButton from '@/components/ExportPdfButton';
import WalletPill from '@/components/WalletPill';
import { useWallet } from '@/lib/wallet-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { DEMO_TRANSACTIONS } from '@/lib/demo-data';
import { fetchTransactions } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { theme, radius, spacing, type } from '@/lib/theme';
import type { Transaction } from '@/lib/types';

type TabModo = 'geral' | 'despesas' | 'renda';
type Granularidade = 'anos' | 'meses';

const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export default function GraficosScreen() {
  const { activeWalletId, activeWalletName } = useWallet();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { isDemoMode } = useDemo();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletModalVisible, setWalletModalVisible] = useState(false);

  const [tabModo, setTabModo] = useState<TabModo>('despesas');
  const [granularidade, setGranularidade] = useState<Granularidade>('anos');

  const carregarDados = useCallback(async () => {
    try {
      if (isDemoMode) {
        setTransactions(DEMO_TRANSACTIONS);
        return;
      }
      const data = await fetchTransactions();
      setTransactions(data || []);
    } catch (e) {
      console.warn('Erro ao carregar transações para gráficos:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    carregarDados();
  }, [carregarDados]);

  // Filtra transações pela carteira selecionada
  const filteredTransactions = useMemo(() => {
    if (activeWalletId === 'total') return transactions;
    return transactions.filter((tx) => tx.wallet_id === activeWalletId);
  }, [transactions, activeWalletId]);

  // Agrupamento Ano a Ano ou Mês a Mês
  const barColumns: BarColumn[] = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    const targetType = tabModo === 'renda' ? 'in' : 'out';
    const txsToUse =
      tabModo === 'geral'
        ? filteredTransactions
        : filteredTransactions.filter((t) => t.type === targetType);

    if (granularidade === 'anos') {
      // Agrupa por ano (ex: 2024, 2025, 2026)
      const porAno: Record<string, Record<string, { amount: number; color: string }>> = {};
      const anosSet = new Set<string>();

      txsToUse.forEach((tx) => {
        const ano = tx.occurred_on.slice(0, 4);
        anosSet.add(ano);
        if (!porAno[ano]) porAno[ano] = {};

        const cat = tx.category || 'Outros';
        const cor = tx.color || '#1fa98d';
        if (!porAno[ano][cat]) {
          porAno[ano][cat] = { amount: 0, color: cor };
        }
        porAno[ano][cat].amount += Number(tx.amount || 0);
      });

      const anosOrdenados = Array.from(anosSet).sort();

      return anosOrdenados.map((ano) => {
        const catMap = porAno[ano] || {};
        const segments = Object.entries(catMap)
          .map(([cat, info]) => ({
            category: cat,
            amount: info.amount,
            color: info.color,
          }))
          .sort((a, b) => b.amount - a.amount);

        const total = segments.reduce((acc, s) => acc + s.amount, 0);

        return {
          label: ano,
          sublabel: `${segments.length} categorias`,
          total,
          segments,
        };
      });
    } else {
      // Agrupa pelos últimos 6 meses
      const hoje = new Date();
      const mesesLabels: { anoMes: string; label: string }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const anoMes = d.toISOString().slice(0, 7);
        const label = MESES_ABREV[d.getMonth()];
        mesesLabels.push({ anoMes, label });
      }

      return mesesLabels.map(({ anoMes, label }) => {
        const txsMes = txsToUse.filter((t) => t.occurred_on.startsWith(anoMes));
        const catMap: Record<string, { amount: number; color: string }> = {};

        txsMes.forEach((t) => {
          const cat = t.category || 'Outros';
          const cor = t.color || '#1fa98d';
          if (!catMap[cat]) catMap[cat] = { amount: 0, color: cor };
          catMap[cat].amount += Number(t.amount || 0);
        });

        const segments = Object.entries(catMap)
          .map(([cat, info]) => ({
            category: cat,
            amount: info.amount,
            color: info.color,
          }))
          .sort((a, b) => b.amount - a.amount);

        const total = segments.reduce((acc, s) => acc + s.amount, 0);

        return {
          label,
          sublabel: anoMes,
          total,
          segments,
        };
      });
    }
  }, [filteredTransactions, tabModo, granularidade]);

  // Fatias do Donut Totalizador do Período
  const pieSlices: PieSlice[] = useMemo(() => {
    const targetType = tabModo === 'renda' ? 'in' : 'out';
    const txsToUse =
      tabModo === 'geral'
        ? filteredTransactions
        : filteredTransactions.filter((t) => t.type === targetType);

    const catMap: Record<string, { amount: number; color: string }> = {};
    txsToUse.forEach((t) => {
      const cat = t.category || 'Outros';
      const cor = t.color || '#1fa98d';
      if (!catMap[cat]) catMap[cat] = { amount: 0, color: cor };
      catMap[cat].amount += Number(t.amount || 0);
    });

    return Object.entries(catMap)
      .map(([name, info]) => ({
        name,
        color: info.color,
        value: info.amount,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions, tabModo]);

  const totalPeriodo = useMemo(() => {
    return pieSlices.reduce((acc, s) => acc + s.value, 0);
  }, [pieSlices]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.paper }}>
      <ScreenHeader
        eyebrow="RELATÓRIOS"
        title="Gráficos e Histórico"
        right={
          <>
            {/* Botão de Privacidade */}
            <AppPressable onPress={togglePrivacy} hitSlop={8} style={styles.headerBtn}>
              <Ionicons
                name={hidden ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={theme.inkFaint}
              />
            </AppPressable>

            {/* Seletor de Carteiras — sempre o último item da linha */}
            <WalletPill onPress={() => setWalletModalVisible(true)} />
          </>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Abas Superiores (GERAL | DESPESAS | RENDA) */}
        <View style={styles.tabContainer}>
          {(['despesas', 'renda', 'geral'] as TabModo[]).map((tab) => (
            <AppPressable
              key={tab}
              style={[styles.tabBtn, tabModo === tab && styles.tabBtnActive]}
              onPress={() => setTabModo(tab)}
            >
              <Text style={[styles.tabBtnText, tabModo === tab && styles.tabBtnTextActive]}>
                {tab === 'despesas' ? 'Despesas' : tab === 'renda' ? 'Renda' : 'Geral'}
              </Text>
            </AppPressable>
          ))}
        </View>

        {/* Filtro de Granularidade (Ano a Ano | Mês a Mês) */}
        <View style={styles.granularityRow}>
          <AppPressable
            style={[styles.granularityChip, granularidade === 'anos' && styles.granularityChipActive]}
            onPress={() => setGranularidade('anos')}
          >
            <Ionicons
              name="calendar-outline"
              size={14}
              color={granularidade === 'anos' ? '#052229' : theme.inkFaint}
            />
            <Text
              style={[
                styles.granularityChipText,
                granularidade === 'anos' && styles.granularityChipTextActive,
              ]}
            >
              Ano a Ano
            </Text>
          </AppPressable>

          <AppPressable
            style={[styles.granularityChip, granularidade === 'meses' && styles.granularityChipActive]}
            onPress={() => setGranularidade('meses')}
          >
            <Ionicons
              name="time-outline"
              size={14}
              color={granularidade === 'meses' ? '#052229' : theme.inkFaint}
            />
            <Text
              style={[
                styles.granularityChipText,
                granularidade === 'meses' && styles.granularityChipTextActive,
              ]}
            >
              Mês a Mês
            </Text>
          </AppPressable>
        </View>

        {/* Gráfico de Barras Empilhadas Categorizadas */}
        <StackedBarChart columns={barColumns} height={220} />

        {/* Total Consolidado do Período */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            {tabModo === 'despesas'
              ? 'Total gasto no período'
              : tabModo === 'renda'
              ? 'Total recebido no período'
              : 'Movimentação no período'}
          </Text>
          <PrivacyValue>
            <Text style={styles.summaryValue}>R$ {formatMoney(totalPeriodo)}</Text>
          </PrivacyValue>
        </View>

        {/* Distribuição por Categorias (Donut) */}
        {pieSlices.length > 0 && (
          <View style={styles.donutCard}>
            <Text style={styles.donutTitle}>Composição por Categorias</Text>
            <View style={styles.donutRow}>
              <PieChart data={pieSlices} size={150} />
              <View style={styles.legendCol}>
                {pieSlices.slice(0, 5).map((slice, i) => (
                  <View key={i} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
                    <Text style={styles.legendName} numberOfLines={1}>
                      {slice.name}
                    </Text>
                    <PrivacyValue>
                      <Text style={styles.legendVal}>R$ {formatMoney(slice.value)}</Text>
                    </PrivacyValue>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        <ExportPdfButton
          ano={new Date().getFullYear()}
          mes={new Date().getMonth()}
          transactions={filteredTransactions}
          carteira={activeWalletName}
        />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal de Seleção de Carteiras */}
      <WalletPickerModal
        visible={walletModalVisible}
        onClose={() => setWalletModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  headerBtn: {
    padding: 6,
    borderRadius: radius.sm,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.paper,
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(31,169,141,0.2)',
  },
  tabBtnText: {
    color: theme.inkFaint,
    fontSize: type.apoio,
    fontWeight: '500',
  },
  tabBtnTextActive: {
    color: theme.accent2,
    fontWeight: '700',
  },
  granularityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  granularityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  granularityChipActive: {
    backgroundColor: theme.accent2,
    borderColor: theme.accent2,
  },
  granularityChipText: {
    color: theme.inkFaint,
    fontSize: type.nota,
    fontWeight: '500',
  },
  granularityChipTextActive: {
    color: '#052229',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: theme.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.md,
    gap: 4,
  },
  summaryLabel: {
    color: theme.inkFaint,
    fontSize: type.nota,
  },
  summaryValue: {
    color: theme.ink,
    fontSize: 22,
    fontWeight: '700',
  },
  donutCard: {
    backgroundColor: theme.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.md,
    gap: spacing.sm,
  },
  donutTitle: {
    color: theme.ink,
    fontSize: type.corpo,
    fontWeight: '600',
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  legendCol: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendName: {
    flex: 1,
    color: theme.ink,
    fontSize: type.nota,
  },
  legendVal: {
    color: theme.inkFaint,
    fontSize: type.nota,
    fontWeight: '600',
  },
});
