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
import { useKeyboardHeight } from '@/lib/teclado';

/* Reexportado por compatibilidade: a medição mudou de casa para `lib/teclado`,
   onde a regra de tamanho das janelas também consegue usá-la, e vários modais
   ainda a importam daqui. */
export { useKeyboardHeight };

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
 * **O teclado não é problema desta camada.** Quem garante que a janela caiba
 * acima dele, em qualquer aparelho, é `useSheetFlutuante`: ela mede a faixa
 * ainda visível e devolve o teto de altura e o recuo que recentram o painel
 * ali. Aqui só sobra rolar o conteúdo quando ele não couber nesse teto.
 */
export default function Sheet({
  children,
  contentStyle,
  sheetStyle,
  onClose,
  centered = false,
  keyboardShouldPersistTaps = 'handled',
  conteudoFixo = false,
}: {
  children: ReactNode;
  /** Estilo do container interno do conteúdo (o padrão já aplica o espaçamento entre campos). */
  contentStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  /** Toca no fundo escurecido, fora do painel, para fechar — como em qualquer
      modal. Também é usado pelo Escape na web. */
  onClose: () => void;
  centered?: boolean;
  keyboardShouldPersistTaps?: 'handled' | 'always';
  /** Padrão `false`: o conteúdo todo rola dentro do painel, como sempre foi.
      Com `true` o painel não rola: o conteúdo ocupa a altura que couber e quem
      precisa rolar leva a PRÓPRIA rolagem dentro dele (uma lista), deixando o
      que está antes e depois dela fixo. Só a "Personalizar Início" usa. */
  conteudoFixo?: boolean;
}) {
  const { aoMedirFundo, scrimStyle, sheetStyle: flutuanteStyle } = useSheetFlutuante();
  const painelRef = useRef<View>(null);
  useModalAccessibility(painelRef, true, onClose);

  return (
    <View style={[styles.scrim, centered && styles.scrimCentered, scrimStyle]} onLayout={aoMedirFundo}>
      {/* O Pressable de fechar é IRMÃO do painel, atrás dele, e não ancestral.
          Como ancestral (com um `onPress` vazio no painel para segurar o
          toque), qualquer toque em área comum do painel fazia o `Pressable`
          virar o responder de JS, e no Android o nativo passa a interceptar o
          gesto nessa view antes de ele chegar às `ScrollView`: a lista só
          rolava se o dedo começasse em cima de algo tocável. Sendo irmão,
          tocar dentro do painel não chega ao fundo e nada acima da rolagem
          reivindica o toque. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
      />
      <View
        ref={painelRef}
        style={[styles.sheet, centered && styles.sheetCentered, flutuanteStyle, sheetStyle, { maxHeight: flutuanteStyle.maxHeight }]}
        accessibilityViewIsModal
        importantForAccessibility="yes"
        role="dialog"
        focusable
      >
        {/* Não há alcinha de arrastar. Ela é vocabulário de folha puxada pela
            borda de baixo, e desde 12/09/2026 toda janela do app flutua no
            centro, em qualquer largura: a alcinha passaria a prometer um gesto
            que não existe. */}
        {conteudoFixo ? (
          <View style={[styles.scroll, styles.content, { paddingBottom: spacing.lg }, contentStyle]}>
            {children}
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              /* Nenhuma conta de teclado aqui, e nenhum `insets.bottom`.
                 A janela inteira já é dimensionada e posicionada acima do teclado
                 por `useSheetFlutuante`, então crescer o conteúdo pela altura
                 dele seria compensar duas vezes: o painel ficava mais alto
                 justamente quando a tela disponível encolheu. */
              { paddingBottom: spacing.lg },
              contentStyle,
            ]}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        )}
      </View>
    </View>
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


