import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { useAppLock } from '@/lib/app-lock-context';
import { useScreenCapture } from '@/lib/screen-capture-context';
import { theme, radius, spacing } from '@/lib/theme';
import { deleteUserAccount, reauthenticate } from '@/lib/data';
import { LIMITS } from '@/lib/limits';
import { carregarPerfil, nomeDeExibicao, removerFoto, salvarFoto, salvarNome, LIMITE_NOME, type Perfil } from '@/lib/profile';
import { carregarDiagnostico, type DiagnosticoCarregado } from '@/lib/diagnostico';
import AppPressable from '@/components/AppPressable';
import PasswordInput from '@/components/PasswordInput';
import ToggleSwitch from '@/components/ToggleSwitch';
import BudgetTemplatesModal from '@/components/BudgetTemplatesModal';
import OnboardingModal from '@/components/OnboardingModal';
import Toast from '@/components/Toast';

export default function PerfilScreen() {
  const { session, signOut } = useSession();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { isDemoMode, toggleDemoMode } = useDemo();
  const { ativo: lockAtivo, disponivel: lockDisponivel, alternar: alternarLock } = useAppLock();
  const { bloqueado: capturaBloqueada, disponivel: capturaDisponivel, alternar: alternarCaptura } = useScreenCapture();
  const router = useRouter();

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCarregado | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [nomeOpen, setNomeOpen] = useState(false);
  const [nomeRascunho, setNomeRascunho] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);


  function triggerToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  async function handlePerformSignOut() {
    await signOut();
    router.replace('/sign-in');
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('Deseja realmente sair da sua conta?') : true;
      if (ok) {
        handlePerformSignOut();
      }
    } else {
      Alert.alert('Sair da conta', 'Você precisará entrar novamente para ver seus dados.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: handlePerformSignOut,
        },
      ]);
    }
  }

  async function handlePerformDeleteAccount() {
    try {
      setDeleting(true);
      await deleteUserAccount();
      await signOut();
      router.replace('/sign-in');
    } catch (err: any) {
      Alert.alert('Erro ao excluir conta', err?.message || 'Tente novamente mais tarde.');
    } finally {
      setDeleting(false);
    }
  }

  /* A confirmação por si só não protege nada: quem está com o aparelho
     desbloqueado toca em "Excluir" e pronto. Por isso o botão agora abre a
     folha que pede a senha, e a exclusão só acontece depois que o Supabase
     revalida a credencial. */
  function confirmDeleteAccount() {
    setDeleteError(null);
    setDeletePassword('');
    setReauthOpen(true);
  }

  async function handleConfirmDeleteWithPassword() {
    if (!deletePassword) {
      setDeleteError('Digite sua senha para confirmar.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const { ok, error } = await reauthenticate(deletePassword);
    if (!ok) {
      setDeleting(false);
      setDeleteError(error ?? 'Não foi possível confirmar sua identidade.');
      return;
    }
    setReauthOpen(false);
    setDeletePassword('');
    await handlePerformDeleteAccount();
  }

  const recarregarPerfil = useCallback(async () => {
    setPerfil(await carregarPerfil());
  }, []);

  const recarregarDiagnostico = useCallback(async () => {
    setDiagnostico(await carregarDiagnostico());
  }, []);

  useEffect(() => {
    recarregarPerfil();
    recarregarDiagnostico();
  }, [recarregarPerfil, recarregarDiagnostico]);

  function abrirEdicaoNome() {
    setNomeRascunho(perfil?.nome ?? '');
    setNomeOpen(true);
  }

  async function confirmarNome() {
    setSalvandoNome(true);
    const { ok, error } = await salvarNome(nomeRascunho);
    setSalvandoNome(false);
    if (!ok) {
      Alert.alert('Não foi possível salvar', error ?? 'Tente novamente.');
      return;
    }
    setNomeOpen(false);
    await recarregarPerfil();
    triggerToast('Nome atualizado');
  }

  async function escolherFoto() {
    if (isDemoMode) {
      Alert.alert('Modo de exemplo ativo', 'Desative "Dados de exemplo" no Perfil para alterar sua foto.');
      return;
    }

    /* Sem requestMediaLibraryPermissionsAsync antes: no SDK 57 o próprio
       launchImageLibraryAsync pede a permissão quando necessário, e pedir duas
       vezes gera um diálogo a mais sem motivo. */
    const escolha = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Quadrado, porque o avatar é redondo — deixar a pessoa recortar evita
      // que o app corte a cabeça de uma foto em retrato.
      aspect: [1, 1],
      quality: 1,
    });
    if (escolha.canceled || !escolha.assets?.[0]) return;

    setEnviandoFoto(true);
    const { ok, error } = await salvarFoto(escolha.assets[0].uri);
    setEnviandoFoto(false);
    if (!ok) {
      Alert.alert('Não foi possível enviar a foto', error ?? 'Tente novamente.');
      return;
    }
    await recarregarPerfil();
    triggerToast('Foto atualizada');
  }

  function confirmarRemocaoFoto() {
    Alert.alert('Remover foto', 'Sua inicial volta a aparecer no lugar dela.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          const { ok, error } = await removerFoto();
          if (!ok) {
            Alert.alert('Não foi possível remover', error ?? 'Tente novamente.');
            return;
          }
          await recarregarPerfil();
          triggerToast('Foto removida');
        },
      },
    ]);
  }

  const userEmail = perfil?.email || session?.user.email || 'usuario@exemplo.com';
  const nomeExibido = nomeDeExibicao(perfil) || userEmail;
  const initial = (perfil?.nome || userEmail)[0]?.toUpperCase() ?? 'G';


  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.paper }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header com Avatar */}
        <View style={styles.header}>
          <AppPressable onPress={escolherFoto} disabled={enviandoFoto}>
            <View style={styles.avatar}>
              {enviandoFoto ? (
                <ActivityIndicator color={theme.paper} />
              ) : perfil?.fotoUrl ? (
                <Image source={{ uri: perfil.fotoUrl }} style={styles.avatarFoto} />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={12} color={theme.paper} />
              </View>
            </View>
          </AppPressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{nomeExibido}</Text>
            <Text style={styles.sub}>{userEmail}</Text>
          </View>

          <AppPressable onPress={abrirEdicaoNome} hitSlop={10}>
            <Ionicons name="create-outline" size={20} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {/* Seção Conta */}
        <Text style={styles.sectionLabel}>Conta</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Categorias</Text>
            <Text style={styles.rowValue}>8 Categorias</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Sincronização</Text>
            <Text style={styles.rowValue}>{isDemoMode ? 'Desligada' : 'Ligada'}</Text>
          </View>
          {perfil?.fotoUrl && (
            <AppPressable style={styles.tappableRow} onPress={confirmarRemocaoFoto}>
              <Text style={styles.rowKey}>Foto de perfil</Text>
              <Text style={styles.rowValue}>Remover &gt;</Text>
            </AppPressable>
          )}
          <View style={styles.row}>
            <Text style={styles.rowKey}>Lembretes de vencimento</Text>
            <Text style={styles.rowValue}>Ativados</Text>
          </View>
        </View>

        {/* Seção Preferências */}
        <Text style={styles.sectionLabel}>Preferências</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Moeda</Text>
            <Text style={styles.rowValue}>Real (R$)</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Tema</Text>
            <Text style={styles.rowValue}>Escuro (Dark Theme)</Text>
          </View>
        </View>

        {/* Seção Personalização & Modos */}
        <Text style={styles.sectionLabel}>Personalização</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Modo privacidade</Text>
            <ToggleSwitch
              value={hidden}
              onToggle={() => {
                togglePrivacy();
                triggerToast(hidden ? 'Valores visíveis' : 'Valores ocultos');
              }}
            />
          </View>

          {/* Só aparece em aparelho com biometria cadastrada: oferecer a trava
              sem ter como vencê-la trancaria a pessoa para fora do app. */}
          {lockDisponivel && (
            <View style={styles.row}>
              <Text style={styles.rowKey}>Bloqueio por biometria</Text>
              <ToggleSwitch value={lockAtivo} onToggle={alternarLock} />
            </View>
          )}

          {capturaDisponivel && (
            <View style={styles.rowColuna}>
              <View style={styles.rowInterna}>
                <Text style={styles.rowKey}>Bloquear captura de tela</Text>
                <ToggleSwitch value={capturaBloqueada} onToggle={alternarCaptura} />
              </View>
              <Text style={styles.rowAjuda}>
                {capturaBloqueada
                  ? 'Prints ficam bloqueados e o app não aparece no alternador de tarefas.'
                  : 'Você pode printar, mas seus saldos ficam visíveis no alternador de tarefas.'}
              </Text>
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.rowKey}>Dados de exemplo</Text>
            <ToggleSwitch
              value={isDemoMode}
              onToggle={() => {
                toggleDemoMode();
                triggerToast(isDemoMode ? 'Voltando para seus dados' : 'Explorando dados de exemplo');
              }}
            />
          </View>

          <AppPressable style={styles.tappableRow} onPress={() => setTemplatesOpen(true)}>
            <Text style={styles.rowKey}>Orçamento sugerido</Text>
            <Text style={styles.rowValue}>Aplicar template &gt;</Text>
          </AppPressable>

          {diagnostico && (
            <View style={styles.row}>
              <Text style={styles.rowKey}>Perfil financeiro</Text>
              <Text style={styles.rowValue}>
                {diagnostico.arquetipo.emoji} {diagnostico.arquetipo.nome}
              </Text>
            </View>
          )}

          <AppPressable style={styles.tappableRow} onPress={() => setOnboardingOpen(true)}>
            <Text style={styles.rowKey}>{diagnostico ? 'Diagnóstico financeiro' : 'Diagnóstico inicial'}</Text>
            <Text style={styles.rowValue}>Refazer diagnóstico &gt;</Text>
          </AppPressable>
        </View>

        {/* Ações da Conta: Sair e Excluir */}
        <View style={{ gap: 10, marginTop: spacing.md }}>
          <AppPressable
            style={({ hovered }) => [styles.signOutBtn, hovered && styles.signOutBtnHover]}
            onPress={confirmSignOut}
          >
            <Text style={styles.signOutText}>Sair da conta</Text>
          </AppPressable>

          <AppPressable
            style={({ hovered }) => [styles.deleteBtn, hovered && styles.deleteBtnHover]}
            onPress={confirmDeleteAccount}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#e08a7d" size="small" />
            ) : (
              <Text style={styles.deleteText}>Excluir conta e dados</Text>
            )}
          </AppPressable>
        </View>
      </ScrollView>

      {/* Modais */}
      <BudgetTemplatesModal
        visible={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSuccess={() => {
          triggerToast('Orçamento sugerido aplicado');
        }}
      />

      <OnboardingModal
        visible={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onFinished={() => {
          triggerToast('Diagnóstico atualizado');
          recarregarDiagnostico();
        }}
      />

      {/* Toast */}
      {/* Edição do nome de exibição. */}
      <Modal visible={nomeOpen} animationType="fade" transparent onRequestClose={() => setNomeOpen(false)}>
        <View style={styles.reauthScrim}>
          <View style={styles.reauthCard}>
            <Text style={styles.reauthTitle}>Como podemos te chamar?</Text>
            <Text style={styles.reauthText}>
              Usamos esse nome aqui no perfil e nas mensagens de lembrete de vencimento.
            </Text>
            <TextInput
              maxLength={LIMITE_NOME}
              style={styles.reauthInput}
              placeholder="Seu nome"
              placeholderTextColor={theme.inkFaint}
              autoFocus
              value={nomeRascunho}
              onChangeText={setNomeRascunho}
            />
            <AppPressable
              style={({ hovered }) => [styles.nomeSalvar, hovered && { opacity: 0.88 }]}
              onPress={confirmarNome}
              disabled={salvandoNome}
            >
              {salvandoNome ? (
                <ActivityIndicator color={theme.paper} />
              ) : (
                <Text style={styles.nomeSalvarTexto}>Salvar</Text>
              )}
            </AppPressable>
            <AppPressable style={styles.reauthCancel} onPress={() => setNomeOpen(false)} disabled={salvandoNome}>
              <Text style={styles.reauthCancelText}>Cancelar</Text>
            </AppPressable>
          </View>
        </View>
      </Modal>

      {/* Reautenticação antes de excluir a conta. */}
      <Modal
        visible={reauthOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setReauthOpen(false)}
      >
        <View style={styles.reauthScrim}>
          <View style={styles.reauthCard}>
            <Text style={styles.reauthTitle}>Confirme sua senha</Text>
            <Text style={styles.reauthText}>
              Todos os seus lançamentos, contas, categorias e orçamentos serão apagados
              permanentemente. Esta ação é irreversível — digite sua senha para confirmar
              que é você.
            </Text>

            <PasswordInput
              backgroundColor={theme.paper}
              maxLength={LIMITS.password}
              placeholder="Sua senha"
              autoComplete="password"
              autoFocus
              value={deletePassword}
              onChangeText={setDeletePassword}
            />

            {deleteError && <Text style={styles.reauthError}>{deleteError}</Text>}

            <AppPressable
              style={({ hovered }) => [styles.reauthDanger, hovered && { opacity: 0.88 }]}
              onPress={handleConfirmDeleteWithPassword}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color={theme.ink} />
              ) : (
                <Text style={styles.reauthDangerText}>Excluir definitivamente</Text>
              )}
            </AppPressable>

            <AppPressable
              style={styles.reauthCancel}
              onPress={() => {
                setReauthOpen(false);
                setDeletePassword('');
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              <Text style={styles.reauthCancelText}>Cancelar</Text>
            </AppPressable>
          </View>
        </View>
      </Modal>

      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rowColuna: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule, gap: 4 },
  rowInterna: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowAjuda: { color: theme.inkFaint, fontSize: 10.5, lineHeight: 14.5, paddingRight: 16 },
  avatarFoto: { width: '100%', height: '100%', borderRadius: 999 },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.paper,
  },
  nomeSalvar: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  nomeSalvarTexto: { color: theme.paper, fontSize: 15, fontWeight: '600' },
  reauthScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  reauthCard: { width: '100%', maxWidth: 400, backgroundColor: theme.paperRaised, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: theme.rule },
  reauthTitle: { color: theme.ink, fontSize: 18, fontWeight: '600' },
  reauthText: { color: theme.inkSoft, fontSize: 13.5, lineHeight: 19 },
  reauthInput: { borderWidth: 1, borderColor: theme.rule, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, color: theme.ink, backgroundColor: theme.paper },
  reauthError: { color: '#e08a7d', fontSize: 13, lineHeight: 18 },
  reauthDanger: { backgroundColor: '#e08a7d', borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  reauthDangerText: { color: theme.paper, fontSize: 15, fontWeight: '600' },
  reauthCancel: { paddingVertical: 12, alignItems: 'center' },
  reauthCancelText: { color: theme.inkSoft, fontSize: 14 },
  container: { flex: 1, backgroundColor: theme.paper },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.paperRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.rule },
  avatarText: { color: theme.ink, fontSize: 20, fontWeight: '500' },
  name: { color: theme.ink, fontSize: 14, fontWeight: '500' },
  sub: { color: theme.inkFaint, fontSize: 11.5, marginTop: 2 },
  sectionLabel: { color: theme.inkFaint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  sectionCard: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  tappableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  rowKey: { color: theme.ink, fontSize: 13 },
  rowValue: { color: theme.inkFaint, fontSize: 12 },
  signOutBtn: { borderWidth: 1, borderColor: theme.ruleStrong, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  signOutBtnHover: { backgroundColor: theme.paperRaised },
  signOutText: { color: theme.ink, fontSize: 14, fontWeight: '500' },
  deleteBtn: { borderWidth: 1, borderColor: '#bb6b6040', backgroundColor: '#bb6b6015', borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  deleteBtnHover: { backgroundColor: '#bb6b6030' },
  deleteText: { color: '#e08a7d', fontSize: 13.5, fontWeight: '500' },
});

