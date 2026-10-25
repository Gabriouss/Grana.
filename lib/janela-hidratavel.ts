import { useSyncExternalStore } from 'react';
import { Dimensions, Platform, useWindowDimensions, type ScaledSize } from 'react-native';

/**
 * Medidas da janela que não quebram a hidratação da landing na web (A3 da
 * auditoria Leis de UI, 24/10/2026).
 *
 * O HTML de `/` sai do servidor com a landing desenhada, para o topo aparecer
 * antes de o JavaScript chegar. No servidor o `Dimensions` do
 * react-native-web vale 0x0; no navegador, o primeiro desenho já leria a
 * largura real. No React 19 uma divergência só de atributo (um `style` com
 * largura) não é corrigida na hidratação e fica errada na tela. Por isso, na
 * hidratação, estes hooks devolvem a MESMA medida do servidor, e logo depois
 * a real: é o contrato do `getServerSnapshot` do `useSyncExternalStore`, que
 * o React usa no servidor e durante a hidratação, e só nela. Num desenho que
 * não é hidratação (navegar para outra rota, a área logada), a medida real
 * vem já no primeiro quadro.
 *
 * A medida do servidor é um celular de 390x844, o aparelho de quem chega pelo
 * anúncio: para ele a troca depois da hidratação não muda nada. Em tela larga
 * a landing nasce escondida até a hidratação (script em `app/+html.tsx`), para
 * a troca de layout não aparecer.
 *
 * No nativo não há hidratação: é o `useWindowDimensions` de sempre.
 */
export const JANELA_DO_SERVIDOR: ScaledSize = { width: 390, height: 844, scale: 1, fontScale: 1 };

function assinarJanela(aviso: () => void) {
  const assinatura = Dimensions.addEventListener('change', aviso);
  return () => assinatura?.remove();
}

const janelaAtual = () => Dimensions.get('window');
const janelaDoServidor = () => JANELA_DO_SERVIDOR;

function useJanelaWeb(): ScaledSize {
  return useSyncExternalStore(assinarJanela, janelaAtual, janelaDoServidor);
}

/** Troca direta do `useWindowDimensions` para quem desenha na landing. */
export const useJanela: () => ScaledSize = Platform.OS === 'web' ? useJanelaWeb : useWindowDimensions;

/**
 * `matchMedia` com o mesmo contrato: `false` no servidor e na hidratação, o
 * valor real em qualquer outro desenho. Sem isso, `useState(() =>
 * matchMedia(...).matches)` nascia `true` no navegador de quem pede menos
 * movimento e divergia do HTML.
 */
export function useMidia(consulta: string): boolean {
  return useSyncExternalStore(
    (aviso) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const media = window.matchMedia(consulta);
      media.addEventListener?.('change', aviso);
      return () => media.removeEventListener?.('change', aviso);
    },
    () => typeof window !== 'undefined' && window.matchMedia?.(consulta).matches === true,
    () => false
  );
}
