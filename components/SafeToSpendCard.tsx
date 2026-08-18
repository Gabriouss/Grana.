import { StyleSheet, Text, View } from 'react-native';
import { theme, radius, spacing } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import type { SafeToSpend } from '@/lib/projections';
import type { Arquetipo } from '@/lib/diagnostico';
import PrivacyValue from './PrivacyValue';

/**
 * Card minimalista de "Livre para gastar" — Épico 2 do PLANO_DE_EVOLUCAO.md.
 * `sugestaoArquetipo`, quando presente, é um convite silencioso a refazer o
 * diagnóstico (ver lib/projections.ts / sugerirEvolucaoArquetipo); nunca troca
 * o arquétipo sozinho.
 */
export default function SafeToSpendCard({
  data,
  sugestaoArquetipo,
}: {
  data: SafeToSpend;
  sugestaoArquetipo?: Arquetipo | null;
}) {
  const { livrePorDia, livreTotal, saldoAtual, contasFixasPendentes, reservadoEmMetas, diasRestantes } = data;
  const semSaldo = saldoAtual <= 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Livre para gastar</Text>

      {semSaldo ? (
        <Text style={styles.zeroText}>Sem saldo disponível este mês ainda.</Text>
      ) : (
        <PrivacyValue>
          <Text style={styles.headline}>
            {`R$ ${formatMoney(livrePorDia)}`}
            <Text style={styles.headlineSuffix}>{`/dia até o fim do mês`}</Text>
          </Text>
        </PrivacyValue>
      )}

      <View style={styles.breakdown}>
        <View style={styles.row}>
          <Text style={styles.rowKey}>Saldo atual</Text>
          <PrivacyValue><Text style={styles.rowVal}>{`R$ ${formatMoney(saldoAtual)}`}</Text></PrivacyValue>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowKey}>Contas a vencer este mês</Text>
          <PrivacyValue><Text style={styles.rowVal}>{`− R$ ${formatMoney(contasFixasPendentes)}`}</Text></PrivacyValue>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowKey}>Reservado em cofrinhos</Text>
          <PrivacyValue><Text style={styles.rowVal}>{`− R$ ${formatMoney(reservadoEmMetas)}`}</Text></PrivacyValue>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowKey}>Livre no total · {diasRestantes} {diasRestantes === 1 ? 'dia' : 'dias'} restantes</Text>
          <PrivacyValue><Text style={[styles.rowVal, styles.rowValStrong]}>{`R$ ${formatMoney(livreTotal)}`}</Text></PrivacyValue>
        </View>
      </View>

      {sugestaoArquetipo && (
        <Text style={styles.hint}>
          💡 Seu comportamento recente lembra o perfil {sugestaoArquetipo.emoji} {sugestaoArquetipo.nome} — vale refazer o diagnóstico no Perfil.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: { color: theme.inkFaint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  headline: { color: theme.ink, fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  headlineSuffix: { color: theme.inkFaint, fontSize: 12, fontWeight: '400' },
  zeroText: { color: theme.inkFaint, fontSize: 13, lineHeight: 18 },
  breakdown: { gap: 4, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowKey: { color: theme.inkFaint, fontSize: 11.5, flex: 1, marginRight: spacing.sm },
  rowVal: { color: theme.inkFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
  rowValStrong: { color: theme.ink, fontWeight: '600' },
  hint: { color: theme.accent2, fontSize: 11, lineHeight: 15, marginTop: 4 },
});
