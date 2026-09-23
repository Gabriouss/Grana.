import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import type { MesProjetado } from '@/lib/projections';
import PrivacyValue from './PrivacyValue';
import { UI_OUT, useReducedMotion } from '@/lib/motion';

const CURVA_ENTRADA = Easing.bezier(...UI_OUT);

const TRACK_HEIGHT = 84;

/**
 * Linha do tempo de comprometimento futuro (contas recorrentes + parcelas
 * já lançadas) para os próximos meses — Épico 2 do PLANO_DE_EVOLUCAO.md.
 * Barra empilhada: base = contas recorrentes, topo = parcelas futuras.
 */
function FutureTimelineChart({ meses }: { meses: MesProjetado[] }) {
  const maxVal = Math.max(...meses.map((m) => m.total), 1);
  const temParcelas = meses.some((m) => m.parcelasFuturas > 0);
  const temRecorrentes = meses.some((m) => m.total - m.parcelasFuturas > 0);

  const progress = useRef(new Animated.Value(0)).current;
  const reduzirMovimento = useReducedMotion();

  /* Mesma correção do FlowChart: as barras cresciam por 700ms com um
     `setState` por frame. Agora nascem na altura final e o conjunto entra por
     opacidade, no driver nativo. Altura é dado — vê-la crescer não informa
     nada e atrasa a leitura. */
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: reduzirMovimento ? 0 : 240,
      easing: CURVA_ENTRADA,
      useNativeDriver: true,
    }).start();
  }, [maxVal, meses.length, progress, reduzirMovimento]);

  /* Nada comprometido: uma frase no lugar de seis colunas vazias com legenda.
     As barras em branco pareciam gráfico que não carregou, e a única pista de
     que não havia nada era o "R$ 0,00" miúdo no rodapé (achado G6). */
  if (meses.every((m) => m.total <= 0)) {
    return (
      <Text style={styles.vazio}>
        {`Nenhuma conta recorrente nem parcela a vencer nos próximos ${meses.length} meses.`}
      </Text>
    );
  }

  return (
    <Animated.View style={{ gap: spacing.sm, opacity: progress }}>
      <View style={styles.row}>
        {meses.map((m, i) => {
          const alturaTotal = m.total > 0 ? Math.max(3, (m.total / maxVal) * TRACK_HEIGHT) : 0;
          const alturaParcelas = m.total > 0 ? (m.parcelasFuturas / m.total) * alturaTotal : 0;
          const alturaRecorrentes = alturaTotal - alturaParcelas;
          return (
            <View
              key={`${m.ano}-${m.mes}`}
              style={styles.col}
              /* O valor de cada mês, e a divisão entre recorrentes e parcelas,
                 existiam SÓ como altura de barra: os irmãos `FlowChart` e
                 `LineAreaChart` já traziam alternativa textual, este não, e
                 quem usa leitor de tela não conseguia recuperar o dado
                 principal do gráfico. A coluna vira um item legível com o mês
                 e as duas parcelas do valor. */
              accessibilityRole="text"
              accessibilityLabel={
                m.total > 0
                  ? `${m.label}: R$ ${formatMoney(m.total)} no total, sendo R$ ${formatMoney(m.total - m.parcelasFuturas)} em contas recorrentes e R$ ${formatMoney(m.parcelasFuturas)} em parcelas futuras.`
                  : `${m.label}: nada comprometido.`
              }
            >
              <View style={styles.track} aria-hidden>
                <View style={styles.bar}>
                  {alturaParcelas > 0 && <View style={[styles.segment, { height: alturaParcelas, backgroundColor: theme.down }]} />}
                  {alturaRecorrentes > 0 && <View style={[styles.segment, { height: alturaRecorrentes, backgroundColor: theme.accent }]} />}
                </View>
              </View>
              <Text style={styles.monthLabel}>{m.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        {temRecorrentes && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.accent }]} />
            <Text style={styles.legendText}>Contas recorrentes</Text>
          </View>
        )}
        {temParcelas && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.down }]} />
            <Text style={styles.legendText}>Parcelas futuras</Text>
          </View>
        )}
      </View>

      <PrivacyValue>
        {/* Espaço inseparável entre "R$" e o valor: a frase quebra em duas
            linhas em tela estreita, e a quebra caía justamente ali, deixando
            "R$" sozinho no fim de uma linha e o número na outra (achado W4). */}
        <Text style={styles.totalText}>
          {`Total comprometido nos próximos ${meses.length} meses: R$ ${formatMoney(meses.reduce((s, m) => s + m.total, 0))}`}
        </Text>
      </PrivacyValue>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: TRACK_HEIGHT + 20 },
  col: { alignItems: 'center', flex: 1, gap: 6 },
  track: { height: TRACK_HEIGHT, justifyContent: 'flex-end', width: 22 },
  bar: { width: '100%', borderRadius: radius.sm, overflow: 'hidden' },
  segment: { width: '100%' },
  monthLabel: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  legendRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  totalText: { color: theme.inkFaint, fontSize: type.legenda, textAlign: 'center', fontFamily: fonts.light, fontVariant: ['tabular-nums'] },
  /* Entrelinha explícita: sem ela a Neue Machina usa a dela, curta, e as duas
     linhas da frase quase se tocavam (visto no emulador). */
  vazio: { color: theme.inkFaint, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.light, paddingVertical: spacing.sm },
});

/* `memo` pelo mesmo motivo do PieChart: a Início re-renderiza por estado que
   não tem relação com a projeção, e `meses` já chega memoizado de lá. */
export default memo(FutureTimelineChart);
