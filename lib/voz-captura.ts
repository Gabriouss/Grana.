/**
 * Regras de CAPTURA da voz: quando a gravação termina sozinha e quando ela é
 * curta demais para virar lançamento. Valem igual para o botão do app e para
 * o widget (regra 13; autor, 25/09/2026: "os dois precisam se comportar
 * exatamente iguais. Em tudo").
 *
 * O widget grava no Kotlin (`GranaVoiceCaptureService.kt`), que não importa
 * TypeScript. Por isso os números abaixo são uma CÓPIA dos de lá, e
 * `__tests__/voz-captura-paridade.cjs` falha se um lado mudar sem o outro.
 * A lógica do detector também é a mesma, linha por linha, do `amostrador` do
 * serviço nativo.
 *
 * Até 25/09/2026 só o widget encerrava sozinho no silêncio e descartava o
 * toque duplo sem aviso; o botão do app gravava até o segundo toque ou os 20s
 * e mandava para a transcrição até um arquivo vazio.
 */

/** De quanto em quanto tempo o volume é lido. Kotlin: `INTERVALO_AMOSTRA_MS`. */
export const INTERVALO_AMOSTRA_MS = 200;

/** Silêncio, depois de ter ouvido fala, que encerra a gravação. Kotlin: `SILENCIO_PARA_CORTAR_MS`. */
export const SILENCIO_PARA_CORTAR_MS = 1_600;

/**
 * Volume a partir do qual conta como fala, na escala do
 * `MediaRecorder.getMaxAmplitude()` do Android (0 a 32767). Kotlin:
 * `LIMIAR_FALA`. Em aparelhos com microfone mais distante, a fala normal fica
 * abaixo de 1.800; foi por isso que o limiar desceu para 600.
 */
export const LIMIAR_FALA = 600;

/**
 * Arquivo com até este tamanho não é gravação, é toque duplo acidental: o
 * encoder nem chegou a fechar um áudio de verdade. Kotlin:
 * `destino.length() > 1024`.
 */
export const TAMANHO_MINIMO_AUDIO_BYTES = 1024;

/**
 * Converte o `metering` do `expo-audio` (dBFS) de volta para a escala do
 * `getMaxAmplitude()`. No Android o `expo-audio` lê exatamente o mesmo
 * `MediaRecorder.getMaxAmplitude()` do widget e devolve
 * `20 * log10(amplitude / 32767)`, com -160 para zero; esta é a conta
 * inversa, então o limiar é o mesmo número nas duas entradas.
 *
 * Sem leitura (plataforma que não mede), devolve `null` e o detector não
 * corta nada: a gravação termina no toque ou no teto, como antes.
 */
export function amplitudeDoMetering(metering: number | null | undefined): number | null {
  if (typeof metering !== 'number' || !Number.isFinite(metering)) return null;
  if (metering <= -160) return 0;
  return Math.round(32767 * Math.pow(10, metering / 20));
}

/**
 * O `amostrador` do `GranaVoiceCaptureService.kt`. Só corta DEPOIS de ter
 * ouvido fala: cortar por silêncio inicial pegaria quem toca e leva um
 * segundo para começar a falar.
 */
export function criarDetectorDeSilencio() {
  let ouviuFala = false;
  let silencioDesde = 0;
  return {
    /** `true` quando a gravação deve ser encerrada agora. */
    amostrar(amplitude: number, agora: number): boolean {
      if (amplitude >= LIMIAR_FALA) {
        ouviuFala = true;
        silencioDesde = 0;
      } else if (ouviuFala) {
        if (silencioDesde === 0) silencioDesde = agora;
        else if (agora - silencioDesde >= SILENCIO_PARA_CORTAR_MS) return true;
      }
      return false;
    },
  };
}

/** A gravação tem áudio de verdade? Mesma régua do widget. */
export function gravacaoValida(tamanhoBytes: number | null | undefined): boolean {
  return typeof tamanhoBytes === 'number' && tamanhoBytes > TAMANHO_MINIMO_AUDIO_BYTES;
}
