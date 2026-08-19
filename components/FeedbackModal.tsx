import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing } from '@/lib/theme';
import { LIMITS } from '@/lib/limits';
import { enviarFeedback, type FeedbackType } from '@/lib/feedback';
import { useDemo } from '@/lib/demo-context';
import { hapticTap } from '@/lib/haptics';
import AppPressable from './AppPressable';
import { useKeyboardHeight } from './Sheet';

const TIPOS: { key: FeedbackType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'suggestion', label: 'Sugestão', icon: 'bulb-outline' },
  { key: 'bug', label: 'Problema', icon: 'bug-outline' },
  { key: 'praise', label: 'Elogio', icon: 'heart-outline' },
  { key: 'other', label: 'Outro', icon: 'chatbubble-outline' },
];

export default function FeedbackModal({
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
  const [tipo, setTipo] = useState<FeedbackType>('suggestion');
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [enviando, setEnviando] = useState(false);

  function resetState() {
    setTipo('suggestion');
    setRating(null);
    setMessage('');
    setEnviando(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleEnviar() {
    if (!message.trim()) {
      Alert.alert('Mensagem obrigatória', 'Escreva o que você quer nos contar.');
      return;
    }
    setEnviando(true);
    try {
      await enviarFeedback({ type: tipo, message: message.trim(), rating }, isDemoMode);
      resetState();
      onClose();
      onSuccess();
    } catch (e: any) {
      Alert.alert('Erro ao enviar', e.message ?? 'Tente novamente mais tarde.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalScrim}>
        <View style={[styles.sheet, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Enviar feedback</Text>
            <AppPressable onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <Text style={styles.hint}>O que você quer nos contar?</Text>

          <View style={styles.tiposRow}>
            {TIPOS.map((t) => {
              const selecionado = tipo === t.key;
              return (
                <AppPressable
                  key={t.key}
                  onPress={() => {
                    hapticTap();
                    setTipo(t.key);
                  }}
                  style={({ hovered }) => [
                    styles.tipoChip,
                    selecionado && styles.tipoChipSelecionado,
                    hovered && styles.tipoChipHover,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t.label}
                  accessibilityState={{ selected: selecionado }}
                >
                  <Ionicons name={t.icon} size={16} color={selecionado ? theme.paper : theme.inkFaint} />
                  <Text style={[styles.tipoLabel, selecionado && styles.tipoLabelSelecionado]}>{t.label}</Text>
                </AppPressable>
              );
            })}
          </View>

          <Text style={styles.hint}>Como você avalia sua experiência? (opcional)</Text>
          <View style={styles.estrelasRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <AppPressable
                key={n}
                onPress={() => {
                  hapticTap();
                  setRating(rating === n ? null : n);
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${n} de 5 estrelas`}
                accessibilityState={{ selected: rating !== null && n <= rating }}
              >
                <Ionicons
                  name={rating !== null && n <= rating ? 'star' : 'star-outline'}
                  size={26}
                  color={rating !== null && n <= rating ? theme.accent : theme.inkFaint}
                />
              </AppPressable>
            ))}
          </View>

          <ScrollView style={styles.mensagemWrap} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.mensagemInput}
              placeholder="Conte com detalhes — quanto mais específico, melhor."
              placeholderTextColor={theme.inkFaint}
              multiline
              maxLength={LIMITS.feedbackMessage}
              value={message}
              onChangeText={setMessage}
            />
          </ScrollView>
          <Text style={styles.contador}>{message.length}/{LIMITS.feedbackMessage}</Text>

          <AppPressable
            style={({ hovered }) => [styles.enviarBtn, hovered && { opacity: 0.88 }]}
            onPress={handleEnviar}
            disabled={enviando}
          >
            {enviando ? (
              <ActivityIndicator color={theme.paper} />
            ) : (
              <Text style={styles.enviarTexto}>Enviar feedback</Text>
            )}
          </AppPressable>
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
  tiposRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paper,
  },
  tipoChipHover: { borderColor: theme.ruleStrong },
  tipoChipSelecionado: { backgroundColor: theme.ink, borderColor: theme.ink },
  tipoLabel: { color: theme.inkFaint, fontSize: 13, fontWeight: '500' },
  tipoLabelSelecionado: { color: theme.paper },
  estrelasRow: { flexDirection: 'row', gap: 6 },
  mensagemWrap: {
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    backgroundColor: theme.paper,
    maxHeight: 140,
  },
  mensagemInput: { color: theme.ink, fontSize: 14, lineHeight: 19, padding: spacing.md, minHeight: 100, textAlignVertical: 'top' },
  contador: { color: theme.inkFaint, fontSize: 10, textAlign: 'right' },
  enviarBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  enviarTexto: { color: theme.paper, fontSize: 15, fontWeight: '600' },
});
