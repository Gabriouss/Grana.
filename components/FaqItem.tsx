import { useId, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, fonts, type } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import { EASE_REVEAL, useReducedMotion } from '@/lib/motion';

type Props = {
  pergunta: string;
  resposta: string;
  estiloExtra?: object;
  abertoInicial?: boolean;
};

/** Uma linha de FAQ que abre sozinha — mantém a página de entrada curta pra quem só quer ler o essencial. */
export function FaqItem({ pergunta, resposta, estiloExtra, abertoInicial = false }: Props) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [alturaConteudo, setAlturaConteudo] = useState<number | null>(null);
  const medido = useRef(false);
  const reduzirMovimento = useReducedMotion();
  const respostaId = `faq-resposta-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Mede a altura real do conteúdo uma vez — é o que permite animar até um
  // valor exato em vez de um teto arbitrário tipo `maxHeight: 999`, que
  // faria uma resposta de duas linhas percorrer a mesma "distância" de
  // tempo que uma de dez.
  const aoMedirConteudo = (evento: LayoutChangeEvent) => {
    if (medido.current) return;
    medido.current = true;
    setAlturaConteudo(evento.nativeEvent.layout.height);
  };

  const estiloAnimado = reduzirMovimento
    ? { height: aberto ? alturaConteudo ?? undefined : 0, opacity: aberto ? 1 : 0, overflow: 'hidden' as const }
    : ({
        height: aberto ? alturaConteudo ?? undefined : 0,
        opacity: aberto ? 1 : 0,
        overflow: 'hidden',
        transitionProperty: 'height, opacity',
        transitionDuration: '220ms',
        transitionTimingFunction: EASE_REVEAL,
      } as any);

  return (
    <View style={[styles.linha, estiloExtra]}>
      <AppPressable
        style={({ hovered }) => [styles.cabecalho, hovered && styles.cabecalhoHover]}
        onPress={() => setAberto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberto }}
        aria-expanded={aberto}
        aria-controls={respostaId}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      >
        <Text style={styles.pergunta}>{pergunta}</Text>
        <View style={styles.iconeWrapper} aria-hidden>
          <View
            style={
              reduzirMovimento
                ? undefined
                : ({
                    transform: [{ rotate: aberto ? '45deg' : '0deg' }],
                    transitionProperty: 'transform',
                    transitionDuration: '160ms',
                    transitionTimingFunction: EASE_REVEAL,
                  } as any)
            }
          >
            <Ionicons name="add" size={18} color={aberto ? theme.accent2 : theme.inkSoft} />
          </View>
        </View>
      </AppPressable>
      {/* Sempre montado (não `{aberto && ...}`): é o que permite animar
          altura/opacidade, e corrige de graça uma referência `aria-controls`
          que antes apontava pra um `nativeID` inexistente enquanto fechado. */}
      <View
        nativeID={respostaId}
        role="region"
        accessibilityLabel={`Resposta: ${pergunta}`}
        aria-hidden={!aberto}
        style={estiloAnimado}
      >
        <View onLayout={aoMedirConteudo} style={styles.respostaMedidor}>
          <Text style={styles.resposta}>{resposta}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { borderBottomWidth: 1, borderBottomColor: theme.rule, paddingVertical: spacing.md },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.md,
    ...({ cursor: 'pointer', transition: 'opacity 150ms ease' } as any),
  },
  cabecalhoHover: { opacity: 0.85 },
  iconeWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.hover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pergunta: { flex: 1, color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  // `position: absolute` faz o medidor não empurrar layout enquanto o pai
  // está com `height: 0` durante o fechamento — sem isso, a View interna
  // (sempre montada, pro `onLayout` medir) somaria sua altura real por
  // baixo do pai colapsado por um quadro, antes do `overflow: hidden` do
  // pai cortar a exibição.
  respostaMedidor: { position: 'absolute', top: 0, left: 0, right: 0 },
  resposta: {
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: 21,
    fontFamily: fonts.light,
    marginTop: spacing.md,
    paddingRight: spacing.sm,
  },
});
