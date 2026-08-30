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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/auth-context';
import { theme, spacing, radius, fonts, type, lh } from '@/lib/theme';
import { colunaFormulario } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import PasswordInput from '@/components/PasswordInput';
import TextoComLinks from '@/components/TextoComLinks';
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
  const [aceitouTermos, setAceitouTermos] = useState(false);

  const campoEmail = useRef<TextInput>(null);
  const campoSenha = useRef<TextInput>(null);
  const campoConfirmar = useRef<TextInput>(null);

  async function handleSignUp() {
    setError(null);
    /* Cada recusa leva o foco ao campo que precisa de conserto. Sem isto o
        foco ficava no botão e a mensagem aparecia longe de onde a pessoa
        está, o que deixa quem navega por teclado sem saber o que corrigir. */
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.');
      if (!email.trim()) campoEmail.current?.focus();
      else campoSenha.current?.focus();
      return;
    }
    if (!aceitouTermos) {
      setError('Para criar sua conta, você precisa aceitar os Termos de Uso e a Política de Privacidade.');
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      campoSenha.current?.focus();
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não são iguais.');
      campoConfirmar.current?.focus();
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
      setError(signUpError.mensagem);
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
          <Text style={styles.eyebrow}>Quase lá</Text>
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
      </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Mesma correção da tela de confirmação acima: sem rolagem, o
          formulário de cadastro ficava cortado nos dois sentidos em paisagem. */}
      <ScrollView
        style={styles.rolagem}
        contentContainerStyle={styles.rolagemConteudo}
        keyboardShouldPersistTaps="handled"
      >
      <View style={[styles.content, colunaFormulario, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.eyebrow}>Boas-vindas ao Grana.</Text>
        <Text style={styles.title}>Criar conta</Text>
        <Text style={styles.subtitle}>Seus lançamentos ficam salvos na nuvem e sincronizados entre aparelhos.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            ref={campoEmail}
            /* Nome acessível: o "E-mail" acima é um `Text` irmão e não vira
               `<label>` na web nem nome no nativo. */
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
            ref={campoConfirmar}
            accessibilityLabel="Confirmar senha"
            maxLength={LIMITS.password}
            placeholder="digite a senha de novo"
            autoComplete="password-new"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>

        <AppPressable
          style={styles.consentimentoRow}
          onPress={() => setAceitouTermos((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: aceitouTermos }}
        >
          <Ionicons
            name={aceitouTermos ? 'checkbox' : 'square-outline'}
            size={20}
            color={aceitouTermos ? theme.accent2 : theme.inkFaint}
          />
          <TextoComLinks
            style={styles.consentimentoTexto}
            linkStyle={styles.consentimentoLink}
            texto="Li e concordo com os [Termos de Uso](/termos) e a [Política de Privacidade](/privacidade)."
          />
        </AppPressable>

        {/* Região de alerta: a mensagem nascia visível e silenciosa. */}
        {error && (
          <Text style={styles.errorText} role="alert" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        )}

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
      </ScrollView>
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
  title: { color: theme.ink, fontSize: type.valor, fontFamily: fonts.light, marginTop: spacing.xs, marginBottom: spacing.sm },
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
  requisitos: { gap: 5, marginTop: 8 },
  requisitoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  requisitoTexto: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  requisitoTextoOk: { color: theme.inkSoft },
  errorText: { color: theme.danger, fontSize: type.apoio, marginBottom: spacing.sm, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.regular },
  consentimentoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: spacing.md },
  consentimentoTexto: { flex: 1, color: theme.inkSoft, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
  consentimentoLink: { color: theme.accent2, fontFamily: fonts.regular },
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
