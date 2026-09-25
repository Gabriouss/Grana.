import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Alert } from '@/lib/alert';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { hapticSuccess } from '@/lib/haptics';
import { MAX_SEGUNDOS_GRAVACAO, mensagemDeErroVoz } from '@/lib/voz';
import { amplitudeDoMetering, criarDetectorDeSilencio, gravacaoValida, INTERVALO_AMOSTRA_MS } from '@/lib/voz-captura';
import AppPressable from './AppPressable';
import AppDialog from './AppDialog';
import { randomUUID } from 'expo-crypto';
import { executarTarefa } from '@/lib/widget-voz-task';

/* Voz de lançamento, não música: mono e bitrate baixo. 20 segundos saem em
   torno de 150 KB, bem abaixo do teto de 2 MB da Edge Function, e o Whisper
   reamostra pra 16 kHz do lado dele de qualquer jeito — subir estéreo em
   128 kbps só gastaria upload da pessoa sem melhorar transcrição nenhuma.
   A taxa de amostragem fica em 44.1 kHz de propósito: é a que todo aparelho
   Android aceita sem reclamar, e baixar dela é o tipo de economia que troca
   alguns KB por risco de gravação falhando em fabricante específico. */
/* `stop()` é local (sem rede): 5s é folga generosa, não um orçamento de
   transcrição. */
const PRAZO_PARAR_GRAVACAO_MS = 5_000;

const GRAVACAO_VOZ: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
  /* Lê o volume para encerrar no silêncio, como o widget (lib/voz-captura.ts). */
  isMeteringEnabled: true,
};

/* Áudio financeiro não fica no aparelho. Mesmo descarte do widget
   (`apagarArquivo` em lib/widget-voz-task.ts). */
async function descartarAudio(uri: string) {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Já sumiu, ou o sistema limpou o cache: nada a fazer.
  }
}

/* Tamanho do arquivo gravado, ou `null` se não der para ler. Na web o
   `expo-audio` devolve um blob, sem arquivo para medir. */
async function tamanhoDoAudio(uri: string): Promise<number | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { File } = await import('expo-file-system');
    const arquivo = new File(uri);
    return arquivo.exists ? arquivo.size : 0;
  } catch {
    return null;
  }
}

/**
 * Botão de lançamento por voz: toque para começar a falar (ex: "Almoço de 38
 * reais no débito hoje"), toque de novo para parar. O texto transcrito é
 * repassado pra fora — quem usa este botão decide o que fazer com ele, mas o
 * caminho esperado é jogar direto em lib/heuristics.ts, o mesmo motor que já
 * interpreta texto colado de comprovante.
 *
 * A transcrição é o MESMO Whisper do bot do WhatsApp, via a Edge Function
 * `processar-lancamento-voz` (ver lib/voz.ts). Antes disto o app usava
 * `expo-speech-recognition`, reconhecimento do próprio aparelho: outro motor,
 * outra qualidade, e um lançamento por voz que acertava menos que a mesma
 * frase mandada em áudio pelo WhatsApp. Como o áudio agora é só gravado (e
 * não reconhecido) no aparelho, o recurso também deixou de exigir development
 * build — `expo-audio` existe dentro do Expo Go.
 */
