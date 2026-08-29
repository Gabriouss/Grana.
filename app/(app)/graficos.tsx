import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/lib/tab-bar';
import { colunaConteudo, controleCompacto, useBreakpoint, LARGURA_MAXIMA_CONTEUDO } from '@/lib/breakpoints';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '@/components/ScreenHeader';
import HeaderAction from '@/components/HeaderAction';
import AppPressable from '@/components/AppPressable';
import { type BarColumn } from '@/components/StackedBarChart';
import LineAreaChart from '@/components/LineAreaChart';
import PieChart, { type PieSlice } from '@/components/PieChart';
import DatePickerModal from '@/components/DatePickerModal';
import SegmentedTabs from '@/components/SegmentedTabs';
import PrivacyValue from '@/components/PrivacyValue';
import WalletPickerModal from '@/components/WalletPickerModal';
import ExportPdfButton from '@/components/ExportPdfButton';
import WalletPill from '@/components/WalletPill';
import { useWallet } from '@/lib/wallet-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { DEMO_TRANSACTIONS } from '@/lib/demo-data';
import { fetchTransactions } from '@/lib/data';
import { formatMoney, isCreditTx, todayISO, formatDateLabel } from '@/lib/format';
import { theme, radius, spacing, type, screenRhythm, card as cardTokens, fonts } from '@/lib/theme';
import type { Transaction } from '@/lib/types';

type TabModo = 'geral' | 'despesas' | 'renda';
type Granularidade = 'anos' | 'meses' | 'periodo';

/** Diferença em meses inteiros entre dois "YYYY-MM-DD", inclusive nas pontas. */
function mesesEntre(inicioISO: string, fimISO: string): { anoMes: string; label: string }[] {
  const [anoIni, mesIni] = inicioISO.split('-').map(Number);
  const [anoFim, mesFim] = fimISO.split('-').map(Number);
  const totalMeses = Math.max((anoFim - anoIni) * 12 + (mesFim - mesIni), 0);
  const lista: { anoMes: string; label: string }[] = [];
  // Teto de 24 pontos: um período de anos inteiros não deveria virar uma
  // régua ilegível de dezenas de rótulos espremidos no eixo X.
  const passo = totalMeses > 24 ? Math.ceil((totalMeses + 1) / 24) : 1;
  for (let i = 0; i <= totalMeses; i += passo) {
    const d = new Date(anoIni, mesIni - 1 + i, 1);
    const anoMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    lista.push({ anoMes, label: `${MESES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` });
  }
  return lista;
}

