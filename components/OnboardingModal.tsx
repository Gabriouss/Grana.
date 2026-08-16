import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing } from '@/lib/theme';
import { BUDGET_TEMPLATES } from '@/lib/heuristics';
import { CATEGORIES } from '@/lib/types';
import { formatMoney, parseAmount } from '@/lib/format';
import { upsertBudgetsBatch } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import AppPressable from './AppPressable';
import { useKeyboardHeight } from './Sheet';

export const ONB_GOALS = [
  { key: 'debt', label: 'Sair das dívidas', desc: 'Organizar o que sai todo mês e parar de usar o rotativo.' },
  { key: 'travel', label: 'Guardar para uma viagem ou compra', desc: 'Separar um valor fixo todo mês para uma meta específica.' },
  { key: 'card', label: 'Controlar cartão e assinaturas', desc: 'Parar de levar susto na fatura e cortar o que não usa mais.' },
  { key: 'invest', label: 'Investir e crescer o patrimônio', desc: 'Gastar com consciência para sobrar mais no fim do mês.' },
];

export const ONB_LEAKS = [
  { key: 'food', label: 'Comida fora de casa', desc: 'Delivery, restaurante, cafezinho do dia a dia.' },
  { key: 'subs', label: 'Assinaturas e streaming', desc: 'Serviços que se acumulam e ninguém revisa.' },
  { key: 'transport', label: 'Transporte por app', desc: 'Uber, 99, corridas do dia a dia.' },
  { key: 'impulse', label: 'Compras por impulso', desc: 'Aquelas comprinhas que não estavam no plano.' },
  { key: 'unsure', label: 'Não sei ao certo', desc: 'Tudo bem — vamos descobrir juntos com o tempo.' },
];

