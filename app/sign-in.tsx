import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/auth-context';
import { theme, spacing, radius } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import BrandLogo from '@/components/BrandLogo';
import PasswordInput from '@/components/PasswordInput';
import { LIMITS } from '@/lib/limits';

export default function SignIn() {
  const { signIn } = useSession();
  const router = useRouter();
  /* O conteúdo é centralizado, mas num aparelho baixo (ou com o teclado
     aberto) ele encosta nas bordas — o inset garante o respiro mínimo. */
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setLoading(false);
    if (signInError) setError(signInError);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.eyebrow}>bem-vinda de volta</Text>
        <BrandLogo size={42} style={styles.title} />
        <Text style={styles.subtitle}>Entre com sua conta para sincronizar seus lançamentos entre aparelhos.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput maxLength={LIMITS.email}
            style={styles.input}
            placeholder="voce@exemplo.com"
            placeholderTextColor={theme.inkFaint}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Senha</Text>
          <PasswordInput
            maxLength={LIMITS.password}
            placeholder="••••••••"
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <AppPressable
          style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.primaryBtnText}>Entrar</Text>}
        </AppPressable>

        <AppPressable
          style={({ hovered }) => [styles.secondaryBtn, hovered && styles.secondaryBtnHover]}
          onPress={() => router.push('/sign-up')}
        >
          <Text style={styles.secondaryBtnText}>Não tem conta? Criar conta</Text>
        </AppPressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  eyebrow: { color: theme.inkFaint, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  // Cor, tamanho e família vêm do BrandLogo — aqui fica só o encaixe no layout.
  title: { marginTop: spacing.xs, marginBottom: spacing.sm },
  subtitle: { color: theme.inkSoft, fontSize: 15, lineHeight: 21, marginBottom: spacing.xxl },
  field: { marginBottom: spacing.lg },
  label: { color: theme.inkFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.ink,
    backgroundColor: theme.paperRaised,
  },
  errorText: { color: '#e08a7d', fontSize: 13, marginBottom: spacing.sm, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnHover: { opacity: 0.88 },
  primaryBtnText: { color: theme.paper, fontSize: 14, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs, borderRadius: radius.md },
  secondaryBtnHover: { backgroundColor: theme.paperRaised },
  secondaryBtnText: { color: theme.inkSoft, fontSize: 14 },
});
