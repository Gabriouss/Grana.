import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, card as cardTokens, fonts, type, lh } from '@/lib/theme';
import { formatMoney, todayISO } from '@/lib/format';
import { resumoDeFaturas } from '@/lib/creditoFaturas';
import { BANKS, type CreditCard, type CreditCardInvoicePayment, type Transaction } from '@/lib/types';
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
  pagamentos,
}: {
  cards: CreditCard[];
  transactions: Transaction[];
  /** Pagamentos de fatura, para o "A pagar agora". `null` enquanto não
      carregaram: aí a linha não aparece, porque sem eles uma fatura já paga
      pareceria devida. */
  pagamentos?: CreditCardInvoicePayment[] | null;
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
  /* Uma fatura por cartão: no mês corrente, a aberta de cada um, no próprio
     ciclo (ver `resumoDeFaturas`). Antes era UM ciclo para todos, que caía
     no mês civil quando os cartões fechavam em dias diferentes. */
  const resumo = resumoDeFaturas(transactions, cards, year, month, todayISO(), pagamentos ?? []);
  /* T25 (decisão 1 do autor, 23/09): a fatura que já fechou e não foi paga
     aparece em "A pagar agora", separada do "Em aberto". Antes, logo depois
     do fechamento, o cartão dizia R$ 0,00 com uma fatura inteira vencendo. */
  const mostrarAPagar = pagamentos != null && resumo.totalAPagarAgora > 0;
  /* Só avisa quando o número NÃO é do mês que a pessoa selecionou lá em cima:
     mostrar o valor de outra fatura sem dizer qual é foi metade do defeito.
     Texto mínimo; a apresentação é do Prism. */
  const outraFatura = mostrarAPagar
    ? 'Em aberto'
    : resumo.noMesCorrente && resumo.porCartao.some((p) => p.ciclo.year !== year || p.ciclo.month !== month)
      ? 'Faturas em aberto'
      : null;
  const totalMes = resumo.total;

  const porCartao = resumo.porCartao
    .map(({ cartao, valor, aPagarAgora }) => ({ card: cartao, valor, aPagar: mostrarAPagar ? aPagarAgora?.valor ?? 0 : 0 }))
    .sort((a, b) => b.aPagar + b.valor - (a.aPagar + a.valor))
    .slice(0, 3);

  return (
    <AppPressable style={({ hovered }) => [styles.card, hovered && styles.cardHover]} onPress={onPress}>
      <View style={styles.headRow}>
        <Text style={styles.label}>Faturas de crédito</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
      </View>
      {resumo.incerto && (
        <Text style={styles.cicloAviso}>Parcela incerta: não achei a compra original. O total pode estar incompleto.</Text>
      )}

      {cards.length === 0 ? (
        <Text style={styles.emptyText}>
          {(cartoesNaConta ?? 0) > 0
            ? 'Nenhum cartão nesta carteira.'
            : 'Nenhum cartão cadastrado ainda. Toque para adicionar.'}
        </Text>
      ) : (
        <>
          {mostrarAPagar && (
            <View>
              <Text style={styles.cicloAviso}>A pagar agora</Text>
              <PrivacyValue>
                <Text style={styles.total}>{`R$ ${formatMoney(resumo.totalAPagarAgora)}`}</Text>
              </PrivacyValue>
            </View>
          )}
          <View>
            {outraFatura && <Text style={styles.cicloAviso}>{outraFatura}</Text>}
            <PrivacyValue>
              <Text style={mostrarAPagar ? styles.totalSecundario : styles.total}>{`R$ ${formatMoney(totalMes)}`}</Text>
            </PrivacyValue>
          </View>
          <View style={{ gap: 6 }}>
            {porCartao.map(({ card, valor, aPagar }) => {
              const bankObj = BANKS.find((b) => b.id === card.bank);
              return (
                <View key={card.id} style={styles.cardBloco}>
                  <View style={styles.cardRow}>
                    <View style={styles.cardRowLeft}>
                      <View style={[styles.dot, { backgroundColor: bankObj?.color || card.color }]} />
                      <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
                    </View>
                    <PrivacyValue>
                      <Text style={styles.cardValue}>{`R$ ${formatMoney(valor)}`}</Text>
                    </PrivacyValue>
                  </View>
                  {aPagar > 0 && (
                    <View style={styles.cardRow}>
                      {/* Ponto invisível com o mesmo estilo: a linha fica sob o
                          nome do cartão pelo fluxo, sem recuo copiado à mão. */}
                      <View style={styles.cardRowLeft}>
                        <View style={styles.dot} />
                        <Text style={styles.cardSub}>A pagar agora</Text>
                      </View>
                      <PrivacyValue>
                        <Text style={styles.cardSubValor}>{`R$ ${formatMoney(aPagar)}`}</Text>
                      </PrivacyValue>
                    </View>
                  )}
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
  totalSecundario: { color: theme.ink, fontSize: type.nota, fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  emptyText: { color: theme.inkFaint, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.light },
  cardBloco: { gap: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  cardName: { color: theme.ink, fontSize: type.nota, flexShrink: 1, fontFamily: fonts.regular },
  cardValue: { color: theme.inkFaint, fontSize: type.nota, fontVariant: ['tabular-nums'], fontFamily: fonts.light },
  cardSub: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  cardSubValor: { color: theme.down, fontSize: type.micro, fontVariant: ['tabular-nums'], fontFamily: fonts.light },
});
