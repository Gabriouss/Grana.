import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Alert } from '@/lib/alert';
import { deleteUserAccount, reauthenticate } from '@/lib/data';
import { useSession } from '@/lib/auth-context';
import { useKeyboardHeight } from '@/lib/teclado';
import { useModalAccessibility } from '@/lib/modal-accessibility';
import { useReducedMotion } from '@/lib/motion';
import { mensagemErro } from '@/lib/erros';
import { LIMITS } from '@/lib/limits';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import AppPressable from './AppPressable';
import PasswordInput from './PasswordInput';

/**
 * Excluir a conta e todos os dados, com a identidade confirmada por senha.
 *
 * Vive num componente próprio porque agora tem DOIS lugares de onde partir: o
 * Perfil, de sempre, e a tela de assinatura, onde fica quem está no paywall ou
 * vencido. O autor decidiu em 23/09/2026 que sair, baixar os dados e excluir
 * precisam funcionar mesmo sem assinatura ativa, por conformidade com a LGPD —
 * e a Política de Privacidade já prometia, na letra, exclusão "a qualquer
 * momento, pelo próprio app".
 *
 * Duplicar este fluxo nas duas telas seria a pior forma de atender ao pedido:
 * é confirmação de identidade seguida de apagamento irreversível, exatamente o
 * tipo de código que não pode existir em duas versões que envelhecem
 * separadas.
 *
 * A confirmação por senha não é enfeite: sem ela, quem pega o aparelho
 * desbloqueado apaga a conta com dois toques. O servidor também exige login
 * recente (`delete-account` responde 428 fora da janela de reautenticação).
 */
export default function ExcluirContaSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { signOut } = useSession();
  const reduzirMovimento = useReducedMotion();
  const alturaTeclado = useKeyboardHeight();
  const cartaoRef = useRef<View>(null);
  useModalAccessibility(cartaoRef, visible, onClose);

  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  function fechar() {
    setSenha('');
    setErro(null);
    onClose();
  }

  async function excluir() {
    if (!senha) {
      setErro('Digite sua senha para confirmar.');
      return;
    }
    setExcluindo(true);
    setErro(null);

    const { ok, error } = await reauthenticate(senha);
    if (!ok) {
      setExcluindo(false);
      setErro(error ?? 'Não foi possível confirmar sua identidade.');
      return;
    }

    try {
      const { completo } = await deleteUserAccount();
      setSenha('');
      await signOut();
      if (!completo) {
        /* `deleteUserAccount` apagou o que alcançou; só o encerramento do
           login não terminou. Dizer isso é melhor que fingir que acabou. */
        Alert.alert(
          'Dados apagados',
          'Seus dados foram removidos, mas não foi possível concluir o encerramento total da conta agora. Se precisar, fale com o suporte.',
          [{ text: 'OK', onPress: () => router.replace('/sign-in') }]
        );
        return;
      }
      router.replace('/sign-in');
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível excluir agora. Tente de novo.'));
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType={reduzirMovimento ? 'none' : 'fade'}
      transparent
      onRequestClose={fechar}
    >
      <ScrollView
        style={styles.scrimFundo}
        contentContainerStyle={[styles.scrim, { paddingBottom: spacing.xl + alturaTeclado }]}
        keyboardShouldPersistTaps="handled"
      >
        <View ref={cartaoRef} style={styles.cartao} accessibilityViewIsModal role="dialog" focusable>
          <Text style={styles.titulo}>Confirme sua senha</Text>
          <Text style={styles.texto}>
            Todos os seus lançamentos, contas, categorias e orçamentos serão apagados
            permanentemente. Esta ação é irreversível. Digite sua senha para confirmar
            que é você.
          </Text>

          <PasswordInput
            backgroundColor={theme.paper}
            maxLength={LIMITS.password}
            placeholder="Sua senha"
            autoComplete="password"
            autoFocus
            value={senha}
            onChangeText={setSenha}
          />

          {erro && <Text style={styles.erro}>{erro}</Text>}

          <AppPressable
            style={({ hovered }) => [styles.perigo, hovered && { opacity: 0.88 }]}
            onPress={excluir}
            disabled={excluindo}
            accessibilityState={{ busy: excluindo, disabled: excluindo }}
          >
            {excluindo ? (
              <ActivityIndicator color={theme.ink} accessibilityLabel="Excluindo a conta" />
            ) : (
              <Text style={styles.perigoTexto}>Excluir definitivamente</Text>
            )}
          </AppPressable>

          <AppPressable style={styles.cancelar} onPress={fechar} disabled={excluindo}>
            <Text style={styles.cancelarTexto}>Manter minha conta</Text>
          </AppPressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrimFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scrim: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  cartao: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  titulo: { color: theme.ink, fontSize: type.titulo, lineHeight: lh(type.titulo, 'titulo'), fontFamily: fonts.regular },
  texto: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.light },
  erro: { color: theme.danger, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.regular },
  perigo: { backgroundColor: theme.danger, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  perigoTexto: { color: theme.paper, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  cancelar: { paddingVertical: spacing.md, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  cancelarTexto: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.light },
});
