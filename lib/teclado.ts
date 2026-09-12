import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Altura do teclado virtual, em pontos, ou 0 quando ele está fechado.
 *
 * Mora aqui, e não dentro de `components/Sheet.tsx` como antes, porque quem
 * precisa dela primeiro é a regra que dimensiona as janelas
 * (`useSheetFlutuante`, em `lib/breakpoints.ts`): uma janela centralizada
 * precisa saber quanto da tela ainda está visível para caber nela. Deixar a
 * medição dentro de um componente obrigaria a biblioteca a importar da pasta
 * de componentes, que é a dependência na direção errada.
 *
 * Poderia parecer desnecessário medir — no Android o clássico `adjustResize`
 * fazia a janela encolher sozinha —, mas a partir do SDK 54 o Expo liga o modo
 * edge-to-edge por padrão, e nesse modo a janela não é mais redimensionada
 * pelo sistema: cabe ao app ler a altura do teclado e se ajustar. Somado ao
 * fato de o `<Modal>` do React Native no Android viver numa janela própria
 * (onde `KeyboardAvoidingView` é notoriamente inconsistente), medir na mão é o
 * caminho previsível nas duas plataformas.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // No iOS os eventos "Will" acompanham a animação do teclado, o que deixa
    // o movimento da janela sincronizado; o Android só expõe os "Did".
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
