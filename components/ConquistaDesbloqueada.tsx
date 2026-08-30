import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { useReducedMotion } from '@/lib/motion';
import AppPressable from './AppPressable';

/**
 * O momento em que uma conquista é entregue.
 *
 * Antes disto não existia momento nenhum: a medalha simplesmente passava a
 * aparecer acesa se a pessoa voltasse à aba de Desafios e reparasse. Esforço
 * que não é reconhecido na hora não reforça hábito; o laço ficava esforço →
 * silêncio → talvez.
 *
 * ── Por que é discreto ────────────────────────────────────────────────────
 *
 * O DESIGN.md fecha a porta para a saída óbvia: "sem confete, sem selo, sem
 * urgência fabricada", e "confiança aqui vem de consistência silenciosa, não
 * de efeito". Então o reconhecimento é um cartão que entra por cima, diz o
 * nome do que foi conquistado e sai quando a pessoa quiser. A cor de destaque
 * aparece uma vez, no ícone, que é o papel que a menta tem no sistema.
 *
 * O ícone é desenhado (Ionicons), não o emoji que o catálogo de medalhas
 * ainda carrega: emoji como sistema de ícones é justamente o que o design
 * system pede para evitar.
 */
export default function ConquistaDesbloqueada({
  titulo,
  descricao,
  onFechar,
}: {
  titulo: string;
  descricao: string;
  onFechar: () => void;
}) {
  const entrada = useRef(new Animated.Value(0)).current;
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    if (reduzirMovimento) {
      entrada.setValue(1);
      return;
    }
    Animated.spring(entrada, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
  }, [entrada, reduzirMovimento]);

  /* No nativo o cartão é desenho, e desenho não é lido: o anúncio é explícito.
     Na web quem faz o trabalho é o `role="status"` do próprio cartão. */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.announceForAccessibility(`Conquista desbloqueada: ${titulo}. ${descricao}`);
  }, [titulo, descricao]);

  return (
    <Animated.View
      role="status"
      accessibilityLiveRegion="polite"
      style={[
        styles.cartao,
        {
          opacity: entrada,
          transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
        },
      ]}
    >
      <View style={styles.medalha}>
        <Ionicons name="ribbon-outline" size={20} color={theme.accent2} />
      </View>
      <View style={styles.texto}>
        <Text style={styles.rotulo}>Conquista desbloqueada</Text>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.descricao}>{descricao}</Text>
      </View>
      <AppPressable
        onPress={onFechar}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Fechar aviso de conquista"
        style={styles.fechar}
      >
        <Ionicons name="close" size={18} color={theme.inkFaint} />
      </AppPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...({ boxShadow: '0 10px 28px -12px rgba(0,0,0,0.55)' } as any),
  },
  medalha: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(174,255,227,0.10)',
  },
  texto: { flex: 1, gap: 2 },
  rotulo: {
    color: theme.accent2,
    fontSize: type.legenda,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: fonts.light,
  },
  titulo: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  descricao: {
    color: theme.inkSoft,
    fontSize: type.nota,
    lineHeight: lh(type.nota, 'apoio'),
    fontFamily: fonts.light,
  },
  fechar: { padding: 2 },
});
