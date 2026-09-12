import { Modal, Platform, type ModalProps } from 'react-native';
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
export default function AppModal({ animationType = 'fade', hardwareAccelerated, ...props }: ModalProps) {
  const reduzirMovimento = useReducedMotion();

  return (
    <Modal
      {...props}
      animationType={reduzirMovimento ? 'none' : animationType}
      hardwareAccelerated={hardwareAccelerated ?? Platform.OS === 'android'}
    />
  );
}
