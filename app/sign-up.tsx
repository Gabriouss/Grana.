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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/auth-context';
import { theme, spacing, radius, fonts } from '@/lib/theme';
import AppPressable from '@/components/AppPressable';
import PasswordInput from '@/components/PasswordInput';
import { LIMITS, MIN_PASSWORD, validatePassword } from '@/lib/limits';
import { checarSenhaVazada, mensagemSenhaVazada } from '@/lib/pwned';

/**
 * Critérios de senha exibidos sempre visíveis abaixo do campo — não só depois
 * de um erro. `validatePassword()` em lib/limits.ts é a fonte de verdade das
 * regras; isto só reflete visualmente o que ela já checa, então os dois
 * precisam continuar dizendo a mesma coisa se a regra mudar.
 */
function RequisitoSenha({ atende, texto }: { atende: boolean; texto: string }) {
  return (
    <View style={styles.requisitoItem}>
      <Ionicons
        name={atende ? 'checkmark-circle' : 'ellipse-outline'}
        size={14}
        color={atende ? theme.accent2 : theme.inkFaint}
      />
      <Text style={[styles.requisitoTexto, atende && styles.requisitoTextoOk]}>{texto}</Text>
    </View>
  );
}

export default function SignUp() {
  const { signUp } = useSession();
  const router = useRouter();
  /* Este formulário é o mais alto do app (lista de requisitos de senha); num
     aparelho baixo ele encostava na barra de status sem o inset. */
  const insets = useSafeAreaInsets();
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
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não são iguais.');
      return;
    }

    setLoading(true);

    /* Checagem de senha vazada. Roda depois das validações locais (que são
       instantâneas) para não gastar uma ida à rede numa senha que já seria
       recusada de qualquer forma. Se o serviço não responder, `indisponivel`
       deixa o cadastro seguir — ver o comentário em lib/pwned.ts. */
    const vazamento = await checarSenhaVazada(password);
    if (vazamento.status === 'vazada') {
      setLoading(false);
      setError(mensagemSenhaVazada(vazamento.vezes));
      return;
    }

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
        <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Text style={styles.eyebrow}>quase lá</Text>
          <Text style={styles.title}>Confirme seu e-mail</Text>
          <Text style={styles.subtitle}>
            Enviamos um link de confirmação para{' '}
            <Text style={{ color: theme.ink }}>{confirmationSentTo}</Text>. Abra o e-mail e toque no link para
            confirmar — o Grana abre sozinho, já conectado.
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
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.eyebrow}>bem-vinda ao Grana.</Text>
        <Text style={styles.title}>Criar conta</Text>
        <Text style={styles.subtitle}>Seus lançamentos ficam salvos na nuvem e sincronizados entre aparelhos.</Text>

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
            placeholder={`mínimo ${MIN_PASSWORD} caracteres, com número`}
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
          />
          <View style={styles.requisitos}>
            <RequisitoSenha atende={password.length >= MIN_PASSWORD} texto={`Pelo menos ${MIN_PASSWORD} caracteres`} />
            <RequisitoSenha
              atende={/[a-zA-Z]/.test(password) && /[0-9]/.test(password)}
              texto="Letras e números misturados"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirmar senha</Text>
          <PasswordInput
            maxLength={LIMITS.password}
            placeholder="digite a senha de novo"
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
  title: { color: theme.ink, fontSize: 34, fontFamily: fonts.light, marginTop: spacing.xs, marginBottom: spacing.sm },
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
  requisitos: { gap: 5, marginTop: 8 },
  requisitoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  requisitoTexto: { color: theme.inkFaint, fontSize: 12 },
  requisitoTextoOk: { color: theme.inkSoft },
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
