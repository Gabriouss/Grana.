import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/lib/tab-bar';
import { colunaConteudo } from '@/lib/breakpoints';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useDemo } from '@/lib/demo-context';
import { useAppLock } from '@/lib/app-lock-context';
import { useScreenCapture } from '@/lib/screen-capture-context';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import {
  createWhatsappPairing,
  deleteUserAccount,
  fetchWhatsappLink,
  reauthenticate,
  unlinkWhatsapp,
  fetchBills,
  fetchCreditCards,
  fetchCardInvoicePayments,
  fetchTransactions,
} from '@/lib/data';
import type { WhatsappLink } from '@/lib/types';
import { useModalAccessibility } from '@/lib/modal-accessibility';
import { useReducedMotion } from '@/lib/motion';
import {
  carregarNotifPrefs,
  salvarNotifPrefs,
  requestNotificationPermission,
  scheduleDailyHabitReminder,
  cancelDailyHabitReminder,
  scheduleBillReminders,
  cancelBillReminders,
  scheduleCardInvoiceReminders,
  cancelCardInvoiceReminders,
  type NotifPrefs,
} from '@/lib/notifications';
import { isSameMonth, todayISO } from '@/lib/format';
import { calculateStreakAndWeek } from '@/lib/gamification';
import SegmentedTabs from '@/components/SegmentedTabs';
import { LIMITS } from '@/lib/limits';
import { abrirConversaDoBot, abrirPareamentoNoWhatsapp, numeroVinculadoParaExibir } from '@/lib/whatsapp';
import { useAguardarVinculoWhatsapp } from '@/hooks/useAguardarVinculoWhatsapp';
import { carregarPerfil, nomeDeExibicao, removerFoto, salvarFoto, salvarNome, LIMITE_NOME, type Perfil } from '@/lib/profile';
import { carregarDiagnostico, type DiagnosticoCarregado } from '@/lib/diagnostico';
import AppPressable from '@/components/AppPressable';
import PareamentoWhatsapp from '@/components/PareamentoWhatsapp';
import PasswordInput from '@/components/PasswordInput';
import ToggleSwitch from '@/components/ToggleSwitch';
import BudgetTemplatesModal from '@/components/BudgetTemplatesModal';
import OnboardingModal from '@/components/OnboardingModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import FeedbackModal from '@/components/FeedbackModal';
import Toast from '@/components/Toast';

/* Endereços que app/(app)/_layout.tsx sabe rotear — ver lib/deep-links.ts.
   O `add-tx` vem com valor e descrição de exemplo já preenchidos: quem cola
   isso num atalho quase sempre quer trocar os dois, e ver o formato completo
   ensina mais do que uma URL nua. */
const ATALHOS = [
  { titulo: 'Novo gasto pré-preenchido', url: 'grana://add-tx?amount=50,00&desc=Almoco&type=out&category=Alimentação' },
  { titulo: 'Nova entrada', url: 'grana://add-tx?type=in' },
  { titulo: 'Escanear nota fiscal', url: 'grana://scan-qr' },
  { titulo: 'Ver quanto tenho livre', url: 'grana://safe-to-spend' },
];