export default function VoiceEntryButton({
  onTranscribed,
  onSaved,
  label,
  style,
  hoverStyle,
  textStyle,
  iconSize = 17,
  iconColor = theme.accent2,
}: {
  onTranscribed: (text: string) => void;
  onSaved?: () => void;
  /** Com rótulo, vira uma pílula (ex: ao lado de "Colar comprovante" no Início). Sem rótulo, vira só o ícone (ex: cabeçalho de Lançamentos). */
  label?: string;
  /** Sobrepõe o formato/cor padrão do botão — use para igualar a família visual de onde ele entra (ex: styles.smartActionBtn no Início). */
  style?: StyleProp<ViewStyle>;
  /** Estilo aplicado só no hover (web), somado ao `style` — espelha o padrão `hovered && stylesXHover` do resto do app. */
  hoverStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  iconSize?: number;
  /** Cor do ícone parado. O padrão é o menta do HeaderAction, que é a
   *  vizinhança mais comum deste botão (cabeçalho do Lançamentos). Na Início
   *  ele entra numa fileira cujos ícones são `theme.ink`, e lá esta prop
   *  precisa ser passada — foi exatamente por fixar a cor no componente que
   *  o botão passou a destoar de um lado ao ser acertado do outro. */
  iconColor?: string;
}) {
  const [gravando, setGravando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [avisoVoz, setAvisoVoz] = useState<{ titulo: string; texto: string } | null>(null);
  const gravador = useAudioRecorder(GRAVACAO_VOZ);
  /* O corte automático existe pra fala esquecida: se o toque de encerrar nunca
     vier (bolso, distração), a gravação para sozinha em vez de virar um
     arquivo grande demais pro teto da função. */
  const cortePorTempo = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Encerra sozinho depois de 1,6s de silêncio, quando já houve fala. É a
     mesma regra do widget, com os mesmos números (lib/voz-captura.ts). */
  const amostrador = useRef<ReturnType<typeof setInterval> | null>(null);
  /* Barra o segundo toque enquanto o primeiro ainda está abrindo o microfone:
     `gravando` só vira true depois do await, e dois toques rápidos criavam
     duas preparações concorrentes no mesmo gravador. */
  const ocupado = useRef(false);
  const encerrando = useRef(false);

  useEffect(() => {
    return () => {
      if (cortePorTempo.current) clearTimeout(cortePorTempo.current);
      if (amostrador.current) clearInterval(amostrador.current);
    };
  }, []);

  async function encerrarEEnviar() {
    if (encerrando.current) return;
    encerrando.current = true;
    if (cortePorTempo.current) {
      clearTimeout(cortePorTempo.current);
      cortePorTempo.current = null;
    }
    if (amostrador.current) {
      clearInterval(amostrador.current);
      amostrador.current = null;
    }
    setGravando(false);
    setEnviando(true);
    try {
      /* `stop()` é uma chamada nativa local, sem rede — alguns segundos bastam
         de sobra. Sem prazo aqui, um `stop()` que nunca resolve prendia o
         botão em "Transcrevendo…" indefinidamente, e nenhum timeout de
         lib/voz.ts chegava a rodar, porque `executarTarefa` nem era chamado
         (achado A47, visto no emulador em 19/09/2026: mais de 4 minutos
         parado). O `.catch` solto no `pararGravacao` original evita que uma
         resolução tardia dele suba como rejeição sem dono. */
      const pararGravacao = gravador.stop();
      pararGravacao.catch(() => {});
      let parouDireito = true;
      try {
        await Promise.race([
          pararGravacao,
          new Promise<never>((_, rejeitar) => {
            setTimeout(() => rejeitar(new Error('parar_gravacao_travou')), PRAZO_PARAR_GRAVACAO_MS);
          }),
        ]);
      } catch (e: any) {
        if (e?.message === 'parar_gravacao_travou') throw e;
        /* `stop()` lança quando a gravação foi curta demais para o encoder
           fechar um arquivo: toque duplo sem querer. Igual ao widget, não é
           erro a relatar, é "não falou nada". */
        parouDireito = false;
      }
      const uri = gravador.uri;
      if (!uri) {
        if (!parouDireito) return;
        const msg = mensagemDeErroVoz('audio_ausente');
        Alert.alert(msg.titulo, msg.texto);
        return;
      }
      /* Mesma régua do widget: arquivo que não passa de 1 KB não é fala, e
         volta ao repouso sem aviso, sem gastar transcrição. */
      const tamanho = await tamanhoDoAudio(uri);
      if (!parouDireito || (tamanho !== null && !gravacaoValida(tamanho))) {
        await descartarAudio(uri);
        return;
      }
      /* Mesma execução do widget, com o mesmo prazo de rede (lib/voz.ts).
         Este adaptador só apresenta o recibo na tela. */
      await executarTarefa({ caminho: uri, requestId: randomUUID(), source: 'app' }, {
        podeNotificar: async () => true,
        notificarRevisao: async (titulo, texto) => {
          Alert.alert(titulo, 'Confira os dados antes de salvar. Se o valor estiver em branco, informe quanto você falou.');
          onTranscribed(texto);
        },
        notificarSucesso: async (dados) => {
          hapticSuccess();
          onSaved?.();
          Alert.alert(dados.titulo, dados.texto, [
            { text: 'OK' },
            { text: 'Desfazer', onPress: () => {
              if (!dados.operationId) return;
              void import('@/lib/voice-operations').then(async ({ desfazerOperacaoVoz }) => {
                await desfazerOperacaoVoz(dados.operationId!);
                onSaved?.();
              }).catch((erro) => { console.warn('[voz] desfazer falhou', erro); Alert.alert('Não foi possível desfazer', 'Tente novamente na lista de lançamentos.'); });
            } },
          ]);
        },
        notificarFalha: async (codigo) => {
          const msg = mensagemDeErroVoz(codigo);
          if (codigo === 'nao_entendi') setAvisoVoz(msg);
          else Alert.alert(msg.titulo, msg.texto);
        },
        notificarSalvoLocal: async () => { Alert.alert('Salvo no aparelho', 'O lançamento será sincronizado quando houver conexão.'); },
        notificarPendenteOffline: async () => { Alert.alert('Áudio salvo no aparelho', 'O reconhecimento será retomado quando houver conexão.'); },
      });
    } catch (e: any) {
      if (__DEV__) console.warn('[voz:diag] botao lancou', e?.name, String(e?.message ?? e));
      if (e?.message === 'parar_gravacao_travou') {
        Alert.alert('Não consegui encerrar a gravação', 'Toque no microfone para tentar de novo.');
      } else {
        const msg = mensagemDeErroVoz('erro_interno');
        Alert.alert(msg.titulo, msg.texto);
      }
    } finally {
      encerrando.current = false;
      setEnviando(false);
      ocupado.current = false;
    }
  }

  async function handlePress() {
    if (enviando) return;
    if (gravando) {
      await encerrarEEnviar();
      return;
    }
    if (ocupado.current) return;
    ocupado.current = true;

    try {
      const atual = await getRecordingPermissionsAsync();
      if (atual.status === 'undetermined') {
        ocupado.current = false;
        Alert.alert(
          'Use o microfone para lançar',
          'O Grana. grava apenas esta fala para transcrever o lançamento. O áudio é apagado depois do processamento.',
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Continuar', onPress: () => void iniciarGravacao() },
          ]
        );
        return;
      }
    } catch {
      /* Se o aparelho não informar o estado atual, o pedido do sistema abaixo
         continua sendo a fonte de verdade. */
    }
    ocupado.current = false;
    await iniciarGravacao();
  }

  async function iniciarGravacao() {
    if (ocupado.current) return;
    ocupado.current = true;

    try {
      const permissao = await requestRecordingPermissionsAsync();
      if (!permissao.granted) {
        ocupado.current = false;
        Alert.alert(
          'Permissão de microfone',
          'Para lançar por voz, autorize o microfone nas configurações do aparelho.'
        );
        return;
      }
      /* Sem isto o iOS grava em volume baixíssimo (a sessão de áudio fica em
         modo de reprodução) e o Whisper recebe quase silêncio. */
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await gravador.prepareToRecordAsync();
      gravador.record();
      setGravando(true);
      cortePorTempo.current = setTimeout(() => {
        void encerrarEEnviar();
      }, MAX_SEGUNDOS_GRAVACAO * 1000);
      const detector = criarDetectorDeSilencio();
      amostrador.current = setInterval(() => {
        let amplitude: number | null = null;
        try {
          amplitude = amplitudeDoMetering(gravador.getStatus().metering);
        } catch {
          // Sem leitura nesta amostra: não corta, tenta na próxima.
        }
        if (amplitude !== null && detector.amostrar(amplitude, Date.now())) void encerrarEEnviar();
      }, INTERVALO_AMOSTRA_MS);
    } catch {
      ocupado.current = false;
      setGravando(false);
      Alert.alert(
        'Microfone indisponível',
        'Não foi possível iniciar a gravação. Verifique se outro aplicativo está usando o microfone.'
      );
    }
  }

  const rotulo = enviando ? 'Transcrevendo…' : gravando ? 'Ouvindo…' : label;

  return (
    <>
      <AppPressable
      onPress={handlePress}
      accessibilityLabel={gravando ? 'Encerrar gravação e lançar' : 'Lançar por voz'}
      accessibilityState={{ busy: enviando }}
      style={({ hovered }) => [
        label ? styles.pill : styles.iconBtn,
        style,
        hovered && !gravando && !enviando && (hoverStyle ?? styles.hover),
        gravando && styles.active,
      ]}
      hitSlop={8}
    >
      {/* Parado, a cor vem da prop `iconColor` (menta por padrão).
          Gravando, inverte para o fundo escuro. */}
      {enviando ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <Ionicons name={gravando ? 'mic' : 'mic-outline'} size={iconSize} color={gravando ? theme.paper : iconColor} />
      )}
      {label && (
        <Text style={[styles.label, textStyle, gravando && styles.labelActive]}>{rotulo}</Text>
      )}
      </AppPressable>
      <AppDialog
        visible={!!avisoVoz}
        title={avisoVoz?.titulo ?? ''}
        message={avisoVoz?.texto ?? ''}
        confirmLabel="Entendi"
        onClose={() => setAvisoVoz(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  /* Espelha HeaderAction.base + comRotulo. Este botão fica lado a lado com
     eles na barra de ações do Lançamentos, e cada valor que divergia — gap,
     padding, e no rótulo a cor, o tamanho e o peso — somava uma diferença
     visível: a pílula da voz saía mais alta e o texto mais claro e pesado. */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  /* Espelha HeaderAction.soIcone: círculo de 36. O padding de 8 que ficava
     aqui dava a este botão um diâmetro próprio, e na barra do Lançamentos ele
     divide a linha com três HeaderAction — três círculos de um tamanho e um
     de outro. O alvo de toque vem do `hitSlop` de 8, não do diâmetro. */
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hover: { borderColor: theme.ruleStrong },
  /* Gravando NÃO é erro. `theme.danger` está documentado como perigo/atenção
     (excluir conta, fatura atrasada, falha de reautenticação), e pintar o
     estado "estou te ouvindo" com ele reconstruía o ponto vermelho de câmera
     dentro de uma paleta que a No-Red Rule mantém sem vermelho — o usuário
     via alarme onde o app estava só funcionando. `accent2` é o token mais
     claro da marca, então o botão fica igualmente impossível de ignorar, e o
     ícone/rótulo em `paper` (#052229 sobre #aeffe3) continua legível. */
  active: { backgroundColor: theme.accent2, borderColor: theme.accent2 },
  label: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },
  labelActive: { color: theme.paper },
});
