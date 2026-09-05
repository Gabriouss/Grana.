import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, type, fonts, touchTarget } from '@/lib/theme';
import { useWallet } from '@/lib/wallet-context';
import { useBreakpoint } from '@/lib/breakpoints';
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
  const { ehCompacto } = useBreakpoint();

  /* Em tela estreita a pílula perde o RÓTULO e fica só ponto + seta.
     Motivo medido: numa tela de 390px, quatro ícones de ação (~176px) mais a
     pílula com rótulo (~90px) consomem 266px, e sobram ~124px pro título —
     "Lançamentos" precisa de ~130px e virava "Lança...". Sem o rótulo sobram
     ~45px, que é exatamente o que falta.
     O que se perde é o NOME da carteira; o que se mantém é a cor dela (o
     ponto), a affordance de abrir (a seta), o alvo de toque e o rótulo
     acessível. Quem usa leitor de tela continua ouvindo o nome. */
  return (
    <AppPressable
      onPress={onPress}
      style={[styles.pill, ehCompacto && styles.pillCompacta]}
      accessibilityLabel={`Carteira ${activeWalletName}. Trocar de carteira`}
    >
      <View style={[styles.dot, { backgroundColor: activeWalletColor }]} />
      {!ehCompacto && (
        <Text style={styles.texto} numberOfLines={1}>
          {activeWalletName}
        </Text>
      )}
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
  pillCompacta: { paddingHorizontal: spacing.sm, gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  texto: { color: theme.inkSoft, fontSize: type.nota, flexShrink: 1, fontFamily: fonts.light },
});
