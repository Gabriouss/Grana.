import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppModal from './AppModal';
import { Alert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/lib/wallet-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { createWallet } from '@/lib/wallets';
import { formatMoney, parseAmount, formatMoneyInput } from '@/lib/format';
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
  const { wallets, activeWalletId, setActiveWalletId, saldos, refreshWallets } = useWallet();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { isDemoMode } = useDemo();

  const [selectedId, setSelectedId] = useState(activeWalletId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newColor, setNewColor] = useState(WALLET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  function handleOpen() {
    setSelectedId(activeWalletId);
    setCreating(false);
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
    const val = parseAmount(newBalance) || 0;

    if (isDemoMode) {
      Alert.alert('Modo de Exemplo', 'Criação de carteira é simulada no modo de exemplo.');
      setCreating(false);
      return;
    }

    setSaving(true);
    try {
      const created = await createWallet({
        name: newName.trim(),
        initial_balance: val,
        color: newColor,
        icon: 'wallet-outline',
      });
      await refreshWallets();
      setSelectedId(created.id);
      setCreating(false);
      setNewName('');
      setNewBalance('');
    } catch (e: any) {
      Alert.alert('Erro ao criar carteira', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      transparent
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      <Sheet onClose={onClose}>
        <View style={styles.header}>
          <Text style={styles.title}>Selecionar conta</Text>
          <AppPressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {/* Toggle de Ocultar Saldo (Conforme print de referência do usuário) */}
        <View style={styles.privacyRow}>
          <Text style={styles.privacyLabel}>Ocultar saldo da Tela inicial</Text>
          <ToggleSwitch value={hidden} onToggle={togglePrivacy} label="Ocultar saldo da Tela inicial" />
        </View>

        <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
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
            <PrivacyValue>
              <Text style={styles.walletBalance}>{`R$ ${formatMoney(saldos.total)}`}</Text>
            </PrivacyValue>
          </AppPressable>

          {/* Opções Individuais */}
          {wallets.map((w) => {
            const isSelected = selectedId === w.id;
            const saldoItem = saldos.porCarteira[w.id] ?? Number(w.initial_balance || 0);

            return (
              <AppPressable
                key={w.id}
                style={[styles.walletCard, isSelected && styles.walletCardSelected]}
                onPress={() => setSelectedId(w.id)}
              >
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletName}>{w.name}</Text>
                </View>
                <PrivacyValue>
                  <Text style={styles.walletBalance}>{`R$ ${formatMoney(saldoItem)}`}</Text>
                </PrivacyValue>
              </AppPressable>
            );
          })}

          {/* Criação de Nova Carteira */}
          {creating ? (
            <View style={styles.createBox}>
              <Text style={styles.createTitle}>Nova Carteira / Conta</Text>
              <TextInput
                style={styles.input}
                placeholder="Nome da conta (ex: Casamento)"
                placeholderTextColor={theme.inkFaint}
                value={newName}
                onChangeText={setNewName}
              />
              <TextInput
                style={styles.input}
                placeholder="Saldo inicial (R$ 0,00)"
                placeholderTextColor={theme.inkFaint}
                keyboardType="number-pad"
                value={newBalance}
                onChangeText={(t) => setNewBalance(formatMoneyInput(t))}
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
                    <Text style={styles.createConfirmText}>Criar Conta</Text>
                  )}
                </AppPressable>
              </View>
            </View>
          ) : (
            <AppPressable style={styles.addBtn} onPress={() => setCreating(true)}>
              <Ionicons name="add-circle-outline" size={20} color={theme.accent2} />
              <Text style={styles.addBtnText}>Adicionar nova carteira</Text>
            </AppPressable>
          )}
        </ScrollView>

        {/* Rodapé com Cancelar e Selecionar */}
        <View style={styles.footer}>
          <AppPressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </AppPressable>
          <AppPressable style={styles.selectBtn} onPress={handleSelect}>
            <Text style={styles.selectBtnText}>Selecionar</Text>
          </AppPressable>
        </View>
      </Sheet>
    </AppModal>
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
  list: {
    maxHeight: 380,
  },
  walletCard: {
    flexDirection: 'row',
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
    fontSize: type.corpo, fontFamily: fonts.regular },
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
