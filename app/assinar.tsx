import { useState } from 'react';
import * as Linking from 'expo-linking';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEntitlement } from '@/lib/entitlement-context';
import { fonts, radius, spacing, theme } from '@/lib/theme';
import { useFlags } from '@/lib/feature-flags';

const checkoutConfigurado = process.env.EXPO_PUBLIC_KIWIFY_CHECKOUT_URL;
const destinoCompra = checkoutConfigurado?.startsWith('https://')
  ? checkoutConfigurado
  : 'https://granaponto.com.br/#precos';

export default function AssinarScreen() {
  const { ligado } = useFlags();
  const { estado, recarregar } = useEntitlement();
  const [verificando, setVerificando] = useState(false);

  async function verificar() {
    setVerificando(true);
    try {
      await recarregar();
    } finally {
      setVerificando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>GRANA. COMPLETO</Text>
        <Text style={styles.title}>Seu controle financeiro continua por R$ 9,90/mês.</Text>
        <Text style={styles.body}>
          A assinatura libera lançamentos, contas, cartões, metas e o assistente pelo WhatsApp. Sem conectar sua conta bancária.
        </Text>
        {estado?.status === 'past_due' && (
          <Text style={styles.notice}>O pagamento está pendente. Atualize a cobrança para manter o acesso.</Text>
        )}
        {/* Desabilitado, não escondido: sumir com o botão de compra numa tela
            de assinatura deixaria a pessoa sem entender o que fazer ali. O
            rótulo passa a dizer o motivo — dinheiro entra por este caminho, e
            mandar alguém para um checkout instável é pior que fazê-lo esperar. */}
        <Pressable
          accessibilityRole="button"
          disabled={!ligado('assinatura_checkout')}
          accessibilityState={{ disabled: !ligado('assinatura_checkout') }}
          onPress={() => Linking.openURL(destinoCompra)}
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.pressed,
            !ligado('assinatura_checkout') && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.primaryText}>
            {ligado('assinatura_checkout') ? 'Assinar o Grana.' : 'Pagamento indisponível no momento'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={verificar}
          disabled={verificando}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          {verificando ? (
            <ActivityIndicator color={theme.ink} />
          ) : (
            <Text style={styles.secondaryText}>Já paguei — verificar acesso</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: theme.paper,
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    backgroundColor: theme.paperRaised,
    padding: spacing.xxl,
  },
  eyebrow: {
    color: theme.accent2,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  title: {
    color: theme.ink,
    fontFamily: fonts.regular,
    fontSize: 28,
    lineHeight: 35,
    textAlign: 'center',
  },
  body: {
    color: theme.inkSoft,
    fontFamily: fonts.light,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  notice: {
    color: theme.danger,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: theme.accent2,
    paddingHorizontal: spacing.xl,
  },
  primaryText: {
    color: theme.paper,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  secondary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    paddingHorizontal: spacing.xl,
  },
  secondaryText: {
    color: theme.ink,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  pressed: { opacity: 0.72 },
});
