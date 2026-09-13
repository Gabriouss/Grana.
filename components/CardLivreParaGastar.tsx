import { StyleSheet, Text, View } from 'react-native';
import { theme, radius, spacing, card as cardTokens, fonts, type, sombras } from '@/lib/theme';
import { EXEMPLO_LIVRE, emReais as moeda } from '@/lib/exemplo-landing';

/* Os números saem de `lib/exemplo-landing.ts`, que é a fonte única da página.
   Este card já derivava tudo de uma estrutura local (correção do achado V01),
   mas a estrutura era PRIVADA dele — então a conversa do Granabô e o mini-mock
   de widgets seguiram com cópias à mão, e uma delas com o valor reprovado. */
const EXEMPLO = EXEMPLO_LIVRE;
const livre = EXEMPLO.livreNoTotal;

/**
 * Cópia visual do card real de "Livre para gastar" (`SafeToSpendCard.tsx`),
 * para a landing page, com valores fictícios.
 *
 * Por que não reusar o componente real: ele renderiza `PrivacyValue`, que chama
 * `usePrivacy()` e **lança erro fora de um `<PrivacyProvider />`**
 * (`lib/privacy-context.tsx:28-32`). Envolver a landing num provider só para
 * exibir um mock traria estado e escrita em storage para uma página de
 * marketing. Aqui o mesmo desenho é reconstruído com os mesmos tokens.
 *
 * Se `SafeToSpendCard` mudar de estrutura, este mock precisa acompanhar — é o
 * custo consciente de duplicar. Os rótulos abaixo são exatamente os do card
 * real, inclusive a ordem das linhas do detalhamento.
 *
 * Valores inventados de propósito: nunca usar dado de conta real em material
 * de marketing, nem em modo demonstração.
 */
export default function CardLivreParaGastar({ compacto }: { compacto?: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Livre para gastar</Text>

      <Text style={styles.headline}>
        {moeda(EXEMPLO.porDia)}
        {compacto ? '\n' : ' '}
        <Text style={styles.headlineSuffix}>/dia até o fim do mês</Text>
      </Text>

      <View style={styles.breakdown}>
        <Linha chave="Saldo atual" valor={moeda(EXEMPLO.saldo)} />
        <Linha chave="Contas a vencer este mês" valor={`− ${moeda(EXEMPLO.contas)}`} />
        <Linha chave="Reservado em cofrinhos" valor={`− ${moeda(EXEMPLO.cofrinhos)}`} />
        <Linha chave={`Livre no total · ${EXEMPLO.diasRestantes} dias restantes`} valor={moeda(livre)} forte />
      </View>
    </View>
  );
}

function Linha({ chave, valor, forte }: { chave: string; valor: string; forte?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{chave}</Text>
      <Text style={[styles.rowVal, forte && styles.rowValStrong]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 420,
    ...({ boxSizing: 'border-box' } as any),
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    borderWidth: cardTokens.borderWidth,
    borderColor: theme.ruleStrong,
    padding: spacing.xl,
    gap: spacing.sm,
    ...({ boxShadow: sombras.cardPersuasao } as any),
  },
  label: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  headline: { color: theme.ink, fontSize: type.valor, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  headlineSuffix: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  breakdown: { gap: spacing.xs, marginTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  rowKey: { flex: 1, color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },
  rowVal: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  rowValStrong: { color: theme.ink },
});
