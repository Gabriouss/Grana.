import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/auth-context';
import { theme, spacing, radius, fonts, type, lh } from '@/lib/theme';
import { colunaFormulario } from '@/lib/breakpoints';
import type { ErroAuth } from '@/lib/auth-errors';
import AppPressable from '@/components/AppPressable';
import BrandLogotype from '@/components/BrandLogotype';
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
  const campoEmail = useRef<TextInput>(null);
  const campoSenha = useRef<TextInput>(null);

  async function handleSignIn() {
    setError(null);
    if (!email.trim() || !password) {
      setError({ mensagem: 'Preencha e-mail e senha.' });
      /* Levar o foco ao primeiro campo vazio. Sem isto o foco continuava no
         botão "Entrar" e a mensagem aparecia longe de onde a pessoa está: quem
         navega por teclado ou leitor de tela ficava sem saber o que corrigir. */
      if (!email.trim()) campoEmail.current?.focus();
      else campoSenha.current?.focus();
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
      {/* A rolagem não é enfeite: sem ela, `content` tinha `flex: 1` com
          `justifyContent: 'center'`, ou seja, uma caixa da altura exata da
          janela centralizando um formulário mais alto que ela. Medido em
          844×390, o título ficava em `top: -104` e o botão "Criar conta" em
          `top: 424` numa janela de 390, com `scrollHeight` igual a 390 e
          nenhum contêiner rolável: criar conta era impossível em paisagem.
          `flexGrow` no contêiner de conteúdo mantém a centralização quando há
          espaço e libera a rolagem quando não há. */}
      <ScrollView
        style={styles.rolagem}
        contentContainerStyle={styles.rolagemConteudo}
        keyboardShouldPersistTaps="handled"
      >
      <View style={[styles.content, colunaFormulario, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.eyebrow}>De volta</Text>
        <View style={styles.title}>
          <BrandLogotype width={140} />
        </View>
        <Text style={styles.subtitle}>Entre com sua conta para sincronizar seus lançamentos entre aparelhos.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            ref={campoEmail}
            /* O "E-mail" acima é um `Text` irmão: não vira `<label>` na web nem
               nome acessível no nativo. Medido antes desta correção, a tela
               tinha zero `label`, zero `aria-label` e zero `id`, e o leitor de
               tela anunciava os dois campos como "campo de edição". */
            accessibilityLabel="E-mail"
            maxLength={LIMITS.email}
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
            ref={campoSenha}
            accessibilityLabel="Senha"
            maxLength={LIMITS.password}
            placeholder="••••••••"
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error && (
          /* Região de alerta: a mensagem nascia visível mas silenciosa, sem
             `role="alert"` nem região viva, então quem usa leitor de tela não
             era avisado de que o envio falhou. */
          <View style={styles.erroBloco} role="alert" accessibilityLiveRegion="assertive">
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
      </ScrollView>

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
  rolagem: { flex: 1 },
  /* `flexGrow` em vez de `flex`: o conteúdo continua centralizado enquanto
     couber e passa a rolar quando não couber. */
  rolagemConteudo: { flexGrow: 1, justifyContent: 'center' },
  content: { width: '100%', paddingHorizontal: spacing.xl },
  eyebrow: { color: theme.inkFaint, fontSize: type.nota, letterSpacing: 1, fontFamily: fonts.light },
  title: { marginTop: spacing.xs, marginBottom: spacing.sm },
  subtitle: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), marginBottom: spacing.xxl, fontFamily: fonts.light },
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
  errorText: { color: theme.danger, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.regular },
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
