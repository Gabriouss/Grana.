import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing } from '@/lib/theme';
import { BUDGET_TEMPLATES, type BudgetTemplate } from '@/lib/heuristics';
import { CATEGORIES } from '@/lib/types';
import { parseAmount } from '@/lib/format';
import { upsertBudgetsBatch } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import { LIMITS } from '@/lib/limits';
import AppPressable from './AppPressable';
import { useKeyboardHeight } from './Sheet';

export default function BudgetTemplatesModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { isDemoMode } = useDemo();
  const keyboardHeight = useKeyboardHeight();
  const [income, setIncome] = useState('');
  const [selectedKey, setSelectedKey] = useState(BUDGET_TEMPLATES[0].key);
  const [saving, setSaving] = useState(false);

  function resetState() {
    setIncome('');
    setSelectedKey(BUDGET_TEMPLATES[0].key);
    setSaving(false);
  }

  async function handleApplyTemplate(tpl: BudgetTemplate) {
    const parsedIncome = parseAmount(income);
    if (!parsedIncome || parsedIncome <= 0) {
      Alert.alert('Renda mensal necessária', 'Informe sua renda mensal aproximada para calcular as metas.');
      return;
    }
    if (isDemoMode) {
      Alert.alert(
        'Modo de exemplo ativo',
        'Desative "Dados de exemplo" no Perfil para aplicar um orçamento na sua conta.'
      );
      return;
    }

    const items = Object.entries(tpl.pct).map(([catName, pct]) => {
      const catObj = CATEGORIES.find((c) => c.name === catName) ?? CATEGORIES[0];
      const amount = Math.round(parsedIncome * pct);
      return {
        category: catObj.name,
        amount,
        color: catObj.color,
      };
    });

    setSaving(true);
    try {
      await upsertBudgetsBatch(items);
      Alert.alert('Orçamento Definido', `O modelo "${tpl.name}" foi aplicado para ${items.length} categorias.`);
      resetState();
      onClose();
      onSuccess();
    } catch (e: any) {
      Alert.alert('Erro ao salvar orçamentos', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        resetState();
        onClose();
      }}
    >
      <View style={styles.modalScrim}>
        {/* Já tem ScrollView próprio para a lista de templates, então só
            precisa se afastar do teclado. */}
        <View style={[styles.sheet, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Templates de Orçamento</Text>
            <AppPressable
              onPress={() => {
                resetState();
                onClose();
              }}
              hitSlop={12}
            >
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <Text style={styles.hint}>
            Informe sua renda mensal para calcularmos automaticamente as metas de gasto por categoria:
          </Text>

          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>R$</Text>
            <TextInput maxLength={LIMITS.amount}
              style={styles.amountInput}
              placeholder="5.000,00"
              placeholderTextColor={theme.inkFaint}
              keyboardType="decimal-pad"
              value={income}
              onChangeText={setIncome}
              autoFocus
            />
          </View>

          <ScrollView style={styles.templateList} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
            {BUDGET_TEMPLATES.map((tpl) => {
              const selected = selectedKey === tpl.key;
              return (
                <AppPressable
                  key={tpl.key}
                  onPress={() => {
                    setSelectedKey(tpl.key);
                    handleApplyTemplate(tpl);
                  }}
                  style={({ hovered }) => [
                    styles.templateCard,
                    selected && styles.templateCardSelected,
                    hovered && styles.templateCardHover,
                  ]}
                  disabled={saving}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.tplName}>{tpl.name}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={18} color={theme.ink} />}
                  </View>
                  <Text style={styles.tplDesc}>{tpl.desc}</Text>
                </AppPressable>
              );
            })}
          </ScrollView>

          {saving && <ActivityIndicator color={theme.ink} style={{ paddingVertical: 10 }} />}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.paperRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: '90%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: 17, fontWeight: '500' },
  hint: { color: theme.inkFaint, fontSize: 12, lineHeight: 17 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 8 },
  amountPrefix: { color: theme.inkFaint, fontSize: 20 },
  amountInput: { color: theme.ink, fontSize: 26, flex: 1 },
  templateList: { maxHeight: 280 },
  templateCard: {
    backgroundColor: theme.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.md,
    gap: 4,
  },
  templateCardSelected: { borderColor: theme.ink, backgroundColor: theme.paperRaised },
  templateCardHover: { borderColor: theme.ruleStrong },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tplName: { color: theme.ink, fontSize: 14, fontWeight: '500' },
  tplDesc: { color: theme.inkFaint, fontSize: 11.5, lineHeight: 16 },
});
