import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AppPressable from '@/components/AppPressable';
import { useSession } from '@/lib/auth-context';
import { fonts, spacing, theme, type } from '@/lib/theme';

/** Sem `PASSWORD_RECOVERY` até aqui, o link venceu, já foi usado ou foi
    aberto em outro navegador (o verifier do PKCE fica no que pediu). */
const PRAZO_RECUPERACAO_MS = 10_000;

/**
 * Volta do e-mail de recuperação de senha pedido no SITE (A6, 27/09/2026).
 * O `detectSessionInUrl` do Supabase troca o `?code=` sozinho e emite
 * `PASSWORD_RECOVERY` (lib/auth-context.tsx); esta tela só espera por isso e
 * leva a `nova-senha`. Se não vier, diz o que houve em vez de girar para
 * sempre.
 */
export default function RecuperarSenhaWebScreen() {
  const { session, emRecuperacao } = useSession();
  const router = useRouter();
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (session && emRecuperacao) router.replace('/nova-senha');
  }, [session, emRecuperacao, router]);

  useEffect(() => {
    const prazo = setTimeout(() => setFalhou(true), PRAZO_RECUPERACAO_MS);
    return () => clearTimeout(prazo);
  }, []);

  if (falhou && !(session && emRecuperacao)) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>
          Não consegui abrir este link de recuperação. Ele pode ter vencido ou já ter sido usado. Peça um novo e-mail e abra o link neste mesmo navegador.
        </Text>
        <AppPressable style={styles.botao} onPress={() => router.replace('/sign-in')}>
          <Text style={styles.botaoTexto}>Voltar para entrar</Text>
        </AppPressable>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="Abrindo a recuperação de senha">
      <ActivityIndicator color={theme.ink} />
      <Text style={styles.text}>Abrindo a recuperação de senha…</Text>
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
    maxWidth: 420,
  },
  botao: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  botaoTexto: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
});
