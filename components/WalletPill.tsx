import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, type, fonts, touchTarget } from '@/lib/theme';
import { useWallet } from '@/lib/wallet-context';
import AppPressable from './AppPressable';

/**
 * Seletor de carteira do cabeçalho. Existe como componente único porque a
 * regra é posicional, não só visual: ele é sempre o último item da linha do
 * cabeçalho, à direita dos botões específicos da tela, e nunca numa linha
 * abaixo do título. Antes cada tela repetia o mesmo bloco de markup e estilo,
 * e duas delas (Lançamentos e Boletos) tinham escorregado para uma segunda
 * linha — o tipo de divergência que só reaparece se o componente voltar a ser
 * copiado. Passe-o como último filho da prop `right` do ScreenHeader.
 */
export default function WalletPill({ onPress }: { onPress: () => void }) {
  const { activeWalletName, activeWalletColor } = useWallet();

  return (
    <AppPressable onPress={onPress} style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: activeWalletColor }]} />
      <Text style={styles.texto} numberOfLines={1}>
        {activeWalletName}
      </Text>
      <Ionicons name="chevron-down" size={14} color={theme.inkFaint} />
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
    maxWidth: 132,
    minHeight: touchTarget,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  texto: { color: theme.inkSoft, fontSize: type.nota, flexShrink: 1, fontFamily: fonts.light },
});
