import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View, StyleSheet } from 'react-native';
import AppModal from './AppModal';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { formatMoney, parseAmount, formatMoneyInput } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import type { Goal } from '@/lib/types';
import AppPressable from './AppPressable';
import Sheet from './Sheet';

type Modo = 'guardar' | 'resgatar';

/**
 * Modal rápido para guardar ou resgatar dinheiro de um cofrinho já existente.
 * Não persiste nada sozinho — quem chama decide como aplicar `onSubmit`
 * (conta real via lib/goals.ts, ou estado local no modo de exemplo).
 */
export default function GoalDepositModal({
  visible,
  goal,
  saving,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  goal: Goal | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (delta: number) => void;
}) {
  const [modo, setModo] = useState<Modo>('guardar');
  const [valor, setValor] = useState('');

  useEffect(() => {
    if (visible) {
      setModo('guardar');
      setValor('');
    }
  }, [visible, goal?.id]);

  if (!goal) return null;

  const atual = Number(goal.current_amount);
  const alvo = Number(goal.target_amount);
  const parsed = parseAmount(valor);
  const excedeResgate = modo === 'resgatar' && parsed > atual;

  function handleSubmit() {
    if (!parsed || parsed <= 0 || excedeResgate) return;
    onSubmit(modo === 'guardar' ? parsed : -parsed);
  }

  return (
    <AppModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Sheet onClose={onClose}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{goal.title}</Text>
          <AppPressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        <Text style={styles.subtitle}>
          R$ {formatMoney(atual)} de R$ {formatMoney(alvo)} guardados
        </Text>

        <View style={styles.typeRow}>
          <AppPressable
            onPress={() => setModo('guardar')}
            style={[styles.typeBtn, modo === 'guardar' && styles.typeBtnGuardar]}
          >
            <Text style={[styles.typeText, modo === 'guardar' && styles.typeTextOn]}>Guardar</Text>
          </AppPressable>
          <AppPressable
            onPress={() => setModo('resgatar')}
            style={[styles.typeBtn, modo === 'resgatar' && styles.typeBtnResgatar]}
            disabled={atual <= 0}
          >
            <Text style={[styles.typeText, modo === 'resgatar' && styles.typeTextOn]}>Resgatar</Text>
          </AppPressable>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amountPrefix}>R$</Text>
          <TextInput
            maxLength={LIMITS.amount}
            style={styles.amountInput}
            placeholder="0,00"
            placeholderTextColor={theme.inkFaint}
            keyboardType="number-pad"
            value={valor}
            onChangeText={(t) => setValor(formatMoneyInput(t))}
            autoFocus
          />
        </View>
        {excedeResgate && <Text style={styles.errorText}>Valor maior que o guardado no cofrinho.</Text>}

        <AppPressable
          style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
          onPress={handleSubmit}
          disabled={saving || !parsed || parsed <= 0 || excedeResgate}
        >
          {saving ? (
            <ActivityIndicator color={theme.paper} />
          ) : (
            <Text style={styles.saveBtnText}>{modo === 'guardar' ? 'Guardar no cofrinho' : 'Resgatar para o saldo'}</Text>
          )}
        </AppPressable>
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.ink, fontSize: type.titulo, flex: 1, marginRight: spacing.sm, fontFamily: fonts.regular },
  subtitle: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: theme.paper },
  typeBtnGuardar: { backgroundColor: theme.entradaFundo, borderWidth: 1, borderColor: theme.entradaBorda },
  typeBtnResgatar: { backgroundColor: theme.saidaFundo, borderWidth: 1, borderColor: theme.saidaBorda },
  typeText: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  typeTextOn: { color: theme.ink},
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.valor, flex: 1, fontFamily: fonts.regular },
  errorText: { color: theme.danger, fontSize: type.nota, fontFamily: fonts.regular },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
});
