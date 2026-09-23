import { useCallback, useEffect, useRef, useState } from 'react';
import { mensagemErro } from '@/lib/erros';
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
/* `expo-image` e não o `Image` do React Native: a foto de perfil vem de URL
   remota e era decodificada em tamanho cheio a cada montagem de tela, sem
   cache em disco no Android. Com `cachePolicy="disk"` ela é lida uma vez. */
import { Image } from 'expo-image';
import { Alert } from '@/lib/alert';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBarInset } from '@/lib/tab-bar';
import { colunaConteudo } from '@/lib/breakpoints';
import { useRouter } from 'expo-router';
import HeaderAction from '@/components/HeaderAction';
import AppModal from '@/components/AppModal';
import {
  definirEstado as definirEstadoWidgetVoz,
  estadoAtual as estadoWidgetVoz,
  fixarNaTelaInicial,
  podeFixar,
  quantidadeInstalada,
  widgetDisponivel,
  type TipoWidget,
} from '@/modules/grana-voice-widget';
import { useSession } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useWidgetPrivacy } from '@/lib/widget-privacy-context';
import { useDemo } from '@/lib/demo-context';
import { useAppLock } from '@/lib/app-lock-context';
import { useScreenCapture } from '@/lib/screen-capture-context';
import { theme, radius, spacing, screenRhythm, fonts, type, lh } from '@/lib/theme';
import {
  fetchBills,
  fetchCreditCards,
  fetchCardInvoicePayments,
  fetchTransactions,
} from '@/lib/data';
import ExcluirContaSheet from '@/components/ExcluirContaSheet';
import BaixarMeusDadosBotao from '@/components/BaixarMeusDadosBotao';
import { useModalAccessibility } from '@/lib/modal-accessibility';
import { useReducedMotion } from '@/lib/motion';
import {
  carregarNotifPrefs,
  salvarNotifPrefs,
  requestNotificationPermission,
  scheduleDailyHabitReminder,
  scheduleBillReminders,
  cancelBillReminders,
  scheduleCardInvoiceReminders,
  cancelCardInvoiceReminders,
  type NotifPrefs,
} from '@/lib/notifications';
import { todayISO } from '@/lib/format';
import { lembretesDeFatura } from '@/lib/creditoFaturas';
import { calculateStreakAndWeek } from '@/lib/gamification';
import SegmentedTabs from '@/components/SegmentedTabs';
import { carregarPerfil, nomeDeExibicao, removerFoto, salvarFoto, salvarNome, LIMITE_NOME, type Perfil } from '@/lib/profile';
import { carregarDiagnostico, diagnosticoDosMetadados, type DiagnosticoCarregado } from '@/lib/diagnostico';
import AppPressable from '@/components/AppPressable';
import { useFlags } from '@/lib/feature-flags';
import { useKeyboardHeight } from '@/components/Sheet';
import ToggleSwitch from '@/components/ToggleSwitch';
import BudgetTemplatesModal from '@/components/BudgetTemplatesModal';
import OnboardingModal from '@/components/OnboardingModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import FeedbackModal from '@/components/FeedbackModal';
import Toast from '@/components/Toast';
import { sincronizarPushHabito } from '@/lib/push-notifications';

/* O guia "Atalhos rápidos", que ensinava a colar endereços `grana://` num app
   de atalhos, saiu do Perfil em 19/09/2026 por decisão do autor: "Os atalhos
   grana:// não servem para os usuários". Os endereços continuam funcionando
   (lib/deep-links.ts), porque widgets e notificações abrem o app por eles. */

const WIDGETS_HOME: Array<{
  tipo: TipoWidget;
  titulo: string;
  tamanho: string;
  descricao: string;
  nomeNoLauncher: string;
}> = [
  { tipo: 'voz', titulo: 'Lançar por voz', tamanho: '1 × 1', descricao: 'Fale qualquer lançamento sem precisar abrir o app.', nomeNoLauncher: 'Grana. — lançar por voz' },
  { tipo: 'livre', titulo: 'Livre para gastar', tamanho: '2 × 1', descricao: 'Veja quanto está realmente disponível neste mês.', nomeNoLauncher: 'Grana. — livre para gastar' },
  { tipo: 'central', titulo: 'Central de lançamentos', tamanho: '2 × 2', descricao: 'Abra rapidamente Entrada, Débito/Pix, Crédito ou Boleto.', nomeNoLauncher: 'Grana. — central de lançamentos' },
  { tipo: 'compromisso', titulo: 'Próximo compromisso', tamanho: '2 × 2', descricao: 'Acompanhe a próxima conta pendente e abra os detalhes.', nomeNoLauncher: 'Grana. — próximo compromisso' },
  { tipo: 'cofrinho', titulo: 'Cofrinho', tamanho: '2 × 1', descricao: 'Acompanhe uma meta e vá direto para adicionar dinheiro.', nomeNoLauncher: 'Grana. — cofrinho' },
];

