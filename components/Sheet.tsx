import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, radius, spacing } from '@/lib/theme';
import { useSheetFlutuante } from '@/lib/breakpoints';
import { useModalAccessibility } from '@/lib/modal-accessibility';

/**
 * Mede a altura do teclado para que as folhas (bottom sheets) possam se
 * levantar acima dele.
 *
 * Poderia parecer desnecessário — no Android o clássico `adjustResize` fazia
 * a janela encolher sozinha —, mas a partir do SDK 54 o Expo liga o modo
 * edge-to-edge por padrão, e nesse modo a janela não é mais redimensionada
 * pelo sistema: cabe ao app ler a altura do teclado e se ajustar. Somado ao
 * fato de o <Modal> do React Native no Android viver numa janela própria
 * (onde KeyboardAvoidingView é notoriamente inconsistente), medir a altura
 * na mão é o caminho previsível nas duas plataformas.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // No iOS os eventos "Will" acompanham a animação do teclado, o que deixa
    // o movimento da folha sincronizado; o Android só expõe os "Did".
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

/**
 * Estrutura padrão das folhas do app: fundo escurecido + painel ancorado
 * embaixo. O conteúdo fica dentro de um ScrollView para que, mesmo com o
 * teclado aberto reduzindo o espaço, todos os campos continuem alcançáveis.
 *
 * A folga do teclado entra como `paddingBottom` do CONTEÚDO do ScrollView
 * (contentContainerStyle), não do painel que o envolve. Colocá-la no painel
 * (que tem `maxHeight: 92%`) faz esse limite absorver o tamanho do teclado
 * inteiro como se fosse conteúdo, sobrando um vão morto do tamanho do
 * teclado e espremendo a área realmente rolável a uma fresta — foi
 * reportado como "esse espaço não deveria existir". Com a folga dentro do
 * ScrollView, o painel continua ocupando a janela toda até 92% da tela, e é
 * só o CONTEÚDO que ganha esse respiro extra no fim, para o último campo
 * poder rolar para cima do teclado.
 */
export default function Sheet({
  children,
  contentStyle,
  sheetStyle,
  onClose,
}: {
  children: ReactNode;
  /** Estilo do container interno do conteúdo (o padrão já aplica o espaçamento entre campos). */
  contentStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  /** Toca no fundo escurecido, fora do painel, para fechar — como em qualquer
      modal. Opcional só para não quebrar quem ainda não passa essa prop; sem
      ela o fundo continua inerte, do jeito que já era antes. */
  onClose?: () => void;
}) {
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const { scrimStyle, sheetStyle: flutuanteStyle } = useSheetFlutuante();
  const painelRef = useRef<View>(null);
  useModalAccessibility(painelRef);

  /* Esc fecha, na web. No celular o gesto equivalente é o botão voltar, que o
     <Modal> já trata por `onRequestClose`; no navegador não há equivalente —
     sem isto, quem navega por teclado abre uma folha e fica preso nela, tendo
     de encontrar o X com Tab. Vale só quando `onClose` existe: sem ele não há
     o que fazer com a tecla. */
  useEffect(() => {
    if (Platform.OS !== 'web' || !onClose || typeof document === 'undefined') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  return (
    <Pressable style={[styles.scrim, scrimStyle]} onPress={onClose} accessible={false}>
      {/* onPress vazio: por ser um Pressable aninhado, ele assume o toque
          antes que chegue ao fundo, então tocar dentro do painel nunca fecha
          a folha — só o fundo escurecido em volta dele fecha. */}
      <Pressable
        ref={painelRef}
        style={[styles.sheet, { maxHeight: '92%' }, flutuanteStyle, sheetStyle]}
        onPress={() => {}}
        accessibilityViewIsModal
        importantForAccessibility="yes"
        role="dialog"
        focusable
      >
        {Platform.OS !== 'web' ? <View style={styles.handle} accessible={false} /> : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            /* Sem somar insets.bottom, o fim da folha (em geral um rodapé de
               ação, como "Cancelar"/"Selecionar") encostava na barra de
               navegação do Android em aparelho com os 3 botões físicos — modo
               edge-to-edge não reserva essa faixa sozinho, e só o teclado
               empurrava o conteúdo pra cima. Reportado como "os botões ficam
               em cima da barra do Android, preciso arrastar pra ver". Com
               teclado aberto o próprio teclado já cobre essa área, então o
               inset não soma de novo ali. */
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 36 : insets.bottom + spacing.lg },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.paperRaised,
    borderTopLeftRadius: Platform.OS === 'android' ? 28 : radius.xl,
    borderTopRightRadius: Platform.OS === 'android' ? 28 : radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    width: '100%',
    ...(Platform.OS === 'android' ? { elevation: 8 } : null),
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.ruleStrong,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  scroll: { flexShrink: 1 },
  content: { gap: spacing.md },
});


