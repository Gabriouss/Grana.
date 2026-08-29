import { StyleSheet, Text, View } from 'react-native';
import { theme, radius, spacing, card as cardTokens, fonts, type, lh } from '@/lib/theme';
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
    borderRadius: cardTokens.radius,
    borderWidth: cardTokens.borderWidth,
    borderColor: theme.rule,
    padding: cardTokens.padding,
    gap: spacing.sm,
  },
  label: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 0.5, fontFamily: fonts.light },
  headline: { color: theme.ink, fontSize: type.cabecalho, fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  headlineSuffix: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  zeroText: { color: theme.inkFaint, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.light },
  breakdown: { gap: 4, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowKey: { color: theme.inkFaint, fontSize: type.nota, flex: 1, marginRight: spacing.sm, fontFamily: fonts.light },
  rowVal: { color: theme.inkFaint, fontSize: type.nota, fontVariant: ['tabular-nums'], fontFamily: fonts.light },
  rowValStrong: { color: theme.ink},
  hint: { color: theme.accent2, fontSize: type.legenda, lineHeight: lh(type.legenda, 'corpo'), marginTop: 4, fontFamily: fonts.regular },
});
