import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { RECIBOS_VOZ } from '@/lib/voz-recibos';
import { ActivityIndicator, AppState, Platform, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Alert } from '@/lib/alerta';
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
import { amplitudeDoMetering, criarDetectorDeSilencio, gravacaoValida, INTERVALO_AMOSTRA_MS, FONTE_ANDROID_VOZ } from '@/lib/voz-captura';
import { iniciarMonitoramentoCaptura, capturaSilenciada, pararMonitoramentoCaptura } from '@/modules/grana-voice-widget';
import AppPressable from './AppPressable';
import AppDialog from './AppDialog';
import { randomUUID } from 'expo-crypto';
import { executarTarefa } from '@/lib/widget-voz-task';
import type { DestinoRevisaoVoz } from '@/lib/avisos-banco/caixa-voz';
import { dataLocal, type ReferenciaDaFala } from '@/lib/data-da-fala';
import { File } from 'expo-file-system';
import * as FileSystemLegado from 'expo-file-system/legacy';

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
// Um único prazo para permissão, sessão de áudio e preparo.
const PRAZO_ABRIR_MICROFONE_MS = 20_000;

class PrazoDoMicrofoneEsgotado extends Error {}

async function noPrazoDoMicrofone<T>(trabalho: Promise<T>, fim: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      trabalho,
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new PrazoDoMicrofoneEsgotado()), Math.max(0, fim - Date.now()));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function avisarPrazoDaAbertura() {
  Alert.alert('Não consegui abrir o microfone', 'A abertura demorou demais e foi cancelada. Tente de novo em instantes.');
}

const GRAVACAO_VOZ: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac', audioSource: FONTE_ANDROID_VOZ },
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
    await FileSystemLegado.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    console.warn('[voz] áudio curto não foi apagado do cache', e);
  }
}

/* Tamanho do arquivo gravado, ou `null` se não der para ler. Na web o
   `expo-audio` devolve um blob, sem arquivo para medir.

   Import estático: até 26/09/2026 era `await import('expo-file-system')`, e no
   emulador, em desenvolvimento, o botão ficou mais de três minutos em
   "Transcrevendo…" com o `stop()` concluído em 0,8 s e a medição sem voltar
   (marcadores de tempo no logcat). Em desenvolvimento cada `import()` espera um
   pacote do Metro; o módulo já está no bundle (lib/voz.ts o importa), e não há
   por que esperar por ele aqui. */
