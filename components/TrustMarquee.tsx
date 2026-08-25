import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { theme, spacing, fonts, type } from '@/lib/theme';

type Props = { itens: string[] };

/* px por milissegundo — bem lento, é textura de fundo, não algo pra ler
   correndo. Numa faixa de ~1600px de conteúdo isso dá uns 40s por volta. */
const VELOCIDADE = 0.04;

/**
 * Faixa de texto rolando horizontalmente, em loop contínuo — mesma ideia das
 * faixas de confiança em landing pages de evento (Agent Lab, Human Academy)
 * que o autor apontou como referência. Usa `Animated` (não CSS @keyframes):
 * mede a largura de UMA cópia do conteúdo via onLayout, anima um
 * `translateX` de 0 até `-largura` em loop — quando a segunda cópia
 * (idêntica, colada) chega exatamente onde a primeira começou, o reset pra 0
 * é imperceptível. Mesmo padrão de "medir depois animar" já usado em
 * HomeTourOverlay/WidgetGrid, e mesma disciplina de `useNativeDriver: true`
 * (só transform) que o resto da página já segue.
 */
export default function TrustMarquee({ itens }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(false);
  const [larguraConteudo, setLarguraConteudo] = useState(0);
  const deslocamento = useRef(new Animated.Value(0)).current;
  const animacaoRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => ativo && setReduzirMovimento(v))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (reduzirMovimento || larguraConteudo === 0) return;
    deslocamento.setValue(0);
    animacaoRef.current = Animated.loop(
      Animated.timing(deslocamento, {
        toValue: -larguraConteudo,
        duration: larguraConteudo / VELOCIDADE,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animacaoRef.current.start();
    return () => animacaoRef.current?.stop();
  }, [reduzirMovimento, larguraConteudo, deslocamento]);

  const texto = itens.join('   ·   ');

  // Reduced motion: uma cópia só, parada — nunca deixar a faixa duplicada
  // congelada, que pareceria bug (texto repetido sem razão aparente).
  if (reduzirMovimento) {
    return (
      <View style={styles.faixa}>
        <Text style={styles.texto} numberOfLines={1}>
          {texto}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.faixa}>
      <Animated.View style={[styles.trilho, { transform: [{ translateX: deslocamento }] }]}>
        <Text
          style={styles.texto}
          numberOfLines={1}
          onLayout={(e) => setLarguraConteudo(e.nativeEvent.layout.width + 48)}
        >
          {texto}
        </Text>
        <Text style={styles.texto} numberOfLines={1} aria-hidden>
          {texto}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    backgroundColor: theme.paperRaised,
    paddingVertical: spacing.md,
    overflow: 'hidden',
  },
  // `flexShrink: 0` nos dois — sem isso, numa tela mais estreita que o
  // texto inteiro, o flexbox encolhia a segunda cópia (e até a primeira)
  // pra caber na viewport, cortando o texto com reticências no meio da
  // frase em vez de deixar o trilho mais largo que a tela (que é o ponto:
  // ele desliza por baixo via translateX).
  trilho: { flexDirection: 'row', flexShrink: 0 },
  texto: {
    flexShrink: 0,
    color: theme.inkSoft,
    fontSize: type.legenda,
    fontFamily: fonts.light,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 48,
  },
});