export default function OnboardingModal({
  visible,
  onClose,
  onFinished,
}: {
  visible: boolean;
  onClose: () => void;
  onFinished: (profile: { goal: string; income: number; leak: string }) => void;
}) {
  const { isDemoMode } = useDemo();
  const keyboardHeight = useKeyboardHeight();
  const [step, setStep] = useState<number>(1);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [income, setIncome] = useState('');
  const [selectedLeak, setSelectedLeak] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  function resetState() {
    setStep(1);
    setSelectedGoal(null);
    setIncome('');
    setSelectedLeak(null);
    setApplying(false);
  }

  async function handleFinish(goalKey = selectedGoal || 'card', incomeVal = parseAmount(income), leakKey = selectedLeak || 'unsure') {
    setApplying(true);
    try {
      if (incomeVal > 0 && !isDemoMode) {
        const tpl = BUDGET_TEMPLATES.find((t) => t.key === goalKey) || BUDGET_TEMPLATES[0];
        const items = Object.entries(tpl.pct).map(([catName, pct]) => {
          const catObj = CATEGORIES.find((c) => c.name === catName) ?? CATEGORIES[0];
          return {
            category: catObj.name,
            amount: Math.round(incomeVal * pct),
            color: catObj.color,
          };
        });
        await upsertBudgetsBatch(items);
      }
      setStep(4);
      onFinished({ goal: goalKey, income: incomeVal, leak: leakKey });
    } catch (e: any) {
      Alert.alert('Erro ao configurar', e.message);
    } finally {
      setApplying(false);
    }
  }

  function handleNext() {
    if (step === 1) {
      if (!selectedGoal) {
        Alert.alert('Escolha uma opção', 'Selecione sua meta principal para avançar.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      if (!selectedLeak) {
        Alert.alert('Escolha uma opção', 'Selecione onde o dinheiro mais vaza ou escolha "Não sei ao certo".');
        return;
      }
      handleFinish();
    } else {
      resetState();
      onClose();
    }
  }

  function handleSkip() {
    handleFinish('card', parseAmount(income) || 0, 'unsure');
  }

  const goalObj = ONB_GOALS.find((g) => g.key === selectedGoal);
  const parsedIncome = parseAmount(income);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      {/* Tela cheia: o campo de renda no passo 3 ficaria atrás do teclado,
          já que no modo edge-to-edge a janela não encolhe sozinha. */}
      <View style={[styles.container, { paddingBottom: spacing.xl + keyboardHeight }]}>
        {/* Progress Bar */}
        <View style={styles.progressBar}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.progressSegment, i <= step && styles.progressSegmentDone]} />
          ))}
        </View>

        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.eyebrow}>1 de 3 · bem-vindo ao Grana.</Text>
            <Text style={styles.question}>Qual sua meta principal agora?</Text>
            <View style={styles.optionsList}>
              {ONB_GOALS.map((g) => {
                const sel = selectedGoal === g.key;
                return (
                  <AppPressable
                    key={g.key}
                    onPress={() => setSelectedGoal(g.key)}
                    style={({ hovered }) => [
                      styles.optionCard,
                      sel && styles.optionCardSelected,
                      hovered && styles.optionCardHover,
                    ]}
                  >
                    <Text style={styles.optionLabel}>{g.label}</Text>
                    <Text style={styles.optionDesc}>{g.desc}</Text>
                  </AppPressable>
                );
              })}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.eyebrow}>2 de 3</Text>
            <Text style={styles.question}>Qual sua renda mensal aproximada?</Text>
            <View style={styles.incomeRow}>
              <Text style={styles.incomePrefix}>R$</Text>
              <TextInput
                style={styles.incomeInput}
                placeholder="0,00"
                placeholderTextColor={theme.inkFaint}
                keyboardType="decimal-pad"
                value={income}
                onChangeText={setIncome}
                autoFocus
              />
            </View>
            <Text style={styles.hint}>
              Usamos isso apenas para sugerir limites de orçamento equilibrados por categoria — você pode ajustar tudo depois.
            </Text>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.eyebrow}>3 de 3</Text>
            <Text style={styles.question}>Onde você sente que o dinheiro mais "vaza" hoje?</Text>
            <View style={styles.optionsList}>
              {ONB_LEAKS.map((l) => {
                const sel = selectedLeak === l.key;
                return (
                  <AppPressable
                    key={l.key}
                    onPress={() => setSelectedLeak(l.key)}
                    style={({ hovered }) => [
                      styles.optionCard,
                      sel && styles.optionCardSelected,
                      hovered && styles.optionCardHover,
                    ]}
                  >
                    <Text style={styles.optionLabel}>{l.label}</Text>
                    <Text style={styles.optionDesc}>{l.desc}</Text>
                  </AppPressable>
                );
              })}
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepContent}>
            <Text style={styles.eyebrow}>tudo pronto</Text>
            <Text style={styles.question}>Seu painel já reflete sua meta.</Text>
            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Meta</Text>
                <Text style={styles.summaryVal}>{goalObj?.label ?? 'Controle de gastos'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Renda considerada</Text>
                <Text style={styles.summaryVal}>{parsedIncome > 0 ? `R$ ${formatMoney(parsedIncome)}` : 'Não informada'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Orçamento sugerido</Text>
                <Text style={styles.summaryVal}>
                  {isDemoMode
                    ? 'Não aplicado (modo de exemplo)'
                    : parsedIncome > 0
                    ? 'Aplicado automaticamente'
                    : 'Defina depois no Perfil'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <AppPressable
            style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
            onPress={handleNext}
            disabled={applying}
          >
            {applying ? (
              <ActivityIndicator color={theme.paper} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {step === 3 ? 'Ver meu painel' : step === 4 ? 'Começar a usar' : 'Continuar'}
              </Text>
            )}
          </AppPressable>
          {step <= 3 && (
            <AppPressable onPress={handleSkip}>
              <Text style={styles.skipBtnText}>Pular por agora</Text>
            </AppPressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper, padding: spacing.xl, justifyContent: 'space-between' },
  progressBar: { flexDirection: 'row', gap: 6, marginBottom: spacing.lg, marginTop: spacing.md },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.rule },
  progressSegmentDone: { backgroundColor: theme.ink },
  stepContent: { flex: 1, gap: 12 },
  eyebrow: { color: theme.inkFaint, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  question: { color: theme.ink, fontSize: 24, fontWeight: '400', lineHeight: 30, marginBottom: spacing.md },
  optionsList: { gap: 10 },
  optionCard: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: theme.paperRaised,
    borderWidth: 1.5,
    borderColor: theme.rule,
    gap: 3,
  },
  optionCardSelected: { borderColor: theme.ink, backgroundColor: theme.paperRaised },
  optionCardHover: { borderColor: theme.ruleStrong },
  optionLabel: { color: theme.ink, fontSize: 14, fontWeight: '500' },
  optionDesc: { color: theme.inkFaint, fontSize: 12, lineHeight: 16 },
  incomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  incomePrefix: { color: theme.inkFaint, fontSize: 24 },
  incomeInput: { color: theme.ink, fontSize: 32, flex: 1 },
  hint: { color: theme.inkFaint, fontSize: 12, lineHeight: 18, marginTop: 8 },
  summaryBox: { backgroundColor: theme.paperRaised, borderRadius: radius.md, borderWidth: 1, borderColor: theme.rule, padding: spacing.md, gap: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.rule },
  summaryKey: { color: theme.inkFaint, fontSize: 12.5 },
  summaryVal: { color: theme.ink, fontSize: 12.5, fontWeight: '500' },
  footer: { gap: 10, paddingTop: spacing.md },
  primaryBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  primaryBtnHover: { opacity: 0.88 },
  primaryBtnText: { color: theme.paper, fontSize: 14, fontWeight: '600' },
  skipBtnText: { color: theme.inkFaint, fontSize: 12.5, textAlign: 'center', paddingVertical: 6 },
});
