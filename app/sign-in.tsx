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
import { theme, spacing, radius, fonts, type } from '@/lib/theme';
import { colunaFormulario } from '@/lib/breakpoints';
import type { ErroAuth } from '@/lib/auth-errors';
import AppPressable from '@/components/AppPressable';
import BrandLogo from '@/components/BrandLogo';
import RecuperarSenhaModal from '@/components/RecuperarSenhaModal';
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
  const [error, setError] = useState<ErroAuth | null>(null);
  const [recuperarAberto, setRecuperarAberto] = useState(false);

  async function handleSignIn() {
    setError(null);
    if (!email.trim() || !password) {
      setError({ mensagem: 'Preencha e-mail e senha.' });
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
      <View style={[styles.content, colunaFormulario, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.eyebrow}>Bem-vinda de volta</Text>
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

        {error && (
          <View style={styles.erroBloco}>
            <Text style={styles.errorText}>{error.mensagem}</Text>
            {/* A ação vem do próprio erro: quem tem senha errada precisa de
                recuperação, quem não confirmou precisa de outro e-mail. Um
                link fixo não serviria para os dois. */}
            {error.acao === 'recuperar-senha' && (
              <AppPressable onPress={() => setRecuperarAberto(true)} hitSlop={8}>
                <Text style={styles.erroAcao}>Esqueci minha senha</Text>
              </AppPressable>
            )}
          </View>
        )}

        <AppPressable
          style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.primaryBtnText}>Entrar</Text>}
        </AppPressable>

        {/* Sempre visível, e não só depois de um erro: quem já sabe que
            esqueceu a senha não deveria precisar errar uma vez para
            descobrir que a recuperação existe. */}
        <AppPressable onPress={() => setRecuperarAberto(true)} style={styles.esqueciBtn}>
          <Text style={styles.esqueciTexto}>Esqueci minha senha</Text>
        </AppPressable>

        <AppPressable
          style={({ hovered }) => [styles.secondaryBtn, hovered && styles.secondaryBtnHover]}
          onPress={() => router.push('/sign-up')}
        >
          <Text style={styles.secondaryBtnText}>Não tem conta? Criar conta</Text>
        </AppPressable>
      </View>

      <RecuperarSenhaModal
        visible={recuperarAberto}
        onClose={() => setRecuperarAberto(false)}
        emailInicial={email.trim()}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  eyebrow: { color: theme.inkFaint, fontSize: type.nota, letterSpacing: 1, fontFamily: fonts.light },
  // Cor, tamanho e família vêm do BrandLogo — aqui fica só o encaixe no layout.
  title: { marginTop: spacing.xs, marginBottom: spacing.sm },
  subtitle: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: 21, marginBottom: spacing.xxl, fontFamily: fonts.light },
  field: { marginBottom: spacing.lg },
  label: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 0.5, marginBottom: spacing.xs, fontFamily: fonts.light },
  input: {
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: type.corpo,
    color: theme.ink,
    backgroundColor: theme.paperRaised, fontFamily: fonts.regular },
  erroBloco: { marginBottom: spacing.sm, gap: 2 },
  errorText: { color: '#e08a7d', fontSize: type.apoio, lineHeight: 18, fontFamily: fonts.regular },
  erroAcao: { color: theme.accent2, fontSize: type.apoio, paddingVertical: 4, fontFamily: fonts.regular },
  esqueciBtn: { alignItems: 'center', paddingVertical: spacing.md },
  esqueciTexto: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  primaryBtn: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnHover: { opacity: 0.88 },
  primaryBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs, borderRadius: radius.md },
  secondaryBtnHover: { backgroundColor: theme.paperRaised },
  secondaryBtnText: { color: theme.inkSoft, fontSize: type.corpo, fontFamily: fonts.light },
});
