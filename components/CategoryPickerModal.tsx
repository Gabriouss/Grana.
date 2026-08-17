import { useState } from 'react';
import {
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
import { CATEGORIES } from '@/lib/types';
import { CAT_COLORS } from '@/lib/demo-data';
import { LIMITS } from '@/lib/limits';
import AppPressable from './AppPressable';
import { useKeyboardHeight } from './Sheet';

export default function CategoryPickerModal({
  visible,
  currentCategory,
  onClose,
  onSelectCategory,
}: {
  visible: boolean;
  currentCategory: string;
  onClose: () => void;
  onSelectCategory: (category: { name: string; color: string }) => void;
}) {
  const keyboardHeight = useKeyboardHeight();
  const [categories, setCategories] = useState(CATEGORIES);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [selectedColor, setSelectedColor] = useState(CAT_COLORS[1]);

  function handleCreateCategory() {
    const name = newCatName.trim();
    if (!name) {
      Alert.alert('Nome obrigatório', 'Digite o nome da nova categoria.');
      return;
    }

    const newCat = { name, color: selectedColor };
    setCategories((prev) => [...prev, newCat]);
    setNewCatName('');
    setCreatingNew(false);
    onSelectCategory(newCat);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        {/* Lista de categorias já rola por conta própria; aqui só o
            afastamento do teclado ao criar uma categoria nova. */}
        <View style={[styles.sheet, { paddingBottom: spacing.xl + keyboardHeight }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Categoria</Text>
            <AppPressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          <ScrollView style={styles.catList} contentContainerStyle={{ gap: 2 }}>
            {categories.map((c) => {
              const selected = c.name === currentCategory;
              return (
                <AppPressable
                  key={c.name}
                  style={({ hovered }) => [
                    styles.catRow,
                    selected && styles.catRowSelected,
                    hovered && styles.catRowHover,
                  ]}
                  onPress={() => {
                    onSelectCategory(c);
                    onClose();
                  }}
                >
                  <View style={[styles.dot, { backgroundColor: c.color }]} />
                  <Text style={[styles.catName, selected && { color: theme.ink, fontWeight: '500' }]}>
                    {c.name}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color={theme.ink} style={{ marginLeft: 'auto' }} />}
                </AppPressable>
              );
            })}
          </ScrollView>

          {!creatingNew ? (
            <AppPressable onPress={() => setCreatingNew(true)}>
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

              <View style={styles.colorGrid}>
                {CAT_COLORS.slice(0, 24).map((color) => {
                  const sel = color === selectedColor;
                  return (
                    <AppPressable
                      key={color}
                      style={[styles.colorSwatch, { backgroundColor: color }, sel && styles.colorSwatchSel]}
                      onPress={() => setSelectedColor(color)}
                    />
                  );
                })}
              </View>

              <AppPressable
                style={({ hovered }) => [styles.addBtn, hovered && styles.addBtnHover]}
                onPress={handleCreateCategory}
              >
                <Text style={styles.addBtnText}>Adicionar categoria</Text>
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
  catList: { maxHeight: 220 },
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
  catName: { color: theme.inkSoft, fontSize: 13 },
  createToggle: { color: theme.inkSoft, fontSize: 12.5, paddingVertical: 6 },
  newForm: { gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.rule },
  newInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: 13.5, paddingVertical: 6 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center' },
  colorSwatch: { width: 28, height: 28, borderRadius: 14 },
  colorSwatchSel: { borderWidth: 2, borderColor: theme.ink },
  addBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addBtnHover: { opacity: 0.88 },
  addBtnText: { color: theme.paper, fontSize: 13, fontWeight: '600' },
});
