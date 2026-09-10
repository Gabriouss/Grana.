import { Platform } from 'react-native';

let ocupado = false;

/** Nunca permite que o reconhecedor do sistema envie a fala à rede. */
export async function transcreverNoAparelho(uri: string): Promise<string | null> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33 || ocupado) return null;
  ocupado = true;
  let pcmUri: string | undefined;
  let expirou = false;
  let encerrarReconhecimento: (() => void) | undefined;
  // Um único orçamento inclui imports, idiomas, PCM e reconhecimento.
  let timer: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expirou = true;
      encerrarReconhecimento?.();
      reject(new Error('prazo_local_esgotado'));
    }, 30_000);
  });
  const dentroDoPrazo = <T,>(operacao: Promise<T>) => Promise.race([operacao, limite]);
  const limparPCM = async (caminho: string) => {
    try {
      const fs = await import('expo-file-system/legacy');
      await fs.deleteAsync(caminho, { idempotent: true });
    } catch { console.warn('[voz:local] falha ao limpar PCM temporário'); }
  };
  try {
    const { ExpoSpeechRecognitionModule: motor } = await dentroDoPrazo(import('expo-speech-recognition'));
    if (!motor.supportsOnDeviceRecognition()) return null;
    const idiomas = await dentroDoPrazo(motor.getSupportedLocales({}));
    if (!idiomas.installedLocales.some((lang) => lang.toLowerCase().replace('_', '-') === 'pt-br')) return null;
    const { prepararAudioLocal } = await dentroDoPrazo(import('@/modules/grana-voice-widget'));
    const audioSource = await dentroDoPrazo(prepararAudioLocal(uri).then(source => {
      // Conversão nativa não é cancelável. Se concluir tarde, só limpa o
      // arquivo: não inicia um reconhecedor depois do fallback/novo áudio.
      if (expirou && source) { void limparPCM(source.uri); return null; }
      return source;
    }));
    if (!audioSource) return null;
    pcmUri = audioSource.uri;
    return await new Promise<string | null>((resolve) => {
      let texto = '';
      let terminou = false;
      const assinaturas: { remove(): void }[] = [];
      const concluir = (resultado: string | null) => {
        if (terminou) return;
        terminou = true;
        encerrarReconhecimento = undefined;
        assinaturas.forEach((item) => { try { item.remove(); } catch { console.warn('[voz:local] falha ao remover listener'); } });
        try { motor.abort(); } catch { console.warn('[voz:local] falha ao abortar reconhecimento'); }
        resolve(resultado);
      };
      encerrarReconhecimento = () => concluir(null);
      try {
        assinaturas.push(motor.addListener('result', (evento) => {
          if (evento.isFinal) texto = [texto, evento.results[0]?.transcript].filter(Boolean).join(' ');
        }));
        assinaturas.push(motor.addListener('end', () => concluir(texto.trim() || null)));
        assinaturas.push(motor.addListener('error', () => concluir(null)));
        motor.start({
          lang: 'pt-BR', requiresOnDeviceRecognition: true, interimResults: false,
          audioSource: { ...audioSource, audioEncoding: 2 },
        });
      } catch { console.warn('[voz:local] falha ao iniciar reconhecimento'); concluir(null); }
    });
  } catch (erro) {
    console.warn('[voz:local] reconhecimento indisponível', (erro as { name?: string })?.name ?? 'erro');
    // Expo Go e aparelhos sem serviço local continuam pelo caminho remoto.
    return null;
  } finally {
    clearTimeout(timer!);
    ocupado = false;
    // Limpeza não pode reter a resposta nem o prazo de quem chamou.
    if (pcmUri) void limparPCM(pcmUri);
  }
}
