import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Alert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import {
  guessAmountFromText,
  guessCategoryFromText,
  guessDescFromText,
  guessTypeFromText,
} from '@/lib/heuristics';
import { formatMoney, parseAmount, todayISO, formatMoneyInput } from '@/lib/format';
import { addTransaction } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import CategoryChips from './CategoryChips';
import AppPressable from './AppPressable';
import Sheet from './Sheet';
import type { TxType } from '@/lib/types';
import { LIMITS } from '@/lib/limits';

export default function PasteReceiptModal({
  visible,
  onClose,
  onSuccess,
  initialText,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Texto já pronto pra reconhecer, pulando a etapa de colar — usado pelo
      lançamento por voz, que chega aqui como transcrição. */
  initialText?: string;
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

  function processText(text: string) {
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

  function handleProcessText() {
    const text = rawText.trim();
    if (!text) {
      Alert.alert('Texto vazio', 'Cole o texto do comprovante ou Pix para reconhecer.');
      return;
    }
    processText(text);
  }

  useEffect(() => {
    if (!visible || !initialText) return;
    setRawText(initialText);
    processText(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialText]);

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
      <Sheet
        onClose={() => {
          resetState();
          onClose();
        }}
      >
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
              accessibilityRole="button"
              accessibilityLabel="Fechar"
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
                maxLength={LIMITS.pastedText}
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

              <TextInput maxLength={LIMITS.description}
                style={styles.descInput}
                placeholder="Descrição"
                placeholderTextColor={theme.inkFaint}
                value={desc}
                onChangeText={setDesc}
              />

              <View style={styles.amountRow}>
                <Text style={styles.amountPrefix}>R$</Text>
                <TextInput maxLength={LIMITS.amount}
                  style={styles.amountInput}
                  placeholder="0,00"
                  placeholderTextColor={theme.inkFaint}
                  keyboardType="number-pad"
                  value={amount}
                  onChangeText={(t) => setAmount(formatMoneyInput(t))}
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
      </Sheet>
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
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: 17, fontFamily: fonts.light },
  textArea: {
    backgroundColor: theme.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    color: theme.ink,
    fontSize: type.apoio,
    padding: spacing.md,
    minHeight: 110, fontFamily: fonts.regular,
    /* Sem isso o navegador desenha o próprio anel de foco azul padrão em
       cima do card — mantém o foco visível (acessibilidade), só troca a cor
       pela identidade do app em vez do azul genérico do sistema. */
    outlineColor: theme.accent2,
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineOffset: -1,
  },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: theme.paper },
  typeBtnOut: { backgroundColor: '#bb6b6033', borderWidth: 1, borderColor: '#bb6b60' },
  typeBtnIn: { backgroundColor: '#4f948333', borderWidth: 1, borderColor: '#4f9483' },
  typeText: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  typeTextOn: { color: theme.ink},
  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: type.corpo, paddingVertical: 8, fontFamily: fonts.regular },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.marca, flex: 1, fontFamily: fonts.regular },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  backLink: { color: theme.inkFaint, fontSize: type.nota, textAlign: 'center', paddingVertical: 4, fontFamily: fonts.light },
});
