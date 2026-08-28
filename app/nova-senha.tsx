import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/auth-context';
import { colunaFormulario } from '@/lib/breakpoints';
import { theme, spacing, radius, type, fonts } from '@/lib/theme';
import { LIMITS, validatePassword } from '@/lib/limits';
import { checarSenhaVazada, mensagemSenhaVazada } from '@/lib/pwned';
import AppPressable from '@/components/AppPressable';
import PasswordInput from '@/components/PasswordInput';
import BrandLogotype from '@/components/BrandLogotype';

/**
 * Definição da senha nova, ao voltar do link de recuperação.
 *
 * O link de recuperação do Supabase AUTENTICA de verdade: quem chega aqui já
 * tem sessão válida. Por isso esta tela não é opcional — sem ela a pessoa
 * cairia na Início logada e a senha continuaria a antiga, a que ela não
 * lembra, e no próximo aparelho estaria trancada de novo. O layout raiz
 * segura a navegação em `emRecuperacao` até esta tela concluir.
 */
export default function NovaSenhaScreen() {
  const { definirNovaSenha, cancelarRecuperacao, signOut } = useSession();
  const insets = useSafeAreaInsets();

  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSalvar() {
    setErro(null);

    const problema = validatePassword(senha);
    if (problema) {
      setErro(problema);
      return;
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setSalvando(true);
    /* Mesma checagem do cadastro: uma senha que já vazou em outro serviço é
       exatamente a que um ataque de credential stuffing tenta primeiro, e
       trocar uma senha esquecida por uma vazada não melhora nada. */
    const vazamento = await checarSenhaVazada(senha);
    if (vazamento.status === 'vazada') {
      setSalvando(false);
      setErro(mensagemSenhaVazada(vazamento.vezes));
      return;
    }

    const { error } = await definirNovaSenha(senha);
    setSalvando(false);
    if (error) {
      setErro(error.mensagem);
      return;
    }
    // Sucesso: `emRecuperacao` vira false e o layout raiz libera o app.
  }

  async function handleCancelar() {
    /* Sair de verdade, e não só esconder a tela: a sessão veio de um link de
       recuperação, então deixá-la de pé daria acesso ao app a quem abriu o
       link sem concluir a troca. */
    cancelarRecuperacao();
    await signOut();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.content, colunaFormulario, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.eyebrow}>Quase lá</Text>
        <View style={styles.title}>
          <BrandLogotype width={140} />
        </View>
        <Text style={styles.subtitle}>
          Crie uma senha nova para sua conta. Depois de salvar, use ela para entrar em qualquer aparelho.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Nova senha</Text>
          <PasswordInput
            maxLength={LIMITS.password}
            placeholder="Pelo menos 9 caracteres"
            autoComplete="new-password"
            value={senha}
            onChangeText={setSenha}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Repita a senha</Text>
          <PasswordInput
            maxLength={LIMITS.password}
            placeholder="••••••••"
            autoComplete="new-password"
            value={confirmacao}
            onChangeText={setConfirmacao}
          />
        </View>

        {erro && <Text style={styles.erro}>{erro}</Text>}

        <AppPressable
          style={({ hovered }) => [styles.primaryBtn, hovered && { opacity: 0.9 }]}
          onPress={handleSalvar}
          disabled={salvando}
        >
          {salvando ? (
            <ActivityIndicator color={theme.paper} />
          ) : (
            <Text style={styles.primaryBtnText}>Salvar senha</Text>
          )}
        </AppPressable>

        <AppPressable onPress={handleCancelar} style={styles.cancelar}>
          <Text style={styles.cancelarTexto}>Cancelar e sair</Text>
        </AppPressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  eyebrow: { color: theme.inkFaint, fontSize: type.nota, letterSpacing: 1, fontFamily: fonts.light },
  title: { marginTop: spacing.xs, marginBottom: spacing.sm },
  subtitle: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: 21, marginBottom: spacing.xxl, fontFamily: fonts.light },
  field: { marginBottom: spacing.lg },
  label: {
    color: theme.inkFaint,
    fontSize: type.legenda,
    letterSpacing: 0.5,
    marginBottom: spacing.xs, fontFamily: fonts.light },
  erro: { color: theme.danger, fontSize: type.apoio, marginBottom: spacing.md, fontFamily: fonts.regular },
  primaryBtn: {
    backgroundColor: theme.accent2,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  cancelar: { alignItems: 'center', paddingVertical: spacing.lg },
  cancelarTexto: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
});
