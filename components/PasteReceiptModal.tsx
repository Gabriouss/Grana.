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
import {
  guessAmountFromText,
  guessCategoryFromText,
  guessDescFromText,
  guessTypeFromText,
} from '@/lib/heuristics';
import { formatMoney, parseAmount, todayISO } from '@/lib/format';
import { addTransaction } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import CategoryChips from './CategoryChips';
import AppPressable from './AppPressable';
import type { TxType } from '@/lib/types';

export default function PasteReceiptModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { isDemoMode } = useDemo();
  const [rawText, setRawText] = useState('');
  const [recognized, setRecognized] = useState(false);
  const [type, setType] = useState<TxType>('out');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Alimentação');
  const [saving, setSaving] = useState(false);

  function resetState() {
    setRawText('');
    setRecognized(false);
    setDesc('');
    setAmount('');
    setType('out');
    setSaving(false);
  }

  function handleProcessText() {
    const text = rawText.trim();
    if (!text) {
      Alert.alert('Texto vazio', 'Cole o texto do comprovante ou Pix para reconhecer.');
      return;
    }

    const guessedAmount = guessAmountFromText(text);
    const guessedType = guessTypeFromText(text);
    const guessedCat = guessCategoryFromText(text);
    const guessedDesc = guessDescFromText(text, guessedType);

    setType(guessedType);
    setDesc(guessedDesc);
    setAmount(guessedAmount > 0 ? formatMoney(guessedAmount) : '');
    setCategory(guessedCat.name);
    setRecognized(true);
  }

  async function handleSave() {
    const val = parseAmount(amount);
    if (!val || val <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor válido em R$.');
      return;
    }
    if (isDemoMode) {
      Alert.alert(
        'Modo de exemplo ativo',
        'Desative "Dados de exemplo" no Perfil para salvar lançamentos reconhecidos na sua conta.'
      );
      return;
    }

    const catObj = guessCategoryFromText(category);
    setSaving(true);
    try {
      await addTransaction({
        type,
        description: desc.trim() || 'Sem descrição',
        amount: val,
        category: catObj.name,
        color: catObj.color,
        occurred_on: todayISO(),
      });
      resetState();
      onClose();
      onSuccess();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
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
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {recognized ? 'Confirmar Lançamento' : 'Colar Comprovante / Pix'}
            </Text>
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

          {!recognized ? (
            <>
              <Text style={styles.hint}>
                Cole o texto copiado de um comprovante Pix, fatura ou recibo. Identificamos o valor, categoria e tipo automaticamente.
              </Text>
              <TextInput
                style={styles.textArea}
                placeholder="Ex: Você transferiu R$ 45,90 para Restaurante Sabor da Terra..."
                placeholderTextColor={theme.inkFaint}
                multiline
                numberOfLines={5}
                value={rawText}
                onChangeText={setRawText}
                textAlignVertical="top"
                autoFocus
              />
              <AppPressable
                style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
                onPress={handleProcessText}
              >
                <Text style={styles.saveBtnText}>Reconhecer dados</Text>
              </AppPressable>
            </>
          ) : (
            <>
              <View style={styles.typeRow}>
                <AppPressable
                  onPress={() => setType('out')}
                  style={[styles.typeBtn, type === 'out' && styles.typeBtnOut]}
                >
                  <Text style={[styles.typeText, type === 'out' && styles.typeTextOn]}>Despesa (−)</Text>
                </AppPressable>
                <AppPressable
                  onPress={() => setType('in')}
                  style={[styles.typeBtn, type === 'in' && styles.typeBtnIn]}
                >
                  <Text style={[styles.typeText, type === 'in' && styles.typeTextOn]}>Receita (+)</Text>
                </AppPressable>
              </View>

              <TextInput
                style={styles.descInput}
                placeholder="Descrição"
                placeholderTextColor={theme.inkFaint}
                value={desc}
                onChangeText={setDesc}
              />

              <View style={styles.amountRow}>
                <Text style={styles.amountPrefix}>R$</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0,00"
                  placeholderTextColor={theme.inkFaint}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>

              <CategoryChips value={category} onChange={setCategory} />

              <AppPressable
                style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={theme.paper} />
                ) : (
                  <Text style={styles.saveBtnText}>Salvar Lançamento</Text>
                )}
              </AppPressable>

              <AppPressable onPress={() => setRecognized(false)}>
                <Text style={styles.backLink}>Colar outro texto</Text>
              </AppPressable>
            </>
          )}
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
  textArea: {
    backgroundColor: theme.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    color: theme.ink,
    fontSize: 13,
    padding: spacing.md,
    minHeight: 110,
  },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: theme.paper },
  typeBtnOut: { backgroundColor: '#bb6b6033', borderWidth: 1, borderColor: '#bb6b60' },
  typeBtnIn: { backgroundColor: '#4f948333', borderWidth: 1, borderColor: '#4f9483' },
  typeText: { color: theme.inkFaint, fontSize: 12 },
  typeTextOn: { color: theme.ink, fontWeight: '500' },
  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: 14, paddingVertical: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: 20 },
  amountInput: { color: theme.ink, fontSize: 28, flex: 1 },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: 14, fontWeight: '600' },
  backLink: { color: theme.inkFaint, fontSize: 12, textAlign: 'center', paddingVertical: 4 },
});
