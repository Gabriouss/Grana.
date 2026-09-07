import { Platform } from 'react-native';

let ocupado = false;

/** Nunca permite que o reconhecedor do sistema envie a fala à rede. */
export async function transcreverNoAparelho(uri: string): Promise<string | null> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33 || ocupado) return null;
  ocupado = true;
  try {
    const { ExpoSpeechRecognitionModule: motor } = await import('expo-speech-recognition');
    if (!motor.supportsOnDeviceRecognition()) return null;
    const idiomas = await motor.getSupportedLocales({});
    if (!idiomas.installedLocales.some((lang) => lang.toLowerCase().replace('_', '-') === 'pt-br')) return null;
    return await new Promise<string | null>((resolve) => {
      let texto = '';
      let terminou = false;
      const assinaturas: { remove(): void }[] = [];
      const concluir = (resultado: string | null) => {
        if (terminou) return;
        terminou = true;
        clearTimeout(prazo);
        assinaturas.forEach((item) => item.remove());
        try { motor.abort(); } catch {}
        resolve(resultado);
      };
      const prazo = setTimeout(() => concluir(null), 30_000);
      assinaturas.push(motor.addListener('result', (evento) => {
        if (evento.isFinal) texto = [texto, evento.results[0]?.transcript].filter(Boolean).join(' ');
      }));
      assinaturas.push(motor.addListener('end', () => concluir(texto.trim() || null)));
      assinaturas.push(motor.addListener('error', () => concluir(null)));
      try {
        motor.start({
          lang: 'pt-BR', requiresOnDeviceRecognition: true, interimResults: false,
          audioSource: { uri, audioChannels: 1, sampleRate: 44100, audioEncoding: 2 },
        });
      } catch { concluir(null); }
    });
  } catch {
    // Expo Go e aparelhos sem serviço local continuam pelo caminho remoto.
    return null;
  } finally { ocupado = false; }
}
