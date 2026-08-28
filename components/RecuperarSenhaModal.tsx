import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import AppModal from './AppModal';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radius, type, fonts } from '@/lib/theme';
import { useSession } from '@/lib/auth-context';
import { LIMITS } from '@/lib/limits';
import AppPressable from './AppPressable';
import Sheet from './Sheet';

/**
 * Pedido de recuperação de senha.
 *
 * A mensagem de sucesso é deliberadamente igual quer o e-mail exista ou não —
 * é o mesmo motivo pelo qual o login não distingue "senha errada" de "conta
 * inexistente" (ver lib/auth-errors.ts). Se aqui dissesse "não encontramos
 * esse e-mail", o formulário de recuperação viraria o verificador de cadastro
 * que o de login deixou de ser, e a proteção do outro lado não valeria nada.
 * O próprio Supabase responde 200 nos dois casos, então dizer o contrário
 * exigiria inventar informação que a API não dá.
 */
export default function RecuperarSenhaModal({
  visible,
  onClose,
  emailInicial = '',
}: {
  visible: boolean;
  onClose: () => void;
  emailInicial?: string;
}) {
  const { recuperarSenha } = useSession();
  const [email, setEmail] = useState(emailInicial);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleEnviar() {
    const alvo = email.trim();
    if (!alvo.includes('@')) {
      setErro('Informe um e-mail válido.');
      return;
    }
    setErro(null);
    setEnviando(true);
    const { error } = await recuperarSenha(alvo);
    setEnviando(false);
    if (error) {
      setErro(error.mensagem);
      return;
    }
    setEnviado(true);
  }

  function fechar() {
    setEnviado(false);
    setErro(null);
    onClose();
  }

  return (
    <AppModal visible={visible} transparent animationType="slide" onRequestClose={fechar}>
      <Sheet onClose={fechar}>
        <View style={styles.cabecalho}>
          <Text style={styles.titulo}>{enviado ? 'E-mail a caminho' : 'Recuperar senha'}</Text>
          <AppPressable onPress={fechar} hitSlop={12} accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {enviado ? (
          <>
            <Text style={styles.texto}>
              Se houver uma conta com <Text style={styles.destaque}>{email.trim()}</Text>, o link para criar uma senha
              nova chega em instantes. Confira também o spam e a aba Promoções.
            </Text>
            <Text style={styles.nota}>O link vale por uma hora e só pode ser usado uma vez.</Text>
            <AppPressable style={styles.botao} onPress={fechar}>
              <Text style={styles.botaoTexto}>Entendi</Text>
            </AppPressable>
          </>
        ) : (
          <>
            <Text style={styles.texto}>
              Informe o e-mail da sua conta. Enviamos um link para você definir uma senha nova.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="voce@exemplo.com"
              placeholderTextColor={theme.inkFaint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              maxLength={LIMITS.email}
              value={email}
              onChangeText={setEmail}
              autoFocus
            />
            {erro && <Text style={styles.erro}>{erro}</Text>}
            <AppPressable style={styles.botao} onPress={handleEnviar} disabled={enviando}>
              {enviando ? (
                <ActivityIndicator color={theme.paper} />
              ) : (
                <Text style={styles.botaoTexto}>Enviar link</Text>
              )}
            </AppPressable>
          </>
        )}
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  titulo: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  texto: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: 20, marginBottom: spacing.lg, fontFamily: fonts.light },
  destaque: { color: theme.ink},
  nota: { color: theme.inkFaint, fontSize: type.nota, marginBottom: spacing.lg, fontFamily: fonts.light },
  input: {
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    color: theme.ink,
    fontSize: type.corpo,
    marginBottom: spacing.md, fontFamily: fonts.regular },
  erro: { color: '#e08a7d', fontSize: type.apoio, marginBottom: spacing.md, fontFamily: fonts.regular },
  botao: {
    backgroundColor: theme.accent2,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botaoTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
});
