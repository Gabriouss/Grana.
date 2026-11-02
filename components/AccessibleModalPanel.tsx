import { useRef, type ReactNode } from 'react';
import { Platform, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useModalAccessibility } from '@/lib/modal-accessibility';

/**
 * Segura o toque dentro do painel sem reivindicá-lo. O fundo que fecha a janela
 * é um `Pressable` ANCESTRAL deste painel, nos chamadores. Sem isto, tocar em
 * área comum do painel subiria até ele e fecharia a janela. Reivindicar o toque
 * aqui, como fazia o `Pressable` de `onPress` vazio, também não serve: no Android
 * a view que é responder de JS intercepta o gesto antes de ele chegar à
 * `ScrollView`, e a lista só rolava com o dedo começando em algo tocável.
 * Parar a propagação e devolver `false` deixa o toque sem dono, então a rolagem
 * nativa assume e os botões de dentro, que respondem antes, seguem funcionando.
 */
const naoDeixarChegarAoFundo = (e: GestureResponderEvent) => {
  e.stopPropagation();
  return false;
};

/* Na web o fundo fecha pelo `click`, que sobe pelo DOM à parte do responder. */
const propsSoDaWeb = Platform.OS === 'web'
  ? ({ onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() } as object)
  : {};

/** Painel semântico compartilhado pelos modais que não usam `Sheet`. */
export default function AccessibleModalPanel({
  ativo,
  children,
  style,
  onClose,
}: {
  ativo: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Escape fecha a janela na web, igual ao `Sheet`. */
  onClose: () => void;
}) {
  const ref = useRef<View>(null);
  useModalAccessibility(ref, ativo, onClose);

  return (
    <View
      ref={ref}
      style={style}
      collapsable={false}
      onStartShouldSetResponder={naoDeixarChegarAoFundo}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      role="dialog"
      focusable
      {...propsSoDaWeb}
    >
      {children}
    </View>
  );
}
