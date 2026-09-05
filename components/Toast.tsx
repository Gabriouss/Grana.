import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text } from 'react-native';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { useTabBarInset } from '@/lib/tab-bar';
import { UI_OUT, useReducedMotion } from '@/lib/motion';

/* Tempo de LEITURA da mensagem, separado das durações de animação de
   propósito: encurtar a animação é ganho de fluidez, encurtar a leitura é
   perda de acessibilidade. O plano 003 é explícito em manter 2s aqui. */
const DURACAO_LEITURA = 2000;
/* 8dp em vez dos 20 anteriores: deslocamento curto lê como confirmação, não
   como um objeto viajando pela tela. */
const DESLOCAMENTO = 8;
const ENTRADA = Easing.bezier(...UI_OUT);

export default function Toast({
  message,
  visible,
  onHide,
}: {
  message: string;
  visible: boolean;
  onHide: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(DESLOCAMENTO)).current;
  const { total: tabBarTotal } = useTabBarInset();
  const reduzirMovimento = useReducedMotion();

  /* O toast some sozinho em 2 segundos. Sem anúncio, confirmações de
     sincronização, salvamento e alteração passavam despercebidas por quem usa
     leitor de tela: o `Animated.View` não tinha região viva, papel de status
     nem chamada de anúncio.
     Na web quem faz o trabalho é o `role="status"` da própria caixa, abaixo.
     No nativo o anúncio é explícito, porque o componente é desmontado e
     remontado a cada mensagem e a região viva nem sempre é relida. */
  useEffect(() => {
    if (!visible || !message || Platform.OS === 'web') return;
    AccessibilityInfo.announceForAccessibility(message);
  }, [visible, message]);

  /* `onHide` mora numa ref, e NÃO nas dependências do efeito abaixo.
     As cinco telas que usam Toast passam uma arrow inline
     (`onHide={() => setToastVisible(false)}`), então a função troca de
     identidade a cada render do pai. Com ela nas dependências, o efeito
     reiniciava — e com ele o timer de 2s. Na prática: uma tela que
     re-renderizasse durante a exibição segurava o toast na tela por tempo
     indeterminado. A ref mantém o callback sempre atual sem reiniciar nada. */
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  }, [onHide]);

  /* Identidade da exibição atual. É o que permite ao callback de saída
     descobrir que ele ficou obsoleto: se uma mensagem nova aparece enquanto a
     anterior ainda está saindo, o `.start()` da saída antiga continua vivo e
     chamaria `onHide()` — fechando a mensagem NOVA. Comparar a geração no
     momento do callback resolve, e `finished` cobre o caso de a animação ter
     sido interrompida em vez de concluída. */
  const geracao = useRef(0);

  useEffect(() => {
    if (!visible) return;

    geracao.current += 1;
    const minhaGeracao = geracao.current;
    const encerrar = (finished: boolean) => {
      if (!finished || geracao.current !== minhaGeracao) return;
      onHideRef.current();
    };

    if (reduzirMovimento) {
      opacity.setValue(1);
      translateY.setValue(0);
      const timer = setTimeout(() => encerrar(true), DURACAO_LEITURA);
      return () => clearTimeout(timer);
    }

    /* Sem `setValue(0)` antes de entrar: se a saída anterior estava em curso,
       zerar aqui faria a mensagem nova saltar pro início em vez de retomar do
       ponto em que a tela está. A entrada parte do valor atual. */
    const entrada = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, easing: ENTRADA, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 160, easing: ENTRADA, useNativeDriver: true }),
    ]);
    entrada.start();

    let saida: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      saida = Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 125, easing: ENTRADA, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: DESLOCAMENTO, duration: 125, easing: ENTRADA, useNativeDriver: true }),
      ]);
      saida.start(({ finished }) => encerrar(finished));
    }, DURACAO_LEITURA);

    /* Parar as animações, não só o timer: sem isto a saída seguia correndo
       depois do componente sumir ou de a mensagem trocar. */
    return () => {
      clearTimeout(timer);
      entrada.stop();
      saida?.stop();
    };
  }, [opacity, reduzirMovimento, translateY, visible, message]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          bottom: tabBarTotal + spacing.sm,
          opacity,
          transform: [{ translateY }],
          pointerEvents: 'none',
        },
      ]}
      role="status"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    /* `bottom` vem do useTabBarInset() no JSX: com 90 fixo o toast aparecia
       por cima da barra flutuante (que começa a ~98px do fundo). */
    alignSelf: 'center',
    backgroundColor: theme.ink,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    zIndex: 99,
    ...({ boxShadow: '0 4px 10px rgba(0,0,0,0.25)' } as any),
  },
  toastText: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
});
