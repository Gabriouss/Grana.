import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing } from '@/lib/theme';
import { parseCsvTextDetalhado, type ParsedCsvTransaction } from '@/lib/heuristics';
import { LIMITS } from '@/lib/limits';
import { formatDateLabel, formatMoney } from '@/lib/format';
import { addTransactionsBatch } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import AppPressable from './AppPressable';
import { useKeyboardHeight } from './Sheet';

export default function CsvImportModal({
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
  const [csvContent, setCsvContent] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedCsvTransaction[]>([]);
  const [importing, setImporting] = useState(false);

  function resetState() {
    setCsvContent('');
    setParsedRows([]);
    setImporting(false);
  }

  function handleParseCsv() {
    const text = csvContent.trim();
    if (!text) {
      Alert.alert('CSV vazio', 'Cole o conteúdo CSV do seu extrato ou planilha bancária.');
      return;
    }

    const { rows, totalLinhas, truncado } = parseCsvTextDetalhado(text);
    if (rows.length === 0) {
      Alert.alert('Nenhum lançamento identificado', 'Verifique o formato das colunas (Data, Descrição, Valor).');
      return;
    }

    /* Truncar em silêncio seria pior que recusar: a pessoa acharia que o
       extrato inteiro entrou e ficaria com o saldo errado sem saber por quê. */
    if (truncado) {
      Alert.alert(
        'Extrato grande demais',
        `O arquivo tem ${totalLinhas} linhas e importamos as primeiras ${rows.length}. ` +
          'Separe o restante em outro arquivo e importe em seguida.'
      );
    }

    setParsedRows(rows);
  }

  async function handleConfirmImport() {
    if (parsedRows.length === 0) return;
    if (isDemoMode) {
      Alert.alert(
        'Modo de exemplo ativo',
        'Desative "Dados de exemplo" no Perfil para importar lançamentos na sua conta.'
      );
      return;
    }
    setImporting(true);
    try {
      await addTransactionsBatch(parsedRows);
      Alert.alert('Sucesso', `${parsedRows.length} lançamentos importados com sucesso.`);
      resetState();
      onClose();
      onSuccess();
    } catch (e: any) {
      Alert.alert('Erro na importação', e.message);
    } finally {
      setImporting(false);
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
        {/* A prévia usa FlatList, então esta folha não entra no <Sheet> (que
            rolaria por fora); aqui basta afastar o conteúdo do teclado. */}
        <View style={[styles.sheet, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {parsedRows.length > 0 ? `Prévia: ${parsedRows.length} Lançamento(s)` : 'Importar Extrato CSV'}
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

          {parsedRows.length === 0 ? (
            <>
              <Text style={styles.hint}>
                Cole as linhas do arquivo CSV exportado pelo seu banco (ex: Nubank, Itaú, Inter, Bradesco) ou planilha Excel.
              </Text>
              <TextInput
                maxLength={LIMITS.pastedText}
                style={styles.textArea}
                placeholder="Data,Descrição,Valor&#10;15/08/2026,Supermercado Pão de Açúcar,-187.40&#10;14/08/2026,Empresa Salário,6200.00&#10;14/08/2026,Uber,-24.00"
                placeholderTextColor={theme.inkFaint}
                multiline
                numberOfLines={8}
                value={csvContent}
                onChangeText={setCsvContent}
                textAlignVertical="top"
                autoFocus
              />
              <AppPressable
                style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
                onPress={handleParseCsv}
              >
                <Text style={styles.saveBtnText}>Processar CSV</Text>
              </AppPressable>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                Confira a lista abaixo antes de salvar todos os lançamentos no Grana:
              </Text>

              <FlatList
                data={parsedRows}
                keyExtractor={(_, i) => String(i)}
                style={styles.previewList}
                contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
                renderItem={({ item }) => (
                  <View style={styles.previewRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewDesc} numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text style={styles.previewSub}>
                        {formatDateLabel(item.occurred_on)} · {item.category}
                      </Text>
                    </View>
                    <Text style={[styles.previewAmount, { color: item.type === 'in' ? theme.up : theme.down }]}>
                      {item.type === 'in' ? '+' : '−'} R$ {formatMoney(Number(item.amount))}
                    </Text>
                  </View>
                )}
              />

              <AppPressable
                style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
                onPress={handleConfirmImport}
                disabled={importing}
              >
                {importing ? (
                  <ActivityIndicator color={theme.paper} />
                ) : (
                  <Text style={styles.saveBtnText}>Importar {parsedRows.length} Lançamentos</Text>
                )}
              </AppPressable>

              <AppPressable onPress={() => setParsedRows([])}>
                <Text style={styles.backLink}>Editar CSV colado</Text>
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
    fontFamily: 'monospace',
    padding: spacing.md,
    minHeight: 140,
  },
  previewList: { maxHeight: 220, marginVertical: 4 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  previewDesc: { color: theme.ink, fontSize: 13 },
  previewSub: { color: theme.inkFaint, fontSize: 11, marginTop: 2 },
  previewAmount: { fontSize: 13, fontVariant: ['tabular-nums'] },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: 14, fontWeight: '600' },
  backLink: { color: theme.inkFaint, fontSize: 12, textAlign: 'center', paddingVertical: 4 },
});
