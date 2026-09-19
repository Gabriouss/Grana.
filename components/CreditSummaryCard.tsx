import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, card as cardTokens, fonts, type, lh } from '@/lib/theme';
import { formatMoney, todayISO } from '@/lib/format';
import { cicloDoResumoDeFaturas, filtrarLancamentosDaFatura } from '@/lib/creditoFaturas';
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
  cartoesNaConta,
}: {
  cards: CreditCard[];
  transactions: Transaction[];
  year: number;
  month: number;
  onPress: () => void;
  /** Quantos cartões a conta tem, em todas as carteiras. `cards` chega já
      filtrado pela carteira ativa; sem este número, uma carteira sem cartão
      afirmava "Nenhum cartão cadastrado ainda" a quem tem cartão em outra. */
  cartoesNaConta?: number;
}) {
  /* Fatura não é mês civil: cada cartão pode fechar em um dia diferente, e a
     tela de Crédito abre na fatura ATUAL. Este resumo seguia o mês do
     calendário e por isso mostrava R$ 0,00 enquanto aquela tela mostrava
     R$ 300,00 do mesmo cartão (achado V8 da varredura de 17/09/2026). */
  const ciclo = cicloDoResumoDeFaturas(cards, year, month, todayISO());
  const creditTx = filtrarLancamentosDaFatura(transactions, cards, 'all', ciclo.year, ciclo.month);
  /* Só avisa quando o número NÃO é do mês que a pessoa selecionou lá em cima:
     mostrar o valor de outra fatura sem dizer qual é foi metade do defeito. */
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const outraFatura = ciclo.year !== year || ciclo.month !== month
    ? `Fatura de ${MESES[ciclo.month]}/${String(ciclo.year).slice(2)}`
    : null;
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
      {outraFatura && <Text style={styles.cicloAviso}>{outraFatura}</Text>}

      {cards.length === 0 ? (
        <Text style={styles.emptyText}>
          {(cartoesNaConta ?? 0) > 0
            ? 'Nenhum cartão nesta carteira.'
            : 'Nenhum cartão cadastrado ainda. Toque para adicionar.'}
        </Text>
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
  cicloAviso: { color: theme.inkFaint, fontSize: type.micro, lineHeight: lh(type.micro), fontFamily: fonts.light },
  card: {
    backgroundColor: theme.paperRaised,
    borderRadius: cardTokens.radius,
    borderWidth: cardTokens.borderWidth,
    borderColor: theme.rule,
    padding: cardTokens.padding,
    gap: spacing.sm,
  },
  cardHover: { borderColor: theme.ruleStrong },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 0.5, fontFamily: fonts.light },
  total: { color: theme.down, fontSize: type.destaque, fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  emptyText: { color: theme.inkFaint, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.light },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  cardName: { color: theme.ink, fontSize: type.nota, flexShrink: 1, fontFamily: fonts.regular },
  cardValue: { color: theme.inkFaint, fontSize: type.nota, fontVariant: ['tabular-nums'], fontFamily: fonts.light },
});
