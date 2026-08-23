import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';

/**
 * Revela a seção com um fade + leve subida quando ela entra na tela ao
 * rolar — só na web, com `IntersectionObserver` direto no DOM, no mesmo
 * padrão de `lib/foco-web.ts` (Platform.OS === 'web' + `typeof document`
 * antes de tocar em API de navegador). Não é GSAP/ScrollTrigger: são
 * bibliotecas de DOM puro, e esta tela é um componente React Native como
 * qualquer outro do app — importar uma delas quebraria a única linha de
 * animação que o projeto já usa (`Animated`, nativo do RN, sem dependência
 * nova) só para esta página. O EFEITO de "a rolagem conta a história" é o
 * que vale aproveitar; o mecanismo é o que já existe aqui dentro.
 *
 * No nativo (e se `prefers-reduced-motion` estiver ligado) o conteúdo
 * aparece direto, sem transição — a seção nunca fica invisível esperando
 * uma rolagem que não existe fora do navegador.
 */
export default function RevealOnScroll({ children }: PropsWithChildren) {
  const ref = useRef<View>(null);
  const [visivel, setVisivel] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }

    let cancelado = false;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduzir) => {
        if (cancelado) return;
        if (reduzir) {
          setVisivel(true);
          return;
        }
        // No RN Web, o `ref` de uma View encaminha para o nó DOM real por baixo.
        const no = ref.current as unknown as HTMLElement | null;
        if (!no) return;
        const observador = new IntersectionObserver(
          ([entrada]) => {
            if (entrada.isIntersecting) {
              setVisivel(true);
              observador.disconnect();
            }
          },
          { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );
        observador.observe(no);
        return () => observador.disconnect();
      })
      .catch(() => setVisivel(true));

    return () => {
      cancelado = true;
    };
  }, []);

  // Propriedades de transição CSS não existem no tipo ViewStyle do RN — só o
  // react-native-web as reconhece, no nativo (onde este componente nem monta
  // com efeito, dado o `visivel` inicial acima) seriam ignoradas de qualquer
  // forma. Mesmo padrão de `as any` já usado em WebPhoneFrame/_layout.tsx
  // para o mesmo tipo de propriedade exclusiva da web.
  const estiloWeb = {
    opacity: visivel ? 1 : 0,
    transform: [{ translateY: visivel ? 0 : 16 }],
    transitionProperty: 'opacity, transform',
    transitionDuration: '600ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  } as any;

  return (
    <View ref={ref} style={estiloWeb}>
      {children}
    </View>
  );
}