function tamanhoDoAudio(uri: string): number | null {
  if (Platform.OS === 'web') return null;
  try {
    const arquivo = new File(uri);
    return arquivo.exists ? arquivo.size : 0;
  } catch (e) {
    console.warn('[voz] não deu para medir o áudio', e);
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
  onRevisaoNoSino,
  onSaved,
  label,
  style,
  hoverStyle,
  textStyle,
  iconSize = 17,
  iconColor = theme.accent2,
}: {
  /** `ref`: a data da captura, que a revisão usa para ler a data dita. */
  onTranscribed: (text: string, ref?: ReferenciaDaFala) => void;
  onRevisaoNoSino?: (destino: DestinoRevisaoVoz) => void;
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
  const microfoneSilenciado = useRef(false);
  /* A captura (data na voz, 30/09/2026): anotada quando a gravação COMEÇA e
     levada com a fala, para "ontem" contar do dia em que ela foi dita. É o
     mesmo par que o widget anota no Kotlin (regra 13). */
  const captura = useRef<{ capturadoEm: number; dataCaptura: string } | null>(null);
  /* Item 29: abrir o microfone espera permissão, sessão de áudio e preparo.
     Sair da tela, mandar o app para o fundo ou desmontar no meio disso
     abandona a abertura (`intencao` muda), e a resposta tardia não grava nem
     envia. Nova abertura espera o preparo ou o fechamento nativo anterior. */
  const focada = useIsFocused();
  const emFoco = useRef(focada);
  emFoco.current = focada;
  const montado = useRef(true);
  const intencao = useRef(0);
  const gravadorPendente = useRef(false);

  useEffect(() => {
    if (!focada) intencao.current++;
  }, [focada]);

  useEffect(() => {
    montado.current = true;
    // `inactive` é o diálogo de permissão do iOS; só o fundo abandona.
    const evento = AppState.addEventListener('change', (estado) => {
      if (estado === 'background') intencao.current++;
    });
    return () => {
      montado.current = false;
      intencao.current++;
      evento.remove();
      if (cortePorTempo.current) clearTimeout(cortePorTempo.current);
      if (amostrador.current) clearInterval(amostrador.current);
      pararMonitoramentoCaptura();
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
      let parouDireito = true;
      try {
        await noPrazoDoMicrofone(pararGravacao, Date.now() + PRAZO_PARAR_GRAVACAO_MS);
      } catch (erro) {
        if (erro instanceof PrazoDoMicrofoneEsgotado) {
          gravadorPendente.current = true;
          void pararGravacao
            .then(() => { if (gravador.uri) void descartarAudio(gravador.uri); })
            .catch((falha) => console.warn('[voz] encerramento tardio da gravação falhou', falha))
            .finally(() => { gravadorPendente.current = false; });
          throw erro;
        }
        /* `stop()` lança quando a gravação foi curta demais para o encoder
           fechar um arquivo: toque duplo sem querer. Igual ao widget, é "não
           falou nada", e ganha o recibo curto `naoOuvi` logo abaixo. */
        parouDireito = false;
      }
      const uri = gravador.uri;
      if (microfoneSilenciado.current || capturaSilenciada()) {
        if (uri) void descartarAudio(uri);
        Alert.alert(RECIBOS_VOZ.capturaInterrompida.titulo, RECIBOS_VOZ.capturaInterrompida.texto);
        return;
      }
      if (!uri) {
        if (!parouDireito) {
          Alert.alert(RECIBOS_VOZ.naoOuvi.titulo, RECIBOS_VOZ.naoOuvi.texto);
          return;
        }
        const msg = mensagemDeErroVoz('audio_ausente');
        Alert.alert(msg.titulo, msg.texto);
        return;
      }
      /* Mesma régua do widget: arquivo que não passa de 1 KB não é fala, e
         não gasta transcrição. Até 26/09/2026 voltava ao repouso sem aviso
         (achado V3 do Watchtower); agora os dois dão o mesmo recibo curto. */
      const tamanho = tamanhoDoAudio(uri);
      if (!parouDireito || (tamanho !== null && !gravacaoValida(tamanho))) {
        void descartarAudio(uri);
        Alert.alert(RECIBOS_VOZ.naoOuvi.titulo, RECIBOS_VOZ.naoOuvi.texto);
        return;
      }
      /* Mesma execução do widget, com o mesmo prazo de rede (lib/voz.ts).
         Este adaptador só apresenta o recibo na tela. */
      const resultado = await executarTarefa({ caminho: uri, requestId: randomUUID(), source: 'app', ...captura.current }, {
        podeNotificar: async () => true,
        notificarRevisao: async (titulo, texto, ref) => {
          const recibo = RECIBOS_VOZ.revisao(titulo, texto);
          Alert.alert(recibo.titulo, recibo.texto);
          onTranscribed(texto, ref);
        },
        notificarSucesso: async (dados) => {
          hapticSuccess();
          onSaved?.();
          const recibo = RECIBOS_VOZ.sucesso(dados.titulo, dados.texto);
          Alert.alert(recibo.titulo, recibo.texto, [
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
        notificarSalvoLocal: async () => { Alert.alert(RECIBOS_VOZ.salvoLocal.titulo, RECIBOS_VOZ.salvoLocal.texto); },
        notificarPendenteOffline: async () => { Alert.alert(RECIBOS_VOZ.pendenteOffline.titulo, RECIBOS_VOZ.pendenteOffline.texto); },
      });
      if (resultado?.guardada === false && resultado.revisaoNoSino) {
        onRevisaoNoSino?.(resultado.revisaoNoSino);
      }
    } catch (e: any) {
      if (__DEV__) console.warn('[voz:diag] botao lancou', e?.name, String(e?.message ?? e));
      if (e instanceof PrazoDoMicrofoneEsgotado) {
        Alert.alert('Não consegui encerrar a gravação', 'Toque no microfone para tentar de novo.');
      } else {
        const msg = mensagemDeErroVoz('erro_interno');
        Alert.alert(msg.titulo, msg.texto);
      }
    } finally {
      pararMonitoramentoCaptura();
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
    if (ocupado.current || avisarSeGravadorPendente()) return;
    const minha = ++intencao.current;
    if (!podeSeguir(minha)) return;
    const fim = Date.now() + PRAZO_ABRIR_MICROFONE_MS;
    ocupado.current = true;

    try {
      const atual = await noPrazoDoMicrofone(getRecordingPermissionsAsync(), fim);
      if (!podeSeguir(minha)) return;
      if (atual.status === 'undetermined') {
        Alert.alert(
          'Use o microfone para lançar',
          'O Grana. grava apenas esta fala para transcrever o lançamento. O áudio é apagado depois do processamento.',
          [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Continuar', onPress: () => { if (podeSeguir(minha)) void iniciarGravacao(); } },
          ]
        );
        return;
      }
    } catch (erro) {
      if (erro instanceof PrazoDoMicrofoneEsgotado) {
        if (podeSeguir(minha)) avisarPrazoDaAbertura();
        return;
      }
      // Se a consulta falhar, o pedido do sistema ainda confirma a permissão.
    } finally {
      ocupado.current = false;
    }
    if (podeSeguir(minha)) await iniciarGravacao(fim);
  }

  function podeSeguir(minha: number) {
    return montado.current && emFoco.current && intencao.current === minha && AppState.currentState !== 'background';
  }

  function avisarSeGravadorPendente() {
    if (!gravadorPendente.current) return false;
    Alert.alert('Microfone ainda ocupado', 'O microfone ainda está ocupado pela tentativa anterior. Tente de novo em instantes ou reabra o aplicativo.');
    return true;
  }

  async function iniciarGravacao(fim = Date.now() + PRAZO_ABRIR_MICROFONE_MS) {
    if (ocupado.current || avisarSeGravadorPendente()) return;
    const minha = ++intencao.current;
    if (!podeSeguir(minha)) return;
    ocupado.current = true;
    const abandonar = () => {
      pararMonitoramentoCaptura();
      ocupado.current = false;
    };

    try {
      const permissao = await noPrazoDoMicrofone(requestRecordingPermissionsAsync(), fim);
      if (!podeSeguir(minha)) return abandonar();
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
      await noPrazoDoMicrofone(setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }), fim);
      if (!podeSeguir(minha)) return abandonar();
      microfoneSilenciado.current = false;
      iniciarMonitoramentoCaptura();
      const preparo = gravador.prepareToRecordAsync();
      gravadorPendente.current = true;
      const venceu = await noPrazoDoMicrofone(preparo, fim).then(() => false, (erro) => {
        if (erro instanceof PrazoDoMicrofoneEsgotado) return true;
        throw erro;
      });
      if (venceu || !podeSeguir(minha)) {
        if (venceu && podeSeguir(minha)) avisarPrazoDaAbertura();
        intencao.current++;
        abandonar();
        // Quando o preparo abandonado voltar, fecha e apaga sem gravar; só então libera nova abertura.
        void preparo
          .then(async () => {
            await gravador.stop();
            if (gravador.uri) void descartarAudio(gravador.uri);
          })
          .catch((e) => console.warn('[voz] abertura abandonada não fechou o gravador', e))
          .finally(() => { gravadorPendente.current = false; });
        return;
      }
      gravadorPendente.current = false;
      const agora = Date.now();
      captura.current = { capturadoEm: agora, dataCaptura: dataLocal(agora) };
      gravador.record();
      setGravando(true);
      cortePorTempo.current = setTimeout(() => {
        void encerrarEEnviar();
      }, MAX_SEGUNDOS_GRAVACAO * 1000);
      const detector = criarDetectorDeSilencio();
      amostrador.current = setInterval(() => {
        if (capturaSilenciada()) {
          microfoneSilenciado.current = true;
          void encerrarEEnviar();
          return;
        }
        let amplitude: number | null = null;
        try {
          amplitude = amplitudeDoMetering(gravador.getStatus().metering);
        } catch {
          // Sem leitura nesta amostra: não corta, tenta na próxima.
        }
        if (amplitude !== null && detector.amostrar(amplitude, Date.now())) void encerrarEEnviar();
      }, INTERVALO_AMOSTRA_MS);
    } catch (e) {
      // Preparo que rejeita já voltou: o gravador não ficou preso.
      gravadorPendente.current = false;
      pararMonitoramentoCaptura();
      ocupado.current = false;
      if (!podeSeguir(minha)) {
        console.warn('[voz] abertura abandonada falhou', e);
        return;
      }
      setGravando(false);
      if (e instanceof PrazoDoMicrofoneEsgotado) {
        avisarPrazoDaAbertura();
        return;
      }
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
        <Text style={[styles.label, textStyle, gravando && styles.labelActive]} numberOfLines={1} adjustsFontSizeToFit>{rotulo}</Text>
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
