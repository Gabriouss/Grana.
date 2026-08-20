import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { formatMoney } from '@/lib/format';
import type { MesProjetado } from '@/lib/projections';
import PrivacyValue from './PrivacyValue';

const TRACK_HEIGHT = 84;

/**
 * Linha do tempo de comprometimento futuro (contas recorrentes + parcelas
 * já lançadas) para os próximos meses — Épico 2 do PLANO_DE_EVOLUCAO.md.
 * Barra empilhada: base = contas recorrentes, topo = parcelas futuras.
 */
export default function FutureTimelineChart({ meses }: { meses: MesProjetado[] }) {
  const maxVal = Math.max(...meses.map((m) => m.total), 1);

  const progress = useRef(new Animated.Value(0)).current;
  const [t, setT] = useState(0);

  useEffect(() => {
    const id = progress.addListener(({ value }) => setT(value));
    return () => progress.removeListener(id);
  }, []);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [meses.length, maxVal]);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        {meses.map((m, i) => {
          const alturaTotal = m.total > 0 ? Math.max(3, (m.total / maxVal) * TRACK_HEIGHT) * t : 0;
          const alturaParcelas = m.total > 0 ? (m.parcelasFuturas / m.total) * alturaTotal : 0;
          const alturaRecorrentes = alturaTotal - alturaParcelas;
          return (
            <View key={`${m.ano}-${m.mes}`} style={styles.col}>
              <View style={styles.track}>
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
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.accent }]} />
          <Text style={styles.legendText}>Contas recorrentes</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.down }]} />
          <Text style={styles.legendText}>Parcelas futuras</Text>
        </View>
      </View>

      <PrivacyValue>
        <Text style={styles.totalText}>
          {`Total comprometido nos próximos ${meses.length} meses: R$ ${formatMoney(meses.reduce((s, m) => s + m.total, 0))}`}
        </Text>
      </PrivacyValue>
    </View>
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
  totalText: { color: theme.inkFaint, fontSize: type.legenda, textAlign: 'center', fontFamily: fonts.light },
});
