import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Mantém as animações não essenciais alinhadas à preferência do sistema. */
export function useReducedMotion() {
  const [reduzir, setReduzir] = useState(false);

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((valor) => {
        if (ativo) setReduzir(valor);
      })
      .catch(() => {});

    const assinatura = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduzir);
    return () => {
      ativo = false;
      assinatura.remove();
    };
  }, []);

  return reduzir;
}
