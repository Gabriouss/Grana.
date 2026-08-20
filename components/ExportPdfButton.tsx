import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Alert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, type, fonts } from '@/lib/theme';
import { MONTH_NAMES } from '@/lib/format';
import { fetchBills } from '@/lib/data';
import { gerarRelatorioPdf } from '@/lib/pdf-report';
import { useDemo } from '@/lib/demo-context';
import type { Bill, Transaction } from '@/lib/types';
import AppPressable from './AppPressable';

/**
 * Exporta o relatório executivo do mês informado. Os boletos são buscados
 * aqui, no momento do clique, em vez de exigidos como prop: as duas telas que
 * usam este botão (Gráficos e Lançamentos) só carregam transações, e obrigá-las
 * a buscar contas o tempo todo custaria uma requisição por abertura de tela
 * para uma seção que nem sempre é gerada.
 */
export default function ExportPdfButton({
  ano,
  mes,
  transactions,
  carteira,
  bills,
}: {
  ano: number;
  mes: number; // 0-11
  transactions: Transaction[];
  carteira: string;
  /** Quando a tela já tem os boletos carregados, passe-os para evitar a busca extra. */
  bills?: Bill[];
}) {
  const { isDemoMode } = useDemo();
  const [gerando, setGerando] = useState(false);

  async function exportar() {
    setGerando(true);
    try {
      let contas = bills;
      if (!contas) {
        try {
          contas = isDemoMode ? [] : await fetchBills();
        } catch {
          contas = []; // relatório sem a seção de boletos é melhor que relatório nenhum
        }
      }

      const { compartilhado, uri } = await gerarRelatorioPdf({ ano, mes, transactions, bills: contas, carteira });
      if (!compartilhado) {
        Alert.alert('Relatório gerado', `O compartilhamento não está disponível neste aparelho. O arquivo ficou em:\n${uri}`);
      }
    } catch (e: any) {
      Alert.alert('Erro ao gerar relatório', e?.message ?? 'Tente novamente.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <AppPressable style={styles.botao} onPress={exportar} disabled={gerando}>
      {gerando ? (
        <ActivityIndicator size="small" color={theme.inkSoft} />
      ) : (
        <Ionicons name="document-outline" size={16} color={theme.inkSoft} />
      )}
      <Text style={styles.texto}>
        {gerando ? 'Gerando PDF…' : `Exportar relatório de ${MONTH_NAMES[mes]}`}
      </Text>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  texto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
});
