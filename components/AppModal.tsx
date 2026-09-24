import type { ReactNode } from 'react';
import { Modal, Platform, type ModalProps } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/lib/motion';

/**
 * Único ponto de entrada para modais animados do produto. A preferência de
 * acessibilidade do sistema sempre vence a animação solicitada pela tela.
 *
 * **A entrada padrão é `fade`, e nenhuma janela precisa pedir a sua.** Antes
 * cada tela escolhia, e dezessete delas pediam `slide` — a animação de folha
 * que sobe da borda de baixo. Desde 12/09/2026 as janelas de ação flutuam
 * centralizadas (ver `useSheetFlutuante`), e subir a partir de uma borda que a
 * janela nunca toca contradiz a própria forma dela: a janela aparecia vindo de
 * um lugar onde não estava. Com o padrão aqui, todas entram igual, e uma tela
 * só passa `animationType` quando de fato quiser divergir.
 */
export default function AppModal({
  animationType = 'fade',
  hardwareAccelerated,
  navigationBarTranslucent,
  statusBarTranslucent,
  children,
  ...props
}: ModalProps) {
  const reduzirMovimento = useReducedMotion();

  return (
    <Modal
      {...props}
      animationType={reduzirMovimento ? 'none' : animationType}
      hardwareAccelerated={hardwareAccelerated ?? Platform.OS === 'android'}
      navigationBarTranslucent={navigationBarTranslucent ?? Platform.OS === 'android'}
      statusBarTranslucent={statusBarTranslucent ?? Platform.OS === 'android'}
    >
      {/* Modal abre uma janela nativa própria. O provider da tela de baixo
          mede outra janela, e nele o topo vinha zero no Android: folhas,
          diagnóstico e câmera entravam sob a barra de status (T7, S9, S40,
          T16). Este provider mede a janela do modal.

          Só mede, não recua. Recuar aqui (um SafeAreaView em volta de tudo)
          deixava a faixa das barras com o fundo branco da janela nativa no
          modal de tela cheia e tirava a barra de status de baixo do fundo
          escurecido das folhas (T19). Quem pinta a borda recua o próprio
          conteúdo: `Sheet` pelo `useSheetFlutuante`, e as telas cheias por
          `InsetsDoModal`. */}
      <SafeAreaProvider>{children}</SafeAreaProvider>
    </Modal>
  );
}

/**
 * Recuos das barras do sistema medidos na janela do modal. Para telas cheias
 * que chamam o `useSafeAreaInsets` fora do `AppModal` e por isso leriam a
 * janela de baixo: o valor só é certo quando lido aqui dentro.
 */
export function InsetsDoModal({ children }: { children: (insets: EdgeInsets) => ReactNode }) {
  return <>{children(useSafeAreaInsets())}</>;
}
