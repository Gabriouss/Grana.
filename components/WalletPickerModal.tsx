import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppModal from './AppModal';
import { Alert } from '@/lib/alert';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useWallet } from '@/lib/wallet-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { createWallet, updateWallet, deleteWallet } from '@/lib/wallets';
import { formatBRL } from '@/lib/format';
import { theme, radius, spacing, type, fonts, touchTarget } from '@/lib/theme';
import PrivacyValue from './PrivacyValue';
import AppPressable from './AppPressable';
import ToggleSwitch from './ToggleSwitch';
import Sheet from './Sheet';

const WALLET_COLORS = ['#1fa98d', '#c66f8e', '#6b9dc2', '#d3b869', '#93739e', '#bb6b60'];

export default function WalletPickerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { wallets, activeWalletId, setActiveWalletId, entradas, refreshWallets, refreshSaldos, refreshEntradas } = useWallet();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { isDemoMode } = useDemo();

  const [selectedId, setSelectedId] = useState(activeWalletId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(WALLET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Edição de uma carteira já existente. Reaproveita o mesmo par de campos
  // da criação (nome, cor); só o alvo muda (update em vez de insert).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(WALLET_COLORS[0]);
  const [deleteTarget, setDeleteTarget] = useState<(typeof wallets)[number] | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleOpen() {
    setSelectedId(activeWalletId);
    setCreating(false);
    setEditingId(null);
  }

  function handleStartEdit(w: (typeof wallets)[number]) {
    if (isDemoMode) {
      Alert.alert('Modo de Exemplo', 'Edição de carteira é simulada no modo de exemplo.');
      return;
    }
    setEditingId(w.id);
    setEditName(w.name);
    setEditColor(w.color || WALLET_COLORS[0]);
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    if (!editName.trim()) {
      Alert.alert('Informe o nome da carteira');
      return;
    }
    setSaving(true);
    try {
      await updateWallet(editingId, {
        name: editName.trim(),
        color: editColor,
      });
      const walletsAtualizadas = await refreshWallets();
      await Promise.all([refreshSaldos(walletsAtualizadas), refreshEntradas(walletsAtualizadas)]);
      setEditingId(null);
    } catch (e: any) {
      Alert.alert('Erro ao salvar carteira', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteWallet(w: (typeof wallets)[number]) {
    if (isDemoMode) {
      Alert.alert('Modo de Exemplo', 'Exclusão de carteira é simulada no modo de exemplo.');
      return;
    }
    setDeleteTarget(w);
  }

  async function confirmarExclusaoCarteira() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWallet(deleteTarget.id);
      const walletsAtualizadas = await refreshWallets();
      await Promise.all([refreshSaldos(walletsAtualizadas), refreshEntradas(walletsAtualizadas)]);
      setDeleteTarget(null);
    } catch (e: any) {
      Alert.alert('Erro ao excluir carteira', e.message);
    } finally {
      setDeleting(false);
    }
  }

  function handleSelect() {
    setActiveWalletId(selectedId);
    onClose();
  }

  async function handleCreateWallet() {
    if (!newName.trim()) {
      Alert.alert('Informe o nome da carteira');
      return;
    }

    if (isDemoMode) {
      Alert.alert('Modo de Exemplo', 'Criação de carteira é simulada no modo de exemplo.');
      setCreating(false);
      return;
    }

    setSaving(true);
    try {
      const created = await createWallet({
        name: newName.trim(),
        color: newColor,
        icon: 'wallet-outline',
      });
      const walletsAtualizadas = await refreshWallets();
      // A11: criar carteira altera o consolidado imediatamente, igual à exclusão.
      await Promise.all([refreshSaldos(walletsAtualizadas), refreshEntradas(walletsAtualizadas)]);
      setSelectedId(created.id);
      setCreating(false);
      setNewName('');
    } catch (e: any) {
      Alert.alert('Erro ao criar carteira', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <AppModal
      visible={visible && !deleteTarget}
      transparent
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      <Sheet onClose={onClose}>
        <View style={styles.header}>
          <Text style={styles.title}>Selecionar carteira</Text>
          <AppPressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {/* Toggle de Ocultar Saldo (Conforme print de referência do usuário) */}
        <View style={styles.privacyRow}>
          <Text style={styles.privacyLabel}>Ocultar valores no Início do app</Text>
          <ToggleSwitch value={hidden} onToggle={togglePrivacy} label="Ocultar valores no Início do app" />
        </View>

        {/* Lista SEM rolagem própria. Até 19/09/2026 esta era uma segunda
            ScrollView, com teto de 380 px escrito à mão, dentro da ScrollView
            do `Sheet`. O formulário de nova carteira ficava preso numa janela
            de 380 px: cortava a paleta de cores e escondia "Criar carteira", e
            como essa rolagem interna não tinha `keyboardShouldPersistTaps`, o
            primeiro toque no botão com o teclado aberto só fechava o teclado
            (achado G18). O `Sheet` já rola o conteúdo inteiro e já se
            dimensiona acima do teclado, então uma rolagem só basta. */}
        <View style={styles.list}>
          {/* Opção 1: Total Consolidado */}
          <AppPressable
            style={[styles.walletCard, selectedId === 'total' && styles.walletCardSelected]}
            onPress={() => setSelectedId('total')}
          >
            <View style={styles.radioOuter}>
              {selectedId === 'total' && <View style={styles.radioInner} />}
            </View>
            <View style={[styles.walletIconWrap, { backgroundColor: 'rgba(31,169,141,0.16)' }]}>
              <Ionicons name="cash-outline" size={20} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.walletName}>Total</Text>
            </View>
            <View style={styles.walletValueCol}>
              <PrivacyValue>
                <Text style={styles.walletBalance}>{formatBRL(entradas.total)}</Text>
              </PrivacyValue>
              <Text style={styles.walletValueLabel}>entradas no período</Text>
            </View>
          </AppPressable>

          {/* Opções Individuais */}
          {wallets.map((w) => {
            const isSelected = selectedId === w.id;
            /* Regra 20 (complemento de 24/09): total de entradas, não saldo —
               nunca cai de volta pro `initial_balance` (a coluna existe no
               banco, sem uso; ver `calcularEntradasComAgregado`). */
            const entradasItem = entradas.porCarteira[w.id] ?? 0;

            if (editingId === w.id) {
              return (
                <View key={w.id} style={styles.createBox}>
                  <Text style={styles.createTitle}>Editar carteira</Text>
                  <TextInput
                    accessibilityLabel="Nome da carteira"
                    style={styles.input}
                    placeholder="Nome da carteira"
                    placeholderTextColor={theme.inkFaint}
                    value={editName}
                    onChangeText={setEditName}
                  />
                  <Text style={styles.colorLabel}>Cor do marcador</Text>
                  <View style={styles.colorRow}>
                    {WALLET_COLORS.map((c) => (
                      <AppPressable
                        key={c}
                        style={[
                          styles.colorDot,
                          { backgroundColor: c },
                          editColor === c && styles.colorDotSelected,
                        ]}
                        onPress={() => setEditColor(c)}
                        accessibilityLabel={`Selecionar cor ${c}`}
                        accessibilityState={{ selected: editColor === c }}
                      />
                    ))}
                  </View>
                  <View style={styles.createBtnRow}>
                    <AppPressable
                      style={styles.createCancelBtn}
                      onPress={() => setEditingId(null)}
                      disabled={saving}
                    >
                      <Text style={styles.createCancelText}>Cancelar</Text>
                    </AppPressable>
                    <AppPressable style={styles.createConfirmBtn} onPress={handleSaveEdit} disabled={saving}>
                      {saving ? (
                        <ActivityIndicator size="small" color={theme.paper} />
                      ) : (
                        <Text style={styles.createConfirmText}>Salvar</Text>
                      )}
                    </AppPressable>
                  </View>
                </View>
              );
            }

            return (
              <View key={w.id} style={[styles.walletCard, isSelected && styles.walletCardSelected]}>
                <AppPressable style={styles.walletCardMain} onPress={() => setSelectedId(w.id)}>
                  <View style={styles.radioOuter}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View
                    style={[
                      styles.walletIconWrap,
                      { backgroundColor: `${w.color || theme.accent}26` },
                    ]}
                  >
                    <Ionicons
                      name={(w.icon as any) || 'wallet-outline'}
                      size={20}
                      color={w.color || theme.accent}
                    />
                  </View>
                  {/* O nome quebra inteiro, sem teto de linhas, e o saldo não
                      encolhe. Um teto de duas linhas foi tentado (19/09/2026) e
                      desfeito no mesmo dia: "AUDIT carteira teste" virava
                      "AUDIT carteira ...", e duas carteiras como "Conta
                      conjunta" e "Conta pessoal" ficariam iguais. Linha mais
                      alta custa menos que nome ambíguo (achado G7). */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.walletName}>{w.name}</Text>
                  </View>
                  <View style={[styles.walletValueCol, styles.walletBalanceFixo]}>
                    <PrivacyValue>
                      <Text style={styles.walletBalance}>{formatBRL(entradasItem)}</Text>
                    </PrivacyValue>
                    <Text style={styles.walletValueLabel}>entradas no período</Text>
                  </View>
                </AppPressable>
                <AppPressable
                  hitSlop={8}
                  onPress={() => handleStartEdit(w)}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar carteira ${w.name}`}
                  style={[styles.walletActionBtn, styles.walletActionBtnPrimeiro]}
                >
                  <Ionicons name="pencil-outline" size={16} color={theme.inkFaint} />
                </AppPressable>
                {!w.is_default && (
                  <AppPressable
                    hitSlop={8}
                    onPress={() => handleDeleteWallet(w)}
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir carteira ${w.name}`}
                    style={styles.walletActionBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.danger} />
                  </AppPressable>
                )}
              </View>
            );
          })}

          {/* Criação de Nova Carteira */}
          {creating ? (
            <View style={styles.createBox}>
              <Text style={styles.createTitle}>Nova carteira</Text>
              <TextInput
                accessibilityLabel="Nome da nova carteira"
                style={styles.input}
                placeholder="Nome da carteira, ex.: Casamento"
                placeholderTextColor={theme.inkFaint}
                value={newName}
                onChangeText={setNewName}
              />

              <Text style={styles.colorLabel}>Cor do marcador</Text>
              <View style={styles.colorRow}>
                {WALLET_COLORS.map((c) => (
                  <AppPressable
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      newColor === c && styles.colorDotSelected,
                    ]}
                    onPress={() => setNewColor(c)}
                    accessibilityLabel={`Selecionar cor ${c}`}
                    accessibilityState={{ selected: newColor === c }}
                  />
                ))}
              </View>

              <View style={styles.createBtnRow}>
                <AppPressable
                  style={styles.createCancelBtn}
                  onPress={() => setCreating(false)}
                  disabled={saving}
                >
                  <Text style={styles.createCancelText}>Cancelar</Text>
                </AppPressable>
                <AppPressable
                  style={styles.createConfirmBtn}
                  onPress={handleCreateWallet}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={theme.paper} />
                  ) : (
                    <Text style={styles.createConfirmText}>Criar carteira</Text>
                  )}
                </AppPressable>
              </View>
            </View>
          ) : (
            <AppPressable style={styles.addBtn} onPress={() => setCreating(true)}>
              <Ionicons name="add-circle-outline" size={20} color={theme.accent2} />
              <Text style={styles.addBtnText}>Adicionar carteira</Text>
            </AppPressable>
          )}
        </View>

        {/* Rodapé com Cancelar e Selecionar */}
        {!creating && !editingId && <View style={styles.footer}>
          <AppPressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </AppPressable>
          <AppPressable style={styles.selectBtn} onPress={handleSelect}>
            <Text style={styles.selectBtnText}>Selecionar</Text>
          </AppPressable>
        </View>}
      </Sheet>
    </AppModal>
    <AppModal visible={!!deleteTarget} transparent onRequestClose={() => setDeleteTarget(null)}>
      <Sheet centered onClose={() => setDeleteTarget(null)}>
        <View style={styles.header}>
          <Text style={styles.title}>Excluir carteira?</Text>
          <AppPressable onPress={() => setDeleteTarget(null)} hitSlop={12} accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>
        <Text style={styles.confirmText}>
          {`Os lançamentos de “${deleteTarget?.name ?? ''}” passam para a carteira principal. Esta ação não pode ser desfeita.`}
        </Text>
        <View style={styles.createBtnRow}>
          <AppPressable style={styles.createCancelBtn} onPress={() => setDeleteTarget(null)} disabled={deleting}>
            <Text style={styles.createCancelText}>Cancelar</Text>
          </AppPressable>
          <AppPressable style={styles.deleteConfirmBtn} onPress={confirmarExclusaoCarteira} disabled={deleting}>
            {deleting ? <ActivityIndicator size="small" color={theme.paper} /> : <Text style={styles.deleteConfirmText}>Excluir carteira</Text>}
          </AppPressable>
        </View>
      </Sheet>
    </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    color: theme.ink,
    fontSize: type.titulo, fontFamily: fonts.regular },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    marginBottom: spacing.sm,
  },
  privacyLabel: {
    color: theme.inkFaint,
    fontSize: type.corpo, fontFamily: fonts.light },
  confirmText: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: type.apoio * 1.45, fontFamily: fonts.light },
  deleteConfirmBtn: { flex: 1, borderRadius: radius.md, backgroundColor: theme.danger, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  deleteConfirmText: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
  list: {
    gap: 8,
  },
  walletCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  walletCardSelected: {
    borderColor: theme.accent2,
    backgroundColor: 'rgba(31,169,141,0.08)',
  },
  walletCardMain: {
    flex: 1,
    flexBasis: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  walletActionBtn: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  walletActionBtnPrimeiro: {
    marginLeft: 'auto',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.accent2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.accent2,
  },
  walletIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletName: {
    color: theme.ink,
    fontSize: type.corpo, fontFamily: fonts.regular },
  walletBalance: {
    color: theme.ink,
    /* Saldos empilhados numa lista: alinham na vírgula com dígito de largura
       fixa, e param de saltar quando um valor muda. */
    fontVariant: ['tabular-nums'],
    fontSize: type.corpo, fontFamily: fonts.regular },
  walletBalanceFixo: { flexShrink: 0 },
  /* Regra 20 (complemento): o número deixou de ser saldo, e o rótulo abaixo
     dele é o que evita a pessoa ler "entradas do período" como "saldo
     disponível". */
  walletValueCol: {
    alignItems: 'flex-end',
  },
  walletValueLabel: {
    color: theme.inkFaint,
    fontSize: type.nota,
    fontFamily: fonts.light,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.rule,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  addBtnText: {
    color: theme.accent2,
    fontSize: type.corpo, fontFamily: fonts.regular },
  createBox: {
    backgroundColor: 'rgba(5,34,41,0.6)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  createTitle: {
    color: theme.ink,
    fontSize: type.corpo, fontFamily: fonts.regular },
  input: {
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: theme.ink,
    fontSize: type.corpo, fontFamily: fonts.regular },
  colorLabel: {
    color: theme.inkFaint,
    fontSize: type.nota,
    marginTop: 2, fontFamily: fonts.light },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  colorDot: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
  },
  colorDotSelected: {
    borderWidth: 2,
    borderColor: '#ffffff',
    transform: [{ scale: 1.15 }],
  },
  createBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  createCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  createCancelText: {
    color: theme.inkFaint,
    fontSize: type.apoio, fontFamily: fonts.light },
  createConfirmBtn: {
    backgroundColor: theme.accent2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  createConfirmText: {
    color: theme.paper,
    fontSize: type.apoio, fontFamily: fonts.regular },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xl,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  cancelBtnText: {
    color: theme.inkFaint,
    fontSize: type.apoio,
    letterSpacing: 0.5, fontFamily: fonts.light },
  selectBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  selectBtnText: {
    color: theme.accent2,
    fontSize: type.apoio,
    letterSpacing: 0.5, fontFamily: fonts.regular },
});
