import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AppPressable from '@/components/AppPressable';
import { useSession } from '@/lib/auth-context';
import { fonts, spacing, theme, type } from '@/lib/theme';

const PRAZO_CALLBACK_MS = 10_000;

export default function AuthCallbackScreen() {
  const { session, emRecuperacao } = useSession();
  const router = useRouter();
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (session) router.replace(emRecuperacao ? '/nova-senha' : '/');
  }, [session, emRecuperacao, router]);

  useEffect(() => {
    const prazo = setTimeout(() => setFalhou(true), PRAZO_CALLBACK_MS);
    return () => clearTimeout(prazo);
  }, []);

  if (falhou && !session) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Não conseguimos confirmar seu acesso por este link. Volte para entrar ou peça um novo e-mail.</Text>
        <AppPressable style={styles.botao} onPress={() => router.replace('/sign-in')}>
          <Text style={styles.botaoTexto}>Voltar para entrar</Text>
        </AppPressable>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="Confirmando acesso">
      <ActivityIndicator color={theme.ink} />
      <Text style={styles.text}>Confirmando seu acesso…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: theme.paper,
    padding: 24,
  },
  text: {
    color: theme.ink,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  botao: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  botaoTexto: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
});
