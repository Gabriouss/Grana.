import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';

/**
 * O momento de assinatura da landing page: a transformação real que o Grana.
 * faz, ao vivo, em loop — em vez de um print estático ou um ícone genérico
 * de "app de finanças". É literalmente o que acontece quando alguém fala ou
 * manda áudio no WhatsApp: a fala vira um lançamento organizado, sozinha.
 *
 * O valor "R$ 34,65" e a categoria "Alimentação" (cor #bb6b60) não são
 * arbitrários — são o mesmo exemplo usado pra depurar o parser de voz nesta
 * sessão (ver __tests__/corpus-whatsapp-gerado.ts) e a cor real da categoria
 * em lib/heuristics.ts. A demo mostra o produto de verdade, não uma promessa.
 */

const FALA = '"mercado, trinta e quatro e sessenta e cinco"';

export default function LandingHeroDemo() {
  const progresso = useRef(new Animated.Value(0)).current;
  const [reduzirMovimento, setReduzirMovimento] = useState(false);

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (ativo) setReduzirMovimento(v);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (reduzirMovimento) {
      // Preferência de acessibilidade respeitada: fica parado no quadro final
      // (o lançamento já organizado), sem o loop de transição.
      progresso.setValue(1);
      return;
    }
    const ciclo = Animated.sequence([
      Animated.delay(900),
      Animated.timing(progresso, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(progresso, { toValue: 0, duration: 400, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    const loop = Animated.loop(ciclo);
    loop.start();
    return () => loop.stop();
  }, [progresso, reduzirMovimento]);

  const falaOpacidade = progresso.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 0, 0] });
  const falaTranslado = progresso.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const cardOpacidade = progresso.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const cardEscala = progresso.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const checkEscala = progresso.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1] });

  return (
    <View style={styles.palco}>
      <Animated.View
        style={[styles.faixaFala, { opacity: falaOpacidade, transform: [{ translateY: falaTranslado }] }]}
      >
        <View style={styles.microIcone}>
          <Ionicons name="mic" size={16} color={theme.accent2} />
        </View>
        <Text style={styles.textoFala}>{FALA}</Text>
      </Animated.View>

      <Animated.View
        style={[styles.cardLancamento, { opacity: cardOpacidade, transform: [{ scale: cardEscala }] }]}
      >
        <View style={styles.cardLinha}>
          <View style={styles.categoriaPonto} />
          <View style={styles.cardTextos}>
            <Text style={styles.cardNome}>Mercado</Text>
            <Text style={styles.cardCategoria}>Alimentação</Text>
          </View>
          <Text style={styles.cardValor}>R$ 34,65</Text>
        </View>
        <Animated.View style={[styles.checkSelo, { transform: [{ scale: checkEscala }] }]}>
          <Ionicons name="checkmark" size={13} color={theme.paper} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  palco: {
    height: 96,
    justifyContent: 'center',
  },
  faixaFala: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  microIcone: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoFala: { color: theme.inkSoft, fontSize: type.corpo, fontFamily: fonts.light, flexShrink: 1 },
  cardLancamento: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardLinha: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Cor real da categoria "Alimentação" em CATEGORY_KEYWORDS (lib/heuristics.ts) — não inventada.
  categoriaPonto: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#bb6b60' },
  cardTextos: { flex: 1 },
  cardNome: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  cardCategoria: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginTop: 1 },
  cardValor: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  checkSelo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.accent2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
});
