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
 * Estrutura padrão das janelas do app: fundo escurecido + painel flutuando no
 * centro, em qualquer largura. O conteúdo fica dentro de um ScrollView para
 * que, mesmo com o teclado aberto reduzindo o espaço, todos os campos
 * continuem alcançáveis.
 *
 * Todo comportamento de janela mora aqui ou no hook de acessibilidade que ela
 * usa, nunca no chamador: tocar fora fecha, Escape fecha na web, o botão
 * voltar do Android fecha (via `onRequestClose` do `AppModal`), a entrada é a
 * mesma `fade` para todas, e a leitura de tela fica presa dentro do painel.
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
  centered = false,
}: {
  children: ReactNode;
  /** Estilo do container interno do conteúdo (o padrão já aplica o espaçamento entre campos). */
  contentStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  /** Toca no fundo escurecido, fora do painel, para fechar — como em qualquer
      modal. Opcional só para não quebrar quem ainda não passa essa prop; sem
      ela o fundo continua inerte, do jeito que já era antes. */
  onClose?: () => void;
  centered?: boolean;
}) {
  const keyboardHeight = useKeyboardHeight();
  const { scrimStyle, sheetStyle: flutuanteStyle } = useSheetFlutuante();
  const painelRef = useRef<View>(null);
  useModalAccessibility(painelRef, true, onClose);

  return (
    <Pressable style={[styles.scrim, centered && styles.scrimCentered, scrimStyle]} onPress={onClose} accessible={false}>
      {/* onPress vazio: por ser um Pressable aninhado, ele assume o toque
          antes que chegue ao fundo, então tocar dentro do painel nunca fecha
          a folha — só o fundo escurecido em volta dele fecha. */}
      <Pressable
        ref={painelRef}
        style={[styles.sheet, centered && styles.sheetCentered, { maxHeight: '92%' }, flutuanteStyle, sheetStyle]}
        onPress={() => {}}
        accessibilityViewIsModal
        importantForAccessibility="yes"
        role="dialog"
        focusable
      >
        {/* Não há alcinha de arrastar. Ela é vocabulário de folha puxada pela
            borda de baixo, e desde 12/09/2026 toda janela do app flutua no
            centro, em qualquer largura: a alcinha passaria a prometer um gesto
            que não existe. */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            /* Nada de `insets.bottom` aqui. Ele existia porque a folha
               encostava na borda de baixo e o rodapé de ação ficava sob a
               barra do Android, reportado como "os botões ficam em cima da
               barra, preciso arrastar pra ver". A janela flutuante nunca
               encosta, então somar aquela faixa dentro do painel só criaria um
               vão morto no rodapé — o outro lado da mesma queixa, "esse espaço
               não deveria existir". Com o teclado aberto, a folga é a altura
               dele mais um respiro, para o último campo subir acima do teclado. */
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 36 : spacing.lg },
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
  scrimCentered: { justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  sheet: {
    backgroundColor: theme.paperRaised,
    borderTopLeftRadius: Platform.OS === 'android' ? 28 : radius.xl,
    borderTopRightRadius: Platform.OS === 'android' ? 28 : radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    width: '100%',
    ...(Platform.OS === 'android' ? { elevation: 8 } : null),
  },
  sheetCentered: {
    maxWidth: 520,
    borderRadius: radius.xl,
  },
  scroll: { flexShrink: 1 },
  content: { gap: spacing.md },
});