export default function PerfilScreen() {
  const { paddingConteudo } = useTabBarInset();
  const { session, signOut } = useSession();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { isDemoMode, toggleDemoMode } = useDemo();
  const { ativo: lockAtivo, disponivel: lockDisponivel, alternar: alternarLock } = useAppLock();
  const { bloqueado: capturaBloqueada, disponivel: capturaDisponivel, alternar: alternarCaptura } = useScreenCapture();
  const router = useRouter();

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [categoriasOpen, setCategoriasOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null);
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

  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [atalhosOpen, setAtalhosOpen] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState<WhatsappLink | null>(null);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const nomeModalRef = useRef<View>(null);
  const reauthModalRef = useRef<View>(null);
  const atalhosModalRef = useRef<View>(null);
  const whatsappModalRef = useRef<View>(null);
  const reduzirMovimento = useReducedMotion();
  useModalAccessibility(nomeModalRef, nomeOpen);
  useModalAccessibility(reauthModalRef, reauthOpen);
  useModalAccessibility(atalhosModalRef, atalhosOpen);
  useModalAccessibility(whatsappModalRef, whatsappOpen);


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
      const { completo } = await deleteUserAccount();
      await signOut();
      if (!completo) {
        // `deleteUserAccount` já apagou todos os dados que conseguiu — só o
        // encerramento total da conta de login não terminou (depende de uma
        // função no servidor). Avisa em vez de fingir que terminou 100%.
        Alert.alert(
          'Dados apagados',
          'Seus dados foram removidos, mas não foi possível concluir o encerramento total da conta agora. Se precisar, fale com o suporte.',
          [{ text: 'OK', onPress: () => router.replace('/sign-in') }]
        );
        return;
      }
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

  const recarregarWhatsapp = useCallback(async () => {
    if (isDemoMode) return;
    try {
      setWhatsappLink(await fetchWhatsappLink());
    } catch {
      setWhatsappLink(null);
    }
  }, [isDemoMode]);

  useEffect(() => {
    recarregarPerfil();
    recarregarDiagnostico();
    recarregarWhatsapp();
    carregarNotifPrefs().then(setNotifPrefs);
  }, [recarregarPerfil, recarregarDiagnostico, recarregarWhatsapp]);

  /* Com o código na tela, o app confere sozinho: a pessoa manda a mensagem,
     volta pro app e já encontra o vínculo feito, sem apertar "verificar". */
  useAguardarVinculoWhatsapp(
    whatsappOpen && !!whatsappLink && !whatsappLink.verified,
    setWhatsappLink
  );

  /**
   * Lembrete diário é 1 id determinístico só — reagenda na hora. Contas e
   * faturas são N ids (um por boleto/cartão); pra ter efeito imediato sem
   * esperar a pessoa abrir aquelas telas, busca tudo aqui uma vez e repete o
   * mesmo laço de reagendamento que contas.tsx/credito.tsx já fazem no load.
   */
  async function alterarNotifPrefs(mudanca: Partial<NotifPrefs>) {
    if (!notifPrefs || isDemoMode) return;
    const novasPrefs = { ...notifPrefs, ...mudanca };
    setNotifPrefs(novasPrefs);
    await salvarNotifPrefs(novasPrefs);

    if ('lembreteDiarioAtivo' in mudanca || 'horario' in mudanca) {
      if (!novasPrefs.lembreteDiarioAtivo) {
        await cancelDailyHabitReminder();
      } else {
        const granted = await requestNotificationPermission();
        if (!granted) return;
        try {
          const transacoes = await fetchTransactions({ sinceDays: 35 });
          const { streak } = calculateStreakAndWeek(transacoes);
          const jaLancouHoje = transacoes.some((t) => t.occurred_on === todayISO());
          const ultimaData = transacoes[0]?.occurred_on;
          const diasInativo = ultimaData
            ? Math.floor((Date.now() - new Date(`${ultimaData}T00:00:00`).getTime()) / 86400000)
            : 99;
          await scheduleDailyHabitReminder({ ...novasPrefs.horario, jaLancouHoje, streak, diasInativo });
        } catch {
          // Falha graciosa — a próxima abertura da Home tenta de novo
        }
      }
    }

    if ('lembretesContasAtivo' in mudanca) {
      try {
        const [bills, cards, payments, transacoes] = await Promise.all([
          fetchBills(),
          fetchCreditCards(),
          fetchCardInvoicePayments(),
          fetchTransactions({ sinceDays: 35 }),
        ]);
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();

        if (novasPrefs.lembretesContasAtivo) {
          const granted = await requestNotificationPermission();
          if (!granted) return;
          bills.forEach((bill) => { scheduleBillReminders(bill).catch(() => {}); });
          cards.forEach((card) => {
            const valorFatura = transacoes
              .filter(
                (tx) =>
                  (tx.payment_method === 'credit' || tx.card_id) &&
                  tx.card_id === card.id &&
                  isSameMonth(tx.occurred_on, anoAtual, mesAtual)
              )
              .reduce((s, tx) => s + Number(tx.amount), 0);
            const jaPaga = payments.some((inv) => inv.card_id === card.id && inv.year === anoAtual && inv.month === mesAtual);
            if (!jaPaga && valorFatura > 0) {
              scheduleCardInvoiceReminders(card, anoAtual, mesAtual, valorFatura).catch(() => {});
            } else {
              cancelCardInvoiceReminders(card.id, anoAtual, mesAtual).catch(() => {});
            }
          });
        } else {
          bills.forEach((bill) => { cancelBillReminders(bill.id).catch(() => {}); });
          cards.forEach((card) => { cancelCardInvoiceReminders(card.id, anoAtual, mesAtual).catch(() => {}); });
        }
      } catch {
        // Falha graciosa — contas.tsx/credito.tsx reagendam certinho no próximo load
      }
    }
  }

  function abrirWhatsapp() {
    if (isDemoMode) {
      Alert.alert('Modo de exemplo ativo', 'Desative "Dados de exemplo" no Perfil para vincular um número de verdade.');
      return;
    }
    setWhatsappOpen(true);
  }

  /* Sem pedir o número: quem confirma o vínculo é o webhook, e ele grava o
     telefone de quem REALMENTE mandou a mensagem por cima do que fosse
     digitado aqui. Ver lib/whatsapp.ts. */
  async function handleGerarPareamento() {
    setWhatsappSaving(true);
    try {
      setWhatsappLink(await createWhatsappPairing());
    } catch (e: any) {
      Alert.alert('Erro ao gerar código', e.message);
    } finally {
      setWhatsappSaving(false);
    }
  }

  function confirmarDesvincularWhatsapp() {
    Alert.alert('Desvincular WhatsApp', 'Você vai parar de conseguir lançar por mensagem até parear de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular',
        style: 'destructive',
        onPress: async () => {
          try {
            await unlinkWhatsapp();
            setWhatsappLink(null);
            setWhatsappOpen(false);
            triggerToast('WhatsApp desvinculado');
          } catch (e: any) {
            Alert.alert('Erro ao desvincular', e.message);
          }
        },
      },
    ]);
  }

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
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, colunaConteudo, { paddingBottom: paddingConteudo }]}>
        {/* Header com Avatar */}
        <View style={styles.header}>
          <AppPressable
            onPress={escolherFoto}
            disabled={enviandoFoto}
            accessibilityRole="button"
            accessibilityLabel="Trocar foto de perfil"
          >
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

          <AppPressable
            onPress={abrirEdicaoNome}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Editar nome"
          >
            <Ionicons name="create-outline" size={20} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {/* Seção Conta */}
        <Text style={styles.sectionLabel}>Conta</Text>
        <View style={styles.sectionCard}>
          <AppPressable
            style={styles.tappableRow}
            onPress={() => setCategoriasOpen(true)}
          >
            <Text style={styles.rowKey}>Categorias</Text>
            <Text style={styles.rowValue}>Ver todas &gt;</Text>
          </AppPressable>
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
          <AppPressable style={styles.tappableRow} onPress={abrirWhatsapp}>
            <Text style={styles.rowKey}>Lançar pelo WhatsApp</Text>
            <Text style={styles.rowValue}>
              {whatsappLink?.verified ? 'Vinculado ✓' : whatsappLink ? 'Aguardando código' : 'Vincular'} &gt;
            </Text>
          </AppPressable>
          <AppPressable style={styles.tappableRow} onPress={() => setAtalhosOpen(true)}>
            <Text style={styles.rowKey}>Atalhos rápidos</Text>
            <Text style={styles.rowValue}>Configurar &gt;</Text>
          </AppPressable>
          <AppPressable style={[styles.tappableRow, { borderBottomWidth: 0 }]} onPress={() => setFeedbackOpen(true)}>
            <Text style={styles.rowKey}>Enviar feedback ou sugestão</Text>
            <Text style={styles.rowValue}>Abrir &gt;</Text>
          </AppPressable>
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

        {/* Seção Notificações */}
        <Text style={styles.sectionLabel}>Notificações</Text>
        <View style={styles.sectionCard}>
          <View style={notifPrefs?.lembreteDiarioAtivo ? styles.rowColuna : styles.row}>
            <View style={styles.rowInterna}>
              <Text style={styles.rowKey}>Lembrete diário de gastos</Text>
              <ToggleSwitch
                value={notifPrefs?.lembreteDiarioAtivo ?? true}
                onToggle={() => alterarNotifPrefs({ lembreteDiarioAtivo: !notifPrefs?.lembreteDiarioAtivo })}
                label="Lembrete diário de gastos"
              />
            </View>
            {notifPrefs?.lembreteDiarioAtivo && (
              <View style={{ marginTop: spacing.sm }}>
                <SegmentedTabs
                  options={[
                    { key: '19:00', label: '19:00' },
                    { key: '20:30', label: '20:30' },
                    { key: '21:30', label: '21:30' },
                  ]}
                  value={`${String(notifPrefs.horario.hour).padStart(2, '0')}:${String(notifPrefs.horario.minute).padStart(2, '0')}`}
                  onChange={(v) => {
                    const [hour, minute] = v.split(':').map(Number);
                    alterarNotifPrefs({ horario: { hour, minute } });
                  }}
                />
              </View>
            )}
          </View>

          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowKey}>Lembretes de contas e faturas</Text>
            <ToggleSwitch
              value={notifPrefs?.lembretesContasAtivo ?? true}
              onToggle={() => alterarNotifPrefs({ lembretesContasAtivo: !notifPrefs?.lembretesContasAtivo })}
              label="Lembretes de contas e faturas"
            />
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
              label="Modo privacidade"
            />
          </View>

          {/* Só aparece em aparelho com biometria cadastrada: oferecer a trava
              sem ter como vencê-la trancaria a pessoa para fora do app. */}
          {lockDisponivel && (
            <View style={styles.row}>
              <Text style={styles.rowKey}>Bloqueio por biometria</Text>
              <ToggleSwitch value={lockAtivo} onToggle={alternarLock} label="Bloqueio por biometria" />
            </View>
          )}

          {capturaDisponivel && (
            <View style={styles.rowColuna}>
              <View style={styles.rowInterna}>
                <Text style={styles.rowKey}>Bloquear captura de tela</Text>
                <ToggleSwitch value={capturaBloqueada} onToggle={alternarCaptura} label="Bloquear captura de tela" />
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
              label="Dados de exemplo"
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

        {/* Seção Legal */}
        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.sectionCard}>
          <AppPressable style={styles.tappableRow} onPress={() => router.push('/termos')}>
            <Text style={styles.rowKey}>Termos de Uso</Text>
            <Text style={styles.rowValue}>&gt;</Text>
          </AppPressable>
          <AppPressable style={styles.tappableRow} onPress={() => router.push('/privacidade')}>
            <Text style={styles.rowKey}>Política de Privacidade</Text>
            <Text style={styles.rowValue}>&gt;</Text>
          </AppPressable>
          <AppPressable style={[styles.tappableRow, { borderBottomWidth: 0 }]} onPress={() => router.push('/exclusao-de-dados')}>
            <Text style={styles.rowKey}>Como excluir meus dados</Text>
            <Text style={styles.rowValue}>&gt;</Text>
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
              <ActivityIndicator color={theme.danger} size="small" />
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
        initial={diagnostico?.respostas}
      />

      <CategoryPickerModal
        visible={categoriasOpen}
        mode="manage"
        onClose={() => setCategoriasOpen(false)}
      />

      <FeedbackModal
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSuccess={() => triggerToast('Obrigado pelo seu feedback!')}
      />

      {/* Toast */}
      {/* Edição do nome de exibição. */}
      <Modal visible={nomeOpen} animationType={reduzirMovimento ? 'none' : 'fade'} transparent onRequestClose={() => setNomeOpen(false)}>
        <View style={styles.reauthScrim}>
          <View ref={nomeModalRef} style={styles.reauthCard} accessibilityViewIsModal role="dialog" focusable>
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
        animationType={reduzirMovimento ? 'none' : 'fade'}
        transparent
        onRequestClose={() => setReauthOpen(false)}
      >
        <View style={styles.reauthScrim}>
          <View ref={reauthModalRef} style={styles.reauthCard} accessibilityViewIsModal role="dialog" focusable>
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

      {/* Guia de atalhos rápidos (deep links) */}
      <Modal visible={atalhosOpen} animationType={reduzirMovimento ? 'none' : 'fade'} transparent onRequestClose={() => setAtalhosOpen(false)}>
        <View style={styles.reauthScrim}>
          <View ref={atalhosModalRef} style={styles.reauthCard} accessibilityViewIsModal role="dialog" focusable>
            <Text style={styles.reauthTitle}>Atalhos rápidos</Text>
            <Text style={styles.reauthText}>
              O Grana. responde a endereços {'grana://'} — dá para abrir uma ação direto da tela de
              início do celular, sem passar pelo app.
            </Text>

            {ATALHOS.map((a) => (
              <AppPressable
                key={a.url}
                style={styles.atalhoLinha}
                onPress={() => {
                  Clipboard.setStringAsync(a.url);
                  triggerToast('Endereço copiado');
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.atalhoTitulo}>{a.titulo}</Text>
                  <Text style={styles.atalhoUrl} numberOfLines={1}>{a.url}</Text>
                </View>
                <Ionicons name="copy-outline" size={16} color={theme.inkFaint} />
              </AppPressable>
            ))}

            <Text style={styles.reauthText}>
              {Platform.OS === 'ios'
                ? 'No iPhone: app Atalhos → + → Adicionar ação → "Abrir URL" → cole o endereço → Adicionar à Tela de Início. Dá para disparar por automação também (ex: ao aproximar do Apple Pay).'
                : 'No Android: qualquer app de atalhos que abra URLs (ou o próprio navegador) consegue disparar esses endereços. Cole em um atalho na tela inicial.'}
            </Text>

            <AppPressable
              style={({ hovered }) => [styles.reauthCancel, hovered && { opacity: 0.88 }]}
              onPress={() => setAtalhosOpen(false)}
            >
              <Text style={styles.reauthCancelText}>Fechar</Text>
            </AppPressable>
          </View>
        </View>
      </Modal>

      {/* Vínculo de WhatsApp */}
      <Modal visible={whatsappOpen} animationType={reduzirMovimento ? 'none' : 'fade'} transparent onRequestClose={() => setWhatsappOpen(false)}>
        <View style={styles.reauthScrim}>
          <View ref={whatsappModalRef} style={styles.reauthCard} accessibilityViewIsModal role="dialog" focusable>
            <Text style={styles.reauthTitle}>Lançar pelo WhatsApp</Text>

            {whatsappLink?.verified ? (
              <>
                <Text style={styles.reauthText}>
                  Vinculado ao número {numeroVinculadoParaExibir(whatsappLink.phone) ?? whatsappLink.phone}.
                  Mande uma mensagem descrevendo o lançamento (ex: "Mercado de 120 reais") que o
                  Grana. registra automaticamente.
                </Text>
                <AppPressable
                  style={({ hovered }) => [styles.whatsappAbrir, hovered && { opacity: 0.88 }]}
                  onPress={() => abrirConversaDoBot()}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir a conversa do Grana. no WhatsApp"
                >
                  <Ionicons name="logo-whatsapp" size={19} color={theme.paper} />
                  <Text style={styles.whatsappAbrirTexto}>Abrir conversa</Text>
                </AppPressable>
                <AppPressable
                  style={({ hovered }) => [styles.reauthDanger, hovered && { opacity: 0.88 }]}
                  onPress={confirmarDesvincularWhatsapp}
                >
                  <Text style={styles.reauthDangerText}>Desvincular número</Text>
                </AppPressable>
              </>
            ) : whatsappLink ? (
              <>
                <PareamentoWhatsapp
                  codigo={whatsappLink.pairing_code}
                  chamada="O código vale por 15 minutos."
                />
                <AppPressable
                  style={({ hovered }) => [styles.reauthCancel, hovered && { opacity: 0.88 }]}
                  onPress={handleGerarPareamento}
                  disabled={whatsappSaving}
                >
                  <Text style={styles.reauthCancelText}>
                    {whatsappSaving ? 'Gerando...' : 'Código expirou? Gerar um novo'}
                  </Text>
                </AppPressable>
              </>
            ) : (
              <>
                <Text style={styles.reauthText}>
                  Informe seu número com DDD. Vamos gerar um código de 6 dígitos para você
                  confirmar pelo próprio WhatsApp.
                </Text>
                <AppPressable
                  style={({ hovered }) => [styles.nomeSalvar, hovered && { opacity: 0.88 }]}
                  onPress={handleGerarPareamento}
                  disabled={whatsappSaving}
                >
                  {whatsappSaving ? (
                    <ActivityIndicator color={theme.paper} />
                  ) : (
                    <Text style={styles.nomeSalvarTexto}>Gerar código de pareamento</Text>
                  )}
                </AppPressable>
              </>
            )}

            <AppPressable style={styles.reauthCancel} onPress={() => setWhatsappOpen(false)}>
              <Text style={styles.reauthCancelText}>Fechar</Text>
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
  rowAjuda: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: lh(type.legenda), paddingRight: 16, fontFamily: fonts.light },
  avatarFoto: { width: '100%', height: '100%', borderRadius: 999 },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.paper,
  },
  whatsappCode: {
    color: theme.ink,
    fontSize: type.valor,
    lineHeight: lh(type.valor, 'valor'),
    letterSpacing: 6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    paddingVertical: 8, fontFamily: fonts.regular },
  nomeSalvar: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  nomeSalvarTexto: { color: theme.paper, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  reauthScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  reauthCard: { width: '100%', maxWidth: 400, backgroundColor: theme.paperRaised, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: theme.rule },
  reauthTitle: { color: theme.ink, fontSize: type.titulo,
  lineHeight: lh(type.titulo, 'titulo'), fontFamily: fonts.regular },
  reauthText: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.light },
  reauthInput: { borderWidth: 1, borderColor: theme.rule, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: type.corpo, color: theme.ink, backgroundColor: theme.paper, fontFamily: fonts.regular },
  reauthError: { color: theme.danger, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.regular },
  reauthDanger: { backgroundColor: theme.danger, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  reauthDangerText: { color: theme.paper, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  reauthCancel: { paddingVertical: 12, alignItems: 'center' },
  reauthCancelText: { color: theme.inkSoft, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.light },
  /* Verde do WhatsApp: única cor emprestada de outra marca no app, e aqui ela
     informa — diz pra onde o toque leva antes de a pessoa ler o rótulo. */
  whatsappAbrir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#25D366',
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  whatsappAbrirTexto: { color: theme.paper, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  whatsappCodigoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    backgroundColor: theme.paper,
    paddingHorizontal: spacing.md,
  },
  whatsappCopiar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whatsappCopiarTexto: { color: theme.inkFaint, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  atalhoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  atalhoTitulo: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  atalhoUrl: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), marginTop: 2, fontFamily: fonts.light },
  container: { flex: 1, backgroundColor: theme.paper },
  /* paddingBottom vem do useTabBarInset() no JSX — depende da barra flutuante. */
  content: { padding: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.paperRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.rule },
  avatarText: { color: theme.ink, fontSize: type.destaque,
  lineHeight: lh(type.destaque, 'valor'), fontFamily: fonts.regular },
  name: { color: theme.ink, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  sub: { color: theme.inkFaint, fontSize: type.nota,
  lineHeight: lh(type.nota, 'corpo'), marginTop: 2, fontFamily: fonts.light },
  sectionLabel: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), letterSpacing: 0.5, marginTop: spacing.sm, fontFamily: fonts.light },
  sectionCard: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  tappableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  rowKey: { color: theme.ink, fontSize: type.apoio,
  lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.regular },
  rowValue: { color: theme.inkFaint, fontSize: type.nota,
  lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },
  signOutBtn: { borderWidth: 1, borderColor: theme.ruleStrong, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  signOutBtnHover: { backgroundColor: theme.paperRaised },
  signOutText: { color: theme.ink, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  deleteBtn: { borderWidth: 1, borderColor: `${theme.danger}40`, backgroundColor: `${theme.danger}15`, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  deleteBtnHover: { backgroundColor: `${theme.danger}30` },
  deleteText: { color: theme.danger, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
});