const CONTAGEM_WIDGETS_INICIAL: Record<TipoWidget, number> = {
  voz: 0,
  livre: 0,
  central: 0,
  compromisso: 0,
  cofrinho: 0,
};

export default function PerfilScreen() {
  const { ligado, flag } = useFlags();
  const { paddingConteudo } = useTabBarInset();
  const { session, signOut } = useSession();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const { valoresVisiveis: widgetValoresVisiveis, toggle: toggleWidgetValores } = useWidgetPrivacy();
  const { isDemoMode, toggleDemoMode } = useDemo();
  const { ativo: lockAtivo, disponivel: lockDisponivel, alternar: alternarLock } = useAppLock();
  const { bloqueado: capturaBloqueada, disponivel: capturaDisponivel, alternar: alternarCaptura } = useScreenCapture();
  const router = useRouter();

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [categoriasOpen, setCategoriasOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs | null>(null);
  const [excluirAberto, setExcluirAberto] = useState(false);
  /* A saída pode levar alguns segundos quando a rede ou o push demoram (ver
     lib/sair-da-conta.ts). Sem isto o diálogo fechava e nada indicava que o
     app estava saindo (achado A64). */
  const [saindo, setSaindo] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  /* Começa pelo que a sessão LOCAL já sabe, sem esperar a rede. Antes começava
     vazio, e a tela mostrava "Diagnóstico inicial" até o `getUser` voltar, para
     então trocar para "Diagnóstico financeiro" (achado G12). */
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCarregado | null>(() =>
    diagnosticoDosMetadados(session?.user.user_metadata)
  );
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [nomeOpen, setNomeOpen] = useState(false);
  const [nomeRascunho, setNomeRascunho] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  /* Quantas cópias do widget de voz estão na tela inicial. Relido a cada foco
     porque a pessoa pode ter adicionado (ou removido) fora do app. */
  const [widgetsInstalados, setWidgetsInstalados] = useState<Record<TipoWidget, number>>(
    CONTAGEM_WIDGETS_INICIAL
  );
  const nomeModalRef = useRef<View>(null);
  const reduzirMovimento = useReducedMotion();
  /* Os modais que compartilham `reauthScrim` centralizam um card sem
     rolagem, e dois deles abrem com `autoFocus` num campo de texto — em tela
     curta o teclado cobria o botão de confirmar, inclusive o "Excluir
     definitivamente", sem como rolar até ele. Reduzir a altura útil do scrim
     faz o `justifyContent: 'center'` recentrar o card no espaço que sobrou.
     Usa o hook da casa em vez de KeyboardAvoidingView de propósito: desde o
     SDK 54 o edge-to-edge não redimensiona a janela no Android e o KAV empilha
     folga sobre folga (ver o comentário em components/Sheet.tsx). */
  const alturaTecladoModais = useKeyboardHeight();
  useModalAccessibility(nomeModalRef, nomeOpen, () => setNomeOpen(false));


  function triggerToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  async function handlePerformSignOut() {
    if (saindo) return;
    setSaindo(true);
    try {
      await signOut();
    } finally {
      setSaindo(false);
    }
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

  const recarregarPerfil = useCallback(async () => {
    setPerfil(await carregarPerfil());
  }, []);

  const recarregarDiagnostico = useCallback(async () => {
    setDiagnostico(await carregarDiagnostico());
  }, []);

  const recarregarWidgets = useCallback(() => {
    if (!widgetDisponivel) return;
    setWidgetsInstalados({
      voz: quantidadeInstalada('voz'),
      livre: quantidadeInstalada('livre'),
      central: quantidadeInstalada('central'),
      compromisso: quantidadeInstalada('compromisso'),
      cofrinho: quantidadeInstalada('cofrinho'),
    });
  }, []);

  useEffect(() => {
    recarregarPerfil();
    recarregarDiagnostico();
    carregarNotifPrefs().then(setNotifPrefs);
    recarregarWidgets();
  }, [recarregarPerfil, recarregarDiagnostico, recarregarWidgets]);

  useEffect(() => {
    if (!widgetDisponivel) return;
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recarregarWidgets();
    });
    return () => assinatura.remove();
  }, [recarregarWidgets]);

  /**
   * Pede ao launcher pra fixar o widget. Nem todo launcher implementa isso —
   * quando não implementa, o caminho honesto é ensinar o gesto manual em vez
   * de deixar um botão que não faz nada.
   */
  async function adicionarWidget(tipo: TipoWidget) {
    const configuracao = WIDGETS_HOME.find((widget) => widget.tipo === tipo)!;
    /* A permissão vem ANTES de oferecer o widget, e não depois de ele falhar:
       o widget lança dinheiro sem abrir tela nenhuma, e a notificação é o
       recibo inteiro — é ela que diz o que foi salvo, é dela que sai o
       "Desfazer", e é ela que carrega os botões de encerrar/cancelar enquanto
       o microfone está aberto. Sem isso ele se recusa a gravar, então
       instalar primeiro e descobrir depois seria entregar um botão morto. */
    if (tipo === 'voz') {
      /* As duas permissões, não só a notificação: o serviço nativo
         (GranaVoiceCaptureService.iniciar()) checa RECORD_AUDIO ANTES de
         checar notificação, e devolve o mesmo silêncio-com-flash-de-atencao
         pras duas faltas. Pedir só a notificação aqui deixava o microfone
         sempre recusando pra quem nunca tinha usado o botão de voz dentro do
         app antes (só ele pedia RECORD_AUDIO) — a pessoa tocava, via um
         piscar rápido de "ouvindo" e nada mais, sem entender por quê. */
      const podeGravar = (await requestRecordingPermissionsAsync()).granted;
      if (!podeGravar) {
        Alert.alert(
          'Autorize o microfone primeiro',
          'O widget de voz precisa do microfone pra gravar. Autorize o acesso ao microfone do Grana. nas configurações do aparelho e tente de novo.'
        );
        return;
      }
      const podeAvisar = await requestNotificationPermission();
      if (!podeAvisar) {
        Alert.alert(
          'Ative as notificações primeiro',
          'O widget lança sem abrir o app, e a notificação é o seu comprovante: é nela que aparece o que foi lançado, o botão de desfazer e o de encerrar a gravação. Sem ela o widget não grava. Autorize as notificações do Grana. nas configurações do aparelho e tente de novo.'
        );
        return;
      }
      if (estadoWidgetVoz() === 'atencao') definirEstadoWidgetVoz('ocioso');
    }

    if (quantidadeInstalada(tipo) > 0) {
      recarregarWidgets();
      Alert.alert(
        'Widget já está na tela inicial',
        'Você já pode usá-lo. Para remover, segure o widget na tela inicial e arraste.'
      );
      return;
    }
    if (!podeFixar(tipo) || !fixarNaTelaInicial(tipo)) {
      Alert.alert(
        'Adicione pela tela inicial',
        `Seu launcher não permite adicionar por aqui. Segure um espaço vazio da tela inicial, toque em "Widgets" e procure por "${configuracao.nomeNoLauncher}".`
      );
      return;
    }
    /* O launcher mostra o próprio diálogo de confirmação; só dá pra saber se
       a pessoa aceitou relendo a contagem depois. */
    setTimeout(recarregarWidgets, 1500);
  }

  /** O push diário sincroniza a preferência no servidor; em Expo Go ou numa
   * falha de cadastro, a janela local assume sem criar notificações duplas.
   * Contas e faturas continuam sendo lembretes locais independentes. */
  async function alterarNotifPrefs(mudanca: Partial<NotifPrefs>) {
    if (!notifPrefs || isDemoMode) return;
    const novasPrefs = { ...notifPrefs, ...mudanca };
    setNotifPrefs(novasPrefs);
    await salvarNotifPrefs(novasPrefs);

    if ('lembreteDiarioAtivo' in mudanca || 'horario' in mudanca || 'almocoAtivo' in mudanca) {
      try {
        const resultado = session?.user.id
          ? await sincronizarPushHabito(session.user.id, novasPrefs)
          : 'fallback-local';
        if (resultado === 'fallback-local' && novasPrefs.lembreteDiarioAtivo) {
          const transacoes = await fetchTransactions({ sinceDays: 35 });
          const { streak } = calculateStreakAndWeek(transacoes);
          const jaLancouHoje = transacoes.some((t) => t.occurred_on === todayISO());
          const ultimaData = transacoes[0]?.occurred_on;
          const diasInativo = ultimaData
            ? Math.floor((Date.now() - new Date(`${ultimaData}T00:00:00`).getTime()) / 86400000)
            : 99;
          await scheduleDailyHabitReminder({ ...novasPrefs.horario, jaLancouHoje, streak, diasInativo, almocoAtivo: novasPrefs.almocoAtivo });
        }
      } catch {
        Alert.alert(
          'Não foi possível atualizar os lembretes',
          'Confira sua conexão e tente de novo. O Grana. tentará sincronizar novamente quando o app abrir.'
        );
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
        /* Mesma conta da tela de Crédito: fatura pelo ciclo de cada cartão, e
           lembrete enquanto faltar pagar alguma coisa. Até 16/09/2026 isto
           somava pelo mês civil e tratava qualquer pagamento como quitação. */
        const faturas = lembretesDeFatura(transacoes, cards, payments, todayISO());

        if (novasPrefs.lembretesContasAtivo) {
          const granted = await requestNotificationPermission();
          if (!granted) return;
          bills.forEach((bill) => { scheduleBillReminders(bill).catch(() => {}); });
          faturas.forEach(({ cartao, year, month, restante }) => {
            if (restante > 0) {
              scheduleCardInvoiceReminders(cartao, year, month, restante).catch(() => {});
            } else {
              cancelCardInvoiceReminders(cartao.id, year, month).catch(() => {});
            }
          });
        } else {
          bills.forEach((bill) => { cancelBillReminders(bill.id).catch(() => {}); });
          faturas.forEach(({ cartao, year, month }) => { cancelCardInvoiceReminders(cartao.id, year, month).catch(() => {}); });
        }
      } catch {
        // Falha graciosa — contas.tsx/credito.tsx reagendam certinho no próximo load
      }
    }
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
    /* Guarda no ponto de AÇÃO, não só no botão: `escolherFoto` também é
       chamada de outros lugares, e o upload é o que depende do Storage do
       Supabase. Bloquear aqui cobre todos os caminhos de uma vez. A REMOÇÃO
       de foto continua liberada — é ação de saída. */
    if (!ligado('foto_perfil')) {
      const f = flag('foto_perfil');
      Alert.alert(
        f?.titulo ?? 'Foto de perfil indisponível',
        f?.mensagem ?? 'O envio de foto está passando por instabilidade e voltará em breve.'
      );
      return;
    }

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
  /* O nome também já vem na sessão local. Sem ele, até o `carregarPerfil`
     voltar da rede, o cabeçalho mostrava o e-mail no lugar do nome e a
     inicial do e-mail no avatar, e os dois trocavam na frente da pessoa. */
  const nomeLocal = typeof session?.user.user_metadata?.nome === 'string' ? session.user.user_metadata.nome : '';
  const nomeExibido = nomeDeExibicao(perfil) || nomeLocal || userEmail.split('@')[0] || userEmail;
  const initial = (perfil?.nome || nomeLocal || userEmail)[0]?.toUpperCase() ?? 'G';


  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.paper }}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, colunaConteudo, { paddingBottom: paddingConteudo }]}>
        {/* Saída explícita.
            O Perfil é registrado com `href: null` em `_layout.tsx`, então ele
            não aparece na barra de abas: entra-se por um `router.push` (avatar
            da Início, item da lateral no desktop) e, sendo tecnicamente uma
            aba, o gesto de arrastar da borda não funciona ali. Sem este botão
            a única saída era tocar uma aba lá embaixo, que não é "voltar" —
            é começar outra coisa. `canGoBack` cobre o caso de o Perfil ter
            sido aberto por link direto, quando não há histórico para desfazer. */}
        <View style={styles.voltarLinha}>
          <HeaderAction
            icon="arrow-back"
            label="Voltar"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityLabel="Voltar para a tela anterior"
          />
        </View>

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
                <Image
                  source={{ uri: perfil.fotoUrl }}
                  style={styles.avatarFoto}
                  contentFit="cover"
                  cachePolicy="disk"
                  accessibilityLabel="Foto de perfil"
                />
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
          {/* Só a REMOÇÃO mora aqui, e ela continua liberada mesmo com o
              interruptor desligado: é ação de saída, e travar isso prenderia a
              pessoa num estado que ela quer desfazer. O que o flag bloqueia é
              o envio de foto nova (ver OnboardingModal). */}
          {perfil?.fotoUrl && (
            <AppPressable style={styles.tappableRow} onPress={confirmarRemocaoFoto}>
              <Text style={styles.rowKey}>Foto de perfil</Text>
              <Text style={styles.rowValue}>Remover &gt;</Text>
            </AppPressable>
          )}
          <View style={styles.row}>
            <Text style={[styles.rowKey, !ligado('lembretes') && styles.rowKeyDesativado]}>
              Lembretes de vencimento
            </Text>
            <Text style={styles.rowValue}>{ligado('lembretes') ? 'Ativados' : 'Instável'}</Text>
          </View>
          <AppPressable style={[styles.tappableRow, { borderBottomWidth: 0 }]} onPress={() => setFeedbackOpen(true)}>
            <Text style={styles.rowKey}>Enviar feedback ou sugestão</Text>
            <Text style={styles.rowValue}>Abrir &gt;</Text>
          </AppPressable>
        </View>

        {/* O Android também lista estes itens no seletor nativo, mas esta
            vitrine deixa claro o que cada tamanho resolve e tenta fixá-lo com
            um toque nos launchers compatíveis. */}
        {widgetDisponivel && (
          <>
            <Text style={styles.sectionLabel}>Widgets da tela inicial</Text>
            <AppPressable onPress={async () => {
              try {
                const { ExpoSpeechRecognitionModule: motor } = await import('expo-speech-recognition');
                if (!motor.supportsOnDeviceRecognition()) {
                  Alert.alert('Voz offline indisponível', 'Este aparelho não oferece reconhecimento local compatível.');
                  return;
                }
                await motor.androidTriggerOfflineModelDownload({ locale: 'pt-BR' });
                Alert.alert('Português offline', 'Download solicitado ao Android. Aguarde a instalação com conexão antes de usar sem internet.');
              } catch {
                Alert.alert('Não foi possível preparar', 'Verifique a conexão e o serviço de reconhecimento de voz do Android.');
              }
            }}>
              <Text style={styles.rowKey}>Preparar português para voz offline</Text>
            </AppPressable>
            <View style={styles.sectionCard}>
              {WIDGETS_HOME.map((widget, index) => {
                const vozDesativada = widget.tipo === 'voz' && !ligado('lancamento_voz');
                const instalado = widgetsInstalados[widget.tipo] > 0;
                return (
                  <AppPressable
                    key={widget.tipo}
                    style={[styles.widgetRow, index === WIDGETS_HOME.length - 1 && styles.ultimaLinha]}
                    onPress={() => adicionarWidget(widget.tipo)}
                    disabled={vozDesativada}
                    accessibilityState={{ disabled: vozDesativada }}
                    accessibilityLabel={`${widget.titulo}, widget ${widget.tamanho}`}
                  >
                    <View style={styles.widgetRowCopy}>
                      <Text style={[styles.rowKey, vozDesativada && styles.rowKeyDesativado]}>
                        {widget.titulo} · {widget.tamanho}
                      </Text>
                      <Text style={styles.widgetRowHint}>{widget.descricao}</Text>
                    </View>
                    <Text style={styles.rowValue}>
                      {vozDesativada ? 'Instável' : instalado ? 'Adicionado ✓' : 'Adicionar'} &gt;
                    </Text>
                  </AppPressable>
                );
              })}
            </View>

            {/* Widgets de resumo (Livre pra Gastar, Cofrinho, Próximo
                Compromisso) mostram saldo/fatura na tela inicial sem exigir
                desbloqueio — exposição diferente da que o modo privacidade
                do app cobre, por isso nasce OCULTO por padrão (ver
                lib/widget-privacy-context.tsx) até a pessoa ligar aqui. */}
            <View style={styles.sectionCard}>
              <View style={styles.row}>
                <Text style={styles.rowKey}>Mostrar valores nos widgets</Text>
                <ToggleSwitch
                  value={widgetValoresVisiveis}
                  onToggle={toggleWidgetValores}
                  label="Mostrar valores nos widgets"
                />
              </View>
            </View>
          </>
        )}

        {/* Seção Preferências */}
        <Text style={styles.sectionLabel}>Preferências</Text>
        <View style={styles.sectionCard}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>Moeda</Text>
            <Text style={styles.rowValue}>Real (R$)</Text>
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
                <View style={[styles.rowInterna, { marginTop: spacing.md }]}>
                  <Text style={styles.rowKey}>Lembrete na hora do almoço (dias úteis, 12h)</Text>
                  <ToggleSwitch
                    value={notifPrefs?.almocoAtivo ?? true}
                    onToggle={() => alterarNotifPrefs({ almocoAtivo: !notifPrefs?.almocoAtivo })}
                    label="Lembrete na hora do almoço"
                  />
                </View>
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

          {ligado('orcamento_sugerido') && (
            <AppPressable style={styles.tappableRow} onPress={() => setTemplatesOpen(true)}>
              <Text style={styles.rowKey}>Orçamento sugerido</Text>
              <Text style={styles.rowValue}>Aplicar template &gt;</Text>
            </AppPressable>
          )}

          {diagnostico && (
            <View style={styles.row}>
              <Text style={styles.rowKey}>Perfil financeiro</Text>
              <Text style={styles.rowValue}>
                {diagnostico.arquetipo.emoji} {diagnostico.arquetipo.nome}
              </Text>
            </View>
          )}

          {ligado('diagnostico') && (
            <AppPressable style={styles.tappableRow} onPress={() => setOnboardingOpen(true)}>
              <Text style={styles.rowKey}>{diagnostico ? 'Diagnóstico financeiro' : 'Diagnóstico inicial'}</Text>
              <Text style={styles.rowValue}>Refazer diagnóstico &gt;</Text>
            </AppPressable>
          )}
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

        {/* Ações da Conta: baixar os dados, sair e excluir.

            "Baixar meus dados" atende o artigo 18 da LGPD que a própria
            Política de Privacidade cita ("confirmar a existência e acessar os
            dados que temos sobre você"): até 23/09/2026 não havia como fazer
            isso em lugar nenhum do app. O mesmo botão está na tela de
            assinatura, para quem perdeu o acesso. */}
        <View style={{ gap: 10, marginTop: spacing.md }}>
          <BaixarMeusDadosBotao />
          <AppPressable
            style={({ hovered }) => [styles.signOutBtn, hovered && styles.signOutBtnHover]}
            onPress={confirmSignOut}
            disabled={saindo}
            accessibilityState={{ busy: saindo, disabled: saindo }}
          >
            {saindo ? (
              <ActivityIndicator color={theme.ink} size="small" accessibilityLabel="Saindo da conta" />
            ) : (
              <Text style={styles.signOutText}>Sair da conta</Text>
            )}
          </AppPressable>

          <AppPressable
            style={({ hovered }) => [styles.deleteBtn, hovered && styles.deleteBtnHover]}
            onPress={() => setExcluirAberto(true)}
          >
            <Text style={styles.deleteText}>Excluir conta e dados</Text>
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
        modo="diagnostico"
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
      <AppModal visible={nomeOpen} animationType={reduzirMovimento ? 'none' : 'fade'} transparent onRequestClose={() => setNomeOpen(false)}>
        <ScrollView
          style={styles.reauthScrimFundo}
          contentContainerStyle={[styles.reauthScrim, { paddingBottom: spacing.xl + alturaTecladoModais }]}
          keyboardShouldPersistTaps="handled"
        >
          <View ref={nomeModalRef} style={styles.reauthCard} accessibilityViewIsModal role="dialog" focusable>
            <Text style={styles.reauthTitle}>Como podemos te chamar?</Text>
            <Text style={styles.reauthText}>
              Usamos esse nome aqui no perfil e nas mensagens de lembrete de vencimento.
            </Text>
            <TextInput
              accessibilityLabel="Seu nome ou apelido"
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
        </ScrollView>
      </AppModal>

      <ExcluirContaSheet visible={excluirAberto} onClose={() => setExcluirAberto(false)} />

      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /* Rótulo de linha desativada por interruptor remoto: mesma família e
     tamanho, só recuado em cor — a linha continua legível, e o motivo vem do
     valor à direita ("Instável") e do pop-up de aviso. */
  rowKeyDesativado: { color: theme.inkFaint },
  rowColuna: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule, gap: spacing.xs },
  rowInterna: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowAjuda: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: lh(type.legenda), paddingRight: spacing.lg, fontFamily: fonts.light },
  avatarFoto: { width: '100%', height: '100%', borderRadius: 999 },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.paper,
  },
  nomeSalvar: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  nomeSalvarTexto: { color: theme.paper, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  /* O scrim dos quatro modais do Perfil é um ScrollView, não uma View.
     `justifyContent: 'center'` centraliza enquanto o cartão CABE, e é o que
     estava aqui; o que faltava era o que acontece quando ele não cabe. No
     cartão de reautenticação — parágrafo longo + campo de senha + dois botões —
     num aparelho baixo com o teclado aberto sobra pouco mais de 250pt, e uma
     View centralizada estoura para os dois lados: "Excluir definitivamente"
     sai por baixo e não existe gesto que o traga de volta. Com `flexGrow` no
     conteúdo de um ScrollView vale o comportamento dos dois mundos:
     centralizado quando cabe, rolável quando não cabe. */
  reauthScrimFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  reauthScrim: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  reauthInput: { borderWidth: 1, borderColor: theme.rule, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: type.corpo, color: theme.ink, backgroundColor: theme.paper, fontFamily: fonts.regular },
  reauthCard: { width: '100%', maxWidth: 400, backgroundColor: theme.paperRaised, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: theme.rule },
  reauthTitle: { color: theme.ink, fontSize: type.titulo,
  lineHeight: lh(type.titulo, 'titulo'), fontFamily: fonts.regular },
  reauthText: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.light },
  reauthCancel: { paddingVertical: spacing.md, alignItems: 'center' },
  reauthCancelText: { color: theme.inkSoft, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.light },
  container: { flex: 1, backgroundColor: theme.paper },
  /* paddingBottom vem do useTabBarInset() no JSX — depende da barra flutuante. */
  /* Era 20/16 — um degrau acima das outras seis telas, que usam 16/12. O
     Perfil foi a única que nunca entrou no `screenRhythm`, e dava pra ver
     trocando de aba: o corpo deslocava. É exatamente o sintoma que o token
     nasceu pra matar. */
  content: { padding: screenRhythm.padding, gap: screenRhythm.gap },
  /* `alignItems: flex-start` para a pílula não esticar até a largura toda:
     ela é um botão, não uma barra. */
  voltarLinha: { alignItems: 'flex-start', marginTop: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.paperRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.rule },
  avatarText: { color: theme.ink, fontSize: type.destaque,
  lineHeight: lh(type.destaque, 'valor'), fontFamily: fonts.regular },
  name: { color: theme.ink, fontSize: type.corpo,
  lineHeight: lh(type.corpo, 'corpo'), fontFamily: fonts.regular },
  sub: { color: theme.inkFaint, fontSize: type.nota,
  lineHeight: lh(type.nota, 'corpo'), marginTop: spacing.fio, fontFamily: fonts.light },
  sectionLabel: { color: theme.inkFaint, fontSize: type.legenda,
  lineHeight: lh(type.legenda, 'apoio'), letterSpacing: 0.5, marginTop: spacing.sm, fontFamily: fonts.light },
  sectionCard: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, paddingHorizontal: spacing.md },
  /* Os `13` daqui NÃO são a escala de espaço esquecida — são ALTURA DE LINHA
     de um item tocável, e cada linha destas é um alvo de toque. Trocar por
     `spacing.md` encolhe todas as linhas de ajuste de uma vez; se um dia for
     pra mexer, o caminho é `minHeight: touchTarget`, não arredondar o padding
     pro token mais próximo. Mesmo caso do `14` dos botões primários. */
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  tappableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  widgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.rule },
  ultimaLinha: { borderBottomWidth: 0 },
  widgetRowCopy: { flex: 1, gap: spacing.fio },
  widgetRowHint: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.light },
  /* `flex: 1` — sem isso, um rótulo mais comprido que os vizinhos não quebra
     linha: cresce pela largura do texto e empurra o Switch da linha para
     fora do eixo dos outros (visto no rótulo do lembrete de almoço).
     Rótulos curtos ficam iguais a antes. */
  rowKey: { flex: 1, flexShrink: 1, marginRight: spacing.md, color: theme.ink, fontSize: type.apoio,
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

