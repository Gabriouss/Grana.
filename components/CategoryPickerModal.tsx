import { useEffect, useState } from 'react';
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
import { theme, radius, spacing, PALETTE_30 } from '@/lib/theme';
import { CATEGORIES } from '@/lib/types';
import type { Category } from '@/lib/types';
import { addCategory, deleteCategory, fetchCategories, seedDefaultCategories, updateCategory } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import { LIMITS } from '@/lib/limits';
import AppPressable from './AppPressable';
import ColorGridPicker from './ColorGridPicker';
import { useKeyboardHeight } from './Sheet';

type ListItem = { id: string; name: string; color: string; isDefault: boolean };

export default function CategoryPickerModal({
  visible,
  currentCategory = '',
  onClose,
  onSelectCategory,
  mode = 'pick',
}: {
  visible: boolean;
  /** Só faz sentido no modo "pick" — o modo "manage" não tem uma categoria "atual" pra destacar. */
  currentCategory?: string;
  onClose: () => void;
  /** Obrigatório no modo "pick" (padrão); ignorado no modo "manage". */
  onSelectCategory?: (category: { name: string; color: string }) => void;
  /** "pick": tocar numa linha seleciona e fecha (uso normal, dentro de um formulário).
      "manage": lista só de consulta/edição, sem seleção — usado em Perfil → Categorias. */
  mode?: 'pick' | 'manage';
}) {
  const { isDemoMode } = useDemo();
  const keyboardHeight = useKeyboardHeight();

  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState<Category[]>([]);

  const [creatingNew, setCreatingNew] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(PALETTE_30[0]);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PALETTE_30[0]);

  /* Tanto as 8 categorias padrão quanto as criadas pelo usuário vêm do banco
     — as padrão chegam aqui semeadas por seedDefaultCategories(), marcadas
     com is_default só para fins de exibição (nada as impede de ser editadas
     ou excluídas como qualquer outra). */
  const items: ListItem[] = custom.map((c) => ({ id: c.id, name: c.name, color: c.color, isDefault: c.is_default }));

  function resetForms() {
    setCreatingNew(false);
    setNewCatName('');
    setNewCatColor(PALETTE_30[0]);
    setEditingId(null);
    setEditName('');
    setEditColor(PALETTE_30[0]);
  }

  useEffect(() => {
    if (!visible) {
      resetForms();
      return;
    }
    if (isDemoMode) return;
    setLoading(true);
    seedDefaultCategories()
      .catch(() => {})
      .then(() => fetchCategories())
      .then(setCustom)
      .catch(() => setCustom([]))
      .finally(() => setLoading(false));
  }, [visible, isDemoMode]);

  function blockInDemo(): boolean {
    if (!isDemoMode) return false;
    Alert.alert(
      'Modo de exemplo ativo',
      'Desative "Dados de exemplo" no Perfil para criar ou editar categorias na sua conta.'
    );
    return true;
  }

  async function handleCreateCategory() {
    if (blockInDemo()) return;
    const name = newCatName.trim();
    if (!name) {
      Alert.alert('Nome obrigatório', 'Digite o nome da nova categoria.');
      return;
    }
    if (items.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Categoria já existe', 'Já existe uma categoria com esse nome.');
      return;
    }
    setSaving(true);
    try {
      const created = await addCategory({ name, color: newCatColor });
      setCustom((prev) => [...prev, created]);
      resetForms();
      if (mode === 'pick') {
        onSelectCategory?.({ name: created.name, color: created.color });
        onClose();
      }
    } catch (e: any) {
      Alert.alert('Erro ao criar categoria', e.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: ListItem) {
    setCreatingNew(false);
    setEditingId(item.id);
    setEditName(item.name);
    setEditColor(item.color);
  }

  async function handleSaveEdit() {
    if (blockInDemo() || !editingId) return;
    const name = editName.trim();
    if (!name) {
      Alert.alert('Nome obrigatório', 'Digite o nome da categoria.');
      return;
    }
    const oldItem = custom.find((c) => c.id === editingId);
    if (!oldItem) return;
    if (items.some((i) => i.id !== editingId && i.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Categoria já existe', 'Já existe uma categoria com esse nome.');
      return;
    }
    setSaving(true);
    try {
      await updateCategory(editingId, oldItem.name, { name, color: editColor });
      setCustom((prev) => prev.map((c) => (c.id === editingId ? { ...c, name, color: editColor } : c)));
      // Se a categoria em edição era a selecionada na tela de origem, mantém a seleção sincronizada.
      if (mode === 'pick' && oldItem.name === currentCategory) {
        onSelectCategory?.({ name, color: editColor });
      }
      resetForms();
    } catch (e: any) {
      Alert.alert('Erro ao salvar categoria', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(item: ListItem) {
    if (blockInDemo()) return;
    Alert.alert(
      `Excluir "${item.name}"?`,
      'Lançamentos, contas e orçamentos que usam essa categoria serão reclassificados para "Outros".',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(item.id, item.name);
              setCustom((prev) => prev.filter((c) => c.id !== item.id));
              if (mode === 'pick' && item.name === currentCategory) {
                const outros = CATEGORIES.find((c) => c.name === 'Outros')!;
                onSelectCategory?.(outros);
              }
              if (editingId === item.id) resetForms();
            } catch (e: any) {
              Alert.alert('Erro ao excluir categoria', e.message);
            }
          },
        },
      ]
    );
  }

  const usedByExcept = (exceptName?: string) =>
    items.filter((i) => i.name !== exceptName).map((i) => ({ color: i.color, label: i.name }));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        <View style={[styles.sheet, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{mode === 'manage' ? 'Gerenciar categorias' : 'Categoria'}</Text>
            <AppPressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <ScrollView
            style={[styles.catList, mode === 'manage' && styles.catListTall]}
            contentContainerStyle={{ gap: 2 }}
            keyboardShouldPersistTaps="handled"
          >
            {loading && <ActivityIndicator color={theme.ink} style={{ marginVertical: 10 }} />}
            {items.map((item) => {
              const selected = item.name === currentCategory;
              const isEditing = editingId === item.id;
              return (
                <View key={item.id}>
                  <AppPressable
                    style={({ hovered }) => [
                      styles.catRow,
                      selected && styles.catRowSelected,
                      hovered && styles.catRowHover,
                    ]}
                    onPress={() => {
                      if (mode === 'manage') return;
                      onSelectCategory?.(item);
                      onClose();
                    }}
                  >
                    <View style={[styles.dot, { backgroundColor: item.color }]} />
                    <Text style={[styles.catName, selected && { color: theme.ink, fontWeight: '500' }]}>
                      {item.name}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={16} color={theme.ink} />}
                    {item.isDefault && <Text style={styles.defaultTag}>padrão</Text>}
                    <View style={styles.rowActions}>
                      <AppPressable onPress={() => openEdit(item)} hitSlop={8} style={styles.rowActionBtn}>
                        <Ionicons name="pencil-outline" size={15} color={theme.inkFaint} />
                      </AppPressable>
                      <AppPressable onPress={() => confirmDelete(item)} hitSlop={8} style={styles.rowActionBtn}>
                        <Ionicons name="trash-outline" size={15} color={theme.inkFaint} />
                      </AppPressable>
                    </View>
                  </AppPressable>

                  {isEditing && (
                    <View style={styles.newForm}>
                      <TextInput
                        maxLength={LIMITS.category}
                        style={styles.newInput}
                        placeholder="Nome da categoria"
                        placeholderTextColor={theme.inkFaint}
                        value={editName}
                        onChangeText={setEditName}
                        autoFocus
                      />
                      <ColorGridPicker
                        value={editColor}
                        onChange={setEditColor}
                        usedBy={usedByExcept(item.name)}
                      />
                      <View style={styles.formActionsRow}>
                        <AppPressable onPress={resetForms} style={styles.cancelBtn}>
                          <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </AppPressable>
                        <AppPressable
                          style={({ hovered }) => [styles.addBtn, { flex: 1 }, hovered && styles.addBtnHover]}
                          onPress={handleSaveEdit}
                          disabled={saving}
                        >
                          {saving ? (
                            <ActivityIndicator color={theme.paper} />
                          ) : (
                            <Text style={styles.addBtnText}>Salvar categoria</Text>
                          )}
                        </AppPressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {!creatingNew ? (
            <AppPressable onPress={() => { resetForms(); setCreatingNew(true); }}>
              <Text style={styles.createToggle}>+ Criar categoria</Text>
            </AppPressable>
          ) : (
            <View style={styles.newForm}>
              <TextInput maxLength={LIMITS.category}
                style={styles.newInput}
                placeholder="Nome da categoria"
                placeholderTextColor={theme.inkFaint}
                value={newCatName}
                onChangeText={setNewCatName}
                autoFocus
              />

              <ColorGridPicker value={newCatColor} onChange={setNewCatColor} usedBy={usedByExcept()} />

              <AppPressable
                style={({ hovered }) => [styles.addBtn, hovered && styles.addBtnHover]}
                onPress={handleCreateCategory}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.addBtnText}>Adicionar categoria</Text>}
              </AppPressable>
            </View>
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
    maxHeight: '85%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: 17, fontWeight: '500' },
  catList: { maxHeight: 280 },
  catListTall: { maxHeight: 420 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  catRowSelected: { backgroundColor: theme.paper },
  catRowHover: { backgroundColor: theme.paper },
  dot: { width: 10, height: 10, borderRadius: 5 },
  catName: { color: theme.inkSoft, fontSize: 13, flexShrink: 1 },
  defaultTag: { color: theme.inkFaint, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowActions: { flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  rowActionBtn: { padding: 4 },
  createToggle: { color: theme.inkSoft, fontSize: 12.5, paddingVertical: 6 },
  newForm: { gap: 10, paddingVertical: 10, paddingHorizontal: 4 },
  newInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: 13.5, paddingVertical: 6 },
  formActionsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 14 },
  cancelBtnText: { color: theme.inkFaint, fontSize: 13 },
  addBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addBtnHover: { opacity: 0.88 },
  addBtnText: { color: theme.paper, fontSize: 13, fontWeight: '600' },
});
