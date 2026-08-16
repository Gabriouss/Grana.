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
import { useSession } from '@/lib/auth-context';
import { theme, spacing, radius } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';

export default function SignUp() {
  const { signUp } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  async function handleSignUp() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não são iguais.');
      return;
    }
    setLoading(true);
    const { error: signUpError, needsEmailConfirmation } = await signUp(email.trim(), password);
    setLoading(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    if (needsEmailConfirmation) {
      // sem sessão retornada: precisa confirmar o e-mail antes de logar.
      setConfirmationSentTo(email.trim());
    }
    // se não precisar de confirmação, a sessão já foi criada — o listener
    // em SessionProvider detecta e o Stack.Protected leva pro app sozinho.
  }

  if (confirmationSentTo) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>quase lá</Text>
          <Text style={styles.title}>Confirme seu e-mail</Text>
          <Text style={styles.subtitle}>
            Enviamos um link de confirmação para{' '}
            <Text style={{ color: theme.ink }}>{confirmationSentTo}</Text>. Abra o e-mail e toque no link para
            liberar o seu acesso — depois é só entrar com sua senha aqui no app.
          </Text>
          <AppPressable
            style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
            onPress={() => router.push('/sign-in')}
          >
            <Text style={styles.primaryBtnText}>Voltar para o login</Text>
          </AppPressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.eyebrow}>bem-vinda ao Grana.</Text>
        <Text style={styles.title}>Criar conta</Text>
        <Text style={styles.subtitle}>Seus lançamentos ficam salvos na nuvem e sincronizados entre aparelhos.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
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
          <TextInput
            style={styles.input}
            placeholder="mínimo 6 caracteres"
            placeholderTextColor={theme.inkFaint}
            secureTextEntry
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirmar senha</Text>
          <TextInput
            style={styles.input}
            placeholder="digite a senha de novo"
            placeholderTextColor={theme.inkFaint}
            secureTextEntry
            autoComplete="password-new"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <AppPressable
          style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.primaryBtnText}>Criar conta</Text>}
        </AppPressable>

        <AppPressable
          style={({ hovered }) => [styles.secondaryBtn, hovered && styles.secondaryBtnHover]}
          onPress={() => router.push('/sign-in')}
        >
          <Text style={styles.secondaryBtnText}>Já tem conta? Entrar</Text>
        </AppPressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  eyebrow: { color: theme.inkFaint, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: theme.ink, fontSize: 34, fontWeight: '400', marginTop: spacing.xs, marginBottom: spacing.sm },
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
  primaryBtnText: { color: theme.paper, fontSize: 15, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs, borderRadius: radius.md },
  secondaryBtnHover: { backgroundColor: theme.paperRaised },
  secondaryBtnText: { color: theme.inkSoft, fontSize: 14 },
});
