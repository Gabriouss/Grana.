import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Alert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { hapticSuccess } from '@/lib/haptics';
import { MAX_SEGUNDOS_GRAVACAO, mensagemDeErroVoz, transcreverAudio } from '@/lib/voz';
import AppPressable from './AppPressable';

/* Voz de lançamento, não música: mono e bitrate baixo. 20 segundos saem em
   torno de 150 KB, bem abaixo do teto de 2 MB da Edge Function, e o Whisper
   reamostra pra 16 kHz do lado dele de qualquer jeito — subir estéreo em
   128 kbps só gastaria upload da pessoa sem melhorar transcrição nenhuma.
   A taxa de amostragem fica em 44.1 kHz de propósito: é a que todo aparelho
   Android aceita sem reclamar, e baixar dela é o tipo de economia que troca
   alguns KB por risco de gravação falhando em fabricante específico. */
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
};

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
  label,
  style,
  hoverStyle,
  textStyle,
  iconSize = 17,
  iconColor = theme.accent2,
}: {
  onTranscribed: (text: string) => void;
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
  const gravador = useAudioRecorder(GRAVACAO_VOZ);
  /* O corte automático existe pra fala esquecida: se o toque de encerrar nunca
     vier (bolso, distração), a gravação para sozinha em vez de virar um
     arquivo grande demais pro teto da função. */
  const cortePorTempo = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Barra o segundo toque enquanto o primeiro ainda está abrindo o microfone:
     `gravando` só vira true depois do await, e dois toques rápidos criavam
     duas preparações concorrentes no mesmo gravador. */
  const ocupado = useRef(false);

  useEffect(() => {
    return () => {
      if (cortePorTempo.current) clearTimeout(cortePorTempo.current);
    };
  }, []);

  async function encerrarEEnviar() {
    if (cortePorTempo.current) {
      clearTimeout(cortePorTempo.current);
      cortePorTempo.current = null;
    }
    setGravando(false);
    setEnviando(true);
    try {
      await gravador.stop();
      const uri = gravador.uri;
      if (!uri) {
        const msg = mensagemDeErroVoz('audio_ausente');
        Alert.alert(msg.titulo, msg.texto);
        return;
      }
      const resultado = await transcreverAudio(uri);
      if (!resultado.ok) {
        const msg = mensagemDeErroVoz(resultado.codigo);
        Alert.alert(msg.titulo, msg.texto);
        return;
      }
      hapticSuccess();
      onTranscribed(resultado.transcript);
    } catch (e: any) {
      if (__DEV__) console.warn('[voz:diag] botao lancou', e?.name, String(e?.message ?? e));
      const msg = mensagemDeErroVoz('erro_interno');
      Alert.alert(msg.titulo, msg.texto);
    } finally {
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
  active: { backgroundColor: '#bb6b60', borderColor: '#bb6b60' },
  label: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },
  labelActive: { color: theme.paper },
});
