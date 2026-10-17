import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View, StyleSheet } from 'react-native';
import AppModal from './AppModal';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, hitSlopPara, touchTarget } from '@/lib/theme';
import { formatMoney, parseAmount, formatMoneyInput } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import type { Goal } from '@/lib/types';
import AppPressable from './AppPressable';
import Sheet from './Sheet';
import { valorResgatavel, type OrigemCofrinho } from '@/lib/cofrinho-origem';

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
  onSubmit: (delta: number, origem: OrigemCofrinho) => void;
}) {
  const [modo, setModo] = useState<Modo>('guardar');
  const [valor, setValor] = useState('');
  const [semValor, setSemValor] = useState(false);
  const [origem, setOrigem] = useState<OrigemCofrinho>('mes');

  useEffect(() => {
    if (visible) {
      setModo('guardar');
      setValor('');
      setSemValor(false);
      setOrigem('mes');
    }
  }, [visible, goal?.id]);

  if (!goal) return null;

  const atual = Number(goal.current_amount);
  const alvo = Number(goal.target_amount);
  const parsed = parseAmount(valor);
  const disponivel = valorResgatavel(goal, origem);
  const excedeResgate = modo === 'resgatar' && parsed > disponivel;

  function handleSubmit() {
    if (excedeResgate) return;
    if (!parsed || parsed <= 0) {
      setSemValor(true);
      return;
    }
    onSubmit(modo === 'guardar' ? parsed : -parsed, origem);
  }

  return (
    <AppModal visible={visible} transparent onRequestClose={onClose}>
      <Sheet onClose={onClose} keyboardShouldPersistTaps="always">
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2} accessibilityRole="header">{goal.title}</Text>
          <AppPressable onPress={onClose} hitSlop={hitSlopPara(22)} accessibilityRole="button" accessibilityLabel="Fechar">
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

        <Text style={styles.subtitle}>{modo === 'guardar' ? 'De onde vem esse dinheiro?' : 'Qual dinheiro quer resgatar?'}</Text>
        {(['mes', 'anterior'] as const).map((opcao) => (
          <AppPressable key={opcao} onPress={() => setOrigem(opcao)}
            accessibilityRole="radio" accessibilityState={{ checked: origem === opcao }}
            style={[styles.typeBtn, styles.originChoice, origem === opcao && styles.typeBtnGuardar]}>
            <Text style={styles.typeText}>{opcao === 'mes' ? 'Do dinheiro deste mês' : 'Já estava guardado'}</Text>
          </AppPressable>
        ))}
        <Text style={styles.subtitle}>
          {origem === 'anterior' ? 'Fica fora das entradas, saídas e do Livre deste mês.'
            : modo === 'guardar' ? 'Reduz o Livre deste mês, sem criar uma saída em Débito e Pix.' : 'Devolve ao Livre o que foi guardado neste mês.'}
          {modo === 'resgatar' ? ` Disponível: R$ ${formatMoney(disponivel)}.` : ''}
        </Text>

        <View style={styles.amountRow}>
          <Text style={styles.amountPrefix}>R$</Text>
          <TextInput
            accessibilityLabel={modo === 'guardar' ? 'Valor para guardar na meta em reais' : 'Valor para resgatar da meta em reais'}
            maxLength={LIMITS.amount}
            style={styles.amountInput}
            placeholder="0,00"
            placeholderTextColor={theme.inkFaint}
            keyboardType="number-pad"
            value={valor}
            onChangeText={(t) => { setValor(formatMoneyInput(t)); if (semValor) setSemValor(false); }}
            autoFocus
          />
        </View>
        {excedeResgate && <Text style={styles.errorText}>Valor maior que o disponível nessa origem.</Text>}
        {semValor && !excedeResgate && (
          <Text style={styles.errorText} role="alert" accessibilityLiveRegion="assertive">Informe um valor maior que zero.</Text>
        )}

        <AppPressable
          style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
          onPress={handleSubmit}
          disabled={saving || excedeResgate}
        >
          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color={theme.paper} />
              <Text style={styles.saveBtnText}>Atualizando cofrinho…</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>{modo === 'guardar' ? 'Guardar no cofrinho' : 'Resgatar do cofrinho'}</Text>
          )}
        </AppPressable>
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.ink, fontSize: type.titulo, flex: 1, marginRight: spacing.sm, fontFamily: fonts.regular },
  subtitle: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light, fontVariant: ['tabular-nums'] },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: theme.paper },
  originChoice: { minHeight: touchTarget, justifyContent: 'center', flex: 0 },
  typeBtnGuardar: { backgroundColor: theme.entradaFundo, borderWidth: 1, borderColor: theme.entradaBorda },
  typeBtnResgatar: { backgroundColor: theme.saidaFundo, borderWidth: 1, borderColor: theme.saidaBorda },
  typeText: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  typeTextOn: { color: theme.ink},
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  /* minWidth 0: o <input> da web tem largura minima propria (size=20) e, sem isto, o
     flex: 1 nao deixa a linha encolher; ela passava do painel e o foco do autoFocus
     rolava o conteudo para a esquerda, cortando titulo e textos. */
  amountInput: { color: theme.ink, fontSize: type.valor, flex: 1, minWidth: 0, fontFamily: fonts.regular },
  errorText: { color: theme.danger, fontSize: type.nota, fontFamily: fonts.regular },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
