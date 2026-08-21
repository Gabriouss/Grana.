import { useState } from 'react';
import { Platform, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Alert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import Constants, { AppOwnership } from 'expo-constants';
import type * as SpeechRecognitionTypes from 'expo-speech-recognition';
import { theme, radius, fonts, type } from '@/lib/theme';
import { hapticSuccess } from '@/lib/haptics';
import AppPressable from './AppPressable';

/* expo-speech-recognition é um módulo nativo de terceiros: só existe dentro
   de um development build, não no binário do Expo Go. `requireNativeModule`
   falha assim que o arquivo do pacote é avaliado — um `import` estático dele
   aqui em cima derrubaria QUALQUER tela que renderize este botão assim que o
   app abrisse no Expo Go, não só o recurso de voz. Por isso o require() só
   roda fora do Expo Go; dentro dele, o botão vira um aviso em vez de crash.
   `appOwnership` está depreciado a favor de `executionEnvironment`, mas é o
   único jeito de diferenciar Expo Go de um development build de verdade —
   os dois caem juntos em `executionEnvironment: 'storeClient'`. */
const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

/* Na web o pacote depende da Web Speech API do navegador (`SpeechRecognition`
   / `webkitSpeechRecognition`) — que só existe no Chrome/Edge/Safari, não no
   Firefox. Sem essa checagem, `require('expo-speech-recognition')` era
   avaliado em QUALQUER navegador, e o próprio pacote lançava
   `SpeechRecognition is not defined` assim que tentava ler o global que não
   existe — derrubando a tela inteira, não só o botão (mesmo raciocínio do
   guard do Expo Go acima, um problema a mais de plataforma). */
const speechIndisponivelNaWeb =
  Platform.OS === 'web' &&
  (typeof window === 'undefined' || !((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));

const Speech: typeof SpeechRecognitionTypes | null =
  isExpoGo || speechIndisponivelNaWeb ? null : require('expo-speech-recognition');

/**
 * Botão de lançamento por voz: toque para começar a falar (ex: "Almoço de 38
 * reais no débito hoje"), toque de novo para parar. O texto transcrito é
 * repassado pra fora — quem usa este botão decide o que fazer com ele, mas o
 * caminho esperado é jogar direto em lib/heuristics.ts, o mesmo motor que já
 * interpreta texto colado de comprovante.
 *
 * Reconhecimento no próprio aparelho (sem custo por uso, sem enviar áudio pra
 * fora): exige um development build com o módulo nativo compilado — no Expo
 * Go o botão fica visível, mas avisa que precisa de outro tipo de build.
 */
export default function VoiceEntryButton({
  onTranscribed,
  label,
  style,
  hoverStyle,
  textStyle,
  iconSize = 17,
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
}) {
  const [listening, setListening] = useState(false);

  // `isExpoGo` é fixo pro processo inteiro (nunca alterna em runtime), então
  // chamar o hook condicionalmente aqui não quebra a regra de hooks: cada
  // instância deste componente chama (ou não) sempre do mesmo jeito em toda
  // renderização.
  Speech?.useSpeechRecognitionEvent('start', () => setListening(true));
  Speech?.useSpeechRecognitionEvent('end', () => setListening(false));
  Speech?.useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript?.trim();
    if (text) {
      hapticSuccess();
      onTranscribed(text);
    }
  });
  Speech?.useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    Alert.alert('Não entendi', 'Não conseguimos reconhecer sua voz. Tente de novo ou digite o lançamento.');
  });

  async function handlePress() {
    if (!Speech) {
      if (speechIndisponivelNaWeb) {
        Alert.alert(
          'Navegador sem suporte a voz',
          'Lançamento por voz depende do reconhecimento de fala do navegador, que o Firefox e alguns outros não oferecem. Tente pelo Chrome, Edge ou Safari.'
        );
      } else {
        Alert.alert(
          'Indisponível no Expo Go',
          'Lançamento por voz precisa de um development build (npx expo run:android ou uma build de dev no EAS) — o módulo de reconhecimento de fala não roda dentro do app Expo Go.'
        );
      }
      return;
    }
    if (listening) {
      Speech.ExpoSpeechRecognitionModule.stop();
      return;
    }
    const result = await Speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      Alert.alert(
        'Permissão de microfone',
        'Para lançar por voz, autorize o microfone e o reconhecimento de fala nas configurações do aparelho.'
      );
      return;
    }
    Speech.ExpoSpeechRecognitionModule.start({ lang: 'pt-BR', interimResults: false, continuous: false });
  }

  return (
    <AppPressable
      onPress={handlePress}
      style={({ hovered }) => [
        label ? styles.pill : styles.iconBtn,
        style,
        hovered && !listening && (hoverStyle ?? styles.hover),
        listening && styles.active,
      ]}
      hitSlop={8}
    >
      {/* Parado, o ícone usa o mesmo menta do HeaderAction — este botão mora
          lado a lado com eles no cabeçalho, e a tinta branca fazia ele
          destoar dos vizinhos. Gravando, inverte para o fundo escuro. */}
      <Ionicons name={listening ? 'mic' : 'mic-outline'} size={iconSize} color={listening ? theme.paper : theme.accent2} />
      {label && (
        <Text style={[styles.label, textStyle, listening && styles.labelActive]}>{listening ? 'Ouvindo…' : label}</Text>
      )}
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  iconBtn: {
    padding: 8,
    borderRadius: radius.pill,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hover: { borderColor: theme.ruleStrong },
  active: { backgroundColor: '#bb6b60', borderColor: '#bb6b60' },
  label: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  labelActive: { color: theme.paper },
});
