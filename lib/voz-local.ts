import { Platform } from 'react-native';

let ocupado = false;

/** Teto do reconhecimento no aparelho quando quem chama não impõe outro. */
export const PRAZO_LOCAL_PADRAO_MS = 30_000;

/**
 * Nunca permite que o reconhecedor do sistema envie a fala à rede.
 *
 * `prazoMs` é o que RESTA do orçamento de quem chamou, e só serve para
 * ENCURTAR: o teto próprio continua mandando. O widget headless tem 120
 * segundos antes de o Android matá-lo; o botão de voz tem uma pessoa olhando
 * para a tela. Fixar 30 segundos aqui dentro fazia o botão herdar um teto
 * pensado para o widget.
 */
export async function transcreverNoAparelho(uri: string, prazoMs = PRAZO_LOCAL_PADRAO_MS): Promise<string | null> {
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
    }, Math.max(1, Math.min(PRAZO_LOCAL_PADRAO_MS, prazoMs)));
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
