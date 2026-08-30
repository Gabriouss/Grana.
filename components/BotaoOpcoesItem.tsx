import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius } from '@/lib/theme';
import AppPressable from './AppPressable';

/**
 * Abre a folha de ações de um item de lista.
 *
 * Existe para as linhas cujo toque simples JÁ tem dono: a conta a pagar
 * alterna entre paga e em aberto, o cofrinho abre o depósito, e o cartão de
 * crédito seleciona o cartão. Nas três, editar e excluir viviam só no toque
 * longo, um gesto que o leitor de tela não anuncia, o teclado não alcança e
 * que no computador ninguém descobre. No cartão o caso era o mais sério:
 * o toque longo era a única forma de excluir um cartão em todo o app.
 *
 * Nas linhas em que o toque estava livre (Lançamentos, Início, Crédito) a
 * solução foi mais simples e não precisa deste botão: lá o próprio toque
 * simples abre a folha.
 *
 * O desenho é discreto de propósito. É ação secundária numa lista densa, então
 * carrega peso de metadado (`inkFaint`), e não de controle primário.
 */
export default function BotaoOpcoesItem({
  onPress,
  accessibilityLabel,
  icone = 'ellipsis-horizontal',
}: {
  onPress: () => void;
  /** Precisa nomear o item, não só a ação: numa lista, "Opções" repetido em
   *  cada linha não diz a quem pertence. */
  accessibilityLabel: string;
  /** Reticências quando abre uma folha com escolhas. Onde existe UMA ação só,
   *  e ela é destrutiva, o ícone precisa dizer qual: reticências prometeriam
   *  um menu que não vem. */
  icone?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <AppPressable
      onPress={(evento) => {
        /* O botão fica DENTRO de uma linha que também é pressionável. No
           nativo o sistema de responder já entrega o toque só ao filho, mas na
           web o clique sobe, e sem isto tocar em "opções" também marcaria a
           conta como paga. */
        (evento as unknown as { stopPropagation?: () => void })?.stopPropagation?.();
        onPress();
      }}
      hitSlop={8}
      scaleOnPress={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ hovered }) => [styles.botao, hovered && styles.hover]}
    >
      <Ionicons name={icone} size={16} color={theme.inkFaint} />
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  /* 28px de desenho com `hitSlop` de 8 leva a área tocável a 44, que atende
     iOS e Android. O `AppPressable` devolve esse acréscimo também na web, onde
     o `hitSlop` do react-native-web é inerte. */
  botao: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hover: { backgroundColor: theme.hover },
});
