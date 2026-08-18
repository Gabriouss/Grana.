import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing } from '@/lib/theme';
import { formatMoney, isSameMonth } from '@/lib/format';
import { BANKS, type CreditCard, type Transaction } from '@/lib/types';
import AppPressable from './AppPressable';
import PrivacyValue from './PrivacyValue';

/**
 * Bloco "Resumo de Faturas de Crédito" da Home (item 2 do Plano Mestre) —
 * versão compacta da aba Crédito: total do mês + até 3 cartões, com atalho
 * para a aba completa.
 */
export default function CreditSummaryCard({
  cards,
  transactions,
  year,
  month,
  onPress,
}: {
  cards: CreditCard[];
  transactions: Transaction[];
  year: number;
  month: number;
  onPress: () => void;
}) {
  const creditTx = transactions.filter((t) => t.payment_method === 'credit' && isSameMonth(t.occurred_on, year, month));
  const totalMes = creditTx.reduce((s, t) => s + Number(t.amount), 0);

  const porCartao = cards
    .map((card) => ({
      card,
      valor: creditTx.filter((t) => t.card_id === card.id).reduce((s, t) => s + Number(t.amount), 0),
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 3);

  return (
    <AppPressable style={({ hovered }) => [styles.card, hovered && styles.cardHover]} onPress={onPress}>
      <View style={styles.headRow}>
        <Text style={styles.label}>Faturas de crédito</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
      </View>

      {cards.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum cartão cadastrado ainda. Toque para adicionar.</Text>
      ) : (
        <>
          <PrivacyValue>
            <Text style={styles.total}>{`R$ ${formatMoney(totalMes)}`}</Text>
          </PrivacyValue>
          <View style={{ gap: 6 }}>
            {porCartao.map(({ card, valor }) => {
              const bankObj = BANKS.find((b) => b.id === card.bank);
              return (
                <View key={card.id} style={styles.cardRow}>
                  <View style={styles.cardRowLeft}>
                    <View style={[styles.dot, { backgroundColor: bankObj?.color || card.color }]} />
                    <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
                  </View>
                  <PrivacyValue>
                    <Text style={styles.cardValue}>{`R$ ${formatMoney(valor)}`}</Text>
                  </PrivacyValue>
                </View>
              );
            })}
          </View>
        </>
      )}
    </AppPressable>
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
  cardHover: { borderColor: theme.ruleStrong },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: theme.inkFaint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  total: { color: theme.down, fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  emptyText: { color: theme.inkFaint, fontSize: 12.5, lineHeight: 18 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  cardName: { color: theme.ink, fontSize: 12, flexShrink: 1 },
  cardValue: { color: theme.inkFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
});
