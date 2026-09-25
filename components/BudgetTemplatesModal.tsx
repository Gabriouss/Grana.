import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppModal, { JanelaFlutuante } from './AppModal';
import { Alert } from '@/lib/alert';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { BUDGET_TEMPLATES, type BudgetTemplate } from '@/lib/heuristics';
import { CATEGORIES } from '@/lib/types';
import { parseAmount, formatMoneyInput, formatBRL } from '@/lib/format';
import { upsertBudgetsBatch } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import { LIMITS } from '@/lib/limits';
import AppPressable from './AppPressable';
import { useKeyboardHeight } from './Sheet';
import AccessibleModalPanel from './AccessibleModalPanel';

/** Tetos por categoria de um modelo, para uma renda. Mesma conta na prévia e na gravação. */
function linhasDoModelo(tpl: BudgetTemplate, renda: number) {
  return Object.entries(tpl.pct).map(([catName, pct]) => {
    const catObj = CATEGORIES.find((c) => c.name === catName) ?? CATEGORIES[0];
    return { category: catObj.name, amount: Math.round(renda * pct), color: catObj.color };
  });
}

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
  /* Nenhum modelo vem marcado: o ✓ no primeiro, antes de qualquer toque,
     parecia dizer que ele já estava aplicado. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function resetState() {
    setIncome('');
    setSelectedKey(null);
    setSaving(false);
  }

  const rendaInformada = parseAmount(income);
  const modeloEscolhido = BUDGET_TEMPLATES.find((t) => t.key === selectedKey) ?? null;
  const previa = modeloEscolhido && rendaInformada > 0 ? linhasDoModelo(modeloEscolhido, rendaInformada) : [];

  /* Aplicar só depois de ver os valores, e com confirmação: aplicar
     SUBSTITUI o teto de cada categoria do modelo. Até 19/09/2026 o primeiro
     toque num modelo gravava direto, sem mostrar nada (achado A42). */
  function confirmarAplicacao() {
    if (!modeloEscolhido) return;
    Alert.alert(
      'Aplicar orçamento',
      `Os tetos de ${previa.length} categorias serão substituídos pelos valores do modelo "${modeloEscolhido.name}".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aplicar', onPress: () => void handleApplyTemplate(modeloEscolhido) },
      ]
    );
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

    const items = linhasDoModelo(tpl, parsedIncome);

    setSaving(true);
    try {
      await upsertBudgetsBatch(items);
      Alert.alert('Orçamento aplicado', `O modelo "${tpl.name}" definiu o teto de ${items.length} categorias.`);
      resetState();
      onClose();
      onSuccess();
    } catch (e: any) {
      Alert.alert('Erro ao salvar orçamentos', e.message);
    } finally {
      setSaving(false);
    }
  }

  /* Um caminho de saída só, usado pelo fundo escurecido, pelo botão voltar do
     Android e pelo Escape da web. Antes a limpeza do rascunho estava copiada em
     dois lugares, e bastava um terceiro caminho de saída aparecer sem ela para
     a janela reabrir com o que a pessoa tinha deixado pela metade. */
  const fechar = useCallback(() => {
    resetState();
    onClose();
  }, [onClose]);

  return (
    <AppModal visible={visible} transparent onRequestClose={fechar}>
      <JanelaFlutuante>{({ aoMedirFundo, scrimStyle, sheetStyle: flutuanteStyle }) => (
      <Pressable style={[styles.modalScrim, scrimStyle]} onLayout={aoMedirFundo} onPress={fechar}>
        {/* Já tem ScrollView próprio para a lista de templates, então só
            precisa se afastar do teclado. */}
        <AccessibleModalPanel ativo={visible} onClose={fechar} style={[styles.sheet, flutuanteStyle, { paddingBottom: spacing.xl }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Orçamento sugerido</Text>
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

          <Text style={styles.hint}>
            Informe sua renda mensal, escolha um modelo e confira os tetos por categoria antes de aplicar.
          </Text>

          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>R$</Text>
            <TextInput accessibilityLabel="Renda mensal em reais" maxLength={LIMITS.amount}
              style={styles.amountInput}
              placeholder="0,00"
              placeholderTextColor={theme.inkFaint}
              keyboardType="number-pad"
              value={income}
              onChangeText={(t) => setIncome(formatMoneyInput(t))}
              autoFocus
            />
          </View>

          <ScrollView
            style={styles.templateList}
            contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
            /* Sem isto o primeiro toque num modelo, com o teclado da renda
               aberto, só fechava o teclado. */
            keyboardShouldPersistTaps="handled"
          >
            {BUDGET_TEMPLATES.map((tpl) => {
              const selected = selectedKey === tpl.key;
              return (
                <AppPressable
                  key={tpl.key}
                  onPress={() => setSelectedKey(tpl.key)}
                  accessibilityState={{ selected }}
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
                  {selected && previa.length > 0 && (
                    <View style={styles.previa}>
                      {previa.map((l) => (
                        <View key={l.category} style={styles.previaLinha}>
                          <View style={[styles.previaPonto, { backgroundColor: l.color }]} />
                          <Text style={styles.previaNome}>{l.category}</Text>
                          <Text style={styles.previaValor} numberOfLines={1}>{formatBRL(l.amount)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {selected && previa.length === 0 && (
                    <Text style={styles.tplDesc}>Informe a renda acima para ver os valores.</Text>
                  )}
                </AppPressable>
              );
            })}
          </ScrollView>

          <AppPressable
            style={({ hovered }) => [styles.aplicarBtn, (!previa.length || saving) && styles.aplicarBtnDesativado, hovered && previa.length > 0 && { opacity: 0.88 }]}
            onPress={confirmarAplicacao}
            disabled={!previa.length || saving}
            accessibilityState={{ disabled: !previa.length || saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator color={theme.paper} />
            ) : (
              <Text style={styles.aplicarBtnTexto}>{modeloEscolhido ? 'Aplicar orçamento' : 'Escolha um modelo'}</Text>
            )}
          </AppPressable>
        </AccessibleModalPanel>
      </Pressable>
      )}</JanelaFlutuante>
    </AppModal>
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
  hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 8 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.marca, flex: 1, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
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
  tplName: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  tplDesc: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
  previa: { marginTop: spacing.sm, gap: 6, borderTopWidth: 1, borderTopColor: theme.rule, paddingTop: spacing.sm },
  previaLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previaPonto: { width: 8, height: 8, borderRadius: 4 },
  previaNome: { flex: 1, color: theme.inkSoft, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
  previaValor: { color: theme.ink, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  aplicarBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  aplicarBtnDesativado: { opacity: 0.4 },
  aplicarBtnTexto: { color: theme.paper, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
});
