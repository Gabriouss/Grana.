import { StyleSheet, Text, View } from 'react-native';
import { theme, radius, spacing, card as cardTokens, fonts, type, lh } from '@/lib/theme';
import { formatBRLSaldo, formatBRLSubtraido, formatMoney } from '@/lib/format';
import { rotuloDiasRestantes } from '@/lib/safe-to-spend';
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
  indisponivel = false,
  carregando = false,
}: {
  data: SafeToSpend;
  sugestaoArquetipo?: Arquetipo | null;
  indisponivel?: boolean;
  carregando?: boolean;
}) {
  const { livrePorDia, livreTotal, saldoAtual, reservadoEmMetas, creditoNaoPago, diasRestantes } = data;
  const semSaldo = saldoAtual <= 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Livre para gastar</Text>

      <View style={styles.corpo}>
      {(carregando || indisponivel) && (
        <View style={styles.estado}>
          <Text style={styles.zeroText} accessibilityRole={carregando ? undefined : 'alert'}>
            {carregando ? 'Conferindo cofrinhos e pagamentos…' : 'Livre indisponível. Atualize a Início para conferir cofrinhos e pagamentos.'}
          </Text>
        </View>
      )}
      {/* Mantém o espaço dos dados, sem expor valores de fontes ainda não conferidas. */}
      <View style={{ gap: spacing.sm, opacity: carregando || indisponivel ? 0 : 1 }}
        aria-hidden={carregando || indisponivel}
        accessibilityElementsHidden={carregando || indisponivel}
        importantForAccessibility={carregando || indisponivel ? 'no-hide-descendants' : 'auto'}>

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
          <PrivacyValue><Text style={styles.rowVal}>{formatBRLSaldo(saldoAtual)}</Text></PrivacyValue>
        </View>
        {/* Sem "Contas a vencer este mês" (autor, 25/09/2026, regra 20): boleto
            pendente ou atrasado não desconta do Livre. Ele pesa quando é pago,
            porque o pagamento vira saída de caixa no Pix/débito. */}
        <View style={styles.row}>
          <Text style={styles.rowKey}>Guardado do mês em cofrinhos</Text>
          <PrivacyValue><Text style={styles.rowVal}>{formatBRLSubtraido(reservadoEmMetas)}</Text></PrivacyValue>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowKey}>Crédito ainda não pago</Text>
          <PrivacyValue><Text style={styles.rowVal}>{formatBRLSubtraido(creditoNaoPago)}</Text></PrivacyValue>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowKey}>{`Livre no total · ${rotuloDiasRestantes(diasRestantes)}`}</Text>
          <PrivacyValue><Text style={[styles.rowVal, styles.rowValStrong]}>{`R$ ${formatMoney(livreTotal)}`}</Text></PrivacyValue>
        </View>
      </View>
      </View>
      </View>

      {sugestaoArquetipo && (
        <Text style={styles.hint}>
          {/* Ponto final em vez de travessão: a regra de copy do projeto o
              proíbe, e esta frase aparece no card mais visível da Início. */}
          💡 Seu comportamento recente lembra o perfil {sugestaoArquetipo.emoji} {sugestaoArquetipo.nome}. Vale refazer o diagnóstico no Perfil.
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
  corpo: { minHeight: 160 },
  estado: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center' },
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