const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export default function GraficosScreen() {
  const { paddingConteudo } = useTabBarInset();
  const { activeWalletId, activeWalletName } = useWallet();
  /* O donut nasceu com 150px, medida boa para a largura de um celular. Num
     card que agora tem mais de 1000px ele vira um detalhe no canto, com a
     legenda ocupando todo o resto — e é o donut que carrega a informação.
     Cresce com a janela, mantendo a legenda ao lado. */
  const { ehAmplo, ehMedio, ehCompacto, largura } = useBreakpoint();
  const tamanhoDonut = ehAmplo ? 280 : ehMedio ? 220 : 150;
  /* Largura real do card do gráfico de linha, calculada em vez de medida por
     onLayout — dentro do ScrollView largo da web, onLayout fica preso na
     primeira medição (estreita, de antes do layout final assentar) e nunca
     acompanha o card verdadeiro, deixando o desenho colado à esquerda de um
     card muito mais largo. Mesmo padrão do `tamanhoDonut` acima: a tela já
     sabe a largura disponível, então calcula e passa pronta. */
  const sidebarLargura = ehAmplo ? 232 : ehMedio ? 76 : 0;
  const larguraConteudo = Math.min(largura - sidebarLargura, LARGURA_MAXIMA_CONTEUDO);
  const larguraGrafico = larguraConteudo - screenRhythm.padding * 2 - spacing.lg * 2;
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { isDemoMode } = useDemo();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletModalVisible, setWalletModalVisible] = useState(false);

  const [tabModo, setTabModo] = useState<TabModo>('despesas');
  const [granularidade, setGranularidade] = useState<Granularidade>('anos');
  const hoje = todayISO();
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [periodoFim, setPeriodoFim] = useState(hoje);
  const [pickerAberto, setPickerAberto] = useState<'inicio' | 'fim' | null>(null);

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

  // Filtra transações pela carteira selecionada. Compra no crédito fica de
  // fora — só aparece na aba Crédito até a fatura ser paga (vira saída real).
  const filteredTransactions = useMemo(() => {
    const base = activeWalletId === 'total' ? transactions : transactions.filter((tx) => tx.wallet_id === activeWalletId);
    const semCredito = base.filter((tx) => !isCreditTx(tx));
    // Só recorta pela data quando "Período" está ativo — Ano a Ano e Mês a
    // Mês continuam olhando o histórico inteiro, do jeito que já era.
    if (granularidade !== 'periodo') return semCredito;
    return semCredito.filter((tx) => tx.occurred_on >= periodoInicio && tx.occurred_on <= periodoFim);
  }, [transactions, activeWalletId, granularidade, periodoInicio, periodoFim]);

  // Agrupamento Ano a Ano ou Mês a Mês
  const barColumns: BarColumn[] = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    const targetType = tabModo === 'renda' ? 'in' : 'out';
    const txsToUse =
      tabModo === 'geral'
        ? filteredTransactions
        : filteredTransactions.filter((t) => t.type === targetType);

    /* 'anos' e 'meses' mostram exatamente a mesma linha contínua — pedido
       explícito do autor: "Ano a Ano" não agrega mais por ano, os dois
       botões levam ao mesmo lugar (a distinção que existia antes, um ponto
       por ano, foi removida de propósito). */
    let mesesLabels: { anoMes: string; label: string }[];

    if (granularidade === 'periodo') {
      mesesLabels = mesesEntre(periodoInicio, periodoFim);
    } else if (txsToUse.length === 0) {
      mesesLabels = [];
    } else {
      /* TODOS os meses com lançamento, do primeiro ao mais recente — não
         mais um teto fixo dos "últimos 6 meses" a partir de hoje, que
         escondia qualquer lançamento fora dessa janela (inclusive meses
         mais antigos com movimentação real). Preenche os meses vazios NO
         MEIO do intervalo em vez de escondê-los, e reaproveita o teto de 24
         pontos já pronto em mesesEntre() pra não virar uma régua ilegível
         quando o intervalo é de anos inteiros. */
      const anosMeses = txsToUse.map((t) => t.occurred_on.slice(0, 7)).sort();
      const primeiro = anosMeses[0];
      const ultimo = anosMeses[anosMeses.length - 1];
      mesesLabels = mesesEntre(`${primeiro}-01`, `${ultimo}-01`);
    }

    return mesesLabels.map(({ anoMes, label }) => {
      const txsMes = txsToUse.filter((t) => t.occurred_on.startsWith(anoMes));
      const catMap: Record<string, { amount: number; color: string }> = {};

      txsMes.forEach((t) => {
        const cat = t.category || 'Outros';
        const cor = t.color || theme.accent;
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
  }, [filteredTransactions, tabModo, granularidade, periodoInicio, periodoFim]);

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
      const cor = t.color || theme.accent;
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
        eyebrow="Relatórios"
        title="Gráficos"
        right={
          <>
            <HeaderAction
              icon={hidden ? 'eye-off-outline' : 'eye-outline'}
              onPress={togglePrivacy}
              accessibilityLabel={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            />

            {/* Seletor de Carteiras — sempre o último item da linha */}
            <WalletPill onPress={() => setWalletModalVisible(true)} />
          </>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.content, colunaConteudo, { paddingBottom: paddingConteudo }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Em telas médias/amplas (web) as duas fileiras de filtro cabem numa
            só, com Despesas/Renda/Geral ajustado à direita — a régua de
            granularidade fica à esquerda, colada no gráfico logo abaixo. No
            celular (`ehCompacto`) continuam empilhadas, cada uma ocupando a
            linha inteira: é só a largura estreita que exige isso. */}
        <View
          style={[
            styles.filtrosRow,
            /* `column-reverse` no celular: o DOM abaixo lista granularidade
               primeiro e as abas depois (pra "row" empurrar as abas pra
               direita), mas a ordem visual do celular sempre foi abas em
               cima, granularidade embaixo — reverter a coluna devolve essa
               ordem sem duplicar o JSX pras duas larguras. Na versão em
               linha (`filtrosRowLargo`) o `controleCompacto` NÃO entra: seu
               teto de 460px é pensado pra um controle sozinho, e aqui
               cortaria a régua inteira (grupo + abas) bem antes da borda do
               card, matando o "ajustado à direita". */
            ehCompacto ? [styles.filtrosColunaCompacta, controleCompacto] : styles.filtrosRowLargo,
          ]}
        >
          {/* Filtro de Granularidade (Ano a Ano | Mês a Mês | Período) — mesmo
              SegmentedTabs das abas à direita, pedido explícito de deixar os
              dois grupos com a mesma linguagem visual (antes este usava
              chips com borda e ícone, um estilo à parte). */}
          <SegmentedTabs
            options={[
              { key: 'anos', label: 'Ano a Ano' },
              { key: 'meses', label: 'Mês a Mês' },
              { key: 'periodo', label: 'Período' },
            ]}
            value={granularidade}
            onChange={setGranularidade}
            style={ehCompacto ? controleCompacto : styles.granularityAutoWidth}
          />

          {/* Abas Superiores (GERAL | DESPESAS | RENDA) */}
          <SegmentedTabs
            options={[
              { key: 'despesas', label: 'Despesas' },
              { key: 'renda', label: 'Renda' },
              { key: 'geral', label: 'Geral' },
            ]}
            value={tabModo}
            onChange={setTabModo}
            style={ehCompacto ? controleCompacto : styles.tabsAutoWidth}
          />
        </View>

        {/* Data de início/fim — só aparece com "Período" selecionado. */}
        {granularidade === 'periodo' && (
          <View style={[styles.periodoRow, controleCompacto]}>
            <AppPressable style={styles.periodoField} onPress={() => setPickerAberto('inicio')}>
              <Text style={styles.periodoFieldLabel}>De</Text>
              <Text style={styles.periodoFieldValue}>{formatDateLabel(periodoInicio)}</Text>
            </AppPressable>
            <Ionicons name="arrow-forward" size={14} color={theme.inkFaint} />
            <AppPressable style={styles.periodoField} onPress={() => setPickerAberto('fim')}>
              <Text style={styles.periodoFieldLabel}>Até</Text>
              <Text style={styles.periodoFieldValue}>{formatDateLabel(periodoFim)}</Text>
            </AppPressable>
          </View>
        )}

        {/* Gráfico de linha — total por período, com a composição por
            categoria da coluna selecionada logo abaixo. */}
        <LineAreaChart columns={barColumns} height={240} width={larguraGrafico} />

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
            <View style={[styles.donutRow, ehCompacto && styles.donutRowCompacta, !ehCompacto && styles.donutRowLargo]}>
              <PieChart data={pieSlices} size={tamanhoDonut} />
              <View style={[styles.legendCol, ehCompacto && styles.legendColCompacta, !ehCompacto && styles.legendColLargo]}>
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

      {/* Seletor de data de início/fim do período customizado */}
      <DatePickerModal
        visible={pickerAberto !== null}
        currentISO={pickerAberto === 'inicio' ? periodoInicio : periodoFim}
        title={pickerAberto === 'inicio' ? 'Início do período' : 'Fim do período'}
        onClose={() => setPickerAberto(null)}
        onSelectDate={(iso) => {
          if (pickerAberto === 'inicio') setPeriodoInicio(iso);
          else setPeriodoFim(iso);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: screenRhythm.padding,
    gap: screenRhythm.gap,
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
  filtrosRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  filtrosRowLargo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    width: '100%',
  },
  filtrosColunaCompacta: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  /* SegmentedTabs distribui os 3 botões com `flex:1` por dentro — precisa de
     uma largura resolvida vinda de fora pra fazer essa conta. Numa linha com
     `justifyContent:'space-between'` e sem largura própria, o container
     ficava "auto" (0 de base) e os 3 rótulos colapsavam uns sobre os
     outros. 240px é o suficiente pros três rótulos com folga, sem esticar
     feito o controle sozinho no celular. */
  tabsAutoWidth: {
    width: 240,
  },
  /* "Ano a Ano / Mês a Mês / Período" tem rótulos mais longos que
     "Despesas/Renda/Geral" — precisa de mais espaço que `tabsAutoWidth`
     pra não repetir o mesmo colapso de largura que já aconteceu ali. */
  granularityAutoWidth: {
    width: 300,
  },
  periodoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  periodoField: {
    flex: 1,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: 2,
  },
  periodoFieldLabel: {
    color: theme.inkFaint,
    fontSize: type.legenda, fontFamily: fonts.light },
  periodoFieldValue: {
    color: theme.ink,
    fontSize: type.apoio, fontFamily: fonts.regular },
  summaryCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: cardTokens.radius,
    borderWidth: cardTokens.borderWidth,
    borderColor: theme.rule,
    padding: cardTokens.padding,
    gap: 4,
  },
  summaryLabel: {
    color: theme.inkFaint,
    fontSize: type.nota, fontFamily: fonts.light },
  summaryValue: {
    color: theme.ink,
    fontSize: type.cabecalho, fontFamily: fonts.regular },
  donutCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: cardTokens.radius,
    borderWidth: cardTokens.borderWidth,
    borderColor: theme.rule,
    padding: cardTokens.padding,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
    alignItems: 'center',
  },
  donutTitle: {
    alignSelf: 'flex-start',
    color: theme.ink,
    fontSize: type.corpo, fontFamily: fonts.regular },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    width: '100%',
  },
  /* O par donut+legenda forma um bloco só, centralizado dentro do card, em
     vez de esticado ponta a ponta — num card com mais de 1000px de largura
     (web média/ampla), "space-between" empurrava a legenda pro canto
     direito e deixava um vão vazio enorme no meio. Só entra a partir de
     `medio`: no celular (sempre `compacto`) a legenda já precisa de toda a
     largura disponível, e um teto aqui era o que cortava "Salário" em
     "Salár…". */
  /* 520 = donut (280 no amplo) + gap (20) + legenda (220). Estava em 460,
     um teto herdado de quando o donut media 220: no amplo ele cresceu pra 280
     e a conta passou a sobrar só 160 pra legenda, dos quais o valor em reais
     come ~80 — o nome da categoria ficava com uns 60px e virava "Morad…",
     "Alime…". O `maxWidth: 220` de `legendColLargo` nunca chegava a valer,
     porque o teto da LINHA apertava antes. No médio o donut volta a 220 e o
     conjunto fecha em 460 sozinho, centralizado, como antes. */
  donutRowLargo: {
    gap: spacing.xl,
    maxWidth: 520,
    alignSelf: 'center',
  },
  /* No celular donut e legenda empilham. Lado a lado, o donut de 150 mais o
     respiro deixavam a legenda com ~164px numa tela de 390 — o mesmo nome
     cortado do desktop, e sem teto nenhum pra culpar. Empilhado, a legenda
     usa a largura inteira do card. */
  donutRowCompacta: {
    flexDirection: 'column',
    gap: spacing.lg,
  },
  legendCol: {
    flex: 1,
    gap: 8,
  },
  legendColLargo: {
    maxWidth: 220,
  },
  /* Empilhada, a legenda precisa vencer o `alignItems:'center'` do
     `donutRow`, que senão a encolheria até a largura do conteúdo e deixaria
     as linhas desalinhadas entre si. */
  legendColCompacta: {
    alignSelf: 'stretch',
    flex: 0,
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
    fontSize: type.nota, fontFamily: fonts.regular },
  legendVal: {
    color: theme.inkFaint,
    fontSize: type.nota, fontFamily: fonts.light },
});
