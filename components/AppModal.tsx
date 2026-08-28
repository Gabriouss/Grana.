import { Modal, Platform, type ModalProps } from 'react-native';
import { useReducedMotion } from '@/lib/motion';

/**
 * Único ponto de entrada para modais animados do produto. A preferência de
 * acessibilidade do sistema sempre vence a animação solicitada pela tela.
 */
export default function AppModal({ animationType = 'none', hardwareAccelerated, ...props }: ModalProps) {
  const reduzirMovimento = useReducedMotion();

  return (
    <Modal
      {...props}
      animationType={reduzirMovimento ? 'none' : animationType}
      hardwareAccelerated={hardwareAccelerated ?? Platform.OS === 'android'}
    />
  );
}
